from typing import Any

from app.utils.pii_masking import mask_pii


def normalize_content(
    *,
    raw_text: str,
    channel: str,
    audience: str,
    intent: str,
    content_format: str,
) -> tuple[dict[str, Any], str]:
    """Convert extracted content into BrandGuard's standard internal representation.

    Applies early PII masking before the text is shared with external AI services.
    """
    cleaned = "\n".join(line.rstrip() for line in raw_text.splitlines()).strip()
    masked_text, pii_summary = mask_pii(cleaned)

    normalized_payload: dict[str, Any] = {
        "channel": channel,
        "audience": audience,
        "intent": intent,
        "content_format": content_format,
        "character_count": len(cleaned),
        "word_count": len(cleaned.split()) if cleaned else 0,
        "paragraphs": [p for p in cleaned.split("\n\n") if p.strip()],
        "pii_redaction_summary": pii_summary,
    }
    return normalized_payload, masked_text

