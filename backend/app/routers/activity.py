"""Agent activity / jobs API for the Jarvis panel."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.agent_job import AgentJob
from app.models.company import Company
from app.schemas.activity import AgentJobOut

router = APIRouter(
    prefix="/activity",
    tags=["activity"],
    dependencies=[Depends(get_current_user)],
)

RUNNING_STATUSES = {"pending", "running"}
RECENT_LIMIT = 20


def _job_to_out(job: AgentJob, db: Session) -> dict:
    out = {
        "id": job.id,
        "type": job.type,
        "entity_type": job.entity_type,
        "entity_id": job.entity_id,
        "status": job.status,
        "message": job.message,
        "error": job.error,
        "created_at": job.created_at,
        "completed_at": job.completed_at,
        "updated_at": job.updated_at,
        "entity_label": None,
    }
    if job.entity_type == "company":
        company = db.query(Company).filter(Company.id == job.entity_id).first()
        if company:
            out["entity_label"] = company.name
    return out


@router.get("", response_model=list[AgentJobOut])
def list_activity(db: Session = Depends(get_db)):
    """List running jobs and recent completed/failed. For the Jarvis activity panel."""
    running = (
        db.query(AgentJob)
        .filter(AgentJob.status.in_(RUNNING_STATUSES))
        .order_by(AgentJob.created_at.desc())
        .all()
    )
    completed = (
        db.query(AgentJob)
        .filter(AgentJob.status.notin_(RUNNING_STATUSES))
        .order_by(AgentJob.updated_at.desc())
        .limit(RECENT_LIMIT)
        .all()
    )
    seen = {j.id for j in running}
    combined = list(running)
    for j in completed:
        if j.id not in seen:
            combined.append(j)
            seen.add(j.id)
    return [_job_to_out(j, db) for j in combined]


@router.get("/jobs/{job_id}", response_model=AgentJobOut)
def get_job(job_id: str, db: Session = Depends(get_db)):
    """Get a single job by id (e.g. for polling until done)."""
    job = db.query(AgentJob).filter(AgentJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_out(job, db)
