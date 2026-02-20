import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Float, Text, ForeignKey
from app.database import Base


class Company(Base):
    __tablename__ = "companies"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    dealflow_entry_id = Column(String, ForeignKey("dealflow_entries.id"), nullable=True)
    name = Column(String, nullable=False)
    website = Column(String, nullable=True)
    logo_url = Column(String, nullable=True)
    entry_valuation = Column(Float, nullable=True)
    amount_raising = Column(Float, nullable=True)
    investment_stage = Column(String, nullable=True)
    one_liner = Column(String, nullable=True)
    location = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    source_type = Column(String, nullable=True)
    source_detail = Column(String, nullable=True)
    company_linkedin_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
