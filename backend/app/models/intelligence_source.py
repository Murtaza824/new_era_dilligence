"""Intelligence source — a curated feed the team follows (Twitter, Substack, RSS)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, String, DateTime, ForeignKey

from app.database import Base


class IntelligenceSource(Base):
    __tablename__ = "intelligence_sources"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source_type = Column(String, nullable=False)  # "twitter" | "substack" | "rss"
    name = Column(String, nullable=False)
    identifier = Column(String, nullable=False)  # @handle, slug.substack.com, or full RSS URL
    added_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    last_fetched_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
