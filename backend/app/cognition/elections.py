from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.schemas import CitizenAgent
from app.cognition.errors import CognitionValidationError


class ElectionCandidate(BaseModel):
    citizen_id: str
    name: str
    platform: str = Field(max_length=800)


class ElectionResident(BaseModel):
    citizen_id: str
    name: str
    location: str


class ElectionDecisionRequest(BaseModel):
    purpose: Literal["platform", "campaign", "vote"]
    citizen: CitizenAgent
    candidates: list[ElectionCandidate] = Field(min_length=2, max_length=2)
    residents: list[ElectionResident] = Field(max_length=40)
    memories: list[str] = Field(default_factory=list, max_length=32)


class ElectionDecision(BaseModel):
    platform: str = Field(max_length=800, description="For platform: your own realistic student-council promises. Otherwise empty.")
    target_id: str | None = Field(description="For campaign: select one eligible resident to approach, or null to take a break. Otherwise null.")
    intention: str = Field(max_length=500, description="Your campaign topic or next intention, not invented dialogue. Empty for voting.")
    vote_for: str | None = Field(description="For vote: choose a candidate's exact citizen_id, or null to abstain. Otherwise null.")
    reason: str = Field(min_length=1, max_length=800, description="Your own grounded explanation, without inventing evidence or knowing other ballots.")
    mood: str = Field(min_length=1, max_length=80)


def decide_election(runtime, request: ElectionDecisionRequest) -> ElectionDecision:
    ids = [c.citizen_id for c in request.candidates]
    if len(set(ids)) != 2:
        raise CognitionValidationError("An election needs two different candidates.")
    if request.purpose != "vote" and request.citizen.citizen_id not in ids:
        raise CognitionValidationError("Only a candidate can plan a campaign.")
    prompt = {
        "speaker": request.citizen.model_dump(mode="json"),
        "own_nature": request.citizen.personality.get("nature", {}),
        "purpose": request.purpose,
        "public_event": "A fictional student-council election in Nakameguro. One private ballot per resident. Abstention is allowed.",
        "public_candidates": [c.model_dump() for c in request.candidates],
        "eligible_people_to_approach": [r.model_dump() for r in request.residents if r.citizen_id != request.citizen.citizen_id],
        "private_memories_for_speaker_only": request.memories,
        "player_task": f"Make your own {request.purpose} decision in the student-council election.",
        "rules": [
            "Use your own nature, values and sensitivities together with experience. They are tendencies, not fixed outcomes; do not copy another candidate's personality.",
            "Only your own memories and public platforms are available. You cannot know private ballots or conversations you did not witness.",
            "Your vote is your own: you may disagree with a friend, change your mind after a conversation, or abstain. Friendship does not force a vote.",
            "Promises are claims, not completed achievements. Do not invent campaign encounters or endorsements.",
            "When campaigning, choose whom YOU want to approach and why. Respect refusals and vary your approach using your actual experiences.",
            "For platform, draft a distinctive, age-appropriate student-council platform that fits your interests. Do not impersonate your rival.",
            "For vote, set only vote_for, reason and mood; use empty strings for platform/intention and null target_id.",
        ],
    }
    try:
        decision = ElectionDecision.model_validate(runtime.generate_election_decision(citizen=request.citizen.model_dump(mode="json"), prompt=prompt))
    except ValidationError as error:
        raise CognitionValidationError("The citizen returned an incomplete election decision. No ballot was cast.") from error
    if request.purpose == "vote" and decision.vote_for is not None and decision.vote_for not in ids:
        raise CognitionValidationError("The agent selected a candidate who is not on the ballot.")
    targets = {r.citizen_id for r in request.residents} - {request.citizen.citizen_id}
    if request.purpose == "campaign" and decision.target_id is not None and decision.target_id not in targets:
        raise CognitionValidationError("The agent selected an unavailable campaign recipient.")
    if request.purpose == "platform" and not decision.platform.strip():
        raise CognitionValidationError("The candidate did not provide a platform.")
    return decision
