from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class DealflowFounderCreate(BaseModel):
    name: str
    linkedin_url: Optional[str] = None
    twitter_url: Optional[str] = None
    email: Optional[str] = None


class DealflowFounderOut(BaseModel):
    id: str
    dealflow_entry_id: str
    name: str
    linkedin_url: Optional[str] = None
    twitter_url: Optional[str] = None
    email: Optional[str] = None

    model_config = {"from_attributes": True}


class DealflowEntryCreate(BaseModel):
    name: str
    website: Optional[str] = None
    company_linkedin_url: Optional[str] = None
    one_liner: Optional[str] = None
    location: Optional[str] = None
    stage: Optional[str] = None
    amount_raising: Optional[float] = None
    valuation: Optional[float] = None
    notes: Optional[str] = None
    source_type: Optional[str] = None
    source_detail: Optional[str] = None
    logo_url: Optional[str] = None
    status: Optional[str] = "none"
    founders: Optional[list[DealflowFounderCreate]] = None


class DealflowEntryUpdate(BaseModel):
    name: Optional[str] = None
    website: Optional[str] = None
    company_linkedin_url: Optional[str] = None
    one_liner: Optional[str] = None
    location: Optional[str] = None
    stage: Optional[str] = None
    amount_raising: Optional[float] = None
    valuation: Optional[float] = None
    notes: Optional[str] = None
    source_type: Optional[str] = None
    source_detail: Optional[str] = None
    logo_url: Optional[str] = None
    status: Optional[str] = None
    founders: Optional[list[DealflowFounderCreate]] = None


class DealflowEntryOut(BaseModel):
    id: str
    name: str
    website: Optional[str] = None
    company_linkedin_url: Optional[str] = None
    one_liner: Optional[str] = None
    location: Optional[str] = None
    stage: Optional[str] = None
    amount_raising: Optional[float] = None
    valuation: Optional[float] = None
    notes: Optional[str] = None
    source_type: Optional[str] = None
    source_detail: Optional[str] = None
    logo_url: Optional[str] = None
    status: str
    added_by_user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    founders: list[DealflowFounderOut] = []
    document_count: int = 0
    promoted_company_id: Optional[str] = None
    promoted_company_deal_status: Optional[str] = None

    model_config = {"from_attributes": True}


class DealflowDocumentCreate(BaseModel):
    type: str  # pitch_deck | other
    url: Optional[str] = None


class DealflowDocumentOut(BaseModel):
    id: str
    dealflow_entry_id: str
    type: str
    status: str
    url: Optional[str] = None
    original_filename: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DealflowFromNotesRequest(BaseModel):
    text: Optional[str] = None
    url: Optional[str] = None


class PromoteToDealRoomOut(BaseModel):
    company_id: str
    message: str = "Promoted to Active Deals"
