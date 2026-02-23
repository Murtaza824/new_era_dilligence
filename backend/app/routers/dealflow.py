"""Dealflow CRM: top-of-funnel entries, founders, documents, promote to Active Deals."""
import os
import tempfile
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import SessionLocal, get_db
from app.models.company import Company
from app.services.matchmaking import run_matchmaking_for_dealflow_entry
from app.models.dealflow_document import DealflowDocument
from app.models.dealflow_entry import DealflowEntry
from app.models.dealflow_founder import DealflowFounder
from app.models.document import Document
from app.models.user import User
from app.schemas.dealflow import (
    DealflowDocumentCreate,
    DealflowDocumentOut,
    DealflowEntryCreate,
    DealflowEntryOut,
    DealflowEntryUpdate,
    DealflowFounderCreate,
    DealflowFounderOut,
    DealflowFromNotesRequest,
    PromoteToDealRoomOut,
)

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/dealflow",
    tags=["dealflow"],
    dependencies=[Depends(get_current_user)],
)


def _entry_to_out(entry: DealflowEntry, db: Session) -> DealflowEntryOut:
    founders = (
        db.query(DealflowFounder)
        .filter(DealflowFounder.dealflow_entry_id == entry.id)
        .order_by(DealflowFounder.name)
        .all()
    )
    doc_count = (
        db.query(DealflowDocument).filter(DealflowDocument.dealflow_entry_id == entry.id).count()
    )
    promoted_company_id = None
    promoted_company_deal_status = None
    company = db.query(Company).filter(Company.dealflow_entry_id == entry.id).first()
    if company:
        promoted_company_id = company.id
        promoted_company_deal_status = getattr(company, "deal_status", None)
    return DealflowEntryOut(
        id=entry.id,
        name=entry.name,
        website=entry.website,
        company_linkedin_url=entry.company_linkedin_url,
        one_liner=entry.one_liner,
        location=entry.location,
        stage=entry.stage,
        amount_raising=entry.amount_raising,
        valuation=entry.valuation,
        notes=entry.notes,
        source_type=entry.source_type,
        source_detail=entry.source_detail,
        status=entry.status,
        added_by_user_id=entry.added_by_user_id,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        founders=[DealflowFounderOut.model_validate(f) for f in founders],
        document_count=doc_count,
        promoted_company_id=promoted_company_id,
        promoted_company_deal_status=promoted_company_deal_status,
    )


def _set_founders(entry_id: str, founders: list[DealflowFounderCreate], db: Session) -> None:
    db.query(DealflowFounder).filter(DealflowFounder.dealflow_entry_id == entry_id).delete()
    for f in founders or []:
        db.add(
            DealflowFounder(
                dealflow_entry_id=entry_id,
                name=f.name,
                linkedin_url=f.linkedin_url,
                twitter_url=f.twitter_url,
                email=f.email,
            )
        )
    db.commit()


def _run_matchmaking_background(entry_id: str, trigger: str) -> None:
    """Run dealflow matchmaking in a background task with its own DB session."""
    db = SessionLocal()
    try:
        run_matchmaking_for_dealflow_entry(entry_id, db, trigger=trigger)
    finally:
        db.close()


@router.post("/entries", response_model=DealflowEntryOut)
def create_entry(
    body: DealflowEntryCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = DealflowEntry(
        name=body.name,
        website=body.website,
        company_linkedin_url=body.company_linkedin_url,
        one_liner=body.one_liner,
        location=body.location,
        stage=body.stage,
        amount_raising=body.amount_raising,
        valuation=body.valuation,
        notes=body.notes,
        source_type=body.source_type,
        source_detail=body.source_detail,
        status=body.status or "none",
        added_by_user_id=current_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    if body.founders:
        _set_founders(entry.id, body.founders, db)
    background_tasks.add_task(_run_matchmaking_background, entry.id, "dealflow_entry_created")
    return _entry_to_out(entry, db)


_NOTES_EXTRACTION_SYSTEM = """You are a venture capital analyst. Extract structured deal information from meeting/call notes.
Return ONLY valid JSON with these keys (use null for unknown fields):
{
  "name": "company or product name being discussed (NOT the person's name unless they ARE the company)",
  "one_liner": "one sentence summary of what the company does",
  "website": "company website if mentioned, or null",
  "company_linkedin_url": "company LinkedIn URL if mentioned, or null",
  "location": "city/region if mentioned, or null",
  "stage": "one of: pre_seed, seed, series_a, series_b, growth, other — or null",
  "amount_raising": "number in USD (no commas/symbols) or null",
  "valuation": "number in USD (no commas/symbols) or null",
  "founders": [{"name": "founder name", "linkedin_url": null, "email": null}],
  "summary": "3-5 bullet point summary of the key takeaways from the call"
}
Do NOT wrap in markdown code fences. Return raw JSON only."""


def _extract_deal_from_notes(notes_text: str) -> dict:
    """Use LLM to extract structured deal fields from raw call notes."""
    import json
    import re
    from app.llm import complete

    raw = complete(
        prompt=f"Extract deal information from these meeting notes:\n\n{notes_text}",
        system=_NOTES_EXTRACTION_SYSTEM,
        max_tokens=1024,
    )
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```\s*$", "", raw)
    return json.loads(raw)


def _try_fetch_url(url: str) -> Optional[str]:
    """Best-effort fetch of a URL, returning extracted text or None."""
    try:
        import httpx
        from bs4 import BeautifulSoup

        resp = httpx.get(url, timeout=15, follow_redirects=True, headers={
            "User-Agent": "Mozilla/5.0 (compatible; JarvisBot/1.0)"
        })
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        return soup.get_text(separator="\n", strip=True)
    except Exception as exc:
        logger.warning("Failed to fetch URL %s: %s", url, exc)
        return None


@router.post("/entries/from-notes", response_model=DealflowEntryOut)
def create_entry_from_notes(
    body: DealflowFromNotesRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notes_text = body.text
    if not notes_text and body.url:
        notes_text = _try_fetch_url(body.url)
    if not notes_text or not notes_text.strip():
        raise HTTPException(status_code=400, detail="Please provide call notes text or a valid URL")

    try:
        extracted = _extract_deal_from_notes(notes_text)
    except Exception as exc:
        logger.error("LLM extraction failed: %s", exc)
        raise HTTPException(status_code=422, detail="Could not extract deal info from notes")

    name = extracted.get("name")
    if not name:
        raise HTTPException(status_code=422, detail="Could not identify a company name from the notes")

    summary = extracted.get("summary", "")
    if isinstance(summary, list):
        summary = "\n".join(f"• {s}" for s in summary)
    full_notes = f"{summary}\n\n---\n\n{notes_text}" if summary else notes_text

    entry = DealflowEntry(
        name=name,
        website=extracted.get("website"),
        company_linkedin_url=extracted.get("company_linkedin_url"),
        one_liner=extracted.get("one_liner"),
        location=extracted.get("location"),
        stage=extracted.get("stage"),
        amount_raising=extracted.get("amount_raising"),
        valuation=extracted.get("valuation"),
        notes=full_notes,
        source_type="call_notes",
        source_detail=body.url or None,
        status="none",
        added_by_user_id=current_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    founders = extracted.get("founders") or []
    if founders:
        founder_creates = [
            DealflowFounderCreate(
                name=f.get("name", "Unknown"),
                linkedin_url=f.get("linkedin_url"),
                email=f.get("email"),
            )
            for f in founders
            if f.get("name")
        ]
        if founder_creates:
            _set_founders(entry.id, founder_creates, db)

    background_tasks.add_task(_run_matchmaking_background, entry.id, "dealflow_entry_created")
    return _entry_to_out(entry, db)


@router.get("/entries", response_model=list[DealflowEntryOut])
def list_entries(
    q: Optional[str] = Query(None, description="Search across all fields"),
    status: Optional[str] = Query(None),
    source_type: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(DealflowEntry).order_by(DealflowEntry.created_at.desc())
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                DealflowEntry.name.ilike(term),
                DealflowEntry.website.ilike(term),
                DealflowEntry.company_linkedin_url.ilike(term),
                DealflowEntry.one_liner.ilike(term),
                DealflowEntry.location.ilike(term),
                DealflowEntry.stage.ilike(term),
                DealflowEntry.source_type.ilike(term),
                DealflowEntry.source_detail.ilike(term),
                DealflowEntry.status.ilike(term),
                DealflowEntry.notes.ilike(term),
            )
        )
    if status is not None and status.strip():
        query = query.filter(DealflowEntry.status == status.strip())
    if source_type is not None and source_type.strip():
        query = query.filter(DealflowEntry.source_type == source_type.strip())
    if stage is not None and stage.strip():
        query = query.filter(DealflowEntry.stage == stage.strip())
    entries = query.all()
    return [_entry_to_out(e, db) for e in entries]


@router.get("/entries/{entry_id}", response_model=DealflowEntryOut)
def get_entry(entry_id: str, db: Session = Depends(get_db)):
    entry = db.query(DealflowEntry).filter(DealflowEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Dealflow entry not found")
    return _entry_to_out(entry, db)


@router.patch("/entries/{entry_id}", response_model=DealflowEntryOut)
def update_entry(
    entry_id: str,
    body: DealflowEntryUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    entry = db.query(DealflowEntry).filter(DealflowEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Dealflow entry not found")
    data = body.model_dump(exclude_unset=True)
    founders = data.pop("founders", None)
    for field, value in data.items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    if founders is not None:
        _set_founders(entry_id, [DealflowFounderCreate(**f) for f in founders], db)
    background_tasks.add_task(_run_matchmaking_background, entry.id, "dealflow_entry_updated")
    return _entry_to_out(entry, db)


@router.delete("/entries/{entry_id}")
def delete_entry(entry_id: str, db: Session = Depends(get_db)):
    entry = db.query(DealflowEntry).filter(DealflowEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Dealflow entry not found")
    db.delete(entry)
    db.commit()
    return {"ok": True}


# ——— Founders sub-resource (optional: also manageable via PATCH entry with founders) ———

@router.post("/entries/{entry_id}/founders", response_model=DealflowFounderOut)
def add_founder(
    entry_id: str,
    body: DealflowFounderCreate,
    db: Session = Depends(get_db),
):
    entry = db.query(DealflowEntry).filter(DealflowEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Dealflow entry not found")
    founder = DealflowFounder(
        dealflow_entry_id=entry_id,
        name=body.name,
        linkedin_url=body.linkedin_url,
        twitter_url=body.twitter_url,
        email=body.email,
    )
    db.add(founder)
    db.commit()
    db.refresh(founder)
    return founder


@router.delete("/entries/{entry_id}/founders/{founder_id}")
def delete_founder(
    entry_id: str,
    founder_id: str,
    db: Session = Depends(get_db),
):
    founder = (
        db.query(DealflowFounder)
        .filter(
            DealflowFounder.id == founder_id,
            DealflowFounder.dealflow_entry_id == entry_id,
        )
        .first()
    )
    if not founder:
        raise HTTPException(status_code=404, detail="Founder not found")
    db.delete(founder)
    db.commit()
    return {"ok": True}


# ——— Documents ———

def _check_entry(entry_id: str, db: Session) -> DealflowEntry:
    entry = db.query(DealflowEntry).filter(DealflowEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Dealflow entry not found")
    return entry


@router.post("/entries/{entry_id}/documents", response_model=DealflowDocumentOut)
def create_document_link(
    entry_id: str,
    body: DealflowDocumentCreate,
    db: Session = Depends(get_db),
):
    _check_entry(entry_id, db)
    doc = DealflowDocument(
        dealflow_entry_id=entry_id,
        type=body.type,
        url=body.url,
        status="processing",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    if body.url:
        try:
            from app.services.extraction import extract_document
            text = extract_document(doc_type="website", url=body.url)
            doc.extracted_text = text
            doc.status = "ready"
            db.commit()
            db.refresh(doc)
        except Exception as e:
            logger.warning("Dealflow doc URL extraction failed: %s", e)
            doc.status = "error"
            db.commit()
            db.refresh(doc)
    else:
        doc.status = "ready"
        db.commit()
        db.refresh(doc)
    return doc


@router.post("/entries/{entry_id}/documents/upload", response_model=DealflowDocumentOut)
def upload_document_file(
    entry_id: str,
    file: UploadFile = File(...),
    doc_type: str = Form("pitch_deck"),
    db: Session = Depends(get_db),
):
    _check_entry(entry_id, db)
    file_bytes = file.file.read()
    original_filename = (file.filename or "upload.pdf").strip() or "upload.pdf"
    doc = DealflowDocument(
        dealflow_entry_id=entry_id,
        type=doc_type,
        original_filename=original_filename,
        file_content=file_bytes,
        status="processing",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    file_path = None
    try:
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=os.path.splitext(original_filename)[1]
        ) as tmp:
            tmp.write(file_bytes)
            file_path = tmp.name
        from app.services.extraction import extract_document
        text = extract_document(doc_type="deck", file_path=file_path)
        doc.extracted_text = text
        doc.status = "ready"
        db.commit()
        db.refresh(doc)
    except Exception as e:
        logger.warning("Dealflow doc file extraction failed: %s", e)
        doc.status = "error"
        db.commit()
        db.refresh(doc)
    finally:
        if file_path and os.path.isfile(file_path):
            try:
                os.unlink(file_path)
            except OSError:
                pass
    return doc


@router.get("/entries/{entry_id}/documents", response_model=list[DealflowDocumentOut])
def list_documents(entry_id: str, db: Session = Depends(get_db)):
    _check_entry(entry_id, db)
    docs = (
        db.query(DealflowDocument)
        .filter(DealflowDocument.dealflow_entry_id == entry_id)
        .order_by(DealflowDocument.created_at.desc())
        .all()
    )
    return docs


@router.get("/entries/{entry_id}/documents/{document_id}/file")
def download_document_file(
    entry_id: str,
    document_id: str,
    db: Session = Depends(get_db),
):
    _check_entry(entry_id, db)
    doc = (
        db.query(DealflowDocument)
        .filter(
            DealflowDocument.id == document_id,
            DealflowDocument.dealflow_entry_id == entry_id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.file_content:
        raise HTTPException(status_code=404, detail="File not stored (link-only document)")
    filename = doc.original_filename or "document.pdf"
    media_type = (
        "application/pdf" if filename.lower().endswith(".pdf") else "application/octet-stream"
    )
    return Response(
        content=bytes(doc.file_content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/entries/{entry_id}/documents/{document_id}")
def delete_document(
    entry_id: str,
    document_id: str,
    db: Session = Depends(get_db),
):
    _check_entry(entry_id, db)
    doc = (
        db.query(DealflowDocument)
        .filter(
            DealflowDocument.id == document_id,
            DealflowDocument.dealflow_entry_id == entry_id,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()
    return {"ok": True}


# ——— Promote to Active Deals ———

@router.post("/entries/{entry_id}/promote-to-deal-room", response_model=PromoteToDealRoomOut)
def promote_to_deal_room(
    entry_id: str,
    copy_documents: bool = Query(True),
    db: Session = Depends(get_db),
):
    entry = db.query(DealflowEntry).filter(DealflowEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Dealflow entry not found")
    existing = db.query(Company).filter(Company.dealflow_entry_id == entry_id).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Already promoted to Active Deals (company id: {existing.id})",
        )
    company = Company(
        name=entry.name,
        website=entry.website,
        dealflow_entry_id=entry_id,
        entry_valuation=entry.valuation,
        amount_raising=entry.amount_raising,
        investment_stage=entry.stage,
        one_liner=entry.one_liner,
        location=entry.location,
        notes=entry.notes,
        source_type=entry.source_type,
        source_detail=entry.source_detail,
        company_linkedin_url=entry.company_linkedin_url,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    if copy_documents:
        dealflow_docs = (
            db.query(DealflowDocument)
            .filter(
                DealflowDocument.dealflow_entry_id == entry_id,
                DealflowDocument.file_content.isnot(None),
            )
            .all()
        )
        for d in dealflow_docs:
            doc = Document(
                company_id=company.id,
                type="deck" if d.type == "pitch_deck" else "other",
                original_filename=d.original_filename,
                file_content=d.file_content,
                extracted_text=d.extracted_text,
                status=d.status or "ready",
            )
            db.add(doc)
        db.commit()
    # Capture data needed by background tasks before returning
    _company_id = company.id
    _entry_id = entry_id
    _entry_name = entry.name
    _entry_one_liner = entry.one_liner
    _entry_location = entry.location
    _entry_notes = entry.notes
    _has_docs = copy_documents and db.query(Document).filter(
        Document.company_id == _company_id
    ).count() > 0
    _founder_names = ", ".join(
        f.name for f in db.query(DealflowFounder).filter(
            DealflowFounder.dealflow_entry_id == _entry_id
        ).all()
    )

    import threading

    def _post_promote_tasks():
        from app.database import SessionLocal
        bg_db = SessionLocal()
        try:
            from app.services.matchmaking import run_matchmaking_for_new_company
            run_matchmaking_for_new_company(_company_id, bg_db, trigger="dealflow_promoted")
        except Exception as exc:
            logger.warning("Matchmaking after promote failed: %s", exc)

        try:
            if _has_docs:
                from app.models.agent_job import AgentJob
                job = AgentJob(
                    type="memo_generate",
                    entity_type="company",
                    entity_id=_company_id,
                    status="pending",
                    message="Auto-triggered on promote to Active Deals",
                )
                bg_db.add(job)
                bg_db.commit()
                bg_db.refresh(job)
                from app.routers.memos import _run_memo_generation_background
                _run_memo_generation_background(job.id)
        except Exception as exc:
            logger.warning("Auto memo generation after promote failed: %s", exc)

        try:
            context_parts = [f"Company: {_entry_name}"]
            if _entry_one_liner:
                context_parts.append(f"One-liner: {_entry_one_liner}")
            if _entry_location:
                context_parts.append(f"Location: {_entry_location}")
            if _entry_notes:
                context_parts.append(f"Notes: {_entry_notes}")
            if _founder_names:
                context_parts.append(f"Founders: {_founder_names}")
            if len(context_parts) > 1:
                from app.services.rag import index_document as rag_index
                rag_index(_company_id, f"dealflow_context_{_entry_id}", "\n".join(context_parts))
        except Exception as exc:
            logger.warning("RAG context seeding after promote failed: %s", exc)
        finally:
            bg_db.close()

    threading.Thread(target=_post_promote_tasks, daemon=True).start()

    return PromoteToDealRoomOut(company_id=company.id)
