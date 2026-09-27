from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.schemas import CitizenAgent
from app.cognition.errors import CognitionValidationError


class NearbyResident(BaseModel):
    citizen_id: str
    name: str
    activity: str
    # Who they are to you ("your mother", "a friend you trust", "someone you resent") and what you remember of them.
    relationship: str = Field(default="", max_length=240)
    you_know: str = Field(default="", max_length=600)


class SocialDecisionRequest(BaseModel):
    citizen: CitizenAgent
    city_time: str
    location: str
    nearby: list[NearbyResident] = Field(max_length=40)
    memories: list[str] = Field(default_factory=list, max_length=32)
    # Recent things that happened to you or that you heard, which you might act on or pass on.
    on_your_mind: list[str] = Field(default_factory=list, max_length=12)


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
        "on_your_mind": request.on_your_mind,
        "your_goals": {"now": request.citizen.short_term_goals, "life": request.citizen.long_term_goals},
        "private_memories_for_speaker_only": request.memories,
        "player_task": "Decide whether you personally want to approach someone here. This is your free time, not a player command.",
        "rules": [
            "Approach someone only with a real reason, as a real person would: something you want (a goal, a favour, advice, "
            "company, a date), something to share (news about yourself or someone else, good or bad), something unresolved "
            "(a grudge, an apology, a promise, a worry about them), or a genuine curiosity about them.",
            "Small talk about weather, breakfast or someone's shift is not a reason. If you have nothing that matters to say, keep to yourself.",
            "Family, friends and people you have strong feelings about matter most. Passing on news you heard to someone it concerns "
            "is natural; whether to keep something private is your own choice.",
            "Do not cycle through everyone. Respect work, tiredness, concentration and recent refusals.",
            "You cannot know another person's thoughts, memories or interests unless you learned them. Use only relationship, "
            "you_know and on_your_mind for what you know about people.",
            "Do not invent prior meetings or shared interests. For a stranger, use what is observable here or introduce yourself honestly.",
            "The topic must be specific (what you will actually bring up), never 'catch up' or 'say hello'.",
        ],
    }
    try:
        decision = SocialDecision.model_validate(runtime.generate_social_decision(citizen=request.citizen.model_dump(mode="json"), prompt=prompt))
    except ValidationError as error:
        raise CognitionValidationError("The resident did not return a valid social intention.") from error
    eligible = {p.citizen_id for p in request.nearby} - {request.citizen.citizen_id}
    if decision.target_id is not None and decision.target_id not in eligible:
        # Wanting someone who isn't here (to pass on news, say) is not an error: it waits until they meet.
        return SocialDecision(target_id=None, reason=decision.reason, topic="")
    if decision.target_id and not decision.topic.strip():
        raise CognitionValidationError("The resident did not explain what they want to discuss.")
    return decision
