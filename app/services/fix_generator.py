from pydantic import BaseModel

from app.clients.gemini_client import GeminiClient, TokenUsage
from app.prompts.fix_prompts import FIX_GENERATOR_SYSTEM_PROMPT
from app.schemas.contracts import FixRequest, FixResponse, TokenUsageOut
from app.utils.prompt_safety import wrap_untrusted_content


class _FixGenerationLLMOutput(BaseModel):
    proposed_content: str
    explanation: str
    preserved_intent: bool = True


async def generate_minimal_fix(
    *,
    client: GeminiClient,
    request: FixRequest,
    request_id: str,
) -> tuple[FixResponse, TokenUsage]:
    """Generate a minimal-edit correction preserving creator intent and factual meaning."""
    rules_text = "\n".join(
        f"- [{r.rule_id}] {r.title}: {r.description}" for r in request.guidelines.rules
    ) or "Use the issue's rule_ref and source_ref."

    feedback_block = (
        f"\nPrevious validator feedback to address:\n{request.feedback}\n"
        if request.feedback
        else ""
    )

    user_prompt = (
        f"Issue details: {request.issue}\n"
        f"Creator intent: {request.intent}\n"
        f"<brand_guidelines>\n{rules_text}\n</brand_guidelines>\n"
        f"{feedback_block}\n"
        f"{wrap_untrusted_content(request.content)}"
    )

    llm_out, usage = await client.complete_json(
        system_prompt=FIX_GENERATOR_SYSTEM_PROMPT,
        user_content=user_prompt,
        response_model=_FixGenerationLLMOutput,
        request_id=request_id,
    )

    response = FixResponse(
        original_content=request.content,
        proposed_content=llm_out.proposed_content,
        explanation=llm_out.explanation,
        preserved_intent=llm_out.preserved_intent,
        token_usage=TokenUsageOut(
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            calls=usage.calls,
            estimated_cost_usd=usage.estimated_cost_usd(client.settings),
        ),
    )
    return response, usage

