import pytest
from app.cognition.encounters import SocialDecisionRequest, decide_social
from app.cognition.errors import CognitionValidationError
from app.schemas import CitizenAgent


def request():
    return SocialDecisionRequest(citizen=CitizenAgent(citizen_id="ava", name="Ava", age=12, profession="Student",
        home_location_id="home", work_location_id="school", current_location_id="home", x=1, y=1,
        target_x=1, target_y=1, money=40, health=90, hunger=20, energy=80, stress=10,
        happiness=75, reputation=50, current_activity="Drawing", current_thought="I want to draw.",
        memory_summary="Learning to draw", mood="Focused"),
        city_time="Day 1, 06:00", location="Homes", memories=["I am learning to draw."],
        nearby=[{"citizen_id": "noah", "name": "Noah", "activity": "Eating breakfast"}])


def test_initiative_uses_only_own_memory_and_visible_nearby_context():
    class Runtime:
        def generate_social_decision(self, *, citizen, prompt):
            assert prompt["private_memories_for_speaker_only"] == ["I am learning to draw."]
            # Only visible activity plus the speaker's OWN view of each person (their bond and memories).
            assert set(prompt["nearby_people_you_can_see"][0]) == {"citizen_id", "name", "activity", "relationship", "you_know"}
            return {"target_id": None, "reason": "I want to finish my drawing first.", "topic": ""}
    assert decide_social(Runtime(), request()).target_id is None


@pytest.mark.parametrize("target", ["distant", "ava"])
def test_someone_who_is_not_here_waits_until_they_meet(target):
    class Runtime:
        def generate_social_decision(self, **kwargs):
            return {"target_id": target, "reason": "I want to tell her the news.", "topic": "the news"}
    decision = decide_social(Runtime(), request())
    assert decision.target_id is None, "never an impossible contact"
    assert decision.reason == "I want to tell her the news.", "the wish is kept"


def test_initiative_rejects_empty_intentions():
    class Runtime:
        def generate_social_decision(self, **kwargs):
            return {"target_id": "noah", "reason": "I want company.", "topic": ""}
    with pytest.raises(CognitionValidationError):
        decide_social(Runtime(), request())
