import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import Permission
from app.dependencies import CurrentUser, get_db, require_permission
from app.models.issue import Issue
from app.schemas.issue import IssueOut

router = APIRouter()


@router.get("", response_model=list[IssueOut])
def list_issues(
    submission_id: uuid.UUID | None = Query(default=None),
    review_session_id: uuid.UUID | None = Query(default=None),
    current_user: CurrentUser = Depends(require_permission(Permission.VIEW_ISSUES)),
    db: Session = Depends(get_db),
) -> list[Issue]:
    """List normalized issues for the tenant, optionally filtered by submission or session."""
    stmt = select(Issue).where(Issue.tenant_id == current_user.tenant_id)
    if submission_id is not None:
        stmt = stmt.where(Issue.submission_id == submission_id)
    if review_session_id is not None:
        stmt = stmt.where(Issue.review_session_id == review_session_id)
    return list(db.scalars(stmt).all())

