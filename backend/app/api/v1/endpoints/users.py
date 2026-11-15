from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.permissions import Permission
from app.dependencies import CurrentUser, get_db, require_permission
from app.models.user import User, UserRole
from app.schemas.auth import RegisterRequest, UserOut
from app.services.auth_service import register_user

router = APIRouter()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def admin_create_user(
    payload: RegisterRequest,
    current_user: CurrentUser = Depends(require_permission(Permission.MANAGE_USERS)),
    db: Session = Depends(get_db),
) -> UserOut:
    """Create a user with any RBAC role (Brand Admin only)."""
    user = register_user(db, payload, allow_elevated_roles=True)
    return UserOut(
        id=user.id,
        tenant_id=user.tenant_id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        roles=[ur.role.name for ur in user.user_roles],
    )


@router.get("", response_model=list[UserOut])
def list_users(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: CurrentUser = Depends(require_permission(Permission.MANAGE_USERS)),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    """List users belonging to the authenticated user's tenant (eager-loaded roles)."""
    users = db.scalars(
        select(User)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
        .where(User.tenant_id == current_user.tenant_id)
        .limit(limit)
        .offset(offset)
    ).all()
    return [
        UserOut(
            id=u.id,
            tenant_id=u.tenant_id,
            email=u.email,
            full_name=u.full_name,
            is_active=u.is_active,
            roles=[ur.role.name for ur in u.user_roles],
        )
        for u in users
    ]

