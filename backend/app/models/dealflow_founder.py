import uuid
from sqlalchemy import Column, String, ForeignKey
from app.database import Base


class DealflowFounder(Base):
    __tablename__ = "dealflow_founders"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    dealflow_entry_id = Column(
        String, ForeignKey("dealflow_entries.id", ondelete="CASCADE"), nullable=False
    )
    name = Column(String, nullable=False)
    linkedin_url = Column(String, nullable=True)
    twitter_url = Column(String, nullable=True)
    email = Column(String, nullable=True)
