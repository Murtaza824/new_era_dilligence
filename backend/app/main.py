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
from app.routers import activity, auth, companies, dealflow, documents, memos, network, portfolio, simulations

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
            user = User(
                email=email.lower().strip(),
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
app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(dealflow.router)
app.include_router(documents.router)
app.include_router(memos.router)
app.include_router(network.router)
app.include_router(portfolio.router)
app.include_router(simulations.router)


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
