from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AgentJobOut(BaseModel):
    id: str
    type: str
    entity_type: str
    entity_id: str
    status: str
    message: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    updated_at: datetime
    entity_label: Optional[str] = None  # e.g. company name for display

    model_config = {"from_attributes": True}
