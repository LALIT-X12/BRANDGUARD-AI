import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import RoleName
from app.models.fix import SuggestedFix
from app.models.issue import Issue
from app.models.review import ReviewAssignment, ReviewSession
from app.models.submission import Submission


def determine_reviewer_route(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    submission: Submission,
    review_session: ReviewSession,
) -> tuple[str, str]:
    """Deterministic risk-based routing rules (Phase 10)."""
    if submission.sensitivity_label in {"confidential", "regulated"}:
        return (
            RoleName.LEGAL_REVIEWER.value,
            f"Sensitivity label '{submission.sensitivity_label}' requires Legal Reviewer",
        )

    issues = list(
        db.scalars(
            select(Issue).where(
                Issue.review_session_id == review_session.id,
                Issue.tenant_id == tenant_id,
            )
        ).all()
    )

    if any(i.category == "claim" for i in issues):
        return (RoleName.LEGAL_REVIEWER.value, "Submission contains claim findings")

    if any(i.confidence < 0.7 for i in issues):
        return (RoleName.LEGAL_REVIEWER.value, "Low-confidence finding requires human review")

    failed_fixes = db.scalars(
        select(SuggestedFix).where(
            SuggestedFix.tenant_id == tenant_id,
            SuggestedFix.requires_human_review.is_(True),
            SuggestedFix.issue_id.in_([i.id for i in issues]) if issues else False,
        )
    ).all()
    if failed_fixes:
        return (RoleName.LEGAL_REVIEWER.value, "Failed fix validation requires human review")

    return (RoleName.BRAND_MANAGER.value, "Low-risk content routed to Brand Manager")


def assign_reviewer(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    submission: Submission,
    review_session: ReviewSession,
) -> ReviewAssignment:
    """Create and persist a ReviewAssignment for the review session."""
    role, reason = determine_reviewer_route(
        db, tenant_id=tenant_id, submission=submission, review_session=review_session
    )
    assignment = ReviewAssignment(
        tenant_id=tenant_id,
        submission_id=submission.id,
        review_session_id=review_session.id,
        assigned_role=role,
        routing_reason=reason,
        status="open",
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment

