from app.cognition.client import CitizenCognitionClient
from app.config import Settings


def setup_client(monkeypatch, turns):
    client = CitizenCognitionClient(Settings(_env_file=None, llm_provider="openai", openai_api_key=None, gemini_api_key=None))
    client.client = object()
    prompts = []
    monkeypatch.setattr(client.deep_agents, "prepare_citizen_agent", lambda citizen: None)
    monkeypatch.setattr(client, "_line_is_off_task", lambda *args: False)

    def generate(*, citizen, prompt):
        prompts.append((citizen["citizen_id"], prompt))
        return {"thought": "Thinking", "mood": "Calm", "memory": "My memory", "reflection": "My reflection", "importance": .5,
                "invitation_response": "none", "relationship_effect": "neutral", "relationship_reason": "Routine conversation.",
                "task_complete": False, "end_conversation": False, **turns[len(prompts) - 1]}

    monkeypatch.setattr(client.deep_agents, "generate_private_turn", generate)
    return client, prompts


def exchange(client, **kwargs):
    return client.generate_private_exchange(actor={"citizen_id": "ava", "name": "Ava", "profession": "Student"},
        target={"citizen_id": "noah", "name": "Noah", "profession": "Student"}, city_time="Day 1, 06:00",
        task="Invite Noah to dinner", observations=["Ava privately learned a secret from Iris."],
        actor_memories=["Iris invited only Leo."], target_memories=["I want to study."],
        event_context="Another private conversation.", **kwargs)


def test_listener_does_not_receive_actor_private_observations(monkeypatch):
    client, prompts = setup_client(monkeypatch, [{"spoken_line": "Want to eat together?"},
        {"spoken_line": "No thanks, I'm studying.", "invitation_response": "declined", "end_conversation": True}])
    result = exchange(client)
    target_prompt = prompts[1][1]
    assert target_prompt["private_memories_for_speaker_only"] == ["I want to study."]
    assert "secret" not in str(target_prompt)
    assert "Iris invited" not in str(target_prompt)
    assert target_prompt["event_context"] == ""
    assert result.participant_outcomes["noah"]["invitation_response"] == "declined"


def test_followup_can_receive_an_answer(monkeypatch):
    client, prompts = setup_client(monkeypatch, [{"spoken_line": "Would you come for dinner?"},
        {"spoken_line": "What time?"}, {"spoken_line": "Seven. Does that work?"},
        {"spoken_line": "Yes, see you at seven.", "invitation_response": "accepted", "end_conversation": True}])
    result = exchange(client)
    assert len(prompts) == 4
    assert len(result.conversation["lines"]) == 4
    assert "see you at seven" in result.participant_memories["ava"]
    assert "see you at seven" in result.participant_memories["noah"]


def test_player_keeps_control_of_their_voice(monkeypatch):
    client, prompts = setup_client(monkeypatch, [{"spoken_line": "I'm a bit worried about my exam. How about you?"}])
    result = exchange(client, player_utterance="How are you doing?")
    assert [speaker for speaker, _ in prompts] == ["noah"]
    assert result.conversation["lines"][0] == {"speaker_id": "ava", "text": "How are you doing?"}
    assert len(result.conversation["lines"]) == 2
    assert "ava" not in result.participant_outcomes


def test_exchange_has_a_hard_turn_limit(monkeypatch):
    client, prompts = setup_client(monkeypatch, [{"spoken_line": f"Question number {i}?"} for i in range(6)])
    exchange(client)
    assert len(prompts) == 6


def test_autonomous_exchange_has_followups_without_task_keyword_retries(monkeypatch):
    client, prompts = setup_client(monkeypatch, [{"spoken_line": f"Natural line {i}"} for i in range(4)])
    def unexpected_alignment(*args):
        raise AssertionError("Autonomous small talk is not a player-task keyword match")
    monkeypatch.setattr(client, "_line_is_off_task", unexpected_alignment)
    result = exchange(client, autonomous=True)
    assert len(prompts) == 4
    assert [line["speaker_id"] for line in result.conversation["lines"]] == ["ava", "noah", "ava", "noah"]


def test_emotional_outcomes_stay_directional_and_private(monkeypatch):
    client, prompts = setup_client(monkeypatch, [
        {"spoken_line": "I saved a seat for you.", "feelings": {"affection": 2, "reason": "I wanted to include them."}, "mood": "Hopeful"},
        {"spoken_line": "Thanks, but I want some time alone.", "feelings": {"affection": 0, "resentment": 1, "reason": "I felt pressured."}, "mood": "Uneasy", "end_conversation": True},
    ])
    result = exchange(client)
    assert result.participant_outcomes["ava"]["feelings"]["affection"] == 2
    assert result.participant_outcomes["noah"]["feelings"]["affection"] == 0
    assert result.participant_outcomes["noah"]["mood"] == "Uneasy"
    assert "I wanted to include them" not in str(prompts[1][1])


def test_emotional_schema_rejects_extreme_changes():
    import pytest
    from pydantic import ValidationError
    from app.cognition.deep_agents import FeelingChange
    with pytest.raises(ValidationError):
        FeelingChange(affection=0, jealousy=100, resentment=0, admiration=0, reason="A greeting")
    assert FeelingChange(affection=0, jealousy=0, resentment=0, admiration=0, reason="").jealousy == 0


def test_nature_is_speaker_private_and_shapes_emotional_prompt(monkeypatch):
    client, prompts = setup_client(monkeypatch, [
        {"spoken_line": "Can I share a drawing?", "end_conversation": False},
        {"spoken_line": "Sure.", "end_conversation": True},
    ])
    client.generate_private_exchange(
        actor={"citizen_id": "ava", "name": "Ava", "profession": "Student",
               "personality": {"nature": {"traits": ["Reserved"], "sensitivity": "Unfinished drawings"}}},
        target={"citizen_id": "noah", "name": "Noah", "profession": "Student",
                "personality": {"nature": {"traits": ["Energetic"]}}},
        city_time="06:00", task="Talk", observations=[], actor_memories=[], target_memories=[], event_context="",
    )
    assert prompts[0][1]["own_nature"]["traits"] == ["Reserved"]
    assert prompts[1][1]["own_nature"]["traits"] == ["Energetic"]
    assert "Unfinished drawings" not in str(prompts[1][1])
    assert any("values" in rule and "feelings" in rule for rule in prompts[0][1]["rules"])


def test_meeting_requires_the_other_person_to_accept_a_public_offer(monkeypatch):
    proposal = {"action": "propose", "location_id": "park", "game_day": 1, "game_minute": 480, "topic": "Drawing together"}
    client, prompts = setup_client(monkeypatch, [
        {"spoken_line": "Meet at the park at eight to draw?", "meeting_action": proposal},
        {"spoken_line": "Yes, at eight in the park.", "meeting_action": {**proposal, "action": "accept"}, "end_conversation": True},
    ])
    result = exchange(client, meeting_now=1800, meeting_locations=[{"location_id": "park", "name": "Park"}])
    assert result.meeting_plan["actor_ids"] == ["ava", "noah"]
    assert prompts[1][1]["public_meeting_offer"]["proposer_id"] == "ava"
    assert "secret" not in str(prompts[1][1])


def test_unaccepted_and_mismatched_offers_do_not_make_shared_plans(monkeypatch):
    proposal = {"action": "propose", "location_id": "park", "game_day": 1, "game_minute": 480, "topic": "Drawing"}
    for answer in [None, {**proposal, "action": "decline"}, {**proposal, "action": "accept", "game_minute": 500}]:
        client, _ = setup_client(monkeypatch, [
            {"spoken_line": "Meet at the park at eight?", "meeting_action": proposal},
            {"spoken_line": "I have not agreed to that plan.", "meeting_action": answer, "end_conversation": True},
        ])
        assert exchange(client, meeting_now=1800, meeting_locations=[{"location_id": "park", "name": "Park"}]).meeting_plan is None
