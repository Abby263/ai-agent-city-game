from collections.abc import Generator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.models import Base

settings = get_settings()

def _normalize_database_url(raw_url: str) -> str:
    if raw_url.startswith("postgres://"):
        raw_url = "postgresql+psycopg://" + raw_url.removeprefix("postgres://")
    elif raw_url.startswith("postgresql://"):
        raw_url = "postgresql+psycopg://" + raw_url.removeprefix("postgresql://")

    parsed = urlsplit(raw_url)
    if parsed.scheme.startswith("postgresql+psycopg"):
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        host = parsed.hostname or ""
        if "sslmode" not in query and (
            "supabase.co" in host or "pooler.supabase.com" in host or "neon.tech" in host
        ):
            query["sslmode"] = "require"
        raw_url = urlunsplit(
            (parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment)
        )
    return raw_url


database_url = _normalize_database_url(settings.resolved_database_url)

connect_args = {}
if ":6543/" in database_url or "pooler.supabase.com" in database_url:
    # Supabase transaction pooler does not support prepared statements.
    connect_args["prepare_threshold"] = None

engine = create_engine(database_url, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    if engine.dialect.name.startswith("postgresql"):
        with engine.begin() as connection:
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
