from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import Permission
from app.dependencies import CurrentUser, get_current_user, get_db, require_permission
from app.models.asset import VisualAsset
from app.schemas.knowledge import VisualAssetCreate, VisualAssetOut
from app.services.knowledge_service import create_visual_asset

router = APIRouter()


@router.post("", response_model=VisualAssetOut, status_code=status.HTTP_201_CREATED)
def register_asset(
    payload: VisualAssetCreate,
    current_user: CurrentUser = Depends(require_permission(Permission.MANAGE_ASSETS)),
    db: Session = Depends(get_db),
) -> VisualAsset:
    """Register a brand visual asset (logo, palette, font, or template)."""
    return create_visual_asset(db, current_user.tenant_id, current_user.user_id, payload)


@router.get("", response_model=list[VisualAssetOut])
def list_assets(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[VisualAsset]:
    """List visual assets for the current tenant."""
    return list(
        db.scalars(
            select(VisualAsset).where(VisualAsset.tenant_id == current_user.tenant_id)
        ).all()
    )

