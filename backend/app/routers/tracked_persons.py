"""Tracked persons: people being tracked alongside dealflow companies."""
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import SessionLocal, get_db
from app.models.dealflow_entry import DealflowEntry
from app.models.network_contact import NetworkContact
from app.models.tracked_person import TrackedPerson
from app.models.user import User
from app.schemas.tracked_person import TrackedPersonCreate, TrackedPersonOut, TrackedPersonUpdate

router = APIRouter(prefix="/tracked-persons", tags=["tracked-persons"])


def _person_to_out(person: TrackedPerson, db: Session) -> TrackedPersonOut:
    data = {
        "id": person.id,
        "name": person.name,
        "linkedin_url": person.linkedin_url,
        "notes": person.notes,
        "source": person.source,
        "dealflow_entry_id": person.dealflow_entry_id,
        "added_by_user_id": person.added_by_user_id,
        "created_at": person.created_at,
        "updated_at": person.updated_at,
        "dealflow_entry_name": None,
    }
    if person.dealflow_entry_id:
        entry = db.query(DealflowEntry).filter(DealflowEntry.id == person.dealflow_entry_id).first()
        if entry:
            data["dealflow_entry_name"] = entry.name
    return TrackedPersonOut(**data)


def _run_matchmaking_background(person_id: str, trigger: str) -> None:
    from app.services.matchmaking import run_matchmaking_for_tracked_person

    db = SessionLocal()
    try:
        run_matchmaking_for_tracked_person(person_id, db, trigger=trigger)
    finally:
        db.close()


@router.post("", response_model=TrackedPersonOut)
def create_person(
    body: TrackedPersonCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    person = TrackedPerson(
        name=body.name,
        linkedin_url=body.linkedin_url,
        notes=body.notes,
        source=body.source,
        dealflow_entry_id=body.dealflow_entry_id,
        added_by_user_id=current_user.id,
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    background_tasks.add_task(_run_matchmaking_background, person.id, "tracked_person_added")
    return _person_to_out(person, db)


@router.get("", response_model=list[TrackedPersonOut])
def list_persons(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
    q: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    dealflow_entry_id: Optional[str] = Query(None),
):
    query = db.query(TrackedPerson).order_by(TrackedPerson.created_at.desc())
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                TrackedPerson.name.ilike(term),
                TrackedPerson.notes.ilike(term),
                TrackedPerson.linkedin_url.ilike(term),
            )
        )
    if source:
        query = query.filter(TrackedPerson.source == source.strip())
    if dealflow_entry_id:
        query = query.filter(TrackedPerson.dealflow_entry_id == dealflow_entry_id)
    persons = query.all()
    return [_person_to_out(p, db) for p in persons]


@router.get("/{person_id}", response_model=TrackedPersonOut)
def get_person(
    person_id: str,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return _person_to_out(person, db)


@router.patch("/{person_id}", response_model=TrackedPersonOut)
def update_person(
    person_id: str,
    body: TrackedPersonUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(person, field, value)
    db.commit()
    db.refresh(person)
    background_tasks.add_task(_run_matchmaking_background, person.id, "tracked_person_updated")
    return _person_to_out(person, db)


@router.delete("/{person_id}")
def delete_person(
    person_id: str,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    from app.models.contact_introduction_suggestion import ContactIntroductionSuggestion

    db.query(ContactIntroductionSuggestion).filter(
        ContactIntroductionSuggestion.tracked_person_id == person_id
    ).delete()
    db.delete(person)
    db.commit()
    return {"ok": True}


@router.post("/{person_id}/promote-to-contact")
def promote_to_contact(
    person_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    contact = NetworkContact(
        name=person.name,
        linkedin_url=person.linkedin_url,
        notes=person.notes,
        tags=person.source or None,
        added_by_user_id=current_user.id,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return {"contact_id": contact.id, "message": f"Created network contact for {person.name}"}
