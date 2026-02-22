"""News item — a single article/post fetched from an intelligence source."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, String, Text, DateTime, ForeignKey

from app.database import Base


class NewsItem(Base):
    __tablename__ = "news_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    intelligence_source_id = Column(
        String, ForeignKey("intelligence_sources.id", ondelete="SET NULL"), nullable=True
    )
    portfolio_snapshot_id = Column(
        String, ForeignKey("portfolio_snapshots.id", ondelete="SET NULL"), nullable=True
    )
    source_name = Column(String, nullable=False)
    entity_name = Column(String, nullable=True)
    headline = Column(String, nullable=False)
    url = Column(String, nullable=True, unique=True)
    snippet = Column(Text, nullable=True)
    is_read = Column(Boolean, nullable=False, default=False)
    is_flagged = Column(Boolean, nullable=False, default=False)
    fetched_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
