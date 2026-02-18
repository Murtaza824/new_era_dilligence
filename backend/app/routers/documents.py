"""Document upload and ingestion router."""
import os
import tempfile
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.company import Company
from app.models.document import Document
from app.schemas.document import DocumentCreate, DocumentOut
from app.services.extraction import extract_document
from app.services.rag import index_document

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/companies/{company_id}/documents",
    tags=["documents"],
    dependencies=[Depends(get_current_user)],
)


@router.post("", response_model=DocumentOut)
def upload_document_json(
    company_id: str,
    body: DocumentCreate,
    db: Session = Depends(get_db),
):
    """Upload a document via JSON (call_notes or website URL)."""
    _check_company(company_id, db)

    doc = Document(
        company_id=company_id,
        type=body.type,
        url=body.url,
        status="processing",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        text = extract_document(
            doc_type=body.type,
            content=body.content,
            url=body.url,
        )
        doc.extracted_text = text
        doc.status = "ready"
        db.commit()

        # Index into RAG (non-fatal: doc stays "ready" if indexing fails)
        try:
            index_document(company_id, doc.id, text)
        except Exception as e:
            logger.warning("RAG indexing failed (doc still ready): %s", e)

        # Resolve and store company logo when adding a website
        if body.type == "website" and body.url:
            try:
                from app.services.logo import resolve_logo_url
                logo_url = resolve_logo_url(body.url)
                if logo_url:
                    company = db.query(Company).filter(Company.id == company_id).first()
                    if company:
                        company.logo_url = logo_url
                        db.commit()
            except Exception as e:
                logger.warning("Logo resolution failed: %s", e)
    except Exception as e:
        logger.error(f"Document processing failed: {e}")
        doc.status = "error"
        db.commit()

    db.refresh(doc)
    return doc


@router.post("/upload", response_model=DocumentOut)
def upload_document_file(
    company_id: str,
    file: UploadFile = File(...),
    doc_type: str = Form("deck"),
    db: Session = Depends(get_db),
):
    """Upload a file (PDF deck). File bytes are stored in the DB so they persist and can be downloaded from any device."""
    _check_company(company_id, db)

    file_bytes = file.file.read()
    original_filename = (file.filename or "upload.pdf").strip() or "upload.pdf"

    doc = Document(
        company_id=company_id,
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
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(original_filename)[1]) as tmp:
            tmp.write(file_bytes)
            file_path = tmp.name
        text = extract_document(doc_type=doc_type, file_path=file_path)
        doc.extracted_text = text
        doc.status = "ready"
        db.commit()

        try:
            index_document(company_id, doc.id, text)
        except Exception as e:
            logger.warning("RAG indexing failed (doc still ready): %s", e)
    except Exception as e:
        logger.error(f"File processing failed: {e}")
        doc.status = "error"
        db.commit()
    finally:
        if file_path and os.path.isfile(file_path):
            try:
                os.unlink(file_path)
            except OSError:
                pass

    db.refresh(doc)
    return doc


@router.post("/reindex")
def reindex_company_documents(
    company_id: str,
    db: Session = Depends(get_db),
):
    """Re-index all ready documents for this company into RAG (for memo generation). Use after fixing OPENAI_API_KEY or adding a persistent Chroma volume."""
    _check_company(company_id, db)
    docs = (
        db.query(Document)
        .filter(
            Document.company_id == company_id,
            Document.status == "ready",
            Document.extracted_text.isnot(None),
        )
        .all()
    )
    from app.services.rag import delete_company_index, index_document

    delete_company_index(company_id)
    total_chunks = 0
    for doc in docs:
        if doc.extracted_text and doc.extracted_text.strip():
            total_chunks += index_document(company_id, doc.id, doc.extracted_text)
    return {"indexed": len(docs), "chunks": total_chunks}


@router.get("", response_model=list[DocumentOut])
def list_documents(company_id: str, db: Session = Depends(get_db)):
    _check_company(company_id, db)
    docs = (
        db.query(Document)
        .filter(Document.company_id == company_id)
        .order_by(Document.created_at.desc())
        .all()
    )
    return docs


@router.get("/{document_id}/file")
def download_document_file(
    company_id: str,
    document_id: str,
    db: Session = Depends(get_db),
):
    """Download the original file (e.g. PDF). Available to any logged-in user who can access the company."""
    _check_company(company_id, db)
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.company_id == company_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.file_content:
        raise HTTPException(status_code=404, detail="File not stored (legacy upload)")
    filename = doc.original_filename or "document.pdf"
    media_type = "application/pdf" if filename.lower().endswith(".pdf") else "application/octet-stream"
    return Response(
        content=bytes(doc.file_content),
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.delete("/{document_id}")
def delete_document(
    company_id: str,
    document_id: str,
    db: Session = Depends(get_db),
):
    """Delete a document. Any logged-in user who can access the company can delete."""
    _check_company(company_id, db)
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.company_id == company_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()
    return {"ok": True}


def _check_company(company_id: str, db: Session):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
