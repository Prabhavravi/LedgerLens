from typing import Literal, Optional
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/ledgerlens"
    APP_SECRET: str = "development-only-change-me-before-production"
    NODE_ENV: Literal["development", "test", "production"] = "development"
    AI_PROVIDER: str = "openai"       # "openai" | "anthropic" | "local"
    OPENAI_API_KEY: Optional[str] = None
    AI_MODEL_NAME: str = "gpt-4o-mini"
    SESSION_COOKIE_NAME: str = "ledgerlens_session"
    SESSION_DURATION_SECONDS: int = 60 * 60 * 24 * 7
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @model_validator(mode="after")
    def require_production_secrets(self):
        if self.NODE_ENV == "production" and (self.DATABASE_URL.startswith("postgresql://postgres:postgres@") or self.APP_SECRET == "development-only-change-me-before-production"):
            raise ValueError("Production DATABASE_URL and APP_SECRET must be configured through environment variables.")
        return self


settings = Settings()
