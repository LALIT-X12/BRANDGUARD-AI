import re

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_PHONE_RE = re.compile(r"\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b")
_SSN_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_CARD_RE = re.compile(r"\b(?:\d[ -]*?){13,16}\b")


def mask_pii(text: str) -> tuple[str, dict[str, int]]:
    """Mask common PII patterns before sending text to external AI services.

    Returns the masked text and a count summary of redacted entity types.
    """
    counts: dict[str, int] = {"email": 0, "phone": 0, "ssn": 0, "card": 0}

    def _sub(pattern: re.Pattern[str], token: str, key: str, value: str) -> str:
        matches = pattern.findall(value)
        counts[key] += len(matches)
        return pattern.sub(token, value)

    masked = _sub(_EMAIL_RE, "[REDACTED_EMAIL]", "email", text)
    masked = _sub(_SSN_RE, "[REDACTED_SSN]", "ssn", masked)
    masked = _sub(_PHONE_RE, "[REDACTED_PHONE]", "phone", masked)
    masked = _sub(_CARD_RE, "[REDACTED_CARD]", "card", masked)
    return masked, counts

