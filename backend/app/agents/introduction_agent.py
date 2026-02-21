"""
Introduction agent: suggests the most relevant intros for portfolio companies
and dealflow based on multiple factors (tags, skills, stage, role, warm status, etc.).
Used by matchmaking to decide which contact↔company/portfolio/dealflow intros to suggest.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Tag sets for intro types (aligned with matchmaking)
FUNDRAISING_TAGS = {"lp", "angel", "investor"}
CUSTOMER_SALES_TAGS = {"operator", "bd", "buyer"}
PARTNERSHIP_TAGS = {"partner", "partnership"}


def _normalize_tags(tags: Optional[str]) -> set[str]:
    if not tags:
        return set()
    return {t.strip().lower() for t in tags.split(",") if t.strip()}


def _normalize_skills(skills: Optional[str]) -> set[str]:
    if not skills:
        return set()
    return {s.strip().lower() for s in skills.split(",") if s.strip()}


def contact_matches_fundraising(
    tags: Optional[str],
    role_or_title: Optional[str] = None,
    vc_firm_name: Optional[str] = None,
    nev_fund_i_lp: bool = False,
    nev_syndicate_lp: bool = False,
    interested_lp: bool = False,
) -> bool:
    """True if contact is a good fit for fundraising intros (investor/LP angle)."""
    t = _normalize_tags(tags)
    if t & FUNDRAISING_TAGS:
        return True
    if vc_firm_name and str(vc_firm_name).strip():
        return True
    if nev_fund_i_lp or nev_syndicate_lp or interested_lp:
        return True
    if role_or_title:
        r = role_or_title.lower()
        if "investor" in r or "lp" in r or "vc" in r or "venture" in r or "partner" in r:
            return True
    return False


def contact_matches_customer_sales(
    tags: Optional[str],
    role_or_title: Optional[str] = None,
    skills: Optional[str] = None,
) -> bool:
    """True if contact is a good fit for customer/sales intros (operator, BD, buyer)."""
    t = _normalize_tags(tags)
    if t & CUSTOMER_SALES_TAGS:
        return True
    if t & PARTNERSHIP_TAGS:
        return True
    if role_or_title:
        r = role_or_title.lower()
        if "operator" in r or "bd" in r or "business development" in r or "customer" in r:
            return True
    if skills:
        s = _normalize_skills(skills)
        if any(k in " ".join(s) for k in ("sales", "business development", "operator")):
            return True
    return False


def contact_matches_partnership(tags: Optional[str], role_or_title: Optional[str] = None) -> bool:
    """True if contact is a good fit for partnership intros."""
    t = _normalize_tags(tags)
    if t & PARTNERSHIP_TAGS:
        return True
    if role_or_title and "partner" in role_or_title.lower():
        return True
    return False


def target_in_fundraising(
    stage: Optional[str] = None,
    amount_raising: Optional[float] = None,
    investment_stage: Optional[str] = None,
) -> bool:
    """True if company/portfolio/dealflow entry is in fundraising mode."""
    if amount_raising is not None and amount_raising > 0:
        return True
    if stage and str(stage).strip():
        return True
    if investment_stage and str(investment_stage).strip():
        return True
    return False


def should_suggest_intro(
    introduction_type: str,
    contact_tags: Optional[str],
    contact_role: Optional[str] = None,
    contact_skills: Optional[str] = None,
    contact_vc_firm: Optional[str] = None,
    contact_nev_fund_i_lp: bool = False,
    contact_nev_syndicate_lp: bool = False,
    contact_interested_lp: bool = False,
    target_stage: Optional[str] = None,
    target_amount_raising: Optional[float] = None,
    target_investment_stage: Optional[str] = None,
) -> bool:
    """
    Decide whether to suggest this intro based on multiple factors.
    Used by matchmaking to stay consistent with the introduction agent.
    """
    if introduction_type == "fundraising":
        return contact_matches_fundraising(
            contact_tags,
            role_or_title=contact_role,
            vc_firm_name=contact_vc_firm,
            nev_fund_i_lp=contact_nev_fund_i_lp,
            nev_syndicate_lp=contact_nev_syndicate_lp,
            interested_lp=contact_interested_lp,
        ) and target_in_fundraising(
            stage=target_stage,
            amount_raising=target_amount_raising,
            investment_stage=target_investment_stage,
        )
    if introduction_type == "customer_sales":
        return contact_matches_customer_sales(
            contact_tags,
            role_or_title=contact_role,
            skills=contact_skills,
        )
    if introduction_type == "partnership":
        return contact_matches_partnership(contact_tags, contact_role)
    return False
