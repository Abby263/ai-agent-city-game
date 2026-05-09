from __future__ import annotations

from collections import defaultdict
from uuid import uuid4

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.cognition.openai_client import CitizenCognitionClient
from app.config import Settings
from app.memory.store import MemoryStore
from app.models import (
    CitizenORM,
    CityEventORM,
    ConversationORM,
    DailyPlanORM,
    LocationORM,
    MemoryORM,
    ReflectionORM,
    utcnow,
)


class CognitionPipeline:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = CitizenCognitionClient(settings)
        self.memory_store = MemoryStore(settings, self.client)

    def process_tick(
        self,
        db: Session,
        *,
        citizens: list[CitizenORM],
        locations: dict[str, LocationORM],
        day: int,
        minute_of_day: int,
        observations: dict[str, list[str]],
        event_context: str,
    ) -> list[dict]:
        candidates = self._rank_candidates(citizens, observations, event_context)
        results: list[dict] = []
        conversations_created = 0
        city_time = f"Day {day}, {minute_of_day // 60:02d}:{minute_of_day % 60:02d}"

        for citizen in candidates[: self.settings.max_llm_calls_per_tick]:
            query = " ".join(observations.get(citizen.citizen_id, [])) or citizen.current_activity
            query_embedding = self.client.embed(query) if self.settings.real_llm_enabled else None
            memories = self.memory_store.retrieve(
                db,
                citizen_id=citizen.citizen_id,
                query=query,
                query_embedding=query_embedding,
                limit=5,
            )
            nearby = self._nearby_citizens(citizen, citizens)
            result = self.client.generate(
                citizen=self._citizen_prompt(citizen),
                city_time=city_time,
                observations=observations.get(citizen.citizen_id, []),
                memories=[memory.content for memory in memories],
                nearby_citizens=nearby,
                event_context=event_context,
            )

            citizen.current_thought = result.thought
            citizen.mood = result.mood
            citizen.short_term_goals = result.short_term_goals
            citizen.memory_summary = self._compact_summary(citizen.memory_summary, result.memory)
            citizen.updated_at = utcnow()

            memory_embedding = self.client.embed(result.memory) if self.settings.real_llm_enabled else None
            memory = self.memory_store.add_memory(
                db,
                citizen_id=citizen.citizen_id,
                kind="episodic",
                content=result.memory,
                importance=result.importance,
                salience=result.importance,
                embedding=memory_embedding,
                extra={"source": "cognition", "city_time": city_time},
            )
            reflection = ReflectionORM(
                reflection_id=f"ref_{uuid4().hex[:16]}",
                citizen_id=citizen.citizen_id,
                game_day=day,
                game_minute=minute_of_day,
                prompt=query,
                insight=result.reflection,
            )
            db.add(reflection)

            plan = DailyPlanORM(
                plan_id=f"plan_{uuid4().hex[:16]}",
                citizen_id=citizen.citizen_id,
                game_day=day,
                goals=result.short_term_goals,
                planned_actions=[
                    {
                        "time": city_time,
                        "action": result.activity_adjustment,
                        "reason": "LLM cognition",
                    }
                ],
            )
            db.add(plan)

            conversation_payload = None
            conversation = result.conversation or {}
            if (
                conversations_created < self.settings.max_conversations_per_tick
                and conversation.get("target_citizen_id")
                and conversation.get("lines")
            ):
                conversation_payload = self._create_conversation(
                    db,
                    citizen=citizen,
                    conversation=conversation,
                    day=day,
                    minute_of_day=minute_of_day,
                )
                conversations_created += 1

            results.append(
                {
                    "citizen_id": citizen.citizen_id,
                    "thought": result.thought,
                    "mood": result.mood,
                    "memory": {
                        "memory_id": memory.memory_id,
                        "citizen_id": citizen.citizen_id,
                        "content": memory.content,
                        "importance": memory.importance,
                    },
                    "reflection": {
                        "reflection_id": reflection.reflection_id,
                        "insight": reflection.insight,
                    },
                    "conversation": conversation_payload,
                }
            )

        db.commit()
        return results

    def _rank_candidates(
        self,
        citizens: list[CitizenORM],
        observations: dict[str, list[str]],
        event_context: str,
    ) -> list[CitizenORM]:
        scored: list[tuple[float, CitizenORM]] = []
        for citizen in citizens:
            score = 0.0
            score += len(observations.get(citizen.citizen_id, [])) * 1.5
            score += max(0, 65 - citizen.health) / 12
            score += max(0, citizen.stress - 55) / 12
            score += 1.2 if citizen.profession in {"Doctor", "Mayor", "Police Officer", "Teacher"} else 0
            if event_context:
                score += 2.0
            if citizen.current_location_id != citizen.home_location_id:
                score += 0.25
            scored.append((score, citizen))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [citizen for score, citizen in scored if score > 0.7]

    def _nearby_citizens(self, citizen: CitizenORM, citizens: list[CitizenORM]) -> list[dict[str, str]]:
        nearby: list[dict[str, str]] = []
        for other in citizens:
            if other.citizen_id == citizen.citizen_id:
                continue
            if other.current_location_id == citizen.current_location_id or (
                abs(other.x - citizen.x) + abs(other.y - citizen.y) <= 3
            ):
                nearby.append(
                    {
                        "citizen_id": other.citizen_id,
                        "name": other.name,
                        "profession": other.profession,
                    }
                )
        return nearby[:4]

    def _citizen_prompt(self, citizen: CitizenORM) -> dict:
        return {
            "citizen_id": citizen.citizen_id,
            "name": citizen.name,
            "age": citizen.age,
            "profession": citizen.profession,
            "current_activity": citizen.current_activity,
            "current_location_id": citizen.current_location_id,
            "health": citizen.health,
            "hunger": citizen.hunger,
            "energy": citizen.energy,
            "stress": citizen.stress,
            "happiness": citizen.happiness,
            "money": citizen.money,
            "skills": citizen.skills,
            "personality": citizen.personality,
            "relationships": citizen.relationship_scores,
            "long_term_goals": citizen.long_term_goals,
            "memory_summary": citizen.memory_summary,
        }

    def _create_conversation(
        self,
        db: Session,
        *,
        citizen: CitizenORM,
        conversation: dict,
        day: int,
        minute_of_day: int,
    ) -> dict:
        target = conversation["target_citizen_id"]
        actor_ids = [citizen.citizen_id, target]
        record = ConversationORM(
            conversation_id=f"convo_{uuid4().hex[:16]}",
            game_day=day,
            game_minute=minute_of_day,
            location_id=citizen.current_location_id,
            actor_ids=actor_ids,
            transcript=conversation.get("lines", []),
            summary=conversation.get("summary", ""),
        )
        db.add(record)
        for actor_id in actor_ids:
            self.memory_store.add_memory(
                db,
                citizen_id=actor_id,
                kind="relationship",
                content=conversation.get("summary", ""),
                importance=0.5,
                salience=0.6,
                related_citizen_id=target if actor_id == citizen.citizen_id else citizen.citizen_id,
                extra={"conversation_id": record.conversation_id},
            )
        return {
            "conversation_id": record.conversation_id,
            "actor_ids": actor_ids,
            "summary": record.summary,
            "transcript": record.transcript,
        }

    @staticmethod
    def _compact_summary(existing: str, new_memory: str) -> str:
        parts = [part.strip() for part in [existing, new_memory] if part and part.strip()]
        joined = " ".join(parts)
        return joined[-900:]


def observations_by_actor(events: list[CityEventORM]) -> dict[str, list[str]]:
    observations: dict[str, list[str]] = defaultdict(list)
    for event in events:
        for actor in event.actors:
            observations[actor].append(event.description)
    return observations


def recent_event_context(db: Session, limit: int = 5) -> str:
    events = list(db.scalars(select(CityEventORM).order_by(desc(CityEventORM.timestamp)).limit(limit)))
    return " ".join(event.description for event in events if event.priority >= 2)
