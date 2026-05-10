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

TASK_PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "task_kind": {
            "type": "string",
            "enum": ["targeted_talk", "greet_all", "ask_all", "self_answer", "open_task"],
        },
        "target_citizen_ids": {
            "type": "array",
            "items": {"type": "string"},
            "maxItems": 12,
        },
        "location_id": {"type": ["string", "null"]},
        "reasoning_summary": {"type": "string"},
        "player_visible_plan": {"type": "string"},
    },
    "required": ["task_kind", "target_citizen_ids", "location_id", "reasoning_summary", "player_visible_plan"],
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


@dataclass
class TaskPlanResult:
    task_kind: str
    target_citizen_ids: list[str] = field(default_factory=list)
    location_id: str | None = None
    reasoning_summary: str = ""
    player_visible_plan: str = ""


class CognitionUnavailableError(RuntimeError):
    pass


class CognitionValidationError(RuntimeError):
    pass


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
        nearby_citizens: list[dict[str, Any]],
        event_context: str,
        required_target_id: str | None = None,
        require_conversation: bool = False,
    ) -> CognitionResult:
        if not self.client:
            raise CognitionUnavailableError("OpenAI cognition is unavailable. Set LLM_MODE=real and OPENAI_API_KEY.")

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
            "conversation_contract": {
                "required": require_conversation,
                "required_target_citizen_id": required_target_id,
                "requirements": [
                    "If required is true, conversation.target_citizen_id must equal required_target_citizen_id.",
                    "If required is true, conversation.lines must include at least one line from the actor and at least one line from the target.",
                    "If the player asked the actor to tell, ask, invite, warn, explain, or report something to the target, the target must acknowledge or answer in their own voice.",
                ],
            },
            "rules": [
                "Treat the first observation as the player's exact task context and satisfy it directly.",
                "Use first-person inner thought for thought.",
                "If the player asked someone to greet or say hi, make the transcript a natural greeting and response.",
                "If the player asked a question, have the target answer it concretely from their own mood, activity, memory, and perspective.",
                "If the player asked the actor to tell someone something, include the actor delivering that message and the target responding to it.",
                "Make memory specific enough to affect future behavior.",
                "Only omit conversation lines when conversation_contract.required is false and no nearby citizen is a natural target.",
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

        parsed = json.loads(self.client.responses.create(**request).output_text)
        errors = self._conversation_errors(
            parsed,
            actor_id=str(citizen["citizen_id"]),
            required_target_id=required_target_id,
            require_conversation=require_conversation,
        )
        for _attempt in range(2):
            if not errors:
                break
            repair_prompt = {
                "original_prompt": prompt,
                "invalid_response": parsed,
                "validation_errors": errors,
                "repair_instruction": (
                    "Return a corrected JSON response. Do not summarize the missing conversation. "
                    "Write the actual lines spoken by both citizens."
                ),
            }
            repair_request = dict(request)
            repair_request["input"] = [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(repair_prompt)},
            ]
            parsed = json.loads(self.client.responses.create(**repair_request).output_text)
            errors = self._conversation_errors(
                parsed,
                actor_id=str(citizen["citizen_id"]),
                required_target_id=required_target_id,
                require_conversation=require_conversation,
            )
        if errors:
            raise CognitionValidationError("; ".join(errors))
        return CognitionResult(**parsed)

    def plan_task(
        self,
        *,
        citizen: dict[str, Any],
        city: dict[str, Any],
        task: str,
        memories: list[str],
    ) -> TaskPlanResult:
        if not self.client:
            raise CognitionUnavailableError("OpenAI task planning is unavailable. Set LLM_MODE=real and OPENAI_API_KEY.")

        citizens = [
            {
                "citizen_id": item["citizen_id"],
                "name": item["name"],
                "age": item["age"],
                "mood": item["mood"],
                "current_activity": item["current_activity"],
                "current_location_id": item["current_location_id"],
                "relationship_score_from_actor": citizen.get("relationship_scores", {}).get(item["citizen_id"]),
                "is_actor": item["citizen_id"] == citizen["citizen_id"],
            }
            for item in city["citizens"]
        ]
        locations = [
            {
                "location_id": item["location_id"],
                "name": item["name"],
                "type": item["type"],
            }
            for item in city["locations"]
        ]
        system = (
            "You are the private planning brain of one AgentCity citizen. The player gives the citizen a "
            "natural-language task, but the player does not choose targets or routes. Decide what the citizen "
            "would do like a believable human: who to talk to, where to go, and whether the task is about self "
            "knowledge, one person, several people, or an open-ended action. Return JSON only."
        )
        prompt = {
            "actor": citizen,
            "task": task,
            "available_citizens": citizens,
            "available_locations": locations,
            "recent_memories": memories,
            "rules": [
                "If the task names a citizen, choose that citizen as a target unless the wording clearly says otherwise.",
                "If the task says everyone, everybody, all classmates, or all students, choose all relevant non-actor citizens.",
                "If the task asks the actor about their own friends, goals, mood, schedule, health, or money, choose self_answer and no targets.",
                "If the task is ambiguous, choose the most socially natural target from relationships, goals, and current activity.",
                "Use only citizen_id values and location_id values from the supplied lists.",
                "player_visible_plan should be one short sentence the player can understand.",
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
                    "name": "citizen_task_plan",
                    "schema": TASK_PLAN_SCHEMA,
                    "strict": True,
                },
            },
        }
        if self._supports_reasoning(self.settings.openai_model):
            request["reasoning"] = {"effort": "low"}
            request["text"]["verbosity"] = "low"

        response = self.client.responses.create(**request)
        parsed = json.loads(response.output_text)
        return TaskPlanResult(**parsed)

    @staticmethod
    def _supports_reasoning(model: str) -> bool:
        normalized = model.lower()
        return normalized.startswith(("gpt-5", "o1", "o3", "o4"))

    @staticmethod
    def _conversation_errors(
        parsed: dict[str, Any],
        *,
        actor_id: str,
        required_target_id: str | None,
        require_conversation: bool,
    ) -> list[str]:
        if not require_conversation:
            return []
        errors: list[str] = []
        conversation = parsed.get("conversation")
        if not isinstance(conversation, dict):
            return ["conversation is required for this task"]
        target_id = conversation.get("target_citizen_id")
        if required_target_id and target_id != required_target_id:
            errors.append(f"conversation.target_citizen_id must be {required_target_id}")
        lines = conversation.get("lines")
        if not isinstance(lines, list) or len(lines) < 2:
            errors.append("conversation.lines must contain at least two spoken lines")
            return errors
        speakers = {line.get("speaker_id") for line in lines if isinstance(line, dict)}
        if actor_id not in speakers:
            errors.append(f"conversation.lines must include actor speaker_id {actor_id}")
        if required_target_id and required_target_id not in speakers:
            errors.append(f"conversation.lines must include target speaker_id {required_target_id}")
        if not str(conversation.get("summary") or "").strip():
            errors.append("conversation.summary is required")
        return errors
