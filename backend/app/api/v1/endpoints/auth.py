from fastapi import APIRouter, Depends, Security, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import decode_token, revoke_token_jti
from app.dependencies import CurrentUser, bearer_scheme, get_current_user, get_db
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.services.auth_service import authenticate_user, refresh_access_token, register_user

router = APIRouter()


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> UserOut:
    """Register a new user within a tenant."""
    user = register_user(db, payload)
    return UserOut(
        id=user.id,
        tenant_id=user.tenant_id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        roles=[ur.role.name for ur in user.user_roles],
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Authenticate with email/password and receive JWT tokens."""
    return authenticate_user(db, payload)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Rotate refresh token and issue a new JWT token pair."""
    return refresh_access_token(db, payload.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
    _current_user: CurrentUser = Depends(get_current_user),
) -> None:
    """Revoke the current access token JTI."""
    if credentials and credentials.credentials:
        payload = decode_token(credentials.credentials)
        if jti := payload.get("jti"):
            revoke_token_jti(jti)


@router.get("/me")
def me(current_user: CurrentUser = Depends(get_current_user)) -> dict[str, object]:
    """Return the authenticated user's tenant and RBAC roles."""
    return {
        "user_id": str(current_user.user_id),
        "tenant_id": str(current_user.tenant_id),
        "roles": current_user.roles,
    }

