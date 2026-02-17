from datetime import datetime
from pydantic import BaseModel


class DocumentCreate(BaseModel):
    type: str  # deck | call_notes | website | other
    content: str | None = None  # For call_notes (pasted text)
    url: str | None = None  # For website links


class DocumentOut(BaseModel):
    id: str
    company_id: str
    type: str
    status: str
    url: str | None = None
    original_filename: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
