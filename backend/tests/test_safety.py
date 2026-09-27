from fastapi.testclient import TestClient

from app.main import app
from app.safety import CITIZEN_SAFETY_RULES, check_player_text


def test_friendly_text_is_allowed():
    for text in [
        "Hi Noah, want to study for the science test together?",
        "3 kids crossed the road to the park",
        "Meet me at the library at 15:30 on day 2",
        "I scored 12 points in the class quiz!",
        "That shiny new bike looks awesome",
    ]:
        assert check_player_text(text) is None, text


def test_personal_information_is_blocked():
    assert check_player_text("email me at kid@example.com") == "personal_info"
    assert check_player_text("call 555-123-4567 later") == "personal_info"
    assert check_player_text("I live at 42 Maple Street") == "personal_info"
    assert check_player_text("my password is sunshine") == "personal_info"


def test_links_are_blocked():
    assert check_player_text("check out https://example.com/game") == "link"
    assert check_player_text("go to coolgames.gg") == "link"


def test_unkind_language_is_blocked_including_disguised_spellings():
    assert check_player_text("you are a sh1t friend") == "unkind_language"
    assert check_player_text("f.u.c.k this") == "unkind_language"
    assert check_player_text("just kys") == "unkind_language"


def test_wellbeing_messages_are_redirected_to_trusted_adults():
    assert check_player_text("sometimes I want to die") == "wellbeing"
    assert check_player_text("I keep hurting myself") == "wellbeing"


def test_child_safety_rules_cover_core_topics():
    for phrase in ["adults aged 18", "romance", "under 18", "violence", "personal details", "trusted adult", "grief", "never glorify violence", "Adults never hurt children"]:
        assert phrase in CITIZEN_SAFETY_RULES


def test_api_rejects_unsafe_player_speech_before_calling_a_model():
    with TestClient(app) as client:
        city = client.get("/city/state").json()
        actor, target = city["citizens"][0]["citizen_id"], city["citizens"][1]["citizen_id"]
        response = client.post(
        "/cognition/session",
            json={"city": city, "actor_id": actor, "target_id": target, "task": "Respond to the player's spoken words.",
                  "player_utterance": "my phone number is 555 123 4567"},
        )
    assert response.status_code == 400
    assert "phone numbers" in response.json()["detail"]



def test_voice_endpoint_rejects_unknown_voices_and_needs_gemini():
    from app.api import routes
    with TestClient(app) as client:
        unknown = client.post("/speech", json={"text": "Hello", "voice": "Zarvox"})
        assert unknown.status_code in (422, 503)
        if routes.settings.llm_provider != "gemini":
            assert client.post("/speech", json={"text": "Hello", "voice": "Kore"}).status_code == 503
