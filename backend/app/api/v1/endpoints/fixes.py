import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.permissions import Permission
from app.dependencies import CurrentUser, get_db, require_permission
from app.models.fix import SuggestedFix
from app.schemas.fix import FixDecisionRequest, FixOut, FixRequest
from app.services.fix_workflow import apply_creator_fix_decision, request_and_validate_fix

router = APIRouter()


@router.post("/request", response_model=FixOut, status_code=status.HTTP_201_CREATED)
async def request_fix(
    payload: FixRequest,
    current_user: CurrentUser = Depends(require_permission(Permission.ACT_ON_FIX)),
    db: Session = Depends(get_db),
) -> SuggestedFix:
    """Request a minimal-edit fix and run independent validation (max 2 retries)."""
    return await request_and_validate_fix(
        db,
        tenant_id=current_user.tenant_id,
        actor_id=current_user.user_id,
        issue_id=payload.issue_id,
    )


@router.post("/{fix_id}/decision", response_model=FixOut)
def decide_fix(
    fix_id: uuid.UUID,
    payload: FixDecisionRequest,
    current_user: CurrentUser = Depends(require_permission(Permission.ACT_ON_FIX)),
    db: Session = Depends(get_db),
) -> SuggestedFix:
    """Creator accepts, manually edits, or rejects a proposed fix."""
    return apply_creator_fix_decision(
        db,
        tenant_id=current_user.tenant_id,
        actor_id=current_user.user_id,
        fix_id=fix_id,
        decision=payload.decision,
        edited_content=payload.edited_content,
    )

