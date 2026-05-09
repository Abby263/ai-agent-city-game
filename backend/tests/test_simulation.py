from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.models import Base, CitizenORM, MemoryORM
from app.schemas import AssignTaskRequest, TriggerEventRequest
from app.seed import ensure_seeded
from app.simulation.engine import SimulationEngine


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
        AssignTaskRequest(task="Ask Iris if she wants to study together", location_id="loc_library"),
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


def test_cognition_candidate_selection_is_selective():
    db = session_factory()
    settings = Settings(
        database_url="sqlite+pysqlite:///:memory:",
        llm_mode="mock",
        max_llm_calls_per_tick=3,
        llm_cognition_interval_ticks=1,
    )
    engine = SimulationEngine(settings)
    from app.cognition.pipeline import CognitionPipeline

    pipeline = CognitionPipeline(settings)
    engine.trigger_event(db, TriggerEventRequest(event_type="traffic_accident", severity="high"))
    result = engine.tick(db, pipeline)

    assert 0 < len(result["cognition"]) <= 3
    assert all("thought" in item for item in result["cognition"])
