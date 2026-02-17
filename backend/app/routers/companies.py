"""Company CRUD router."""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.company import Company
from app.models.document import Document
from app.models.memo import Memo
from app.models.simulation import SimulationRun
from app.models.portfolio import PortfolioSnapshot
from app.schemas.company import CompanyCreate, CompanyOut
from app.schemas.portfolio import PortfolioSnapshotOut

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/companies",
    tags=["companies"],
    dependencies=[Depends(get_current_user)],
)


@router.post("", response_model=CompanyOut)
def create_company(body: CompanyCreate, db: Session = Depends(get_db)):
    company = Company(name=body.name)
    db.add(company)
    db.commit()
    db.refresh(company)
    return _enrich(company, db)


@router.get("", response_model=list[CompanyOut])
def list_companies(db: Session = Depends(get_db)):
    companies = db.query(Company).order_by(Company.created_at.desc()).all()
    return [_enrich(c, db) for c in companies]


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(company_id: str, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return _enrich(company, db)


@router.delete("/{company_id}")
def delete_company(company_id: str, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    db.delete(company)
    db.commit()
    return {"ok": True}


@router.post("/{company_id}/add-to-portfolio", response_model=PortfolioSnapshotOut)
def add_to_portfolio(company_id: str, db: Session = Depends(get_db)):
    """Add a diligence company to the portfolio, pulling in available data."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Check if already in portfolio
    existing = (
        db.query(PortfolioSnapshot)
        .filter(PortfolioSnapshot.company_id == company_id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409, detail="Company is already in the portfolio"
        )

    # Try to pull data from the most recent simulation
    entry_valuation = None
    investment_size = None
    ownership_pct = None

    latest_sim = (
        db.query(SimulationRun)
        .filter(SimulationRun.company_id == company_id)
        .order_by(SimulationRun.created_at.desc())
        .first()
    )
    if latest_sim and latest_sim.inputs_json:
        try:
            inputs = json.loads(latest_sim.inputs_json)
            entry_valuation = inputs.get("entry_valuation")
            investment_size = inputs.get("check_size")
            ownership_pct = inputs.get("ownership_pct")
        except (json.JSONDecodeError, TypeError):
            pass

    snap = PortfolioSnapshot(
        company_id=company_id,
        company_name=company.name,
        entry_valuation=entry_valuation,
        investment_size=investment_size,
        ownership_pct=ownership_pct,
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return snap


def _enrich(company: Company, db: Session) -> dict:
    """Add computed fields (document_count, has_memo) to company response."""
    doc_count = db.query(Document).filter(Document.company_id == company.id).count()
    has_memo = db.query(Memo).filter(Memo.company_id == company.id).first() is not None
    return {
        "id": company.id,
        "name": company.name,
        "created_at": company.created_at,
        "updated_at": company.updated_at,
        "document_count": doc_count,
        "has_memo": has_memo,
    }
