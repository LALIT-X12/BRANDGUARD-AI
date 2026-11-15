import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import Permission
from app.dependencies import CurrentUser, get_current_user, get_db, require_permission
from app.models.guideline import BrandGuideline, GuidelineRule
from app.schemas.knowledge import GuidelineCreate, GuidelineOut, GuidelineRuleOut
from app.services.knowledge_service import create_guideline

router = APIRouter()


@router.post("", response_model=GuidelineOut, status_code=status.HTTP_201_CREATED)
def add_guideline(
    payload: GuidelineCreate,
    current_user: CurrentUser = Depends(require_permission(Permission.MANAGE_KNOWLEDGE)),
    db: Session = Depends(get_db),
) -> BrandGuideline:
    """Create a brand guideline and its structured rules."""
    return create_guideline(db, current_user.tenant_id, current_user.user_id, payload)


@router.get("", response_model=list[GuidelineOut])
def list_guidelines(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BrandGuideline]:
    """List all guidelines for the current tenant."""
    return list(
        db.scalars(
            select(BrandGuideline).where(BrandGuideline.tenant_id == current_user.tenant_id)
        ).all()
    )


@router.get("/{guideline_id}/rules", response_model=list[GuidelineRuleOut])
def list_guideline_rules(
    guideline_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[GuidelineRule]:
    """List rules under a specific guideline (tenant-isolated)."""
    return list(
        db.scalars(
            select(GuidelineRule).where(
                GuidelineRule.guideline_id == guideline_id,
                GuidelineRule.tenant_id == current_user.tenant_id,
            )
        ).all()
    )

