"""The player controls the world: editable character prompts, free-text actions, and replies that don't stall."""

import threading
import time
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import routes
from app.cognition.actions import ActRequest, interpret
from app.cognition.deep_agents import DeepAgentRuntime, character_prompt, system_prompt_for
from app.config import Settings
from app.schemas import CitizenAgent


def person(citizen_id: str, name: str, **personality) -> dict:
    return {"citizen_id": citizen_id, "name": name, "age": 30, "profession": "Barista", "home_location_id": "home",
            "work_location_id": None, "current_location_id": "cafe", "x": 1, "y": 1, "target_x": 1, "target_y": 1,
            "money": 100, "health": 90, "hunger": 20, "energy": 80, "stress": 20, "happiness": 70, "reputation": 50,
            "current_activity": "Working", "current_thought": "", "memory_summary": "", "mood": "Calm",
            "personality": personality}


def test_the_character_prompt_the_player_writes_is_what_the_resident_follows():
    tom = person("tom", "Takashi", prompt="  Grumpy in the mornings, secretly writes poetry.  ", prompt_edited=True)
    assert character_prompt(tom) == "Grumpy in the mornings, secretly writes poetry."
    system = system_prompt_for("tom", "Takashi", "30-year-old Barista", character_prompt(tom))
    assert "secretly writes poetry" in system
    assert system.index("secretly writes poetry") < system.index("never contradict it"), "the character comes before the fixed rules"
    assert "YOUR CHARACTER" not in system_prompt_for("tom", "Takashi", "Barista", ""), "no prompt, no character block"
    assert len(character_prompt(person("x", "X", prompt="a" * 5000))) == 2400


def test_a_slow_reply_is_asked_again_and_the_first_answer_wins():
    runtime = DeepAgentRuntime(Settings(_env_file=None, hedge_after_seconds=0.05))
    calls = []

    def invoke(payload, config):
        calls.append(threading.current_thread().name)
        if len(calls) == 1:
            time.sleep(0.5)  # a stalled provider call
            return {"structured_response": "slow"}
        return {"structured_response": "fast"}

    started = time.time()
    assert runtime._invoke(SimpleNamespace(invoke=invoke), {"hello": 1}) == {"structured_response": "fast"}
    assert time.time() - started < 0.4
    assert len(calls) == 2


def test_a_quick_reply_is_not_duplicated_and_errors_are_not_retried():
    runtime = DeepAgentRuntime(Settings(_env_file=None, hedge_after_seconds=1))
    calls = []
    assert runtime._invoke(SimpleNamespace(invoke=lambda p, config: calls.append(1) or {"ok": True}), {}) == {"ok": True}
    assert calls == [1]

    def broken(payload, config):
        calls.append(2)
        raise RuntimeError("provider down")

    with pytest.raises(RuntimeError):
        runtime._invoke(SimpleNamespace(invoke=broken), {})
    assert calls == [1, 2]


def test_free_text_actions_stay_inside_the_scene():
    class Client:
        def _generate_json(self, system, prompt, schema, name):
            assert prompt["player_wrote"] == "Takashi asks Natsumi to move in with him"
            return {"allowed": True, "refusal": "", "headline": "Takashi asked Natsumi to move in with him at the cafe.",
                    "target_id": "invented", "involved_ids": ["tom", "maya", "ghost", "tom"], "location_id": "moon",
                    "tone": "romantic", "intensity": 3, "harm": 0, "money": 0, "proposal": "move_in",
                    "closes_location": False, "reaction": "Takashi just asked you to move in.", "target_memory": "Takashi asked me to move in."}

    request = ActRequest(kind="action", text="Takashi asks Natsumi to move in with him", city_time="Monday 18:00",
        actor=CitizenAgent(**person("tom", "Takashi")), target=CitizenAgent(**person("maya", "Natsumi")),
        people=[{"citizen_id": "tom", "name": "Takashi", "age": 30, "location": "cafe"}, {"citizen_id": "maya", "name": "Natsumi", "age": 29, "location": "cafe"}],
        places=[{"location_id": "cafe", "name": "Cafe"}])
    result = interpret(Client(), request)
    assert result.target_id == "maya", "an unknown target falls back to the one the player chose"
    assert result.involved_ids == ["tom", "maya"], "invented people are dropped"
    assert result.location_id == "", "invented places are dropped"
    assert result.proposal == "move_in"


@pytest.fixture
def api():
    app = FastAPI()
    app.include_router(routes.router)
    with TestClient(app) as client:
        yield client


def test_an_edited_prompt_gets_the_same_safety_checks_as_player_text(api):
    body = {"kind": "action", "text": "Takashi waves", "city_time": "Monday",
            "actor": person("tom", "Takashi", prompt="Call me on 555-123-4567", prompt_edited=True)}
    response = api.post("/cognition/act", json=body)
    assert response.status_code == 400
    assert "character prompt" in response.json()["detail"]


def test_the_fixed_rules_are_readable(api):
    rules = api.get("/cognition/rules").json()
    assert "adults" in rules["game_rules"] and rules["safety_rules"]


def test_the_narrator_answers_and_only_acts_on_what_is_in_the_scene():
    from app.cognition.narrator import NarratorRequest, narrate

    request = NarratorRequest(
        text="let me be Ren and go talk to Aoi, and tell Haruto to come clean", city_time="Monday 08:00", nudges_left=1,
        people=[{"citizen_id": "ren", "name": "Ren Ishikawa"}, {"citizen_id": "aoi", "name": "Aoi Takahashi"}, {"citizen_id": "haruto", "name": "Haruto Tanaka"}],
        places=[{"location_id": "cafe", "name": "Sunny Side Cafe"}],
        cases=[{"case_id": "manga", "title": "Last Train", "goal": "Get Haruto to tell his father.", "next_scene_people": ["haruto", "hana"]}],
    )
    seen = {}

    def generate(system, prompt, schema, name):
        seen.update(system=system, prompt=prompt, name=name)
        return {"say": "You're Ren now. Off you go.", "actions": [
            {"type": "play_as", "citizen_id": "ren", "location_id": "", "case_id": "", "text": ""},
            {"type": "talk_to", "citizen_id": "aoi", "location_id": "", "case_id": "", "text": ""},
            {"type": "nudge", "citizen_id": "haruto", "location_id": "", "case_id": "manga", "text": "Tell him the truth."},
            {"type": "talk_to", "citizen_id": "nobody_here", "location_id": "", "case_id": "", "text": ""},
            {"type": "go_to", "citizen_id": "", "location_id": "the_moon", "case_id": "", "text": ""},
            {"type": "nudge", "citizen_id": "ren", "location_id": "", "case_id": "manga", "text": "Not in the next scene."},
            {"type": "speed", "citizen_id": "", "location_id": "", "case_id": "", "text": "9"},
        ]}

    reply = narrate(SimpleNamespace(_generate_json=generate), request)
    assert [a.type for a in reply.actions] == ["play_as", "talk_to", "nudge"], "invented people, places and nudges are dropped"
    assert reply.say.startswith("You're Ren")
    assert seen["prompt"]["player_said"].startswith("let me be Ren")
    assert "mishearings" in seen["system"], "the narrator knows it is reading a speech transcript"
    # No nudges left: the nudge is dropped even if the model returns one.
    request.nudges_left = 0
    assert [a.type for a in narrate(SimpleNamespace(_generate_json=generate), request).actions] == ["play_as", "talk_to"]


def test_the_narrator_endpoint_checks_what_the_player_said():
    app = FastAPI()
    app.include_router(routes.router)
    response = TestClient(app).post("/cognition/narrator", json={"text": "my phone number is 555 123 4567", "city_time": "now"})
    assert response.status_code == 400
