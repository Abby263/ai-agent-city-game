import pytest

from app.cognition.client import CitizenCognitionClient
from app.cognition.errors import CognitionValidationError
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
    return client.generate_private_exchange(actor={"citizen_id": "ava", "name": "Aoi", "profession": "Student"},
        target={"citizen_id": "noah", "name": "Riku", "profession": "Student"}, city_time="Day 1, 06:00",
        task="Invite Riku to dinner", observations=["Aoi privately learned a secret from Mio."],
        actor_memories=["Mio invited only Sota."], target_memories=["I want to study."],
        event_context="Another private conversation.", **kwargs)


def test_listener_does_not_receive_actor_private_observations(monkeypatch):
    client, prompts = setup_client(monkeypatch, [{"spoken_line": "Want to eat together?"},
        {"spoken_line": "No thanks, I'm studying.", "invitation_response": "declined", "end_conversation": True}])
    result = exchange(client)
    target_prompt = prompts[1][1]
    assert target_prompt["private_memories_for_speaker_only"] == ["I want to study."]
    assert "secret" not in str(target_prompt)
    assert "Mio invited" not in str(target_prompt)
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
    client, prompts = setup_client(monkeypatch, [{"spoken_line": f"Natural line {i}"} for i in range(6)])
    def unexpected_alignment(*args):
        raise AssertionError("Autonomous small talk is not a player-task keyword match")
    monkeypatch.setattr(client, "_line_is_off_task", unexpected_alignment)
    result = exchange(client, autonomous=True)
    assert len(prompts) == 6
    assert [line["speaker_id"] for line in result.conversation["lines"]] == ["ava", "noah"] * 3


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
        actor={"citizen_id": "ava", "name": "Aoi", "profession": "Student",
               "personality": {"nature": {"traits": ["Reserved"], "sensitivity": "Unfinished drawings"}}},
        target={"citizen_id": "noah", "name": "Riku", "profession": "Student",
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


def test_ongoing_chat_remembers_what_was_just_said(monkeypatch):
    client, prompts = setup_client(monkeypatch, [{"spoken_line": "Ha, the same answer as last time: curry, obviously."}])
    prior = [{"speaker_id": "ava", "text": "Hey Riku!"}, {"speaker_id": "noah", "text": "Hi Aoi, what's up?"},
             {"speaker_id": "someone_else", "text": "I should never be shared."}]
    result = exchange(client, player_utterance="What should we cook tonight?", prior_lines=prior)
    heard = prompts[0][1]["public_transcript_so_far"]
    assert [line["text"] for line in heard] == ["What should we cook tonight?"]
    assert prompts[0][1]["previous_exchange_lines_background_only"] == prior[:2]
    assert prompts[0][1]["active_turn"]["latest_partner_turn"]["text"] == "What should we cook tonight?"
    assert [line["text"] for line in result.conversation["lines"]] == ["What should we cook tonight?", "Ha, the same answer as last time: curry, obviously."]


def test_topic_change_keeps_gift_history_out_of_active_ramen_exchange(monkeypatch):
    turns = ["Want to get ramen?", "Yes! Which place?", "The cafe by the station?",
             "Sounds good. Shall we go at six?", "Six works. See you there!", "See you at six."]
    client, prompts = setup_client(monkeypatch, [{"spoken_line": line} for line in turns])
    prior = [{"speaker_id": "ava", "text": "I brought you a gift."},
             {"speaker_id": "noah", "text": "What's in the box?"}]
    result = client.generate_private_exchange(
        actor={"citizen_id": "ava", "name": "Aoi", "age": 21, "profession": "Lab assistant",
               "memory_summary": "STALE_SUMMARY", "current_thought": "STALE_THOUGHT",
               "personality": {"player_task": {"task": "STALE_TASK"}}},
        target={"citizen_id": "noah", "name": "Riku", "age": 21, "profession": "Gym instructor"},
        city_time="Day 1, 18:00", task="Invite Riku for ramen", observations=[],
        actor_memories=["I gave Riku a gift."], target_memories=["Aoi gave me a gift."],
        event_context="", autonomous=True, prior_lines=prior,
    )
    for i, (_, prompt) in enumerate(prompts):
        assert prompt["previous_exchange_lines_background_only"] == prior
        assert [line["text"] for line in prompt["public_transcript_so_far"]] == turns[:i]
        active = prompt["active_turn"]
        assert active["number"] == i + 1
        assert active["remaining_turns_including_this_one"] == 6 - i
        assert (active["latest_partner_turn"]["text"] if i else active["latest_partner_turn"]) == (turns[i - 1] if i else None)
        assert (active["your_previous_turn"]["text"] if i > 1 else active["your_previous_turn"]) == (turns[i - 2] if i > 1 else None)
        assert "STALE_" not in str(prompt)
    assert len(result.conversation["lines"]) == 6
    assert "What's in the box?" not in result.participant_memories["ava"]


@pytest.mark.parametrize("actor_id,target_id", [("ava", "ava"), ("", "noah"), ("ava", " "), (None, "noah"), (1, "1")])
def test_direct_exchange_rejects_ambiguous_participant_identity(monkeypatch, actor_id, target_id):
    client, prompts = setup_client(monkeypatch, [])
    prepared = []
    monkeypatch.setattr(client.deep_agents, "prepare_citizen_agent", lambda citizen: prepared.append(citizen))
    with pytest.raises(CognitionValidationError):
        client.generate_private_exchange(
            actor={"citizen_id": actor_id, "name": "Aoi", "profession": "Student"},
            target={"citizen_id": target_id, "name": "Riku", "profession": "Student"},
            city_time="06:00", task="Talk", observations=[], actor_memories=[], target_memories=[], event_context="",
        )
    assert prompts == []
    assert prepared == []


@pytest.mark.parametrize("line", [{"speaker_id": "ava"}, {"speaker_id": "ava", "text": None}, None])
def test_direct_exchange_rejects_malformed_history_before_generation(monkeypatch, line):
    client, prompts = setup_client(monkeypatch, [])
    with pytest.raises(CognitionValidationError):
        exchange(client, prior_lines=[line])
    assert prompts == []


def test_private_task_does_not_leak_into_public_summary(monkeypatch):
    client, prompts = setup_client(monkeypatch, [
        {"spoken_line": "Hello there."}, {"spoken_line": "Hello!", "end_conversation": True},
    ])
    result = client.generate_private_exchange(
        actor={"citizen_id": "ava", "name": "Aoi", "profession": "Student"},
        target={"citizen_id": "noah", "name": "Riku", "profession": "Student"},
        city_time="06:00", task="Say hello without mentioning PRIVATE_TASK_SECRET", observations=[],
        actor_memories=[], target_memories=[], event_context="",
    )
    assert "PRIVATE_TASK_SECRET" not in result.conversation["summary"]
    assert "PRIVATE_TASK_SECRET" not in str(prompts[1][1])
    assert "PRIVATE_TASK_SECRET" not in str(result.participant_memories)


@pytest.mark.parametrize("stop_turn", [2, 3, 4, 5, 6])
def test_exchange_stops_at_requested_turn_without_extra_calls(monkeypatch, stop_turn):
    client, prompts = setup_client(monkeypatch, [
        {"spoken_line": f"Line {i}", "end_conversation": i == stop_turn - 1} for i in range(stop_turn)
    ])
    result = exchange(client)
    assert len(prompts) == len(result.conversation["lines"]) == stop_turn


def test_alignment_retry_cannot_exceed_one_retry_or_expand_turn_cap(monkeypatch):
    client, prompts = setup_client(monkeypatch, [{"spoken_line": f"Line {i}"} for i in range(7)])
    monkeypatch.setattr(client, "_line_is_off_task", lambda *args: True)
    result = exchange(client)
    assert len(prompts) == 7
    assert len(result.conversation["lines"]) == 6
    assert "Line 0" not in str(result.participant_memories)


@pytest.mark.parametrize("utterance", ["", " ", 42, "x" * 601])
def test_invalid_player_utterance_never_falls_back_to_ai_voice(monkeypatch, utterance):
    client, prompts = setup_client(monkeypatch, [])
    with pytest.raises(CognitionValidationError):
        exchange(client, player_utterance=utterance)
    assert prompts == []


def test_escaped_blank_provider_line_cannot_complete_exchange(monkeypatch):
    client, prompts = setup_client(monkeypatch, [
        {"spoken_line": r"\u0020\u000a"}, {"spoken_line": "Hello!", "end_conversation": True},
    ])
    with pytest.raises(CognitionValidationError):
        exchange(client)
    assert len(prompts) == 1
