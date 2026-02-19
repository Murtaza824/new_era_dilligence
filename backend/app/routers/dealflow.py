"""Dealflow CRM: top-of-funnel entries, founders, documents, promote to Deal Room."""
import os
import tempfile
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.company import Company
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
    company = db.query(Company).filter(Company.dealflow_entry_id == entry.id).first()
    if company:
        promoted_company_id = company.id
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


@router.post("/entries", response_model=DealflowEntryOut)
def create_entry(
    body: DealflowEntryCreate,
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


# ——— Promote to Deal Room ———

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
            detail=f"Already promoted to Deal Room (company id: {existing.id})",
        )
    company = Company(
        name=entry.name,
        website=entry.website,
        dealflow_entry_id=entry_id,
        entry_valuation=entry.valuation,
        amount_raising=entry.amount_raising,
        investment_stage=entry.stage,
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
    return PromoteToDealRoomOut(company_id=company.id)
