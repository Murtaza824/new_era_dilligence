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
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    updated_at: datetime
    entity_label: Optional[str] = None
    triggered_by_user_id: Optional[str] = None
    triggered_by_user_email: Optional[str] = None
    duration_seconds: Optional[float] = None

    model_config = {"from_attributes": True}
