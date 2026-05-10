from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.cognition.openai_client import CitizenCognitionClient, TaskPlanResult
from app.models import Base, CitizenORM, CityEventORM, ConversationORM, MemoryORM
from app.schemas import AssignTaskRequest, SimulationModeRequest, TriggerEventRequest
from app.seed import ensure_seeded
from app.simulation.engine import SimulationEngine


class FakePlanClient:
    def __init__(
        self,
        *,
        target_ids: list[str] | None = None,
        location_id: str | None = None,
        task_kind: str | None = None,
    ):
        self.target_ids = target_ids or []
        self.location_id = location_id
        self.task_kind = task_kind

    def plan_task(self, **kwargs):
        actor_name = kwargs["citizen"]["name"]
        target_count = len(self.target_ids)
        return TaskPlanResult(
            task_kind=self.task_kind or ("targeted_talk" if target_count else "self_answer"),
            target_citizen_ids=self.target_ids,
            location_id=self.location_id,
            reasoning_summary="Test planner stands in for OpenAI planning.",
            player_visible_plan=f"{actor_name} will use AI planning to complete the task.",
        )


class FakePlanningPipeline:
    def __init__(
        self,
        *,
        target_ids: list[str] | None = None,
        location_id: str | None = None,
        task_kind: str | None = None,
    ):
        self.client = FakePlanClient(target_ids=target_ids, location_id=location_id, task_kind=task_kind)


class FakeTaskCognition(FakePlanningPipeline):
    def process_tick(self, db, *, citizens, locations, day, minute_of_day, observations, event_context):
        citizen = db.get(CitizenORM, "cit_009")
        task = (citizen.personality or {}).get("player_task") or {}
        target_id = str(task.get("target_citizen_id") or "cit_010")
        return [
            {
                "citizen_id": "cit_009",
                "thought": "I should ask directly and listen to the answer.",
                "mood": "Focused",
                "memory": {"content": "I asked a classmate directly and listened."},
                "reflection": {"insight": "Direct questions build trust."},
                "conversation": {
                    "actor_ids": ["cit_009", target_id],
                    "transcript": [
                        {"speaker_id": "cit_009", "text": "How are you doing?"},
                        {"speaker_id": target_id, "text": "I am doing okay and glad you asked."},
                    ],
                    "summary": "A real AI-generated exchange happened in the test double.",
                },
            }
        ]


def session_factory():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    ensure_seeded(session)
    return session


def test_tick_progresses_clock_and_moves_citizens():
    db = session_factory()
    engine = SimulationEngine(Settings(database_url="sqlite+pysqlite:///:memory:"))
    engine.set_mode(db, SimulationModeRequest(mode="autonomous"))
    before = engine.get_state(db)
    result = engine.tick(db)
    after = result["state"]

    assert after.clock.tick == before.clock.tick + 1
    assert after.clock.minute_of_day == before.clock.minute_of_day + 15
    assert len(after.citizens) == 5
    assert db.query(CitizenORM).count() >= 26
    assert {citizen.profession for citizen in after.citizens} == {"Student"}
    assert any(citizen.current_activity for citizen in after.citizens)


def test_assign_task_creates_goal_memory_and_event():
    db = session_factory()
    engine = SimulationEngine(Settings(database_url="sqlite+pysqlite:///:memory:"))
    state = engine.assign_task(
        db,
        "cit_009",
        AssignTaskRequest(task="Ask Iris if she wants to study together"),
        FakePlanningPipeline(target_ids=["cit_022"], location_id="loc_library"),
    )
    citizen = db.get(CitizenORM, "cit_009")

    assert len(state.citizens) == 5
    assert citizen.current_activity == "Task: Ask Iris if she wants to study together"
    assert citizen.personality["player_task"]["status"] == "active"
    assert citizen.short_term_goals[0].startswith("Player task:")
    assert db.query(MemoryORM).filter(MemoryORM.citizen_id == "cit_009").count() >= 2
    assert any(event.event_type == "player_task" for event in state.events)


def test_flu_outbreak_changes_health_and_writes_memories():
    db = session_factory()
    engine = SimulationEngine(Settings(database_url="sqlite+pysqlite:///:memory:"))
    before = db.get(CitizenORM, "cit_009").health
    state = engine.trigger_event(db, TriggerEventRequest(event_type="flu_outbreak", severity="medium"))
    after = db.get(CitizenORM, "cit_009").health

    assert after < before
    assert state.metrics.sick_count >= 1
    assert db.query(MemoryORM).filter(MemoryORM.citizen_id == "cit_009").count() >= 2


def test_recent_events_hide_inactive_citizen_history():
    db = session_factory()
    engine = SimulationEngine(Settings(database_url="sqlite+pysqlite:///:memory:"))
    db.add_all(
        [
            CityEventORM(
                event_id="evt_active_only",
                game_day=1,
                game_minute=480,
                event_type="social_opportunity",
                actors=["cit_009", "cit_010"],
                description="Ava Singh and Mateo Garcia talk after class.",
            ),
            CityEventORM(
                event_id="evt_mixed_inactive",
                game_day=1,
                game_minute=480,
                event_type="social_opportunity",
                actors=["cit_009", "cit_002"],
                description="Ava Singh and inactive Milo Chen talk after class.",
            ),
        ]
    )
    db.commit()

    event_ids = {event.event_id for event in engine._recent_events(db, limit=20)}

    assert "evt_active_only" in event_ids
    assert "evt_mixed_inactive" not in event_ids


def test_city_conversations_endpoint_filters_inactive_history():
    from app.api.routes import get_city_conversations

    db = session_factory()
    db.add_all(
        [
            ConversationORM(
                conversation_id="conv_active",
                game_day=1,
                game_minute=540,
                actor_ids=["cit_009", "cit_010"],
                transcript=[{"speaker_id": "cit_009", "text": "Want to study later?"}],
                summary="Ava and Mateo make a study plan.",
            ),
            ConversationORM(
                conversation_id="conv_mixed_inactive",
                game_day=1,
                game_minute=540,
                actor_ids=["cit_009", "cit_002"],
                transcript=[{"speaker_id": "cit_002", "text": "This should stay hidden."}],
                summary="An inactive citizen is involved.",
            ),
        ]
    )
    db.commit()

    conversation_ids = {conversation.conversation_id for conversation in get_city_conversations(db=db)}

    assert "conv_active" in conversation_ids
    assert "conv_mixed_inactive" not in conversation_ids


def test_cognition_candidate_selection_is_selective():
    db = session_factory()
    settings = Settings(
        database_url="sqlite+pysqlite:///:memory:",
        max_llm_calls_per_tick=3,
        llm_cognition_interval_ticks=1,
    )
    engine = SimulationEngine(settings)
    from app.cognition.pipeline import CognitionPipeline

    pipeline = CognitionPipeline(settings)
    engine.set_mode(db, SimulationModeRequest(mode="autonomous"))
    engine.trigger_event(db, TriggerEventRequest(event_type="traffic_accident", severity="high"))
    candidates = pipeline._rank_candidates(
        engine._active_citizens(db),
        {"cit_009": ["A traffic accident happened near the bus stop."]},
        "A traffic accident happened near the bus stop.",
    )

    assert candidates
    assert len(candidates) <= len(engine._active_citizens(db))


def test_manual_mode_waits_until_player_assigns_task():
    db = session_factory()
    engine = SimulationEngine(Settings(database_url="sqlite+pysqlite:///:memory:"))
    before = engine.get_state(db)

    result = engine.tick(db)
    after = result["state"]

    assert after.simulation_mode == "manual"
    assert after.clock.tick == before.clock.tick
    assert not after.clock.running
    assert result["events"] == []


def test_manual_task_runs_then_autopauses_when_completed():
    db = session_factory()
    engine = SimulationEngine(Settings(database_url="sqlite+pysqlite:///:memory:"))
    assigned = engine.assign_task(
        db,
        "cit_009",
        AssignTaskRequest(task="Talk with Mateo about the science project"),
        FakeTaskCognition(target_ids=["cit_010"], location_id="loc_school"),
    )

    assert assigned.clock.running
    assert assigned.simulation_mode == "manual"
    actor = db.get(CitizenORM, "cit_009")
    target = db.get(CitizenORM, "cit_010")
    actor.current_location_id = target.current_location_id
    actor.x = target.x
    actor.y = target.y
    db.commit()

    result = engine.tick(db, FakeTaskCognition(target_ids=["cit_010"], location_id="loc_school"))
    after = result["state"]
    citizen = db.get(CitizenORM, "cit_009")

    assert after.clock.tick == assigned.clock.tick + 1
    assert not after.clock.running
    assert citizen.personality["player_task"]["status"] == "completed"
    assert any(event.event_type == "player_task_completed" for event in result["events"])


def test_close_task_stops_manual_task_run():
    db = session_factory()
    engine = SimulationEngine(Settings(database_url="sqlite+pysqlite:///:memory:"))
    engine.assign_task(
        db,
        "cit_009",
        AssignTaskRequest(task="Ask Iris how she is feeling"),
        FakePlanningPipeline(target_ids=["cit_022"], location_id="loc_school"),
    )

    state = engine.close_task(db, "cit_009")
    citizen = db.get(CitizenORM, "cit_009")

    assert not state.clock.running
    assert citizen.personality["player_task"]["status"] == "closed"


def test_location_task_does_not_complete_before_arrival():
    db = session_factory()
    engine = SimulationEngine(Settings(database_url="sqlite+pysqlite:///:memory:"))
    assigned = engine.assign_task(
        db,
        "cit_009",
        AssignTaskRequest(task="Go to the bank"),
        FakePlanningPipeline(location_id="loc_bank", task_kind="go_to_location"),
    )

    result = engine.tick(db, FakePlanningPipeline(location_id="loc_bank", task_kind="go_to_location"))
    citizen = db.get(CitizenORM, "cit_009")

    assert assigned.clock.running
    assert result["state"].clock.running
    assert citizen.personality["player_task"]["status"] == "active"
    assert citizen.current_location_id != "loc_bank"
    assert any(event.event_type == "player_task_travel" for event in result["events"])


def test_companion_location_task_coordinates_then_travels():
    db = session_factory()
    engine = SimulationEngine(Settings(database_url="sqlite+pysqlite:///:memory:"))
    engine.assign_task(
        db,
        "cit_009",
        AssignTaskRequest(task="Go to the Bank along with Mateo"),
        FakeTaskCognition(target_ids=["cit_010"], location_id="loc_bank", task_kind="go_with_citizen"),
    )
    actor = db.get(CitizenORM, "cit_009")
    target = db.get(CitizenORM, "cit_010")
    actor.current_location_id = target.current_location_id
    actor.x = target.x
    actor.y = target.y
    db.commit()

    result = engine.tick(db, FakeTaskCognition(target_ids=["cit_010"], location_id="loc_bank", task_kind="go_with_citizen"))
    actor = db.get(CitizenORM, "cit_009")
    target = db.get(CitizenORM, "cit_010")

    assert actor.personality["player_task"]["status"] == "active"
    assert actor.personality["player_task"]["companion_confirmed"] is True
    assert target.personality["companion_task"]["status"] == "active"
    assert target.personality["companion_task"]["location_id"] == "loc_bank"
    assert any(event.event_type == "companion_task_confirmed" for event in result["events"])


def test_task_alignment_flags_stale_topic_leakage():
    client = CitizenCognitionClient(Settings(database_url="sqlite+pysqlite:///:memory:"))
    speaker = {"name": "Ava Singh"}
    listener = {"name": "Iris Novak"}

    assert client._line_is_off_task(
        "Hi Iris, did you catch who won the World Cup?",
        "Go to the Bank along with Iris.",
        speaker,
        listener,
    )
    assert not client._line_is_off_task(
        "Hey Iris, should we head to the bank together now?",
        "Go to the Bank along with Iris.",
        speaker,
        listener,
    )


def test_unknown_named_person_is_not_substituted_with_available_citizen():
    client = CitizenCognitionClient(Settings(database_url="sqlite+pysqlite:///:memory:"))
    citizens = [
        {"citizen_id": "cit_009", "name": "Ava Singh", "is_actor": True},
        {"citizen_id": "cit_021", "name": "Noah Mensah", "is_actor": False},
    ]
    locations = [{"location_id": "loc_bank", "name": "Bank", "type": "bank"}]

    assert client._unavailable_named_people("Reach out to Sophie and ask how was her day", citizens, locations) == ["Sophie"]
    assert client._known_people_mentioned("Talk to Noah at home to ask how the day was", citizens)
