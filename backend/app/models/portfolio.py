import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Date, DateTime, ForeignKey
from app.database import Base


def _effective_outlier_probability(sector, geography, founder_type, override):
    if override is not None:
        return override
    from app.services.outlier_probability import compute_standalone_probability
    return compute_standalone_probability(sector, geography, founder_type)


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id = Column(String, ForeignKey("companies.id"), nullable=True)
    company_name = Column(String, nullable=False)
    one_liner = Column(String, nullable=True)
    website = Column(String, nullable=True)
    investment_stage = Column(String, nullable=True)
    investment_size = Column(Float, nullable=True)
    entry_valuation = Column(Float, nullable=True)
    last_valuation = Column(Float, nullable=True)
    ownership_pct = Column(Float, nullable=True)
    investment_date = Column(Date, nullable=True)
    imported_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    # Factor metadata for correlated portfolio simulation (PRD latent-factor)
    sector = Column(String, nullable=True)  # ai, fintech, healthcare, consumer, saas, other
    geography = Column(String, nullable=True)  # california, new_york, massachusetts, other_us, international
    founder_type = Column(String, nullable=True)  # first_time, repeat
    outlier_probability = Column(Float, nullable=True)  # override; if null, derived from factors

    @property
    def effective_outlier_probability(self) -> float | None:
        """Derived from factors when outlier_probability is null."""
        return _effective_outlier_probability(
            self.sector, self.geography, self.founder_type, self.outlier_probability
        )
