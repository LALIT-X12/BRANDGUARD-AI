import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundException
from app.core.permissions import Permission
from app.dependencies import CurrentUser, get_current_user, get_db, require_permission
from app.models.review import ReviewSession
from app.schemas.review import ReviewSessionCreate, ReviewSessionOut
from app.services.review_orchestrator import create_review_session

router = APIRouter()


@router.post("", response_model=ReviewSessionOut, status_code=status.HTTP_201_CREATED)
def start_review(
    payload: ReviewSessionCreate,
    current_user: CurrentUser = Depends(require_permission(Permission.SUBMIT_CONTENT)),
    db: Session = Depends(get_db),
) -> ReviewSession:
    """Create a review session and enqueue checker orchestration."""
    return create_review_session(
        db,
        tenant_id=current_user.tenant_id,
        actor_id=current_user.user_id,
        submission_id=payload.submission_id,
        content_version_id=payload.content_version_id,
    )


@router.get("/{review_session_id}", response_model=ReviewSessionOut)
def get_review_session(
    review_session_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReviewSession:
    """Retrieve review session status."""
    session = db.scalar(
        select(ReviewSession).where(
            ReviewSession.id == review_session_id,
            ReviewSession.tenant_id == current_user.tenant_id,
        )
    )
    if not session:
        raise NotFoundException("ReviewSession", str(review_session_id))
    return session

