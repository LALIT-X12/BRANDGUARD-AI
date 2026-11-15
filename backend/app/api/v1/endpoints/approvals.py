from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.dependencies import CurrentUser, get_current_user, get_db
from app.models.review import Approval
from app.schemas.review import ApprovalOut, ApprovalRequest
from app.services.approval_service import record_human_decision

router = APIRouter()


@router.post("", response_model=ApprovalOut, status_code=status.HTTP_201_CREATED)
def decide_submission(
    payload: ApprovalRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Approval:
    """Record a human reviewer's approval, rejection, or change request."""
    return record_human_decision(
        db,
        tenant_id=current_user.tenant_id,
        reviewer_id=current_user.user_id,
        reviewer_roles=current_user.roles,
        submission_id=payload.submission_id,
        decision=payload.decision,
        notes=payload.notes,
    )

