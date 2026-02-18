"""
Extract deal field suggestions (valuation, amount raising, stage) from RAG context or web page.
"""
import json
import logging
import re

from app.llm import complete
from app.services.rag import retrieve

logger = logging.getLogger(__name__)


def suggest_from_documents(company_id: str) -> dict:
    """
    Use RAG + LLM to extract suggested deal fields from the company's documents.
    Returns dict with entry_valuation, amount_raising, investment_stage (any may be None).
    """
    query = "valuation round raising amount investment deal terms pre-seed seed series A post-money"
    chunks = retrieve(company_id, query, top_k=12)
    if not chunks:
        return {"entry_valuation": None, "amount_raising": None, "investment_stage": None}

    context = "\n\n---\n\n".join(chunks[:8])
    system = (
        "You extract deal-related numbers and stage from diligence documents. "
        "Return only a JSON object with these keys (use null if not found): "
        '"entry_valuation" (number, post-money valuation in dollars), '
        '"amount_raising" (number, amount raising in dollars), '
        '"investment_stage" (string, e.g. Pre-Seed, Seed, Series A). '
        "No other text."
    )
    prompt = (
        "From the following excerpts, extract any mentioned valuation, amount raising, and round/stage.\n\n"
        f"Excerpts:\n{context}\n\n"
        "Return JSON only, e.g. {\"entry_valuation\": 15000000, \"amount_raising\": 2000000, \"investment_stage\": \"Seed\"}."
    )
    try:
        out = complete(prompt, system=system, max_tokens=256)
        # Strip markdown code block if present
        out = re.sub(r"^```(?:json)?\s*", "", out.strip())
        out = re.sub(r"\s*```\s*$", "", out)
        data = json.loads(out)
        return {
            "entry_valuation": data.get("entry_valuation"),
            "amount_raising": data.get("amount_raising"),
            "investment_stage": data.get("investment_stage"),
        }
    except (json.JSONDecodeError, TypeError) as e:
        logger.warning("Deal extract from documents failed to parse LLM output: %s", e)
        return {"entry_valuation": None, "amount_raising": None, "investment_stage": None}


def suggest_from_web_page(page_text: str, company_name: str) -> dict:
    """
    Use LLM to extract deal suggestions from scraped web page text (e.g. company homepage or news).
    """
    if not page_text or len(page_text.strip()) < 100:
        return {"entry_valuation": None, "amount_raising": None, "investment_stage": None}
    context = page_text[:12000]
    system = (
        "You extract deal-related numbers and stage from web page content about a company. "
        "Return only a JSON object with: "
        '"entry_valuation" (number, post-money valuation in dollars, or null), '
        '"amount_raising" (number, amount raising in dollars, or null), '
        '"investment_stage" (string, e.g. Pre-Seed, Seed, Series A, or null). '
        "No other text."
    )
    prompt = (
        f"Company: {company_name}\n\n"
        "Extract any mentioned valuation, round size, or stage from this content:\n\n"
        f"{context}\n\n"
        "Return JSON only."
    )
    try:
        out = complete(prompt, system=system, max_tokens=256)
        out = re.sub(r"^```(?:json)?\s*", "", out.strip())
        out = re.sub(r"\s*```\s*$", "", out)
        data = json.loads(out)
        return {
            "entry_valuation": data.get("entry_valuation"),
            "amount_raising": data.get("amount_raising"),
            "investment_stage": data.get("investment_stage"),
        }
    except (json.JSONDecodeError, TypeError) as e:
        logger.warning("Deal extract from web failed to parse LLM output: %s", e)
        return {"entry_valuation": None, "amount_raising": None, "investment_stage": None}
