import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenException, NotFoundException
from app.core.permissions import Permission, require_permissions
from app.integrations.cache import invalidate_cache_key
from app.models.review import Approval
from app.models.submission import ContentVersion, Submission
from app.services.audit_service import record_audit_event


def record_human_decision(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    reviewer_id: uuid.UUID,
    reviewer_roles: list[str],
    submission_id: uuid.UUID,
    decision: str,
    notes: str | None = None,
) -> Approval:
    """Record a human reviewer's final decision, lock approved versions, and write audit log."""
    submission = db.scalar(
        select(Submission).where(Submission.id == submission_id, Submission.tenant_id == tenant_id)
    )
    if not submission:
        raise NotFoundException("Submission", str(submission_id))

    if submission.sensitivity_label in {"confidential", "regulated"}:
        require_permissions(reviewer_roles, {Permission.APPROVE_REGULATED})
    else:
        require_permissions(reviewer_roles, {Permission.APPROVE_LOW_RISK})

    if submission.is_locked:
        raise ForbiddenException("Approved submission version is locked and cannot be modified")

    version = db.scalar(
        select(ContentVersion).where(
            ContentVersion.submission_id == submission.id,
            ContentVersion.tenant_id == tenant_id,
            ContentVersion.version_number == submission.current_version_number,
        )
    )
    if not version:
        raise NotFoundException("ContentVersion")

    locked = decision == "approved"
    approval = Approval(
        tenant_id=tenant_id,
        submission_id=submission.id,
        content_version_id=version.id,
        reviewer_id=reviewer_id,
        decision=decision,
        notes=notes,
        locked_version=locked,
    )
    db.add(approval)

    submission.status = decision
    submission.is_locked = locked

    record_audit_event(
        db,
        tenant_id=tenant_id,
        actor_id=reviewer_id,
        action=f"submission.{decision}",
        resource_type="submission",
        resource_id=str(submission.id),
        details={"version_id": str(version.id), "locked": locked, "notes": notes},
    )
    db.commit()
    db.refresh(approval)
    invalidate_cache_key(f"analytics:{tenant_id}")
    return approval

