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
            assert set(prompt["nearby_people_you_can_see"][0]) == {"citizen_id", "name", "activity"}
            return {"target_id": None, "reason": "I want to finish my drawing first.", "topic": ""}
    assert decide_social(Runtime(), request()).target_id is None


@pytest.mark.parametrize("target,topic", [("distant", "drawing"), ("ava", "drawing"), ("noah", "")])
def test_initiative_rejects_impossible_contacts_and_empty_intentions(target, topic):
    class Runtime:
        def generate_social_decision(self, **kwargs):
            return {"target_id": target, "reason": "I want company.", "topic": topic}
    with pytest.raises(CognitionValidationError):
        decide_social(Runtime(), request())
