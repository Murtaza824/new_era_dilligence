import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime
from app.database import Base


class Location(Base):
    __tablename__ = "locations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
