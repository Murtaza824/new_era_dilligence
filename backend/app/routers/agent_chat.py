"""
Agent chat router — Cursor-like side panel for chatting with Jarvis.
Supports streaming responses and context-aware conversations.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.company import Company

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/agent-chat",
    tags=["agent-chat"],
    dependencies=[Depends(get_current_user)],
)


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    context_type: Optional[str] = None  # "company", "dealflow", "portfolio", "network"
    context_id: Optional[str] = None
    history: list[ChatMessage] = []


def _build_system_prompt(context_type: Optional[str], context_id: Optional[str], db: Session) -> str:
    base = (
        "You are Jarvis, an AI assistant for New Era Ventures — a venture capital firm. "
        "You help with deal diligence, memo generation, portfolio analysis, "
        "and network introductions. Be concise, professional, and actionable. "
        "When you don't know something, say so."
    )

    if context_type == "company" and context_id:
        company = db.query(Company).filter(Company.id == context_id).first()
        if company:
            parts = [base, f"\nCurrent context: Company '{company.name}'"]
            if company.one_liner:
                parts.append(f"One-liner: {company.one_liner}")
            if company.investment_stage:
                parts.append(f"Stage: {company.investment_stage}")
            if company.location:
                parts.append(f"Location: {company.location}")
            if company.notes:
                parts.append(f"Notes: {company.notes}")

            try:
                from app.services.rag import retrieve
                rag_context = retrieve(context_id, "company overview product market team", top_k=5)
                if rag_context:
                    parts.append("\nRelevant document context:")
                    for chunk in rag_context[:3]:
                        parts.append(chunk[:500])
            except Exception:
                pass

            return "\n".join(parts)

    return base


def _stream_chat(message: str, system: str, history: list[ChatMessage]):
    """Generator that yields SSE events with streamed LLM response."""
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

        for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield f"data: {json.dumps({'type': 'chunk', 'content': delta.content})}\n\n"

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
