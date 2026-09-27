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
    tom = person("tom", "Tom", prompt="  Grumpy in the mornings, secretly writes poetry.  ", prompt_edited=True)
    assert character_prompt(tom) == "Grumpy in the mornings, secretly writes poetry."
    system = system_prompt_for("tom", "Tom", "30-year-old Barista", character_prompt(tom))
    assert "secretly writes poetry" in system
    assert system.index("secretly writes poetry") < system.index("never contradict it"), "the character comes before the fixed rules"
    assert "YOUR CHARACTER" not in system_prompt_for("tom", "Tom", "Barista", ""), "no prompt, no character block"
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
            assert prompt["player_wrote"] == "Tom asks Maya to move in with him"
            return {"allowed": True, "refusal": "", "headline": "Tom asked Maya to move in with him at the cafe.",
                    "target_id": "invented", "involved_ids": ["tom", "maya", "ghost", "tom"], "location_id": "moon",
                    "tone": "romantic", "intensity": 3, "harm": 0, "money": 0, "proposal": "move_in",
                    "closes_location": False, "reaction": "Tom just asked you to move in.", "target_memory": "Tom asked me to move in."}

    request = ActRequest(kind="action", text="Tom asks Maya to move in with him", city_time="Monday 18:00",
        actor=CitizenAgent(**person("tom", "Tom")), target=CitizenAgent(**person("maya", "Maya")),
        people=[{"citizen_id": "tom", "name": "Tom", "age": 30, "location": "cafe"}, {"citizen_id": "maya", "name": "Maya", "age": 29, "location": "cafe"}],
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
    body = {"kind": "action", "text": "Tom waves", "city_time": "Monday",
            "actor": person("tom", "Tom", prompt="Call me on 555-123-4567", prompt_edited=True)}
    response = api.post("/cognition/act", json=body)
    assert response.status_code == 400
    assert "character prompt" in response.json()["detail"]


def test_the_fixed_rules_are_readable(api):
    rules = api.get("/cognition/rules").json()
    assert "adults" in rules["game_rules"] and rules["safety_rules"]
