from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class NetworkContactCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone_number: Optional[str] = None
    location: Optional[str] = None
    company_name: Optional[str] = None
    role_or_title: Optional[str] = None
    linkedin_url: Optional[str] = None
    skills: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[str] = None
    nev_fund_i_lp: Optional[bool] = False
    nev_syndicate_lp: Optional[bool] = False
    added_by_user_id: Optional[str] = None  # relationship manager: which GP owns the relationship


class NetworkContactUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    location: Optional[str] = None
    company_name: Optional[str] = None
    role_or_title: Optional[str] = None
    linkedin_url: Optional[str] = None
    skills: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[str] = None
    nev_fund_i_lp: Optional[bool] = None
    nev_syndicate_lp: Optional[bool] = None


class NetworkContactOut(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    phone_number: Optional[str] = None
    location: Optional[str] = None
    company_name: Optional[str] = None
    role_or_title: Optional[str] = None
    linkedin_url: Optional[str] = None
    skills: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[str] = None
    nev_fund_i_lp: bool = False
    nev_syndicate_lp: bool = False
    added_by_user_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IntroductionSuggestionUpdate(BaseModel):
    status: str  # introduced | dismissed


class IntroductionSuggestionOut(BaseModel):
    id: str
    network_contact_id: str
    target_type: str
    target_company_id: Optional[str] = None
    target_portfolio_id: Optional[str] = None
    introduction_type: str
    reason_summary: Optional[str] = None
    status: str
    created_by_trigger: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Enriched for display
    contact_name: Optional[str] = None
    target_company_name: Optional[str] = None
    target_portfolio_name: Optional[str] = None

    model_config = {"from_attributes": True}
