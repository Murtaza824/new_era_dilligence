"""API key authentication for the CoS (Chief of Staff) integration layer.

Completely separate from the JWT-based user auth — no User record needed.
The CoS MCP server sends `Authorization: Bearer <COS_API_KEY>`.
"""

import os

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=False)

COS_API_KEY: str = os.getenv("COS_API_KEY", "")


def require_cos_api_key(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """FastAPI dependency that validates the Bearer token against COS_API_KEY."""
    if not COS_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CoS API key not configured on server",
        )
    if (
        not credentials
        or credentials.scheme.lower() != "bearer"
        or credentials.credentials != COS_API_KEY
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials
