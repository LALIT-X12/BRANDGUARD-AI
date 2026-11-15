from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import Permission
from app.dependencies import CurrentUser, get_current_user, get_db, require_permission
from app.models.claim import ClaimRegistry
from app.schemas.knowledge import ClaimCreate, ClaimOut
from app.services.knowledge_service import create_claim, get_stale_claims

router = APIRouter()


@router.post("", response_model=ClaimOut, status_code=status.HTTP_201_CREATED)
def register_claim(
    payload: ClaimCreate,
    current_user: CurrentUser = Depends(require_permission(Permission.MANAGE_KNOWLEDGE)),
    db: Session = Depends(get_db),
) -> ClaimRegistry:
    """Register an approved claim with owner, expiry date, and sources."""
    return create_claim(db, current_user.tenant_id, current_user.user_id, payload)


@router.get("", response_model=list[ClaimOut])
def list_claims(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ClaimRegistry]:
    """List registered claims for the current tenant."""
    return list(
        db.scalars(
            select(ClaimRegistry).where(ClaimRegistry.tenant_id == current_user.tenant_id)
        ).all()
    )


@router.get("/stale", response_model=list[ClaimOut])
def list_stale_claims(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ClaimRegistry]:
    """List expired claims requiring renewal or retirement."""
    return get_stale_claims(db, current_user.tenant_id)

