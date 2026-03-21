"""Locations: a user-managed suggestion list for the location filter."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.location import Location

router = APIRouter(
    prefix="/locations",
    tags=["locations"],
    dependencies=[Depends(get_current_user)],
)


class LocationOut(BaseModel):
    id: str
    name: str

    model_config = {"from_attributes": True}


class LocationCreate(BaseModel):
    name: str


@router.get("", response_model=list[LocationOut])
def list_locations(db: Session = Depends(get_db)):
    return db.query(Location).order_by(Location.name).all()


@router.post("", response_model=LocationOut)
def create_location(body: LocationCreate, db: Session = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    existing = db.query(Location).filter(Location.name == name).first()
    if existing:
        return existing
    loc = Location(name=name)
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


@router.delete("/{location_id}")
def delete_location(location_id: str, db: Session = Depends(get_db)):
    loc = db.query(Location).filter(Location.id == location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    db.delete(loc)
    db.commit()
    return {"ok": True}
