"""
Unified auto-enrichment for dealflow entries.
Runs as a background task after any entry creation to fill in missing data:
- Web search to discover company website (if missing)
- Website scraping for company description, social links
- Logo resolution
- Web search for company LinkedIn
- Founder discovery via LLM
- Web search for founder LinkedIn URLs
"""
import json
import logging
import re
from typing import Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from app.models.dealflow_entry import DealflowEntry
from app.models.dealflow_founder import DealflowFounder

logger = logging.getLogger(__name__)

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; JarvisBot/1.0)"}


def _has_tavily() -> bool:
    import os
    key = os.getenv("TAVILY_API_KEY", "")
    return bool(key and key.strip())


def _search(query: str, max_results: int = 5) -> list[dict]:
    """Thin wrapper around web_search.search_web — returns [] if Tavily is not configured."""
    try:
        from app.services.web_search import search_web
        return search_web(query, max_results=max_results)
    except Exception as exc:
        logger.warning("Web search failed for query '%s': %s", query, exc)
        return []


def _extract_url_from_results(results: list[dict], must_contain: Optional[str] = None) -> Optional[str]:
    """Pick the best URL from search results, optionally requiring a substring."""
    for r in results:
        url = r.get("url", "")
        if must_contain and must_contain not in url:
            continue
        if url:
            return url
    return None


def _is_social_or_directory(url: str) -> bool:
    """Check if a URL is a social/directory site rather than a company's own domain."""
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    blocklist = [
        "linkedin.com", "twitter.com", "x.com", "facebook.com", "instagram.com",
        "crunchbase.com", "pitchbook.com", "ycombinator.com", "techcrunch.com",
        "bloomberg.com", "wikipedia.org", "github.com", "medium.com",
        "angel.co", "wellfound.com", "youtube.com",
    ]
    return any(b in host for b in blocklist)


def enrich_dealflow_entry(entry_id: str, db: Session) -> None:
    """Best-effort enrichment — only fills empty fields, never overwrites user data."""
    entry = db.query(DealflowEntry).filter(DealflowEntry.id == entry_id).first()
    if not entry:
        return

    changed = False

    # Step 1: Discover company website via web search if missing
    if not entry.website and _has_tavily():
        logger.info("Enrichment: searching for website of '%s'", entry.name)
        results = _search(f'"{entry.name}" official website')
        for r in results:
            url = r.get("url", "")
            if url and not _is_social_or_directory(url):
                parsed = urlparse(url if url.startswith("http") else f"https://{url}")
                entry.website = f"{parsed.scheme}://{parsed.netloc}"
                changed = True
                logger.info("Enrichment: discovered website %s for '%s'", entry.website, entry.name)
                break

    # Step 2: Scrape website for metadata
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

    # Step 3: Resolve logo from website
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

    # Step 4: Discover company LinkedIn via web search if still missing
    if not entry.company_linkedin_url and _has_tavily():
        logger.info("Enrichment: searching for LinkedIn of '%s'", entry.name)
        results = _search(f'"{entry.name}" site:linkedin.com/company')
        li_url = _extract_url_from_results(results, must_contain="linkedin.com/company")
        if li_url:
            entry.company_linkedin_url = li_url
            changed = True
            logger.info("Enrichment: discovered LinkedIn %s for '%s'", li_url, entry.name)

    # Commit website / linkedin / logo / one-liner changes before founder work
    if changed:
        db.commit()
        db.refresh(entry)

    # Step 5: Discover founders via LLM if none exist
    existing_founders = (
        db.query(DealflowFounder)
        .filter(DealflowFounder.dealflow_entry_id == entry_id)
        .all()
    )
    if len(existing_founders) == 0:
        context_parts = []
        if website_text:
            context_parts.append(f"Website content:\n{website_text[:3000]}")
        if entry.notes:
            context_parts.append(f"Meeting notes:\n{entry.notes[:3000]}")
        if context_parts:
            founders = _discover_founders(entry.name, "\n\n".join(context_parts))
            for f in founders:
                if f.get("name"):
                    new_f = DealflowFounder(
                        dealflow_entry_id=entry_id,
                        name=f["name"],
                        linkedin_url=f.get("linkedin_url"),
                        email=f.get("email"),
                    )
                    db.add(new_f)
            db.commit()
            existing_founders = (
                db.query(DealflowFounder)
                .filter(DealflowFounder.dealflow_entry_id == entry_id)
                .all()
            )

    # Step 6: Enrich founder LinkedIn URLs via web search
    if _has_tavily() and existing_founders:
        founders_updated = False
        for founder in existing_founders:
            if founder.linkedin_url:
                continue
            logger.info("Enrichment: searching LinkedIn for founder '%s' at '%s'", founder.name, entry.name)
            results = _search(f'"{founder.name}" "{entry.name}" site:linkedin.com/in')
            li_url = _extract_url_from_results(results, must_contain="linkedin.com/in")
            if li_url:
                founder.linkedin_url = li_url
                founders_updated = True
                logger.info("Enrichment: found LinkedIn %s for founder '%s'", li_url, founder.name)
        if founders_updated:
            db.commit()

    # Step 7: Trigger matchmaking
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
