from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class MemoSectionOut(BaseModel):
    title: str
    content: str


class MemoOut(BaseModel):
    id: str
    company_id: str
    version: int
    content: str  # Full markdown
    sections: list[MemoSectionOut] = []
    created_at: datetime
    created_by: str

    model_config = {"from_attributes": True}


class RefineSectionRequest(BaseModel):
    section_title: str
    instructions: str  # e.g. "add more detail about the competitive moat"


class AddContextRequest(BaseModel):
    content: str  # Free-form notes to add to the knowledge base
