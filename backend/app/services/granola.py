"""
Granola meeting-notes integration.

Polls the Granola REST API for new notes, extracts deal information via LLM,
and creates DealflowEntry + Company + Touchpoint records in Jarvis.
"""
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.llm import complete
from app.models.company import Company
from app.models.dealflow_entry import DealflowEntry
from app.models.dealflow_founder import DealflowFounder
from app.models.granola_sync import GranolaSyncRecord
from app.models.touchpoint import Touchpoint
from app.schemas.dealflow import DealflowFounderCreate

logger = logging.getLogger(__name__)

GRANOLA_API_BASE = "https://public-api.granola.ai"

_NOTES_EXTRACTION_SYSTEM = """You are a venture capital analyst. Extract structured deal information from meeting/call notes.

IMPORTANT RULES:
- If the company website is not explicitly mentioned, INFER it from the company name. Try common patterns like "companyname.com", "companyname.ai", "companyname.io", "getcompanyname.com". Pick the most likely one.
- Extract ALL people mentioned with their roles (founder, CEO, CTO, advisor, etc.), not just those explicitly called "founder". The primary speakers who represent the company are likely founders.
- For funding stage: look for clues like "angel round", "pre-seed", "seed round", "raising $X at $Y valuation". A sub-$5M valuation with a small raise is typically pre-seed. $5-15M valuation is seed.
- For valuation/amount: "$3M post-money valuation" means valuation=3000000. "$50K angel round" means amount_raising=50000.
- If a product or brand name is mentioned that differs from the company name, include it in the one-liner.
- The input may contain a structured summary, a raw transcript with speaker labels, and an attendee list. Use ALL of these sources to extract information.
- Attendees listed may include both the VC side and the company side. Identify which attendees belong to the company being discussed (founders, executives).

Return ONLY valid JSON with these keys (use null for unknown fields):
{
  "name": "company name (the legal/brand entity, NOT the product name if different)",
  "one_liner": "one sentence summary of what the company does, mention the product name if it differs from the company name",
  "website": "company website — infer from company name if not explicitly stated, e.g. 'SoinsAI' -> 'soinsai.com' or 'soin.ai'",
  "company_linkedin_url": "company LinkedIn URL if mentioned, or null",
  "location": "city/region if mentioned, or null",
  "stage": "one of: Pre-seed, Seed, Series A, Series B, Growth, Other — infer from context if not explicit",
  "amount_raising": "number in USD (no commas/symbols) or null",
  "valuation": "number in USD (no commas/symbols) or null",
  "founders": [
    {
      "name": "person's full name",
      "role": "their role (Founder, CEO, CTO, etc.)",
      "linkedin_url": "their LinkedIn URL if mentioned, or null",
      "email": "their email if mentioned, or null"
    }
  ],
  "summary": "3-5 bullet point summary of the key takeaways from the call"
}
Do NOT wrap in markdown code fences. Return raw JSON only."""


# ── Granola API Client ────────────────────────────────────────────────────────

class GranolaClient:
    """Thin wrapper around the Granola REST API."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GRANOLA_API_KEY", "")
        if not self.api_key:
            raise ValueError("GRANOLA_API_KEY is not configured")
        self._client = httpx.Client(
            base_url=GRANOLA_API_BASE,
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=30,
        )

    def list_notes(
        self,
        created_after: Optional[str] = None,
        updated_after: Optional[str] = None,
        cursor: Optional[str] = None,
        page_size: int = 30,
    ) -> dict:
        params: dict = {"page_size": page_size}
        if created_after:
            params["created_after"] = created_after
        if updated_after:
            params["updated_after"] = updated_after
        if cursor:
            params["cursor"] = cursor
        resp = self._client.get("/v1/notes", params=params)
        resp.raise_for_status()
        return resp.json()

    def get_note(self, note_id: str, include_transcript: bool = True) -> dict:
        params = {}
        if include_transcript:
            params["include"] = "transcript"
        resp = self._client.get(f"/v1/notes/{note_id}", params=params)
        resp.raise_for_status()
        return resp.json()

    def list_all_notes_since(self, created_after: str) -> list[dict]:
        """Paginate through all notes created after the given ISO timestamp."""
        all_notes: list[dict] = []
        cursor = None
        while True:
            data = self.list_notes(created_after=created_after, cursor=cursor)
            all_notes.extend(data.get("notes", []))
            if not data.get("hasMore"):
                break
            cursor = data.get("cursor")
            if not cursor:
                break
        return all_notes


# ── Note Processing Helpers ───────────────────────────────────────────────────

def _format_transcript(transcript: list[dict] | None) -> str:
    if not transcript:
        return ""
    lines = []
    for seg in transcript:
        speaker_source = seg.get("speaker", {}).get("source", "unknown")
        label = "You" if speaker_source == "microphone" else "Them"
        lines.append(f"[{label}]: {seg.get('text', '')}")
    return "\n".join(lines)


def _build_extraction_input(note: dict) -> str:
    """Combine Granola note fields into a rich text blob for LLM extraction."""
    parts: list[str] = []

    title = note.get("title")
    if title:
        parts.append(f"Meeting: {title}")

    attendees = note.get("attendees") or []
    if attendees:
        att_strs = [f"  - {a.get('name', 'Unknown')} ({a.get('email', 'no email')})" for a in attendees]
        parts.append("Attendees:\n" + "\n".join(att_strs))

    summary = note.get("summary_markdown") or note.get("summary_text")
    if summary:
        parts.append(f"Summary:\n{summary}")

    transcript_text = _format_transcript(note.get("transcript"))
    if transcript_text:
        parts.append(f"Transcript:\n{transcript_text}")

    return "\n\n".join(parts)


def _extract_deal_from_notes(notes_text: str) -> dict:
    """Use LLM to extract structured deal fields from meeting notes."""
    raw = complete(
        prompt=f"Extract deal information from these meeting notes:\n\n{notes_text}",
        system=_NOTES_EXTRACTION_SYSTEM,
        max_tokens=1024,
    )
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```\s*$", "", raw)
    return json.loads(raw)


def _find_existing_company(name: str, db: Session) -> Optional[Company]:
    """Case-insensitive lookup for an existing company by name."""
    return (
        db.query(Company)
        .filter(func.lower(Company.name) == name.lower().strip())
        .first()
    )


def _find_existing_entry(name: str, db: Session) -> Optional[DealflowEntry]:
    """Case-insensitive lookup for an existing dealflow entry by name."""
    return (
        db.query(DealflowEntry)
        .filter(func.lower(DealflowEntry.name) == name.lower().strip())
        .first()
    )


# ── Status mapping (copied from dealflow router for consistency) ──────────────

DEALFLOW_STATUS_TO_DEAL_STATUS: dict[str, str] = {
    "none": "pipeline",
    "lead": "pipeline",
    "tracking": "pipeline",
    "reached_out": "pipeline",
    "active": "active",
    "passed": "passed",
    "invested": "portfolio",
}


# ── Main Sync Engine ──────────────────────────────────────────────────────────

def process_single_note(note: dict, db: Session) -> Optional[str]:
    """
    Process one Granola note: extract deal info, create or update records.
    Returns the dealflow entry ID if a new entry was created, or None if it
    was added as a touchpoint to an existing deal.
    """
    granola_note_id = note["id"]

    already = db.query(GranolaSyncRecord).filter(
        GranolaSyncRecord.granola_note_id == granola_note_id
    ).first()
    if already:
        return None

    extraction_input = _build_extraction_input(note)
    if not extraction_input.strip():
        logger.warning("Granola note %s has no extractable content, skipping", granola_note_id)
        return None

    try:
        extracted = _extract_deal_from_notes(extraction_input)
    except Exception as exc:
        logger.error("LLM extraction failed for Granola note %s: %s", granola_note_id, exc)
        return None

    company_name = extracted.get("name")
    if not company_name:
        logger.warning("Could not extract company name from Granola note %s", granola_note_id)
        return None

    summary_text = extracted.get("summary", "")
    if isinstance(summary_text, list):
        summary_text = "\n".join(f"• {s}" for s in summary_text)

    cal = note.get("calendar_event") or {}
    occurred_at = None
    if cal.get("scheduled_start_time"):
        try:
            occurred_at = datetime.fromisoformat(cal["scheduled_start_time"].replace("Z", "+00:00"))
        except (ValueError, TypeError):
            pass
    if not occurred_at:
        try:
            occurred_at = datetime.fromisoformat(note["created_at"].replace("Z", "+00:00"))
        except (ValueError, TypeError):
            occurred_at = datetime.now(timezone.utc)

    transcript_content = _format_transcript(note.get("transcript"))
    meeting_title = cal.get("event_title") or note.get("title") or f"Meeting — {company_name}"
    full_notes = f"{summary_text}\n\n---\n\n{extraction_input}" if summary_text else extraction_input

    existing_company = _find_existing_company(company_name, db)
    existing_entry = _find_existing_entry(company_name, db) if not existing_company else None

    entry_id = None
    company_id = None

    if existing_company:
        entry_id = existing_company.dealflow_entry_id
        company_id = existing_company.id
        logger.info(
            "Granola note %s: company '%s' already exists (id=%s), adding touchpoint only",
            granola_note_id, company_name, company_id,
        )
    elif existing_entry:
        entry_id = existing_entry.id
        linked_company = db.query(Company).filter(Company.dealflow_entry_id == existing_entry.id).first()
        company_id = linked_company.id if linked_company else None
        logger.info(
            "Granola note %s: entry '%s' already exists (id=%s), adding touchpoint only",
            granola_note_id, company_name, entry_id,
        )
    else:
        entry = DealflowEntry(
            name=company_name,
            website=extracted.get("website"),
            company_linkedin_url=extracted.get("company_linkedin_url"),
            one_liner=extracted.get("one_liner"),
            location=extracted.get("location"),
            stage=extracted.get("stage"),
            amount_raising=extracted.get("amount_raising"),
            valuation=extracted.get("valuation"),
            notes=full_notes,
            source_type="granola",
            source_detail=granola_note_id,
            status="lead",
            logo_url=None,
        )
        db.add(entry)
        db.flush()
        entry_id = entry.id

        company = Company(
            name=entry.name,
            website=entry.website,
            dealflow_entry_id=entry.id,
            entry_valuation=entry.valuation,
            amount_raising=entry.amount_raising,
            investment_stage=entry.stage,
            one_liner=entry.one_liner,
            location=entry.location,
            notes=entry.notes,
            source_type=entry.source_type,
            source_detail=entry.source_detail,
            company_linkedin_url=entry.company_linkedin_url,
            deal_status=DEALFLOW_STATUS_TO_DEAL_STATUS.get(entry.status, "pipeline"),
        )
        db.add(company)
        db.flush()
        company_id = company.id

        founders = extracted.get("founders") or []
        for f in founders:
            if f.get("name"):
                db.add(DealflowFounder(
                    dealflow_entry_id=entry.id,
                    name=f["name"],
                    linkedin_url=f.get("linkedin_url"),
                    email=f.get("email"),
                ))

        logger.info(
            "Granola note %s: created new entry '%s' (entry=%s, company=%s)",
            granola_note_id, company_name, entry_id, company_id,
        )

    tp = Touchpoint(
        dealflow_entry_id=entry_id,
        company_id=company_id,
        type="meeting",
        source="granola",
        title=meeting_title,
        summary=summary_text or None,
        content=transcript_content or full_notes,
        external_link=f"granola://{granola_note_id}",
        occurred_at=occurred_at,
    )
    db.add(tp)

    sync_record = GranolaSyncRecord(
        granola_note_id=granola_note_id,
        dealflow_entry_id=entry_id,
        company_id=company_id,
        note_title=note.get("title"),
    )
    db.add(sync_record)
    db.commit()

    if not existing_company and not existing_entry:
        try:
            from app.services.enrichment import enrich_dealflow_entry
            enrich_dealflow_entry(entry_id, db)
        except Exception as exc:
            logger.warning("Post-sync enrichment failed for entry %s: %s", entry_id, exc)

    return entry_id if (not existing_company and not existing_entry) else None


def _note_in_folder(note: dict, folder_name: str) -> bool:
    """Check if a Granola note belongs to the given folder (case-insensitive)."""
    folders = note.get("folder_membership") or []
    target = folder_name.lower()
    return any(
        (f.get("name") or "").lower() == target
        for f in folders
    )


def process_new_notes() -> dict:
    """
    Poll Granola for new notes and process them.
    Returns a summary dict with counts.
    """
    api_key = os.getenv("GRANOLA_API_KEY", "")
    if not api_key:
        return {"status": "skipped", "reason": "GRANOLA_API_KEY not configured"}

    db = SessionLocal()
    try:
        last_record = (
            db.query(GranolaSyncRecord)
            .order_by(GranolaSyncRecord.processed_at.desc())
            .first()
        )
        if last_record and last_record.processed_at:
            created_after = last_record.processed_at.strftime("%Y-%m-%dT%H:%M:%SZ")
        else:
            created_after = "2020-01-01T00:00:00Z"

        client = GranolaClient(api_key)
        note_summaries = client.list_all_notes_since(created_after)

        if not note_summaries:
            return {"status": "ok", "new_notes": 0, "entries_created": 0}

        folder_filter = os.getenv("GRANOLA_FOLDER_FILTER", "").strip()

        entries_created = 0
        notes_processed = 0
        skipped_folder = 0
        errors = 0

        for note_summary in note_summaries:
            note_id = note_summary["id"]
            existing = db.query(GranolaSyncRecord).filter(
                GranolaSyncRecord.granola_note_id == note_id
            ).first()
            if existing:
                continue

            try:
                full_note = client.get_note(note_id, include_transcript=True)

                if folder_filter and not _note_in_folder(full_note, folder_filter):
                    logger.debug(
                        "Granola note %s (%s) not in folder '%s', skipping",
                        note_id, full_note.get("title"), folder_filter,
                    )
                    skipped_folder += 1
                    continue

                result = process_single_note(full_note, db)
                notes_processed += 1
                if result:
                    entries_created += 1
            except Exception as exc:
                logger.error("Failed to process Granola note %s: %s", note_id, exc)
                errors += 1

        return {
            "status": "ok",
            "new_notes": notes_processed,
            "entries_created": entries_created,
            "skipped_wrong_folder": skipped_folder,
            "errors": errors,
        }
    except Exception as exc:
        logger.error("Granola sync failed: %s", exc)
        return {"status": "error", "reason": str(exc)}
    finally:
        db.close()
