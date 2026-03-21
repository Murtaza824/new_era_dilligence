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


def _migrate_company_logo():
    """Add logo_url and website to companies if missing."""
    with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            r = conn.execute(text("PRAGMA table_info(companies)"))
            cols = {row[1] for row in r.fetchall()}
            if "logo_url" not in cols:
                conn.execute(text("ALTER TABLE companies ADD COLUMN logo_url VARCHAR"))
                conn.commit()
            if "website" not in cols:
                conn.execute(text("ALTER TABLE companies ADD COLUMN website VARCHAR"))
                conn.commit()
        else:
            conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url VARCHAR"))
            conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS website VARCHAR"))
            conn.commit()


def _migrate_company_deal_fields():
    """Add deal fields to companies if missing."""
    with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            r = conn.execute(text("PRAGMA table_info(companies)"))
            cols = {row[1] for row in r.fetchall()}
            for col, typ in [("entry_valuation", "FLOAT"), ("amount_raising", "FLOAT"), ("investment_stage", "VARCHAR")]:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE companies ADD COLUMN {col} {typ}"))
                    conn.commit()
        else:
            conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS entry_valuation FLOAT"))
            conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS amount_raising FLOAT"))
            conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS investment_stage VARCHAR"))
            conn.commit()


def _migrate_document_file_columns():
    """Add file_content and original_filename to documents if missing (persist uploads in DB)."""
    with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            r = conn.execute(text("PRAGMA table_info(documents)"))
            cols = {row[1] for row in r.fetchall()}
            if "file_content" not in cols:
                conn.execute(text("ALTER TABLE documents ADD COLUMN file_content BLOB"))
                conn.commit()
            if "original_filename" not in cols:
                conn.execute(text("ALTER TABLE documents ADD COLUMN original_filename VARCHAR"))
                conn.commit()
        else:
            # PostgreSQL
            conn.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_content BYTEA"))
            conn.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_filename VARCHAR"))
            conn.commit()


def _migrate_network_contact_lp_columns():
    """Add NEV Fund I / Syndicate LP columns to network_contacts if missing."""
    with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            try:
                r = conn.execute(text("PRAGMA table_info(network_contacts)"))
            except Exception:
                return  # table may not exist yet
            cols = {row[1] for row in r.fetchall()}
            for col, typ in [("nev_fund_i_lp", "BOOLEAN"), ("nev_syndicate_lp", "BOOLEAN")]:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE network_contacts ADD COLUMN {col} {typ} DEFAULT 0"))
                    conn.commit()
        else:
            conn.execute(text("ALTER TABLE network_contacts ADD COLUMN IF NOT EXISTS nev_fund_i_lp BOOLEAN DEFAULT FALSE"))
            conn.execute(text("ALTER TABLE network_contacts ADD COLUMN IF NOT EXISTS nev_syndicate_lp BOOLEAN DEFAULT FALSE"))
            conn.commit()


def _migrate_network_contact_extra_columns():
    """Add phone_number, location, skills to network_contacts if missing."""
    with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            try:
                r = conn.execute(text("PRAGMA table_info(network_contacts)"))
            except Exception:
                return
            cols = {row[1] for row in r.fetchall()}
            for col in ("phone_number", "location", "skills"):
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE network_contacts ADD COLUMN {col} VARCHAR"))
                    conn.commit()
        else:
            conn.execute(text("ALTER TABLE network_contacts ADD COLUMN IF NOT EXISTS phone_number VARCHAR"))
            conn.execute(text("ALTER TABLE network_contacts ADD COLUMN IF NOT EXISTS location VARCHAR"))
            conn.execute(text("ALTER TABLE network_contacts ADD COLUMN IF NOT EXISTS skills VARCHAR"))
            conn.commit()


def _migrate_company_dealflow_entry_id():
    """Add dealflow_entry_id to companies if missing (link from Deal Room back to Dealflow)."""
    with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            r = conn.execute(text("PRAGMA table_info(companies)"))
            cols = {row[1] for row in r.fetchall()}
            if "dealflow_entry_id" not in cols:
                conn.execute(text("ALTER TABLE companies ADD COLUMN dealflow_entry_id VARCHAR"))
                conn.commit()
        else:
            conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS dealflow_entry_id VARCHAR"))
            conn.commit()


def _migrate_company_dealflow_origin_fields():
    """Add dealflow-origin fields to companies for continuity on promote."""
    new_cols = [
        ("one_liner", "VARCHAR"),
        ("location", "VARCHAR"),
        ("notes", "TEXT"),
        ("source_type", "VARCHAR"),
        ("source_detail", "VARCHAR"),
        ("company_linkedin_url", "VARCHAR"),
    ]
    with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            r = conn.execute(text("PRAGMA table_info(companies)"))
            cols = {row[1] for row in r.fetchall()}
            for col, typ in new_cols:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE companies ADD COLUMN {col} {typ}"))
                    conn.commit()
        else:
            for col, typ in new_cols:
                conn.execute(text(f"ALTER TABLE companies ADD COLUMN IF NOT EXISTS {col} {typ}"))
            conn.commit()


def _migrate_agent_job_extra_columns():
    """Add triggered_by_user_id, started_at to agent_jobs if missing."""
    new_cols = [
        ("triggered_by_user_id", "VARCHAR"),
        ("started_at", "DATETIME"),
    ]
    with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            try:
                r = conn.execute(text("PRAGMA table_info(agent_jobs)"))
            except Exception:
                return
            cols = {row[1] for row in r.fetchall()}
            for col, typ in new_cols:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE agent_jobs ADD COLUMN {col} {typ}"))
                    conn.commit()
        else:
            for col, typ in new_cols:
                pg_type = "TIMESTAMP" if typ == "DATETIME" else typ
                conn.execute(text(f"ALTER TABLE agent_jobs ADD COLUMN IF NOT EXISTS {col} {pg_type}"))
            conn.commit()


def _migrate_network_contact_expanded_fields():
    """Add expanded Airtable fields to network_contacts if missing."""
    new_cols = [
        ("profile_pic_url", "VARCHAR"),
        ("related_companies", "TEXT"),
        ("stage", "VARCHAR"),
        ("vc_firm_name", "VARCHAR"),
        ("startup_name", "VARCHAR"),
        ("investor_check_size", "VARCHAR"),
        ("introductions_made", "TEXT"),
        ("introduced_us_to", "TEXT"),
        ("interested_lp", "BOOLEAN", "DEFAULT 0", "DEFAULT FALSE"),
        ("investor_in", "TEXT"),
        ("warm", "BOOLEAN", "DEFAULT 0", "DEFAULT FALSE"),
        ("syndicate_member", "BOOLEAN", "DEFAULT 0", "DEFAULT FALSE"),
        ("quarterly_update_list", "BOOLEAN", "DEFAULT 0", "DEFAULT FALSE"),
        ("notes_2", "TEXT"),
        ("intros_made_for_us", "INTEGER", "DEFAULT 0", "DEFAULT 0"),
        ("intros_we_made", "INTEGER", "DEFAULT 0", "DEFAULT 0"),
        ("check_sizes", "VARCHAR"),
    ]
    with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            try:
                r = conn.execute(text("PRAGMA table_info(network_contacts)"))
            except Exception:
                return
            cols = {row[1] for row in r.fetchall()}
            for entry in new_cols:
                col = entry[0]
                typ = entry[1]
                default = entry[2] if len(entry) > 2 else ""
                if col not in cols:
                    sql = f"ALTER TABLE network_contacts ADD COLUMN {col} {typ}"
                    if default:
                        sql += f" {default}"
                    conn.execute(text(sql))
                    conn.commit()
        else:
            for entry in new_cols:
                col = entry[0]
                typ = entry[1]
                default = entry[3] if len(entry) > 3 else (entry[2] if len(entry) > 2 else "")
                sql = f"ALTER TABLE network_contacts ADD COLUMN IF NOT EXISTS {col} {typ}"
                if default:
                    sql += f" {default}"
                conn.execute(text(sql))
            conn.commit()


def _migrate_intro_suggestion_dealflow():
    """Add target_dealflow_entry_id to contact_introduction_suggestions if missing."""
    with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            try:
                r = conn.execute(text("PRAGMA table_info(contact_introduction_suggestions)"))
            except Exception:
                return
            cols = {row[1] for row in r.fetchall()}
            if "target_dealflow_entry_id" not in cols:
                conn.execute(
                    text("ALTER TABLE contact_introduction_suggestions ADD COLUMN target_dealflow_entry_id VARCHAR")
                )
                conn.commit()
        else:
            conn.execute(
                text(
                    "ALTER TABLE contact_introduction_suggestions ADD COLUMN IF NOT EXISTS target_dealflow_entry_id VARCHAR REFERENCES dealflow_entries(id)"
                )
            )
            conn.commit()


def _migrate_intro_suggestion_tracked_person():
    """Add tracked_person_id to contact_introduction_suggestions and make network_contact_id nullable."""
    with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            try:
                r = conn.execute(text("PRAGMA table_info(contact_introduction_suggestions)"))
            except Exception:
                return
            cols = {row[1] for row in r.fetchall()}
            if "tracked_person_id" not in cols:
                conn.execute(
                    text("ALTER TABLE contact_introduction_suggestions ADD COLUMN tracked_person_id VARCHAR")
                )
                conn.commit()
        else:
            conn.execute(
                text(
                    "ALTER TABLE contact_introduction_suggestions ADD COLUMN IF NOT EXISTS tracked_person_id VARCHAR REFERENCES tracked_persons(id)"
                )
            )
            conn.commit()


def _migrate_news_item_analysis_fields():
    """Add sentiment, topics, insight, importance columns to news_items if missing."""
    new_cols = [
        ("sentiment", "VARCHAR"),
        ("topics", "VARCHAR"),
        ("insight", "TEXT"),
        ("importance", "VARCHAR"),
    ]
    with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            try:
                r = conn.execute(text("PRAGMA table_info(news_items)"))
            except Exception:
                return
            cols = {row[1] for row in r.fetchall()}
            for col, typ in new_cols:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE news_items ADD COLUMN {col} {typ}"))
                    conn.commit()
        else:
            for col, typ in new_cols:
                conn.execute(text(f"ALTER TABLE news_items ADD COLUMN IF NOT EXISTS {col} {typ}"))
            conn.commit()


def _migrate_company_deal_status():
    """Add deal_status column to companies table."""
    with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            try:
                r = conn.execute(text("PRAGMA table_info(companies)"))
            except Exception:
                return
            cols = {row[1] for row in r.fetchall()}
            if "deal_status" not in cols:
                conn.execute(text("ALTER TABLE companies ADD COLUMN deal_status TEXT DEFAULT 'active' NOT NULL"))
                conn.commit()
        else:
            conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS deal_status TEXT DEFAULT 'active' NOT NULL"))
            conn.commit()


def _migrate_user_name():
    """Add name column to users table and populate from email prefix."""
    with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            try:
                r = conn.execute(text("PRAGMA table_info(users)"))
            except Exception:
                return
            cols = {row[1] for row in r.fetchall()}
            if "name" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR"))
                conn.commit()
        else:
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR"))
            conn.commit()
        if "sqlite" in DATABASE_URL:
            conn.execute(text(
                "UPDATE users SET name = UPPER(SUBSTR(email, 1, 1)) || SUBSTR(email, 2, INSTR(email, '@') - 2) "
                "WHERE name IS NULL"
            ))
        else:
            conn.execute(text(
                "UPDATE users SET name = UPPER(SUBSTR(email, 1, 1)) || SUBSTR(email, 2, POSITION('@' IN email) - 2) "
                "WHERE name IS NULL"
            ))
        conn.commit()


def _migrate_portfolio_deal_status():
    """Set deal_status='portfolio' for companies that are already in the portfolio table."""
    with engine.connect() as conn:
        conn.execute(text(
            "UPDATE companies SET deal_status = 'portfolio' "
            "WHERE id IN (SELECT company_id FROM portfolio_snapshots WHERE company_id IS NOT NULL) "
            "AND deal_status != 'portfolio'"
        ))
        conn.commit()


def _seed_locations():
    """Seed initial location suggestions if the table is empty."""
    db = SessionLocal()
    try:
        from app.models.location import Location
        if db.query(Location).first() is not None:
            return
        for name in ["NYC", "San Francisco", "Boston", "Los Angeles"]:
            db.add(Location(name=name))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _migrate_dealflow_logo_url():
    """Add logo_url to dealflow_entries if missing."""
    with engine.connect() as conn:
        if "sqlite" in DATABASE_URL:
            try:
                r = conn.execute(text("PRAGMA table_info(dealflow_entries)"))
            except Exception:
                return
            cols = {row[1] for row in r.fetchall()}
            if "logo_url" not in cols:
                conn.execute(text("ALTER TABLE dealflow_entries ADD COLUMN logo_url VARCHAR"))
                conn.commit()
        else:
            conn.execute(text("ALTER TABLE dealflow_entries ADD COLUMN IF NOT EXISTS logo_url VARCHAR"))
            conn.commit()


def init_db():
    """Create all tables. Called on startup."""
    Base.metadata.create_all(bind=engine)
    _seed_locations()
    _migrate_dealflow_logo_url()
    _migrate_portfolio_factors()
    _migrate_company_logo()
    _migrate_company_deal_fields()
    _migrate_document_file_columns()
    _migrate_network_contact_lp_columns()
    _migrate_network_contact_extra_columns()
    _migrate_network_contact_expanded_fields()
    _migrate_company_dealflow_entry_id()
    _migrate_company_dealflow_origin_fields()
    _migrate_agent_job_extra_columns()
    _migrate_intro_suggestion_dealflow()
    _migrate_intro_suggestion_tracked_person()
    _migrate_news_item_analysis_fields()
    _migrate_company_deal_status()
    _migrate_user_name()
    _migrate_portfolio_deal_status()
