import pytest

from app.core.exceptions import ForbiddenException
from app.core.permissions import Permission, RoleName, require_permissions
from app.utils.pii_masking import mask_pii
from app.utils.version_diff import compute_text_diff


def test_rbac_permissions_enforced() -> None:
    require_permissions([RoleName.CREATOR.value], {Permission.SUBMIT_CONTENT, Permission.DISPUTE_ISSUE})
    with pytest.raises(ForbiddenException):
        require_permissions([RoleName.CREATOR.value], {Permission.APPROVE_REGULATED})

    require_permissions([RoleName.LEGAL_REVIEWER.value], {Permission.APPROVE_REGULATED, Permission.VIEW_AUDIT})
    require_permissions([RoleName.BRAND_ADMIN.value], set(Permission))


def test_pii_masking_redacts_sensitive_tokens() -> None:
    sample = "Contact jane.doe@example.com or 555-123-4567; SSN 123-45-6789."
    masked, counts = mask_pii(sample)
    assert "[REDACTED_EMAIL]" in masked
    assert "[REDACTED_PHONE]" in masked
    assert "[REDACTED_SSN]" in masked
    assert counts["email"] == 1
    assert counts["phone"] == 1
    assert counts["ssn"] == 1


def test_version_diff_detects_changes() -> None:
    diff = compute_text_diff("Hello world", "Hello BrandGuard")
    assert diff["has_changes"] is True
    assert "-Hello world" in diff["unified_diff"]
    assert "+Hello BrandGuard" in diff["unified_diff"]

