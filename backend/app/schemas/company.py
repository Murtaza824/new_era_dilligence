from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class CompanyCreate(BaseModel):
    name: str
    website: Optional[str] = None


class DealflowFounderBrief(BaseModel):
    id: str
    name: str
    linkedin_url: Optional[str] = None
    twitter_url: Optional[str] = None
    email: Optional[str] = None

    model_config = {"from_attributes": True}


class CompanyOut(BaseModel):
    id: str
    name: str
    website: Optional[str] = None
    logo_url: Optional[str] = None
    entry_valuation: Optional[float] = None
    amount_raising: Optional[float] = None
    investment_stage: Optional[str] = None
    one_liner: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    source_type: Optional[str] = None
    source_detail: Optional[str] = None
    company_linkedin_url: Optional[str] = None
    deal_status: str = "active"
    dealflow_entry_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    document_count: int = 0
    has_memo: bool = False
    dealflow_founders: list[DealflowFounderBrief] = []

    model_config = {"from_attributes": True}


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    entry_valuation: Optional[float] = None
    amount_raising: Optional[float] = None
    investment_stage: Optional[str] = None
    one_liner: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    source_type: Optional[str] = None
    source_detail: Optional[str] = None
    company_linkedin_url: Optional[str] = None


class DealSuggestions(BaseModel):
    """Suggested deal fields from documents or web (user can apply or edit)."""
    entry_valuation: Optional[float] = None
    amount_raising: Optional[float] = None
    investment_stage: Optional[str] = None
