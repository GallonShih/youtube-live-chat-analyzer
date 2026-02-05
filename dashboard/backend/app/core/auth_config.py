from pydantic_settings import BaseSettings
from functools import lru_cache


class AuthSettings(BaseSettings):
    admin_password: str = "admin123"
    jwt_secret_key: str = "your-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7

    class Config:
        env_prefix = ""
        case_sensitive = False


@lru_cache()
def get_auth_settings() -> AuthSettings:
    return AuthSettings()
