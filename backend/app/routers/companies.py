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
from app.schemas.company import CompanyCreate, CompanyOut, CompanyUpdate, DealSuggestions
from app.schemas.portfolio import PortfolioSnapshotOut

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/companies",
    tags=["companies"],
    dependencies=[Depends(get_current_user)],
)


@router.post("", response_model=CompanyOut)
def create_company(body: CompanyCreate, db: Session = Depends(get_db)):
    company = Company(name=body.name, website=body.website)
    db.add(company)
    db.commit()
    db.refresh(company)
    if body.website and body.website.strip():
        try:
            from app.services.logo import resolve_logo_url
            logo_url = resolve_logo_url(body.website.strip())
            if logo_url:
                company.logo_url = logo_url
                db.commit()
                db.refresh(company)
        except Exception as e:
            logger.warning("Logo resolution on company create failed: %s", e)
    try:
        from app.services.matchmaking import run_matchmaking_for_new_company
        run_matchmaking_for_new_company(company.id, db, trigger="company_created")
    except Exception as e:
        logger.warning("Matchmaking after company create failed: %s", e)
    return _enrich(company, db)


@router.get("", response_model=list[CompanyOut])
def list_companies(db: Session = Depends(get_db)):
    companies = db.query(Company).order_by(Company.created_at.desc()).all()
    return [_enrich(c, db) for c in companies]


@router.post("/update/{company_id}", response_model=CompanyOut)
def update_company_post(
    company_id: str,
    body: CompanyUpdate,
    db: Session = Depends(get_db),
):
    """Update company (POST). Used by Deal Terms and other clients."""
    return _do_update_company(company_id, body, db)


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
    try:
        from app.services.matchmaking import run_matchmaking_for_portfolio_added
        run_matchmaking_for_portfolio_added(snap.id, db, trigger="portfolio_added")
    except Exception as e:
        logger.warning("Matchmaking after portfolio add failed: %s", e)
    return snap


def _do_update_company(company_id: str, body: CompanyUpdate, db: Session) -> dict:
    """Shared logic for PATCH and POST update."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return _enrich(company, db)


@router.patch("/{company_id}", response_model=CompanyOut)
def update_company(
    company_id: str,
    body: CompanyUpdate,
    db: Session = Depends(get_db),
):
    """Update company fields (e.g. name, logo_url, deal terms)."""
    return _do_update_company(company_id, body, db)


@router.post("/{company_id}/deal-suggestions/from-documents", response_model=DealSuggestions)
def suggest_deal_from_documents(company_id: str, db: Session = Depends(get_db)):
    """Use RAG + LLM to extract suggested deal fields from the company's documents."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    from app.agents.deal_extractor import suggest_from_documents
    result = suggest_from_documents(company_id)
    return DealSuggestions(**result)


@router.post("/{company_id}/deal-suggestions/from-web", response_model=DealSuggestions)
def suggest_deal_from_web(company_id: str, db: Session = Depends(get_db)):
    """Fetch the company's website (from latest website doc) and extract deal suggestions from the page."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    latest_website = (
        db.query(Document)
        .filter(Document.company_id == company_id, Document.type == "website", Document.url.isnot(None))
        .order_by(Document.created_at.desc())
        .first()
    )
    if not latest_website or not latest_website.url:
        return DealSuggestions(entry_valuation=None, amount_raising=None, investment_stage=None)
    try:
        import httpx
        from bs4 import BeautifulSoup
        resp = httpx.get(latest_website.url, follow_redirects=True, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
    except Exception as e:
        logger.warning("Failed to fetch website for deal suggestions: %s", e)
        return DealSuggestions(entry_valuation=None, amount_raising=None, investment_stage=None)
    from app.agents.deal_extractor import suggest_from_web_page
    result = suggest_from_web_page(text, company.name)
    return DealSuggestions(**result)


@router.post("/{company_id}/refresh-logo", response_model=CompanyOut)
def refresh_company_logo(company_id: str, db: Session = Depends(get_db)):
    """Re-resolve logo from the company's website or latest website document URL."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    url_to_use = None
    if company.website and company.website.strip():
        url_to_use = company.website.strip()
    if not url_to_use:
        latest_website = (
            db.query(Document)
            .filter(Document.company_id == company_id, Document.type == "website", Document.url.isnot(None))
            .order_by(Document.created_at.desc())
            .first()
        )
        if latest_website and latest_website.url:
            url_to_use = latest_website.url
    if not url_to_use:
        return _enrich(company, db)
    from app.services.logo import resolve_logo_url
    logo_url = resolve_logo_url(url_to_use)
    if logo_url:
        company.logo_url = logo_url
        db.commit()
        db.refresh(company)
    return _enrich(company, db)


@router.get("/{company_id}/insights")
def get_company_insights(company_id: str, db: Session = Depends(get_db)):
    """Fetch current events / news insights for a company using the insight agent."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    from app.agents.insight_agent import fetch_company_insights
    return fetch_company_insights(
        company_name=company.name,
        one_liner=company.one_liner,
        sector=company.investment_stage,
    )


def _enrich(company: Company, db: Session) -> dict:
    """Add computed fields (document_count, has_memo, dealflow_founders) to company response."""
    doc_count = db.query(Document).filter(Document.company_id == company.id).count()
    has_memo = db.query(Memo).filter(Memo.company_id == company.id).first() is not None

    founders = []
    if company.dealflow_entry_id:
        from app.models.dealflow_founder import DealflowFounder
        founders = [
            {
                "id": f.id,
                "name": f.name,
                "linkedin_url": f.linkedin_url,
                "twitter_url": f.twitter_url,
                "email": f.email,
            }
            for f in db.query(DealflowFounder)
            .filter(DealflowFounder.dealflow_entry_id == company.dealflow_entry_id)
            .all()
        ]

    return {
        "id": company.id,
        "name": company.name,
        "website": company.website,
        "logo_url": company.logo_url,
        "entry_valuation": company.entry_valuation,
        "amount_raising": company.amount_raising,
        "investment_stage": company.investment_stage,
        "one_liner": company.one_liner,
        "location": company.location,
        "notes": company.notes,
        "source_type": company.source_type,
        "source_detail": company.source_detail,
        "company_linkedin_url": company.company_linkedin_url,
        "created_at": company.created_at,
        "updated_at": company.updated_at,
        "document_count": doc_count,
        "has_memo": has_memo,
        "dealflow_founders": founders,
    }
