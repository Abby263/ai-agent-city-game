"""Turns anything the player writes ("Tom asks Maya to move in", "a water pipe bursts at the library") into bounded game effects.

There is no fixed list of actions. The game master model reads the player's words and the scene, and returns a small,
validated interpretation; the game then applies capped effects and lets the people involved react in their own words.
"""

from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.cognition.errors import CognitionValidationError
from app.schemas import CitizenAgent


class ScenePerson(BaseModel):
    citizen_id: str
    name: str
    age: int
    location: str
    activity: str = ""
    # Who they are to the actor, e.g. "wife", "coworker", "stranger".
    relation_to_actor: str = Field(default="", max_length=120)


class ScenePlace(BaseModel):
    location_id: str
    name: str


class ActRequest(BaseModel):
    kind: Literal["action", "situation"]
    text: str = Field(min_length=1, max_length=400)
    city_time: str
    actor: CitizenAgent | None = None
    target: CitizenAgent | None = None
    people: list[ScenePerson] = Field(default_factory=list, max_length=60)
    places: list[ScenePlace] = Field(default_factory=list, max_length=40)
    # How the target currently feels about the actor, in words.
    bond: str = Field(default="", max_length=300)


class ActInterpretation(BaseModel):
    allowed: bool
    refusal: str = Field(default="", max_length=240)
    headline: str = Field(max_length=220)
    target_id: str = ""
    involved_ids: list[str] = Field(default_factory=list, max_length=4)
    location_id: str = ""
    tone: Literal["warm", "romantic", "playful", "neutral", "tense", "hostile"]
    intensity: int = Field(ge=0, le=3)
    harm: int = Field(ge=0, le=3)
    money: int = Field(ge=0, le=1000)
    proposal: Literal["none", "date", "engagement", "marriage", "breakup", "move_in"]
    closes_location: bool
    reaction: str = Field(max_length=400)
    target_memory: str = Field(default="", max_length=400)


SCHEMA = {
    "type": "object",
    "properties": {
        "allowed": {"type": "boolean"},
        "refusal": {"type": "string", "description": "Short, friendly reason when not allowed; empty otherwise."},
        "headline": {"type": "string", "description": "One plain past-tense news line of what happened, naming people and place. No verdicts on how others reacted."},
        "target_id": {"type": "string", "description": "Exact id of the main person it is done to or who is most affected; empty if nobody."},
        "involved_ids": {"type": "array", "items": {"type": "string"}, "description": "Exact ids of up to four people directly involved, most important first."},
        "location_id": {"type": "string", "description": "Exact id of where it happens; empty for where the people already are."},
        "tone": {"type": "string", "enum": ["warm", "romantic", "playful", "neutral", "tense", "hostile"]},
        "intensity": {"type": "integer", "description": "0 trivial, 1 mild, 2 strong, 3 life-changing."},
        "harm": {"type": "integer", "description": "Physical harm to the target: 0 none, 1 a shove, 2 a slap or small injury, 3 a punch or real injury."},
        "money": {"type": "integer", "description": "Dollars handed from the actor to the target, 0 if none."},
        "proposal": {"type": "string", "enum": ["none", "date", "engagement", "marriage", "breakup", "move_in"],
                     "description": "A relationship step the target must answer (breakup needs no answer)."},
        "closes_location": {"type": "boolean", "description": "True only if the place must close for the day (fire, flood, burst pipe)."},
        "reaction": {"type": "string", "description": "What is going on, told from the target's side, so they can react in their own words."},
        "target_memory": {"type": "string", "description": "What the target remembers, first person. Empty if nobody."},
    },
    "required": ["allowed", "refusal", "headline", "target_id", "involved_ids", "location_id", "tone", "intensity", "harm",
                 "money", "proposal", "closes_location", "reaction", "target_memory"],
}

SYSTEM = (
    "You are the game master of AgentCity, a life simulation of a city neighbourhood (city_time says which city), where every resident is an adult (18+). "
    "The player controls this world and may make anyone do anything, or make anything happen. Interpret the player's words "
    "faithfully and generously: do not soften, moralise or change what they asked for. Pick the people and place it involves "
    "from the supplied scene, using exact ids. Rate its tone, intensity and physical harm honestly. "
    "Only refuse (allowed=false) for sexually explicit content, graphic gore or torture, instructions for real-world harm, "
    "hate against real groups, or romance between close relatives. Non-graphic conflict, including slaps and punches, "
    "is allowed and has consequences. Keep the headline and reaction non-explicit."
)


def interpret(client, request: ActRequest) -> ActInterpretation:
    prompt = {
        "kind": request.kind,
        "player_wrote": request.text,
        "city_time": request.city_time,
        "actor": _person(request.actor),
        "target": _person(request.target),
        "how_target_feels_about_actor": request.bond,
        "people_in_town": [p.model_dump() for p in request.people],
        "places": [p.model_dump() for p in request.places],
        "rules": [
            "For an action, the actor does exactly what the player wrote, to the target if one is given.",
            "For a situation, nobody is the actor: choose who it happens to and where, from people_in_town and places.",
            "The headline states only what happened, not how anyone felt about it or answered.",
            "A proposal is only for an explicit relationship step (asking on a date, proposing, breaking up, moving in).",
        ],
    }
    raw = client._generate_json(SYSTEM, prompt, SCHEMA, "act_interpretation")
    try:
        result = ActInterpretation.model_validate(raw)
    except ValidationError as error:
        raise CognitionValidationError("The game master did not return a valid interpretation. Nothing happened.") from error
    people = {p.citizen_id for p in request.people} | {c.citizen_id for c in (request.actor, request.target) if c}
    places = {p.location_id for p in request.places}
    # Anything outside the scene is dropped rather than invented.
    result.involved_ids = [i for i in dict.fromkeys(result.involved_ids) if i in people][:4]
    if result.target_id not in people:
        result.target_id = request.target.citizen_id if request.target else (result.involved_ids[0] if result.involved_ids else "")
    if result.location_id not in places:
        result.location_id = ""
    if result.allowed and not result.headline.strip():
        raise CognitionValidationError("The game master did not describe what happened. Nothing happened.")
    return result


def _person(citizen: CitizenAgent | None):
    if not citizen:
        return None
    return {"citizen_id": citizen.citizen_id, "name": citizen.name, "age": citizen.age, "profession": citizen.profession,
            "mood": citizen.mood, "money": citizen.money, "location": citizen.current_location_id,
            "character": (citizen.personality or {}).get("prompt", "")}
