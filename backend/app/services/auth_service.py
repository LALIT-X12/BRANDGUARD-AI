import uuid
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import (
    BrandGuardException,
    ConflictException,
    NotFoundException,
    UnauthorizedException,
)
from app.core.permissions import RoleName
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    revoke_token_jti,
    verify_password,
)
from app.integrations.redis_client import get_redis_client
from app.models.tenant import Tenant
from app.models.user import Role, User, UserRole
from app.schemas.auth import LoginRequest, RegisterRequest, TenantCreate, TokenResponse
from app.services.audit_service import record_audit_event

MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 300


def _get_or_create_role(db: Session, role_name: str) -> Role:
    try:
        RoleName(role_name)
    except ValueError as exc:
        raise ConflictException(f"Unsupported role '{role_name}'") from exc

    role = db.scalar(select(Role).where(Role.name == role_name))
    if not role:
        role = Role(name=role_name, description=f"BrandGuard {role_name} role")
        db.add(role)
        db.flush()
    return role


def create_tenant(db: Session, payload: TenantCreate) -> Tenant:
    """Create a new organisation tenant."""
    existing = db.scalar(select(Tenant).where(Tenant.slug == payload.slug))
    if existing:
        raise ConflictException(f"Tenant slug '{payload.slug}' already exists")

    tenant = Tenant(name=payload.name, slug=payload.slug)
    db.add(tenant)
    db.flush()
    record_audit_event(
        db,
        tenant_id=tenant.id,
        actor_id=None,
        action="tenant.created",
        resource_type="tenant",
        resource_id=str(tenant.id),
        details={"slug": tenant.slug},
    )
    db.commit()
    db.refresh(tenant)
    return tenant


def register_user(
    db: Session, payload: RegisterRequest, *, allow_elevated_roles: bool = False
) -> User:
    """Register a user inside an existing tenant.

    Public self-registration is strictly restricted to the 'creator' role to prevent
    privilege escalation. Elevated roles require an authenticated Brand Admin.
    """
    tenant = db.scalar(select(Tenant).where(Tenant.slug == payload.tenant_slug, Tenant.is_active.is_(True)))
    if not tenant:
        raise NotFoundException("Tenant", payload.tenant_slug)

    # Grant Brand Admin automatically to the first user registered in a newly created tenant
    # so self-registered workspace founders can manage guidelines, claims, approvals, and analytics.
    has_existing_user = db.scalar(select(User.id).where(User.tenant_id == tenant.id).limit(1))
    if not allow_elevated_roles and set(payload.roles) - {RoleName.CREATOR.value}:
        raise BrandGuardException(
            "Self-registration is restricted to the 'creator' role",
            status_code=403,
            error_code="FORBIDDEN_ROLE_ASSIGNMENT",
        )
    if allow_elevated_roles:
        assigned_roles = payload.roles
    elif has_existing_user is None:
        assigned_roles = [RoleName.BRAND_ADMIN.value]
    else:
        assigned_roles = [RoleName.CREATOR.value]

    existing = db.scalar(
        select(User).where(User.tenant_id == tenant.id, User.email == payload.email.lower())
    )
    if existing:
        raise ConflictException("Email already registered in this tenant")

    user = User(
        tenant_id=tenant.id,
        email=payload.email.lower(),
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.flush()

    for role_name in assigned_roles:
        role = _get_or_create_role(db, role_name)
        db.add(UserRole(user_id=user.id, role_id=role.id))

    record_audit_event(
        db,
        tenant_id=tenant.id,
        actor_id=user.id,
        action="user.registered",
        resource_type="user",
        resource_id=str(user.id),
        details={"roles": assigned_roles},
    )
    db.commit()
    db.refresh(user)
    return user


def _check_login_lockout(tenant_slug: str, email: str) -> str:
    key = f"brandguard:login_fail:{tenant_slug}:{email.lower()}"
    try:
        attempts = get_redis_client().get(key)
        if attempts and int(attempts) >= MAX_LOGIN_ATTEMPTS:
            raise BrandGuardException(
                "Too many failed login attempts. Please try again later.",
                status_code=429,
                error_code="ACCOUNT_LOCKED",
            )
    except BrandGuardException:
        raise
    except Exception:
        pass
    return key


def _record_login_failure(key: str) -> None:
    try:
        client = get_redis_client()
        count = client.incr(key)
        if count == 1:
            client.expire(key, LOGIN_LOCKOUT_SECONDS)
    except Exception:
        pass


def _clear_login_failures(key: str) -> None:
    try:
        get_redis_client().delete(key)
    except Exception:
        pass


def authenticate_user(db: Session, payload: LoginRequest) -> TokenResponse:
    """Validate credentials with brute-force protection and issue JWT tokens."""
    fail_key = _check_login_lockout(payload.tenant_slug, payload.email)

    tenant = db.scalar(select(Tenant).where(Tenant.slug == payload.tenant_slug, Tenant.is_active.is_(True)))
    if not tenant:
        _record_login_failure(fail_key)
        raise UnauthorizedException("Invalid tenant or credentials")

    user = db.scalar(
        select(User)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
        .where(
            User.tenant_id == tenant.id,
            User.email == payload.email.lower(),
            User.is_active.is_(True),
        )
    )
    if not user or not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        _record_login_failure(fail_key)
        raise UnauthorizedException("Invalid email or password")

    _clear_login_failures(fail_key)
    roles = [ur.role.name for ur in user.user_roles]
    access_token = create_access_token(str(user.id), str(tenant.id), roles)
    refresh_token = create_refresh_token(str(user.id), str(tenant.id))

    record_audit_event(
        db,
        tenant_id=tenant.id,
        actor_id=user.id,
        action="user.login",
        resource_type="user",
        resource_id=str(user.id),
    )
    db.commit()
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


def refresh_access_token(db: Session, refresh_token: str) -> TokenResponse:
    """Validate a refresh token, rotate it, and issue a new token pair."""
    payload = decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise UnauthorizedException("Invalid refresh token")

    try:
        user_id = uuid.UUID(str(payload["sub"]))
        tenant_id = uuid.UUID(str(payload["tenant_id"]))
    except (KeyError, ValueError) as exc:
        raise UnauthorizedException("Malformed refresh token") from exc

    user = db.scalar(
        select(User)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
        .where(User.id == user_id, User.tenant_id == tenant_id, User.is_active.is_(True))
    )
    if not user:
        raise UnauthorizedException("User account is inactive or missing")

    if jti := payload.get("jti"):
        revoke_token_jti(jti)

    roles = [ur.role.name for ur in user.user_roles]
    return TokenResponse(
        access_token=create_access_token(str(user.id), str(tenant_id), roles),
        refresh_token=create_refresh_token(str(user.id), str(tenant_id)),
    )

