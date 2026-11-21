import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.exceptions import BrandGuardException, NotFoundException
from app.integrations.ai_client import AIIntegrationClient
from app.models.fix import FixValidation, SuggestedFix
from app.models.glossary import GlossaryEntry
from app.models.issue import Issue
from app.models.submission import ContentVersion, Submission
from app.services.audit_service import record_audit_event
from app.utils.version_diff import compute_text_diff

MAX_FIX_VALIDATION_ATTEMPTS = 2

_BUILTIN_SOFTENING_RULES: list[tuple[str, str]] = [
    (r"\b100%\s+guaranteed\b", "backed by our satisfaction policy"),
    (r"\bguaranteed\b", "designed to support reliable outcomes"),
    (r"\b100%\b", "consistently"),
    (r"#1|\bnumber\s+one\b", "leading"),
    (r"\bclinically\s+proven\b", "supported by internal testing"),
    (r"\bscientifically\s+proven\b", "research-informed"),
    (r"\bmiracle\b", "effective"),
    (r"\bcures\b", "helps manage"),
    (r"\bcured\b", "helped support"),
    (r"\bcure\b", "help manage"),
    (r"\bzero\s+risk\b", "low-risk when used as directed"),
    (r"\bno\s+side\s+effects\b", "generally well tolerated"),
    (r"\binstant\s+results?\b", "timely results"),
    (r"\bbest\s+in\s+the\s+world\b", "trusted choice"),
    (r"\bact\s+now\b", "explore today"),
    (r"\blast\s+chance\b", "available this campaign window"),
    (r"\blimited\s+time\s+only\b", "seasonal offer"),
    (r"!!!+", "!"),
]


def _is_remote_ai_configured() -> bool:
    url = (get_settings().AI_INTEGRATION_URL or "").strip()
    return bool(url) and "localhost" not in url and "127.0.0.1" not in url


def _builtin_generate_fix(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    original_text: str,
    issue: Issue,
) -> str:
    """Produce a minimal-edit compliant rewrite without altering surrounding copy."""
    updated = original_text

    # 1. Glossary preferred-term substitution when issue came from glossary rule
    if issue.rule_ref.startswith("glossary:"):
        entry_id_str = issue.rule_ref.split(":", 1)[1]
        try:
            entry_uuid = uuid.UUID(entry_id_str)
            entry = db.scalar(
                select(GlossaryEntry).where(
                    GlossaryEntry.id == entry_uuid,
                    GlossaryEntry.tenant_id == tenant_id,
                )
            )
        except ValueError:
            entry = None

        flags = 0 if (entry and entry.is_case_sensitive) else re.IGNORECASE
        term = entry.term if entry else issue.evidence
        replacement = (entry.preferred_term if entry and entry.preferred_term else "").strip()
        pattern = re.compile(re.escape(term), flags)
        if pattern.search(updated):
            updated = pattern.sub(replacement, updated)
            updated = re.sub(r"[ \t]{2,}", " ", updated).strip()
            if updated != original_text:
                return updated

    # 2. Semantic softening based on the flagged evidence/policy
    evidence_lower = (issue.evidence or "").lower()
    for pat, repl in _BUILTIN_SOFTENING_RULES:
        if re.search(pat, evidence_lower, re.IGNORECASE) or re.search(pat, updated, re.IGNORECASE):
            candidate = re.sub(pat, repl, updated, flags=re.IGNORECASE)
            if candidate != updated:
                return candidate

    # 3. Missing disclosure or regulated claim qualifier
    if (
        "disclosure" in issue.rule_ref.lower()
        or "disclosure" in (issue.source_ref or "").lower()
        or issue.rule_ref.startswith("claim:")
    ):
        qualifier = "Note: Results may vary; see full terms and supporting evidence."
        if qualifier.lower() not in updated.lower():
            return f"{updated.rstrip()}\n\n{qualifier}".strip()

    # 4. Direct evidence replacement from suggested_fix quote if present
    if issue.evidence and issue.evidence in updated and issue.suggested_fix:
        quoted = re.findall(r"'([^']+)'", issue.suggested_fix)
        if len(quoted) >= 2 and quoted[0].lower() == issue.evidence.lower():
            return updated.replace(issue.evidence, quoted[1], 1)
        if issue.category == "tone":
            return updated.replace(issue.evidence, issue.evidence.rstrip("!").lower(), 1)

    return updated


def _builtin_validate_fix(
    *,
    original_text: str,
    proposed_text: str,
    issue: Issue,
) -> dict[str, object]:
    """Validate proposed rewrite for issue removal, intent preservation, and no new risky claims."""
    if not proposed_text.strip():
        return {
            "issue_fixed": False,
            "intent_preserved": False,
            "no_new_claims": True,
            "feedback": "Proposed text cannot be empty",
        }

    changed = proposed_text.strip() != original_text.strip()
    evidence = (issue.evidence or "").strip()
    if "disclosure" in issue.rule_ref.lower() or issue.rule_ref.startswith("claim:"):
        issue_fixed = changed and (
            "results may vary" in proposed_text.lower() or "terms" in proposed_text.lower()
        )
    elif evidence and evidence.lower() in original_text.lower():
        issue_fixed = changed and evidence.lower() not in proposed_text.lower()
    else:
        issue_fixed = changed

    intent_preserved = len(proposed_text) >= max(8, int(len(original_text) * 0.4))
    risky_words = ("100%", "miracle", "cure", "guaranteed", "zero risk", "no side effects")
    orig_lower = original_text.lower()
    prop_lower = proposed_text.lower()
    introduced_risky = [
        w for w in risky_words if w in prop_lower and w not in orig_lower
    ]
    no_new_claims = len(introduced_risky) == 0

    feedback = (
        "Validated: flagged compliance issue resolved cleanly while preserving core intent."
        if (issue_fixed and intent_preserved and no_new_claims)
        else "Requires manual human review to ensure compliant phrasing."
    )
    return {
        "issue_fixed": issue_fixed,
        "intent_preserved": intent_preserved,
        "no_new_claims": no_new_claims,
        "feedback": feedback,
    }


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
    remote_ai = _is_remote_ai_configured()

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
        if remote_ai:
            try:
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
            except Exception:
                remote_ai = False
                proposed_text = _builtin_generate_fix(
                    db, tenant_id=tenant_id, original_text=original_text, issue=issue
                )
                val_resp = _builtin_validate_fix(
                    original_text=original_text, proposed_text=proposed_text, issue=issue
                )
        else:
            proposed_text = _builtin_generate_fix(
                db, tenant_id=tenant_id, original_text=original_text, issue=issue
            )
            val_resp = _builtin_validate_fix(
                original_text=original_text, proposed_text=proposed_text, issue=issue
            )

        issue_fixed = bool(val_resp.get("issue_fixed", False))
        intent_preserved = bool(val_resp.get("intent_preserved", False))
        no_new_claims = bool(val_resp.get("no_new_claims", False))
        passed = issue_fixed and intent_preserved and no_new_claims
        feedback = str(val_resp.get("feedback") or "")

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
        version = db.scalar(
            select(ContentVersion).where(
                ContentVersion.id == issue.content_version_id,
                ContentVersion.tenant_id == tenant_id,
            )
        )
        if version is not None:
            version.raw_text = fix.proposed_content
            version.pii_masked_text = fix.proposed_content

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
