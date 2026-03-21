"""
Unified auto-enrichment for dealflow entries.
Runs as a background task after any entry creation to fill in missing data:
- Website scraping for company description, social links
- Logo resolution
- LinkedIn page discovery
- Founder discovery via LLM
"""
import json
import logging
import re
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.models.dealflow_entry import DealflowEntry
from app.models.dealflow_founder import DealflowFounder

logger = logging.getLogger(__name__)

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; JarvisBot/1.0)"}


def enrich_dealflow_entry(entry_id: str, db: Session) -> None:
    """Best-effort enrichment — only fills empty fields, never overwrites user data."""
    entry = db.query(DealflowEntry).filter(DealflowEntry.id == entry_id).first()
    if not entry:
        return

    changed = False

    # Step 1: scrape website if we have one
    website_text = None
    if entry.website:
        website_text, meta = _scrape_website(entry.website)
        if meta:
            if not entry.one_liner and meta.get("description"):
                entry.one_liner = meta["description"][:300]
                changed = True
            if not entry.company_linkedin_url and meta.get("linkedin_url"):
                entry.company_linkedin_url = meta["linkedin_url"]
                changed = True
            if not entry.location and meta.get("location"):
                entry.location = meta["location"]
                changed = True

    # Step 2: resolve logo
    if not entry.logo_url and entry.website:
        try:
            from app.services.logo import resolve_logo_url
            url = entry.website if entry.website.startswith("http") else f"https://{entry.website}"
            logo = resolve_logo_url(url)
            if logo:
                entry.logo_url = logo
                changed = True
        except Exception as exc:
            logger.warning("Logo resolution failed for %s: %s", entry.website, exc)

    # Step 3: discover founders via LLM if we have some text context
    existing_founders = (
        db.query(DealflowFounder)
        .filter(DealflowFounder.dealflow_entry_id == entry_id)
        .count()
    )
    if existing_founders == 0:
        context_parts = []
        if website_text:
            context_parts.append(f"Website content:\n{website_text[:3000]}")
        if entry.notes:
            context_parts.append(f"Meeting notes:\n{entry.notes[:3000]}")
        if context_parts:
            founders = _discover_founders(entry.name, "\n\n".join(context_parts))
            for f in founders:
                if f.get("name"):
                    db.add(DealflowFounder(
                        dealflow_entry_id=entry_id,
                        name=f["name"],
                        linkedin_url=f.get("linkedin_url"),
                        email=f.get("email"),
                    ))
                    changed = True

    if changed:
        db.commit()
        db.refresh(entry)

    # Step 4: trigger matchmaking
    try:
        from app.services.matchmaking import run_matchmaking_for_dealflow_entry
        run_matchmaking_for_dealflow_entry(entry_id, db, trigger="enrichment_completed")
    except Exception as exc:
        logger.warning("Matchmaking after enrichment failed: %s", exc)


def _scrape_website(url: str) -> tuple[Optional[str], Optional[dict]]:
    """Fetch a website and extract text + meta."""
    try:
        full_url = url if url.startswith("http") else f"https://{url}"
        resp = httpx.get(full_url, timeout=15, follow_redirects=True, headers=_HEADERS)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()

        meta: dict = {}

        desc_tag = soup.find("meta", attrs={"name": "description"})
        og_desc = soup.find("meta", property="og:description")
        if og_desc and og_desc.get("content"):
            meta["description"] = og_desc["content"].strip()
        elif desc_tag and desc_tag.get("content"):
            meta["description"] = desc_tag["content"].strip()

        for link in soup.find_all("a", href=True):
            href = link["href"]
            if "linkedin.com/company" in href:
                meta["linkedin_url"] = href
                break

        text = soup.get_text(separator="\n", strip=True)
        return text[:5000], meta
    except Exception as exc:
        logger.warning("Website scrape failed for %s: %s", url, exc)
        return None, None


_FOUNDER_SYSTEM = """You are a research assistant. Given context about a company, identify the founders or key team members.
Return ONLY valid JSON array: [{"name": "...", "linkedin_url": null, "email": null}]
If you cannot identify founders, return an empty array: []
Do NOT wrap in markdown code fences."""


def _discover_founders(company_name: str, context: str) -> list[dict]:
    """Use LLM to discover founders from available context."""
    try:
        from app.llm import complete
        raw = complete(
            prompt=f"Identify the founders or key team members of {company_name} from this context:\n\n{context}",
            system=_FOUNDER_SYSTEM,
            max_tokens=512,
        )
        raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
        raw = re.sub(r"\s*```\s*$", "", raw)
        result = json.loads(raw)
        if isinstance(result, list):
            return result
        return []
    except Exception as exc:
        logger.warning("Founder discovery failed for %s: %s", company_name, exc)
        return []
