"""Network contact — person in the GP network (Murtaza + Carter)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime, ForeignKey

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
    skills = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    tags = Column(String, nullable=True)
    nev_fund_i_lp = Column(Boolean, nullable=False, default=False)
    nev_syndicate_lp = Column(Boolean, nullable=False, default=False)
    added_by_user_id = Column(String, ForeignKey("users.id"), nullable=False)

    # Extended fields from Airtable
    profile_pic_url = Column(String, nullable=True)
    related_companies = Column(Text, nullable=True)
    stage = Column(String, nullable=True)
    vc_firm_name = Column(String, nullable=True)
    startup_name = Column(String, nullable=True)
    investor_check_size = Column(String, nullable=True)
    introductions_made = Column(Text, nullable=True)
    introduced_us_to = Column(Text, nullable=True)
    interested_lp = Column(Boolean, nullable=False, default=False)
    investor_in = Column(Text, nullable=True)
    warm = Column(Boolean, nullable=False, default=False)
    syndicate_member = Column(Boolean, nullable=False, default=False)
    quarterly_update_list = Column(Boolean, nullable=False, default=False)
    notes_2 = Column(Text, nullable=True)
    intros_made_for_us = Column(Integer, nullable=False, default=0)
    intros_we_made = Column(Integer, nullable=False, default=0)
    check_sizes = Column(String, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
