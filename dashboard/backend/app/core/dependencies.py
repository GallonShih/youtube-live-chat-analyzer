from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .security import verify_access_token, TokenError

# Optional bearer token - allows unauthenticated access
optional_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_bearer)
) -> dict:
    """
    Get the current user from the Authorization header.
    Returns guest user if no token is provided.
    """
    if credentials is None:
        return {"role": "guest"}

    try:
        payload = verify_access_token(credentials.credentials)
        return {"role": payload.get("role", "guest")}
    except TokenError:
        return {"role": "guest"}


def require_admin(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_bearer)
) -> dict:
    """
    Require admin authentication.
    Raises 401 if not authenticated, 403 if not admin.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = verify_access_token(credentials.credentials)
    except TokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )

    return {"role": "admin"}
