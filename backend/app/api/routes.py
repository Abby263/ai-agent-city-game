from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.cognition.pipeline import CognitionPipeline
from app.config import get_settings
from app.database import get_db
from app.models import CitizenORM, ConversationORM, MemoryORM, RelationshipORM
from app.realtime import manager
from app.schemas import (
    AssignTaskRequest,
    CitizenAgent,
    CityEvent,
    CityState,
    Conversation,
    MayorPolicyRequest,
    Memory,
    Relationship,
    TriggerEventRequest,
)
from app.simulation.engine import SimulationEngine

router = APIRouter()
settings = get_settings()
engine = SimulationEngine(settings)
cognition = CognitionPipeline(settings)


@router.get("/city/state", response_model=CityState)
def get_city_state(db: Session = Depends(get_db)) -> CityState:
    return engine.get_state(db)


@router.get("/city/events", response_model=list[CityEvent])
def get_city_events(limit: int = 80, db: Session = Depends(get_db)) -> list[CityEvent]:
    events = engine._recent_events(db, limit=limit)
    return [CityEvent.model_validate(event) for event in events]


@router.get("/city/conversations", response_model=list[Conversation])
def get_city_conversations(limit: int = 50, db: Session = Depends(get_db)) -> list[Conversation]:
    recent = list(
        db.scalars(select(ConversationORM).order_by(desc(ConversationORM.created_at)).limit(max(limit, 1) * 3))
    )
    active_ids = set(engine._active_citizen_ids())
    if active_ids:
        recent = [
            conversation
            for conversation in recent
            if conversation.actor_ids and all(actor_id in active_ids for actor_id in conversation.actor_ids)
        ]
    return [Conversation.model_validate(conversation) for conversation in recent[:limit]]


@router.get("/citizens", response_model=list[CitizenAgent])
def get_citizens(include_inactive: bool = False, db: Session = Depends(get_db)) -> list[CitizenAgent]:
    if include_inactive:
        citizens = list(db.scalars(select(CitizenORM).order_by(CitizenORM.citizen_id)))
    else:
        citizens = engine._active_citizens(db)
    return [CitizenAgent.model_validate(citizen) for citizen in citizens]


@router.get("/citizens/{citizen_id}", response_model=CitizenAgent)
def get_citizen(citizen_id: str, db: Session = Depends(get_db)) -> CitizenAgent:
    citizen = db.get(CitizenORM, citizen_id)
    if not citizen:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Citizen not found")
    return CitizenAgent.model_validate(citizen)


@router.get("/citizens/{citizen_id}/memories", response_model=list[Memory])
def get_citizen_memories(citizen_id: str, db: Session = Depends(get_db)) -> list[Memory]:
    memories = list(
        db.scalars(
            select(MemoryORM)
            .where(MemoryORM.citizen_id == citizen_id)
            .order_by(desc(MemoryORM.created_at))
            .limit(80)
        )
    )
    return [Memory.model_validate(memory) for memory in memories]


@router.get("/citizens/{citizen_id}/relationships", response_model=list[Relationship])
def get_citizen_relationships(citizen_id: str, db: Session = Depends(get_db)) -> list[Relationship]:
    relationships = list(
        db.scalars(select(RelationshipORM).where(RelationshipORM.citizen_id == citizen_id))
    )
    active_ids = set(engine._active_citizen_ids())
    if active_ids:
        relationships = [
            relationship
            for relationship in relationships
            if relationship.other_citizen_id in active_ids
        ]
    return [Relationship.model_validate(relationship) for relationship in relationships]


@router.get("/citizens/{citizen_id}/conversations", response_model=list[Conversation])
def get_citizen_conversations(citizen_id: str, db: Session = Depends(get_db)) -> list[Conversation]:
    recent = list(
        db.scalars(select(ConversationORM).order_by(desc(ConversationORM.created_at)).limit(120))
    )
    conversations = [conversation for conversation in recent if citizen_id in conversation.actor_ids][:50]
    active_ids = set(engine._active_citizen_ids())
    if active_ids:
        conversations = [
            conversation
            for conversation in conversations
            if conversation.actor_ids and all(actor_id in active_ids for actor_id in conversation.actor_ids)
        ]
    return [Conversation.model_validate(conversation) for conversation in conversations]


@router.post("/simulation/start", response_model=CityState)
async def start_simulation(db: Session = Depends(get_db)) -> CityState:
    state = engine.start(db)
    await manager.broadcast("city_state", state.model_dump(mode="json"))
    return state


@router.post("/simulation/pause", response_model=CityState)
async def pause_simulation(db: Session = Depends(get_db)) -> CityState:
    state = engine.pause(db)
    await manager.broadcast("city_state", state.model_dump(mode="json"))
    return state


@router.post("/simulation/tick", response_model=CityState)
async def tick_simulation(db: Session = Depends(get_db)) -> CityState:
    result = engine.tick(db, cognition)
    state: CityState = result["state"]
    await manager.broadcast(
        "tick",
        {
            "clock": state.clock.model_dump(),
            "metrics": state.metrics.model_dump(),
            "citizens": [citizen.model_dump() for citizen in state.citizens],
        },
    )
    for event in result["events"]:
        await manager.broadcast("event", CityEvent.model_validate(event).model_dump(mode="json"))
    for item in result["cognition"]:
        await manager.broadcast("thought", item)
        await manager.broadcast("memory", item["memory"])
        await manager.broadcast("reflection", item["reflection"])
        if item.get("conversation"):
            await manager.broadcast("conversation", item["conversation"])
    return state


@router.post("/simulation/run-day", response_model=CityState)
async def run_day(db: Session = Depends(get_db)) -> CityState:
    state = engine.run_day(db, cognition)
    await manager.broadcast("city_state", state.model_dump(mode="json"))
    return state


@router.post("/events/trigger", response_model=CityState)
async def trigger_event(request: TriggerEventRequest, db: Session = Depends(get_db)) -> CityState:
    state = engine.trigger_event(db, request)
    await manager.broadcast("city_state", state.model_dump(mode="json"))
    await manager.broadcast(
        "event",
        {
            "event_type": request.event_type,
            "location_id": request.location_id,
            "severity": request.severity,
        },
    )
    return state


@router.post("/citizens/{citizen_id}/task", response_model=CityState)
async def assign_citizen_task(
    citizen_id: str,
    request: AssignTaskRequest,
    db: Session = Depends(get_db),
) -> CityState:
    state = engine.assign_task(db, citizen_id, request)
    await manager.broadcast("city_state", state.model_dump(mode="json"))
    await manager.broadcast(
        "event",
        {
            "event_type": "player_task",
            "actors": [citizen_id],
            "description": f"Player assigned a task to {citizen_id}: {request.task}",
            "priority": 3,
        },
    )
    return state


@router.post("/mayor/policy", response_model=CityState)
async def mayor_policy(request: MayorPolicyRequest, db: Session = Depends(get_db)) -> CityState:
    state = engine.apply_policy(db, request)
    await manager.broadcast("city_state", state.model_dump(mode="json"))
    await manager.broadcast("metrics", state.metrics.model_dump())
    return state
