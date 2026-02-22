from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TrackedPersonCreate(BaseModel):
    name: str
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    source: Optional[str] = None
    dealflow_entry_id: Optional[str] = None


class TrackedPersonUpdate(BaseModel):
    name: Optional[str] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    source: Optional[str] = None
    dealflow_entry_id: Optional[str] = None


class TrackedPersonOut(BaseModel):
    id: str
    name: str
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    source: Optional[str] = None
    dealflow_entry_id: Optional[str] = None
    added_by_user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    dealflow_entry_name: Optional[str] = None

    model_config = {"from_attributes": True}
