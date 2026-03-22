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
from app.services.web_search import search_web

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
            "Use specific facts from the sources. Keep it SHORT — 1-2 brief paragraphs, no more than 4-5 sentences total."
        ),
    },
    {
        "title": "Market Opportunity",
        "query": "market size TAM SAM SOM opportunity industry growth trends addressable market tailwinds segments unit economics comparable",
        "retrieve_top_k": 50,
        "web_search": True,
        "prompt": (
            "## Market Sizing & TAM Analysis\n\n"
            "You are a Partner at Sequoia Capital. I need a complete market size analysis for the startup below.\n\n"
            "Please provide:\n\n"
            "- **Total Addressable Market**: Global market size with data sources\n"
            "- **Serviceable Available Market**: Realistic portion startup can reach\n"
            "- **Serviceable Obtainable Market**: What startup can capture in 3-5 years\n"
            "- **Market growth rate**: CAGR for next 5 years with trend drivers\n"
            "- **Market segments**: Break TAM into customer types or use cases\n"
            "- **Bottoms-up validation**: Unit economics × potential customers calculation\n"
            "- **Comparable markets**: Similar industries that scaled and their trajectory\n"
            "- **Red flags**: Reasons market might be smaller than claimed\n\n"
            "Format as investment memo market section with specific dollar figures. "
            "**Cite every statistic and claim with a source** (e.g. '[Source Name](URL)' or 'According to [Source], …'). "
            "Use both the uploaded document excerpts and the web search results below; prefer primary sources.\n\n"
            "Startup: {startup_description}"
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
        "query": "team founders leadership experience background executive hire LinkedIn exit previous company domain expertise",
        "retrieve_top_k": 50,
        "web_search": True,
        "web_search_query": "{company_name} founders team LinkedIn",
        "prompt": (
            "## Founder Background Check\n\n"
            "You are a General Partner at Benchmark Capital. I need a founder evaluation for {founder_names} at {startup_name}.\n\n"
            "Please provide:\n\n"
            "- **Professional background**: Previous companies, roles, and outcomes\n"
            "- **Domain expertise**: Years in industry and specific knowledge depth\n"
            "- **Technical skills**: Can founders build the product themselves\n"
            "- **Previous exits**: Any startups sold or IPO'd (success track record)\n"
            "- **Network strength**: Connections to customers, investors, or advisors\n"
            "- **Team dynamics**: How co-founders complement each other\n"
            "- **Red flags**: Failed companies, lawsuits, or reputation issues\n"
            "- **Founder-market fit**: Why these founders can win in this market\n\n"
            "Format as founder assessment memo with investment recommendation. "
            "**Cite every claim with a source** (e.g. '[Source Name](URL)' or 'According to [Source], …'). "
            "Use both the uploaded document excerpts and the web search results below.\n\n"
            "At the end, add a **Founders** list with LinkedIn URLs. Use this format:\n"
            "Founders:\n"
            "- Full Name | LinkedIn URL\n\n"
            "Founders: {founders_description}"
        ),
    },
    {
        "title": "Competitive Landscape",
        "query": "competition competitors differentiation competitive advantage alternatives moat positioning market share funding acquisition",
        "retrieve_top_k": 50,
        "web_search": True,
        "web_search_query": "{company_name} competitors competitive landscape industry",
        "prompt": (
            "## Competitive Intelligence Brief\n\n"
            "You are a VC analyst at Andreessen Horowitz. I need a competitive analysis for {startup_name} in {industry}.\n\n"
            "Please provide:\n\n"
            "- **Direct competitors**: Top 5 companies solving same problem\n"
            "- **Indirect competitors**: 5 adjacent solutions customers use today\n"
            "- **Competitive positioning**: Where startup fits on market map (price vs. features)\n"
            "- **Moat analysis**: What makes each competitor defensible\n"
            "- **White space**: Gaps no one is filling that startup could own\n"
            "- **Threat level**: Rate each competitor as low/medium/high threat with reasoning\n"
            "- **Market share estimates**: Current revenue or user distribution\n"
            "- **Strategic moves**: Recent funding, acquisitions, or pivots by competitors\n\n"
            "Format as competitive intelligence brief with comparison matrix. "
            "**Cite every claim and data point with a source** (e.g. '[Source Name](URL)' or 'According to [Source], …'). "
            "Use both the uploaded document excerpts and the web search results below.\n\n"
            "Startup: {startup_description}"
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
        "query": "investment thesis recommendation valuation round size ownership deal terms metrics traction team market opportunity risks",
        "retrieve_top_k": 50,
        "web_search": True,
        "web_search_query": "{company_name} funding valuation round investment",
        "prompt": (
            "## Partnership Investment Memo\n\n"
            "You are a Managing Partner at Index Ventures. I need a final investment recommendation for {startup_name}.\n\n"
            "Please provide:\n\n"
            "- **Executive summary**: 3-paragraph overview (problem, solution, why now)\n"
            "- **Investment thesis**: 5 reasons this could be a $1B+ company\n"
            "- **Key metrics**: Most important numbers that matter for this business\n"
            "- **Founder strength**: Why this team can execute and win\n"
            "- **Market opportunity**: Size and growth of addressable market\n"
            "- **Competitive advantages**: Moats that protect from competition\n"
            "- **Risk factors**: Top 5 things that could go wrong\n"
            "- **Investment structure**: Valuation, round size, ownership target\n"
            "- **Recommendation**: Pass, maybe, or strong yes with conviction level\n\n"
            "Format as partnership investment memo with clear decision recommendation. "
            "**Cite key figures and claims with sources** (e.g. '[Source Name](URL)' or 'According to [Source], …') where applicable. "
            "Use both the uploaded document excerpts and the web search results below.\n\n"
            "Startup: {investment_context}"
        ),
    },
]


# ── Section agent ─────────────────────────────────────────────────────────


def generate_section(company_id: str, section: dict, company_name: str | None = None) -> dict:
    """
    Generate a single memo section by:
    1. Retrieving relevant context from the RAG store (optionally more chunks + web search)
    2. Calling the LLM with section-specific instructions
    """
    title = section["title"]
    logger.info(f"Generating section: {title}")

    top_k = section.get("retrieve_top_k", 8)
    chunks = retrieve(company_id, section["query"], top_k=top_k)
    context_parts = []

    if chunks:
        context_parts.append("### Document excerpts\n\n" + "\n\n---\n\n".join(chunks))

    # Optional web search for sections that request it (e.g. Market Opportunity, Competitive Landscape)
    if section.get("web_search") and company_name:
        search_query_template = section.get("web_search_query", "market size TAM SAM {company_name} industry growth")
        search_query = search_query_template.format(company_name=company_name)
        web_results = search_web(search_query, max_results=8)
        if web_results:
            web_blobs = []
            for r in web_results:
                url = r.get("url", "")
                title_src = r.get("title", "")
                content = (r.get("content") or "").strip()
                if content:
                    web_blobs.append(f"[Source: {title_src}]({url})\n\n{content}")
            if web_blobs:
                context_parts.append("### Web search results\n\n" + "\n\n---\n\n".join(web_blobs))

    context = "\n\n".join(context_parts) if context_parts else None

    if not context:
        return {
            "title": title,
            "content": f"*No source materials available for this section. Upload documents and/or enable web search (TAVILY_API_KEY) to populate.*",
        }

    # Build template variables for sections that use them (Market Opportunity, Competitive Landscape, Team & Leadership, Investment Thesis)
    startup_name = company_name or "Company"
    industry = "Use the document excerpts and web search results below to identify the industry."
    founder_names = "Use the document excerpts and web search results below to identify founder names; if not found, use 'Founder(s) of " + (company_name or "the startup") + "'."
    founders_description = "Use the document excerpts and web search results below to describe founder backgrounds and LinkedIn profiles where available."
    investment_context = "Use the document excerpts and web search results below to provide full context: company overview, key metrics, team summary, and current ask (valuation, round size, use of funds)."

    if title == "Market Opportunity":
        startup_description = company_name or "Company"
        if chunks and company_name:
            startup_description = f"{company_name}. Use the document excerpts and web search results below to describe the company, product, and target customer in detail where available."
    elif title == "Competitive Landscape":
        startup_description = f"Use the document excerpts and web search results below to describe the product, main competitors, and differentiation for {company_name or 'the startup'}."
    elif title == "Team & Leadership":
        startup_description = founders_description
    else:
        startup_description = company_name or "Company"

    prompt_template = section["prompt"]
    template_vars = {
        "startup_name": startup_name,
        "industry": industry,
        "startup_description": startup_description,
        "founder_names": founder_names,
        "founders_description": founders_description,
        "investment_context": investment_context,
    }
    if any(ph in prompt_template for ph in ("{startup_description}", "{startup_name}", "{industry}", "{founder_names}", "{founders_description}", "{investment_context}")):
        prompt_template = prompt_template.format(**template_vars)

    prompt = (
        f"{prompt_template}\n\n"
        f"## Source Materials (documents + web)\n\n{context}\n\n"
        f"## Output\n\n"
        f"Write the '{title}' section now. Use Markdown formatting. Include sources for all figures and claims."
    )

    system = (
        "You are a senior venture capital analyst at New Era Ventures writing an investment memo. "
        "Be analytical, data-driven, and professional. Use specific facts from the source materials. "
        "Cite sources for every statistic (e.g. [Source Name](URL) or 'According to …'). "
        "Do not make up numbers or facts that are not in the sources — instead note what needs "
        "further diligence. Write in clear, concise prose."
    )

    max_tokens = 4096 if title in ("Market Opportunity", "Competitive Landscape", "Team & Leadership", "Investment Thesis & Recommendation") else 2048
    content = complete(prompt, system=system, max_tokens=max_tokens)
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
