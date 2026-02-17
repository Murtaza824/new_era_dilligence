from datetime import datetime
from pydantic import BaseModel


class CompanyCreate(BaseModel):
    name: str


class CompanyOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime
    document_count: int = 0
    has_memo: bool = False

    model_config = {"from_attributes": True}
