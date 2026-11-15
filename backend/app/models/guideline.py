import uuid

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, EmbeddingVector, TenantScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class BrandGuideline(Base, UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin):
    """Uploaded brand guideline document and version metadata."""

    __tablename__ = "brand_guidelines"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[str] = mapped_column(String(50), default="1.0", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    rules: Mapped[list["GuidelineRule"]] = relationship(
        back_populates="guideline", cascade="all, delete-orphan"
    )


class GuidelineRule(Base, UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin):
    """Individual rule extracted from or authored under a brand guideline."""

    __tablename__ = "guideline_rules"

    guideline_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("brand_guidelines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rule_code: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[str] = mapped_column(String(30), default="medium", nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    channel_scope: Mapped[str | None] = mapped_column(String(120), nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(EmbeddingVector(1536), nullable=True)

    __table_args__ = (
        Index("ix_guideline_rules_tenant_code", "tenant_id", "rule_code"),
    )

    guideline: Mapped[BrandGuideline] = relationship(back_populates="rules")

