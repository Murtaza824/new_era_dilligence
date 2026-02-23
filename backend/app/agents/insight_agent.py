"""
Insight / current-events agent — fetches and structures current news
and headlines for a company or sector. Writes into shared context so
memo, intro, and deal agents can consume it.
"""
import logging
from typing import Optional

from app.llm import complete
from app.services.web_search import search_web

logger = logging.getLogger(__name__)


def fetch_company_insights(
    company_name: str,
    one_liner: Optional[str] = None,
    sector: Optional[str] = None,
) -> dict:
    """
    Fetch current events / news for a company and return structured insights.
    Returns: { "headlines": [...], "summary": str }
    """
    query_parts = [company_name]
    if one_liner:
        query_parts.append(one_liner)
    if sector:
        query_parts.append(sector)
    query = " ".join(query_parts) + " latest news funding 2025 2026"

    results = search_web(query, max_results=8)
    if not results:
        return {"headlines": [], "summary": ""}

    headlines = [
        {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", "")}
        for r in results
    ]

    source_text = "\n\n".join(
        f"- {r['title']}: {r['content']}" for r in results if r.get("content")
    )

    try:
        summary = complete(
            prompt=(
                f"Summarize the latest current events and news about {company_name} "
                f"based on the following search results. Focus on funding, partnerships, "
                f"product launches, and market developments. Keep it to 3-5 bullet points.\n\n"
                f"{source_text}"
            ),
            system="You are a venture capital analyst summarizing current events for a company.",
            max_tokens=512,
        )
    except Exception as e:
        logger.warning("Insight summary generation failed: %s", e)
        summary = ""

    return {"headlines": headlines, "summary": summary}


def generate_intro_reason(
    contact_name: str,
    contact_role: Optional[str],
    contact_tags: Optional[str],
    company_name: str,
    one_liner: Optional[str],
    introduction_type: str,
    current_events_summary: Optional[str] = None,
) -> str:
    """
    Use LLM to generate a rich reason for why this introduction makes sense.
    Returns a 1-3 sentence reason string.
    """
    context_parts = [f"Contact: {contact_name}"]
    if contact_role:
        context_parts.append(f"Role: {contact_role}")
    if contact_tags:
        context_parts.append(f"Tags: {contact_tags}")
    context_parts.append(f"Company: {company_name}")
    if one_liner:
        context_parts.append(f"What they do: {one_liner}")
    context_parts.append(f"Introduction type: {introduction_type}")
    if current_events_summary:
        context_parts.append(f"Current events: {current_events_summary}")

    try:
        reason = complete(
            prompt=(
                "Based on the following context, write ONE short sentence (max 15 words) "
                "explaining the mutual benefit of this introduction. No fluff.\n\n"
                + "\n".join(context_parts)
            ),
            system="You are a VC associate. Write extremely concise intro reasons — one punchy sentence only.",
            max_tokens=60,
        )
        return reason.strip()
    except Exception as e:
        logger.warning("Intro reason generation failed: %s", e)
        return f"Contact could be valuable for {company_name} ({introduction_type})."
