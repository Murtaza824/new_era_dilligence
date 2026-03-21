"""Integrations router: Gmail OAuth and email sync."""
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.email_account import EmailAccount
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/integrations",
    tags=["integrations"],
    dependencies=[Depends(get_current_user)],
)


class GmailAuthUrlResponse(BaseModel):
    url: str


class GmailCallbackRequest(BaseModel):
    code: str


class EmailAccountOut(BaseModel):
    id: str
    email: str
    provider: str
    last_sync_at: Optional[str] = None

    model_config = {"from_attributes": True}


@router.get("/gmail/auth-url", response_model=GmailAuthUrlResponse)
def gmail_auth_url(current_user: User = Depends(get_current_user)):
    from app.services.gmail import get_auth_url
    url = get_auth_url(state=current_user.id)
    return {"url": url}


@router.post("/gmail/callback", response_model=EmailAccountOut)
def gmail_callback(
    body: GmailCallbackRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.gmail import exchange_code
    try:
        tokens = exchange_code(body.code)
    except Exception as exc:
        logger.error("Gmail OAuth exchange failed: %s", exc)
        raise HTTPException(status_code=400, detail="Failed to exchange authorization code")

    import httpx
    profile_resp = httpx.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
        timeout=10,
    )
    email = profile_resp.json().get("email", "unknown@gmail.com") if profile_resp.status_code == 200 else "unknown@gmail.com"

    existing = db.query(EmailAccount).filter(
        EmailAccount.user_id == current_user.id,
        EmailAccount.email == email,
    ).first()

    from datetime import datetime, timezone, timedelta

    if existing:
        existing.refresh_token = tokens.get("refresh_token", existing.refresh_token)
        existing.access_token = tokens["access_token"]
        existing.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))
        db.commit()
        db.refresh(existing)
        from app.services.gmail import sync_emails
        background_tasks.add_task(sync_emails, existing.id)
        return existing

    account = EmailAccount(
        user_id=current_user.id,
        email=email,
        provider="gmail",
        refresh_token=tokens.get("refresh_token", ""),
        access_token=tokens["access_token"],
        token_expires_at=datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600)),
    )
    db.add(account)
    db.commit()
    db.refresh(account)

    from app.services.gmail import sync_emails
    background_tasks.add_task(sync_emails, account.id)
    return account


@router.get("/gmail/accounts", response_model=list[EmailAccountOut])
def list_gmail_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(EmailAccount).filter(EmailAccount.user_id == current_user.id).all()


@router.delete("/gmail/accounts/{account_id}")
def disconnect_gmail(
    account_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account = db.query(EmailAccount).filter(
        EmailAccount.id == account_id,
        EmailAccount.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    db.delete(account)
    db.commit()
    return {"ok": True}


@router.post("/gmail/sync")
def trigger_gmail_sync(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    accounts = db.query(EmailAccount).filter(EmailAccount.user_id == current_user.id).all()
    if not accounts:
        raise HTTPException(status_code=404, detail="No Gmail account connected")
    for account in accounts:
        from app.services.gmail import sync_emails
        background_tasks.add_task(sync_emails, account.id)
    return {"ok": True, "message": f"Syncing {len(accounts)} account(s) in background"}
