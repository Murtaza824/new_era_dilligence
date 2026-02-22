"""
Matchmaking: suggest introductions between network contacts and companies/portfolio/dealflow.
Runs on contact_added, company_created, portfolio_added, dealflow_entry_created/updated.
Uses the introduction agent for multi-factor matching; LLM-augmented reasons when available.
"""
import logging
import os
from typing import Optional

from sqlalchemy.orm import Session

from app.agents.introduction_agent import (
    contact_matches_customer_sales as intro_customer_sales,
    contact_matches_fundraising as intro_fundraising,
)
from app.models.company import Company
from app.models.contact_introduction_suggestion import ContactIntroductionSuggestion
from app.models.dealflow_entry import DealflowEntry
from app.models.network_contact import NetworkContact
from app.models.portfolio import PortfolioSnapshot
from app.models.tracked_person import TrackedPerson

logger = logging.getLogger(__name__)

USE_LLM_REASONS = bool(os.getenv("OPENAI_API_KEY"))


def _contact_matches_fundraising(contact: NetworkContact) -> bool:
    return intro_fundraising(
        contact.tags,
        role_or_title=contact.role_or_title,
        vc_firm_name=getattr(contact, "vc_firm_name", None),
        nev_fund_i_lp=contact.nev_fund_i_lp,
        nev_syndicate_lp=contact.nev_syndicate_lp,
        interested_lp=getattr(contact, "interested_lp", False),
    )


def _contact_matches_customer_sales(contact: NetworkContact) -> bool:
    return intro_customer_sales(
        contact.tags,
        role_or_title=contact.role_or_title,
        skills=getattr(contact, "skills", None),
    )


def _company_in_fundraising(company: Company) -> bool:
    return bool(company.amount_raising or (company.investment_stage and company.investment_stage.strip()))


def _dealflow_entry_in_fundraising(entry: DealflowEntry) -> bool:
    return bool(
        getattr(entry, "amount_raising", None)
        or (getattr(entry, "stage", None) and str(entry.stage).strip())
    )


def _suggestion_exists(
    db: Session,
    contact_id: Optional[str],
    target_company_id: Optional[str],
    target_portfolio_id: Optional[str],
    target_dealflow_entry_id: Optional[str] = None,
    tracked_person_id: Optional[str] = None,
) -> bool:
    q = db.query(ContactIntroductionSuggestion).filter(
        ContactIntroductionSuggestion.status == "suggested",
    )
    if contact_id:
        q = q.filter(ContactIntroductionSuggestion.network_contact_id == contact_id)
    if tracked_person_id:
        q = q.filter(ContactIntroductionSuggestion.tracked_person_id == tracked_person_id)
    if target_company_id:
        q = q.filter(ContactIntroductionSuggestion.target_company_id == target_company_id)
    if target_portfolio_id:
        q = q.filter(ContactIntroductionSuggestion.target_portfolio_id == target_portfolio_id)
    if target_dealflow_entry_id:
        q = q.filter(
            ContactIntroductionSuggestion.target_dealflow_entry_id == target_dealflow_entry_id
        )
    return q.first() is not None


def _enrich_reason(
    contact: NetworkContact,
    company_name: str,
    one_liner: Optional[str],
    introduction_type: str,
    fallback_reason: str,
) -> str:
    """Optionally call LLM insight agent for a richer intro reason."""
    if not USE_LLM_REASONS:
        return fallback_reason
    try:
        from app.agents.insight_agent import generate_intro_reason
        return generate_intro_reason(
            contact_name=contact.name,
            contact_role=contact.role_or_title,
            contact_tags=contact.tags,
            company_name=company_name,
            one_liner=one_liner,
            introduction_type=introduction_type,
        )
    except Exception as e:
        logger.warning("LLM intro reason failed, using fallback: %s", e)
        return fallback_reason


def _add_suggestion(
    db: Session,
    contact_id: Optional[str],
    target_type: str,
    introduction_type: str,
    reason_summary: str,
    trigger: str,
    target_company_id: Optional[str] = None,
    target_portfolio_id: Optional[str] = None,
    target_dealflow_entry_id: Optional[str] = None,
    tracked_person_id: Optional[str] = None,
) -> None:
    if _suggestion_exists(
        db, contact_id, target_company_id, target_portfolio_id,
        target_dealflow_entry_id, tracked_person_id=tracked_person_id,
    ):
        return
    row = ContactIntroductionSuggestion(
        network_contact_id=contact_id,
        tracked_person_id=tracked_person_id,
        target_type=target_type,
        target_company_id=target_company_id,
        target_portfolio_id=target_portfolio_id,
        target_dealflow_entry_id=target_dealflow_entry_id,
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

    # Dealflow entries (top-of-funnel companies)
    dealflow_entries = db.query(DealflowEntry).all()
    for entry in dealflow_entries:
        if _contact_matches_fundraising(contact) and _dealflow_entry_in_fundraising(entry):
            _add_suggestion(
                db,
                contact.id,
                "dealflow",
                "fundraising",
                f"Dealflow company {entry.name} ({entry.stage or 'stage TBD'}); contact is investor.",
                trigger,
                target_dealflow_entry_id=entry.id,
            )
            added += 1
        if _contact_matches_customer_sales(contact):
            _add_suggestion(
                db,
                contact.id,
                "dealflow",
                "customer_sales",
                f"Contact could be customer or channel for {entry.name}.",
                trigger,
                target_dealflow_entry_id=entry.id,
            )
            added += 1

    if added:
        db.commit()
    return added


def run_matchmaking_for_new_company(company_id: str, db: Session, trigger: str = "company_created") -> int:
    """After a company is created/promoted, suggest intros from network contacts and tracked persons."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return 0
    contacts = db.query(NetworkContact).all()
    added = 0
    one_liner = getattr(company, "one_liner", None)

    for contact in contacts:
        if _contact_matches_fundraising(contact) and _company_in_fundraising(company):
            fallback = f"Company raising ({company.investment_stage or 'stage TBD'}); contact is investor."
            reason = _enrich_reason(contact, company.name, one_liner, "fundraising", fallback)
            _add_suggestion(
                db,
                contact.id,
                "company",
                "fundraising",
                reason,
                trigger,
                target_company_id=company.id,
            )
            added += 1
        if _contact_matches_customer_sales(contact):
            fallback = f"Contact could be customer or channel for {company.name}."
            reason = _enrich_reason(contact, company.name, one_liner, "customer_sales", fallback)
            _add_suggestion(
                db,
                contact.id,
                "company",
                "customer_sales",
                reason,
                trigger,
                target_company_id=company.id,
            )
            added += 1

    # Also check tracked persons
    added += _match_tracked_persons_to_company(db, company, trigger)

    if added:
        db.commit()
    return added


def run_matchmaking_for_dealflow_entry(
    entry_id: str, db: Session, trigger: str = "dealflow_entry_created"
) -> int:
    """After a dealflow entry is created/updated, suggest intros from network and tracked persons."""
    entry = db.query(DealflowEntry).filter(DealflowEntry.id == entry_id).first()
    if not entry:
        return 0
    contacts = db.query(NetworkContact).all()
    added = 0
    one_liner = getattr(entry, "one_liner", None)

    for contact in contacts:
        if _contact_matches_fundraising(contact) and _dealflow_entry_in_fundraising(entry):
            fallback = (
                f"Dealflow company ({entry.stage or 'stage TBD'}); contact is investor."
            )
            reason = _enrich_reason(
                contact, entry.name, one_liner, "fundraising", fallback
            )
            _add_suggestion(
                db,
                contact.id,
                "dealflow",
                "fundraising",
                reason,
                trigger,
                target_dealflow_entry_id=entry.id,
            )
            added += 1
        if _contact_matches_customer_sales(contact):
            fallback = f"Contact could be customer or channel for {entry.name}."
            reason = _enrich_reason(
                contact, entry.name, one_liner, "customer_sales", fallback
            )
            _add_suggestion(
                db,
                contact.id,
                "dealflow",
                "customer_sales",
                reason,
                trigger,
                target_dealflow_entry_id=entry.id,
            )
            added += 1

    # Also check tracked persons
    added += _match_tracked_persons_to_dealflow(db, entry, trigger)

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

    # Also check tracked persons
    added += _match_tracked_persons_to_portfolio(db, snap, trigger)

    if added:
        db.commit()
    return added


# ---------------------------------------------------------------------------
# Tracked-person matchmaking helpers
# ---------------------------------------------------------------------------

def _tracked_person_matches_fundraising(person: TrackedPerson) -> bool:
    """Heuristic: a tracked person might match fundraising if their notes or source hint at investing."""
    notes = (person.notes or "").lower()
    source = (person.source or "").lower()
    investor_terms = {"investor", "lp", "angel", "vc", "fund", "capital"}
    combined = f"{notes} {source}"
    return any(t in combined for t in investor_terms)


def _tracked_person_matches_customer_sales(person: TrackedPerson) -> bool:
    notes = (person.notes or "").lower()
    source = (person.source or "").lower()
    sales_terms = {"operator", "buyer", "enterprise", "sales", "bd", "customer"}
    combined = f"{notes} {source}"
    return any(t in combined for t in sales_terms)


def _match_tracked_persons_to_company(db: Session, company: Company, trigger: str) -> int:
    persons = db.query(TrackedPerson).all()
    added = 0
    for p in persons:
        if _tracked_person_matches_fundraising(p) and _company_in_fundraising(company):
            _add_suggestion(
                db, None, "company", "fundraising",
                f"Tracked person {p.name} may be investor; company raising.",
                trigger, target_company_id=company.id, tracked_person_id=p.id,
            )
            added += 1
        if _tracked_person_matches_customer_sales(p):
            _add_suggestion(
                db, None, "company", "customer_sales",
                f"Tracked person {p.name} could be customer/channel for {company.name}.",
                trigger, target_company_id=company.id, tracked_person_id=p.id,
            )
            added += 1
    return added


def _match_tracked_persons_to_dealflow(db: Session, entry: DealflowEntry, trigger: str) -> int:
    persons = db.query(TrackedPerson).all()
    added = 0
    for p in persons:
        if _tracked_person_matches_fundraising(p) and _dealflow_entry_in_fundraising(entry):
            _add_suggestion(
                db, None, "dealflow", "fundraising",
                f"Tracked person {p.name} may be investor; dealflow {entry.name} is raising.",
                trigger, target_dealflow_entry_id=entry.id, tracked_person_id=p.id,
            )
            added += 1
        if _tracked_person_matches_customer_sales(p):
            _add_suggestion(
                db, None, "dealflow", "customer_sales",
                f"Tracked person {p.name} could be customer/channel for {entry.name}.",
                trigger, target_dealflow_entry_id=entry.id, tracked_person_id=p.id,
            )
            added += 1
    return added


def _match_tracked_persons_to_portfolio(db: Session, snap: PortfolioSnapshot, trigger: str) -> int:
    persons = db.query(TrackedPerson).all()
    added = 0
    for p in persons:
        if _tracked_person_matches_fundraising(p) and (snap.entry_valuation or snap.investment_stage):
            _add_suggestion(
                db, None, "portfolio", "fundraising",
                f"Tracked person {p.name} may be investor; portfolio {snap.company_name}.",
                trigger, target_portfolio_id=snap.id, tracked_person_id=p.id,
            )
            added += 1
        if _tracked_person_matches_customer_sales(p):
            _add_suggestion(
                db, None, "portfolio", "customer_sales",
                f"Tracked person {p.name} could be customer/channel for {snap.company_name}.",
                trigger, target_portfolio_id=snap.id, tracked_person_id=p.id,
            )
            added += 1
    return added


def run_matchmaking_for_tracked_person(
    person_id: str, db: Session, trigger: str = "tracked_person_added"
) -> int:
    """After a tracked person is added/updated, suggest intros to companies, portfolio, dealflow."""
    person = db.query(TrackedPerson).filter(TrackedPerson.id == person_id).first()
    if not person:
        return 0
    added = 0

    companies = db.query(Company).all()
    for c in companies:
        if _tracked_person_matches_fundraising(person) and _company_in_fundraising(c):
            _add_suggestion(
                db, None, "company", "fundraising",
                f"Tracked person {person.name} may be investor; company raising ({c.investment_stage or 'TBD'}).",
                trigger, target_company_id=c.id, tracked_person_id=person.id,
            )
            added += 1
        if _tracked_person_matches_customer_sales(person):
            _add_suggestion(
                db, None, "company", "customer_sales",
                f"Tracked person {person.name} could be customer/channel for {c.name}.",
                trigger, target_company_id=c.id, tracked_person_id=person.id,
            )
            added += 1

    portfolio = db.query(PortfolioSnapshot).all()
    for snap in portfolio:
        if _tracked_person_matches_fundraising(person) and (snap.entry_valuation or snap.investment_stage):
            _add_suggestion(
                db, None, "portfolio", "fundraising",
                f"Tracked person {person.name} may be investor; portfolio {snap.company_name}.",
                trigger, target_portfolio_id=snap.id, tracked_person_id=person.id,
            )
            added += 1
        if _tracked_person_matches_customer_sales(person):
            _add_suggestion(
                db, None, "portfolio", "customer_sales",
                f"Tracked person {person.name} could be customer/channel for {snap.company_name}.",
                trigger, target_portfolio_id=snap.id, tracked_person_id=person.id,
            )
            added += 1

    entries = db.query(DealflowEntry).all()
    for entry in entries:
        if _tracked_person_matches_fundraising(person) and _dealflow_entry_in_fundraising(entry):
            _add_suggestion(
                db, None, "dealflow", "fundraising",
                f"Tracked person {person.name} may be investor; dealflow {entry.name} raising.",
                trigger, target_dealflow_entry_id=entry.id, tracked_person_id=person.id,
            )
            added += 1
        if _tracked_person_matches_customer_sales(person):
            _add_suggestion(
                db, None, "dealflow", "customer_sales",
                f"Tracked person {person.name} could be customer/channel for {entry.name}.",
                trigger, target_dealflow_entry_id=entry.id, tracked_person_id=person.id,
            )
            added += 1

    if added:
        db.commit()
    return added
