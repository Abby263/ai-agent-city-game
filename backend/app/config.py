from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AgentCity"
    city_id: str = "navora"
    city_name: str = "Navora"
    memory_storage: Literal["short_term", "postgres"] = "short_term"
    database_url: str = ""
    supabase_database_url: str | None = None
    neon_database_url: str | None = None
    database_fallback_url: str = "sqlite+pysqlite:////tmp/agentcity-short-term.db"
    allow_ephemeral_db_fallback: bool = True
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
        if self.memory_storage == "short_term":
            return self.database_fallback_url

        url = self.database_url or self.supabase_database_url or self.neon_database_url or ""
        if not url and self.allow_ephemeral_db_fallback:
            return self.database_fallback_url
        if not url:
            raise ValueError(
                "DATABASE_URL, SUPABASE_DATABASE_URL, or NEON_DATABASE_URL is required. "
                "Set MEMORY_STORAGE=short_term for an ephemeral local/Vercel database, or use a cloud "
                "Postgres connection string for durable memory."
            )
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
