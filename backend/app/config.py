from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AgentCity"
    city_id: str = "navora"
    city_name: str = "Navora"
    database_url: str = ""
    supabase_database_url: str | None = None
    neon_database_url: str | None = None
    redis_url: str | None = None
    cors_origins: str = "http://localhost:3000"

    llm_mode: Literal["real", "mock"] = "mock"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-nano"
    openai_embedding_model: str = "text-embedding-3-small"
    max_llm_calls_per_tick: int = Field(default=2, ge=0, le=25)
    max_conversations_per_tick: int = Field(default=1, ge=0, le=10)
    llm_cognition_interval_ticks: int = Field(default=4, ge=1, le=96)
    tick_minutes: int = Field(default=15, ge=5, le=60)
    active_citizen_ids: str = "cit_009,cit_010,cit_021,cit_022,cit_026"

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def parsed_cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def real_llm_enabled(self) -> bool:
        return self.llm_mode == "real" and bool(self.openai_api_key)

    @property
    def parsed_active_citizen_ids(self) -> list[str]:
        if self.active_citizen_ids.strip().lower() == "all":
            return []
        return [citizen_id.strip() for citizen_id in self.active_citizen_ids.split(",") if citizen_id.strip()]

    @property
    def resolved_database_url(self) -> str:
        url = self.database_url or self.supabase_database_url or self.neon_database_url or ""
        if not url:
            raise ValueError(
                "DATABASE_URL, SUPABASE_DATABASE_URL, or NEON_DATABASE_URL is required. "
                "Use a cloud Postgres connection string for normal app runs."
            )
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
