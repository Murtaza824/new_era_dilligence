"""Memo generation, retrieval, revision, and export router."""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.company import Company
from app.models.document import Document
from app.models.memo import Memo, MemoRevision
from app.schemas.memo import MemoOut, MemoSectionOut, RefineSectionRequest, AddContextRequest
from app.agents.memo_orchestrator import generate_memo
from app.agents.memo_sections import refine_section, SECTIONS, generate_section
from app.services.rag import index_document

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/companies/{company_id}/memo",
    tags=["memos"],
    dependencies=[Depends(get_current_user)],
)


@router.post("/generate", response_model=MemoOut)
def generate(company_id: str, db: Session = Depends(get_db)):
    """Generate a full investment memo from uploaded documents."""
    company = _get_company(company_id, db)

    # Check that documents exist
    doc_count = db.query(Document).filter(
        Document.company_id == company_id,
        Document.status == "ready",
    ).count()
    if doc_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No documents available. Upload at least one document before generating a memo.",
        )

    # Get current version
    existing = (
        db.query(Memo)
        .filter(Memo.company_id == company_id)
        .order_by(Memo.version.desc())
        .first()
    )
    next_version = (existing.version + 1) if existing else 1

    # Generate memo via agents
    result = generate_memo(company_id, company.name)

    # Save to DB
    memo = Memo(
        company_id=company_id,
        version=next_version,
        content=result["content"],
        sections_json=json.dumps(result["sections"]),
    )
    db.add(memo)
    db.commit()
    db.refresh(memo)

    # Save revision audit trail
    revision = MemoRevision(
        memo_id=memo.id,
        content=result["content"],
    )
    db.add(revision)
    db.commit()

    return _to_memo_out(memo)


@router.get("", response_model=MemoOut)
def get_latest_memo(company_id: str, db: Session = Depends(get_db)):
    """Get the latest memo for a company."""
    _get_company(company_id, db)
    memo = (
        db.query(Memo)
        .filter(Memo.company_id == company_id)
        .order_by(Memo.version.desc())
        .first()
    )
    if not memo:
        raise HTTPException(status_code=404, detail="No memo found. Generate one first.")
    return _to_memo_out(memo)


@router.post("/revise", response_model=MemoOut)
def revise_memo(company_id: str, db: Session = Depends(get_db)):
    """Re-generate the memo with any new documents. Creates a new version."""
    # Same as generate — it picks up all current documents from the RAG store
    return generate(company_id, db)


@router.get("/export")
def export_memo(company_id: str, format: str = "md", db: Session = Depends(get_db)):
    """Export the latest memo as Markdown (PDF export can be added later)."""
    _get_company(company_id, db)
    memo = (
        db.query(Memo)
        .filter(Memo.company_id == company_id)
        .order_by(Memo.version.desc())
        .first()
    )
    if not memo:
        raise HTTPException(status_code=404, detail="No memo found.")

    if format == "md":
        return PlainTextResponse(
            content=memo.content,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename=memo_v{memo.version}.md"},
        )
    else:
        raise HTTPException(status_code=400, detail="Only 'md' format is currently supported.")


@router.get("/versions", response_model=list[MemoOut])
def list_versions(company_id: str, db: Session = Depends(get_db)):
    """List all memo versions for a company."""
    _get_company(company_id, db)
    memos = (
        db.query(Memo)
        .filter(Memo.company_id == company_id)
        .order_by(Memo.version.desc())
        .all()
    )
    return [_to_memo_out(m) for m in memos]


@router.post("/section/refine", response_model=MemoOut)
def refine_memo_section(
    company_id: str,
    body: RefineSectionRequest,
    db: Session = Depends(get_db),
):
    """Refine a single section of the latest memo using user instructions."""
    _get_company(company_id, db)

    memo = (
        db.query(Memo)
        .filter(Memo.company_id == company_id)
        .order_by(Memo.version.desc())
        .first()
    )
    if not memo:
        raise HTTPException(status_code=404, detail="No memo found. Generate one first.")

    # Parse current sections
    sections = json.loads(memo.sections_json) if memo.sections_json else []
    section_idx = next(
        (i for i, s in enumerate(sections) if s["title"] == body.section_title),
        None,
    )
    if section_idx is None:
        raise HTTPException(status_code=400, detail=f"Section '{body.section_title}' not found in memo.")

    # Refine the section
    current_content = sections[section_idx]["content"]
    result = refine_section(company_id, body.section_title, current_content, body.instructions)

    # Update the section in place
    sections[section_idx] = result

    # Rebuild full content from sections
    company = _get_company(company_id, db)
    full_parts = [f"# Investment Memo: {company.name}\n"]
    for s in sections:
        full_parts.append(f"## {s['title']}\n\n{s['content']}")
    full_content = "\n\n---\n\n".join(full_parts)

    # Update the memo in DB (same version, updated content)
    memo.sections_json = json.dumps(sections)
    memo.content = full_content
    db.commit()
    db.refresh(memo)

    # Audit trail
    revision = MemoRevision(
        memo_id=memo.id,
        content=full_content,
        created_by="user",
    )
    db.add(revision)
    db.commit()

    return _to_memo_out(memo)


@router.post("/section/regenerate", response_model=MemoOut)
def regenerate_memo_section(
    company_id: str,
    body: RefineSectionRequest,
    db: Session = Depends(get_db),
):
    """Regenerate a single section from scratch using RAG (ignores current content)."""
    _get_company(company_id, db)

    memo = (
        db.query(Memo)
        .filter(Memo.company_id == company_id)
        .order_by(Memo.version.desc())
        .first()
    )
    if not memo:
        raise HTTPException(status_code=404, detail="No memo found. Generate one first.")

    sections = json.loads(memo.sections_json) if memo.sections_json else []
    section_idx = next(
        (i for i, s in enumerate(sections) if s["title"] == body.section_title),
        None,
    )
    if section_idx is None:
        raise HTTPException(status_code=400, detail=f"Section '{body.section_title}' not found.")

    # Find section definition and regenerate from scratch
    section_def = next((s for s in SECTIONS if s["title"] == body.section_title), None)
    if not section_def:
        raise HTTPException(status_code=400, detail=f"Unknown section: {body.section_title}")

    # If instructions provided, append them to the section prompt
    if body.instructions:
        modified_def = {**section_def, "prompt": section_def["prompt"] + f"\n\nAdditional guidance: {body.instructions}"}
        result = generate_section(company_id, modified_def)
    else:
        result = generate_section(company_id, section_def)

    # Update the section
    sections[section_idx] = result

    # Rebuild full content
    company = _get_company(company_id, db)
    full_parts = [f"# Investment Memo: {company.name}\n"]
    for s in sections:
        full_parts.append(f"## {s['title']}\n\n{s['content']}")
    full_content = "\n\n---\n\n".join(full_parts)

    memo.sections_json = json.dumps(sections)
    memo.content = full_content
    db.commit()
    db.refresh(memo)

    revision = MemoRevision(memo_id=memo.id, content=full_content, created_by="user")
    db.add(revision)
    db.commit()

    return _to_memo_out(memo)


@router.post("/add-context", response_model=MemoSectionOut)
def add_context(
    company_id: str,
    body: AddContextRequest,
    db: Session = Depends(get_db),
):
    """Add ad-hoc notes/context to the company's knowledge base for future memo generations."""
    company = _get_company(company_id, db)

    # Store as a document
    from app.models.document import Document
    doc = Document(
        company_id=company_id,
        type="other",
        extracted_text=body.content.strip(),
        status="ready",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Index into RAG
    index_document(company_id, doc.id, body.content.strip())

    return MemoSectionOut(
        title="Context added",
        content=f"Added {len(body.content.strip())} characters of context. This will be used in future memo generations and refinements.",
    )


# ── Helpers ───────────────────────────────────────────────────────────────


def _get_company(company_id: str, db: Session) -> Company:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def _to_memo_out(memo: Memo) -> dict:
    sections = []
    if memo.sections_json:
        try:
            raw = json.loads(memo.sections_json)
            sections = [MemoSectionOut(**s) for s in raw]
        except Exception:
            pass
    return {
        "id": memo.id,
        "company_id": memo.company_id,
        "version": memo.version,
        "content": memo.content or "",
        "sections": sections,
        "created_at": memo.created_at,
        "created_by": memo.created_by,
    }
