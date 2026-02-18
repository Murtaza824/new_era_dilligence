"""
Optional web search for agents (e.g. Market Opportunity). Uses Tavily API when
TAVILY_API_KEY is set; otherwise returns empty so agents still run with document context only.
"""
import logging
import os

import httpx

logger = logging.getLogger(__name__)

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
TAVILY_BASE = "https://api.tavily.com"


def search_web(query: str, max_results: int = 8) -> list[dict]:
    """
    Run a web search and return a list of results with title, url, and content/snippet.
    Returns [] if TAVILY_API_KEY is not set or on error.
    """
    if not TAVILY_API_KEY or not TAVILY_API_KEY.strip():
        return []

    try:
        resp = httpx.post(
            f"{TAVILY_BASE}/search",
            json={
                "api_key": TAVILY_API_KEY.strip(),
                "query": query,
                "search_depth": "basic",
                "max_results": max_results,
                "include_answer": False,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        return [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content": r.get("content", ""),
            }
            for r in results
        ]
    except Exception as e:
        logger.warning("Web search failed: %s", e)
        return []
