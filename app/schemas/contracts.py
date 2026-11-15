from datetime import datetime
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, Field, model_validator

T = TypeVar("T")

SeverityLevel = Literal["low", "medium", "high", "critical"]
FindingCategory = Literal[
    "tone",
    "voice",
    "messaging",
    "context",
    "audience",
    "claim",
    "consistency",
    "terminology",
    "visual",
    "uncertainty",
]
ClaimStatus = Literal[
    "verified",
    "unsupported",
    "contradicted",
    "expired",
    "unverifiable",
    "human_review_required",
]


class TokenUsageOut(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    calls: int = 0
    estimated_cost_usd: float = 0.0


class ContentInput(BaseModel):
    submission_id: str | None = None
    content_version_id: str | None = None
    text: str = Field(min_length=1, max_length=500_000)
    channel: str = "general"
    audience: str = "general"
    intent: str = "inform"
    sensitivity_label: Literal["public", "internal", "confidential", "regulated"] = "internal"


class BrandGuidelineRule(BaseModel):
    rule_id: str = Field(min_length=1, max_length=100)
    category: str = Field(default="messaging", max_length=80)
    severity: SeverityLevel = "medium"
    mandatory: bool = True
    title: str
    description: str
    channel_scope: str | None = None


class BrandGuidelineContext(BaseModel):
    guideline_id: str | None = None
    version: str = "1.0"
    brand_voice_summary: str | None = None
    rules: list[BrandGuidelineRule] = Field(default_factory=list)


class GlossaryContext(BaseModel):
    approved_terms: list[str] = Field(default_factory=list)
    prohibited_terms: list[str] = Field(default_factory=list)
    preferred_replacements: dict[str, str] = Field(default_factory=dict)


class ClaimEvidence(BaseModel):
    claim_code: str = Field(min_length=1, max_length=100)
    statement: str
    source_title: str | None = None
    source_url: str | None = None
    citation_text: str | None = None
    expires_at: datetime | None = None
    is_regulated: bool = False
    is_active: bool = True


class EvidenceSpan(BaseModel):
    text: str
    start: int = Field(ge=0)
    end: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_span(self) -> "EvidenceSpan":
        if self.end < self.start:
            raise ValueError("EvidenceSpan.end must be >= EvidenceSpan.start")
        return self


class ReviewFinding(BaseModel):
    category: FindingCategory
    severity: SeverityLevel
    confidence: float = Field(ge=0.0, le=1.0)
    issue: str = Field(min_length=1)
    evidence: EvidenceSpan
    guideline_reference: str = Field(min_length=1)
    explanation: str = Field(min_length=1)
    suggested_fix: str | None = None
    checker_name: str = "ai_semantic"
    requires_human_review: bool = False


class ReviewRequest(BaseModel):
    request_id: str | None = None
    content: ContentInput
    guidelines: BrandGuidelineContext = Field(default_factory=BrandGuidelineContext)
    glossary: GlossaryContext = Field(default_factory=GlossaryContext)
    claims: list[ClaimEvidence] = Field(default_factory=list)
    enabled_checkers: list[str] | None = None


class ReviewResponse(BaseModel):
    findings: list[ReviewFinding] = Field(default_factory=list)
    uncertainty_notes: list[str] = Field(default_factory=list)
    requires_human_review: bool = False
    guideline_conflicts: list[str] = Field(default_factory=list)
    token_usage: TokenUsageOut = Field(default_factory=TokenUsageOut)


class ClaimAssessment(BaseModel):
    submitted_claim: str
    status: ClaimStatus
    confidence: float = Field(ge=0.0, le=1.0)
    matched_claim_code: str | None = None
    evidence_summary: str
    requires_human_review: bool = False


class FixRequest(BaseModel):
    """Accepts both rich FixRequest and backend's fix_workflow.py payload."""

    issue: dict[str, Any]
    content: str = Field(min_length=1)
    intent: str = "preserve creator intent"
    guidelines: BrandGuidelineContext = Field(default_factory=BrandGuidelineContext)
    feedback: str | None = None


class FixResponse(BaseModel):
    original_content: str
    proposed_content: str
    explanation: str
    preserved_intent: bool = True
    token_usage: TokenUsageOut = Field(default_factory=TokenUsageOut)


class ValidationRequest(BaseModel):
    original_content: str = Field(min_length=1)
    proposed_content: str = Field(min_length=1)
    intent: str
    issue_evidence: str
    rule_ref: str
    guidelines: BrandGuidelineContext = Field(default_factory=BrandGuidelineContext)


class ValidationResponse(BaseModel):
    status: Literal["pass", "fail", "human_review_required"]
    issue_fixed: bool
    intent_preserved: bool
    no_new_claims: bool
    no_new_violations: bool = True
    feedback: str | None = None
    evidence: str = ""
    token_usage: TokenUsageOut = Field(default_factory=TokenUsageOut)


class VisualAnalysisRequest(BaseModel):
    submission_id: str | None = None
    image_base64: str | None = None
    image_url: str | None = None
    media_type: Literal["image/png", "image/jpeg", "image/webp", "image/gif"] = "image/png"
    accompanying_text: str | None = None
    guidelines: BrandGuidelineContext = Field(default_factory=BrandGuidelineContext)

    @model_validator(mode="after")
    def require_image_source(self) -> "VisualAnalysisRequest":
        if not self.image_base64 and not self.image_url:
            raise ValueError("Either image_base64 or image_url must be provided")
        return self


class VisualAnalysisResponse(BaseModel):
    findings: list[ReviewFinding] = Field(default_factory=list)
    image_text_mismatch: bool = False
    requires_human_review: bool = False
    summary: str = ""
    token_usage: TokenUsageOut = Field(default_factory=TokenUsageOut)


class ResponseEnvelope(BaseModel, Generic[T]):
    request_id: str
    status: Literal["ok", "partial", "error"] = "ok"
    data: T


def validate_finding_offsets_and_references(
    finding: ReviewFinding,
    content_text: str,
    known_references: set[str],
) -> ReviewFinding:
    """Validate and repair evidence offsets and enforce non-fabricated guideline references."""
    start = finding.evidence.start
    end = finding.evidence.end
    text_len = len(content_text)

    if end > text_len or content_text[start:end] != finding.evidence.text:
        idx = content_text.find(finding.evidence.text)
        if idx != -1:
            finding.evidence = EvidenceSpan(
                text=finding.evidence.text,
                start=idx,
                end=idx + len(finding.evidence.text),
            )
        else:
            finding.evidence = EvidenceSpan(text=finding.evidence.text, start=0, end=0)
            finding.requires_human_review = True

    if known_references and finding.guideline_reference not in known_references:
        finding.guideline_reference = "UNMAPPED_RULE"
        finding.requires_human_review = True

    if finding.confidence < 0.7:
        finding.requires_human_review = True

    return finding

