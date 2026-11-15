import base64
from typing import Any

import httpx

from app.clients.claude_client import ClaudeClient, TokenUsage
from app.prompts.visual_prompts import VISUAL_REVIEW_SYSTEM_PROMPT
from app.schemas.contracts import VisualAnalysisRequest, VisualAnalysisResponse


async def _resolve_image_base64(req: VisualAnalysisRequest) -> tuple[str, str]:
    if req.image_base64:
        return req.image_base64, req.media_type

    assert req.image_url is not None
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=5.0, read=15.0, write=5.0, pool=5.0)) as client:
        resp = await client.get(req.image_url)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", req.media_type).split(";")[0].strip()
        encoded = base64.b64encode(resp.content).decode("ascii")
        return encoded, content_type


async def analyze_visual_asset(
    *,
    client: ClaudeClient,
    request: VisualAnalysisRequest,
    request_id: str,
) -> tuple[VisualAnalysisResponse, TokenUsage]:
    """Perform multimodal Claude vision analysis on a creative asset."""
    image_b64, media_type = await _resolve_image_base64(request)

    rules_text = "\n".join(
        f"- [{r.rule_id}] {r.title}: {r.description}" for r in request.guidelines.rules
    ) or "NO_VISUAL_GUIDELINES_PROVIDED"

    content_blocks: list[dict[str, Any]] = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": image_b64,
            },
        },
        {
            "type": "text",
            "text": (
                f"<brand_guidelines>\n{rules_text}\n</brand_guidelines>\n\n"
                f"Accompanying text: {request.accompanying_text or 'None provided'}"
            ),
        },
    ]

    result, usage = await client.complete_json(
        system_prompt=VISUAL_REVIEW_SYSTEM_PROMPT,
        user_content=content_blocks,
        response_model=VisualAnalysisResponse,
        request_id=request_id,
    )

    known_ids = {r.rule_id for r in request.guidelines.rules}
    for f in result.findings:
        f.checker_name = "visual_reviewer"
        if known_ids and f.guideline_reference not in known_ids:
            f.guideline_reference = "UNMAPPED_RULE"
            f.requires_human_review = True
        if f.confidence < 0.7 or f.requires_human_review:
            f.requires_human_review = True
            result.requires_human_review = True

    if not request.guidelines.rules:
        result.requires_human_review = True

    return result, usage

