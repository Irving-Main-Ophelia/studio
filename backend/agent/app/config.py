"""Runtime configuration loaded from environment / .env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Local-only agent service settings."""

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-4-8"
    # Opus 4.8 is used for all calls including planner-style tool calls.
    # set ANTHROPIC_PLANNER_MODEL in .env to override.
    anthropic_planner_model: str = "claude-opus-4-8"

    # Up to 8 tool round-trips per agent turn (Phase 1 budget; PHASE_1.md §1.6).
    agent_max_round_trips: int = 8

    stockhausen_agent_host: str = "127.0.0.1"
    stockhausen_agent_port: int = 8000

    log_level: str = "info"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
