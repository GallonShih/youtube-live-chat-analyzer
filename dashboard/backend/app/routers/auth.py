from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel

from app.core.auth_config import get_auth_settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
    TokenError,
)
from app.core.dependencies import get_current_user, optional_bearer

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    role: str


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest):
    """
    Authenticate with admin password and receive JWT tokens.
    """
    settings = get_auth_settings()

    if not request.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is required",
        )

    if request.password != settings.admin_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create tokens with admin role
    token_data = {"role": "admin"}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/refresh", response_model=AccessTokenResponse)
def refresh(request: RefreshRequest):
    """
    Refresh access token using a valid refresh token.
    """
    try:
        payload = verify_refresh_token(request.refresh_token)
    except TokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create new access token with same role
    token_data = {"role": payload.get("role", "guest")}
    access_token = create_access_token(token_data)

    return AccessTokenResponse(access_token=access_token)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: dict = Depends(get_current_user)):
    """
    Get current user information.
    Returns guest role if not authenticated.
    """
    return UserResponse(role=current_user["role"])


@router.post("/logout")
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(optional_bearer)
):
    """
    Logout endpoint.
    Client should clear tokens on their side.
    Returns success message.
    """
    # Logout is a no-op on server side, client should clear tokens
    return {"message": "Logged out successfully"}
