import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundException
from app.integrations.redis_client import REVIEW_QUEUE, enqueue_job
from app.models.glossary import GlossaryEntry
from app.models.guideline import BrandGuideline
from app.models.issue import Issue
from app.models.review import BackgroundJob, CheckerResult, ReviewSession
from app.models.submission import ContentVersion, Submission
from app.services.audit_service import record_audit_event


def create_review_session(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID,
    submission_id: uuid.UUID,
    content_version_id: uuid.UUID | None = None,
) -> ReviewSession:
    """Create a review session, schedule checker jobs, and enqueue orchestration."""
    submission = db.scalar(
        select(Submission).where(Submission.id == submission_id, Submission.tenant_id == tenant_id)
    )
    if not submission:
        raise NotFoundException("Submission", str(submission_id))

    if content_version_id is None:
        version = db.scalar(
            select(ContentVersion)
            .where(
                ContentVersion.submission_id == submission.id,
                ContentVersion.tenant_id == tenant_id,
                ContentVersion.version_number == submission.current_version_number,
            )
        )
    else:
        version = db.scalar(
            select(ContentVersion).where(
                ContentVersion.id == content_version_id,
                ContentVersion.submission_id == submission.id,
                ContentVersion.tenant_id == tenant_id,
            )
        )
    if not version:
        raise NotFoundException("ContentVersion")

    active_guidelines = db.scalars(
        select(BrandGuideline).where(
            BrandGuideline.tenant_id == tenant_id,
            BrandGuideline.is_active.is_(True),
        )
    ).all()
    guideline_snapshot = {
        "guidelines": [
            {"id": str(g.id), "title": g.title, "version": g.version}
            for g in active_guidelines
        ]
    }

    session = ReviewSession(
        tenant_id=tenant_id,
        submission_id=submission.id,
        content_version_id=version.id,
        status="pending",
        guideline_snapshot=guideline_snapshot,
        started_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.flush()

    # Register initial MVP checkers (deterministic terminology + AI tone/claim)
    for checker_name, checker_type in [
        ("terminology_checker", "rule_based"),
        ("ai_tone_and_claim_checker", "ai_assisted"),
    ]:
        db.add(
            CheckerResult(
                tenant_id=tenant_id,
                review_session_id=session.id,
                checker_name=checker_name,
                checker_type=checker_type,
                status="pending",
            )
        )

    job = BackgroundJob(
        tenant_id=tenant_id,
        job_type="review",
        reference_id=session.id,
        status="queued",
    )
    db.add(job)
    submission.status = "in_review"

    record_audit_event(
        db,
        tenant_id=tenant_id,
        actor_id=actor_id,
        action="review_session.created",
        resource_type="review_session",
        resource_id=str(session.id),
        details={"submission_id": str(submission.id), "version_id": str(version.id)},
    )
    db.commit()
    db.refresh(session)

    try:
        enqueue_job(
            REVIEW_QUEUE,
            {
                "job_id": str(job.id),
                "tenant_id": str(tenant_id),
                "review_session_id": str(session.id),
            },
        )
    except Exception:
        pass

    return session


def run_deterministic_terminology_check(
    db: Session, *, tenant_id: uuid.UUID, review_session: ReviewSession
) -> list[Issue]:
    """Run local deterministic glossary check and persist normalized Issue records."""
    version = db.scalar(
        select(ContentVersion).where(
            ContentVersion.id == review_session.content_version_id,
            ContentVersion.tenant_id == tenant_id,
        )
    )
    if not version or not version.raw_text:
        return []

    prohibited = db.scalars(
        select(GlossaryEntry).where(
            GlossaryEntry.tenant_id == tenant_id,
            GlossaryEntry.status == "prohibited",
        )
    ).all()

    created_issues: list[Issue] = []
    text = version.raw_text
    lower_text = text.lower()

    for entry in prohibited:
        matched = (
            entry.term in text
            if entry.is_case_sensitive
            else entry.term.lower() in lower_text
        )
        if matched:
            issue = Issue(
                tenant_id=tenant_id,
                submission_id=review_session.submission_id,
                content_version_id=review_session.content_version_id,
                review_session_id=review_session.id,
                category="terminology",
                severity="medium",
                confidence=1.0,
                evidence=entry.term,
                rule_ref=f"glossary:{entry.id}",
                source_ref=entry.rationale or "Prohibited glossary term",
                suggested_fix=(
                    f"Replace '{entry.term}' with '{entry.preferred_term}'"
                    if entry.preferred_term
                    else f"Remove prohibited term '{entry.term}'"
                ),
                checker_type="rule_based",
                status="open",
            )
            db.add(issue)
            created_issues.append(issue)

    db.flush()
    return created_issues

