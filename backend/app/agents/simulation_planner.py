"""
Simulation planner agent — uses LLM to read company context (memo, docs)
and suggest reasonable simulation inputs with bear/base/bull scenarios.
"""
import json
import logging
from app.llm import complete
from app.services.rag import retrieve

logger = logging.getLogger(__name__)


def suggest_simulation_inputs(company_id: str, company_name: str) -> dict:
    """
    Read company context and propose simulation parameters.

    Returns a dict with suggested:
    - entry_valuation, ownership_pct, check_size, fund_size
    - exit_multiple_mean, exit_multiple_std
    - scenarios (bear/base/bull with exit multiples and probabilities)
    - rationale (text explaining the suggestions)
    """
    logger.info(f"Planning simulation inputs for {company_name}")

    # Retrieve relevant context
    chunks = retrieve(
        company_id,
        "valuation investment size ownership fund check size deal terms traction revenue ARR growth",
        top_k=10,
    )
    context = "\n\n---\n\n".join(chunks) if chunks else "(No source materials available)"

    system = (
        "You are a quantitative analyst at New Era Ventures. Your job is to suggest reasonable "
        "simulation parameters for modeling the fund impact of a potential investment. "
        "You must return valid JSON only — no markdown, no explanation outside the JSON."
    )

    prompt = (
        f"Based on the following information about {company_name}, suggest Monte Carlo simulation "
        f"parameters for evaluating the fund impact of this investment.\n\n"
        f"## Source Materials\n\n{context}\n\n"
        f"## Required Output\n\n"
        f"Return a JSON object with exactly these fields:\n"
        f'{{\n'
        f'  "entry_valuation": <post-money valuation in dollars, e.g. 15000000>,\n'
        f'  "ownership_pct": <ownership percentage, e.g. 10.0 for 10%>,\n'
        f'  "check_size": <investment amount in dollars, e.g. 1500000>,\n'
        f'  "fund_size": 5000000,\n'
        f'  "exit_multiple_mean": <expected average exit multiple on entry valuation>,\n'
        f'  "exit_multiple_std": <standard deviation of exit multiple>,\n'
        f'  "years_to_exit": <expected years to liquidity event>,\n'
        f'  "scenarios": [\n'
        f'    {{"name": "Bear", "probability": 0.25, "exit_multiple": <bear case multiple>}},\n'
        f'    {{"name": "Base", "probability": 0.50, "exit_multiple": <base case multiple>}},\n'
        f'    {{"name": "Bull", "probability": 0.25, "exit_multiple": <bull case multiple>}}\n'
        f'  ],\n'
        f'  "rationale": "<2-3 sentences explaining your reasoning>"\n'
        f'}}\n\n'
        f"Use realistic VC assumptions. If information is missing, use reasonable defaults "
        f"for the company's stage. New Era Ventures is a $5M early-stage fund."
    )

    raw = complete(prompt, system=system, max_tokens=1024)

    # Parse JSON from the response (handle potential markdown wrapping)
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
            cleaned = cleaned.rsplit("```", 1)[0]
        result = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning(f"Failed to parse planner JSON, using defaults. Raw: {raw[:200]}")
        result = _default_suggestions(company_name)

    # Ensure all required fields exist
    defaults = _default_suggestions(company_name)
    for key in defaults:
        if key not in result:
            result[key] = defaults[key]

    return result


def _default_suggestions(company_name: str) -> dict:
    """Fallback defaults if the LLM fails to produce valid JSON."""
    return {
        "entry_valuation": 15_000_000,
        "ownership_pct": 10.0,
        "check_size": 1_500_000,
        "fund_size": 5_000_000,
        "exit_multiple_mean": 8.0,
        "exit_multiple_std": 6.0,
        "years_to_exit": 7,
        "scenarios": [
            {"name": "Bear", "probability": 0.25, "exit_multiple": 1.5},
            {"name": "Base", "probability": 0.50, "exit_multiple": 5.0},
            {"name": "Bull", "probability": 0.25, "exit_multiple": 15.0},
        ],
        "rationale": f"Using default early-stage VC assumptions for {company_name}.",
    }


def suggest_outlier_probability(rag_key: str, company_name: str) -> dict | None:
    """
    Use diligence docs and portfolio notes (RAG) to suggest a standalone outlier
    probability for this company. Returns None if no RAG context or on failure.
    """
    chunks = retrieve(
        rag_key,
        "outlier success breakout traction team market growth revenue funding milestones updates",
        top_k=12,
    )
    if not chunks:
        return None

    context = "\n\n---\n\n".join(chunks)
    system = (
        "You are a VC analyst. Based on the provided diligence and notes, estimate the probability "
        "that this company becomes a portfolio outlier (e.g. 10x+ return). Return valid JSON only."
    )
    prompt = (
        f"Context for {company_name}:\n\n{context}\n\n"
        "Return a JSON object: {\"outlier_probability\": <float between 0.001 and 0.20>, "
        "\"rationale\": \"<1-2 sentences why>\"}. "
        "Use the low end (0.01-0.03) for early/unproven; mid (0.03-0.08) for strong traction or team; "
        "high (0.08-0.15) only if context clearly supports breakout potential. "
        "No markdown, no text outside the JSON."
    )

    try:
        raw = complete(prompt, system=system, max_tokens=256)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]
        out = json.loads(cleaned)
        p = float(out.get("outlier_probability", 0.03))
        p = max(0.001, min(0.20, p))
        return {"outlier_probability": p, "rationale": out.get("rationale", "") or ""}
    except (json.JSONDecodeError, TypeError, ValueError) as e:
        logger.warning(f"Outlier probability suggestion failed for {company_name}: {e}")
        return None
