"""
Agent chat router — Cursor-like side panel for chatting with Jarvis.
Supports streaming responses with full platform context and
visible reasoning (thinking) before the final answer.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.company import Company
from app.models.dealflow_entry import DealflowEntry
from app.models.network_contact import NetworkContact
from app.models.news_item import NewsItem
from app.models.portfolio import PortfolioSnapshot

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/agent-chat",
    tags=["agent-chat"],
    dependencies=[Depends(get_current_user)],
)

THINKING_OPEN = "<thinking>"
THINKING_CLOSE = "</thinking>"
_MAX_TAG_LEN = len(THINKING_CLOSE)  # longest tag we need to detect


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    context_type: Optional[str] = None  # "company", "dealflow", "portfolio", "network"
    context_id: Optional[str] = None
    history: list[ChatMessage] = []


# ---------------------------------------------------------------------------
# Platform context builder — gives Jarvis awareness of the full app
# ---------------------------------------------------------------------------

def _build_platform_context(db: Session) -> str:
    """Build a concise summary of the whole platform for Jarvis."""
    sections: list[str] = []

    # Deal room companies
    companies = db.query(Company).order_by(desc(Company.created_at)).limit(30).all()
    if companies:
        lines = [f"Active Deals ({len(companies)} companies):"]
        for c in companies[:20]:
            parts = [c.name]
            if c.one_liner:
                parts.append(f"— {c.one_liner[:80]}")
            if c.investment_stage:
                parts.append(f"[{c.investment_stage}]")
            lines.append("  • " + " ".join(parts))
        if len(companies) > 20:
            lines.append(f"  … and {len(companies) - 20} more")
        sections.append("\n".join(lines))

    # Dealflow pipeline
    entries = db.query(DealflowEntry).order_by(desc(DealflowEntry.created_at)).limit(30).all()
    if entries:
        lines = [f"Dealflow Pipeline ({len(entries)} entries):"]
        for e in entries[:20]:
            parts = [e.name]
            if e.stage:
                parts.append(f"[{e.stage}]")
            if e.status and e.status != "none":
                parts.append(f"status={e.status}")
            if e.one_liner:
                parts.append(f"— {e.one_liner[:60]}")
            lines.append("  • " + " ".join(parts))
        if len(entries) > 20:
            lines.append(f"  … and {len(entries) - 20} more")
        sections.append("\n".join(lines))

    # Portfolio
    portfolio = db.query(PortfolioSnapshot).order_by(desc(PortfolioSnapshot.imported_at)).limit(30).all()
    if portfolio:
        lines = [f"Portfolio ({len(portfolio)} companies):"]
        for p in portfolio[:20]:
            parts = [p.company_name]
            if p.investment_stage:
                parts.append(f"[{p.investment_stage}]")
            if p.one_liner:
                parts.append(f"— {p.one_liner[:60]}")
            lines.append("  • " + " ".join(parts))
        if len(portfolio) > 20:
            lines.append(f"  … and {len(portfolio) - 20} more")
        sections.append("\n".join(lines))

    # Network contacts
    contacts = db.query(NetworkContact).order_by(desc(NetworkContact.created_at)).limit(30).all()
    if contacts:
        lines = [f"Network ({len(contacts)} contacts):"]
        for c in contacts[:15]:
            parts = [c.name]
            if c.company_name:
                parts.append(f"@ {c.company_name}")
            if c.role_or_title:
                parts.append(f"({c.role_or_title})")
            if c.tags:
                parts.append(f"[{c.tags[:40]}]")
            lines.append("  • " + " ".join(parts))
        if len(contacts) > 15:
            lines.append(f"  … and {len(contacts) - 15} more")
        sections.append("\n".join(lines))

    # Recent intelligence / news
    news = db.query(NewsItem).order_by(desc(NewsItem.created_at)).limit(15).all()
    if news:
        lines = [f"Recent Intelligence ({len(news)} items):"]
        for n in news[:10]:
            parts = [n.headline[:80]]
            if n.entity_name:
                parts.insert(0, f"[{n.entity_name}]")
            if n.importance:
                parts.append(f"({n.importance})")
            lines.append("  • " + " ".join(parts))
        if len(news) > 10:
            lines.append(f"  … and {len(news) - 10} more")
        sections.append("\n".join(lines))

    if not sections:
        return ""

    return "PLATFORM DATA (use this to answer questions about our dealflow, portfolio, network, and intelligence):\n\n" + "\n\n".join(sections)


# ---------------------------------------------------------------------------
# System prompt builder
# ---------------------------------------------------------------------------

THINKING_INSTRUCTION = (
    "\n\nIMPORTANT — Response format: "
    "Before your final answer, briefly show your reasoning steps inside "
    "the exact XML tags <thinking>...</thinking>. Keep the thinking concise "
    "(2-5 short bullet points). Then provide your final answer after the "
    "closing </thinking> tag. Example:\n"
    "<thinking>\n- The user asked about X\n- We have Y in our data\n"
    "- Relevant insight: Z\n</thinking>\n\nHere is the final answer…"
)


def _build_system_prompt(context_type: Optional[str], context_id: Optional[str], db: Session) -> str:
    base = (
        "You are Jarvis, an AI assistant for New Era Ventures — a venture capital firm. "
        "You help with deal diligence, memo generation, portfolio analysis, "
        "and network introductions. Be concise, professional, and actionable. "
        "When you don't know something, say so."
    )

    parts = [base]

    # Always include platform-wide context
    platform_ctx = _build_platform_context(db)
    if platform_ctx:
        parts.append("\n\n" + platform_ctx)

    # Page-specific context
    if context_type == "company" and context_id:
        company = db.query(Company).filter(Company.id == context_id).first()
        if company:
            ctx_lines = [f"\nCurrent page context — Company '{company.name}':"]
            if company.one_liner:
                ctx_lines.append(f"One-liner: {company.one_liner}")
            if company.investment_stage:
                ctx_lines.append(f"Stage: {company.investment_stage}")
            if company.location:
                ctx_lines.append(f"Location: {company.location}")
            if company.notes:
                ctx_lines.append(f"Notes: {company.notes}")

            try:
                from app.services.rag import retrieve
                rag_context = retrieve(context_id, "company overview product market team", top_k=5)
                if rag_context:
                    ctx_lines.append("\nRelevant document context:")
                    for chunk in rag_context[:3]:
                        ctx_lines.append(chunk[:500])
            except Exception:
                pass

            parts.append("\n".join(ctx_lines))

    parts.append(THINKING_INSTRUCTION)
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Stream with thinking / answer parsing
# ---------------------------------------------------------------------------

def _stream_chat(message: str, system: str, history: list[ChatMessage]):
    """Generator that yields SSE events, separating <thinking> from answer."""
    import os
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        yield f"data: {json.dumps({'type': 'error', 'content': 'OPENAI_API_KEY not set'})}\n\n"
        return

    from openai import OpenAI
    client = OpenAI(api_key=api_key)

    messages = [{"role": "system", "content": system}]
    for h in history[-10:]:
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": message})

    try:
        stream = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=2048,
            stream=True,
        )

        yield f"data: {json.dumps({'type': 'start'})}\n\n"

        # State machine: "pre" -> "thinking" -> "answer"
        # "pre" = haven't seen <thinking> yet (treat as answer if tags never appear)
        state = "pre"
        buf = ""

        def _emit(event_type: str, text: str):
            if text:
                return f"data: {json.dumps({'type': event_type, 'content': text})}\n\n"
            return ""

        for chunk in stream:
            delta = chunk.choices[0].delta
            if not delta.content:
                continue

            buf += delta.content

            while True:
                if state == "pre":
                    idx = buf.find(THINKING_OPEN)
                    if idx != -1:
                        # Anything before the tag is preamble — emit as answer
                        before = buf[:idx]
                        evt = _emit("chunk", before)
                        if evt:
                            yield evt
                        buf = buf[idx + len(THINKING_OPEN):]
                        state = "thinking"
                        continue
                    # Could be a partial tag at the end — keep a tail buffer
                    safe = len(buf) - _MAX_TAG_LEN
                    if safe > 0:
                        evt = _emit("chunk", buf[:safe])
                        if evt:
                            yield evt
                        buf = buf[safe:]
                    break

                elif state == "thinking":
                    idx = buf.find(THINKING_CLOSE)
                    if idx != -1:
                        thinking_text = buf[:idx]
                        evt = _emit("thinking_chunk", thinking_text)
                        if evt:
                            yield evt
                        buf = buf[idx + len(THINKING_CLOSE):]
                        state = "answer"
                        continue
                    # Flush all but a tail that might contain a partial closing tag
                    safe = len(buf) - _MAX_TAG_LEN
                    if safe > 0:
                        evt = _emit("thinking_chunk", buf[:safe])
                        if evt:
                            yield evt
                        buf = buf[safe:]
                    break

                else:  # state == "answer"
                    evt = _emit("chunk", buf)
                    if evt:
                        yield evt
                    buf = ""
                    break

        # Flush any remaining buffer
        if buf:
            if state == "thinking":
                evt = _emit("thinking_chunk", buf)
            else:
                evt = _emit("chunk", buf)
            if evt:
                yield evt

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as e:
        logger.exception("Chat streaming failed")
        yield f"data: {json.dumps({'type': 'error', 'content': str(e)[:200]})}\n\n"


@router.post("/stream")
def chat_stream(body: ChatRequest, db: Session = Depends(get_db)):
    """Stream a chat response from Jarvis. Returns SSE events."""
    system = _build_system_prompt(body.context_type, body.context_id, db)
    return StreamingResponse(
        _stream_chat(body.message, system, body.history),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("")
def chat_sync(body: ChatRequest, db: Session = Depends(get_db)):
    """Non-streaming chat (fallback). Returns full response at once."""
    system = _build_system_prompt(body.context_type, body.context_id, db)
    from app.llm import complete

    history_text = ""
    for h in body.history[-10:]:
        history_text += f"{h.role}: {h.content}\n"

    prompt = history_text + f"user: {body.message}"
    response = complete(prompt, system=system, max_tokens=2048)

    return {
        "role": "assistant",
        "content": response,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
