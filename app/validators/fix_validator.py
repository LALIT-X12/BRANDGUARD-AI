from typing import Literal

from pydantic import BaseModel

from app.clients.claude_client import ClaudeClient, TokenUsage
from app.prompts.validator_prompts import VALIDATOR_SYSTEM_PROMPT
from app.schemas.contracts import TokenUsageOut, ValidationRequest, ValidationResponse
from app.utils.prompt_safety import wrap_untrusted_content


class _ValidatorLLMOutput(BaseModel):
    status: Literal["pass", "fail", "human_review_required"]
    issue_fixed: bool
    intent_preserved: bool
    no_new_claims: bool
    no_new_violations: bool = True
    feedback: str | None = None
    evidence: str = ""


async def validate_proposed_fix(
    *,
    client: ClaudeClient,
    request: ValidationRequest,
    request_id: str,
) -> tuple[ValidationResponse, TokenUsage]:
    """Independently verify that a proposed fix resolves the issue safely."""
    rules_text = "\n".join(
        f"- [{r.rule_id}] {r.title}: {r.description}" for r in request.guidelines.rules
    ) or f"Rule reference: {request.rule_ref}"

    user_prompt = (
        f"Creator intent: {request.intent}\n"
        f"Target issue evidence: {request.issue_evidence}\n"
        f"Rule reference: {request.rule_ref}\n"
        f"<brand_guidelines>\n{rules_text}\n</brand_guidelines>\n\n"
        f"Original content:\n{wrap_untrusted_content(request.original_content)}\n\n"
        f"Proposed edit:\n{wrap_untrusted_content(request.proposed_content)}"
    )

    llm_out, usage = await client.complete_json(
        system_prompt=VALIDATOR_SYSTEM_PROMPT,
        user_content=user_prompt,
        response_model=_ValidatorLLMOutput,
        model=client.settings.CLAUDE_VALIDATOR_MODEL,
        request_id=request_id,
        temperature=0.0,
    )

    all_passed = (
        llm_out.issue_fixed
        and llm_out.intent_preserved
        and llm_out.no_new_claims
        and llm_out.no_new_violations
    )
    final_status = "pass" if (all_passed and llm_out.status == "pass") else llm_out.status
    if not all_passed and final_status == "pass":
        final_status = "fail"

    response = ValidationResponse(
        status=final_status,
        issue_fixed=llm_out.issue_fixed,
        intent_preserved=llm_out.intent_preserved,
        no_new_claims=llm_out.no_new_claims,
        no_new_violations=llm_out.no_new_violations,
        feedback=llm_out.feedback,
        evidence=llm_out.evidence,
        token_usage=TokenUsageOut(
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            calls=usage.calls,
            estimated_cost_usd=usage.estimated_cost_usd(client.settings),
        ),
    )
    return response, usage

