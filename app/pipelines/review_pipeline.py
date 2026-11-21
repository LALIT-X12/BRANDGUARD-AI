import asyncio
import uuid

from app.clients.gemini_client import GeminiClient, TokenUsage
from app.core.logging import get_logger
from app.schemas.contracts import ReviewFinding, ReviewRequest, ReviewResponse, TokenUsageOut
from app.services.checkers.semantic_checkers import build_default_checkers
from app.services.claim_verifier import verify_claims
from app.services.guideline_service import interpret_guidelines

logger = get_logger(__name__)

_SEVERITY_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def _merge_duplicate_and_conflicting_findings(findings: list[ReviewFinding]) -> list[ReviewFinding]:
    """Merge duplicate evidence findings and resolve conflicts conservatively (keep higher severity)."""
    merged: dict[tuple[str, str], ReviewFinding] = {}
    for f in findings:
        key = (f.evidence.text.strip().lower(), f.guideline_reference)
        existing = merged.get(key)
        if existing is None:
            merged[key] = f
            continue

        # Conservative conflict resolution: keep highest severity, mark human review if checkers disagree
        if existing.category != f.category:
            existing.requires_human_review = True
        if _SEVERITY_RANK[f.severity] > _SEVERITY_RANK[existing.severity]:
            f.requires_human_review = existing.requires_human_review or f.requires_human_review
            merged[key] = f
        else:
            existing.confidence = max(existing.confidence, f.confidence)

    return list(merged.values())


async def run_review_pipeline(
    *,
    client: GeminiClient,
    request: ReviewRequest,
) -> ReviewResponse:
    """Coordinate guideline interpretation, concurrent semantic checkers, and claim verification."""
    req_id = request.request_id or str(uuid.uuid4())
    interpreted = interpret_guidelines(request.guidelines, request.content)

    checkers = build_default_checkers()
    selected_keys = (
        [k for k in request.enabled_checkers if k in checkers]
        if request.enabled_checkers is not None
        else list(checkers.keys())
    )

    total_usage = TokenUsage()
    all_findings: list[ReviewFinding] = []
    uncertainty_notes = list(interpreted.uncertainty_notes)
    requires_human_review = bool(interpreted.conflicts or interpreted.uncertainty_notes)

    tasks = [
        checkers[key].run(
            client=client,
            content=request.content,
            guidelines=interpreted,
            request_id=f"{req_id}:{key}",
        )
        for key in selected_keys
    ]
    claim_task = verify_claims(
        client=client,
        content=request.content,
        claims=request.claims,
        request_id=f"{req_id}:claims_verify",
    )

    results = await asyncio.gather(*tasks, claim_task, return_exceptions=True)

    # Collect semantic checker results
    for res in results[:-1]:
        if isinstance(res, Exception):
            logger.warning("Checker failed [request_id=%s]: %s", req_id, res)
            uncertainty_notes.append("One semantic checker failed; escalated for human review.")
            requires_human_review = True
            continue
        output, usage = res
        total_usage.merge(usage)
        all_findings.extend(output.findings)
        uncertainty_notes.extend(output.uncertainty_notes)

    # Collect claim verifier result
    claim_res = results[-1]
    if isinstance(claim_res, Exception):
        logger.warning("Claim verifier failed [request_id=%s]: %s", req_id, claim_res)
        uncertainty_notes.append("Claim verification failed; escalated for human review.")
        requires_human_review = True
    else:
        claim_findings, _assessments, claim_usage = claim_res
        total_usage.merge(claim_usage)
        all_findings.extend(claim_findings)

    consolidated = _merge_duplicate_and_conflicting_findings(all_findings)
    if any(f.requires_human_review for f in consolidated):
        requires_human_review = True

    return ReviewResponse(
        findings=consolidated,
        uncertainty_notes=uncertainty_notes,
        requires_human_review=requires_human_review,
        guideline_conflicts=interpreted.conflicts,
        token_usage=TokenUsageOut(
            input_tokens=total_usage.input_tokens,
            output_tokens=total_usage.output_tokens,
            calls=total_usage.calls,
            estimated_cost_usd=total_usage.estimated_cost_usd(client.settings),
        ),
    )

