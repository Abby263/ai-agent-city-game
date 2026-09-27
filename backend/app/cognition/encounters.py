from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.schemas import CitizenAgent
from app.cognition.errors import CognitionValidationError


class NearbyResident(BaseModel):
    citizen_id: str
    name: str
    activity: str


class SocialDecisionRequest(BaseModel):
    citizen: CitizenAgent
    city_time: str
    location: str
    nearby: list[NearbyResident] = Field(max_length=40)
    memories: list[str] = Field(default_factory=list, max_length=32)


class SocialDecision(BaseModel):
    target_id: str | None = Field(description="Exact id of a nearby person YOU want to approach, or null to keep to yourself.")
    reason: str = Field(min_length=1, max_length=320, description="Your own specific reason to approach or decline social contact, based on your experience, personality and present circumstances.")
    topic: str = Field(max_length=240, description="What you hope to talk about; empty if keeping to yourself. Do not write anyone's dialogue.")


class MeetingAction(BaseModel):
    action: Literal["propose", "accept", "decline"]
    location_id: str
    game_day: int = Field(ge=1)
    game_minute: int = Field(ge=0, lt=1440)
    topic: str = Field(min_length=1, max_length=240)


def decide_social(runtime, request: SocialDecisionRequest) -> SocialDecision:
    prompt = {
        "speaker": request.citizen.model_dump(mode="json"),
        "city_time": request.city_time,
        "location": request.location,
        "own_nature": request.citizen.personality.get("nature", {}),
        "nearby_people_you_can_see": [p.model_dump() for p in request.nearby],
        "private_memories_for_speaker_only": request.memories,
        "player_task": "Decide whether you personally want to approach someone here. This is your free time, not a player command.",
        "rules": [
            "Do not cycle through everyone. Consider your own relationships, unfinished conversations, promises, interests, energy and mood.",
            "You may prefer a friend, cautiously introduce yourself to a stranger for a concrete reason, avoid someone who hurt you, or keep to yourself.",
            "Being in the same building is an opportunity, not an obligation. Respect classes, work, tiredness, concentration and recent refusals.",
            "You cannot know another person's thoughts, friends, memories or interests unless you learned them. Nearby descriptions only show public activity.",
            "Do not invent prior meetings or shared interests. For a stranger, use what is observable here or introduce yourself honestly.",
            "Choose a specific topic related to your own life. Greetings and generic how-is-your-day loops are not mandatory.",
        ],
    }
    try:
        decision = SocialDecision.model_validate(runtime.generate_social_decision(citizen=request.citizen.model_dump(mode="json"), prompt=prompt))
    except ValidationError as error:
        raise CognitionValidationError("The resident did not return a valid social intention.") from error
    eligible = {p.citizen_id for p in request.nearby} - {request.citizen.citizen_id}
    if decision.target_id is not None and decision.target_id not in eligible:
        raise CognitionValidationError("The resident chose someone who is not available nearby.")
    if decision.target_id and not decision.topic.strip():
        raise CognitionValidationError("The resident did not explain what they want to discuss.")
    return decision
