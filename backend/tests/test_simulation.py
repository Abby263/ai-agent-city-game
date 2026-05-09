from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.models import Base, CitizenORM, MemoryORM
from app.schemas import TriggerEventRequest
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
    assert len(after.citizens) == 25
    assert any(citizen.current_activity for citizen in after.citizens)


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
    )
    engine = SimulationEngine(settings)
    from app.cognition.pipeline import CognitionPipeline

    pipeline = CognitionPipeline(settings)
    engine.trigger_event(db, TriggerEventRequest(event_type="traffic_accident", severity="high"))
    result = engine.tick(db, pipeline)

    assert 0 < len(result["cognition"]) <= 3
    assert all("thought" in item for item in result["cognition"])
