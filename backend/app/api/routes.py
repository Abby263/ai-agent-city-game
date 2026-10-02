from __future__ import annotations

import hashlib
import io
import time
import wave
from collections import OrderedDict, defaultdict, deque
from datetime import datetime, timedelta
from uuid import uuid4

from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.cognition.errors import CognitionUnavailableError, CognitionValidationError
from app.cognition.pipeline import CognitionPipeline
from app.cognition.elections import ElectionDecision, ElectionDecisionRequest, decide_election
from app.cognition.encounters import SocialDecision, SocialDecisionRequest, decide_social
from app.cognition.actions import ActInterpretation, ActRequest, interpret
from app.cognition.narrator import NarratorReply, NarratorRequest, narrate
from app.config import get_settings
from app.database import get_db
from app.models import CitizenORM, ConversationORM, MemoryORM, RelationshipORM
from app.realtime import manager
from app.safety import unsafe_player_text_message
from app.schemas import (
    AssignTaskRequest,
    CitizenAgent,
    CityEvent,
    CityState,
    Conversation,
    MayorPolicyRequest,
    Memory,
    Relationship,
    SessionCognitionRequest,
    SessionCognitionResponse,
    SessionTaskPlanRequest,
    SessionTaskPlanResponse,
    SimulationModeRequest,
    TriggerEventRequest,
)
from app.simulation.engine import SimulationEngine

router = APIRouter()


def describe_city_time(city: CityState) -> str:
    """Real date, time and weather in the city, so residents can mention the rain or the holiday."""
    clock = f"{city.clock.minute_of_day // 60:02d}:{city.clock.minute_of_day % 60:02d}"
    when = f"Day {city.clock.day}, {clock}"
    if city.calendar_start:
        try:
            date = datetime.fromisoformat(city.calendar_start) + timedelta(days=city.clock.day - 1)
            when = f"{date.strftime('%A %d %B %Y')}, {clock}"
        except ValueError:
            pass
    place = f"{when} in {city.city_name}"
    weather = city.weather or {}
    if weather.get("label"):
        place += f". Weather: {weather['label']}, {round(float(weather.get('temp_c', 0)))}°C"
        alert = weather.get("alert")
        if isinstance(alert, dict) and alert.get("text"):
            place += f". Alert: {alert['text']}"
    return place


def _reject_unsafe_player_text(*texts: str | None) -> None:
    if message := unsafe_player_text_message(*texts):
        raise HTTPException(status_code=400, detail=message)


def _reject_unsafe_prompts(*citizens) -> None:
    """Character prompts the player rewrote get the same checks as anything else the player types."""
    for citizen in citizens:
        personality = getattr(citizen, "personality", None) or {}
        if personality.get("prompt_edited") and (message := unsafe_player_text_message(str(personality.get("prompt") or ""))):
            raise HTTPException(status_code=400, detail=f"{citizen.name}'s character prompt: {message}")

settings = get_settings()
engine = SimulationEngine(settings)
cognition = CognitionPipeline(settings)


@router.post("/cognition/election", response_model=ElectionDecision)
def election_decision(request: ElectionDecisionRequest) -> ElectionDecision:
    _reject_unsafe_player_text(*(candidate.platform for candidate in request.candidates))
    _reject_unsafe_prompts(request.citizen)
    if not settings.real_llm_enabled:
        raise HTTPException(status_code=503, detail="An AI provider key is required for independent election decisions.")
    try:
        return decide_election(cognition.client.deep_agents, request)
    except CognitionUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except CognitionValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


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


@router.post("/cognition/social", response_model=SocialDecision)
def social_decision(request: SocialDecisionRequest) -> SocialDecision:
    _reject_unsafe_prompts(request.citizen)
    try:
        return decide_social(cognition.client.deep_agents, request)
    except CognitionUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except CognitionValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/cognition/rules")
def cognition_rules() -> dict[str, str]:
    """The fixed rules every resident follows, shown read-only next to their editable character prompt."""
    from app.cognition.deep_agents import GAME_RULES
    from app.safety import CITIZEN_SAFETY_RULES
    return {"game_rules": GAME_RULES.strip(), "safety_rules": CITIZEN_SAFETY_RULES.strip()}


@router.post("/cognition/act", response_model=ActInterpretation)
def act_interpretation(request: ActRequest) -> ActInterpretation:
    """Reads a free-text action or situation the player wrote and returns bounded effects."""
    _reject_unsafe_player_text(request.text)
    _reject_unsafe_prompts(*(c for c in (request.actor, request.target) if c))
    try:
        return interpret(cognition.client, request)
    except CognitionUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except CognitionValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/cognition/narrator", response_model=NarratorReply)
def narrator_reply(request: NarratorRequest) -> NarratorReply:
    """What the player said to the narrator (spoken or typed): an answer to say aloud, and game actions to carry out."""
    _reject_unsafe_player_text(request.text)
    try:
        reply = narrate(cognition.client, request)
    except CognitionUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except CognitionValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    # Words the narrator puts in a resident's mouth or ear get the same checks as words the player types.
    _reject_unsafe_player_text(*(action.text for action in reply.actions))
    return reply


@router.post("/cognition/session", response_model=SessionCognitionResponse)
def session_cognition(request: SessionCognitionRequest) -> SessionCognitionResponse:
    _reject_unsafe_player_text(request.player_utterance, request.task)
    actor = next((citizen for citizen in request.city.citizens if citizen.citizen_id == request.actor_id), None)
    if not actor:
        raise HTTPException(status_code=404, detail="Actor citizen not found in session state")
    _reject_unsafe_prompts(*(c for c in request.city.citizens if c.citizen_id in {request.actor_id, request.target_id, request.required_target_id}))

    requested_target_id = request.target_id or request.required_target_id
    target = (
        next((citizen for citizen in request.city.citizens if citizen.citizen_id == requested_target_id), None)
        if requested_target_id
        else None
    )
    if requested_target_id and target is None:
        raise HTTPException(status_code=404, detail="Target citizen not found in session state")
    nearby = []
    if target:
        nearby.append(
            {
                "citizen_id": target.citizen_id,
                "name": target.name,
                "profession": target.profession,
                "mood": target.mood,
                "current_activity": target.current_activity,
                "current_location_id": target.current_location_id,
            }
        )
    else:
        nearby.extend(
            {
                "citizen_id": citizen.citizen_id,
                "name": citizen.name,
                "profession": citizen.profession,
                "mood": citizen.mood,
                "current_activity": citizen.current_activity,
                "current_location_id": citizen.current_location_id,
            }
            for citizen in request.city.citizens
            if citizen.citizen_id != actor.citizen_id
            and (
                citizen.current_location_id == actor.current_location_id
                or abs(citizen.x - actor.x) + abs(citizen.y - actor.y) <= 3
            )
        )
    city_time = describe_city_time(request.city)
    # A world event log is not public knowledge. Only deliver events witnessed by the actor.
    event_context = " ".join(event.description for event in request.city.events[-6:] if actor.citizen_id in event.actors and event.event_type not in {"conversation", "player_task"})
    try:
        if target:
            result = cognition.client.generate_private_exchange(
                actor=actor.model_dump(mode="json"),
                target=target.model_dump(mode="json"),
                city_time=city_time,
                task=request.task,
                observations=request.observations
                or [f"{actor.name} is working on this player task: {request.task}"],
                actor_memories=request.private_memories.get(actor.citizen_id, request.memories),
                target_memories=request.private_memories.get(target.citizen_id, []),
                event_context=event_context,
                player_utterance=request.player_utterance,
                prior_lines=request.prior_lines,
                autonomous=request.conversation_mode == "autonomous",
                meeting_locations=[{"location_id": p.location_id, "name": p.name} for p in request.city.locations],
                meeting_now=request.city.clock.day * 1440 + request.city.clock.minute_of_day,
                proposal=request.proposal,
            )
        else:
            result = cognition.client.generate(
                citizen=actor.model_dump(mode="json"),
                city_time=city_time,
                observations=request.observations
                or [f"{actor.name} is working on this player task: {request.task}"],
                memories=request.private_memories.get(actor.citizen_id, request.memories),
                nearby_citizens=nearby[:4],
                event_context=event_context,
                required_target_id=request.required_target_id or request.target_id,
                require_conversation=request.require_conversation or bool(request.target_id),
            )
    except CognitionUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except CognitionValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    conversation = None
    conversation_payload = result.conversation or {}
    target_id = conversation_payload.get("target_citizen_id") or (target.citizen_id if target else None)
    lines = conversation_payload.get("lines") if isinstance(conversation_payload.get("lines"), list) else []
    if target_id and lines:
        conversation = Conversation(
            conversation_id=f"convo_{uuid4().hex[:16]}",
            game_day=request.city.clock.day,
            game_minute=request.city.clock.minute_of_day,
            location_id=actor.current_location_id,
            actor_ids=[actor.citizen_id, str(target_id)],
            transcript=lines,
            summary=str(conversation_payload.get("summary") or f"{actor.name} and {target_id} talked about the task."),
        )

    return SessionCognitionResponse(
        thought=result.thought,
        mood=result.mood,
        memory=result.memory,
        reflection=result.reflection,
        importance=result.importance,
        conversation=conversation,
        participant_memories=result.participant_memories,
        participant_reflections=result.participant_reflections,
        participant_outcomes=result.participant_outcomes,
        meeting_plan=result.meeting_plan,
    )


@router.post("/cognition/task-plan", response_model=SessionTaskPlanResponse)
def session_task_plan(request: SessionTaskPlanRequest) -> SessionTaskPlanResponse:
    _reject_unsafe_player_text(request.task)
    actor = next((citizen for citizen in request.city.citizens if citizen.citizen_id == request.actor_id), None)
    if not actor:
        raise HTTPException(status_code=404, detail="Actor citizen not found in session state")

    try:
        result = cognition.client.plan_task(
            citizen=actor.model_dump(mode="json"),
            city=request.city.model_dump(mode="json"),
            task=request.task,
            memories=request.memories,
        )
    except CognitionUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except CognitionValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    valid_citizen_ids = {citizen.citizen_id for citizen in request.city.citizens if citizen.citizen_id != actor.citizen_id}
    valid_location_ids = {location.location_id for location in request.city.locations}
    target_ids = [citizen_id for citizen_id in result.target_citizen_ids if citizen_id in valid_citizen_ids]
    location_id = result.location_id if result.location_id in valid_location_ids else None
    return SessionTaskPlanResponse(
        task_kind=result.task_kind,  # type: ignore[arg-type]
        target_citizen_ids=target_ids,
        location_id=location_id,
        reasoning_summary=result.reasoning_summary,
        player_visible_plan=result.player_visible_plan,
    )


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


@router.post("/simulation/mode", response_model=CityState)
async def set_simulation_mode(request: SimulationModeRequest, db: Session = Depends(get_db)) -> CityState:
    state = engine.set_mode(db, request)
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
    _reject_unsafe_player_text(request.task)
    try:
        state = engine.assign_task(db, citizen_id, request, cognition)
    except CognitionUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
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


@router.post("/citizens/{citizen_id}/task/close", response_model=CityState)
async def close_citizen_task(
    citizen_id: str,
    db: Session = Depends(get_db),
) -> CityState:
    state = engine.close_task(db, citizen_id)
    await manager.broadcast("city_state", state.model_dump(mode="json"))
    await manager.broadcast(
        "event",
        {
            "event_type": "player_task_closed",
            "actors": [citizen_id],
            "description": f"Player closed the task for {citizen_id}.",
            "priority": 2,
        },
    )
    return state


@router.post("/mayor/policy", response_model=CityState)
async def mayor_policy(request: MayorPolicyRequest, db: Session = Depends(get_db)) -> CityState:
    state = engine.apply_policy(db, request)
    await manager.broadcast("city_state", state.model_dump(mode="json"))
    await manager.broadcast("metrics", state.metrics.model_dump())
    return state


# ---------------------------------------------------------------------------------------------
# Natural character voices (Gemini TTS). Short lines only, cached, and rate limited per visitor.

SPEECH_VOICES = {
    "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus",
    "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar",
    "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
}
_speech_cache: OrderedDict[str, bytes] = OrderedDict()
_speech_calls: dict[str, deque[float]] = defaultdict(deque)


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=420)
    voice: str
    style: str = Field(default="", max_length=180)


@router.post("/speech")
def character_speech(request: SpeechRequest, http: Request) -> Response:
    if settings.llm_provider != "gemini" or not settings.llm_api_key or not settings.gemini_tts_model:
        raise HTTPException(status_code=503, detail="Natural voices are not configured.")
    if request.voice not in SPEECH_VOICES:
        raise HTTPException(status_code=422, detail="Unknown voice.")
    key = hashlib.sha256(f"{request.voice}|{request.style}|{request.text}".encode()).hexdigest()
    if key in _speech_cache:
        _speech_cache.move_to_end(key)
        return Response(content=_speech_cache[key], media_type="audio/wav", headers={"Cache-Control": "private, max-age=86400"})
    client_id = http.client.host if http.client else "unknown"
    calls, now = _speech_calls[client_id], time.monotonic()
    while calls and now - calls[0] > 60:
        calls.popleft()
    if len(calls) >= 40:
        raise HTTPException(status_code=429, detail="Too many voice requests. Device voices will be used for a moment.")
    calls.append(now)
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.llm_api_key)
        # A short bracketed tag sets the delivery without being read aloud (longer directions get spoken).
        style = request.style.strip().strip("[]")
        prompt = f"[{style}] {request.text.strip()}" if style else request.text.strip()
        result = client.models.generate_content(
            model=settings.gemini_tts_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=request.voice))),
            ),
        )
        audio = result.candidates[0].content.parts[0].inline_data
    except Exception as error:  # provider errors fall back to device voices in the browser
        raise HTTPException(status_code=503, detail="The voice service could not answer.") from error
    if not audio or not audio.data:
        raise HTTPException(status_code=503, detail="The voice service returned no audio.")
    data = audio.data if "wav" in (audio.mime_type or "") else _wav(audio.data)
    _speech_cache[key] = data
    while len(_speech_cache) > 300:
        _speech_cache.popitem(last=False)
    return Response(content=data, media_type="audio/wav", headers={"Cache-Control": "private, max-age=86400"})


def _wav(pcm: bytes, rate: int = 24000) -> bytes:
    """Wraps raw 16-bit mono PCM in a WAV header."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(rate)
        file.writeframes(pcm)
    return buffer.getvalue()
