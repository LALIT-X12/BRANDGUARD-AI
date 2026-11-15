import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TenantScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class SuggestedFix(Base, UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin):
    """Minimal-edit fix proposal and creator acceptance state."""

    __tablename__ = "suggested_fixes"

    issue_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("issues.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_content: Mapped[str] = mapped_column(Text, nullable=False)
    proposed_content: Mapped[str] = mapped_column(Text, nullable=False)
    version_diff: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    validation_status: Mapped[str] = mapped_column(String(40), default="pending", nullable=False)
    creator_decision: Mapped[str | None] = mapped_column(String(40), nullable=True)  # accepted | edited | rejected
    requires_human_review: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    validations: Mapped[list["FixValidation"]] = relationship(
        back_populates="suggested_fix", cascade="all, delete-orphan"
    )


class FixValidation(Base, UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin):
    """Independent validator outcome for a proposed fix attempt."""

    __tablename__ = "fix_validations"

    suggested_fix_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("suggested_fixes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    issue_fixed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    intent_preserved: Mapped[bool] = mapped_column(Boolean, nullable=False)
    no_new_claims: Mapped[bool] = mapped_column(Boolean, nullable=False)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)

    suggested_fix: Mapped[SuggestedFix] = relationship(back_populates="validations")

