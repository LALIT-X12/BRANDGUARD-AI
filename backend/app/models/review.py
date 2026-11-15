import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TenantScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class ReviewSession(Base, UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin):
    """Coordinates deterministic and AI checkers for a specific content version."""

    __tablename__ = "review_sessions"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content_version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("content_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(40), default="pending", nullable=False, index=True)
    risk_level: Mapped[str | None] = mapped_column(String(30), nullable=True)
    guideline_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    checker_results: Mapped[list["CheckerResult"]] = relationship(
        back_populates="review_session", cascade="all, delete-orphan"
    )


class CheckerResult(Base, UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin):
    """Raw execution result from an individual deterministic or AI checker."""

    __tablename__ = "checker_results"

    review_session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("review_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    checker_name: Mapped[str] = mapped_column(String(80), nullable=False)
    checker_type: Mapped[str] = mapped_column(String(40), nullable=False)  # rule_based | ai_assisted
    status: Mapped[str] = mapped_column(String(40), default="pending", nullable=False)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_output: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    review_session: Mapped[ReviewSession] = relationship(back_populates="checker_results")


class ReviewAssignment(Base, UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin):
    """Human reviewer routing assignment based on risk, claims, and confidence."""

    __tablename__ = "review_assignments"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    review_session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("review_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_role: Mapped[str] = mapped_column(String(50), nullable=False)
    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    routing_reason: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="open", nullable=False)


class Approval(Base, UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin):
    """Final human approval, rejection, or change-request decision."""

    __tablename__ = "approvals"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content_version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("content_versions.id", ondelete="CASCADE"), nullable=False
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    decision: Mapped[str] = mapped_column(String(40), nullable=False)  # approved | rejected | changes_requested
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    locked_version: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class BackgroundJob(Base, UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin):
    """Tracks asynchronous Redis worker jobs."""

    __tablename__ = "background_jobs"

    job_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    reference_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(40), default="queued", nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    progress: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

