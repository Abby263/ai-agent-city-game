from __future__ import annotations

from uuid import uuid4

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.cognition.pipeline import CognitionPipeline, observations_by_actor, recent_event_context
from app.config import Settings
from app.memory.store import MemoryStore
from app.models import (
    CitizenORM,
    CityEventORM,
    LocationORM,
    MayorPolicyORM,
    MemoryORM,
    RelationshipORM,
    SimulationStateORM,
    utcnow,
)
from app.schemas import (
    CitizenAgent,
    CityEvent,
    CityMetrics,
    CityState,
    Location,
    MayorPolicyRequest,
    SimulationClock,
    TriggerEventRequest,
)


class SimulationEngine:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.memory_store = MemoryStore(settings)

    def get_state(self, db: Session) -> CityState:
        state = self._state(db)
        citizens = list(db.scalars(select(CitizenORM).order_by(CitizenORM.citizen_id)))
        locations = list(db.scalars(select(LocationORM).order_by(LocationORM.location_id)))
        events = list(db.scalars(select(CityEventORM).order_by(desc(CityEventORM.timestamp)).limit(80)))
        metrics = self._metrics(citizens, events)
        state.metrics = metrics.model_dump()
        db.commit()
        return CityState(
            city_id=state.id,
            city_name=state.city_name,
            clock=SimulationClock(
                day=state.day,
                minute_of_day=state.minute_of_day,
                tick=state.tick,
                running=state.running,
            ),
            policy=state.policy,
            metrics=metrics,
            locations=[Location.model_validate(location) for location in locations],
            citizens=[CitizenAgent.model_validate(citizen) for citizen in citizens],
            events=[CityEvent.model_validate(event) for event in reversed(events)],
        )

    def start(self, db: Session) -> CityState:
        state = self._state(db)
        state.running = True
        state.updated_at = utcnow()
        self._event(
            db,
            state=state,
            event_type="simulation_started",
            description="The city simulation started.",
            priority=1,
        )
        db.commit()
        return self.get_state(db)

    def pause(self, db: Session) -> CityState:
        state = self._state(db)
        state.running = False
        state.updated_at = utcnow()
        self._event(
            db,
            state=state,
            event_type="simulation_paused",
            description="The city simulation paused.",
            priority=1,
        )
        db.commit()
        return self.get_state(db)

    def tick(self, db: Session, cognition: CognitionPipeline | None = None) -> dict:
        state = self._state(db)
        previous_minute = state.minute_of_day
        state.tick += 1
        state.minute_of_day += self.settings.tick_minutes
        if state.minute_of_day >= 1440:
            state.minute_of_day %= 1440
            state.day += 1
            self._event(
                db,
                state=state,
                event_type="new_day",
                description=f"Day {state.day} begins in Navora.",
                priority=2,
            )
        state.updated_at = utcnow()

        locations = {location.location_id: location for location in db.scalars(select(LocationORM))}
        citizens = list(db.scalars(select(CitizenORM).order_by(CitizenORM.citizen_id)))
        events: list[CityEventORM] = []
        for citizen in citizens:
            events.extend(
                self._update_citizen(
                    db,
                    state=state,
                    citizen=citizen,
                    locations=locations,
                    previous_minute=previous_minute,
                )
            )

        events.extend(self._run_profession_systems(db, state, citizens, locations))
        events.extend(self._run_social_systems(db, state, citizens, locations))
        db.flush()

        cognition_results: list[dict] = []
        if cognition:
            observations = observations_by_actor(events)
            event_context = recent_event_context(db)
            cognition_results = cognition.process_tick(
                db,
                citizens=citizens,
                locations=locations,
                day=state.day,
                minute_of_day=state.minute_of_day,
                observations=observations,
                event_context=event_context,
            )

        db.commit()
        return {
            "state": self.get_state(db),
            "events": events,
            "cognition": cognition_results,
        }

    def run_day(self, db: Session, cognition: CognitionPipeline | None = None) -> CityState:
        for _ in range(int(1440 / self.settings.tick_minutes)):
            self.tick(db, cognition)
        return self.get_state(db)

    def trigger_event(self, db: Session, request: TriggerEventRequest) -> CityState:
        state = self._state(db)
        citizens = list(db.scalars(select(CitizenORM).order_by(CitizenORM.citizen_id)))
        location_id = request.location_id or self._default_event_location(request.event_type)
        severity_multiplier = {"low": 0.6, "medium": 1.0, "high": 1.45}[request.severity]
        actors: list[str] = []

        if request.event_type == "flu_outbreak":
            actors = [
                citizen.citizen_id
                for citizen in citizens
                if citizen.profession in {"Student", "Teacher", "Doctor", "Nurse", "Scientist", "Researcher"}
            ]
            for citizen in citizens:
                if citizen.citizen_id in actors:
                    citizen.health = self._clamp(citizen.health - 18 * severity_multiplier)
                    citizen.stress = self._clamp(citizen.stress + 14 * severity_multiplier)
                    self.memory_store.add_memory(
                        db,
                        citizen_id=citizen.citizen_id,
                        kind="episodic",
                        content="A flu outbreak is spreading through Navora, especially around the school and hospital.",
                        importance=0.82,
                        salience=0.86,
                    )
            description = "A flu outbreak starts spreading through the school and hospital network."
        elif request.event_type == "traffic_accident":
            actors = [citizen.citizen_id for citizen in citizens if citizen.profession in {"Driver", "Police Officer"}]
            for citizen in citizens:
                if citizen.profession in {"Driver", "Police Officer", "Engineer"}:
                    citizen.stress = self._clamp(citizen.stress + 16 * severity_multiplier)
            description = "A traffic accident blocks a central road near the bus stop."
        elif request.event_type == "food_shortage":
            actors = [citizen.citizen_id for citizen in citizens if citizen.profession in {"Farmer", "Shopkeeper"}]
            market = db.get(LocationORM, "loc_market")
            if market:
                inventory = dict(market.inventory)
                inventory["food"] = max(0, inventory.get("food", 0) - int(28 * severity_multiplier))
                market.inventory = inventory
            description = "A food shortage hits the market and raises concern about household supplies."
        elif request.event_type == "school_exam":
            actors = [citizen.citizen_id for citizen in citizens if citizen.profession in {"Student", "Teacher"}]
            for citizen in citizens:
                if citizen.profession == "Student":
                    citizen.stress = self._clamp(citizen.stress + 10 * severity_multiplier)
            description = "The school starts an important exam day."
        elif request.event_type == "city_festival":
            actors = [citizen.citizen_id for citizen in citizens]
            for citizen in citizens:
                citizen.happiness = self._clamp(citizen.happiness + 12 * severity_multiplier)
                citizen.stress = self._clamp(citizen.stress - 8 * severity_multiplier)
            description = "A city festival begins at the park and draws people together."
        elif request.event_type == "bank_policy_change":
            actors = [citizen.citizen_id for citizen in citizens if citizen.profession in {"Banker", "Mayor"}]
            description = "The bank changes loan policy and local businesses start reassessing plans."
        else:
            actors = [citizen.citizen_id for citizen in citizens if citizen.profession in {"Engineer", "Mayor"}]
            for citizen in citizens:
                citizen.stress = self._clamp(citizen.stress + 8 * severity_multiplier)
            description = "A power outage disrupts routines across Navora."

        self._event(
            db,
            state=state,
            event_type=request.event_type,
            location_id=location_id,
            actors=actors,
            description=description,
            payload={"severity": request.severity},
            priority=3,
        )
        db.commit()
        return self.get_state(db)

    def apply_policy(self, db: Session, request: MayorPolicyRequest) -> CityState:
        state = self._state(db)
        policy = dict(state.policy)
        updates = request.model_dump(exclude_none=True)
        policy.update(updates)
        state.policy = policy
        summary = self._policy_summary(updates)
        db.add(
            MayorPolicyORM(
                policy_id=f"policy_{uuid4().hex[:16]}",
                game_day=state.day,
                game_minute=state.minute_of_day,
                values=updates,
                summary=summary,
            )
        )
        self._event(
            db,
            state=state,
            event_type="mayor_policy",
            actors=["cit_011"],
            location_id="loc_city_hall",
            description=summary,
            payload=updates,
            priority=2,
        )
        db.commit()
        return self.get_state(db)

    def _update_citizen(
        self,
        db: Session,
        *,
        state: SimulationStateORM,
        citizen: CitizenORM,
        locations: dict[str, LocationORM],
        previous_minute: int,
    ) -> list[CityEventORM]:
        events: list[CityEventORM] = []
        old_location = citizen.current_location_id
        target_location_id, activity = self._desired_location_and_activity(citizen, state.minute_of_day)
        citizen.current_activity = activity

        if citizen.health < 55 and citizen.profession not in {"Doctor", "Nurse"}:
            target_location_id = "loc_hospital"
            citizen.current_activity = "Seeking medical help"
        elif citizen.hunger > 74 and citizen.money >= 4:
            target_location_id = "loc_market"
            citizen.current_activity = "Buying food"
        elif citizen.energy < 22:
            target_location_id = citizen.home_location_id
            citizen.current_activity = "Resting at home"

        target_location = locations.get(target_location_id) or locations[citizen.home_location_id]
        citizen.target_x = target_location.x + target_location.width // 2
        citizen.target_y = target_location.y + target_location.height // 2

        self._move_toward(citizen, citizen.target_x, citizen.target_y)
        arrived = citizen.x == citizen.target_x and citizen.y == citizen.target_y
        if arrived:
            citizen.current_location_id = target_location.location_id

        self._update_needs(citizen)
        if arrived:
            self._apply_location_effects(citizen, target_location)

        if old_location != citizen.current_location_id:
            events.append(
                self._event(
                    db,
                    state=state,
                    event_type="citizen_arrived",
                    location_id=citizen.current_location_id,
                    actors=[citizen.citizen_id],
                    description=f"{citizen.name} arrived at {target_location.name} for {citizen.current_activity.lower()}.",
                    priority=1,
                )
            )

        if previous_minute < 480 <= state.minute_of_day and citizen.work_location_id:
            events.append(
                self._event(
                    db,
                    state=state,
                    event_type="workday_started",
                    location_id=citizen.work_location_id,
                    actors=[citizen.citizen_id],
                    description=f"{citizen.name} started the workday as a {citizen.profession}.",
                    priority=1,
                )
            )

        citizen.updated_at = utcnow()
        return events

    def _run_social_systems(
        self,
        db: Session,
        state: SimulationStateORM,
        citizens: list[CitizenORM],
        locations: dict[str, LocationORM],
    ) -> list[CityEventORM]:
        if state.tick % 3 != 0:
            return []

        events: list[CityEventORM] = []
        recent_social_events = list(
            db.scalars(
                select(CityEventORM)
                .where(CityEventORM.event_type == "social_opportunity")
                .order_by(desc(CityEventORM.timestamp))
                .limit(18)
            )
        )
        recent_pairs = {
            tuple(sorted(event.actors[:2]))
            for event in recent_social_events
            if len(event.actors) >= 2
        }
        by_location: dict[str, list[CitizenORM]] = {}
        for citizen in citizens:
            if citizen.energy < 18 or citizen.stress > 88:
                continue
            by_location.setdefault(citizen.current_location_id, []).append(citizen)

        emitted_pairs: set[tuple[str, str]] = set()
        for location_id, people in by_location.items():
            if len(people) < 2 or len(events) >= 2:
                continue
            people = sorted(people, key=lambda item: item.citizen_id)
            first: CitizenORM | None = None
            second: CitizenORM | None = None
            pair: tuple[str, str] | None = None
            for offset in range(len(people)):
                candidate_first = people[(state.tick + offset) % len(people)]
                candidate_second = people[(state.tick + offset + 1) % len(people)]
                candidate_pair = tuple(sorted((candidate_first.citizen_id, candidate_second.citizen_id)))
                if candidate_first.citizen_id == candidate_second.citizen_id:
                    continue
                if candidate_pair in recent_pairs or candidate_pair in emitted_pairs:
                    continue
                first = candidate_first
                second = candidate_second
                pair = candidate_pair
                break
            if not first or not second or not pair:
                continue
            emitted_pairs.add(pair)
            relationship = self._relationship_status(db, first.citizen_id, second.citizen_id)
            location_name = locations.get(location_id).name if location_id in locations else "the city"
            events.append(
                self._event(
                    db,
                    state=state,
                    event_type="social_opportunity",
                    location_id=location_id,
                    actors=[first.citizen_id, second.citizen_id],
                    description=(
                        f"{first.name} and {second.name} have a natural chance to talk at "
                        f"{location_name}. They are currently {relationship.lower()}."
                    ),
                    payload={"relationship": relationship},
                    priority=2,
                )
            )
        return events

    def _relationship_status(self, db: Session, citizen_id: str, other_citizen_id: str) -> str:
        relationship = db.get(RelationshipORM, f"rel_{citizen_id}_{other_citizen_id}")
        if not relationship:
            return "Strangers"
        if relationship.trust >= 72 and relationship.warmth >= 70 and relationship.familiarity >= 65:
            return "trusted friends"
        if relationship.trust >= 58 and relationship.warmth >= 56 and relationship.familiarity >= 45:
            return "friends"
        if relationship.familiarity >= 24 or relationship.trust >= 45:
            return "acquaintances"
        return "strangers"

    def _run_profession_systems(
        self,
        db: Session,
        state: SimulationStateORM,
        citizens: list[CitizenORM],
        locations: dict[str, LocationORM],
    ) -> list[CityEventORM]:
        events: list[CityEventORM] = []
        market = locations.get("loc_market")
        farm = locations.get("loc_farm")
        hospital = locations.get("loc_hospital")

        for citizen in citizens:
            if citizen.current_location_id == citizen.work_location_id and 480 <= state.minute_of_day <= 1020:
                citizen.money += self._salary_per_tick(citizen.profession)
                citizen.reputation = self._clamp(citizen.reputation + 0.3)

        if farm:
            farmers = [c for c in citizens if c.profession == "Farmer" and c.current_location_id == "loc_farm"]
            if farmers and state.tick % 4 == 0:
                inventory = dict(farm.inventory)
                inventory["food"] = inventory.get("food", 0) + len(farmers) * 5
                farm.inventory = inventory
                events.append(
                    self._event(
                        db,
                        state=state,
                        event_type="farm_harvest",
                        location_id="loc_farm",
                        actors=[farmer.citizen_id for farmer in farmers],
                        description="Farmers harvested fresh food for the market.",
                        priority=1,
                    )
                )

        if market:
            inventory = dict(market.inventory)
            hungry_buyers = [
                c for c in citizens if c.current_location_id == "loc_market" and c.hunger > 45 and c.money >= 5
            ]
            if hungry_buyers and inventory.get("food", 0) > 0:
                buyer = hungry_buyers[0]
                buyer.money -= 5
                buyer.hunger = self._clamp(buyer.hunger - 38)
                buyer.happiness = self._clamp(buyer.happiness + 4)
                inventory["food"] = max(0, inventory.get("food", 0) - 1)
                market.inventory = inventory
                events.append(
                    self._event(
                        db,
                        state=state,
                        event_type="market_sale",
                        location_id="loc_market",
                        actors=[buyer.citizen_id],
                        description=f"{buyer.name} bought food at the market.",
                        priority=1,
                    )
                )

        if hospital:
            doctors = [
                c
                for c in citizens
                if c.profession in {"Doctor", "Nurse"} and c.current_location_id == "loc_hospital"
            ]
            patients = [c for c in citizens if c.health < 70 and c.current_location_id == "loc_hospital"]
            if doctors and patients:
                patient = patients[0]
                patient.health = self._clamp(patient.health + 18)
                patient.stress = self._clamp(patient.stress - 12)
                doctor = doctors[0]
                doctor.reputation = self._clamp(doctor.reputation + 2)
                events.append(
                    self._event(
                        db,
                        state=state,
                        event_type="doctor_treatment",
                        location_id="loc_hospital",
                        actors=[doctor.citizen_id, patient.citizen_id],
                        description=f"{doctor.name} treated {patient.name} at the hospital.",
                        priority=2,
                    )
                )
        return events

    def _desired_location_and_activity(self, citizen: CitizenORM, minute: int) -> tuple[str, str]:
        for entry in citizen.daily_schedule:
            start = int(entry["start"])
            end = int(entry["end"])
            if start <= minute < end:
                return str(entry.get("location_id") or citizen.home_location_id), str(entry["activity"])
        return citizen.home_location_id, "Sleeping"

    def _move_toward(self, citizen: CitizenORM, target_x: int, target_y: int) -> None:
        speed = 2
        dx = target_x - citizen.x
        dy = target_y - citizen.y
        if abs(dx) >= abs(dy) and dx != 0:
            citizen.x += max(-speed, min(speed, dx))
        elif dy != 0:
            citizen.y += max(-speed, min(speed, dy))
        elif dx != 0:
            citizen.x += max(-speed, min(speed, dx))

    def _update_needs(self, citizen: CitizenORM) -> None:
        citizen.hunger = self._clamp(citizen.hunger + 3.1)
        citizen.energy = self._clamp(citizen.energy - 2.3)
        citizen.stress = self._clamp(citizen.stress + (0.8 if citizen.energy < 30 else 0.2))
        citizen.happiness = self._clamp(citizen.happiness - (0.8 if citizen.hunger > 70 else 0.1))
        if citizen.hunger > 88 or citizen.energy < 12:
            citizen.health = self._clamp(citizen.health - 1.5)

    def _apply_location_effects(self, citizen: CitizenORM, location: LocationORM) -> None:
        if location.location_id == citizen.home_location_id and citizen.energy < 85:
            citizen.energy = self._clamp(citizen.energy + 12)
            citizen.stress = self._clamp(citizen.stress - 5)
        if location.location_id == "loc_park":
            citizen.stress = self._clamp(citizen.stress - 8)
            citizen.happiness = self._clamp(citizen.happiness + 4)
        if location.location_id == "loc_school" and citizen.profession == "Student":
            citizen.happiness = self._clamp(citizen.happiness + 1)

    def _metrics(self, citizens: list[CitizenORM], events: list[CityEventORM]) -> CityMetrics:
        population = len(citizens) or 1
        avg_happiness = sum(c.happiness for c in citizens) / population
        avg_health = sum(c.health for c in citizens) / population
        avg_money = sum(c.money for c in citizens) / population
        education = sum(c.happiness for c in citizens if c.profession in {"Student", "Teacher"}) / max(
            1, len([c for c in citizens if c.profession in {"Student", "Teacher"}])
        )
        traffic_penalty = len([e for e in events if e.event_type == "traffic_accident"]) * 4
        return CityMetrics(
            population=len(citizens),
            average_happiness=round(avg_happiness, 1),
            city_health=round(avg_health, 1),
            economy_status=round(min(100, avg_money / 2.2), 1),
            education_status=round(education, 1),
            traffic_status=round(max(0, 90 - traffic_penalty), 1),
            sick_count=len([c for c in citizens if c.health < 65]),
            active_events=len([e for e in events if e.priority >= 2]),
        )

    def _state(self, db: Session) -> SimulationStateORM:
        state = db.get(SimulationStateORM, self.settings.city_id)
        if not state:
            raise RuntimeError("City is not seeded. Run ensure_seeded during startup.")
        return state

    def _event(
        self,
        db: Session,
        *,
        state: SimulationStateORM,
        event_type: str,
        description: str,
        location_id: str | None = None,
        actors: list[str] | None = None,
        payload: dict | None = None,
        priority: int = 1,
        visibility: str = "public",
    ) -> CityEventORM:
        event = CityEventORM(
            event_id=f"evt_{uuid4().hex[:16]}",
            game_day=state.day,
            game_minute=state.minute_of_day,
            event_type=event_type,
            location_id=location_id,
            actors=actors or [],
            description=description,
            payload=payload or {},
            priority=priority,
            visibility=visibility,
        )
        db.add(event)
        return event

    @staticmethod
    def _salary_per_tick(profession: str) -> float:
        salaries = {
            "Doctor": 11,
            "Nurse": 8,
            "Teacher": 7,
            "Engineer": 9,
            "Driver": 6,
            "Shopkeeper": 7,
            "Banker": 9,
            "Police Officer": 8,
            "Farmer": 6,
            "Mayor": 10,
            "Scientist": 10,
            "Researcher": 10,
            "Restaurant Cook": 6,
        }
        return salaries.get(profession, 3)

    @staticmethod
    def _default_event_location(event_type: str) -> str:
        return {
            "flu_outbreak": "loc_school",
            "traffic_accident": "loc_bus_stop",
            "food_shortage": "loc_market",
            "school_exam": "loc_school",
            "city_festival": "loc_park",
            "bank_policy_change": "loc_bank",
            "power_outage": "loc_city_hall",
        }.get(event_type, "loc_city_hall")

    @staticmethod
    def _policy_summary(updates: dict) -> str:
        if not updates:
            return "The mayor reviewed city policy without making changes."
        labels = {
            "tax_rate": "tax rate",
            "hospital_budget": "hospital budget",
            "school_budget": "school funding",
            "road_budget": "road budget",
            "farmer_subsidy": "farmer subsidy",
            "public_health_campaign": "public health campaign",
        }
        changed = ", ".join(labels.get(key, key) for key in updates)
        return f"The mayor changed city policy: {changed}."

    @staticmethod
    def _clamp(value: float, minimum: float = 0, maximum: float = 100) -> float:
        return round(max(minimum, min(maximum, value)), 2)
