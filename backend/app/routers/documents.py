"""Document upload and ingestion router."""
import os
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
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

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


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

        # Index into RAG
        index_document(company_id, doc.id, text)

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
    """Upload a file (PDF deck)."""
    _check_company(company_id, db)

    # Save file to disk
    ext = os.path.splitext(file.filename or "upload.pdf")[1]
    filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as f:
        f.write(file.file.read())

    doc = Document(
        company_id=company_id,
        type=doc_type,
        storage_path=file_path,
        status="processing",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        text = extract_document(doc_type=doc_type, file_path=file_path)
        doc.extracted_text = text
        doc.status = "ready"
        db.commit()

        # Index into RAG
        index_document(company_id, doc.id, text)

    except Exception as e:
        logger.error(f"File processing failed: {e}")
        doc.status = "error"
        db.commit()

    db.refresh(doc)
    return doc


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


def _check_company(company_id: str, db: Session):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
