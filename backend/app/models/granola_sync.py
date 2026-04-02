import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime
from app.database import Base


class GranolaSyncRecord(Base):
    __tablename__ = "granola_sync_records"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    granola_note_id = Column(String, unique=True, nullable=False, index=True)
    dealflow_entry_id = Column(String, nullable=True)
    company_id = Column(String, nullable=True)
    note_title = Column(String, nullable=True)
    processed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
