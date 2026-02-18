"""Network contact — person in the GP network (Murtaza + Carter)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, String, Text, DateTime, ForeignKey

from app.database import Base


class NetworkContact(Base):
    __tablename__ = "network_contacts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    location = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    role_or_title = Column(String, nullable=True)
    linkedin_url = Column(String, nullable=True)
    skills = Column(String, nullable=True)  # comma-separated e.g. "sales, fintech, ops"
    notes = Column(Text, nullable=True)
    tags = Column(String, nullable=True)  # comma-separated e.g. "lp, fintech, operator"
    nev_fund_i_lp = Column(Boolean, nullable=False, default=False)
    nev_syndicate_lp = Column(Boolean, nullable=False, default=False)
    added_by_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
