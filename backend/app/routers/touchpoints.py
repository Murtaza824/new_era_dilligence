"""Touchpoints: call notes, meetings, emails, and other interactions tied to companies."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.touchpoint import Touchpoint
from app.schemas.touchpoint import TouchpointCreate, TouchpointOut, TouchpointUpdate

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/touchpoints",
    tags=["touchpoints"],
    dependencies=[Depends(get_current_user)],
)

_SUMMARY_SYSTEM = """Summarize the following meeting/call notes in 2-4 concise bullet points.
Focus on key decisions, action items, and important information discussed.
Return plain text bullets (no markdown headers)."""


def _generate_summary_background(touchpoint_id: str) -> None:
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        tp = db.query(Touchpoint).filter(Touchpoint.id == touchpoint_id).first()
        if not tp or not tp.content or tp.summary:
            return
        from app.llm import complete
        summary = complete(
            prompt=tp.content[:4000],
            system=_SUMMARY_SYSTEM,
            max_tokens=300,
        )
        tp.summary = summary.strip()
        db.commit()
    except Exception as exc:
        logger.warning("Touchpoint summary generation failed: %s", exc)
    finally:
        db.close()


@router.get("", response_model=list[TouchpointOut])
def list_touchpoints(
    dealflow_entry_id: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Touchpoint).order_by(Touchpoint.occurred_at.desc())
    if dealflow_entry_id:
        query = query.filter(Touchpoint.dealflow_entry_id == dealflow_entry_id)
    if company_id:
        query = query.filter(Touchpoint.company_id == company_id)
    return query.all()


@router.post("", response_model=TouchpointOut)
def create_touchpoint(
    body: TouchpointCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    if not body.dealflow_entry_id and not body.company_id:
        raise HTTPException(status_code=400, detail="Must provide dealflow_entry_id or company_id")
    tp = Touchpoint(
        dealflow_entry_id=body.dealflow_entry_id,
        company_id=body.company_id,
        type=body.type,
        source=body.source or "manual",
        title=body.title,
        content=body.content,
        external_link=body.external_link,
        occurred_at=body.occurred_at or datetime.now(timezone.utc),
    )
    db.add(tp)
    db.commit()
    db.refresh(tp)
    if tp.content and not tp.summary:
        background_tasks.add_task(_generate_summary_background, tp.id)
    return tp


@router.get("/{touchpoint_id}", response_model=TouchpointOut)
def get_touchpoint(touchpoint_id: str, db: Session = Depends(get_db)):
    tp = db.query(Touchpoint).filter(Touchpoint.id == touchpoint_id).first()
    if not tp:
        raise HTTPException(status_code=404, detail="Touchpoint not found")
    return tp


@router.patch("/{touchpoint_id}", response_model=TouchpointOut)
def update_touchpoint(
    touchpoint_id: str,
    body: TouchpointUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    tp = db.query(Touchpoint).filter(Touchpoint.id == touchpoint_id).first()
    if not tp:
        raise HTTPException(status_code=404, detail="Touchpoint not found")
    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(tp, field, value)
    db.commit()
    db.refresh(tp)
    if "content" in data and tp.content and not tp.summary:
        background_tasks.add_task(_generate_summary_background, tp.id)
    return tp


@router.delete("/{touchpoint_id}")
def delete_touchpoint(touchpoint_id: str, db: Session = Depends(get_db)):
    tp = db.query(Touchpoint).filter(Touchpoint.id == touchpoint_id).first()
    if not tp:
        raise HTTPException(status_code=404, detail="Touchpoint not found")
    db.delete(tp)
    db.commit()
    return {"ok": True}
