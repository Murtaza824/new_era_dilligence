"""
CoS (Chief of Staff) API adapter — /api/v1/*

Thin translation layer that maps the exact routes, query params, and JSON shapes
the CoS MCP server (mcp_servers/crm/server.py) expects onto Jarvis's internal
data models. Zero changes needed in the CoS codebase.

Auth: static Bearer token via COS_API_KEY env var (not JWT).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api_key_auth import require_cos_api_key
from app.database import get_db
from app.models.company import Company
from app.models.dealflow_entry import DealflowEntry
from app.models.dealflow_founder import DealflowFounder
from app.models.network_contact import NetworkContact
from app.models.portfolio import PortfolioSnapshot
from app.models.portfolio_update import PortfolioUpdate
from app.models.touchpoint import Touchpoint

router = APIRouter(
    prefix="/api/v1",
    dependencies=[Depends(require_cos_api_key)],
    tags=["CoS API v1"],
)

# ── Stage mapping ────────────────────────────────────────────────────────────

JARVIS_TO_COS_STAGE: dict[str, str] = {
    "none": "sourcing",
    "lead": "sourcing",
    "tracking": "sourcing",
    "reached_out": "first_meeting",
    "active": "diligence",
    "invested": "closed",
    "passed": "passed",
}

COS_TO_JARVIS_STAGE: dict[str, str] = {
    "sourcing": "lead",
    "first_meeting": "reached_out",
    "diligence": "active",
    "term_sheet": "active",
    "closed": "invested",
    "passed": "passed",
}

# Company deal_status → CoS stage (companies are always in active diligence or later)
COMPANY_STATUS_TO_COS: dict[str, str] = {
    "pipeline": "sourcing",
    "active": "diligence",
    "passed": "passed",
    "portfolio": "closed",
}


# ── Shape adapters ───────────────────────────────────────────────────────────

def _touchpoints_for(db: Session, *, dealflow_entry_id: str | None = None, company_id: str | None = None) -> list[Touchpoint]:
    """Fetch touchpoints linked to a dealflow entry or company, newest first."""
    q = db.query(Touchpoint)
    conditions = []
    if dealflow_entry_id:
        conditions.append(Touchpoint.dealflow_entry_id == dealflow_entry_id)
    if company_id:
        conditions.append(Touchpoint.company_id == company_id)
    if not conditions:
        return []
    return q.filter(or_(*conditions)).order_by(Touchpoint.occurred_at.desc()).all()


def _tp_to_note(tp: Touchpoint) -> dict:
    return {
        "id": tp.id,
        "content": tp.summary or tp.content or "",
        "category": tp.source or "general",
        "created_at": tp.created_at.isoformat() if tp.created_at else None,
    }


def _tp_to_interaction(tp: Touchpoint) -> dict:
    return {
        "type": tp.type or "note",
        "date": tp.occurred_at.isoformat()[:10] if tp.occurred_at else None,
        "summary": tp.summary or tp.title or tp.content or "",
    }


def _dealflow_to_deal(entry: DealflowEntry, founders: list[DealflowFounder], touchpoints: list[Touchpoint]) -> dict:
    note_types = {"note", "other"}
    notes = [_tp_to_note(tp) for tp in touchpoints if tp.type in note_types]
    interactions = [_tp_to_interaction(tp) for tp in touchpoints if tp.type not in note_types]

    return {
        "id": entry.id,
        "company_name": entry.name,
        "stage": JARVIS_TO_COS_STAGE.get(entry.status, "sourcing"),
        "sector": entry.stage,  # investment stage doubles as rough sector indicator
        "founder_names": [f.name for f in founders],
        "founder_emails": [f.email for f in founders if f.email],
        "description": entry.one_liner or "",
        "check_size_target": entry.amount_raising,
        "lead_partner": "murtaza",
        "created_at": entry.created_at.isoformat()[:10] if entry.created_at else None,
        "last_updated": entry.updated_at.isoformat()[:10] if entry.updated_at else None,
        "notes": notes,
        "interactions": interactions,
    }


def _company_to_deal(company: Company, touchpoints: list[Touchpoint], db: Session) -> dict:
    """Adapt a Company (active deal) to the CoS deal shape."""
    founders: list[DealflowFounder] = []
    if company.dealflow_entry_id:
        founders = db.query(DealflowFounder).filter(DealflowFounder.dealflow_entry_id == company.dealflow_entry_id).all()

    note_types = {"note", "other"}
    notes = [_tp_to_note(tp) for tp in touchpoints if tp.type in note_types]
    interactions = [_tp_to_interaction(tp) for tp in touchpoints if tp.type not in note_types]

    return {
        "id": f"company-{company.id}",
        "company_name": company.name,
        "stage": COMPANY_STATUS_TO_COS.get(company.deal_status, "diligence"),
        "sector": company.investment_stage,
        "founder_names": [f.name for f in founders],
        "founder_emails": [f.email for f in founders if f.email],
        "description": company.one_liner or "",
        "check_size_target": company.amount_raising,
        "lead_partner": "murtaza",
        "created_at": company.created_at.isoformat()[:10] if company.created_at else None,
        "last_updated": company.updated_at.isoformat()[:10] if company.updated_at else None,
        "notes": notes,
        "interactions": interactions,
    }


def _portfolio_to_cos(snap: PortfolioSnapshot, last_interaction_date: str | None) -> dict:
    return {
        "id": snap.id,
        "company_name": snap.company_name,
        "stage": snap.investment_stage or "unknown",
        "investment_date": snap.investment_date.isoformat() if snap.investment_date else None,
        "check_size": snap.investment_size,
        "ownership_percentage": snap.ownership_pct,
        "founders": [],
        "latest_metrics": {},
        "last_interaction": last_interaction_date,
        "next_board_date": None,
    }


def _infer_contact_type(c: NetworkContact) -> str:
    if c.nev_fund_i_lp or c.nev_syndicate_lp or c.interested_lp:
        return "lp"
    if c.vc_firm_name:
        return "co_investor"
    if c.startup_name:
        return "founder"
    return "network"


def _contact_to_cos(c: NetworkContact, interaction_history: list[dict] | None = None) -> dict:
    last = interaction_history[0]["date"] if interaction_history else None
    return {
        "id": c.id,
        "name": c.name,
        "email": c.email,
        "type": _infer_contact_type(c),
        "company": c.company_name or c.startup_name or c.vc_firm_name or "",
        "linkedin": c.linkedin_url,
        "notes": c.notes or "",
        "last_interaction": last,
        "interaction_history": interaction_history or [],
    }


def _contact_to_lp(c: NetworkContact, last_interaction_date: str | None) -> dict:
    status = "committed" if (c.nev_fund_i_lp or c.nev_syndicate_lp) else "interested"
    return {
        "id": c.id,
        "name": c.name,
        "email": c.email,
        "commitment_status": status,
        "commitment_amount": None,
        "last_interaction": last_interaction_date,
        "relationship_owner": "murtaza",
    }


# ── Request bodies ───────────────────────────────────────────────────────────

class InteractionBody(BaseModel):
    contact_id: str
    type: str  # meeting, email, call, note
    date: str  # ISO date string
    summary: str
    follow_up: Optional[str] = None


class DealPatchBody(BaseModel):
    stage: str
    note: Optional[str] = None


class DealNoteBody(BaseModel):
    content: str
    category: Optional[str] = "general"


# ══════════════════════════════════════════════════════════════════════════════
#  DEALS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/deals")
def list_deals(
    stage: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """List deals from dealflow pipeline + active companies."""
    results: list[dict] = []

    # 1) Dealflow entries
    dq = db.query(DealflowEntry)
    if stage and stage != "all":
        jarvis_statuses = [k for k, v in JARVIS_TO_COS_STAGE.items() if v == stage]
        if jarvis_statuses:
            dq = dq.filter(DealflowEntry.status.in_(jarvis_statuses))
    entries = dq.order_by(DealflowEntry.updated_at.desc()).limit(limit).all()

    entry_ids = {e.id for e in entries}
    all_founders = db.query(DealflowFounder).filter(DealflowFounder.dealflow_entry_id.in_(entry_ids)).all() if entry_ids else []
    founders_by_entry: dict[str, list[DealflowFounder]] = {}
    for f in all_founders:
        founders_by_entry.setdefault(f.dealflow_entry_id, []).append(f)

    for e in entries:
        tps = _touchpoints_for(db, dealflow_entry_id=e.id)
        results.append(_dealflow_to_deal(e, founders_by_entry.get(e.id, []), tps))

    # 2) Companies not linked to a dealflow entry (directly created in dealroom)
    linked_df_ids = {e.id for e in entries}
    cq = db.query(Company).filter(Company.deal_status != "portfolio")
    if stage and stage != "all":
        cos_to_company = {"diligence": "active", "passed": "passed", "closed": "portfolio"}
        company_status = cos_to_company.get(stage)
        if company_status:
            cq = cq.filter(Company.deal_status == company_status)
        else:
            cq = cq.filter(False)  # no company matches sourcing/first_meeting

    companies = cq.order_by(Company.updated_at.desc()).limit(limit).all()
    seen_df_ids = {c.dealflow_entry_id for c in companies if c.dealflow_entry_id}
    for c in companies:
        if c.dealflow_entry_id and c.dealflow_entry_id in linked_df_ids:
            continue  # already included via dealflow
        tps = _touchpoints_for(db, company_id=c.id)
        results.append(_company_to_deal(c, tps, db))

    return results[:limit]


@router.get("/deals/search")
def search_deals(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Search deals by company name, founder name, or description."""
    term = f"%{q}%"
    results: list[dict] = []

    # Search dealflow entries
    entries = db.query(DealflowEntry).filter(
        or_(
            DealflowEntry.name.ilike(term),
            DealflowEntry.one_liner.ilike(term),
            DealflowEntry.notes.ilike(term),
        )
    ).limit(20).all()

    # Also find entries whose founders match
    founder_matches = db.query(DealflowFounder.dealflow_entry_id).filter(
        DealflowFounder.name.ilike(term)
    ).distinct().all()
    founder_entry_ids = {fm[0] for fm in founder_matches}

    extra_entries = []
    existing_ids = {e.id for e in entries}
    if founder_entry_ids - existing_ids:
        extra_entries = db.query(DealflowEntry).filter(
            DealflowEntry.id.in_(founder_entry_ids - existing_ids)
        ).all()

    all_entries = entries + extra_entries
    entry_ids = {e.id for e in all_entries}
    all_founders = db.query(DealflowFounder).filter(DealflowFounder.dealflow_entry_id.in_(entry_ids)).all() if entry_ids else []
    founders_map: dict[str, list[DealflowFounder]] = {}
    for f in all_founders:
        founders_map.setdefault(f.dealflow_entry_id, []).append(f)

    for e in all_entries:
        tps = _touchpoints_for(db, dealflow_entry_id=e.id)
        results.append(_dealflow_to_deal(e, founders_map.get(e.id, []), tps))

    # Search companies too
    companies = db.query(Company).filter(
        Company.deal_status != "portfolio",
        or_(Company.name.ilike(term), Company.one_liner.ilike(term)),
    ).limit(20).all()
    linked_df = {e.id for e in all_entries}
    for c in companies:
        if c.dealflow_entry_id and c.dealflow_entry_id in linked_df:
            continue
        tps = _touchpoints_for(db, company_id=c.id)
        results.append(_company_to_deal(c, tps, db))

    return results


@router.get("/deals/{deal_id}")
def get_deal(deal_id: str, db: Session = Depends(get_db)):
    """Get full details of a single deal."""
    # Try dealflow entry first
    entry = db.query(DealflowEntry).filter(DealflowEntry.id == deal_id).first()
    if entry:
        founders = db.query(DealflowFounder).filter(DealflowFounder.dealflow_entry_id == entry.id).all()
        tps = _touchpoints_for(db, dealflow_entry_id=entry.id)
        return _dealflow_to_deal(entry, founders, tps)

    # Try company (prefixed ids from list_deals)
    raw_company_id = deal_id.removeprefix("company-")
    company = db.query(Company).filter(Company.id == raw_company_id).first()
    if company:
        tps = _touchpoints_for(db, company_id=company.id)
        return _company_to_deal(company, tps, db)

    raise HTTPException(status_code=404, detail="Deal not found")


@router.patch("/deals/{deal_id}")
def update_deal_stage(deal_id: str, body: DealPatchBody, db: Session = Depends(get_db)):
    """Update a deal's pipeline stage (and optionally add a note)."""
    jarvis_status = COS_TO_JARVIS_STAGE.get(body.stage)
    if not jarvis_status:
        raise HTTPException(status_code=400, detail=f"Unknown stage: {body.stage}")

    # Try dealflow entry
    entry = db.query(DealflowEntry).filter(DealflowEntry.id == deal_id).first()
    if entry:
        entry.status = jarvis_status
        if body.note:
            db.add(Touchpoint(
                id=str(uuid.uuid4()),
                dealflow_entry_id=entry.id,
                type="note",
                source="cos_stage_change",
                title=f"Stage changed to {body.stage}",
                content=body.note,
                occurred_at=datetime.now(timezone.utc),
            ))
        db.commit()
        db.refresh(entry)
        founders = db.query(DealflowFounder).filter(DealflowFounder.dealflow_entry_id == entry.id).all()
        tps = _touchpoints_for(db, dealflow_entry_id=entry.id)
        return _dealflow_to_deal(entry, founders, tps)

    # Try company
    raw_company_id = deal_id.removeprefix("company-")
    company = db.query(Company).filter(Company.id == raw_company_id).first()
    if company:
        company_status_map = {"lead": "active", "reached_out": "active", "active": "active", "invested": "active", "passed": "passed"}
        company.deal_status = company_status_map.get(jarvis_status, "active")
        if body.note:
            db.add(Touchpoint(
                id=str(uuid.uuid4()),
                company_id=company.id,
                type="note",
                source="cos_stage_change",
                title=f"Stage changed to {body.stage}",
                content=body.note,
                occurred_at=datetime.now(timezone.utc),
            ))
        db.commit()
        db.refresh(company)
        tps = _touchpoints_for(db, company_id=company.id)
        return _company_to_deal(company, tps, db)

    raise HTTPException(status_code=404, detail="Deal not found")


@router.post("/deals/{deal_id}/notes")
def add_deal_note(deal_id: str, body: DealNoteBody, db: Session = Depends(get_db)):
    """Add a note to a deal. Maps to a Touchpoint with type=note."""
    # Resolve entity
    entry = db.query(DealflowEntry).filter(DealflowEntry.id == deal_id).first()
    if entry:
        tp = Touchpoint(
            id=str(uuid.uuid4()),
            dealflow_entry_id=entry.id,
            type="note",
            source=body.category,
            content=body.content,
            occurred_at=datetime.now(timezone.utc),
        )
        db.add(tp)
        db.commit()
        return _tp_to_note(tp)

    raw_company_id = deal_id.removeprefix("company-")
    company = db.query(Company).filter(Company.id == raw_company_id).first()
    if company:
        tp = Touchpoint(
            id=str(uuid.uuid4()),
            company_id=company.id,
            type="note",
            source=body.category,
            content=body.content,
            occurred_at=datetime.now(timezone.utc),
        )
        db.add(tp)
        db.commit()
        return _tp_to_note(tp)

    raise HTTPException(status_code=404, detail="Deal not found")


# ══════════════════════════════════════════════════════════════════════════════
#  PORTFOLIO
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/portfolio")
def list_portfolio(db: Session = Depends(get_db)):
    """List all portfolio companies."""
    snaps = db.query(PortfolioSnapshot).all()
    results = []
    for s in snaps:
        last_tp = (
            db.query(Touchpoint)
            .filter(Touchpoint.company_id == s.company_id)
            .order_by(Touchpoint.occurred_at.desc())
            .first()
        ) if s.company_id else None
        last_date = last_tp.occurred_at.isoformat()[:10] if last_tp and last_tp.occurred_at else None
        results.append(_portfolio_to_cos(s, last_date))
    return results


@router.get("/portfolio/{company_id}")
def get_portfolio_company(company_id: str, db: Session = Depends(get_db)):
    """Get detailed info about a portfolio company."""
    snap = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.id == company_id).first()
    if not snap:
        raise HTTPException(status_code=404, detail="Portfolio company not found")

    last_tp = None
    if snap.company_id:
        last_tp = (
            db.query(Touchpoint)
            .filter(Touchpoint.company_id == snap.company_id)
            .order_by(Touchpoint.occurred_at.desc())
            .first()
        )
    last_date = last_tp.occurred_at.isoformat()[:10] if last_tp and last_tp.occurred_at else None

    result = _portfolio_to_cos(snap, last_date)

    # Enrich with recent updates
    updates = (
        db.query(PortfolioUpdate)
        .filter(PortfolioUpdate.portfolio_snapshot_id == snap.id)
        .order_by(PortfolioUpdate.created_at.desc())
        .limit(10)
        .all()
    )
    result["recent_updates"] = [
        {"content": u.content, "source": u.source, "date": u.created_at.isoformat()[:10] if u.created_at else None}
        for u in updates
    ]
    return result


# ══════════════════════════════════════════════════════════════════════════════
#  CONTACTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/contacts/search")
def search_contacts(
    q: str = Query(..., min_length=1),
    type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Search contacts by name or email, optionally filtered by type."""
    term = f"%{q}%"
    query = db.query(NetworkContact).filter(
        or_(
            NetworkContact.name.ilike(term),
            NetworkContact.email.ilike(term),
            NetworkContact.company_name.ilike(term),
        )
    )

    if type and type != "all":
        if type == "lp":
            query = query.filter(
                or_(
                    NetworkContact.nev_fund_i_lp == True,
                    NetworkContact.nev_syndicate_lp == True,
                    NetworkContact.interested_lp == True,
                )
            )
        elif type == "co_investor":
            query = query.filter(NetworkContact.vc_firm_name.isnot(None))
        elif type == "founder":
            query = query.filter(NetworkContact.startup_name.isnot(None))

    contacts = query.limit(20).all()
    return [_contact_to_cos(c) for c in contacts]


@router.get("/contacts/{contact_id}")
def get_contact(contact_id: str, db: Session = Depends(get_db)):
    """Get full contact details including interaction history."""
    contact = db.query(NetworkContact).filter(NetworkContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    # Build interaction history from touchpoints where we can link via company
    # NetworkContact doesn't have a direct FK to touchpoints, so we search by
    # matching company_name or linked companies
    history: list[dict] = []
    # For now, return contact info without deep touchpoint linkage since
    # network_contacts don't directly FK to touchpoints
    return _contact_to_cos(contact, history)


# ══════════════════════════════════════════════════════════════════════════════
#  LPs
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/lps")
def list_lps(db: Session = Depends(get_db)):
    """List all LP contacts with commitment status."""
    contacts = db.query(NetworkContact).filter(
        or_(
            NetworkContact.nev_fund_i_lp == True,
            NetworkContact.nev_syndicate_lp == True,
            NetworkContact.interested_lp == True,
        )
    ).all()

    results = []
    for c in contacts:
        results.append(_contact_to_lp(c, None))
    return results


# ══════════════════════════════════════════════════════════════════════════════
#  INTERACTIONS (write)
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/interactions")
def log_interaction(body: InteractionBody, db: Session = Depends(get_db)):
    """Log an interaction with a contact. Creates a Touchpoint."""
    contact = db.query(NetworkContact).filter(NetworkContact.id == body.contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    try:
        occurred = datetime.fromisoformat(body.date)
    except ValueError:
        occurred = datetime.now(timezone.utc)

    tp = Touchpoint(
        id=str(uuid.uuid4()),
        type=body.type,
        source="cos",
        title=f"{body.type.capitalize()} with {contact.name}",
        summary=body.summary,
        content=body.follow_up or "",
        occurred_at=occurred,
    )
    db.add(tp)
    db.commit()

    return {
        "id": tp.id,
        "contact_id": body.contact_id,
        "type": tp.type,
        "date": tp.occurred_at.isoformat()[:10] if tp.occurred_at else None,
        "summary": tp.summary,
        "follow_up": body.follow_up,
        "created": True,
    }
