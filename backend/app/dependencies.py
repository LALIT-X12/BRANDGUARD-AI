import uuid
from dataclasses import dataclass

from fastapi import Depends, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import UnauthorizedException
from app.core.permissions import Permission, require_permissions
from app.core.security import decode_token
from app.database.session import get_db
from app.models.user import Role, User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    """Authenticated user context extracted from JWT/OIDC token."""

    user_id: uuid.UUID
    tenant_id: uuid.UUID
    roles: list[str]


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
    db: Session = Depends(get_db),
) -> CurrentUser:
    """Validate Bearer JWT and return tenant-scoped CurrentUser with live DB roles."""
    if not credentials or not credentials.credentials:
        raise UnauthorizedException("Missing Bearer token")

    payload = decode_token(credentials.credentials)
    if payload.get("type") != "access":
        raise UnauthorizedException("Invalid token type")

    try:
        user_id = uuid.UUID(str(payload["sub"]))
        tenant_id = uuid.UUID(str(payload["tenant_id"]))
    except (KeyError, ValueError) as exc:
        raise UnauthorizedException("Malformed token claims") from exc

    db_roles = list(
        db.scalars(
            select(Role.name)
            .join(UserRole, UserRole.role_id == Role.id)
            .join(User, User.id == UserRole.user_id)
            .where(
                User.id == user_id,
                User.tenant_id == tenant_id,
                User.is_active.is_(True),
            )
        ).all()
    )
    roles = db_roles if db_roles else list(payload.get("roles", []))
    return CurrentUser(user_id=user_id, tenant_id=tenant_id, roles=roles)


def require_permission(permission: Permission):
    """FastAPI dependency factory enforcing RBAC permission checks."""

    def _checker(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        require_permissions(current_user.roles, {permission})
        return current_user

    return _checker


__all__ = ["CurrentUser", "get_current_user", "get_db", "require_permission"]

