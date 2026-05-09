from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

try:
    from pgvector.sqlalchemy import Vector
except Exception:  # pragma: no cover - fallback only used without pgvector installed

    class Vector(TypeDecorator):  # type: ignore[no-redef]
        impl = JSON
        cache_ok = True

        def __init__(self, dimensions: int):
            self.dimensions = dimensions
            super().__init__()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class SimulationStateORM(Base):
    __tablename__ = "simulation_states"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    city_name: Mapped[str] = mapped_column(String(120), default="Navora")
    day: Mapped[int] = mapped_column(Integer, default=1)
    minute_of_day: Mapped[int] = mapped_column(Integer, default=6 * 60)
    tick: Mapped[int] = mapped_column(Integer, default=0)
    running: Mapped[bool] = mapped_column(Boolean, default=False)
    policy: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LocationORM(Base):
    __tablename__ = "locations"

    location_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    type: Mapped[str] = mapped_column(String(64))
    x: Mapped[int] = mapped_column(Integer)
    y: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    capacity: Mapped[int] = mapped_column(Integer)
    open_hours: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    services: Mapped[list[str]] = mapped_column(JSON, default=list)
    inventory: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    workers: Mapped[list[str]] = mapped_column(JSON, default=list)
    visitors: Mapped[list[str]] = mapped_column(JSON, default=list)


class CitizenORM(Base):
    __tablename__ = "citizens"

    citizen_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    age: Mapped[int] = mapped_column(Integer)
    profession: Mapped[str] = mapped_column(String(80))
    home_location_id: Mapped[str] = mapped_column(String(64), ForeignKey("locations.location_id"))
    work_location_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_location_id: Mapped[str] = mapped_column(String(64), ForeignKey("locations.location_id"))
    x: Mapped[int] = mapped_column(Integer)
    y: Mapped[int] = mapped_column(Integer)
    target_x: Mapped[int] = mapped_column(Integer)
    target_y: Mapped[int] = mapped_column(Integer)
    money: Mapped[float] = mapped_column(Float, default=120.0)
    health: Mapped[float] = mapped_column(Float, default=90.0)
    hunger: Mapped[float] = mapped_column(Float, default=20.0)
    energy: Mapped[float] = mapped_column(Float, default=80.0)
    stress: Mapped[float] = mapped_column(Float, default=20.0)
    happiness: Mapped[float] = mapped_column(Float, default=70.0)
    reputation: Mapped[float] = mapped_column(Float, default=50.0)
    family_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    friend_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    relationship_scores: Mapped[dict[str, float]] = mapped_column(JSON, default=dict)
    skills: Mapped[list[str]] = mapped_column(JSON, default=list)
    personality: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    daily_schedule: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    short_term_goals: Mapped[list[str]] = mapped_column(JSON, default=list)
    long_term_goals: Mapped[list[str]] = mapped_column(JSON, default=list)
    current_activity: Mapped[str] = mapped_column(String(160), default="Starting the day")
    current_thought: Mapped[str] = mapped_column(Text, default="")
    memory_summary: Mapped[str] = mapped_column(Text, default="")
    mood: Mapped[str] = mapped_column(String(80), default="Steady")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    memories: Mapped[list["MemoryORM"]] = relationship(back_populates="citizen")


class CityEventORM(Base):
    __tablename__ = "city_events"

    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    game_day: Mapped[int] = mapped_column(Integer)
    game_minute: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(80))
    location_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actors: Mapped[list[str]] = mapped_column(JSON, default=list)
    description: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    priority: Mapped[int] = mapped_column(Integer, default=1)
    visibility: Mapped[str] = mapped_column(String(40), default="public")


class MemoryORM(Base):
    __tablename__ = "memories"

    memory_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    citizen_id: Mapped[str] = mapped_column(String(64), ForeignKey("citizens.citizen_id"))
    kind: Mapped[str] = mapped_column(String(60))
    content: Mapped[str] = mapped_column(Text)
    importance: Mapped[float] = mapped_column(Float, default=0.5)
    salience: Mapped[float] = mapped_column(Float, default=0.5)
    related_citizen_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_event_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536), nullable=True)
    extra: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    citizen: Mapped[CitizenORM] = relationship(back_populates="memories")


class RelationshipORM(Base):
    __tablename__ = "relationships"

    relationship_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    citizen_id: Mapped[str] = mapped_column(String(64), ForeignKey("citizens.citizen_id"))
    other_citizen_id: Mapped[str] = mapped_column(String(64), ForeignKey("citizens.citizen_id"))
    trust: Mapped[float] = mapped_column(Float, default=50.0)
    warmth: Mapped[float] = mapped_column(Float, default=50.0)
    familiarity: Mapped[float] = mapped_column(Float, default=30.0)
    notes: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ConversationORM(Base):
    __tablename__ = "conversations"

    conversation_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    game_day: Mapped[int] = mapped_column(Integer)
    game_minute: Mapped[int] = mapped_column(Integer)
    location_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actor_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    transcript: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    summary: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ReflectionORM(Base):
    __tablename__ = "reflections"

    reflection_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    citizen_id: Mapped[str] = mapped_column(String(64), ForeignKey("citizens.citizen_id"))
    game_day: Mapped[int] = mapped_column(Integer)
    game_minute: Mapped[int] = mapped_column(Integer)
    prompt: Mapped[str] = mapped_column(Text)
    insight: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DailyPlanORM(Base):
    __tablename__ = "daily_plans"

    plan_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    citizen_id: Mapped[str] = mapped_column(String(64), ForeignKey("citizens.citizen_id"))
    game_day: Mapped[int] = mapped_column(Integer)
    goals: Mapped[list[str]] = mapped_column(JSON, default=list)
    planned_actions: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MayorPolicyORM(Base):
    __tablename__ = "mayor_policies"

    policy_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    game_day: Mapped[int] = mapped_column(Integer)
    game_minute: Mapped[int] = mapped_column(Integer)
    values: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    summary: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
