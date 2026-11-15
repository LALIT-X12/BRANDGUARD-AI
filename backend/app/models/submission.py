import uuid

from sqlalchemy import Boolean, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TenantScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Submission(Base, UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin):
    """Submitted content item with channel, audience, intent, and sensitivity controls."""

    __tablename__ = "submissions"
    __table_args__ = (
        Index("ix_submissions_tenant_status", "tenant_id", "status"),
        Index("ix_submissions_tenant_creator", "tenant_id", "creator_id"),
    )

    creator_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    channel: Mapped[str] = mapped_column(String(80), nullable=False)
    audience: Mapped[str] = mapped_column(String(120), nullable=False)
    intent: Mapped[str] = mapped_column(Text, nullable=False)
    content_format: Mapped[str] = mapped_column(String(40), nullable=False)  # text|markdown|docx|html|social|image|pdf
    sensitivity_label: Mapped[str] = mapped_column(String(40), default="internal", nullable=False)  # public|internal|confidential|regulated
    status: Mapped[str] = mapped_column(String(40), default="ingested", nullable=False, index=True)
    current_version_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    versions: Mapped[list["ContentVersion"]] = relationship(
        back_populates="submission", cascade="all, delete-orphan"
    )


class ContentVersion(Base, UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin):
    """Immutable version snapshot of submitted or edited content."""

    __tablename__ = "content_versions"
    __table_args__ = (
        UniqueConstraint("submission_id", "version_number", name="uq_content_versions_sub_ver"),
    )

    submission_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    pii_masked_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    submission: Mapped[Submission] = relationship(back_populates="versions")

