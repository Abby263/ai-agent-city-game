from __future__ import annotations

from uuid import uuid4

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.cognition.pipeline import CognitionPipeline, observations_by_actor
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
    AssignTaskRequest,
    CitizenAgent,
    CityEvent,
    CityMetrics,
    CityState,
    Location,
    MayorPolicyRequest,
    SimulationClock,
    SimulationModeRequest,
    TriggerEventRequest,
)


class SimulationEngine:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.memory_store = MemoryStore(settings)

    def get_state(self, db: Session) -> CityState:
        state = self._state(db)
        citizens = self._active_citizens(db)
        locations = list(db.scalars(select(LocationORM).order_by(LocationORM.location_id)))
        events = self._recent_events(db, limit=80)
        metrics = self._metrics(citizens, events)
        state.metrics = metrics.model_dump()
        db.commit()
        return CityState(
            city_id=state.id,
            city_name=state.city_name,
            simulation_mode=self._simulation_mode(state),
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
        if self._simulation_mode(state) == "manual" and not self._active_task_citizens(self._active_citizens(db)):
            state.running = False
            state.updated_at = utcnow()
            self._event(
                db,
                state=state,
                event_type="manual_mode_waiting",
                description="Manual mode is waiting for the player to assign a student task.",
                priority=1,
            )
            db.commit()
            return self.get_state(db)

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

    def set_mode(self, db: Session, request: SimulationModeRequest) -> CityState:
        state = self._state(db)
        policy = dict(state.policy or {})
        previous_mode = self._simulation_mode(state)
        policy["simulation_mode"] = request.mode
        state.policy = policy
        state.running = request.mode == "autonomous"
        state.updated_at = utcnow()
        event_type = "manual_mode_enabled" if request.mode == "manual" else "autonomous_mode_enabled"
        description = (
            "Manual mode enabled. The city waits until the player assigns a student task."
            if request.mode == "manual"
            else "Autonomous mode enabled. Students resume daily life, conversations, and city reactions."
        )
        if previous_mode != request.mode:
            self._event(
                db,
                state=state,
                event_type=event_type,
                description=description,
                priority=2,
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
        simulation_mode = self._simulation_mode(state)
        citizens = self._active_citizens(db)
        update_citizens = citizens
        if simulation_mode == "manual":
            update_citizens = self._active_task_citizens(citizens)
            if not update_citizens:
                state.running = False
                state.updated_at = utcnow()
                db.commit()
                return {
                    "state": self.get_state(db),
                    "events": [],
                    "cognition": [],
                }

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
        events: list[CityEventORM] = []
        for citizen in update_citizens:
            events.extend(
                self._update_citizen(
                    db,
                    state=state,
                    citizen=citizen,
                    locations=locations,
                    previous_minute=previous_minute,
                )
            )

        if simulation_mode == "autonomous":
            events.extend(self._run_profession_systems(db, state, citizens, locations))
            events.extend(self._run_social_systems(db, state, citizens, locations))
        db.flush()

        cognition_results: list[dict] = []
        should_run_cognition = state.tick % self.settings.llm_cognition_interval_ticks == 0
        should_run_cognition = should_run_cognition or any(event.priority >= 3 for event in events)
        if cognition and should_run_cognition:
            observations = observations_by_actor(events)
            event_context = " ".join(
                event.description for event in self._recent_events(db, limit=5) if event.priority >= 2
            )
            cognition_results = cognition.process_tick(
                db,
                citizens=citizens,
                locations=locations,
                day=state.day,
                minute_of_day=state.minute_of_day,
                observations=observations,
                event_context=event_context,
            )

        if simulation_mode == "manual" and not self._active_task_citizens(citizens):
            state.running = False
            state.updated_at = utcnow()

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
        citizens = self._active_citizens(db)
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
        active_actor_ids = [citizen.citizen_id for citizen in self._active_citizens(db)[:1]]
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
            actors=active_actor_ids,
            location_id="loc_city_hall",
            description=summary,
            payload=updates,
            priority=2,
        )
        db.commit()
        return self.get_state(db)

    def assign_task(self, db: Session, citizen_id: str, request: AssignTaskRequest) -> CityState:
        state = self._state(db)
        active_ids = self._active_citizen_ids()
        if active_ids and citizen_id not in active_ids:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Citizen is inactive in the current playable roster")
        citizen = db.get(CitizenORM, citizen_id)
        if not citizen:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Citizen not found")

        target_citizen = None
        if request.target_citizen_id:
            if active_ids and request.target_citizen_id not in active_ids:
                from fastapi import HTTPException

                raise HTTPException(status_code=404, detail="Target citizen is inactive in the current playable roster")
            target_citizen = db.get(CitizenORM, request.target_citizen_id)
            if not target_citizen:
                from fastapi import HTTPException

                raise HTTPException(status_code=404, detail="Target citizen not found")

        location_id = request.location_id or citizen.current_location_id
        if target_citizen and not request.location_id:
            location_id = target_citizen.current_location_id
        if location_id and not db.get(LocationORM, location_id):
            from fastapi import HTTPException

            raise HTTPException(status_code=400, detail="Unknown location_id")

        task = request.task.strip()
        personality = dict(citizen.personality or {})
        personality["player_task"] = {
            "task": task,
            "location_id": location_id,
            "assigned_day": state.day,
            "assigned_minute": state.minute_of_day,
            "expires_tick": state.tick + request.duration_ticks,
            "status": "active",
        }
        if target_citizen:
            personality["player_task"]["target_citizen_id"] = target_citizen.citizen_id
        citizen.personality = personality
        citizen.current_activity = f"Task: {task}"
        citizen.current_thought = f"The player asked me to: {task}. I should focus on that next."
        existing_goals = [goal for goal in citizen.short_term_goals if not goal.startswith("Player task:")]
        citizen.short_term_goals = [f"Player task: {task}", *existing_goals][:5]
        if self._simulation_mode(state) == "manual":
            state.running = True
            state.updated_at = utcnow()
        self.memory_store.add_memory(
            db,
            citizen_id=citizen.citizen_id,
            kind="episodic",
            content=f"The player assigned me a task: {task}.",
            importance=0.78,
            salience=0.82,
            extra={"source": "player_task", "location_id": location_id},
        )
        self._event(
            db,
            state=state,
            event_type="player_task",
            location_id=location_id,
            actors=[actor for actor in [citizen.citizen_id, target_citizen.citizen_id if target_citizen else None] if actor],
            description=(
                f"The player asked {citizen.name} to: {task}"
                if not target_citizen
                else f"The player asked {citizen.name} to work with {target_citizen.name}: {task}"
            ),
            payload={
                "task": task,
                "duration_ticks": request.duration_ticks,
                "target_citizen_id": target_citizen.citizen_id if target_citizen else None,
            },
            priority=3,
        )
        db.commit()
        return self.get_state(db)

    def close_task(self, db: Session, citizen_id: str) -> CityState:
        state = self._state(db)
        citizen = db.get(CitizenORM, citizen_id)
        if not citizen:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Citizen not found")
        task = self._player_task(citizen)
        if not task:
            from fastapi import HTTPException

            raise HTTPException(status_code=400, detail="Citizen does not have a player task")

        task["status"] = "closed"
        personality = dict(citizen.personality or {})
        personality["player_task"] = task
        citizen.personality = personality
        citizen.current_activity = "Waiting for the next player task"
        citizen.current_thought = f"The player closed the task: {task.get('task')}."
        self.memory_store.add_memory(
            db,
            citizen_id=citizen.citizen_id,
            kind="episodic",
            content=f"The player closed my task before it finished: {task.get('task')}.",
            importance=0.55,
            salience=0.6,
            extra={"source": "player_task_closed"},
        )
        self._event(
            db,
            state=state,
            event_type="player_task_closed",
            location_id=str(task.get("location_id") or citizen.current_location_id),
            actors=[citizen.citizen_id],
            description=f"The player closed {citizen.name}'s task: {task.get('task')}",
            payload={"task": task.get("task")},
            priority=2,
        )
        if self._simulation_mode(state) == "manual" and not self._active_task_citizens(self._active_citizens(db)):
            state.running = False
        state.updated_at = utcnow()
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
        player_task = self._player_task(citizen)
        task_was_active = player_task.get("status") == "active" if player_task else False
        target_location_id, activity = self._desired_location_and_activity(citizen, state.minute_of_day, state.tick)
        citizen.current_activity = activity

        if not task_was_active and citizen.health < 55 and citizen.profession not in {"Doctor", "Nurse"}:
            target_location_id = "loc_hospital"
            citizen.current_activity = "Seeking medical help"
        elif not task_was_active and citizen.hunger > 74 and citizen.money >= 4:
            target_location_id = "loc_market"
            citizen.current_activity = "Buying food"
        elif not task_was_active and citizen.energy < 22:
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

        if task_was_active:
            latest_task = self._player_task(citizen) or player_task
            target_id = str(latest_task.get("target_citizen_id") or "")
            actors = [citizen.citizen_id, target_id] if target_id else [citizen.citizen_id]
            task_text = str(latest_task.get("task") or "the player task")
            if int(latest_task.get("expires_tick", state.tick)) <= state.tick:
                self._complete_player_task(db, state, citizen, latest_task, target_location.location_id)
                events.append(
                    self._event(
                        db,
                        state=state,
                        event_type="player_task_completed",
                        location_id=target_location.location_id,
                        actors=actors,
                        description=f"{citizen.name} completed the player task: {task_text}",
                        payload={"task": task_text},
                        priority=3,
                    )
                )
            else:
                events.append(
                    self._event(
                        db,
                        state=state,
                        event_type="player_task_progress",
                        location_id=target_location.location_id,
                        actors=actors,
                        description=f"{citizen.name} is working on the player task: {task_text}",
                        payload={"task": task_text},
                        priority=3,
                    )
                )

        if not task_was_active and previous_minute < 480 <= state.minute_of_day and citizen.work_location_id:
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

    def _desired_location_and_activity(self, citizen: CitizenORM, minute: int, tick: int) -> tuple[str, str]:
        player_task = dict((citizen.personality or {}).get("player_task") or {})
        if player_task.get("status") == "active":
            return str(player_task.get("location_id") or citizen.current_location_id), f"Task: {player_task.get('task')}"
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

    def _complete_player_task(
        self,
        db: Session,
        state: SimulationStateORM,
        citizen: CitizenORM,
        task: dict,
        location_id: str,
    ) -> None:
        task["status"] = "completed"
        task["completed_day"] = state.day
        task["completed_minute"] = state.minute_of_day
        personality = dict(citizen.personality or {})
        personality["player_task"] = task
        citizen.personality = personality
        citizen.current_activity = "Task completed"
        citizen.current_thought = f"I finished the player task: {task.get('task')}."
        citizen.short_term_goals = [
            goal for goal in citizen.short_term_goals if not goal.startswith("Player task:")
        ][:5]
        self.memory_store.add_memory(
            db,
            citizen_id=citizen.citizen_id,
            kind="episodic",
            content=f"I completed the player task: {task.get('task')}.",
            importance=0.72,
            salience=0.78,
            related_citizen_id=str(task.get("target_citizen_id") or "") or None,
            extra={"source": "player_task_completed", "location_id": location_id},
        )

    @staticmethod
    def _simulation_mode(state: SimulationStateORM) -> str:
        mode = (state.policy or {}).get("simulation_mode", "manual")
        return "autonomous" if mode == "autonomous" else "manual"

    @staticmethod
    def _player_task(citizen: CitizenORM) -> dict:
        task = (citizen.personality or {}).get("player_task") or {}
        return dict(task) if isinstance(task, dict) else {}

    def _active_task_citizens(self, citizens: list[CitizenORM]) -> list[CitizenORM]:
        return [
            citizen
            for citizen in citizens
            if self._player_task(citizen).get("status") == "active"
        ]

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

    def _active_citizen_ids(self) -> list[str]:
        return self.settings.parsed_active_citizen_ids

    def _active_citizens(self, db: Session) -> list[CitizenORM]:
        citizens = list(db.scalars(select(CitizenORM).order_by(CitizenORM.citizen_id)))
        active_ids = self._active_citizen_ids()
        if not active_ids:
            return citizens
        citizens_by_id = {citizen.citizen_id: citizen for citizen in citizens}
        return [citizens_by_id[citizen_id] for citizen_id in active_ids if citizen_id in citizens_by_id]

    def _recent_events(self, db: Session, limit: int = 80) -> list[CityEventORM]:
        events = list(
            db.scalars(
                select(CityEventORM)
                .order_by(desc(CityEventORM.timestamp))
                .limit(max(limit, 1) * 4)
            )
        )
        active_ids = set(self._active_citizen_ids())
        if not active_ids:
            return events[:limit]
        filtered = [
            event
            for event in events
            if not event.actors or all(actor in active_ids for actor in event.actors)
        ]
        return filtered[:limit]

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
