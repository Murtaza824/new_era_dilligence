from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TouchpointCreate(BaseModel):
    dealflow_entry_id: Optional[str] = None
    company_id: Optional[str] = None
    type: str = "call"
    source: Optional[str] = "manual"
    title: Optional[str] = None
    content: Optional[str] = None
    external_link: Optional[str] = None
    occurred_at: Optional[datetime] = None


class TouchpointUpdate(BaseModel):
    type: Optional[str] = None
    source: Optional[str] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    content: Optional[str] = None
    external_link: Optional[str] = None
    occurred_at: Optional[datetime] = None


class TouchpointOut(BaseModel):
    id: str
    dealflow_entry_id: Optional[str] = None
    company_id: Optional[str] = None
    type: str
    source: Optional[str] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    content: Optional[str] = None
    external_link: Optional[str] = None
    occurred_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}
