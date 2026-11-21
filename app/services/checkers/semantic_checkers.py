from pydantic import BaseModel, Field

from app.clients.gemini_client import GeminiClient, TokenUsage
from app.prompts.review_prompts import CHECKER_SPECS, CHECKER_SYSTEM_TEMPLATE
from app.schemas.contracts import (
    ContentInput,
    ReviewFinding,
    validate_finding_offsets_and_references,
)
from app.services.guideline_service import InterpretedGuidelines, format_rules_for_prompt
from app.utils.prompt_safety import wrap_untrusted_content


class CheckerOutput(BaseModel):
    findings: list[ReviewFinding] = Field(default_factory=list)
    uncertainty_notes: list[str] = Field(default_factory=list)


class SemanticChecker:
    """Reusable parameterized semantic checker backed by a single GeminiClient."""

    def __init__(self, key: str, category_filters: list[str] | None = None) -> None:
        if key not in CHECKER_SPECS:
            raise ValueError(f"Unknown semantic checker key: {key}")
        self.key = key
        self.spec = CHECKER_SPECS[key]
        self.category_filters = category_filters

    async def run(
        self,
        *,
        client: GeminiClient,
        content: ContentInput,
        guidelines: InterpretedGuidelines,
        request_id: str,
    ) -> tuple[CheckerOutput, TokenUsage]:
        formatted_rules = format_rules_for_prompt(guidelines, self.category_filters)
        if formatted_rules == "NO_MATCHING_GUIDELINES_PROVIDED" and self.key != "consistency":
            return (
                CheckerOutput(
                    findings=[],
                    uncertainty_notes=[
                        f"{self.spec['checker_name']}: No matching guidelines provided; skipped to avoid inventing rules."
                    ],
                ),
                TokenUsage(),
            )

        system_prompt = CHECKER_SYSTEM_TEMPLATE.format(**self.spec)
        user_prompt = (
            f"Channel: {content.channel}\n"
            f"Target Audience: {content.audience}\n"
            f"Creator Intent: {content.intent}\n\n"
            f"<brand_guidelines>\n{formatted_rules}\n</brand_guidelines>\n\n"
            f"{wrap_untrusted_content(content.text)}"
        )

        output, usage = await client.complete_json(
            system_prompt=system_prompt,
            user_content=user_prompt,
            response_model=CheckerOutput,
            request_id=request_id,
        )

        validated_findings = [
            validate_finding_offsets_and_references(
                f, content.text, guidelines.known_rule_ids
            )
            for f in output.findings
        ]
        for f in validated_findings:
            f.checker_name = self.spec["checker_name"]

        return (
            CheckerOutput(
                findings=validated_findings,
                uncertainty_notes=output.uncertainty_notes,
            ),
            usage,
        )


def build_default_checkers() -> dict[str, SemanticChecker]:
    """Instantiate the 7 independent Phase 5 semantic checkers."""
    return {
        "tone": SemanticChecker("tone", ["tone", "brand_voice", "communication_style"]),
        "voice": SemanticChecker("voice", ["brand_voice", "voice", "communication_style"]),
        "messaging": SemanticChecker("messaging", ["messaging", "prohibited_language"]),
        "context": SemanticChecker("context", ["context", "messaging", "industry_requirements"]),
        "audience": SemanticChecker("audience", ["audience", "communication_style"]),
        "claims": SemanticChecker("claims", ["prohibited_language", "industry_requirements", "claim"]),
        "consistency": SemanticChecker("consistency", None),
    }

