from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt

from .auth_config import get_auth_settings


class TokenError(Exception):
    """Custom exception for token-related errors."""
    pass


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a new access token."""
    settings = get_auth_settings()
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.jwt_access_token_expire_minutes
        )

    to_encode.update({
        "exp": expire,
        "type": "access"
    })

    encoded_jwt = jwt.encode(
        to_encode,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm
    )
    return encoded_jwt


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a new refresh token."""
    settings = get_auth_settings()
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            days=settings.jwt_refresh_token_expire_days
        )

    to_encode.update({
        "exp": expire,
        "type": "refresh"
    })

    encoded_jwt = jwt.encode(
        to_encode,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm
    )
    return encoded_jwt


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token."""
    settings = get_auth_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError as e:
        raise TokenError(f"Invalid token: {str(e)}")


def verify_access_token(token: str) -> dict:
    """Verify that a token is a valid access token."""
    payload = decode_token(token)

    if payload.get("type") != "access":
        raise TokenError("Invalid token type: expected access token")

    return payload


def verify_refresh_token(token: str) -> dict:
    """Verify that a token is a valid refresh token."""
    payload = decode_token(token)

    if payload.get("type") != "refresh":
        raise TokenError("Invalid token type: expected refresh token")

    return payload
