"""
Seed the two admin users for v1. Run once after tables are created.

Usage:
  From backend dir: python -m scripts.seed_admin_users
  Or: python scripts/seed_admin_users.py (with backend on PYTHONPATH)

Set ADMIN_INITIAL_PASSWORD in env, or it defaults to ChangeMe123 (change after first login).
"""
import os
import sys
from pathlib import Path

# Load .env from backend root; then .env.railway so Railway DATABASE_URL overrides
backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))
from dotenv import load_dotenv
load_dotenv(backend_root / ".env")
load_dotenv(backend_root / ".env.railway")  # put DATABASE_URL here to seed Railway Postgres

from app.database import SessionLocal, init_db
from app.models.user import User
from app.auth import hash_password

ADMIN_EMAILS = [
    "murtaza@neweraventures.com",
    "carter@neweraventures.com",
]
DEFAULT_PASSWORD = os.getenv("ADMIN_INITIAL_PASSWORD", "ChangeMe123")


def main():
    init_db()
    db = SessionLocal()
    try:
        password_hash = hash_password(DEFAULT_PASSWORD)
        for email in ADMIN_EMAILS:
            existing = db.query(User).filter(User.email == email).first()
            if existing:
                print(f"User {email} already exists, skipping.")
                continue
            user = User(
                email=email.lower().strip(),
                role="admin",
                password_hash=password_hash,
            )
            db.add(user)
            print(f"Created admin: {email}")
        db.commit()
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
