"""
Database setup — SQLAlchemy with SQLite (dev) or PostgreSQL (prod/local).
"""
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./jarvis.db")

# Railway and some hosts use postgres://; SQLAlchemy/psycopg2 expect postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL.split("://", 1)[1]

# SQLite needs check_same_thread=False; Postgres does not
connect_args = {}
if "sqlite" in DATABASE_URL:
    connect_args["check_same_thread"] = False

# Postgres: verify connections before use (helps with Railway / serverless)
engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session and closes after request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_portfolio_factors():
    """Add factor columns to portfolio_snapshots if missing (e.g. existing DBs)."""
    if "sqlite" not in DATABASE_URL:
        return
    with engine.connect() as conn:
        r = conn.execute(text("PRAGMA table_info(portfolio_snapshots)"))
        cols = {row[1] for row in r.fetchall()}
        for col, typ in [
            ("sector", "VARCHAR"),
            ("geography", "VARCHAR"),
            ("founder_type", "VARCHAR"),
            ("outlier_probability", "FLOAT"),
        ]:
            if col not in cols:
                conn.execute(
                    text(
                        f"ALTER TABLE portfolio_snapshots ADD COLUMN {col} {typ}"
                    )
                )
                conn.commit()


def init_db():
    """Create all tables. Called on startup."""
    Base.metadata.create_all(bind=engine)
    _migrate_portfolio_factors()
