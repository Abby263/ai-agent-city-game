from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CitizenORM, LocationORM, MemoryORM, RelationshipORM, SimulationStateORM, utcnow


DEFAULT_POLICY = {
    "tax_rate": 0.12,
    "hospital_budget": 55,
    "school_budget": 52,
    "road_budget": 48,
    "farmer_subsidy": 35,
    "public_health_campaign": False,
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


PEOPLE = [
    ("cit_001", "Dr. Anaya Rao", 38, "Doctor", "loc_hospital", ["medicine", "triage"]),
    ("cit_002", "Milo Chen", 34, "Teacher", "loc_school", ["teaching", "mentoring"]),
    ("cit_003", "Priya Nair", 29, "Engineer", "loc_city_hall", ["repair", "planning"]),
    ("cit_004", "Owen Brooks", 44, "Driver", "loc_bus_stop", ["routes", "logistics"]),
    ("cit_005", "Leah Ortiz", 41, "Shopkeeper", "loc_market", ["sales", "stock"]),
    ("cit_006", "Samir Patel", 47, "Banker", "loc_bank", ["loans", "accounts"]),
    ("cit_007", "Nora Kim", 36, "Police Officer", "loc_police", ["safety", "deescalation"]),
    ("cit_008", "Eli Morgan", 52, "Farmer", "loc_farm", ["harvest", "soil"]),
    ("cit_009", "Ava Singh", 13, "Student", "loc_school", ["science", "debate"]),
    ("cit_010", "Mateo Garcia", 14, "Student", "loc_school", ["math", "music"]),
    ("cit_011", "Mayor Imani Cole", 50, "Mayor", "loc_city_hall", ["policy", "public speaking"]),
    ("cit_012", "Tara Vos", 32, "Scientist", "loc_lab", ["research", "patterns"]),
    ("cit_013", "Jon Bell", 23, "Engineer", "loc_power", ["roads", "power"]),
    ("cit_014", "Mina Park", 31, "Doctor", "loc_hospital", ["pediatrics", "diagnosis"]),
    ("cit_015", "Theo Reed", 45, "Driver", "loc_bus_stop", ["delivery", "maintenance"]),
    ("cit_016", "Grace Okafor", 39, "Teacher", "loc_school", ["history", "coaching"]),
    ("cit_017", "Rafi Cohen", 55, "Shopkeeper", "loc_market", ["pricing", "community"]),
    ("cit_018", "Hana Yamada", 42, "Banker", "loc_bank", ["risk", "savings"]),
    ("cit_019", "Luis Alvarez", 33, "Police Officer", "loc_police", ["traffic", "response"]),
    ("cit_020", "Juniper Shaw", 28, "Farmer", "loc_farm", ["greenhouse", "markets"]),
    ("cit_021", "Noah Mensah", 12, "Student", "loc_school", ["biology", "sports"]),
    ("cit_022", "Iris Novak", 15, "Student", "loc_school", ["writing", "chemistry"]),
    ("cit_023", "Felix Stone", 30, "Restaurant Cook", "loc_restaurant", ["cooking", "supply"]),
    ("cit_024", "Sofia Mendes", 27, "Nurse", "loc_hospital", ["care", "coordination"]),
    ("cit_025", "Kai Turner", 40, "Researcher", "loc_lab", ["epidemiology", "data"]),
]


def schedule_for(profession: str, work_location_id: str | None) -> list[dict[str, object]]:
    if profession == "Student":
        return [
            {"start": 360, "end": 450, "activity": "Breakfast and commute", "location_id": "loc_homes"},
            {"start": 450, "end": 900, "activity": "Attend school", "location_id": "loc_school"},
            {"start": 900, "end": 1020, "activity": "Social time at park", "location_id": "loc_park"},
            {"start": 1020, "end": 1260, "activity": "Homework and dinner", "location_id": "loc_homes"},
            {"start": 1260, "end": 1440, "activity": "Sleep", "location_id": "loc_homes"},
        ]
    if profession in {"Doctor", "Nurse", "Scientist", "Researcher"}:
        return [
            {"start": 360, "end": 480, "activity": "Morning routine", "location_id": "loc_homes"},
            {"start": 480, "end": 1020, "activity": f"{profession} work", "location_id": work_location_id},
            {"start": 1020, "end": 1110, "activity": "Walk through park", "location_id": "loc_park"},
            {"start": 1110, "end": 1320, "activity": "Home evening", "location_id": "loc_homes"},
            {"start": 1320, "end": 1440, "activity": "Sleep", "location_id": "loc_homes"},
        ]
    return [
        {"start": 360, "end": 480, "activity": "Morning routine", "location_id": "loc_homes"},
        {"start": 480, "end": 1020, "activity": f"{profession} work", "location_id": work_location_id},
        {"start": 1020, "end": 1110, "activity": "Errands at market", "location_id": "loc_market"},
        {"start": 1110, "end": 1260, "activity": "Community time", "location_id": "loc_park"},
        {"start": 1260, "end": 1440, "activity": "Home evening and sleep", "location_id": "loc_homes"},
    ]


def ensure_seeded(db: Session) -> None:
    if db.scalar(select(SimulationStateORM).where(SimulationStateORM.id == "navora")):
        return

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

    for location_id, name, location_type, x, y, width, height, capacity, services in LOCATIONS:
        db.add(
            LocationORM(
                location_id=location_id,
                name=name,
                type=location_type,
                x=x,
                y=y,
                width=width,
                height=height,
                capacity=capacity,
                open_hours={"start": 420, "end": 1080},
                services=services,
                inventory={"food": 80, "medicine": 35, "cash": 5000},
                workers=[],
                visitors=[],
            )
        )
    db.flush()

    home_offsets = [(3, 3), (5, 3), (7, 4), (4, 6), (8, 7), (6, 5)]
    for index, (citizen_id, name, age, profession, work_location_id, skills) in enumerate(PEOPLE):
        x, y = home_offsets[index % len(home_offsets)]
        friends = [
            PEOPLE[(index + 1) % len(PEOPLE)][0],
            PEOPLE[(index + 5) % len(PEOPLE)][0],
        ]
        relationship_scores = {friend_id: 58.0 + (index % 7) for friend_id in friends}
        db.add(
            CitizenORM(
                citizen_id=citizen_id,
                name=name,
                age=age,
                profession=profession,
                home_location_id="loc_homes",
                work_location_id=work_location_id,
                current_location_id="loc_homes",
                x=x,
                y=y,
                target_x=x,
                target_y=y,
                money=130 + (index * 7) % 70,
                health=82 + (index % 9),
                hunger=18 + (index % 11),
                energy=72 + (index % 18),
                stress=16 + (index % 12),
                happiness=65 + (index % 20),
                reputation=48 + (index % 25),
                family_ids=[],
                friend_ids=friends,
                relationship_scores=relationship_scores,
                skills=skills,
                personality={
                    "openness": 45 + (index * 7) % 50,
                    "conscientiousness": 50 + (index * 5) % 45,
                    "warmth": 48 + (index * 3) % 48,
                    "risk_tolerance": 25 + (index * 4) % 55,
                },
                daily_schedule=schedule_for(profession, work_location_id),
                short_term_goals=["Get through the morning routine"],
                long_term_goals=[
                    f"Become a trusted {profession.lower()} in Navora",
                    "Build stronger community relationships",
                ],
                current_activity="Waking up at home",
                current_thought="I should get ready for the day in Navora.",
                memory_summary=f"{name} knows Navora as a close community where work and reputation matter.",
                mood="Steady",
            )
        )

    for index, (citizen_id, name, _age, profession, _work, _skills) in enumerate(PEOPLE):
        db.add(
            MemoryORM(
                memory_id=f"mem_seed_{citizen_id}",
                citizen_id=citizen_id,
                kind="semantic",
                content=f"{name} is a {profession} in Navora and values being useful to neighbors.",
                importance=0.62,
                salience=0.55,
                embedding=None,
                extra={"seed": True},
                created_at=utcnow(),
            )
        )
        friend_id = PEOPLE[(index + 1) % len(PEOPLE)][0]
        db.add(
            RelationshipORM(
                relationship_id=f"rel_{citizen_id}_{friend_id}",
                citizen_id=citizen_id,
                other_citizen_id=friend_id,
                trust=58 + (index % 15),
                warmth=55 + (index % 12),
                familiarity=45 + (index % 18),
                notes="They often cross paths during daily routines.",
            )
        )

    db.commit()
