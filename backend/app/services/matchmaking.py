"""
Matchmaking: suggest introductions between network contacts and companies/portfolio.
Runs on contact_added, company_created, portfolio_added.
"""
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.contact_introduction_suggestion import ContactIntroductionSuggestion
from app.models.network_contact import NetworkContact
from app.models.portfolio import PortfolioSnapshot

logger = logging.getLogger(__name__)

FUNDRAISING_TAGS = ("lp", "angel", "investor")
CUSTOMER_SALES_TAGS = ("operator", "bd", "buyer")
PARTNERSHIP_TAGS = ("partner", "partnership")


def _normalize_tags(tags: Optional[str]) -> set[str]:
    if not tags:
        return set()
    return {t.strip().lower() for t in tags.split(",") if t.strip()}


def _contact_matches_fundraising(contact: NetworkContact) -> bool:
    t = _normalize_tags(contact.tags)
    return bool(t & set(FUNDRAISING_TAGS))


def _contact_matches_customer_sales(contact: NetworkContact) -> bool:
    t = _normalize_tags(contact.tags)
    return bool(t & set(CUSTOMER_SALES_TAGS))


def _company_in_fundraising(company: Company) -> bool:
    return bool(company.amount_raising or (company.investment_stage and company.investment_stage.strip()))


def _suggestion_exists(
    db: Session,
    contact_id: str,
    target_company_id: Optional[str],
    target_portfolio_id: Optional[str],
) -> bool:
    q = db.query(ContactIntroductionSuggestion).filter(
        ContactIntroductionSuggestion.network_contact_id == contact_id,
        ContactIntroductionSuggestion.status == "suggested",
    )
    if target_company_id:
        q = q.filter(ContactIntroductionSuggestion.target_company_id == target_company_id)
    if target_portfolio_id:
        q = q.filter(ContactIntroductionSuggestion.target_portfolio_id == target_portfolio_id)
    return q.first() is not None


def _add_suggestion(
    db: Session,
    contact_id: str,
    target_type: str,
    introduction_type: str,
    reason_summary: str,
    trigger: str,
    target_company_id: Optional[str] = None,
    target_portfolio_id: Optional[str] = None,
) -> None:
    if _suggestion_exists(db, contact_id, target_company_id, target_portfolio_id):
        return
    row = ContactIntroductionSuggestion(
        network_contact_id=contact_id,
        target_type=target_type,
        target_company_id=target_company_id,
        target_portfolio_id=target_portfolio_id,
        introduction_type=introduction_type,
        reason_summary=reason_summary,
        status="suggested",
        created_by_trigger=trigger,
    )
    db.add(row)


def run_matchmaking_for_new_contact(contact_id: str, db: Session, trigger: str = "contact_added") -> int:
    """After a contact is added, suggest intros to companies (pipeline) and portfolio."""
    contact = db.query(NetworkContact).filter(NetworkContact.id == contact_id).first()
    if not contact:
        return 0
    added = 0

    # Companies in pipeline (have deal context or are in DB)
    companies = db.query(Company).all()
    for c in companies:
        if _contact_matches_fundraising(contact) and _company_in_fundraising(c):
            _add_suggestion(
                db,
                contact.id,
                "company",
                "fundraising",
                f"Company raising ({c.investment_stage or 'stage TBD'}); contact is investor.",
                trigger,
                target_company_id=c.id,
            )
            added += 1
        if _contact_matches_customer_sales(contact):
            _add_suggestion(
                db,
                contact.id,
                "company",
                "customer_sales",
                f"Contact could be customer or channel for {c.name}.",
                trigger,
                target_company_id=c.id,
            )
            added += 1

    # Portfolio
    portfolio = db.query(PortfolioSnapshot).all()
    for p in portfolio:
        if _contact_matches_fundraising(contact) and (p.entry_valuation or p.investment_stage):
            _add_suggestion(
                db,
                contact.id,
                "portfolio",
                "fundraising",
                f"Portfolio company {p.company_name}; contact is investor.",
                trigger,
                target_portfolio_id=p.id,
            )
            added += 1
        if _contact_matches_customer_sales(contact):
            _add_suggestion(
                db,
                contact.id,
                "portfolio",
                "customer_sales",
                f"Contact could be customer or channel for portfolio company {p.company_name}.",
                trigger,
                target_portfolio_id=p.id,
            )
            added += 1

    if added:
        db.commit()
    return added


def run_matchmaking_for_new_company(company_id: str, db: Session, trigger: str = "company_created") -> int:
    """After a company is created, suggest intros from network contacts to this company."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return 0
    contacts = db.query(NetworkContact).all()
    added = 0

    for contact in contacts:
        if _contact_matches_fundraising(contact) and _company_in_fundraising(company):
            _add_suggestion(
                db,
                contact.id,
                "company",
                "fundraising",
                f"Company raising ({company.investment_stage or 'stage TBD'}); contact is investor.",
                trigger,
                target_company_id=company.id,
            )
            added += 1
        if _contact_matches_customer_sales(contact):
            _add_suggestion(
                db,
                contact.id,
                "company",
                "customer_sales",
                f"Contact could be customer or channel for {company.name}.",
                trigger,
                target_company_id=company.id,
            )
            added += 1

    if added:
        db.commit()
    return added


def run_matchmaking_for_portfolio_added(portfolio_id: str, db: Session, trigger: str = "portfolio_added") -> int:
    """After a company is added to portfolio, suggest intros from network to this portfolio entry."""
    snap = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.id == portfolio_id).first()
    if not snap:
        return 0
    contacts = db.query(NetworkContact).all()
    added = 0

    for contact in contacts:
        if _contact_matches_fundraising(contact) and (snap.entry_valuation or snap.investment_stage):
            _add_suggestion(
                db,
                contact.id,
                "portfolio",
                "fundraising",
                f"Portfolio company {snap.company_name}; contact is investor.",
                trigger,
                target_portfolio_id=snap.id,
            )
            added += 1
        if _contact_matches_customer_sales(contact):
            _add_suggestion(
                db,
                contact.id,
                "portfolio",
                "customer_sales",
                f"Contact could be customer or channel for portfolio company {snap.company_name}.",
                trigger,
                target_portfolio_id=snap.id,
            )
            added += 1

    if added:
        db.commit()
    return added
