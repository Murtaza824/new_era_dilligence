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
    added_by_user_id: Optional[str] = None
    profile_pic_url: Optional[str] = None
    related_companies: Optional[str] = None
    stage: Optional[str] = None
    vc_firm_name: Optional[str] = None
    startup_name: Optional[str] = None
    investor_check_size: Optional[str] = None
    introductions_made: Optional[str] = None
    introduced_us_to: Optional[str] = None
    interested_lp: Optional[bool] = False
    investor_in: Optional[str] = None
    warm: Optional[bool] = False
    syndicate_member: Optional[bool] = False
    quarterly_update_list: Optional[bool] = False
    notes_2: Optional[str] = None
    intros_made_for_us: Optional[int] = 0
    intros_we_made: Optional[int] = 0
    check_sizes: Optional[str] = None


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
    profile_pic_url: Optional[str] = None
    related_companies: Optional[str] = None
    stage: Optional[str] = None
    vc_firm_name: Optional[str] = None
    startup_name: Optional[str] = None
    investor_check_size: Optional[str] = None
    introductions_made: Optional[str] = None
    introduced_us_to: Optional[str] = None
    interested_lp: Optional[bool] = None
    investor_in: Optional[str] = None
    warm: Optional[bool] = None
    syndicate_member: Optional[bool] = None
    quarterly_update_list: Optional[bool] = None
    notes_2: Optional[str] = None
    intros_made_for_us: Optional[int] = None
    intros_we_made: Optional[int] = None
    check_sizes: Optional[str] = None


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
    profile_pic_url: Optional[str] = None
    related_companies: Optional[str] = None
    stage: Optional[str] = None
    vc_firm_name: Optional[str] = None
    startup_name: Optional[str] = None
    investor_check_size: Optional[str] = None
    introductions_made: Optional[str] = None
    introduced_us_to: Optional[str] = None
    interested_lp: bool = False
    investor_in: Optional[str] = None
    warm: bool = False
    syndicate_member: bool = False
    quarterly_update_list: bool = False
    notes_2: Optional[str] = None
    intros_made_for_us: int = 0
    intros_we_made: int = 0
    check_sizes: Optional[str] = None
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
