import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from app.database import Base


class PortfolioUpdate(Base):
    __tablename__ = "portfolio_updates"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    portfolio_snapshot_id = Column(
        String, ForeignKey("portfolio_snapshots.id"), nullable=False
    )
    content = Column(Text, nullable=False)
    source = Column(String, nullable=True)  # e.g. "email", "call", "paste", "link"
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_by = Column(String, default="user")
