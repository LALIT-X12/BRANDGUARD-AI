import re
import time
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.exceptions import NotFoundException
from app.integrations.redis_client import REVIEW_QUEUE, enqueue_job
from app.models.claim import ClaimRegistry
from app.models.glossary import GlossaryEntry
from app.models.guideline import BrandGuideline, GuidelineRule
from app.models.issue import Issue
from app.models.review import BackgroundJob, CheckerResult, ReviewSession
from app.models.submission import ContentVersion, Submission
from app.services.audit_service import record_audit_event

_CLAIM_PATTERNS: list[tuple[str, str, str, float, str]] = [
    (
        r"\b100%\s+guaranteed\b",
        "claim",
        "high",
        0.94,
        "Replace '100% guaranteed' with 'backed by our satisfaction policy'",
    ),
    (
        r"\bguaranteed\b",
        "claim",
        "high",
        0.91,
        "Replace 'guaranteed' with 'designed to support reliable outcomes'",
    ),
    (
        r"\b100%\b",
        "claim",
        "high",
        0.9,
        "Replace absolute '100%' claim with a verifiable or qualified statement",
    ),
    (
        r"(?:#1|\bnumber\s+one\b)",
        "claim",
        "high",
        0.89,
        "Replace unverified '#1' ranking with 'leading' or cite an independent source",
    ),
    (
        r"\bclinically\s+proven\b",
        "claim",
        "critical",
        0.93,
        "Replace 'clinically proven' with 'supported by internal testing' unless peer-reviewed evidence is cited",
    ),
    (
        r"\bscientifically\s+proven\b",
        "claim",
        "high",
        0.9,
        "Replace 'scientifically proven' with 'research-informed' or add citation",
    ),
    (
        r"\bmiracle\b",
        "claim",
        "critical",
        0.95,
        "Replace 'miracle' with 'effective'",
    ),
    (
        r"\bcure[sd]?\b",
        "claim",
        "critical",
        0.96,
        "Avoid medical cure claims; use 'helps manage' or 'supports wellness'",
    ),
    (
        r"\bzero\s+risk\b",
        "claim",
        "critical",
        0.94,
        "Replace 'zero risk' with 'low-risk when used as directed'",
    ),
    (
        r"\bno\s+side\s+effects\b",
        "claim",
        "critical",
        0.95,
        "Replace 'no side effects' with 'generally well tolerated'",
    ),
    (
        r"\binstant\s+results?\b",
        "claim",
        "medium",
        0.87,
        "Replace 'instant results' with 'timely results'",
    ),
    (
        r"\bbest\s+in\s+the\s+world\b",
        "tone",
        "medium",
        0.86,
        "Replace superlative 'best in the world' with 'trusted choice'",
    ),
]

_TONE_PATTERNS: list[tuple[str, str, str, float, str]] = [
    (
        r"\bact\s+now\b",
        "tone",
        "medium",
        0.84,
        "Soften high-pressure 'act now' CTA to 'explore today'",
    ),
    (
        r"\blast\s+chance\b",
        "tone",
        "medium",
        0.84,
        "Replace urgency phrase 'last chance' with 'available for a limited campaign window'",
    ),
    (
        r"\blimited\s+time\s+only\b",
        "tone",
        "medium",
        0.83,
        "Replace 'limited time only' with a clear campaign end date or 'seasonal offer'",
    ),
    (
        r"!!!+",
        "tone",
        "low",
        0.92,
        "Replace repeated exclamation marks '!!!' with a single punctuation mark",
    ),
]


def _issue_key(rule_ref: str, evidence: str) -> tuple[str, str]:
    return (rule_ref.strip().lower(), evidence.strip().lower())


def _append_unique_issue(
    db: Session,
    seen_keys: set[tuple[str, str]],
    target: list[Issue],
    issue: Issue,
) -> None:
    key = _issue_key(issue.rule_ref, issue.evidence)
    if key in seen_keys:
        return
    seen_keys.add(key)
    db.add(issue)
    target.append(issue)


def _is_remote_ai_configured() -> tuple[bool, str, str | None]:
    settings = get_settings()
    url = (settings.AI_INTEGRATION_URL or "").strip().rstrip("/")
    if not url or "localhost" in url or "127.0.0.1" in url:
        return (False, url, None)
    token = (
        settings.AI_INTEGRATION_SERVICE_TOKEN.get_secret_value()
        if settings.AI_INTEGRATION_SERVICE_TOKEN
        else None
    )
    return (True, url, token)


def _call_remote_ai_analyze_sync(
    url: str, token: str | None, payload: dict[str, object]
) -> dict[str, object] | None:
    headers: dict[str, str] = {}
    if token:
        headers["X-Service-Token"] = token
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.post(f"{url}/analyze", json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, dict) else None
    except Exception:
        return None


def _run_guideline_and_claim_checks(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    submission: Submission,
    version: ContentVersion,
    review_session: ReviewSession,
    seen_keys: set[tuple[str, str]],
) -> list[Issue]:
    """Evaluate active tenant GuidelineRules and ClaimRegistry entries against submission copy."""
    created: list[Issue] = []
    text = version.raw_text or ""
    lower_text = text.lower()
    if not text.strip():
        return created

    active_rules = db.scalars(
        select(GuidelineRule)
        .join(BrandGuideline, BrandGuideline.id == GuidelineRule.guideline_id)
        .where(
            GuidelineRule.tenant_id == tenant_id,
            GuidelineRule.is_active.is_(True),
            BrandGuideline.tenant_id == tenant_id,
            BrandGuideline.is_active.is_(True),
        )
    ).all()

    for rule in active_rules:
        if rule.channel_scope:
            scopes = [s.strip().lower() for s in rule.channel_scope.split(",") if s.strip()]
            if scopes and "all" not in scopes and submission.channel.lower() not in scopes:
                continue
        quoted_terms = re.findall(r"[\"']([^\"']{3,60})[\"']", f"{rule.title} {rule.description}")
        if quoted_terms and re.search(
            r"\b(?:avoid|never|prohibit|prohibited|ban|banned|do not use)\b",
            f"{rule.title} {rule.description}",
            re.IGNORECASE,
        ):
            for term in quoted_terms:
                if term.lower() in lower_text:
                    _append_unique_issue(
                        db,
                        seen_keys,
                        created,
                        Issue(
                            tenant_id=tenant_id,
                            submission_id=submission.id,
                            content_version_id=version.id,
                            review_session_id=review_session.id,
                            category=rule.category or "tone",
                            severity=rule.severity or "medium",
                            confidence=0.92,
                            evidence=term,
                            rule_ref=f"guideline:{rule.rule_code}",
                            source_ref=f"{rule.title}: {rule.description[:140]}",
                            suggested_fix=f"Revise copy to follow guideline '{rule.title}' ({rule.rule_code})",
                            checker_type="ai_assisted",
                            status="open",
                        ),
                    )

    now = datetime.now(timezone.utc)
    claims = db.scalars(
        select(ClaimRegistry).where(
            ClaimRegistry.tenant_id == tenant_id,
            ClaimRegistry.is_active.is_(True),
        )
    ).all()

    for claim in claims:
        significant_words = [
            w for w in re.findall(r"[a-zA-Z0-9%]+", claim.statement.lower()) if len(w) >= 4
        ]
        statement_match = (
            len(significant_words) >= 2
            and sum(1 for w in significant_words[:5] if w in lower_text) >= min(2, len(significant_words))
        )
        code_match = claim.claim_code.lower() in lower_text
        if not (statement_match or code_match):
            continue

        if claim.expires_at is not None:
            expires_at = (
                claim.expires_at
                if claim.expires_at.tzinfo is not None
                else claim.expires_at.replace(tzinfo=timezone.utc)
            )
            if expires_at < now:
                _append_unique_issue(
                    db,
                    seen_keys,
                    created,
                    Issue(
                        tenant_id=tenant_id,
                        submission_id=submission.id,
                        content_version_id=version.id,
                        review_session_id=review_session.id,
                        category="claim",
                        severity="high",
                        confidence=0.95,
                        evidence=claim.statement[:120],
                        rule_ref=f"claim:{claim.claim_code}",
                        source_ref=f"Claim '{claim.claim_code}' expired on {expires_at.date().isoformat()}",
                        suggested_fix=f"Remove or re-substantiate expired claim '{claim.claim_code}'",
                        checker_type="ai_assisted",
                        status="open",
                    ),
                )
        if claim.is_regulated and "*" not in text and not any(
            marker in lower_text for marker in ("source", "study", "terms", "disclaimer")
        ):
            _append_unique_issue(
                db,
                seen_keys,
                created,
                Issue(
                    tenant_id=tenant_id,
                    submission_id=submission.id,
                    content_version_id=version.id,
                    review_session_id=review_session.id,
                    category="claim",
                    severity="medium",
                    confidence=0.88,
                    evidence=claim.statement[:120],
                    rule_ref=f"claim:{claim.claim_code}:disclosure",
                    source_ref=f"Regulated claim '{claim.claim_code}' requires citation or qualifying disclosure",
                    suggested_fix="Add supporting source attribution or regulatory qualifier disclosure",
                    checker_type="ai_assisted",
                    status="open",
                ),
            )

    return created


def _run_builtin_ai_semantic_analysis(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    submission: Submission,
    version: ContentVersion,
    review_session: ReviewSession,
    seen_keys: set[tuple[str, str]],
) -> list[Issue]:
    """Run built-in semantic compliance analysis when external AI service is unavailable."""
    created: list[Issue] = []
    text = version.raw_text or ""
    if not text.strip():
        return created

    for idx, (pattern, category, severity, confidence, suggestion) in enumerate(
        _CLAIM_PATTERNS + _TONE_PATTERNS, start=1
    ):
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            matched_text = match.group(0)
            _append_unique_issue(
                db,
                seen_keys,
                created,
                Issue(
                    tenant_id=tenant_id,
                    submission_id=submission.id,
                    content_version_id=version.id,
                    review_session_id=review_session.id,
                    category=category,
                    severity=severity,
                    confidence=confidence,
                    evidence=matched_text,
                    rule_ref=f"ai_policy:{category}_{idx}",
                    source_ref=f"Built-in semantic compliance policy ({category})",
                    suggested_fix=suggestion,
                    checker_type="ai_assisted",
                    status="open",
                ),
            )
            break

    masked = version.pii_masked_text or ""
    if any(
        token in masked
        for token in ("[EMAIL_REDACTED]", "[PHONE_REDACTED]", "[SSN_REDACTED]", "[CARD_REDACTED]")
    ):
        _append_unique_issue(
            db,
            seen_keys,
            created,
            Issue(
                tenant_id=tenant_id,
                submission_id=submission.id,
                content_version_id=version.id,
                review_session_id=review_session.id,
                category="claim",
                severity="high",
                confidence=0.97,
                evidence="Potential personal contact or ID data detected in draft",
                rule_ref="ai_policy:pii_exposure",
                source_ref="Privacy & PII safety guard",
                suggested_fix="Remove personal email, phone, or ID numbers before publication",
                checker_type="ai_assisted",
                status="open",
            ),
        )

    lower_text = text.lower()
    if (
        submission.intent.lower() in {"promotional", "regulated_claim", "product_launch"}
        and ("%" in text or "results" in lower_text or "save up to" in lower_text)
        and not any(
            k in lower_text
            for k in ("results may vary", "terms", "eligibility", "disclaimer", "*")
        )
    ):
        _append_unique_issue(
            db,
            seen_keys,
            created,
            Issue(
                tenant_id=tenant_id,
                submission_id=submission.id,
                content_version_id=version.id,
                review_session_id=review_session.id,
                category="claim",
                severity="medium",
                confidence=0.85,
                evidence="Performance/promotional outcome statement lacks qualifying disclosure",
                rule_ref="ai_policy:missing_disclosure",
                source_ref=f"Channel '{submission.channel}' / intent '{submission.intent}' disclosure rule",
                suggested_fix="Append a clear qualifying disclosure such as 'Results may vary; see full terms.'",
                checker_type="ai_assisted",
                status="open",
            ),
        )

    return created


def run_deterministic_terminology_check(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    review_session: ReviewSession,
    seen_keys: set[tuple[str, str]] | None = None,
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

    local_seen = seen_keys if seen_keys is not None else set()
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
            _append_unique_issue(db, local_seen, created_issues, issue)

    db.flush()
    return created_issues


def create_review_session(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID,
    submission_id: uuid.UUID,
    content_version_id: uuid.UUID | None = None,
) -> ReviewSession:
    """Create and execute deterministic + AI compliance checkers synchronously."""
    submission = db.scalar(
        select(Submission).where(Submission.id == submission_id, Submission.tenant_id == tenant_id)
    )
    if not submission:
        raise NotFoundException("Submission", str(submission_id))

    if content_version_id is None:
        version = db.scalar(
            select(ContentVersion).where(
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
        status="in_progress",
        guideline_snapshot=guideline_snapshot,
        started_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.flush()

    term_checker = CheckerResult(
        tenant_id=tenant_id,
        review_session_id=session.id,
        checker_name="terminology_checker",
        checker_type="rule_based",
        status="in_progress",
    )
    ai_checker = CheckerResult(
        tenant_id=tenant_id,
        review_session_id=session.id,
        checker_name="ai_tone_and_claim_checker",
        checker_type="ai_assisted",
        status="in_progress",
    )
    job = BackgroundJob(
        tenant_id=tenant_id,
        job_type="review",
        reference_id=session.id,
        status="queued",
    )
    db.add_all([term_checker, ai_checker, job])
    submission.status = "in_review"
    db.flush()

    # Deduplicate against already-open issues on this content version so re-reviews stay clean
    existing_open = db.scalars(
        select(Issue).where(
            Issue.tenant_id == tenant_id,
            Issue.submission_id == submission.id,
            Issue.content_version_id == version.id,
            Issue.status == "open",
        )
    ).all()
    seen_keys: set[tuple[str, str]] = {
        _issue_key(item.rule_ref, item.evidence) for item in existing_open
    }

    t0 = time.monotonic()
    term_issues = run_deterministic_terminology_check(
        db, tenant_id=tenant_id, review_session=session, seen_keys=seen_keys
    )
    term_checker.status = "completed"
    term_checker.duration_ms = max(1, int((time.monotonic() - t0) * 1000))
    term_checker.raw_output = {"issues_found": len(term_issues)}

    t1 = time.monotonic()
    ai_issues = _run_guideline_and_claim_checks(
        db,
        tenant_id=tenant_id,
        submission=submission,
        version=version,
        review_session=session,
        seen_keys=seen_keys,
    )


    remote_ok, remote_url, remote_token = _is_remote_ai_configured()
    engine_used = "builtin_semantic_compliance"

    if remote_ok:
        remote_resp = _call_remote_ai_analyze_sync(
            remote_url,
            remote_token,
            {
                "content": {
                    "submission_id": str(submission.id),
                    "content_version_id": str(version.id),
                    "text": version.pii_masked_text or version.raw_text or "",
                    "channel": submission.channel,
                    "audience": submission.audience,
                    "intent": submission.intent,
                },
            },
        )

        if remote_resp and isinstance(remote_resp.get("findings"), list):
            engine_used = "external_ai_service"

            for idx, item in enumerate(remote_resp["findings"], start=1):
                if not isinstance(item, dict):
                    continue

                evidence_data = item.get("evidence")
                if isinstance(evidence_data, dict):
                    evidence_text = str(evidence_data.get("text") or "")
                else:
                    evidence_text = str(evidence_data or "")

                _append_unique_issue(
                    db,
                    seen_keys,
                    ai_issues,
                    Issue(
                        tenant_id=tenant_id,
                        submission_id=submission.id,
                        content_version_id=version.id,
                        review_session_id=session.id,
                        category=str(item.get("category") or "tone"),
                        severity=str(item.get("severity") or "medium"),
                        confidence=float(item.get("confidence") or 0.85),
                        evidence=evidence_text or str(
                            item.get("issue") or "AI flagged section"
                        ),
                        rule_ref=str(
                            item.get("guideline_reference") or f"external_ai:{idx}"
                        ),
                        source_ref=str(
                            item.get("explanation") or "AI integration analysis"
                        ),
                        suggested_fix=item.get("suggested_fix"),
                        checker_type="ai_assisted",
                        status="open",
                    ),
                )
        else:
            ai_issues.extend(
                _run_builtin_ai_semantic_analysis(
                    db,
                    tenant_id=tenant_id,
                    submission=submission,
                    version=version,
                    review_session=session,
                    seen_keys=seen_keys,
                )
            )
    else:
        ai_issues.extend(
            _run_builtin_ai_semantic_analysis(
                db,
                tenant_id=tenant_id,
                submission=submission,
                version=version,
                review_session=session,
                seen_keys=seen_keys,
            )
        )


    db.flush()
    ai_checker.status = "completed"
    ai_checker.duration_ms = max(1, int((time.monotonic() - t1) * 1000))
    ai_checker.raw_output = {"issues_found": len(ai_issues), "engine": engine_used}

    all_open = db.scalars(
        select(Issue).where(
            Issue.tenant_id == tenant_id,
            Issue.submission_id == submission.id,
            Issue.content_version_id == version.id,
            Issue.status == "open",
        )
    ).all()
    severities = {item.severity.lower() for item in all_open}
    if "critical" in severities or "high" in severities:
        risk_level = "high"
    elif "medium" in severities or all_open:
        risk_level = "medium"
    else:
        risk_level = "low"

    session.status = "completed"
    session.risk_level = risk_level
    session.completed_at = datetime.now(timezone.utc)
    job.status = "completed"
    submission.status = "completed"

    record_audit_event(
        db,
        tenant_id=tenant_id,
        actor_id=actor_id,
        action="review_session.completed",
        resource_type="review_session",
        resource_id=str(session.id),
        details={
            "submission_id": str(submission.id),
            "version_id": str(version.id),
            "risk_level": risk_level,
            "open_issues": len(all_open),
            "engine": engine_used,
        },
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
