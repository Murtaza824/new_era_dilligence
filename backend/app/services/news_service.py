"""
News service — fetches content from curated intelligence sources (RSS, Substack, Twitter),
deduplicates by URL, stores as NewsItem, and uses an LLM pass to link items to portfolio companies.
"""
import json
import logging
from datetime import datetime, timezone

import feedparser
from sqlalchemy.orm import Session

from app import llm
from app.models.intelligence_digest import IntelligenceDigest
from app.models.intelligence_source import IntelligenceSource
from app.models.news_item import NewsItem
from app.models.portfolio import PortfolioSnapshot
from app.services.web_search import search_web

logger = logging.getLogger(__name__)


# ── Fetcher helpers ─────────────────────────────────────────────────────

def _fetch_rss(url: str) -> list[dict]:
    """Parse an RSS/Atom feed and return normalised entries."""
    try:
        feed = feedparser.parse(url)
        items: list[dict] = []
        for entry in feed.entries[:20]:
            link = getattr(entry, "link", None)
            title = getattr(entry, "title", None)
            summary = getattr(entry, "summary", "") or ""
            if not title:
                continue
            items.append({
                "title": title.strip(),
                "url": link,
                "snippet": summary[:500],
            })
        return items
    except Exception as e:
        logger.warning("RSS fetch failed for %s: %s", url, e)
        return []


def _substack_feed_url(identifier: str) -> str:
    """Turn a Substack slug/domain into its RSS feed URL."""
    ident = identifier.strip().rstrip("/")
    if not ident.startswith("http"):
        ident = f"https://{ident}"
    if not ident.endswith("/feed"):
        ident = f"{ident}/feed"
    return ident


def _fetch_twitter(handle: str) -> list[dict]:
    """Fetch recent tweets via Tavily site-search."""
    clean = handle.strip().lstrip("@")
    results = search_web(f"site:twitter.com from:{clean}", max_results=10)
    return [
        {
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "snippet": r.get("content", "")[:500],
        }
        for r in results
        if r.get("url")
    ]


# ── Portfolio linkage (LLM) ────────────────────────────────────────────

def _link_to_portfolio(new_items: list[NewsItem], db: Session) -> None:
    """Use a single LLM call to tag new items with relevant portfolio companies."""
    if not new_items:
        return

    portcos = db.query(PortfolioSnapshot).all()
    if not portcos:
        return

    company_map: dict[str, PortfolioSnapshot] = {}
    names: list[str] = []
    for p in portcos:
        key = p.company_name.lower().strip()
        company_map[key] = p
        names.append(p.company_name)

    headlines_block = "\n".join(
        f"{i}: {item.headline}" for i, item in enumerate(new_items)
    )

    prompt = (
        "You are a news-triage assistant. Given a list of headlines (indexed 0..N) and a list of "
        "portfolio company names, determine which headlines are relevant to which companies.\n\n"
        f"Portfolio companies: {json.dumps(names)}\n\n"
        f"Headlines:\n{headlines_block}\n\n"
        "Return ONLY a JSON object mapping headline index (as string) to the company name it relates to. "
        "Only include headlines that clearly relate to a specific company. Example: {\"0\": \"Acme Corp\", \"3\": \"FooBar Inc\"}. "
        "If none match, return {}."
    )

    try:
        raw = llm.complete(prompt, system="Return valid JSON only. No markdown fences.", max_tokens=1024)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        mapping: dict[str, str] = json.loads(raw)
    except Exception as e:
        logger.warning("LLM portfolio-linkage failed: %s", e)
        return

    for idx_str, company_name in mapping.items():
        try:
            idx = int(idx_str)
            item = new_items[idx]
        except (ValueError, IndexError):
            continue

        key = company_name.lower().strip()
        portco = company_map.get(key)
        if portco:
            item.portfolio_snapshot_id = portco.id
            item.entity_name = portco.company_name
            db.add(item)

    try:
        db.commit()
    except Exception as e:
        logger.warning("Portfolio linkage commit failed: %s", e)
        db.rollback()


# ── Per-item analysis (LLM) ─────────────────────────────────────────────

def _analyze_items(new_items: list[NewsItem], db: Session) -> None:
    """Batch LLM call to extract sentiment, topics, insight, and importance for each item."""
    if not new_items:
        return

    items_block = "\n".join(
        f"{i}: [{item.headline}] {(item.snippet or '')[:200]}"
        for i, item in enumerate(new_items)
    )

    prompt = (
        "You are a VC intelligence analyst. For each news item below (indexed 0..N), determine:\n"
        "1. sentiment: one of positive, negative, neutral, mixed\n"
        "2. topics: 2-4 topic tags relevant to venture capital (e.g. AI, fundraising, regulation, crypto, SaaS, biotech)\n"
        "3. insight: a 1-2 sentence explanation of why this matters to a VC fund\n"
        "4. importance: one of high, medium, low\n\n"
        f"Items:\n{items_block}\n\n"
        "Return ONLY a JSON array where each element has: index (int), sentiment (string), "
        "topics (array of strings), insight (string), importance (string).\n"
        "Example: [{\"index\": 0, \"sentiment\": \"positive\", \"topics\": [\"AI\", \"fundraising\"], "
        "\"insight\": \"Large round signals strong investor confidence in AI infra.\", \"importance\": \"high\"}]"
    )

    try:
        raw = llm.complete(prompt, system="Return valid JSON only. No markdown fences.", max_tokens=4096)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        analyses: list[dict] = json.loads(raw)
    except Exception as e:
        logger.warning("LLM item analysis failed: %s", e)
        return

    for entry in analyses:
        try:
            idx = int(entry.get("index", -1))
            item = new_items[idx]
        except (ValueError, IndexError, TypeError):
            continue

        item.sentiment = entry.get("sentiment", "neutral")
        topics_raw = entry.get("topics", [])
        if isinstance(topics_raw, list):
            item.topics = ", ".join(str(t) for t in topics_raw)
        elif isinstance(topics_raw, str):
            item.topics = topics_raw
        item.insight = entry.get("insight")
        item.importance = entry.get("importance", "medium")
        db.add(item)

    try:
        db.commit()
    except Exception as e:
        logger.warning("Item analysis commit failed: %s", e)
        db.rollback()


# ── Batch-level digest (LLM) ───────────────────────────────────────────

def _generate_digest(new_items: list[NewsItem], db: Session) -> None:
    """Generate a trends digest from the enriched items and store as IntelligenceDigest."""
    if not new_items:
        return

    summaries_block = "\n".join(
        f"- [{item.sentiment or 'unknown'}] {item.headline} (topics: {item.topics or 'none'})"
        for item in new_items
    )

    prompt = (
        "You are a VC intelligence analyst. Given the following batch of news items with their "
        "sentiments and topics, produce:\n"
        "1. summary: 3-5 bullet points (as a single string with bullet points separated by newlines) "
        "of the most important trends and what is happening right now\n"
        "2. top_topics: the top 5 trending topics ranked by frequency and importance (comma-separated string)\n"
        "3. overall_sentiment: the dominant sentiment across the batch (positive/negative/neutral/mixed)\n\n"
        f"Items:\n{summaries_block}\n\n"
        "Return ONLY a JSON object with keys: summary, top_topics, overall_sentiment."
    )

    try:
        raw = llm.complete(prompt, system="Return valid JSON only. No markdown fences.", max_tokens=2048)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        result: dict = json.loads(raw)
    except Exception as e:
        logger.warning("LLM digest generation failed: %s", e)
        return

    digest = IntelligenceDigest(
        summary=result.get("summary", "No summary available."),
        top_topics=result.get("top_topics", ""),
        overall_sentiment=result.get("overall_sentiment", "neutral"),
        item_count=len(new_items),
    )
    db.add(digest)

    try:
        db.commit()
    except Exception as e:
        logger.warning("Digest commit failed: %s", e)
        db.rollback()


# ── Main orchestration ──────────────────────────────────────────────────

def refresh_all_sources(db: Session) -> int:
    """Fetch all active sources, dedup, store, and link to portfolio. Returns count of new items."""
    sources = db.query(IntelligenceSource).filter(IntelligenceSource.is_active.is_(True)).all()
    if not sources:
        return 0

    new_items: list[NewsItem] = []
    now = datetime.now(timezone.utc)

    for source in sources:
        raw_items: list[dict] = []

        if source.source_type == "twitter":
            raw_items = _fetch_twitter(source.identifier)
        elif source.source_type == "substack":
            url = _substack_feed_url(source.identifier)
            raw_items = _fetch_rss(url)
        elif source.source_type == "rss":
            raw_items = _fetch_rss(source.identifier)

        for ri in raw_items:
            url = ri.get("url")
            if url and db.query(NewsItem).filter(NewsItem.url == url).first():
                continue

            ni = NewsItem(
                intelligence_source_id=source.id,
                source_name=source.name,
                headline=ri.get("title", "Untitled"),
                url=url,
                snippet=ri.get("snippet"),
                fetched_at=now,
            )
            db.add(ni)
            new_items.append(ni)

        source.last_fetched_at = now
        db.add(source)

    try:
        db.commit()
    except Exception as e:
        logger.warning("News item commit failed: %s", e)
        db.rollback()
        return 0

    _link_to_portfolio(new_items, db)
    _analyze_items(new_items, db)
    _generate_digest(new_items, db)
    return len(new_items)
