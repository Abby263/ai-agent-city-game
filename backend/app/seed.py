from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.citizens.repository import CitizenProfile, load_citizen_profiles
from app.models import CitizenORM, LocationORM, MemoryORM, RelationshipORM, SimulationStateORM, utcnow


DEFAULT_POLICY = {
    "tax_rate": 0.12,
    "hospital_budget": 55,
    "school_budget": 52,
    "road_budget": 48,
    "farmer_subsidy": 35,
    "public_health_campaign": False,
    "simulation_mode": "manual",
}


LOCATIONS = [
    ("loc_homes", "Homes", "home", 2, 2, 8, 7, 30, ["rest", "sleep", "family"]),
    ("loc_hospital", "Hospital", "hospital", 28, 3, 6, 5, 12, ["diagnose", "treat"]),
    ("loc_school", "School", "school", 15, 4, 7, 5, 20, ["teach", "exam"]),
    ("loc_bank", "Bank", "bank", 6, 14, 5, 4, 8, ["deposit", "loan"]),
    ("loc_market", "Market", "market", 18, 15, 6, 5, 18, ["food", "medicine", "goods"]),
    ("loc_restaurant", "Restaurant", "restaurant", 3, 19, 6, 4, 16, ["meal", "socialize"]),
    ("loc_pharmacy", "Pharmacy", "pharmacy", 29, 9, 5, 4, 10, ["medicine", "care"]),
    ("loc_farm", "Farm", "farm", 3, 28, 9, 7, 8, ["grow_food", "sell_produce"]),
    ("loc_police", "Police Station", "police", 30, 14, 5, 4, 8, ["respond", "investigate"]),
    ("loc_city_hall", "City Hall", "city_hall", 28, 26, 6, 5, 12, ["policy", "budget"]),
    ("loc_lab", "Research Lab", "lab", 34, 20, 5, 5, 10, ["research", "analysis"]),
    ("loc_library", "Library", "library", 18, 22, 5, 4, 14, ["study", "community"]),
    ("loc_power", "Power Station", "power", 34, 33, 4, 4, 6, ["power", "repairs"]),
    ("loc_park", "Park", "park", 16, 28, 8, 6, 30, ["rest", "socialize"]),
    ("loc_bus_stop", "Bus Stop", "bus_stop", 13, 13, 3, 3, 12, ["transport"]),
]


def ensure_seeded(db: Session) -> None:
    state = db.scalar(select(SimulationStateORM).where(SimulationStateORM.id == "navora"))
    if not state:
        state = SimulationStateORM(
            id="navora",
            city_name="Navora",
            day=1,
            minute_of_day=6 * 60,
            tick=0,
            running=False,
            policy=DEFAULT_POLICY,
            metrics={},
        )
        db.add(state)

    ensure_locations(db)
    db.flush()
    ensure_citizens(db)
    db.commit()


def ensure_locations(db: Session) -> None:
    for location_id, name, location_type, x, y, width, height, capacity, services in LOCATIONS:
        location = db.get(LocationORM, location_id)
        if not location:
            location = LocationORM(
                location_id=location_id,
                inventory={"food": 80, "medicine": 35, "cash": 5000},
                workers=[],
                visitors=[],
            )
            db.add(location)
        location.name = name
        location.type = location_type
        location.x = x
        location.y = y
        location.width = width
        location.height = height
        location.capacity = capacity
        location.open_hours = {"start": 420, "end": 1080}
        location.services = services


def ensure_citizens(db: Session) -> None:
    profiles = load_citizen_profiles()
    for profile in profiles.values():
        _upsert_citizen(db, profile)
    db.flush()
    for profile in profiles.values():
        _ensure_memories(db, profile)
        _ensure_relationships(db, profile)


def _upsert_citizen(db: Session, profile: CitizenProfile) -> None:
    x, y = profile.position
    citizen = _pending_by_id(db, CitizenORM, "citizen_id", profile.citizen_id) or db.get(
        CitizenORM,
        profile.citizen_id,
    )
    created = citizen is None
    if not citizen:
        citizen = CitizenORM(
            citizen_id=profile.citizen_id,
            name=profile.name,
            age=profile.age,
            profession=profile.profession,
            home_location_id=profile.home_location_id,
            work_location_id=profile.work_location_id,
            current_location_id=profile.current_location_id,
            x=x,
            y=y,
            target_x=x,
            target_y=y,
        )
        db.add(citizen)

    citizen.name = profile.name
    citizen.age = profile.age
    citizen.profession = profile.profession
    citizen.home_location_id = profile.home_location_id
    citizen.work_location_id = profile.work_location_id
    citizen.skills = profile.skills
    citizen.family_ids = profile.family_ids
    personality = dict(citizen.personality or {})
    personality.update(profile.personality)
    citizen.personality = personality
    citizen.daily_schedule = profile.daily_schedule
    citizen.long_term_goals = profile.long_term_goals
    if created:
        citizen.friend_ids = profile.friend_ids
        citizen.relationship_scores = profile.relationship_scores
        citizen.short_term_goals = profile.short_term_goals
        citizen.current_activity = profile.current_activity
        citizen.current_thought = profile.current_thought
        citizen.memory_summary = profile.memory_summary
        citizen.mood = profile.mood
        citizen.money = profile.money
        citizen.health = profile.health
        citizen.hunger = profile.hunger
        citizen.energy = profile.energy
        citizen.stress = profile.stress
        citizen.happiness = profile.happiness
        citizen.reputation = profile.reputation
    citizen.updated_at = utcnow()


def _ensure_memories(db: Session, profile: CitizenProfile) -> None:
    for memory in profile.seed_memories:
        if db.get(MemoryORM, memory.memory_id):
            continue
        db.add(
            MemoryORM(
                memory_id=memory.memory_id,
                citizen_id=profile.citizen_id,
                kind=memory.kind,
                content=memory.content,
                importance=memory.importance,
                salience=memory.salience,
                embedding=None,
                extra={"seed": True, "source": "citizen_profile"},
                created_at=utcnow(),
            )
        )


def _ensure_relationships(db: Session, profile: CitizenProfile) -> None:
    for relationship_profile in profile.relationships:
        relationship_id = f"rel_{profile.citizen_id}_{relationship_profile.other_citizen_id}"
        relationship = _pending_by_id(db, RelationshipORM, "relationship_id", relationship_id) or db.get(
            RelationshipORM,
            relationship_id,
        )
        if not relationship:
            relationship = RelationshipORM(
                relationship_id=relationship_id,
                citizen_id=profile.citizen_id,
                other_citizen_id=relationship_profile.other_citizen_id,
                trust=relationship_profile.trust,
                warmth=relationship_profile.warmth,
                familiarity=relationship_profile.familiarity,
                notes=relationship_profile.notes,
            )
            db.add(relationship)


def _pending_by_id(db: Session, model: type, key: str, value: str):
    for item in db.new:
        if isinstance(item, model) and getattr(item, key) == value:
            return item
    return None
