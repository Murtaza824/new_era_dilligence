import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the backend directory before any other imports that need env vars
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import hash_password
from app.database import SessionLocal, init_db
from app.models import AgentJob, ContactIntroductionSuggestion, NetworkContact, User  # import so create_all creates tables
from app.routers import activity, agent_chat, auth, companies, dealflow, documents, integrations, locations, memos, network, news, portfolio, simulations, touchpoints, tracked_persons

logger = logging.getLogger("jarvis")

ADMIN_EMAILS = ["murtaza@neweraventures.com", "carter@neweraventures.com"]
ADMIN_DEFAULT_PASSWORD = os.getenv("ADMIN_INITIAL_PASSWORD", "ChangeMe123")


def _seed_admin_if_empty():
    """Create default admin users if no users exist (e.g. fresh Railway deploy)."""
    db = SessionLocal()
    try:
        if db.query(User).first() is not None:
            return
        password_hash = hash_password(ADMIN_DEFAULT_PASSWORD)
        for email in ADMIN_EMAILS:
            name = email.split("@")[0].capitalize()
            user = User(
                email=email.lower().strip(),
                name=name,
                role="admin",
                password_hash=password_hash,
            )
            db.add(user)
        db.commit()
        logger.info("Seeded default admin users (no users existed).")
    except Exception as e:
        logger.warning("Seed admin skipped or failed: %s", e)
        db.rollback()
    finally:
        db.close()

# CORS: comma-separated origins, e.g. "http://localhost:3000,https://myapp.vercel.app"
_CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001")
CORS_ORIGINS_LIST = [o.strip() for o in _CORS_ORIGINS.split(",") if o.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create DB tables and seed admin users if empty
    init_db()
    _seed_admin_if_empty()
    yield


app = FastAPI(title="Jarvis API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS_LIST,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers (auth is public; rest require admin)
app.include_router(activity.router)
app.include_router(agent_chat.router)
app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(dealflow.router)
app.include_router(documents.router)
app.include_router(memos.router)
app.include_router(network.router)
app.include_router(news.router)
app.include_router(portfolio.router)
app.include_router(simulations.router)
app.include_router(tracked_persons.router)
app.include_router(locations.router)
app.include_router(touchpoints.router)
app.include_router(integrations.router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/admin/backup-status")
def backup_status():
    """Report the latest successful backup timestamp from S3."""
    import os
    bucket = os.getenv("BACKUP_S3_BUCKET")
    prefix = os.getenv("BACKUP_S3_PREFIX", "jarvis-backups")
    if not bucket:
        return {"status": "not_configured", "message": "BACKUP_S3_BUCKET not set"}
    try:
        import boto3
        s3 = boto3.client("s3", region_name=os.getenv("AWS_REGION", "us-east-1"))
        obj = s3.get_object(Bucket=bucket, Key=f"{prefix}/latest.txt")
        content = obj["Body"].read().decode().strip().split("\n")
        return {
            "status": "ok",
            "last_backup_timestamp": content[0] if content else None,
            "last_backup_key": content[1] if len(content) > 1 else None,
            "last_backup_size": content[2] if len(content) > 2 else None,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
