from __future__ import annotations

from hashlib import sha256
from uuid import uuid4

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import MemoryORM, utcnow


class MemoryStore:
    def __init__(self, settings: Settings, embedding_client: object | None = None):
        self.settings = settings
        self.embedding_client = embedding_client

    def add_memory(
        self,
        db: Session,
        *,
        citizen_id: str,
        kind: str,
        content: str,
        importance: float = 0.5,
        salience: float = 0.5,
        related_citizen_id: str | None = None,
        source_event_id: str | None = None,
        extra: dict | None = None,
        embedding: list[float] | None = None,
    ) -> MemoryORM:
        memory = MemoryORM(
            memory_id=f"mem_{uuid4().hex[:16]}",
            citizen_id=citizen_id,
            kind=kind,
            content=content,
            importance=importance,
            salience=salience,
            related_citizen_id=related_citizen_id,
            source_event_id=source_event_id,
            embedding=embedding,
            extra=extra or {},
            created_at=utcnow(),
        )
        db.add(memory)
        return memory

    def retrieve(
        self,
        db: Session,
        *,
        citizen_id: str,
        query: str,
        limit: int = 5,
        query_embedding: list[float] | None = None,
    ) -> list[MemoryORM]:
        dialect = db.get_bind().dialect.name
        if query_embedding and dialect.startswith("postgresql"):
            try:
                statement = (
                    select(MemoryORM)
                    .where(MemoryORM.citizen_id == citizen_id)
                    .where(MemoryORM.embedding.is_not(None))
                    .order_by(MemoryORM.embedding.cosine_distance(query_embedding))  # type: ignore[attr-defined]
                    .limit(limit)
                )
                return list(db.scalars(statement))
            except Exception:
                pass

        query_terms = {term.lower() for term in query.split() if len(term) > 3}
        memories = list(
            db.scalars(
                select(MemoryORM)
                .where(MemoryORM.citizen_id == citizen_id)
                .order_by(desc(MemoryORM.importance), desc(MemoryORM.created_at))
                .limit(50)
            )
        )
        scored: list[tuple[float, MemoryORM]] = []
        for memory in memories:
            text = memory.content.lower()
            overlap = sum(1 for term in query_terms if term in text)
            recency = 0.1 if memory.kind in {"episodic", "relationship"} else 0
            scored.append((memory.importance + memory.salience + overlap * 0.2 + recency, memory))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [memory for _score, memory in scored[:limit]]

    @staticmethod
    def deterministic_embedding(text: str, dimensions: int = 1536) -> list[float]:
        digest = sha256(text.encode("utf-8")).digest()
        values: list[float] = []
        while len(values) < dimensions:
            for byte in digest:
                values.append((byte / 255.0) * 2 - 1)
                if len(values) == dimensions:
                    break
            digest = sha256(digest).digest()
        return values
