import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Text
from app.database import Base


class EmailAccount(Base):
    __tablename__ = "email_accounts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False)
    email = Column(String, nullable=False)
    provider = Column(String, nullable=False, default="gmail")
    refresh_token = Column(Text, nullable=False)
    access_token = Column(Text, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    last_sync_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
