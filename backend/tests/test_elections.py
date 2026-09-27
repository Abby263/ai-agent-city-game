from types import SimpleNamespace

import pytest

from app.cognition.elections import ElectionDecisionRequest, decide_election
from app.cognition.errors import CognitionValidationError
from app.schemas import CitizenAgent


def request(purpose="vote"):
    citizen = CitizenAgent(citizen_id="ava", name="Ava", age=20, profession="Lab assistant", home_location_id="homes", current_location_id="homes", x=1, y=1,
        money=100, health=90, hunger=20, energy=80, stress=20, happiness=70, reputation=50,
        work_location_id="school", target_x=1, target_y=1, mood="Calm",
        current_activity="Studying", current_thought="Art matters", memory_summary="I enjoy art.")
    return ElectionDecisionRequest(purpose=purpose, citizen=citizen,
        candidates=[{"citizen_id": "ava", "name": "Ava", "platform": "Art club"}, {"citizen_id": "noah", "name": "Noah", "platform": "Science club"}],
        residents=[{"citizen_id": "ava", "name": "Ava", "location": "Homes"}, {"citizen_id": "noah", "name": "Noah", "location": "School"}],
        memories=["I like art. Noah listened to my concerns."])


def response(**changes):
    return {"platform": "", "target_id": None, "intention": "", "vote_for": "noah", "reason": "Noah listened to me.", "mood": "Hopeful", **changes}


def test_agent_may_vote_for_rival_from_own_memory():
    prompts = []
    def generate(**kwargs):
        prompts.append(kwargs["prompt"])
        return response()
    output = decide_election(SimpleNamespace(generate_election_decision=generate), request())
    assert output.vote_for == "noah"
    assert prompts[0]["private_memories_for_speaker_only"] == ["I like art. Noah listened to my concerns."]
    assert "ballots" not in prompts[0]
    assert "neighbourhood-association" in prompts[0]["public_event"]
    assert "student-council" not in str(prompts[0])


def test_invalid_vote_or_campaign_target_is_rejected():
    with pytest.raises(CognitionValidationError):
        decide_election(SimpleNamespace(generate_election_decision=lambda **kwargs: response(vote_for="stranger")), request())
    with pytest.raises(CognitionValidationError):
        decide_election(SimpleNamespace(generate_election_decision=lambda **kwargs: response(target_id="ava")), request("campaign"))


def test_abstention_is_valid_and_platform_must_be_real():
    assert decide_election(SimpleNamespace(generate_election_decision=lambda **kwargs: response(vote_for=None)), request()).vote_for is None
    with pytest.raises(CognitionValidationError):
        decide_election(SimpleNamespace(generate_election_decision=lambda **kwargs: response()), request("platform"))
