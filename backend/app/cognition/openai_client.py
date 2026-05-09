from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from app.config import Settings

try:
    from openai import OpenAI
except Exception:  # pragma: no cover - optional until dependencies are installed
    OpenAI = None  # type: ignore[assignment]


COGNITION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "thought": {"type": "string"},
        "mood": {"type": "string"},
        "activity_adjustment": {"type": "string"},
        "short_term_goals": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
        "memory": {"type": "string"},
        "reflection": {"type": "string"},
        "conversation": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "target_citizen_id": {"type": ["string", "null"]},
                "summary": {"type": "string"},
                "lines": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "speaker_id": {"type": "string"},
                            "text": {"type": "string"},
                        },
                        "required": ["speaker_id", "text"],
                    },
                    "maxItems": 4,
                },
            },
            "required": ["target_citizen_id", "summary", "lines"],
        },
        "importance": {"type": "number", "minimum": 0, "maximum": 1},
    },
    "required": [
        "thought",
        "mood",
        "activity_adjustment",
        "short_term_goals",
        "memory",
        "reflection",
        "conversation",
        "importance",
    ],
}


@dataclass
class CognitionResult:
    thought: str
    mood: str
    activity_adjustment: str
    short_term_goals: list[str] = field(default_factory=list)
    memory: str = ""
    reflection: str = ""
    conversation: dict[str, Any] = field(default_factory=dict)
    importance: float = 0.5


class CitizenCognitionClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = None
        if settings.real_llm_enabled and OpenAI is not None:
            self.client = OpenAI(api_key=settings.openai_api_key)

    def embed(self, text: str) -> list[float] | None:
        if not self.client:
            return None
        response = self.client.embeddings.create(
            input=text,
            model=self.settings.openai_embedding_model,
        )
        return list(response.data[0].embedding)

    def generate(
        self,
        *,
        citizen: dict[str, Any],
        city_time: str,
        observations: list[str],
        memories: list[str],
        nearby_citizens: list[dict[str, str]],
        event_context: str,
    ) -> CognitionResult:
        if not self.client:
            return self._mock_generate(
                citizen=citizen,
                city_time=city_time,
                observations=observations,
                memories=memories,
                nearby_citizens=nearby_citizens,
                event_context=event_context,
            )

        system = (
            "You are simulating one believable citizen in AgentCity, a living 2D AI city game. "
            "Stay grounded in the citizen's profession, needs, relationships, memories, and the "
            "current city situation. Produce compact JSON only. Do not control movement; explain "
            "human intent, thoughts, plans, memories, and social behavior."
        )
        prompt = {
            "city_time": city_time,
            "citizen": citizen,
            "observations": observations,
            "relevant_memories": memories,
            "nearby_citizens": nearby_citizens,
            "event_context": event_context,
            "rules": [
                "Treat the first observation as the player's exact task context and satisfy it directly.",
                "Use first-person inner thought for thought.",
                "If the player asked someone to greet or say hi, make the transcript a natural greeting and response.",
                "If the player asked a question, have the target answer it from their own perspective when they are the target.",
                "Make memory specific enough to affect future behavior.",
                "Only include conversation lines if a nearby citizen is a natural target.",
                "Keep the result game-readable and concise.",
            ],
        }

        request: dict[str, Any] = {
            "model": self.settings.openai_model,
            "input": [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(prompt)},
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "citizen_cognition",
                    "schema": COGNITION_SCHEMA,
                    "strict": True,
                },
            },
        }
        if self._supports_reasoning(self.settings.openai_model):
            request["reasoning"] = {"effort": "low"}
            request["text"]["verbosity"] = "low"

        response = self.client.responses.create(**request)
        parsed = json.loads(response.output_text)
        return CognitionResult(**parsed)

    @staticmethod
    def _supports_reasoning(model: str) -> bool:
        normalized = model.lower()
        return normalized.startswith(("gpt-5", "o1", "o3", "o4"))

    def _mock_generate(
        self,
        *,
        citizen: dict[str, Any],
        city_time: str,
        observations: list[str],
        memories: list[str],
        nearby_citizens: list[dict[str, str]],
        event_context: str,
    ) -> CognitionResult:
        profession = citizen["profession"]
        name = citizen["name"]
        observation = observations[0] if observations else "The city feels steady."
        memory = memories[0] if memories else f"{name} wants to be useful in Navora."
        task_text = self._task_from_observations(observations)
        task_lower = task_text.lower()
        target_person = nearby_citizens[0] if nearby_citizens else None
        target = target_person["citizen_id"] if target_person else None
        conversation = {"target_citizen_id": None, "summary": "", "lines": []}
        if target and target_person:
            target_first = target_person["name"].split(" ")[0]
            actor_first = name.split(" ")[0]
            is_greeting = any(word in task_lower for word in ("hi", "hello", "greet", "say hey", "check in"))
            is_question = "?" in task_text or any(
                word in task_lower for word in ("ask", "find out", "how many", "what", "who", "why", "when", "where")
            )
            if is_greeting:
                summary = f"{name} says hello to {target_person['name']} and checks how the day feels."
                lines = [
                    {
                        "speaker_id": citizen["citizen_id"],
                        "text": f"Hi {target_first}. I wanted to say hello and see how your day is going.",
                    },
                    {
                        "speaker_id": target,
                        "text": f"Hi {actor_first}. Thanks for coming over. It helps to know someone is paying attention.",
                    },
                ]
            elif is_question:
                summary = f"{name} asks {target_person['name']} about the player task: {task_text}"
                lines = [
                    {
                        "speaker_id": citizen["citizen_id"],
                        "text": f"I wanted to ask you this: {task_text}",
                    },
                    {
                        "speaker_id": target,
                        "text": "I can answer from what I know. Thanks for asking me directly.",
                    },
                ]
            else:
                summary = f"{name} and {target_person['name']} talk through the player task: {task_text}"
                lines = [
                    {
                        "speaker_id": citizen["citizen_id"],
                        "text": f"I wanted to talk with you about this: {task_text}",
                    },
                    {
                        "speaker_id": target,
                        "text": "Thanks for checking in. I will remember that you came over to talk to me.",
                    },
                ]
            conversation = {
                "target_citizen_id": target,
                "summary": summary,
                "lines": lines,
            }
        mood = "Concerned" if "flu" in event_context.lower() or citizen["health"] < 55 else "Focused"
        return CognitionResult(
            thought=f"{observation} As a {profession.lower()}, I should respond in a way people can trust.",
            mood=mood,
            activity_adjustment="Stay alert and adapt the plan if the city needs help.",
            short_term_goals=[
                f"Finish the next {profession.lower()} responsibility",
                "Check on a neighbor",
            ],
            memory=f"{name} noticed at {city_time}: {observation} This connects to: {memory}",
            reflection=f"{name} is learning that daily routines in Navora can change quickly when people need help.",
            conversation=conversation,
            importance=0.65 if event_context else 0.45,
        )

    @staticmethod
    def _task_from_observations(observations: list[str]) -> str:
        for observation in observations:
            if observation.startswith("Player task:"):
                parts = observation.split('"')
                if len(parts) >= 2 and parts[1].strip():
                    return parts[1].strip()
        return observations[0] if observations else "the task"
