"""Intelligence digest — batch-level trends summary generated after each refresh."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Text, DateTime

from app.database import Base


class IntelligenceDigest(Base):
    __tablename__ = "intelligence_digests"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    summary = Column(Text, nullable=False)
    top_topics = Column(String, nullable=True)
    overall_sentiment = Column(String, nullable=True)
    item_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
