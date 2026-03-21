import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Text
from app.database import Base


class EmailMessage(Base):
    __tablename__ = "email_messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email_account_id = Column(String, nullable=False)
    message_id = Column(String, nullable=False, unique=True)
    thread_id = Column(String, nullable=True)
    subject = Column(String, nullable=True)
    sender = Column(String, nullable=True)
    recipients = Column(Text, nullable=True)
    snippet = Column(Text, nullable=True)
    date = Column(DateTime, nullable=True)
    company_id = Column(String, nullable=True)
    dealflow_entry_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
