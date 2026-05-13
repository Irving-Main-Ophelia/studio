"""Runtime configuration loaded from environment / .env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Local-only agent service settings."""

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    stockhausen_agent_host: str = "127.0.0.1"
    stockhausen_agent_port: int = 8000

    log_level: str = "info"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
