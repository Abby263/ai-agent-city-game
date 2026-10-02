"""The narrator: a voice that tells the player what is going on and carries out what they ask for, spoken or typed.

The player says anything ("who is that?", "let me be Ren and go talk to Aoi", "tell Haruto to come clean"). The narrator
answers in a sentence or two and returns a short list of game actions from a fixed set. The browser carries them out;
anything naming a person, place or case that isn't in the scene is dropped rather than invented.
"""

from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.cognition.errors import CognitionValidationError

ActionType = Literal[
    "play_as", "stop_playing", "talk_to", "say_to", "go_to", "nudge", "watch", "pause", "resume", "speed",
    "street_view", "overview", "make_happen", "replay_scene", "skip_scene", "mute", "unmute",
]


class NarratorPerson(BaseModel):
    citizen_id: str
    name: str
    age: int = 0
    profession: str = ""
    location: str = ""
    activity: str = ""
    mood: str = ""


class NarratorPlace(BaseModel):
    location_id: str
    name: str


class NarratorCase(BaseModel):
    case_id: str
    title: str
    goal: str
    brief: str = Field(default="", max_length=600)
    # How the scenes played so far went, in order.
    so_far: list[str] = Field(default_factory=list, max_length=12)
    next_scene: str = Field(default="", max_length=300)
    # The two people in the next scene: the only ones a nudge can go to.
    next_scene_people: list[str] = Field(default_factory=list, max_length=2)


class NarratorTurn(BaseModel):
    role: Literal["player", "narrator"]
    text: str = Field(max_length=600)


class NarratorRequest(BaseModel):
    text: str = Field(min_length=1, max_length=400)
    city_time: str
    # The resident the player is playing as, if any.
    playing_as: str = ""
    # What is on screen right now, in plain words: the scene, who is speaking, the lines so far.
    on_screen: str = Field(default="", max_length=3000)
    recent: list[str] = Field(default_factory=list, max_length=12)
    cases: list[NarratorCase] = Field(default_factory=list, max_length=12)
    nudges_left: int = Field(default=0, ge=0, le=9)
    people: list[NarratorPerson] = Field(default_factory=list, max_length=60)
    places: list[NarratorPlace] = Field(default_factory=list, max_length=40)
    history: list[NarratorTurn] = Field(default_factory=list, max_length=8)


class NarratorAction(BaseModel):
    type: ActionType
    citizen_id: str = ""
    location_id: str = ""
    case_id: str = ""
    text: str = Field(default="", max_length=400)


class NarratorReply(BaseModel):
    say: str = Field(min_length=1, max_length=600)
    actions: list[NarratorAction] = Field(default_factory=list, max_length=8)


SCHEMA = {
    "type": "object",
    "properties": {
        "say": {"type": "string", "description": "What you say back, aloud: one to three short sentences, plain spoken English, no lists, no emoji."},
        "actions": {
            "type": "array",
            "description": "What the game should do now, in order. Empty when the player only asked a question.",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": list(ActionType.__args__)},
                    "citizen_id": {"type": "string", "description": "Exact id of the person this is about; empty if none."},
                    "location_id": {"type": "string", "description": "Exact id of the place; empty if none."},
                    "case_id": {"type": "string", "description": "Exact id of the case, for a nudge; empty otherwise."},
                    "text": {"type": "string", "description": "Words to say (say_to), the advice (nudge), what happens (make_happen) or the speed 1, 2 or 4 (speed)."},
                },
                "required": ["type", "citizen_id", "location_id", "case_id", "text"],
            },
        },
    },
    "required": ["say", "actions"],
}

SYSTEM = (
    "You are the narrator of AgentCity, a life simulation set in Nakameguro, Tokyo, where every resident is an adult AI "
    "character. The player is the neighbourhood's fixer: they watch residents' scenes and steer them. They talk to you "
    "out loud, so their words arrive as a speech transcript that may contain mishearings: match names to the closest "
    "resident or place in the scene. You do two things. First, explain: say what is happening and why it matters, using "
    "only the supplied scene, cases and people; you know every case's secrets and may tell the player, but never invent "
    "events. Second, act: turn what the player asks for into actions from the fixed list, using exact ids. "
    "Speak like a warm, wry storyteller, briefly, in the second person. Never read out ids."
)

RULES = [
    "play_as: the player becomes that resident (citizen_id). stop_playing: back to watching.",
    "talk_to: the resident the player is playing walks up to citizen_id and the chat opens. If the player names who they want to be and who to talk to in one breath, return play_as first, then talk_to.",
    "say_to: the played resident says `text` to citizen_id, in the player's words, first person. Only when the player gives the words to say.",
    "go_to: the played resident walks to location_id. If nobody is being played, it just shows that place.",
    "nudge: a quiet word of advice (`text`, one sentence, addressed to them) to citizen_id, who must be one of next_scene_people of case_id. Costs one nudge; if nudges_left is 0, say so and return no nudge.",
    "watch: move the camera to citizen_id. street_view: stand in the street at location_id or beside citizen_id. overview: the whole town from above.",
    "pause, resume, speed (text is 1, 2 or 4), mute, unmute, skip_scene (skip the scene being played), replay_scene (watch the last scene again).",
    "make_happen: the player decides something happens in the town; `text` says what, citizen_id is who does it (empty if it simply happens). Costs one nudge.",
    "Speech recognition mangles Japanese names into English words: 'wren' is Ren, 'a oy', 'a boy' or 'owie' is Aoi, 'her auto' or "
    "'hot auto' is Haruto, 'key ko' is Keiko, 'you key' is Yuki. Match each garbled name to the resident it sounds most like; "
    "two different names in one request are two different people.",
    "If the request is unclear, or needs someone to be played first and the player has not said who, ask one short question and return no actions.",
    "If the player only asks what is going on, who someone is, or what to do next, answer from the scene and cases and return no actions. Suggest one concrete thing they could say next.",
]


def narrate(client, request: NarratorRequest) -> NarratorReply:
    prompt = {
        "player_said": request.text,
        "city_time": request.city_time,
        "player_is_playing_as": request.playing_as or "nobody (watching)",
        "on_screen_now": request.on_screen,
        "recent_events": request.recent,
        "cases": [c.model_dump() for c in request.cases],
        "nudges_left_today": request.nudges_left,
        "people": [p.model_dump() for p in request.people],
        "places": [p.model_dump() for p in request.places],
        "conversation_so_far": [t.model_dump() for t in request.history],
        "rules": RULES,
    }
    raw = client._generate_json(SYSTEM, prompt, SCHEMA, "narrator_reply")
    if isinstance(raw.get("actions"), list):
        raw["actions"] = raw["actions"][:8]
    try:
        reply = NarratorReply.model_validate(raw)
    except ValidationError as error:
        raise CognitionValidationError("The narrator lost the thread. Try saying it again.") from error
    people = {p.citizen_id for p in request.people}
    places = {p.location_id for p in request.places}
    cases = {c.case_id: c for c in request.cases}
    kept: list[NarratorAction] = []
    for action in reply.actions:
        # Anything outside the scene is dropped rather than invented.
        if action.citizen_id and action.citizen_id not in people:
            continue
        if action.location_id and action.location_id not in places:
            continue
        if action.type in ("play_as", "talk_to", "say_to", "watch") and not action.citizen_id:
            continue
        if action.type in ("say_to", "make_happen") and not action.text.strip():
            continue
        if action.type == "nudge":
            case = cases.get(action.case_id)
            if not case or action.citizen_id not in case.next_scene_people or not action.text.strip() or request.nudges_left <= 0:
                continue
        if action.type == "speed" and action.text.strip() not in ("1", "2", "4"):
            continue
        kept.append(action)
    reply.actions = kept[:4]
    return reply
