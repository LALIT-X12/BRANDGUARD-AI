from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TenantScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class GlossaryEntry(Base, UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin):
    """Approved and prohibited brand terminology."""

    __tablename__ = "glossary_entries"

    term: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)  # approved | prohibited
    preferred_term: Mapped[str | None] = mapped_column(String(200), nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    is_case_sensitive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

