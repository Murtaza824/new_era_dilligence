"""Network contacts and introduction suggestions."""
import csv
import io
import logging
import re
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.company import Company
from app.models.contact_introduction_suggestion import ContactIntroductionSuggestion
from app.models.dealflow_entry import DealflowEntry
from app.models.network_contact import NetworkContact
from app.models.portfolio import PortfolioSnapshot
from app.models.user import User
from app.schemas.network import (
    IntroductionSuggestionOut,
    IntroductionSuggestionUpdate,
    NetworkContactCreate,
    NetworkContactOut,
    NetworkContactUpdate,
)
from app.services.matchmaking import (
    run_matchmaking_for_new_company,
    run_matchmaking_for_new_contact,
    run_matchmaking_for_portfolio_added,
)

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/network",
    tags=["network"],
    dependencies=[Depends(get_current_user)],
)


class RelationshipManagerOut(BaseModel):
    id: str
    email: str

    class Config:
        from_attributes = True


@router.get("/relationship-managers", response_model=list[RelationshipManagerOut])
def list_relationship_managers(db: Session = Depends(get_db)):
    """List GPs (relationship managers) for the add-contact dropdown."""
    users = db.query(User).order_by(User.email).all()
    return [RelationshipManagerOut(id=u.id, email=u.email) for u in users]


@router.post("/contacts", response_model=NetworkContactOut)
def create_contact(
    body: NetworkContactCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    added_by = current_user.id
    if body.added_by_user_id:
        other = db.query(User).filter(User.id == body.added_by_user_id).first()
        if other:
            added_by = other.id
    contact = NetworkContact(
        name=body.name,
        email=body.email,
        phone_number=body.phone_number,
        location=body.location,
        company_name=body.company_name,
        role_or_title=body.role_or_title,
        linkedin_url=body.linkedin_url,
        skills=body.skills,
        notes=body.notes,
        tags=body.tags,
        nev_fund_i_lp=body.nev_fund_i_lp or False,
        nev_syndicate_lp=body.nev_syndicate_lp or False,
        added_by_user_id=added_by,
        profile_pic_url=body.profile_pic_url,
        related_companies=body.related_companies,
        stage=body.stage,
        vc_firm_name=body.vc_firm_name,
        startup_name=body.startup_name,
        investor_check_size=body.investor_check_size,
        introductions_made=body.introductions_made,
        introduced_us_to=body.introduced_us_to,
        interested_lp=body.interested_lp or False,
        investor_in=body.investor_in,
        warm=body.warm or False,
        syndicate_member=body.syndicate_member or False,
        quarterly_update_list=body.quarterly_update_list or False,
        notes_2=body.notes_2,
        intros_made_for_us=body.intros_made_for_us or 0,
        intros_we_made=body.intros_we_made or 0,
        check_sizes=body.check_sizes,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    run_matchmaking_for_new_contact(contact.id, db, trigger="contact_added")
    return contact


# CSV column header -> NetworkContact field (case-insensitive match on first row)
CSV_COLUMN_MAP = {
    "name": "name",
    "full name": "name",
    "contact name": "name",
    "email": "email",
    "phone": "phone_number",
    "phone number": "phone_number",
    "mobile": "phone_number",
    "tel": "phone_number",
    "location": "location",
    "city": "location",
    "region": "location",
    "geography": "location",
    "company": "company_name",
    "company name": "company_name",
    "current company": "company_name",
    "organization": "company_name",
    "title": "role_or_title",
    "role": "role_or_title",
    "position": "role_or_title",
    "linkedin": "linkedin_url",
    "linkedin url": "linkedin_url",
    "linkedin_url": "linkedin_url",
    "skills": "skills",
    "skills / expertise / interests": "skills",
    "notes": "notes",
    "note": "notes",
    "tags": "tags",
    "tag": "tags",
    # Extended Airtable fields
    "profile pic": "profile_pic_url",
    "related companies (previous)": "related_companies",
    "stage": "stage",
    "vc firm name": "vc_firm_name",
    "startup name": "startup_name",
    "investor check size ($)": "investor_check_size",
    "introductions made": "introductions_made",
    "introduced us to (pipeline)": "introduced_us_to",
    "ne lp": "nev_fund_i_lp",
    "interested lp": "interested_lp",
    "investor in": "investor_in",
    "warm?": "warm",
    "syndicate member": "syndicate_member",
    "quarterly update list": "quarterly_update_list",
    "notes 2": "notes_2",
    "number of intros made for us": "intros_made_for_us",
    "number of intros we made": "intros_we_made",
    "check sizes": "check_sizes",
    # Relationship Manager is handled separately
    "relationship manager": "_relationship_manager",
}

_BOOLEAN_FIELDS = {
    "nev_fund_i_lp", "interested_lp", "warm",
    "syndicate_member", "quarterly_update_list",
}
_INTEGER_FIELDS = {"intros_made_for_us", "intros_we_made"}


def _parse_csv_value(field: str, raw: str) -> object:
    """Convert a raw CSV string to the appropriate Python type for the given field."""
    if field in _BOOLEAN_FIELDS:
        return raw.lower() in ("checked", "true", "yes", "1")
    if field in _INTEGER_FIELDS:
        try:
            return int(raw)
        except (ValueError, TypeError):
            return 0
    if field == "profile_pic_url":
        m = re.search(r"\((.+?)\)", raw)
        return m.group(1) if m else raw
    return raw


def _normalize_csv_row(headers: list[str], row: list[str], user_map: dict[str, str] | None = None) -> dict:
    """Map CSV row to dict of NetworkContact fields using CSV_COLUMN_MAP."""
    out: dict = {}
    for i, raw_header in enumerate(headers):
        if i >= len(row):
            break
        key = (raw_header or "").strip().lower()
        field = CSV_COLUMN_MAP.get(key)
        val = (row[i] or "").strip()
        if not field or not val:
            continue
        if field == "_relationship_manager":
            if user_map:
                resolved = user_map.get(val.lower())
                if resolved:
                    out["added_by_user_id"] = resolved
            continue
        out[field] = _parse_csv_value(field, val)
    return out


class ImportResultOut(BaseModel):
    imported: int
    skipped: int
    errors: list[str] = []


@router.post("/contacts/import", response_model=ImportResultOut)
def import_contacts_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Import network contacts from a CSV file. First row = headers.
    Columns are matched case-insensitively (e.g. name, email, phone, location, company, title, linkedin, skills, notes, tags).
    Rows without a name are skipped. Unstructured data is mapped into the corresponding fields.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload a CSV file")
    try:
        raw = file.file.read()
        text = raw.decode("utf-8-sig").strip()
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return ImportResultOut(imported=0, skipped=0, errors=["CSV is empty"])
    headers = [h.strip() for h in rows[0]]
    imported = 0
    skipped = 0
    errors = []
    added_by = current_user.id

    # Build name->user_id map for Relationship Manager resolution
    all_users = db.query(User).all()
    user_map: dict[str, str] = {}
    for u in all_users:
        user_map[u.email.lower()] = u.id
        name_part = u.email.split("@")[0].replace(".", " ").lower()
        user_map[name_part] = u.id

    for idx, row in enumerate(rows[1:], start=2):
        try:
            mapped = _normalize_csv_row(headers, row, user_map=user_map)
            name = (mapped.get("name") or "").strip() if isinstance(mapped.get("name"), str) else ""
            if not name:
                skipped += 1
                continue
            row_added_by = mapped.pop("added_by_user_id", None) or added_by
            contact = NetworkContact(
                name=name,
                email=mapped.get("email"),
                phone_number=mapped.get("phone_number"),
                location=mapped.get("location"),
                company_name=mapped.get("company_name"),
                role_or_title=mapped.get("role_or_title"),
                linkedin_url=mapped.get("linkedin_url"),
                skills=mapped.get("skills"),
                notes=mapped.get("notes"),
                tags=mapped.get("tags"),
                nev_fund_i_lp=mapped.get("nev_fund_i_lp", False),
                nev_syndicate_lp=mapped.get("nev_syndicate_lp", False),
                added_by_user_id=row_added_by,
                profile_pic_url=mapped.get("profile_pic_url"),
                related_companies=mapped.get("related_companies"),
                stage=mapped.get("stage"),
                vc_firm_name=mapped.get("vc_firm_name"),
                startup_name=mapped.get("startup_name"),
                investor_check_size=mapped.get("investor_check_size"),
                introductions_made=mapped.get("introductions_made"),
                introduced_us_to=mapped.get("introduced_us_to"),
                interested_lp=mapped.get("interested_lp", False),
                investor_in=mapped.get("investor_in"),
                warm=mapped.get("warm", False),
                syndicate_member=mapped.get("syndicate_member", False),
                quarterly_update_list=mapped.get("quarterly_update_list", False),
                notes_2=mapped.get("notes_2"),
                intros_made_for_us=mapped.get("intros_made_for_us", 0),
                intros_we_made=mapped.get("intros_we_made", 0),
                check_sizes=mapped.get("check_sizes"),
            )
            db.add(contact)
            db.flush()
            run_matchmaking_for_new_contact(contact.id, db, trigger="contact_added")
            imported += 1
        except Exception as e:
            errors.append(f"Row {idx}: {e}")
    db.commit()
    return ImportResultOut(imported=imported, skipped=skipped, errors=errors)


@router.get("/contacts", response_model=list[NetworkContactOut])
def list_contacts(
    db: Session = Depends(get_db),
    q: Optional[str] = Query(None, description="Search across all fields"),
    tags: Optional[str] = Query(None, description="Filter by tags (comma-separated)"),
    added_by: Optional[str] = Query(None, description="Filter by added_by_user_id"),
):
    query = db.query(NetworkContact)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                NetworkContact.name.ilike(term),
                NetworkContact.email.ilike(term),
                NetworkContact.company_name.ilike(term),
                NetworkContact.role_or_title.ilike(term),
                NetworkContact.linkedin_url.ilike(term),
                NetworkContact.phone_number.ilike(term),
                NetworkContact.location.ilike(term),
                NetworkContact.skills.ilike(term),
                NetworkContact.notes.ilike(term),
                NetworkContact.tags.ilike(term),
            )
        )
    if tags and tags.strip():
        tags_set = {t.strip().lower() for t in tags.split(",") if t.strip()}
        for tag in tags_set:
            query = query.filter(NetworkContact.tags.ilike(f"%{tag}%"))
    if added_by:
        query = query.filter(NetworkContact.added_by_user_id == added_by)
    contacts = query.order_by(NetworkContact.created_at.desc()).all()
    return list(contacts)


@router.get("/contacts/{contact_id}", response_model=NetworkContactOut)
def get_contact(contact_id: str, db: Session = Depends(get_db)):
    contact = db.query(NetworkContact).filter(NetworkContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.patch("/contacts/{contact_id}", response_model=NetworkContactOut)
def update_contact(
    contact_id: str,
    body: NetworkContactUpdate,
    db: Session = Depends(get_db),
):
    contact = db.query(NetworkContact).filter(NetworkContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(contact, field, value)
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/contacts/{contact_id}")
def delete_contact(contact_id: str, db: Session = Depends(get_db)):
    contact = db.query(NetworkContact).filter(NetworkContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(contact)
    db.commit()
    return {"ok": True}


def _enrich_suggestion(s: ContactIntroductionSuggestion, db: Session) -> dict:
    from app.models.tracked_person import TrackedPerson

    out = {
        "id": s.id,
        "network_contact_id": s.network_contact_id,
        "tracked_person_id": getattr(s, "tracked_person_id", None),
        "target_type": s.target_type,
        "target_company_id": s.target_company_id,
        "target_portfolio_id": s.target_portfolio_id,
        "target_dealflow_entry_id": getattr(s, "target_dealflow_entry_id", None),
        "introduction_type": s.introduction_type,
        "reason_summary": s.reason_summary,
        "status": s.status,
        "created_by_trigger": s.created_by_trigger,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
        "contact_name": None,
        "tracked_person_name": None,
        "target_company_name": None,
        "target_portfolio_name": None,
        "target_dealflow_entry_name": None,
    }
    if s.network_contact_id:
        contact = db.query(NetworkContact).filter(NetworkContact.id == s.network_contact_id).first()
        if contact:
            out["contact_name"] = contact.name
    if getattr(s, "tracked_person_id", None):
        tp = db.query(TrackedPerson).filter(TrackedPerson.id == s.tracked_person_id).first()
        if tp:
            out["tracked_person_name"] = tp.name
    if s.target_company_id:
        c = db.query(Company).filter(Company.id == s.target_company_id).first()
        if c:
            out["target_company_name"] = c.name
    if s.target_portfolio_id:
        p = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.id == s.target_portfolio_id).first()
        if p:
            out["target_portfolio_name"] = p.company_name
    if getattr(s, "target_dealflow_entry_id", None):
        d = db.query(DealflowEntry).filter(DealflowEntry.id == s.target_dealflow_entry_id).first()
        if d:
            out["target_dealflow_entry_name"] = d.name
    return out


@router.get("/suggestions", response_model=list[IntroductionSuggestionOut])
def list_suggestions(
    db: Session = Depends(get_db),
    status_filter: Optional[str] = Query(None, alias="status", description="suggested | introduced | dismissed"),
    target_type: Optional[str] = Query(None, description="company | portfolio | dealflow"),
    contact_id: Optional[str] = Query(None, description="Filter by network_contact_id"),
    company_id: Optional[str] = Query(None, description="Filter by target company"),
    portfolio_id: Optional[str] = Query(None, description="Filter by target portfolio"),
    dealflow_entry_id: Optional[str] = Query(None, description="Filter by target dealflow entry"),
    tracked_person_id: Optional[str] = Query(None, description="Filter by tracked person"),
):
    query = db.query(ContactIntroductionSuggestion)
    if status_filter:
        query = query.filter(ContactIntroductionSuggestion.status == status_filter)
    if target_type:
        query = query.filter(ContactIntroductionSuggestion.target_type == target_type)
    if contact_id:
        query = query.filter(ContactIntroductionSuggestion.network_contact_id == contact_id)
    if tracked_person_id:
        query = query.filter(ContactIntroductionSuggestion.tracked_person_id == tracked_person_id)
    if company_id:
        query = query.filter(ContactIntroductionSuggestion.target_company_id == company_id)
    if portfolio_id:
        query = query.filter(ContactIntroductionSuggestion.target_portfolio_id == portfolio_id)
    if dealflow_entry_id:
        query = query.filter(
            ContactIntroductionSuggestion.target_dealflow_entry_id == dealflow_entry_id
        )
    suggestions = query.order_by(ContactIntroductionSuggestion.created_at.desc()).all()
    return [_enrich_suggestion(s, db) for s in suggestions]


@router.get("/suggestions/{suggestion_id}", response_model=IntroductionSuggestionOut)
def get_suggestion(suggestion_id: str, db: Session = Depends(get_db)):
    s = db.query(ContactIntroductionSuggestion).filter(ContactIntroductionSuggestion.id == suggestion_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    return _enrich_suggestion(s, db)


@router.patch("/suggestions/{suggestion_id}", response_model=IntroductionSuggestionOut)
def update_suggestion(
    suggestion_id: str,
    body: IntroductionSuggestionUpdate,
    db: Session = Depends(get_db),
):
    s = db.query(ContactIntroductionSuggestion).filter(ContactIntroductionSuggestion.id == suggestion_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    if body.status not in ("introduced", "dismissed"):
        raise HTTPException(status_code=400, detail="status must be introduced or dismissed")
    s.status = body.status
    db.commit()
    db.refresh(s)
    return _enrich_suggestion(s, db)
