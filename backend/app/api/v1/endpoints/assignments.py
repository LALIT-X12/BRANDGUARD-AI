from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import Permission
from app.dependencies import CurrentUser, get_db, require_permission
from app.models.review import ReviewAssignment

router = APIRouter()


@router.get("")
def list_assignments(
    current_user: CurrentUser = Depends(require_permission(Permission.REVIEW_LOW_RISK)),
    db: Session = Depends(get_db),
) -> list[dict[str, object]]:
    """List human review routing assignments for the current tenant."""
    rows = db.scalars(
        select(ReviewAssignment).where(ReviewAssignment.tenant_id == current_user.tenant_id)
    ).all()
    return [
        {
            "id": str(r.id),
            "submission_id": str(r.submission_id),
            "review_session_id": str(r.review_session_id),
            "assigned_role": r.assigned_role,
            "routing_reason": r.routing_reason,
            "status": r.status,
        }
        for r in rows
    ]

