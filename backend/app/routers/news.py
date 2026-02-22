"""News & Intelligence sources — curated feeds (Twitter, Substack, RSS)."""
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.auth import get_current_user
from app.database import get_db
from app.models.intelligence_digest import IntelligenceDigest
from app.models.intelligence_source import IntelligenceSource
from app.models.news_item import NewsItem
from app.models.user import User
from app.schemas.news_item import (
    IntelligenceDigestOut,
    IntelligenceSourceCreate,
    IntelligenceSourceOut,
    NewsItemOut,
    NewsItemUpdate,
)
from app.services.news_service import refresh_all_sources

router = APIRouter(prefix="/news", tags=["news"])


# ── Source management ───────────────────────────────────────────────────

@router.get("/sources", response_model=list[IntelligenceSourceOut])
def list_sources(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return db.query(IntelligenceSource).order_by(IntelligenceSource.created_at.desc()).all()


@router.post("/sources", response_model=IntelligenceSourceOut, status_code=201)
def create_source(
    body: IntelligenceSourceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    source = IntelligenceSource(
        source_type=body.source_type,
        name=body.name,
        identifier=body.identifier,
        added_by_user_id=user.id,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


@router.delete("/sources/{source_id}", status_code=204)
def delete_source(
    source_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    source = db.query(IntelligenceSource).get(source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    db.delete(source)
    db.commit()


# ── Feed ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[NewsItemOut])
def list_news(
    portfolio_snapshot_id: Optional[str] = Query(None),
    source_id: Optional[str] = Query(None),
    is_read: Optional[bool] = Query(None),
    is_flagged: Optional[bool] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = db.query(NewsItem)

    if portfolio_snapshot_id:
        query = query.filter(NewsItem.portfolio_snapshot_id == portfolio_snapshot_id)
    if source_id:
        query = query.filter(NewsItem.intelligence_source_id == source_id)
    if is_read is not None:
        query = query.filter(NewsItem.is_read == is_read)
    if is_flagged is not None:
        query = query.filter(NewsItem.is_flagged == is_flagged)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(
                NewsItem.headline.ilike(pattern),
                NewsItem.snippet.ilike(pattern),
                NewsItem.source_name.ilike(pattern),
                NewsItem.entity_name.ilike(pattern),
            )
        )

    return (
        query.order_by(desc(NewsItem.fetched_at))
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.post("/refresh")
def trigger_refresh(
    background_tasks: BackgroundTasks,
    _user: User = Depends(get_current_user),
):
    from app.database import SessionLocal

    def _run():
        session = SessionLocal()
        try:
            count = refresh_all_sources(session)
            logger.info("Refreshed intelligence: %d new items", count)
        except Exception as e:
            logger.warning("Intelligence refresh failed: %s", e)
        finally:
            session.close()

    background_tasks.add_task(_run)
    return {"status": "refresh_started"}


@router.get("/digest/latest", response_model=IntelligenceDigestOut)
def get_latest_digest(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    digest = (
        db.query(IntelligenceDigest)
        .order_by(desc(IntelligenceDigest.created_at))
        .first()
    )
    if not digest:
        raise HTTPException(404, "No digest available yet")
    return digest


@router.patch("/{item_id}", response_model=NewsItemOut)
def update_news_item(
    item_id: str,
    body: NewsItemUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    item = db.query(NewsItem).get(item_id)
    if not item:
        raise HTTPException(404, "News item not found")
    if body.is_read is not None:
        item.is_read = body.is_read
    if body.is_flagged is not None:
        item.is_flagged = body.is_flagged
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_news_item(
    item_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    item = db.query(NewsItem).get(item_id)
    if not item:
        raise HTTPException(404, "News item not found")
    db.delete(item)
    db.commit()
