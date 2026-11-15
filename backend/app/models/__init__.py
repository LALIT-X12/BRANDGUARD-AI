"""Export all ORM models so Alembic and SQLAlchemy register every table."""

from app.models.asset import VisualAsset
from app.models.audit import AuditLog
from app.models.claim import ClaimRegistry, ClaimSource
from app.models.dispute import Dispute
from app.models.fix import FixValidation, SuggestedFix
from app.models.glossary import GlossaryEntry
from app.models.guideline import BrandGuideline, GuidelineRule
from app.models.issue import Issue
from app.models.review import (
    Approval,
    BackgroundJob,
    CheckerResult,
    ReviewAssignment,
    ReviewSession,
)
from app.models.submission import ContentVersion, Submission
from app.models.tenant import Tenant
from app.models.user import Role, User, UserRole

__all__ = [
    "Approval",
    "AuditLog",
    "BackgroundJob",
    "BrandGuideline",
    "CheckerResult",
    "ClaimRegistry",
    "ClaimSource",
    "ContentVersion",
    "Dispute",
    "FixValidation",
    "GlossaryEntry",
    "GuidelineRule",
    "Issue",
    "ReviewAssignment",
    "ReviewSession",
    "Role",
    "Submission",
    "SuggestedFix",
    "Tenant",
    "User",
    "UserRole",
    "VisualAsset",
]

