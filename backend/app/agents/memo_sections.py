"""
Memo section agents — each section has a specialized prompt that retrieves
relevant context from the RAG pipeline and generates focused content.

Sections follow New Era Ventures' diligence memo structure:
1. Company Overview
2. Market Opportunity
3. Product & Technology
4. Business Model
5. Traction & Metrics
6. Team & Leadership
7. Competitive Landscape
8. Risks & Mitigants
9. Investment Thesis & Recommendation
"""
import logging
from app.llm import complete
from app.services.rag import retrieve

logger = logging.getLogger(__name__)

# ── Section definitions ───────────────────────────────────────────────────

SECTIONS = [
    {
        "title": "Company Overview",
        "query": "company overview description what does the company do mission product",
        "prompt": (
            "You are writing the 'Company Overview' section of a venture capital investment memo. "
            "Based on the source materials below, write a concise overview covering:\n"
            "- What the company does (one-liner + expanded description)\n"
            "- When it was founded and where it is based\n"
            "- The core problem it solves and for whom\n"
            "- Stage of the company (pre-seed, seed, Series A, etc.)\n\n"
            "Write in a professional, analytical tone suitable for an investment committee. "
            "Use specific facts from the sources. 2-4 paragraphs."
        ),
    },
    {
        "title": "Market Opportunity",
        "query": "market size TAM SAM opportunity industry growth trends addressable market",
        "prompt": (
            "You are writing the 'Market Opportunity' section of a VC investment memo. "
            "Based on the source materials below, write about:\n"
            "- Total addressable market (TAM) and serviceable addressable market (SAM)\n"
            "- Key market trends and tailwinds\n"
            "- Growth rate of the market\n"
            "- Why this is a compelling market right now\n\n"
            "Use specific numbers where available. If market size data is not in the sources, "
            "note that it needs further diligence. 2-4 paragraphs."
        ),
    },
    {
        "title": "Product & Technology",
        "query": "product technology platform features architecture technical differentiation moat",
        "prompt": (
            "You are writing the 'Product & Technology' section of a VC investment memo. "
            "Based on the source materials below, cover:\n"
            "- Core product description and key features\n"
            "- Technology stack or technical approach (if available)\n"
            "- Technical differentiation / defensibility / moat\n"
            "- Product roadmap or vision (if mentioned)\n\n"
            "Focus on what makes the technology unique or defensible. 2-4 paragraphs."
        ),
    },
    {
        "title": "Business Model",
        "query": "business model revenue pricing monetization unit economics margins",
        "prompt": (
            "You are writing the 'Business Model' section of a VC investment memo. "
            "Based on the source materials below, cover:\n"
            "- Revenue model (SaaS, marketplace, transactional, etc.)\n"
            "- Pricing strategy\n"
            "- Unit economics (if available): CAC, LTV, margins\n"
            "- Path to profitability or scaling economics\n\n"
            "If specific unit economics are not available, note what needs further diligence. 2-3 paragraphs."
        ),
    },
    {
        "title": "Traction & Metrics",
        "query": "traction metrics revenue users growth customers ARR MRR engagement",
        "prompt": (
            "You are writing the 'Traction & Metrics' section of a VC investment memo. "
            "Based on the source materials below, cover:\n"
            "- Key growth metrics (revenue, users, customers)\n"
            "- Growth rate and trajectory\n"
            "- Notable customer wins or partnerships\n"
            "- Engagement or retention metrics\n\n"
            "Use specific numbers wherever possible. If metrics are limited, note what's "
            "available and what needs follow-up. 2-3 paragraphs."
        ),
    },
    {
        "title": "Team & Leadership",
        "query": "team founders leadership experience background executive hire",
        "prompt": (
            "You are writing the 'Team & Leadership' section of a VC investment memo. "
            "Based on the source materials below, cover:\n"
            "- Founder backgrounds and relevant experience\n"
            "- Key team members and their roles\n"
            "- Founder-market fit — why this team is uniquely positioned\n"
            "- Team size and key hires needed\n\n"
            "Assess the team's ability to execute on the vision. 2-3 paragraphs."
        ),
    },
    {
        "title": "Competitive Landscape",
        "query": "competition competitors differentiation competitive advantage alternatives",
        "prompt": (
            "You are writing the 'Competitive Landscape' section of a VC investment memo. "
            "Based on the source materials below, cover:\n"
            "- Key competitors (direct and indirect)\n"
            "- How the company differentiates itself\n"
            "- Competitive moats or advantages\n"
            "- Market positioning\n\n"
            "Be balanced — acknowledge strong competitors while highlighting differentiation. 2-3 paragraphs."
        ),
    },
    {
        "title": "Risks & Mitigants",
        "query": "risks challenges concerns regulatory competition execution risk mitigant",
        "prompt": (
            "You are writing the 'Risks & Mitigants' section of a VC investment memo. "
            "Based on the source materials below, identify:\n"
            "- 3-5 key risks (market, execution, competitive, regulatory, technical)\n"
            "- For each risk, a potential mitigant or how the company addresses it\n\n"
            "Present as a balanced assessment. Be candid about real concerns while noting "
            "mitigating factors. Use bullet points for clarity."
        ),
    },
    {
        "title": "Investment Thesis & Recommendation",
        "query": "investment thesis recommendation why invest opportunity conviction deal terms valuation",
        "prompt": (
            "You are writing the 'Investment Thesis & Recommendation' section of a VC investment memo. "
            "Based on ALL the source materials and the analysis above, synthesize:\n"
            "- The core investment thesis (why this is a compelling opportunity)\n"
            "- Key reasons for conviction (3-5 bullets)\n"
            "- Suggested next steps for diligence (if applicable)\n"
            "- Any deal terms or valuation context if available\n\n"
            "This is the conclusion — be clear and direct about whether this merits further "
            "consideration and why. 2-4 paragraphs."
        ),
    },
]


# ── Section agent ─────────────────────────────────────────────────────────


def generate_section(company_id: str, section: dict) -> dict:
    """
    Generate a single memo section by:
    1. Retrieving relevant context from the RAG store
    2. Calling the LLM with section-specific instructions
    """
    title = section["title"]
    logger.info(f"Generating section: {title}")

    # Retrieve relevant chunks
    chunks = retrieve(company_id, section["query"], top_k=8)
    if not chunks:
        return {
            "title": title,
            "content": f"*No source materials available for this section. Upload documents to populate.*",
        }

    context = "\n\n---\n\n".join(chunks)

    prompt = (
        f"{section['prompt']}\n\n"
        f"## Source Materials\n\n{context}\n\n"
        f"## Output\n\n"
        f"Write the '{title}' section now. Use Markdown formatting."
    )

    system = (
        "You are a senior venture capital analyst at New Era Ventures writing an investment memo. "
        "Be analytical, data-driven, and professional. Use specific facts from the source materials. "
        "Do not make up numbers or facts that are not in the sources — instead note what needs "
        "further diligence. Write in clear, concise prose."
    )

    content = complete(prompt, system=system, max_tokens=2048)
    return {"title": title, "content": content}


def refine_section(company_id: str, section_title: str, current_content: str,
                   instructions: str) -> dict:
    """
    Refine an existing memo section based on user instructions.
    Retrieves fresh RAG context and applies the user's feedback.
    """
    logger.info(f"Refining section: {section_title} — {instructions[:80]}")

    # Find the section definition for RAG query
    section_def = next((s for s in SECTIONS if s["title"] == section_title), None)
    query = section_def["query"] if section_def else section_title

    # Retrieve relevant chunks
    chunks = retrieve(company_id, query, top_k=8)
    context = "\n\n---\n\n".join(chunks) if chunks else "(No additional source materials)"

    system = (
        "You are a senior venture capital analyst at New Era Ventures revising an investment memo. "
        "The user wants to refine a specific section. Apply their instructions precisely. "
        "Use facts from the source materials. Do not fabricate data — note what needs further diligence. "
        "Return only the revised section content in Markdown."
    )

    prompt = (
        f"## Current Section: {section_title}\n\n"
        f"{current_content}\n\n"
        f"## User Instructions\n\n{instructions}\n\n"
        f"## Source Materials (for reference)\n\n{context}\n\n"
        f"## Task\n\n"
        f"Revise the '{section_title}' section above based on the user's instructions. "
        f"Keep the same professional tone and Markdown formatting. "
        f"Return only the updated section content."
    )

    content = complete(prompt, system=system, max_tokens=2048)
    return {"title": section_title, "content": content}
