import uuid

from sqlalchemy import Float, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TenantScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Issue(Base, UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin):
    """Normalized finding produced by any deterministic or AI checker."""

    __tablename__ = "issues"
    __table_args__ = (
        Index("ix_issues_tenant_status", "tenant_id", "status"),
        Index("ix_issues_tenant_rule", "tenant_id", "rule_ref"),
    )

    submission_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content_version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("content_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    review_session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("review_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(60), nullable=False)  # tone | terminology | claim | visual
    severity: Mapped[str] = mapped_column(String(30), nullable=False)  # low | medium | high | critical
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    evidence: Mapped[str] = mapped_column(Text, nullable=False)
    rule_ref: Mapped[str] = mapped_column(String(255), nullable=False)
    source_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggested_fix: Mapped[str | None] = mapped_column(Text, nullable=True)
    checker_type: Mapped[str] = mapped_column(String(40), nullable=False)  # rule_based | ai_assisted
    status: Mapped[str] = mapped_column(String(40), default="open", nullable=False, index=True)

