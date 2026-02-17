"""
Single LLM abstraction for Jarvis. Uses OpenAI for all calls for now.
Claude will be used later for: long memo sections, simulation planner.
Swap by setting ANTHROPIC_API_KEY and switching provider in the functions below.
"""
import os

# OpenAI is used for: RAG, all memo section agents, orchestrator, simulation planner.
# TODO Claude: use for long-context memo sections and planner when ANTHROPIC_API_KEY is set.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")


def get_client():
    """Return the default LLM client (OpenAI for now)."""
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is not set in .env")
    # Lazy import so backend starts without openai installed if only health is used
    from openai import OpenAI
    return OpenAI(api_key=OPENAI_API_KEY)


def complete(prompt: str, system: str | None = None, max_tokens: int = 4096) -> str:
    """
    Single completion. Used by memo section agents, orchestrator, planner.
    Claude swap: add branch on ANTHROPIC_API_KEY and call Anthropic here.
    """
    client = get_client()
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content or ""
