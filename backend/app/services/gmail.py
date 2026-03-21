"""
Gmail integration: OAuth token management, email fetching, and domain-based association.
"""
import logging
import os
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:3000/settings/gmail/callback")
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


def get_auth_url(state: str = "") -> str:
    from urllib.parse import urlencode
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
    }
    if state:
        params["state"] = state
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    import httpx
    resp = httpx.post("https://oauth2.googleapis.com/token", data={
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": GOOGLE_REDIRECT_URI,
    })
    resp.raise_for_status()
    return resp.json()


def refresh_access_token(refresh_token: str) -> dict:
    import httpx
    resp = httpx.post("https://oauth2.googleapis.com/token", data={
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    })
    resp.raise_for_status()
    return resp.json()


def _get_valid_token(account) -> str:
    """Get a valid access token, refreshing if needed."""
    if account.access_token and account.token_expires_at and account.token_expires_at > datetime.now(timezone.utc):
        return account.access_token
    tokens = refresh_access_token(account.refresh_token)
    account.access_token = tokens["access_token"]
    from datetime import timedelta
    account.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))
    return account.access_token


def sync_emails(account_id: str) -> int:
    """Fetch recent emails from Gmail and store new ones. Returns count of new messages."""
    from app.database import SessionLocal
    from app.models.email_account import EmailAccount
    from app.models.email_message import EmailMessage
    from app.models.touchpoint import Touchpoint

    db = SessionLocal()
    created_count = 0
    try:
        account = db.query(EmailAccount).filter(EmailAccount.id == account_id).first()
        if not account:
            return 0

        access_token = _get_valid_token(account)
        db.commit()

        import httpx
        headers = {"Authorization": f"Bearer {access_token}"}
        resp = httpx.get(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
            params={"maxResults": 50, "q": "newer_than:7d"},
            headers=headers,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        messages = data.get("messages", [])

        for msg_ref in messages:
            msg_id = msg_ref["id"]
            if db.query(EmailMessage).filter(EmailMessage.message_id == msg_id).first():
                continue

            msg_resp = httpx.get(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}",
                params={"format": "metadata", "metadataHeaders": ["Subject", "From", "To", "Date"]},
                headers=headers,
                timeout=15,
            )
            if msg_resp.status_code != 200:
                continue

            msg_data = msg_resp.json()
            headers_list = msg_data.get("payload", {}).get("headers", [])
            header_map = {h["name"].lower(): h["value"] for h in headers_list}

            email_msg = EmailMessage(
                email_account_id=account.id,
                message_id=msg_id,
                thread_id=msg_data.get("threadId"),
                subject=header_map.get("subject"),
                sender=header_map.get("from"),
                recipients=header_map.get("to"),
                snippet=msg_data.get("snippet"),
                date=_parse_date(header_map.get("date")),
            )

            _auto_associate(email_msg, db)
            db.add(email_msg)
            created_count += 1

            if email_msg.company_id or email_msg.dealflow_entry_id:
                tp = Touchpoint(
                    company_id=email_msg.company_id,
                    dealflow_entry_id=email_msg.dealflow_entry_id,
                    type="email",
                    source="email_sync",
                    title=email_msg.subject or "Email",
                    summary=email_msg.snippet,
                    external_link=f"https://mail.google.com/mail/u/0/#inbox/{msg_id}",
                    occurred_at=email_msg.date or datetime.now(timezone.utc),
                )
                db.add(tp)

        account.last_sync_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        logger.error("Gmail sync failed for account %s: %s", account_id, exc)
        db.rollback()
    finally:
        db.close()

    return created_count


def _auto_associate(email_msg, db: Session) -> None:
    """Match email to a company or dealflow entry by sender/recipient domain."""
    domains = set()
    for field in [email_msg.sender, email_msg.recipients]:
        if not field:
            continue
        for part in field.split(","):
            at = part.rfind("@")
            if at > 0:
                domain = part[at + 1:].strip().rstrip(">").lower()
                if domain and not domain.endswith(("gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com")):
                    domains.add(domain)

    if not domains:
        return

    from app.models.company import Company
    from app.models.dealflow_entry import DealflowEntry

    for domain in domains:
        company = db.query(Company).filter(Company.website.ilike(f"%{domain}%")).first()
        if company:
            email_msg.company_id = company.id
            return

        entry = db.query(DealflowEntry).filter(DealflowEntry.website.ilike(f"%{domain}%")).first()
        if entry:
            email_msg.dealflow_entry_id = entry.id
            return


def _parse_date(date_str: Optional[str]) -> Optional[datetime]:
    if not date_str:
        return None
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(date_str)
    except Exception:
        return None
