import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from app.database import Base


class Touchpoint(Base):
    __tablename__ = "touchpoints"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    dealflow_entry_id = Column(String, ForeignKey("dealflow_entries.id"), nullable=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=True)
    type = Column(String, nullable=False)         # call, meeting, email, other
    source = Column(String, nullable=True)         # granola, manual, email_sync
    title = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    content = Column(Text, nullable=True)
    external_link = Column(String, nullable=True)
    occurred_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
