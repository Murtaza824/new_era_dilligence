from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ── IntelligenceSource schemas ──────────────────────────────────────────

class IntelligenceSourceCreate(BaseModel):
    source_type: str  # "twitter" | "substack" | "rss"
    name: str
    identifier: str


class IntelligenceSourceOut(BaseModel):
    id: str
    source_type: str
    name: str
    identifier: str
    is_active: bool
    last_fetched_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── NewsItem schemas ────────────────────────────────────────────────────

class NewsItemUpdate(BaseModel):
    is_read: Optional[bool] = None
    is_flagged: Optional[bool] = None


class NewsItemOut(BaseModel):
    id: str
    intelligence_source_id: Optional[str] = None
    portfolio_snapshot_id: Optional[str] = None
    source_name: str
    entity_name: Optional[str] = None
    headline: str
    url: Optional[str] = None
    snippet: Optional[str] = None
    sentiment: Optional[str] = None
    topics: Optional[str] = None
    insight: Optional[str] = None
    importance: Optional[str] = None
    is_read: bool
    is_flagged: bool
    fetched_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


# ── IntelligenceDigest schemas ─────────────────────────────────────────

class IntelligenceDigestOut(BaseModel):
    id: str
    summary: str
    top_topics: Optional[str] = None
    overall_sentiment: Optional[str] = None
    item_count: int
    created_at: datetime

    model_config = {"from_attributes": True}
