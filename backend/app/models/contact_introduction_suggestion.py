"""Suggested introduction: matchmaking output (contact ↔ company or portfolio)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, DateTime, ForeignKey

from app.database import Base


class ContactIntroductionSuggestion(Base):
    __tablename__ = "contact_introduction_suggestions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    network_contact_id = Column(String, ForeignKey("network_contacts.id"), nullable=False)
    target_type = Column(String, nullable=False)  # "company" | "portfolio"
    target_company_id = Column(String, ForeignKey("companies.id"), nullable=True)
    target_portfolio_id = Column(String, ForeignKey("portfolio_snapshots.id"), nullable=True)
    introduction_type = Column(String, nullable=False)  # fundraising | customer_sales | partnership | other
    reason_summary = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="suggested")  # suggested | introduced | dismissed
    created_by_trigger = Column(String, nullable=True)  # contact_added | company_created | portfolio_added
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
