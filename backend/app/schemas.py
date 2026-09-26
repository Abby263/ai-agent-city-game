from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class Location(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    location_id: str
    name: str
    type: str
    x: int
    y: int
    width: int
    height: int
    capacity: int
    open_hours: dict[str, Any] = Field(default_factory=dict)
    services: list[str] = Field(default_factory=list)
    inventory: dict[str, Any] = Field(default_factory=dict)
    workers: list[str] = Field(default_factory=list)
    visitors: list[str] = Field(default_factory=list)


class CitizenAgent(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    citizen_id: str
    name: str
    age: int
    profession: str
    home_location_id: str
    work_location_id: str | None
    current_location_id: str
    x: int
    y: int
    target_x: int
    target_y: int
    money: float
    health: float
    hunger: float
    energy: float
    stress: float
    happiness: float
    reputation: float
    family_ids: list[str] = Field(default_factory=list)
    friend_ids: list[str] = Field(default_factory=list)
    relationship_scores: dict[str, float] = Field(default_factory=dict)
    skills: list[str] = Field(default_factory=list)
    personality: dict[str, Any] = Field(default_factory=dict)
    daily_schedule: list[dict[str, Any]] = Field(default_factory=list)
    short_term_goals: list[str] = Field(default_factory=list)
    long_term_goals: list[str] = Field(default_factory=list)
    current_activity: str
    current_thought: str
    memory_summary: str
    mood: str
    # Body, family, work, health and feelings from the browser simulation; passed to the model as context.
    life: dict[str, Any] | None = None


class CityEvent(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: str
    timestamp: datetime
    game_day: int
    game_minute: int
    event_type: str
    location_id: str | None = None
    actors: list[str] = Field(default_factory=list)
    description: str
    payload: dict[str, Any] = Field(default_factory=dict)
    priority: int = 1
    visibility: str = "public"


class Memory(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    memory_id: str
    citizen_id: str
    kind: str
    content: str
    importance: float
    salience: float
    related_citizen_id: str | None = None
    source_event_id: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class Relationship(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    relationship_id: str
    citizen_id: str
    other_citizen_id: str
    trust: float
    warmth: float
    familiarity: float
    notes: str


class Conversation(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    conversation_id: str
    game_day: int
    game_minute: int
    location_id: str | None
    actor_ids: list[str] = Field(default_factory=list)
    transcript: list[dict[str, str]] = Field(default_factory=list)
    summary: str


class CityMetrics(BaseModel):
    population: int
    average_happiness: float
    city_health: float
    economy_status: float
    education_status: float
    traffic_status: float
    sick_count: int
    active_events: int


class SimulationClock(BaseModel):
    day: int
    minute_of_day: int
    tick: int
    running: bool

    @property
    def time_label(self) -> str:
        hours = self.minute_of_day // 60
        minutes = self.minute_of_day % 60
        return f"{hours:02d}:{minutes:02d}"


class CityState(BaseModel):
    city_id: str
    city_name: str
    map_width: int = 40
    map_height: int = 40
    simulation_mode: Literal["manual", "autonomous"] = "manual"
    clock: SimulationClock
    policy: dict[str, Any]
    metrics: CityMetrics
    locations: list[Location]
    citizens: list[CitizenAgent]
    events: list[CityEvent]
    # Real-calendar context from the browser simulation (day 1 date, current sky).
    calendar_start: str | None = None
    weather: dict[str, Any] | None = None


class TriggerEventRequest(BaseModel):
    event_type: Literal[
        "flu_outbreak",
        "traffic_accident",
        "food_shortage",
        "school_exam",
        "city_festival",
        "bank_policy_change",
        "power_outage",
    ]
    location_id: str | None = None
    severity: Literal["low", "medium", "high"] = "medium"


class MayorPolicyRequest(BaseModel):
    tax_rate: float | None = Field(default=None, ge=0, le=0.5)
    hospital_budget: float | None = Field(default=None, ge=0, le=100)
    school_budget: float | None = Field(default=None, ge=0, le=100)
    road_budget: float | None = Field(default=None, ge=0, le=100)
    farmer_subsidy: float | None = Field(default=None, ge=0, le=100)
    public_health_campaign: bool | None = None


class AssignTaskRequest(BaseModel):
    task: str = Field(min_length=3, max_length=240)


class SimulationModeRequest(BaseModel):
    mode: Literal["manual", "autonomous"]


class SessionCognitionRequest(BaseModel):
    conversation_mode: Literal["task", "autonomous"] = "task"
    city: CityState
    actor_id: str
    target_id: str | None = None
    required_target_id: str | None = None
    require_conversation: bool = False
    task: str = Field(min_length=3, max_length=320)
    observations: list[str] = Field(default_factory=list)
    memories: list[str] = Field(default_factory=list)
    private_memories: dict[str, list[str]] = Field(default_factory=dict)
    player_utterance: str | None = Field(default=None, min_length=1, max_length=600)
    # Recent lines of an ongoing chat between the same two people, oldest first.
    prior_lines: list[dict[str, str]] = Field(default_factory=list, max_length=12)


class SessionCognitionResponse(BaseModel):
    meeting_plan: dict[str, Any] | None = None
    thought: str
    mood: str
    memory: str
    reflection: str
    importance: float
    conversation: Conversation | None = None
    participant_memories: dict[str, str] = Field(default_factory=dict)
    participant_reflections: dict[str, str] = Field(default_factory=dict)
    participant_outcomes: dict[str, dict[str, Any]] = Field(default_factory=dict)


class SessionTaskPlanRequest(BaseModel):
    city: CityState
    actor_id: str
    task: str = Field(min_length=3, max_length=320)
    memories: list[str] = Field(default_factory=list)


class SessionTaskPlanResponse(BaseModel):
    task_kind: Literal[
        "targeted_talk",
        "greet_all",
        "ask_all",
        "self_answer",
        "open_task",
        "go_to_location",
        "go_with_citizen",
    ]
    target_citizen_ids: list[str] = Field(default_factory=list, max_length=12)
    location_id: str | None = None
    reasoning_summary: str
    player_visible_plan: str


class WebSocketEnvelope(BaseModel):
    type: str
    timestamp: datetime
    payload: dict[str, Any]
