from copy import deepcopy
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import routes
from app.cognition.deep_agents import DeepAgentRuntime, _turn_context, inspect_private_memory
from app.cognition.client import CitizenCognitionClient
from app.cognition.errors import CognitionUnavailableError, CognitionValidationError
from app.config import Settings


@pytest.fixture
def turn():
    return {
        "spoken_line": "Hello there.", "thought": "My private thought", "mood": "Calm",
        "memory": "My memory", "reflection": "My reflection", "end_conversation": False,
        "invitation_response": "none", "relationship_effect": "neutral",
        "relationship_reason": "Routine greeting", "task_complete": False, "importance": 0.5,
        "feelings": {"affection": 0, "jealousy": 0, "resentment": 0, "admiration": 0, "reason": ""},
    }


def runtime_with_result(monkeypatch, result):
    runtime = DeepAgentRuntime(Settings(_env_file=None))
    monkeypatch.setattr(runtime, "prepare_citizen_agent", lambda citizen: SimpleNamespace(invoke=lambda *a, **kw: result))
    return runtime


@pytest.mark.parametrize("field", ["affection", "jealousy", "resentment", "admiration"])
@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf"), 9, -9, 10**100, True, "8", 0.5])
def test_raw_provider_emotions_are_validated(monkeypatch, turn, field, value):
    turn["feelings"][field] = value
    runtime = runtime_with_result(monkeypatch, {"structured_response": turn})
    with pytest.raises(CognitionValidationError):
        runtime.generate_private_turn(citizen={}, prompt={})


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf"), "bad", None])
def test_invalid_importance_is_not_normalized_into_success(monkeypatch, turn, value):
    turn["importance"] = value
    runtime = runtime_with_result(monkeypatch, {"structured_response": turn})
    with pytest.raises(CognitionValidationError):
        runtime.generate_private_turn(citizen={}, prompt={})


@pytest.mark.parametrize("result", [None, [], "invalid", {}, {"structured_response": {}}, {"structured_response": None}])
def test_malformed_agent_result_is_a_validation_error(monkeypatch, result):
    runtime = runtime_with_result(monkeypatch, result)
    with pytest.raises(CognitionValidationError):
        runtime.generate_private_turn(citizen={}, prompt={})


@pytest.mark.parametrize("line", ["", "   ", None, 42])
def test_invalid_spoken_line_is_not_a_success(monkeypatch, turn, line):
    turn["spoken_line"] = line
    runtime = runtime_with_result(monkeypatch, {"structured_response": turn})
    with pytest.raises(CognitionValidationError):
        runtime.generate_private_turn(citizen={}, prompt={})


@pytest.mark.parametrize("field", ["task_complete", "end_conversation"])
@pytest.mark.parametrize("value", ["true", 1, [], None])
def test_malformed_completion_flags_are_not_coerced(monkeypatch, turn, field, value):
    turn[field] = value
    runtime = runtime_with_result(monkeypatch, {"structured_response": turn})
    with pytest.raises(CognitionValidationError):
        runtime.generate_private_turn(citizen={}, prompt={})


@pytest.mark.parametrize("importance,expected", [(0, 0), (1, 1), (5, 0.5), (10, 1), (-3, 0), (100, 1)])
def test_valid_turn_retains_legacy_importance_scaling(monkeypatch, turn, importance, expected):
    turn["importance"] = importance
    turn["feelings"].update(affection=-8, jealousy=8)
    runtime = runtime_with_result(monkeypatch, {"structured_response": turn})
    result = runtime.generate_private_turn(citizen={}, prompt={})
    assert result["importance"] == expected
    assert result["feelings"]["affection"] == -8
    assert result["feelings"]["jealousy"] == 8
    assert turn["importance"] == importance


@pytest.mark.parametrize("failure", [None, "provider", "validation"])
def test_private_tool_context_is_restored_after_each_turn(monkeypatch, turn, failure):
    runtime = DeepAgentRuntime(Settings(_env_file=None))
    observed = []

    def invoke(*args, **kwargs):
        observed.append(inspect_private_memory.invoke({}))
        if failure == "provider":
            raise RuntimeError("PRIVATE_PROVIDER_REQUEST")
        return {"structured_response": {} if failure == "validation" else turn}

    monkeypatch.setattr(runtime, "prepare_citizen_agent", lambda citizen: SimpleNamespace(invoke=invoke))
    token = _turn_context.set({"private_memories_for_speaker_only": ["outer context"]})
    try:
        for memory in ["only Aoi knows", "only Riku knows"]:
            if failure:
                error_type = CognitionUnavailableError if failure == "provider" else CognitionValidationError
                with pytest.raises(error_type) as error:
                    runtime.generate_private_turn(citizen={}, prompt={"private_memories_for_speaker_only": [memory]})
                assert "PRIVATE_PROVIDER_REQUEST" not in str(error.value)
            else:
                runtime.generate_private_turn(citizen={}, prompt={"private_memories_for_speaker_only": [memory]})
            assert inspect_private_memory.invoke({}) == "outer context"
        assert observed == ["only Aoi knows", "only Riku knows"]
    finally:
        _turn_context.reset(token)


@pytest.fixture
def payload():
    citizen = {
        "citizen_id": "ava", "name": "Aoi", "age": 21, "profession": "Student",
        "home_location_id": "park", "work_location_id": None, "current_location_id": "park",
        "x": 1, "y": 1, "target_x": 1, "target_y": 1, "money": 50, "health": 80,
        "hunger": 20, "energy": 80, "stress": 20, "happiness": 70, "reputation": 50,
        "current_activity": "Reading", "current_thought": "PRIVATE_THOUGHT",
        "memory_summary": "PRIVATE_SUMMARY", "mood": "Calm",
    }
    city = {
        "city_id": "test", "city_name": "Test City", "policy": {}, "locations": [], "events": [],
        "clock": {"day": 1, "minute_of_day": 360, "tick": 0, "running": False},
        "metrics": {"population": 2, "average_happiness": 70, "city_health": 80,
                    "economy_status": 50, "education_status": 50, "traffic_status": 50,
                    "sick_count": 0, "active_events": 0},
        "citizens": [citizen, {**citizen, "citizen_id": "noah", "name": "Riku"}],
    }
    return {"city": city, "actor_id": "ava", "target_id": "noah", "task": "Say hello"}


@pytest.fixture
def api(monkeypatch):
    def unexpected_call(**kwargs):
        raise AssertionError("Invalid request reached cognition")

    monkeypatch.setattr(routes.cognition.client, "generate_private_exchange", unexpected_call)
    monkeypatch.setattr(routes.cognition.client, "generate", unexpected_call)
    app = FastAPI()
    app.include_router(routes.router)
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize("changes,status", [
    ({"actor_id": "missing"}, 404), ({"target_id": "missing"}, 404),
    ({"target_id": "ava"}, 422), ({"target_id": "noah", "required_target_id": "other"}, 422),
    ({"target_id": None, "require_conversation": True}, 422),
    ({"target_id": None, "player_utterance": "Hello"}, 422),
    ({"actor_id": " "}, 422), ({"target_id": ""}, 422), ({"required_target_id": ""}, 422),
    ({"player_utterance": "   "}, 422), ({"task": "   "}, 422),
])
def test_invalid_request_participants_fail_before_generation(api, payload, changes, status):
    response = api.post("/cognition/session", json={**payload, **changes})
    assert response.status_code == status


def test_duplicate_city_identities_are_rejected(api, payload):
    payload["city"]["citizens"].append(deepcopy(payload["city"]["citizens"][0]))
    assert api.post("/cognition/session", json=payload).status_code == 422


@pytest.mark.parametrize("line", [{"speaker_id": "ava"}, {"text": "Hello"},
    {"speaker_id": "ava", "text": ""}, {"speaker_id": "ava", "text": " "},
    {"speaker_id": "ava", "text": "x" * 601}])
def test_malformed_prior_lines_are_rejected(api, payload, line):
    payload["prior_lines"] = [line]
    assert api.post("/cognition/session", json=payload).status_code == 422


@pytest.mark.parametrize("error,status", [(CognitionUnavailableError("Provider unavailable"), 503),
                                         (CognitionValidationError("Invalid provider response"), 422)])
def test_failed_exchange_has_no_fabricated_response(api, monkeypatch, payload, error, status):
    def fail(**kwargs):
        raise error

    monkeypatch.setattr(routes.cognition.client, "generate_private_exchange", fail)
    response = api.post("/cognition/session", json=payload)
    assert response.status_code == status
    assert response.json() == {"detail": str(error)}


def test_required_target_uses_private_exchange_and_own_memories(api, monkeypatch, payload):
    payload.update(target_id=None, required_target_id="noah", require_conversation=True,
                   memories=["Actor fallback"], private_memories={"noah": ["Riku private"], "outsider": ["Never share"]})
    captured = {}

    def capture(**kwargs):
        captured.update(kwargs)
        raise CognitionUnavailableError("Stopped after inspecting request")

    monkeypatch.setattr(routes.cognition.client, "generate_private_exchange", capture)
    assert api.post("/cognition/session", json=payload).status_code == 503
    assert captured["target"]["citizen_id"] == "noah"
    assert captured["actor_memories"] == ["Actor fallback"]
    assert captured["target_memories"] == ["Riku private"]
    assert "Never share" not in str(captured)


@pytest.mark.parametrize("failed_turn", [1, 2, 3, 4, 5, 6])
@pytest.mark.parametrize("failure,status", [("provider", 503), ("validation", 422)])
def test_partial_exchange_failure_never_returns_success(api, monkeypatch, payload, turn, failed_turn, failure, status):
    client = CitizenCognitionClient(Settings(_env_file=None))
    client.client = object()
    calls = []

    def invoke(*args, **kwargs):
        calls.append(len(calls) + 1)
        if len(calls) == failed_turn:
            if failure == "provider":
                raise RuntimeError("PRIVATE_PROVIDER_REQUEST")
            return {"structured_response": {**turn, "feelings": {**turn["feelings"], "affection": 100}}}
        return {"structured_response": {**turn, "spoken_line": f"Hello, turn {len(calls)}."}}

    monkeypatch.setattr(client.deep_agents, "prepare_citizen_agent", lambda citizen: SimpleNamespace(invoke=invoke))
    monkeypatch.setattr(routes.cognition, "client", client)
    response = api.post("/cognition/session", json=payload)
    assert response.status_code == status
    assert set(response.json()) == {"detail"}
    assert "PRIVATE_PROVIDER_REQUEST" not in response.text
    assert len(calls) == failed_turn
    assert inspect_private_memory.invoke({}) == "No private memories were supplied for this turn."


@pytest.mark.parametrize("failed_preparation", [1, 2, 3])
def test_agent_initialization_failure_is_sanitized(api, monkeypatch, payload, turn, failed_preparation):
    client = CitizenCognitionClient(Settings(_env_file=None))
    client.client = object()
    prepared = []

    def prepare(citizen):
        prepared.append(citizen["citizen_id"])
        if len(prepared) == failed_preparation:
            raise RuntimeError("PRIVATE_PROVIDER_CONFIGURATION")
        return SimpleNamespace(invoke=lambda *a, **kw: {"structured_response": turn})

    monkeypatch.setattr(client.deep_agents, "prepare_citizen_agent", prepare)
    monkeypatch.setattr(routes.cognition, "client", client)
    response = api.post("/cognition/session", json=payload)
    assert response.status_code == 503
    assert set(response.json()) == {"detail"}
    assert "PRIVATE_PROVIDER_CONFIGURATION" not in response.text
    assert len(prepared) == failed_preparation


def test_prior_history_has_a_request_limit(api, payload):
    payload["prior_lines"] = [{"speaker_id": "ava", "text": "Hello"}] * 13
    assert api.post("/cognition/session", json=payload).status_code == 422


@pytest.mark.parametrize("proposal,asked", [("date", True), ("none", False)])
def test_a_proposal_made_by_action_is_put_to_the_target_as_a_question(api, monkeypatch, payload, turn, proposal, asked):
    client = CitizenCognitionClient(Settings(_env_file=None))
    client.client = object()
    prompts = []

    def invoke(*args, **kwargs):
        prompts.append(str(args) + str(kwargs))
        return {"structured_response": {**turn, "spoken_line": "Yes, I'd love that.", "invitation_response": "accepted" if asked else "none"}}

    monkeypatch.setattr(client.deep_agents, "prepare_citizen_agent", lambda citizen: SimpleNamespace(invoke=invoke))
    monkeypatch.setattr(routes.cognition, "client", client)
    payload.update(player_utterance="*takes Riku's hand and asks him to be her boyfriend*", proposal=proposal)
    response = api.post("/cognition/session", json=payload)
    assert response.status_code == 200
    assert len(prompts) == 1  # only the target speaks after a player's line
    assert ("Aoi is asking you to be their partner and start dating" in prompts[0]) is asked
    assert response.json()["participant_outcomes"]["noah"]["invitation_response"] == ("accepted" if asked else "none")


def test_only_real_proposals_are_accepted(api, payload):
    payload.update(proposal="breakup")
    assert api.post("/cognition/session", json=payload).status_code == 422
