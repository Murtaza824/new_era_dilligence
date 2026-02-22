"""Tracked person — individual being tracked in the dealflow pipeline."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, DateTime, ForeignKey

from app.database import Base


class TrackedPerson(Base):
    __tablename__ = "tracked_persons"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    linkedin_url = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    source = Column(String, nullable=True)
    dealflow_entry_id = Column(
        String, ForeignKey("dealflow_entries.id", ondelete="SET NULL"), nullable=True
    )
    added_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
