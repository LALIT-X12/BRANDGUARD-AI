from datetime import datetime, timezone

from pydantic import BaseModel, Field

from app.clients.gemini_client import GeminiClient, TokenUsage
from app.prompts.claim_prompts import CLAIM_VERIFICATION_SYSTEM_PROMPT
from app.schemas.contracts import (
    ClaimAssessment,
    ClaimEvidence,
    ContentInput,
    EvidenceSpan,
    ReviewFinding,
    validate_finding_offsets_and_references,
)
from app.utils.prompt_safety import wrap_untrusted_content


class ClaimVerificationOutput(BaseModel):
    assessments: list[ClaimAssessment] = Field(default_factory=list)


def _format_claims(claims: list[ClaimEvidence]) -> tuple[str, set[str], set[str]]:
    if not claims:
        return "NO_APPROVED_CLAIMS_REGISTERED", set(), set()

    now = datetime.now(timezone.utc)
    lines: list[str] = []
    expired_codes: set[str] = set()
    all_codes: set[str] = set()

    for c in claims:
        all_codes.add(c.claim_code)
        is_expired = bool(c.expires_at and c.expires_at < now) or not c.is_active
        if is_expired:
            expired_codes.add(c.claim_code)
        status_tag = "EXPIRED" if is_expired else "ACTIVE"
        reg_tag = "REGULATED" if c.is_regulated else "STANDARD"
        lines.append(
            f"- [{c.claim_code}] ({status_tag} | {reg_tag}) Statement: {c.statement} | "
            f"Source: {c.source_title or 'N/A'} | Citation: {c.citation_text or 'N/A'}"
        )
    return "\n".join(lines), expired_codes, all_codes


async def verify_claims(
    *,
    client: GeminiClient,
    content: ContentInput,
    claims: list[ClaimEvidence],
    request_id: str,
) -> tuple[list[ReviewFinding], list[ClaimAssessment], TokenUsage]:
    """Compare submitted claims against authoritative backend claim registry."""
    formatted_claims, expired_codes, all_codes = _format_claims(claims)
    user_prompt = (
        f"Sensitivity: {content.sensitivity_label}\n"
        f"<approved_claims>\n{formatted_claims}\n</approved_claims>\n\n"
        f"{wrap_untrusted_content(content.text)}"
    )

    output, usage = await client.complete_json(
        system_prompt=CLAIM_VERIFICATION_SYSTEM_PROMPT,
        user_content=user_prompt,
        response_model=ClaimVerificationOutput,
        request_id=request_id,
    )

    findings: list[ReviewFinding] = []
    claim_map = {c.claim_code: c for c in claims}

    for item in output.assessments:
        # Enforce deterministic expiry & regulated escalation regardless of model optimism
        if item.matched_claim_code and item.matched_claim_code in expired_codes:
            item.status = "expired"
            item.requires_human_review = True
        if item.matched_claim_code and (claim_map.get(item.matched_claim_code) and claim_map[item.matched_claim_code].is_regulated):
            item.requires_human_review = True
        if item.status != "verified":
            if item.status in {"contradicted", "expired", "human_review_required", "unverifiable"}:
                item.requires_human_review = True
            severity = "critical" if item.status == "contradicted" else "high"
            ref = item.matched_claim_code or "CLAIM_REGISTRY_UNSUPPORTED"
            finding = ReviewFinding(
                category="claim",
                severity=severity,
                confidence=item.confidence,
                issue=f"Claim status '{item.status}': {item.submitted_claim}",
                evidence=EvidenceSpan(text=item.submitted_claim, start=0, end=0),
                guideline_reference=ref,
                explanation=item.evidence_summary,
                suggested_fix=None,
                checker_name="claim_verifier",
                requires_human_review=item.requires_human_review,
            )
            findings.append(
                validate_finding_offsets_and_references(
                    finding,
                    content.text,
                    all_codes | {"CLAIM_REGISTRY_UNSUPPORTED"},
                )
            )

    return findings, output.assessments, usage

