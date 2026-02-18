from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, computed_field


class PortfolioSnapshotOut(BaseModel):
    id: str
    company_id: Optional[str] = None
    company_name: str
    one_liner: Optional[str] = None
    website: Optional[str] = None
    investment_stage: Optional[str] = None
    investment_size: Optional[float] = None
    entry_valuation: Optional[float] = None
    last_valuation: Optional[float] = None
    ownership_pct: Optional[float] = None
    investment_date: Optional[date] = None
    imported_at: datetime
    sector: Optional[str] = None
    geography: Optional[str] = None
    founder_type: Optional[str] = None
    outlier_probability: Optional[float] = None
    effective_outlier_probability: Optional[float] = None  # derived when outlier_probability is null

    @computed_field
    @property
    def effective_ownership_pct(self) -> Optional[float]:
        """Ownership to display: stored ownership_pct or (investment_size / entry_valuation) * 100 when not set."""
        if self.ownership_pct is not None:
            return self.ownership_pct
        if (
            self.entry_valuation is not None
            and self.investment_size is not None
            and self.entry_valuation > 0
        ):
            return (self.investment_size / self.entry_valuation) * 100
        return None

    model_config = {"from_attributes": True}


class PortfolioImportRow(BaseModel):
    company_name: str
    one_liner: Optional[str] = None
    website: Optional[str] = None
    investment_stage: Optional[str] = None
    investment_size: Optional[float] = None
    entry_valuation: Optional[float] = None
    last_valuation: Optional[float] = None
    ownership_pct: Optional[float] = None
    investment_date: Optional[str] = None  # ISO date string
    sector: Optional[str] = None
    geography: Optional[str] = None
    founder_type: Optional[str] = None
    outlier_probability: Optional[float] = None


class PortfolioCreateRequest(BaseModel):
    company_name: str
    one_liner: Optional[str] = None
    website: Optional[str] = None
    investment_stage: Optional[str] = None
    investment_size: Optional[float] = None
    entry_valuation: Optional[float] = None
    last_valuation: Optional[float] = None
    ownership_pct: Optional[float] = None
    investment_date: Optional[str] = None
    sector: Optional[str] = None
    geography: Optional[str] = None
    founder_type: Optional[str] = None
    outlier_probability: Optional[float] = None


class PortfolioUpdateRequest(BaseModel):
    company_name: Optional[str] = None
    one_liner: Optional[str] = None
    website: Optional[str] = None
    investment_stage: Optional[str] = None
    investment_size: Optional[float] = None
    entry_valuation: Optional[float] = None
    last_valuation: Optional[float] = None
    ownership_pct: Optional[float] = None
    investment_date: Optional[str] = None
    sector: Optional[str] = None
    geography: Optional[str] = None
    founder_type: Optional[str] = None
    outlier_probability: Optional[float] = None


# ── Portfolio Updates (notes / audit trail) ──────────────────────────────

class PortfolioUpdateCreate(BaseModel):
    content: str
    source: Optional[str] = None  # "email", "call", "paste", "link"


class PortfolioUpdateOut(BaseModel):
    id: str
    portfolio_snapshot_id: str
    content: str
    source: Optional[str] = None
    created_at: datetime
    created_by: str

    model_config = {"from_attributes": True}
