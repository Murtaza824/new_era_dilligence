"""Agent job / activity for background tasks (memo generation, etc.)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, Text

from app.database import Base


class AgentJob(Base):
    __tablename__ = "agent_jobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(String, nullable=False)  # e.g. memo_generate, document_process
    entity_type = Column(String, nullable=False)  # e.g. company
    entity_id = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")  # pending | running | completed | failed
    message = Column(String, nullable=True)  # optional progress e.g. "Section 3/9"
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    completed_at = Column(DateTime, nullable=True)
