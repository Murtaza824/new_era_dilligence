import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey
from app.database import Base


class Memo(Base):
    __tablename__ = "memos"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    version = Column(Integer, default=1)
    content = Column(Text, nullable=True)  # Markdown content
    sections_json = Column(Text, nullable=True)  # JSON array of sections
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(String, default="system")


class MemoRevision(Base):
    __tablename__ = "memo_revisions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    memo_id = Column(String, ForeignKey("memos.id"), nullable=False)
    content = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(String, default="system")
