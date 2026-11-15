import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import BrandGuardException, NotFoundException
from app.integrations.ai_client import AIIntegrationClient
from app.models.fix import FixValidation, SuggestedFix
from app.models.issue import Issue
from app.models.submission import ContentVersion, Submission
from app.services.audit_service import record_audit_event
from app.utils.version_diff import compute_text_diff

MAX_FIX_VALIDATION_ATTEMPTS = 2


async def request_and_validate_fix(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID,
    issue_id: uuid.UUID,
) -> SuggestedFix:
    """Coordinate fix generation and independent validation with max 2 retries and human fallback."""
    issue = db.scalar(select(Issue).where(Issue.id == issue_id, Issue.tenant_id == tenant_id))
    if not issue:
        raise NotFoundException("Issue", str(issue_id))

    version = db.scalar(
        select(ContentVersion).where(
            ContentVersion.id == issue.content_version_id,
            ContentVersion.tenant_id == tenant_id,
        )
    )
    submission = db.scalar(
        select(Submission).where(
            Submission.id == issue.submission_id,
            Submission.tenant_id == tenant_id,
        )
    )
    if not version or not submission:
        raise NotFoundException("ContentVersion")

    original_text = version.pii_masked_text or version.raw_text or ""
    ai_client = AIIntegrationClient()

    proposed_text = original_text
    passed = False
    retry_count = 0
    feedback: str | None = None

    fix_record = SuggestedFix(
        tenant_id=tenant_id,
        issue_id=issue.id,
        original_content=original_text,
        proposed_content=original_text,
        retry_count=0,
        validation_status="pending",
    )
    db.add(fix_record)
    db.flush()

    for attempt in range(1, MAX_FIX_VALIDATION_ATTEMPTS + 1):
        retry_count = attempt - 1
        gen_resp = await ai_client.generate_fix(
            {
                "issue": {
                    "id": str(issue.id),
                    "category": issue.category,
                    "evidence": issue.evidence,
                    "rule_ref": issue.rule_ref,
                    "source_ref": issue.source_ref,
                },
                "content": original_text,
                "intent": submission.intent,
                "feedback": feedback,
            }
        )
        proposed_text = gen_resp.get("proposed_content", original_text)

        val_resp = await ai_client.validate_fix(
            {
                "original_content": original_text,
                "proposed_content": proposed_text,
                "intent": submission.intent,
                "issue_evidence": issue.evidence,
                "rule_ref": issue.rule_ref,
            }
        )
        issue_fixed = bool(val_resp.get("issue_fixed", False))
        intent_preserved = bool(val_resp.get("intent_preserved", False))
        no_new_claims = bool(val_resp.get("no_new_claims", False))
        passed = issue_fixed and intent_preserved and no_new_claims
        feedback = val_resp.get("feedback")

        db.add(
            FixValidation(
                tenant_id=tenant_id,
                suggested_fix_id=fix_record.id,
                attempt_number=attempt,
                passed=passed,
                issue_fixed=issue_fixed,
                intent_preserved=intent_preserved,
                no_new_claims=no_new_claims,
                feedback=feedback,
            )
        )
        if passed:
            break

    fix_record.proposed_content = proposed_text
    fix_record.version_diff = compute_text_diff(original_text, proposed_text)
    fix_record.retry_count = retry_count
    fix_record.validation_status = "validated" if passed else "failed_human_fallback"
    fix_record.requires_human_review = not passed

    record_audit_event(
        db,
        tenant_id=tenant_id,
        actor_id=actor_id,
        action="fix.generated",
        resource_type="suggested_fix",
        resource_id=str(fix_record.id),
        details={
            "issue_id": str(issue.id),
            "validation_status": fix_record.validation_status,
            "requires_human_review": fix_record.requires_human_review,
        },
    )
    db.commit()
    db.refresh(fix_record)
    return fix_record


def apply_creator_fix_decision(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID,
    fix_id: uuid.UUID,
    decision: str,
    edited_content: str | None = None,
) -> SuggestedFix:
    """Record creator acceptance, manual edit, or rejection of a suggested fix."""
    fix = db.scalar(
        select(SuggestedFix).where(SuggestedFix.id == fix_id, SuggestedFix.tenant_id == tenant_id)
    )
    if not fix:
        raise NotFoundException("SuggestedFix", str(fix_id))

    if decision == "edited" and not edited_content:
        raise BrandGuardException("edited_content is required when decision is 'edited'")

    fix.creator_decision = decision
    if decision == "edited" and edited_content is not None:
        fix.proposed_content = edited_content
        fix.version_diff = compute_text_diff(fix.original_content, edited_content)

    issue = db.scalar(select(Issue).where(Issue.id == fix.issue_id, Issue.tenant_id == tenant_id))
    if issue and decision in {"accepted", "edited"}:
        issue.status = "fixed"

    record_audit_event(
        db,
        tenant_id=tenant_id,
        actor_id=actor_id,
        action=f"fix.{decision}",
        resource_type="suggested_fix",
        resource_id=str(fix.id),
    )
    db.commit()
    db.refresh(fix)
    return fix

