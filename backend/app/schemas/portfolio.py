from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


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
