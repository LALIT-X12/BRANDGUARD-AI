import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, EmbeddingVector, TenantScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class ClaimRegistry(Base, UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin):
    """Verified facts and regulatory claims with owner and expiry tracking."""

    __tablename__ = "claim_registry"

    claim_code: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    scope: Mapped[str | None] = mapped_column(String(200), nullable=True)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_regulated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(EmbeddingVector(1536), nullable=True)

    __table_args__ = (
        Index("ix_claim_registry_tenant_code", "tenant_id", "claim_code"),
        Index("ix_claim_registry_tenant_expires", "tenant_id", "expires_at"),
    )

    sources: Mapped[list["ClaimSource"]] = relationship(
        back_populates="claim", cascade="all, delete-orphan"
    )


class ClaimSource(Base, UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin):
    """Supporting evidence and source references for a registered claim."""

    __tablename__ = "claim_sources"

    claim_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("claim_registry.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    citation_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    claim: Mapped[ClaimRegistry] = relationship(back_populates="sources")

