from enum import Enum

from app.core.exceptions import ForbiddenException


class RoleName(str, Enum):
    """Canonical BrandGuard RBAC roles."""

    CREATOR = "creator"
    BRAND_MANAGER = "brand_manager"
    LEGAL_REVIEWER = "legal_reviewer"
    BRAND_ADMIN = "brand_admin"


class Permission(str, Enum):
    """Fine-grained permissions enforced across endpoints."""

    SUBMIT_CONTENT = "submit_content"
    VIEW_ISSUES = "view_issues"
    ACT_ON_FIX = "act_on_fix"
    DISPUTE_ISSUE = "dispute_issue"
    REVIEW_LOW_RISK = "review_low_risk"
    APPROVE_LOW_RISK = "approve_low_risk"
    REVIEW_REGULATED = "review_regulated"
    REVIEW_CONFIDENTIAL = "review_confidential"
    APPROVE_REGULATED = "approve_regulated"
    MANAGE_KNOWLEDGE = "manage_knowledge"
    MANAGE_ASSETS = "manage_assets"
    MANAGE_USERS = "manage_users"
    VIEW_AUDIT = "view_audit"
    VIEW_ANALYTICS = "view_analytics"


ROLE_PERMISSIONS: dict[RoleName, set[Permission]] = {
    RoleName.CREATOR: {
        Permission.SUBMIT_CONTENT,
        Permission.VIEW_ISSUES,
        Permission.ACT_ON_FIX,
        Permission.DISPUTE_ISSUE,
    },
    RoleName.BRAND_MANAGER: {
        Permission.VIEW_ISSUES,
        Permission.REVIEW_LOW_RISK,
        Permission.APPROVE_LOW_RISK,
        Permission.VIEW_ANALYTICS,
    },
    RoleName.LEGAL_REVIEWER: {
        Permission.VIEW_ISSUES,
        Permission.REVIEW_LOW_RISK,
        Permission.REVIEW_REGULATED,
        Permission.REVIEW_CONFIDENTIAL,
        Permission.APPROVE_REGULATED,
        Permission.VIEW_AUDIT,
        Permission.VIEW_ANALYTICS,
    },
    RoleName.BRAND_ADMIN: set(Permission),
}


def get_permissions_for_roles(roles: list[str]) -> set[Permission]:
    """Compute the union of permissions granted by a user's roles."""
    perms: set[Permission] = set()
    for role in roles:
        try:
            role_enum = RoleName(role)
        except ValueError:
            continue
        perms.update(ROLE_PERMISSIONS.get(role_enum, set()))
    return perms


def require_permissions(user_roles: list[str], required: set[Permission]) -> None:
    """Raise ForbiddenException if the user lacks any required permission."""
    granted = get_permissions_for_roles(user_roles)
    missing = required - granted
    if missing:
        raise ForbiddenException(
            f"Missing required permission(s): {', '.join(sorted(p.value for p in missing))}"
        )

