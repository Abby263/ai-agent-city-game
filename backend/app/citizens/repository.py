from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field, ValidationError, model_validator


PROFILE_DIR = Path(__file__).resolve().parent / "profiles"


class SeedMemory(BaseModel):
    memory_id: str
    kind: str = "semantic"
    content: str
    importance: float = Field(default=0.62, ge=0, le=1)
    salience: float = Field(default=0.55, ge=0, le=1)


class SeedRelationship(BaseModel):
    other_citizen_id: str
    trust: float = Field(default=38, ge=0, le=100)
    warmth: float = Field(default=38, ge=0, le=100)
    familiarity: float = Field(default=18, ge=0, le=100)
    notes: str = ""


class CitizenProfile(BaseModel):
    citizen_id: str
    name: str
    age: int = Field(ge=1)
    profession: str
    active: bool = False
    home_location_id: str = "loc_homes"
    work_location_id: str | None = None
    current_location_id: str = "loc_homes"
    position: tuple[int, int]
    money: float = 120
    health: float = Field(default=90, ge=0, le=100)
    hunger: float = Field(default=20, ge=0, le=100)
    energy: float = Field(default=80, ge=0, le=100)
    stress: float = Field(default=20, ge=0, le=100)
    happiness: float = Field(default=70, ge=0, le=100)
    reputation: float = Field(default=50, ge=0, le=100)
    skills: list[str] = Field(default_factory=list)
    personality: dict[str, Any] = Field(default_factory=dict)
    family_ids: list[str] = Field(default_factory=list)
    friend_ids: list[str] = Field(default_factory=list)
    relationship_scores: dict[str, float] = Field(default_factory=dict)
    daily_schedule: list[dict[str, Any]]
    short_term_goals: list[str] = Field(default_factory=list)
    long_term_goals: list[str] = Field(default_factory=list)
    current_activity: str = "Waking up at home"
    current_thought: str
    memory_summary: str
    mood: str = "Steady"
    seed_memories: list[SeedMemory] = Field(default_factory=list)
    relationships: list[SeedRelationship] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_profile(self) -> "CitizenProfile":
        if self.citizen_id in self.friend_ids:
            raise ValueError("friend_ids cannot include the citizen's own id")
        if self.citizen_id in self.relationship_scores:
            raise ValueError("relationship_scores cannot include the citizen's own id")
        return self


def default_student_schedule() -> list[dict[str, Any]]:
    return [
        {"start": 360, "end": 450, "activity": "Breakfast and commute", "location_id": "loc_homes"},
        {"start": 450, "end": 900, "activity": "Attend school", "location_id": "loc_school"},
        {"start": 900, "end": 1020, "activity": "Social time at park", "location_id": "loc_park"},
        {"start": 1020, "end": 1260, "activity": "Homework and dinner", "location_id": "loc_homes"},
        {"start": 1260, "end": 1440, "activity": "Sleep", "location_id": "loc_homes"},
    ]


def default_work_schedule(profession: str, work_location_id: str | None) -> list[dict[str, Any]]:
    if profession == "Student":
        return default_student_schedule()
    if profession in {"Doctor", "Nurse", "Scientist", "Researcher"}:
        return [
            {"start": 360, "end": 480, "activity": "Morning routine", "location_id": "loc_homes"},
            {"start": 480, "end": 1020, "activity": f"{profession} work", "location_id": work_location_id},
            {"start": 1020, "end": 1110, "activity": "Walk through park", "location_id": "loc_park"},
            {"start": 1110, "end": 1320, "activity": "Home evening", "location_id": "loc_homes"},
            {"start": 1320, "end": 1440, "activity": "Sleep", "location_id": "loc_homes"},
        ]
    return [
        {"start": 360, "end": 480, "activity": "Morning routine", "location_id": "loc_homes"},
        {"start": 480, "end": 1020, "activity": f"{profession} work", "location_id": work_location_id},
        {"start": 1020, "end": 1110, "activity": "Errands at market", "location_id": "loc_market"},
        {"start": 1110, "end": 1260, "activity": "Community time", "location_id": "loc_park"},
        {"start": 1260, "end": 1440, "activity": "Home evening and sleep", "location_id": "loc_homes"},
    ]


@lru_cache
def load_citizen_profiles() -> dict[str, CitizenProfile]:
    profiles: dict[str, CitizenProfile] = {}
    if not PROFILE_DIR.exists():
        raise RuntimeError(f"Citizen profile directory is missing: {PROFILE_DIR}")

    for path in sorted(PROFILE_DIR.glob("*.yaml")):
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise RuntimeError(f"Citizen profile must be a YAML object: {path}")
        raw.setdefault("daily_schedule", default_work_schedule(raw.get("profession", ""), raw.get("work_location_id")))
        raw.setdefault(
            "memory_summary",
            f"{raw.get('name', path.stem)} lives in Navora and carries personal memories that change over time.",
        )
        raw.setdefault("current_thought", "I should pay attention to what is happening around me today.")
        try:
            profile = CitizenProfile.model_validate(raw)
        except ValidationError as error:
            raise RuntimeError(f"Invalid citizen profile {path}: {error}") from error
        if profile.citizen_id in profiles:
            raise RuntimeError(f"Duplicate citizen_id in profile files: {profile.citizen_id}")
        profiles[profile.citizen_id] = profile

    if not profiles:
        raise RuntimeError(f"No citizen profiles found in {PROFILE_DIR}")
    return profiles


def active_profile_ids() -> list[str]:
    return [profile.citizen_id for profile in load_citizen_profiles().values() if profile.active]
