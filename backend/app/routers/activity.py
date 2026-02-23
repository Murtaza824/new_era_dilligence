"""Agent activity / jobs API for the Jarvis panel, with SSE streaming support."""
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import SessionLocal, get_db
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
    duration = None
    start = getattr(job, "started_at", None) or job.created_at
    if job.completed_at and start:
        duration = (job.completed_at - start).total_seconds()
    elif start and job.status in RUNNING_STATUSES:
        from datetime import datetime, timezone
        duration = (datetime.now(timezone.utc) - start).total_seconds()

    triggered_email = None
    triggered_name = None
    user_id = getattr(job, "triggered_by_user_id", None)
    if user_id:
        from app.models.user import User
        u = db.query(User).filter(User.id == user_id).first()
        if u:
            triggered_email = u.email
            triggered_name = getattr(u, "name", None) or u.email.split("@")[0].capitalize()

    out = {
        "id": job.id,
        "type": job.type,
        "entity_type": job.entity_type,
        "entity_id": job.entity_id,
        "status": job.status,
        "message": job.message,
        "error": job.error,
        "created_at": job.created_at,
        "started_at": getattr(job, "started_at", None),
        "completed_at": job.completed_at,
        "updated_at": job.updated_at,
        "entity_label": None,
        "triggered_by_user_id": user_id,
        "triggered_by_user_email": triggered_email,
        "triggered_by_user_name": triggered_name,
        "duration_seconds": round(duration, 1) if duration is not None else None,
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


async def _sse_activity_stream():
    """SSE generator: push activity updates every 3 seconds."""
    while True:
        db = SessionLocal()
        try:
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
            jobs_data = [_job_to_out(j, db) for j in combined]

            payload = json.dumps({
                "type": "activity_update",
                "jobs": [
                    {
                        "id": j["id"],
                        "type": j["type"],
                        "entity_type": j["entity_type"],
                        "entity_id": j["entity_id"],
                        "status": j["status"],
                        "message": j["message"],
                        "error": j["error"],
                        "created_at": j["created_at"].isoformat() if j["created_at"] else None,
                        "completed_at": j["completed_at"].isoformat() if j["completed_at"] else None,
                        "updated_at": j["updated_at"].isoformat() if j["updated_at"] else None,
                        "entity_label": j.get("entity_label"),
                        "triggered_by_user_email": j.get("triggered_by_user_email"),
                        "triggered_by_user_name": j.get("triggered_by_user_name"),
                        "duration_seconds": j.get("duration_seconds"),
                    }
                    for j in jobs_data
                ],
                "has_running": len(running) > 0,
            }, default=str)

            yield f"data: {payload}\n\n"
        except Exception:
            yield f"data: {json.dumps({'type': 'error'})}\n\n"
        finally:
            db.close()
        await asyncio.sleep(3)


@router.get("/stream")
async def stream_activity():
    """SSE stream of activity updates. Frontend can subscribe for real-time updates."""
    return StreamingResponse(
        _sse_activity_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
