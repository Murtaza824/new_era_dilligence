"""
Memo orchestrator — runs all section agents and combines them into a
cohesive investment memo with a consistency pass.
"""
import json
import logging
from app.llm import complete
from app.agents.memo_sections import SECTIONS, generate_section

logger = logging.getLogger(__name__)


def generate_memo(company_id: str, company_name: str) -> dict:
    """
    Generate a full investment memo:
    1. Run each section agent sequentially (could be parallelised later)
    2. Combine into a single Markdown document
    3. Run a consistency / polish pass
    Returns: { "sections": [...], "content": "full markdown" }
    """
    logger.info(f"Starting memo generation for {company_name} ({company_id})")

    # Step 1: Generate each section
    sections = []
    for section_def in SECTIONS:
        result = generate_section(company_id, section_def, company_name=company_name)
        sections.append(result)

    # Step 2: Assemble raw memo
    raw_parts = [f"# Investment Memo: {company_name}\n"]
    for s in sections:
        raw_parts.append(f"## {s['title']}\n\n{s['content']}")
    raw_memo = "\n\n---\n\n".join(raw_parts)

    # Step 3: Consistency / polish pass
    polished = _polish_memo(raw_memo, company_name)

    return {
        "sections": sections,
        "content": polished,
    }


def _polish_memo(raw_memo: str, company_name: str) -> str:
    """
    Final pass to smooth transitions, fix inconsistencies, and ensure
    the memo reads as a cohesive document rather than independent sections.
    """
    system = (
        "You are a senior editor at a venture capital firm. Your job is to polish "
        "an investment memo so it reads as one cohesive document. Fix any inconsistencies, "
        "smooth transitions between sections, remove redundancies, and ensure a professional tone. "
        "Preserve all factual content, section headers, and Markdown formatting. "
        "Do NOT add new information — only improve clarity and flow."
    )
    prompt = (
        f"Please polish the following investment memo for {company_name}. "
        f"Return the improved memo in full Markdown.\n\n"
        f"{raw_memo}"
    )

    try:
        polished = complete(prompt, system=system, max_tokens=8192)
        return polished
    except Exception as e:
        logger.warning(f"Polish pass failed, using raw memo: {e}")
        return raw_memo
