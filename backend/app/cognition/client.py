from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, TypedDict

from app.cognition.deep_agents import DeepAgentRuntime
from app.safety import CHILD_SAFETY_RULES
from app.cognition.encounters import MeetingAction
from app.cognition.errors import CognitionUnavailableError, CognitionValidationError, provider_failure
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
                    "maxItems": 8,
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
            "enum": [
                "targeted_talk",
                "greet_all",
                "ask_all",
                "self_answer",
                "open_task",
                "go_to_location",
                "go_with_citizen",
            ],
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

class PrivateExchangeState(TypedDict):
    lines: list[dict[str, str]]
    turn_results: dict[str, list[dict[str, Any]]]
    meeting_offer: dict[str, Any] | None
    meeting_plan: dict[str, Any] | None
    meeting_locations: list[dict[str, str]]
    meeting_now: int | None


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
    participant_memories: dict[str, str] = field(default_factory=dict)
    participant_reflections: dict[str, str] = field(default_factory=dict)
    participant_outcomes: dict[str, dict[str, Any]] = field(default_factory=dict)
    meeting_plan: dict[str, Any] | None = None


@dataclass
class TaskPlanResult:
    task_kind: str
    target_citizen_ids: list[str] = field(default_factory=list)
    location_id: str | None = None
    reasoning_summary: str = ""
    player_visible_plan: str = ""


class CitizenCognitionClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.deep_agents = DeepAgentRuntime(settings)
        self.client = None
        if settings.real_llm_enabled:
            if settings.llm_provider == "gemini":
                from google import genai
                from google.genai import types

                self.client = genai.Client(
                    api_key=settings.gemini_api_key, vertexai=False,
                    http_options=types.HttpOptions(timeout=40000, retry_options=types.HttpRetryOptions(attempts=1)),
                )
            elif OpenAI is not None:
                self.client = OpenAI(api_key=settings.openai_api_key, timeout=40, max_retries=0)

    def _generate_json(self, system: str, prompt: dict[str, Any], schema: dict[str, Any], name: str) -> dict[str, Any]:
        if not self.client:
            raise CognitionUnavailableError(f"Configure the backend API key for {self.settings.llm_provider}.")
        system = f"{system} {CHILD_SAFETY_RULES}"
        try:
            if self.settings.llm_provider == "gemini":
                response = self.client.models.generate_content(
                    model=self.settings.gemini_model,
                    contents=json.dumps(prompt),
                    config={"system_instruction": system, "response_mime_type": "application/json",
                            "response_json_schema": schema, "max_output_tokens": 4096},
                )
                text = response.text
            else:
                request: dict[str, Any] = {
                    "model": self.settings.openai_model,
                    "input": [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(prompt)}],
                    "text": {"format": {"type": "json_schema", "name": name, "schema": schema, "strict": True}},
                }
                if self._supports_reasoning(self.settings.openai_model):
                    request["reasoning"] = {"effort": "low"}
                    request["text"]["verbosity"] = "low"
                text = self.client.responses.create(**request).output_text
        except Exception as error:
            raise provider_failure(error, self.settings.llm_provider) from None
        try:
            parsed = json.loads(text or "")
            if not isinstance(parsed, dict):
                raise ValueError("Expected a JSON object")
            return parsed
        except (ValueError, TypeError):
            raise CognitionValidationError("The AI did not return a valid structured response. No result was committed.") from None

    def embed(self, text: str) -> list[float] | None:
        if not self.client or self.settings.llm_provider == "gemini":
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
            raise CognitionUnavailableError(f"Cognition is unavailable. Configure the backend API key for {self.settings.llm_provider}.")

        system = (
            "You are simulating one believable citizen in AgentCity, a living 3D AI city game. "
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
                    "When a question asks about a prior social fact, the target may only claim it happened if it appears in their own memory or the supplied prior transcript facts.",
                ],
            },
            "rules": [
                "Treat the first observation as the player's exact task context and satisfy it directly.",
                "Use first-person inner thought for thought.",
                "If the player asked someone to greet or say hi, make the transcript a natural greeting and response.",
                "If the player asked a question, have the target answer it concretely from their own mood, activity, memory, and perspective.",
                "If the player asked the actor to tell someone something, include the actor delivering that message and the target responding to it.",
                "Never leak knowledge from one citizen into another. If the target lacks a direct memory or transcript fact, have them say they are not sure or have not heard yet.",
                "Use three to six short spoken lines when it would feel human: greeting, answer, emotional reaction, and a small follow-up question are allowed.",
                "Give each speaker a distinct emotional tone based on their mood and relationship instead of flat task-report language.",
                "Make memory specific enough to affect future behavior.",
                "Only omit conversation lines when conversation_contract.required is false and no nearby citizen is a natural target.",
                "Keep the result game-readable and concise.",
            ],
        }

        parsed = self._generate_json(system, prompt, COGNITION_SCHEMA, "citizen_cognition")
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
            parsed = self._generate_json(system, repair_prompt, COGNITION_SCHEMA, "citizen_cognition")
            errors = self._conversation_errors(
                parsed,
                actor_id=str(citizen["citizen_id"]),
                required_target_id=required_target_id,
                require_conversation=require_conversation,
            )
        if errors:
            raise CognitionValidationError("; ".join(errors))
        return CognitionResult(**parsed)

    def generate_private_exchange(
        self,
        *,
        actor: dict[str, Any],
        target: dict[str, Any],
        city_time: str,
        task: str,
        observations: list[str],
        actor_memories: list[str],
        target_memories: list[str],
        event_context: str,
        player_utterance: str | None = None,
        autonomous: bool = False,
        meeting_locations: list[dict[str, str]] | None = None,
        meeting_now: int | None = None,
    ) -> CognitionResult:
        if not self.client:
            raise CognitionUnavailableError(f"Cognition is unavailable. Configure the backend API key for {self.settings.llm_provider}.")

        self.deep_agents.prepare_citizen_agent(actor)
        self.deep_agents.prepare_citizen_agent(target)

        try:
            from langgraph.graph import END, START, StateGraph
        except Exception as error:  # pragma: no cover - dependency is required in production
            raise CognitionUnavailableError("LangGraph is unavailable for private agent exchange.") from error

        def actor_open(state: PrivateExchangeState) -> PrivateExchangeState:
            return self._append_private_turn(
                state,
                speaker=actor,
                listener=target,
                city_time=city_time,
                task=task,
                observations=observations,
                private_memories=actor_memories,
                event_context=event_context,
                turn_goal="Open on your reason for approaching this person, from the supplied encounter context. Be yourself, not a generic greeting script." if autonomous else "Open the conversation naturally and make progress on the player's task.",
                enforce_task_alignment=not autonomous,
            )

        def target_reply(state: PrivateExchangeState) -> PrivateExchangeState:
            return self._append_private_turn(
                state,
                speaker=target,
                listener=actor,
                city_time=city_time,
                task="Respond to what was said to you. You may decline, disagree, ask a follow-up, or leave.",
                observations=[f"You are speaking with {actor['name']} at your current location."],
                private_memories=target_memories,
                event_context="",
                turn_goal="Reply honestly from your own private memory. If you do not know a fact, say so.",
                enforce_task_alignment=False,
            )

        def actor_follow_up(state: PrivateExchangeState) -> PrivateExchangeState:
            return self._append_private_turn(
                state,
                speaker=actor,
                listener=target,
                city_time=city_time,
                task=task,
                observations=observations,
                private_memories=actor_memories,
                event_context=event_context,
                turn_goal=(
                    "React to the listener's reply in your own voice. If they answered the question, "
                    "acknowledge them with thanks, empathy, or a next step; do not repeat their answer as if it is your own."
                ),
                enforce_task_alignment=False,
            )

        graph_builder = StateGraph(PrivateExchangeState)
        graph_builder.add_node("actor_open", actor_open)
        graph_builder.add_node("target_reply", target_reply)
        graph_builder.add_node("actor_follow_up", actor_follow_up)
        graph_builder.add_edge(START, "target_reply" if player_utterance else "actor_open")
        graph_builder.add_edge("actor_open", "target_reply")
        def continue_exchange(state: PrivateExchangeState) -> str:
            last_id = state["lines"][-1]["speaker_id"]
            last = state["turn_results"][last_id][-1]
            if player_utterance or last.get("end_conversation") or len(state["lines"]) >= (4 if autonomous else 6):
                return END
            return "target_reply" if last_id == actor["citizen_id"] else "actor_follow_up"

        graph_builder.add_conditional_edges("target_reply", continue_exchange)
        graph_builder.add_conditional_edges("actor_follow_up", continue_exchange)
        initial_lines = [{"speaker_id": str(actor["citizen_id"]), "text": player_utterance}] if player_utterance else []
        final_state = graph_builder.compile().invoke({"lines": initial_lines, "turn_results": {}, "meeting_offer": None,
            "meeting_plan": None, "meeting_locations": meeting_locations or [], "meeting_now": meeting_now})

        lines = final_state["lines"]
        actor_id = str(actor["citizen_id"])
        target_id = str(target["citizen_id"])
        errors = self._conversation_errors(
            {"conversation": {"target_citizen_id": target_id, "summary": task, "lines": lines}},
            actor_id=actor_id,
            required_target_id=target_id,
            require_conversation=True,
        )
        if errors:
            raise CognitionValidationError("; ".join(errors))

        turn_results = final_state["turn_results"]
        actor_result = turn_results.get(actor_id, [{}])[-1] if not player_utterance else {
            "thought": "", "mood": actor.get("mood", "Calm"),
            "memory": f"I said: {player_utterance}", "reflection": "", "importance": 0.5,
        }
        target_result = turn_results[target_id][-1]
        witnessed = "\n".join(f"{actor['name'] if line['speaker_id'] == actor_id else target['name']} said: {line['text']}" for line in lines)
        participant_memories = {
            actor_id: f"I witnessed this conversation at {city_time}. Reported claims are not independently verified.\n{witnessed}",
            target_id: f"I witnessed this conversation at {city_time}. Reported claims are not independently verified.\n{witnessed}",
        }
        participant_reflections = {
            actor_id: str(actor_result["reflection"]),
            target_id: str(target_result["reflection"]),
        }
        summary = self._public_summary(actor, target, task, lines)
        importance = max(float(actor_result["importance"]), float(target_result["importance"]))
        return CognitionResult(
            thought=str(actor_result["thought"]),
            mood=str(actor_result["mood"]),
            activity_adjustment=f"Talked with {target['name']}",
            short_term_goals=[f"Remember what {target['name']} said"],
            memory=participant_memories[actor_id],
            reflection=participant_reflections[actor_id],
            conversation={"target_citizen_id": target_id, "summary": summary, "lines": lines},
            importance=importance,
            participant_memories=participant_memories,
            participant_reflections=participant_reflections,
            meeting_plan=final_state.get("meeting_plan"),
            participant_outcomes={
                citizen_id: {key: result.get(key) for key in ("invitation_response", "relationship_effect", "relationship_reason", "task_complete", "feelings", "mood", "thought")}
                for citizen_id, result in ((actor_id, actor_result), (target_id, target_result))
                if not player_utterance or citizen_id != actor_id
            },
        )

    def _append_private_turn(
        self,
        state: PrivateExchangeState,
        *,
        speaker: dict[str, Any],
        listener: dict[str, Any],
        city_time: str,
        task: str,
        observations: list[str],
        private_memories: list[str],
        event_context: str,
        turn_goal: str,
        enforce_task_alignment: bool,
    ) -> PrivateExchangeState:
        result = self._generate_private_turn(
            speaker=speaker,
            listener=listener,
            city_time=city_time,
            task=task,
            observations=observations,
            private_memories=private_memories,
            public_transcript=state["lines"],
            event_context=event_context,
            turn_goal=turn_goal,
            enforce_task_alignment=enforce_task_alignment,
            meeting_offer=state.get("meeting_offer"),
            meeting_locations=state.get("meeting_locations", []),
        )
        speaker_id = str(speaker["citizen_id"])
        offer = state.get("meeting_offer")
        plan = state.get("meeting_plan")
        if result.get("meeting_action") and state.get("meeting_now") is not None:
            try:
                action = MeetingAction.model_validate(result["meeting_action"]).model_dump()
                when = action["game_day"] * 1440 + action["game_minute"]
                now = state["meeting_now"]
                valid = now + 30 <= when <= now + 1440 and action["location_id"] in {p["location_id"] for p in state.get("meeting_locations", [])}
                if valid and action["action"] == "propose":
                    offer = {**action, "proposer_id": speaker_id}
                elif valid and offer and offer["proposer_id"] != speaker_id and all(action[key] == offer[key] for key in ("location_id", "game_day", "game_minute")):
                    if action["action"] == "accept":
                        plan = {key: offer[key] for key in ("location_id", "game_day", "game_minute", "topic")}
                        plan["actor_ids"] = [offer["proposer_id"], speaker_id]
                    elif action["action"] == "decline":
                        offer, plan = None, None
            except (ValueError, TypeError):
                pass  # An invalid proposed appointment must not invent a commitment.
        return {
            "lines": [*state["lines"], {"speaker_id": speaker_id, "text": str(result["spoken_line"])}],
            "turn_results": {
                **state["turn_results"],
                speaker_id: [*state["turn_results"].get(speaker_id, []), result],
            },
            "meeting_offer": offer,
            "meeting_plan": plan,
        }

    def _generate_private_turn(
        self,
        *,
        speaker: dict[str, Any],
        listener: dict[str, Any],
        city_time: str,
        task: str,
        observations: list[str],
        private_memories: list[str],
        public_transcript: list[dict[str, str]],
        event_context: str,
        turn_goal: str,
        enforce_task_alignment: bool,
        meeting_offer: dict[str, Any] | None = None,
        meeting_locations: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        prompt: dict[str, Any] = {
            "city_time": city_time,
            "speaker": speaker,
            "listener": {
                "citizen_id": listener["citizen_id"],
                "name": listener["name"],
                "mood": listener.get("mood"),
                "current_activity": listener.get("current_activity"),
            },
            "player_task": task,
            "target_identity_contract": {
                "current_listener_is_the_person_being_addressed": True,
                "listener_name": listener["name"],
                "listener_id": listener["citizen_id"],
                "instruction": (
                    "Address the listener as 'you' or by their exact name. Do not use he/she/him/her for the listener, "
                    "and do not say the speaker still needs to go talk to another person unless the public transcript "
                    "already established another remaining target."
                ),
            },
            "current_task_contract": {
                "exact_task": task,
                "mandatory_terms": self._task_terms(task, speaker, listener),
                "instruction": (
                    "This exact task is the only active task. Prior memories are background history, not active instructions. "
                    "Do not continue a previous task or reuse a previous question unless this exact task asks for it."
                ),
            },
            "turn_goal": turn_goal,
            "own_nature": speaker.get("personality", {}).get("nature", {}),
            "observations": observations,
            "private_memories_for_speaker_only": private_memories,
            "public_transcript_so_far": public_transcript,
            "public_meeting_offer": meeting_offer,
            "meeting_locations": meeting_locations or [],
            "event_context": event_context,
            "rules": [
                "Write exactly one spoken line for the speaker.",
                "When it fits your wishes, you may propose meeting again at a specific listed place and time within the next day, at least 30 city minutes from now. Say the place, time and purpose out loud. Do not propose at every encounter.",
                "Only emit meeting_action if your spoken line explicitly proposes, accepts or declines that meeting. Accept only a public_meeting_offer from the OTHER person and copy its place/day/minute exactly. You may decline or leave it undecided. A proposal alone is not a shared plan.",
                f"You are {speaker['name']}; every use of 'I' must refer to {speaker['name']}, not {listener['name']}.",
                "The spoken line must serve the current player_task, not a prior memory.",
                f"The current listener is {listener['name']}; do not replace them with another named person.",
                "Use 'you' for the listener. Avoid gendered third-person pronouns for the listener.",
                "Do not announce that you are about to go ask or talk to someone else when you are already speaking with the current listener.",
                "Use a human tone with emotion, uncertainty, or a small follow-up when natural.",
                "Let own_nature shape your voice, values, sensitivities and attempts to repair conflict. Do not recite trait labels. Traits are tendencies, not compulsory reactions or stereotypes.",
                "Assess only YOUR feelings toward the listener, grounded in specific words in this exchange and your private history. Explain why your personal values make those words matter. Neutral and mixed reactions are valid; do not reward every greeting or force jealousy, affection or romance.",
                "Use the exchange as a whole for your final emotional assessment, not a cumulative delta on each turn. The game applies that assessment once after the exchange.",
                "If asked whether something happened and it is not in your private memory or public transcript, say you are not sure or have not heard.",
                "Do not answer using another citizen's private memory.",
                "When replying after another citizen answered, acknowledge what they said instead of restating it in first person.",
                "Do not repeat a line already present in public_transcript_so_far.",
                "Do not repeat the same factual answer you already gave earlier in this conversation.",
                "Memory must be written from the speaker's first-person perspective.",
            ],
        }
        result = self.deep_agents.generate_private_turn(citizen=speaker, prompt=prompt)
        if enforce_task_alignment and self._line_is_off_task(str(result.get("spoken_line", "")), task, speaker, listener):
            retry_prompt = {
                **prompt,
                "rejected_spoken_line": result.get("spoken_line", ""),
                "correction": (
                    "The rejected line did not pursue the current player_task closely enough, likely because it reused "
                    "an old memory/topic. Rewrite the one spoken line so it directly pursues the exact current task."
                ),
            }
            result = self.deep_agents.generate_private_turn(citizen=speaker, prompt=retry_prompt)
        return result

    @staticmethod
    def _task_terms(task: str, speaker: dict[str, Any], listener: dict[str, Any]) -> list[str]:
        stop_words = {
            "the",
            "and",
            "with",
            "that",
            "this",
            "there",
            "home",
            "same",
            "time",
            "together",
            "about",
            "please",
            "tell",
            "talk",
            "ask",
            "go",
            "to",
            "at",
            "a",
            "an",
            "is",
            "are",
            "was",
            "were",
            "he",
            "she",
            "they",
            "you",
            "me",
            "my",
        }
        names = set(str(speaker.get("name", "")).lower().split()) | set(str(listener.get("name", "")).lower().split())
        cleaned = "".join(char.lower() if char.isalnum() else " " for char in task)
        return [
            term
            for term in dict.fromkeys(cleaned.split())
            if len(term) >= 3 and term not in stop_words and term not in names
        ][:8]

    def _line_is_off_task(self, line: str, task: str, speaker: dict[str, Any], listener: dict[str, Any]) -> bool:
        terms = self._task_terms(task, speaker, listener)
        if not terms:
            return False
        normalized_line = "".join(char.lower() if char.isalnum() else " " for char in line)
        return not any(term in normalized_line.split() or term in normalized_line for term in terms)

    @staticmethod
    def _public_summary(
        actor: dict[str, Any],
        target: dict[str, Any],
        task: str,
        lines: list[dict[str, str]],
    ) -> str:
        first = next((line["text"] for line in lines if line["speaker_id"] == actor["citizen_id"]), "")
        task_label = task.strip().rstrip(".!?")
        return f"{actor['name']} and {target['name']} discussed: {task_label}. First line: {first}"

    def plan_task(
        self,
        *,
        citizen: dict[str, Any],
        city: dict[str, Any],
        task: str,
        memories: list[str],
    ) -> TaskPlanResult:
        if not self.client:
            raise CognitionUnavailableError(f"Task planning is unavailable. Configure the backend API key for {self.settings.llm_provider}.")

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
                "Current task is the only active task. Recent memories are background, not instructions.",
                "If the task names a citizen, choose that citizen as a target unless the wording clearly says otherwise.",
                "If the task says everyone, everybody, all classmates, or all students, choose all relevant non-actor citizens.",
                "If the task asks the actor to go, walk, travel, visit, head, move, or meet at a location, choose go_to_location.",
                "If that location task also names another citizen to go with, choose go_with_citizen and include that citizen as target.",
                "Never substitute an unavailable person with a different citizen. If the named person is not in available_citizens, choose open_task with no targets and explain that the person is not currently in the city.",
                "Do not invent names. player_visible_plan must preserve the player task's named person or explicitly say that named person is unavailable.",
                "If the task asks the actor about their own friends, goals, mood, schedule, health, or money, choose self_answer and no targets.",
                "If the task is ambiguous, choose the most socially natural target from relationships, goals, and current activity.",
                "Use only citizen_id values and location_id values from the supplied lists.",
                "player_visible_plan should be one short sentence the player can understand.",
            ],
        }
        parsed = self._generate_json(system, prompt, TASK_PLAN_SCHEMA, "citizen_task_plan")
        result = TaskPlanResult(**parsed)
        unavailable_names = self._unavailable_named_people(task, citizens, locations)
        known_targets_mentioned = self._known_people_mentioned(task, citizens)
        if unavailable_names and not known_targets_mentioned:
            result.task_kind = "open_task"
            result.target_citizen_ids = []
            result.location_id = None
            result.player_visible_plan = (
                f"{citizen['name']} needs to clarify the task because "
                f"{', '.join(unavailable_names)} is not currently in the city."
            )
        return result

    @staticmethod
    def _known_people_mentioned(task: str, citizens: list[dict[str, Any]]) -> bool:
        normalized = task.lower()
        for citizen in citizens:
            if citizen.get("is_actor"):
                continue
            name = str(citizen.get("name") or "").lower()
            parts = [part for part in name.split() if part]
            if name and name in normalized:
                return True
            if any(part in normalized for part in parts):
                return True
        return False

    @staticmethod
    def _unavailable_named_people(
        task: str,
        citizens: list[dict[str, Any]],
        locations: list[dict[str, Any]],
    ) -> list[str]:
        import re

        available_names = {
            name
            for citizen in citizens
            for name in [
                str(citizen.get("name") or "").lower(),
                *str(citizen.get("name") or "").lower().split(),
            ]
            if name
        }
        location_words = {
            word
            for location in locations
            for word in [
                str(location.get("name") or "").lower(),
                str(location.get("type") or "").lower().replace("_", " "),
                *str(location.get("name") or "").lower().split(),
            ]
            if word
        }
        pattern = re.compile(
            r"\b(?i:ask|tell|invite|meet|visit|call|message|reach out to|talk to|speak to|check on|find)\s+"
            r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)"
        )
        unavailable: list[str] = []
        for match in pattern.finditer(task):
            name = match.group(1).strip()
            lower = name.lower()
            first = lower.split()[0]
            if lower in available_names or first in available_names:
                continue
            if lower in location_words or first in location_words:
                continue
            unavailable.append(name)
        return list(dict.fromkeys(unavailable))

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
