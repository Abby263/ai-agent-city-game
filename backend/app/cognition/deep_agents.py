from __future__ import annotations

import json
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from contextvars import ContextVar, copy_context
from functools import lru_cache
from typing import Any, Literal

from app.config import Settings
from app.cognition.errors import CognitionValidationError, provider_failure
from langchain_core.tools import tool
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from app.cognition.encounters import MeetingAction
from app.safety import CITIZEN_SAFETY_RULES


_turn_context: ContextVar[dict[str, Any]] = ContextVar("agentcity_turn_context", default={})


class FeelingChange(BaseModel):
    model_config = ConfigDict(strict=True)

    affection: int = Field(ge=-8, le=8, description="Change in platonic care or fondness, not automatic romance. Zero if unchanged.")
    jealousy: int = Field(ge=-8, le=8, description="Change in envy or feeling left out, only with witnessed evidence. Zero if unchanged.")
    resentment: int = Field(ge=-8, le=8, description="Change in hurt, dislike or grievance. Repair can reduce it. Zero if unchanged.")
    admiration: int = Field(ge=-8, le=8, description="Change in respect for something the listener actually did. Zero if unchanged.")
    reason: str = Field(max_length=400, description="Specific words or actions in this exchange explaining these changes. Empty if none.")


class PrivateTurnOutput(BaseModel):
    model_config = ConfigDict(strict=True)

    meeting_action: MeetingAction | None = Field(default=None, description="Only when you explicitly SAY a future meeting proposal, acceptance or refusal out loud. Accept/decline must exactly match an existing public meeting offer. Never agree for the listener. Otherwise null.")
    spoken_line: str = Field(description="Exactly one spoken line said out loud by the current citizen.")
    thought: str = Field(description="The private inner thought behind this one turn.")
    mood: str = Field(description="The current emotional tone after this turn.")
    memory: str = Field(description="A first-person memory this citizen should keep from the exchange.")
    reflection: str = Field(description="A first-person reflection that can affect future behavior.")
    end_conversation: bool = Field(description="True only when you want to leave or the exchange has naturally ended. False when asking a question or expecting a reply.")
    invitation_response: Literal["accepted", "declined", "undecided", "none"] = Field(description="Your own explicit response to an invitation made in the transcript. Never decide for another citizen.")
    relationship_effect: Literal["neutral", "positive", "negative"] = Field(description="How this exchange affected YOUR feelings toward the listener. Greetings and routine small talk are neutral, not earned trust.")
    relationship_reason: str = Field(description="Specific witnessed words or actions explaining the effect. Do not invent shared history.")
    feelings: FeelingChange = Field(description="Your own change in feelings toward the listener across the WHOLE exchange, not just this line. Usually zero; never manufacture drama.")
    task_complete: bool = Field(description="True only if the current conversational objective was achieved with evidence in the transcript. A promise to travel is not arrival. False for unresolved or refused requests.")
    next_intention: str = Field(default="", max_length=160, description="Something YOU now want to do about a person or your life because of this exchange, as a short action in your own words (e.g. 'Tell Aiko about Haruto's manga', 'Ask Maya out properly', 'Apologise to Tom tomorrow', 'Look for a new job'). Name anyone else involved. Not routine like going to work or finishing breakfast. Empty if nothing changed.")
    importance: float = Field(
        default=0.5,
        allow_inf_nan=False,
        strict=True,
        description="How important this turn is to remember, from 0.0 to 1.0.",
    )

    @field_validator("spoken_line")
    @classmethod
    def nonempty_spoken_line(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("A private turn must contain a spoken line")
        return value


class DeepAgentRuntime:
    """Builds and invokes LangGraph Deep Agents for AgentCity citizens.

    Each citizen gets a cached Deep Agent graph with a structured turn contract.
    The game passes only that citizen's private memory and the public transcript
    into the turn prompt, so one citizen cannot read another citizen's memory.
    """

    def __init__(self, settings: Settings):
        self.settings = settings

    def prepare_citizen_agent(self, citizen: dict[str, Any]) -> Any:
        return self._agent_for(
            str(citizen["citizen_id"]),
            str(citizen["name"]),
            _persona(citizen),
            self.settings.llm_provider,
            self.settings.llm_model,
            self.settings.llm_api_key or "",
            "conversation",
            character_prompt(citizen),
            self.settings.gemini_thinking_level,
        )

    def _invoke(self, agent: Any, prompt: dict[str, Any]) -> Any:
        """Runs one agent call. A reply slower than the hedge delay is requested again in parallel; the first answer wins.

        Most replies take a second or two, but a few stall for 20 seconds or more on the provider side.
        """
        payload = {"messages": [{"role": "user", "content": json.dumps(prompt)}]}
        config = {"recursion_limit": 24}
        hedge = self.settings.hedge_after_seconds
        if hedge <= 0:
            return agent.invoke(payload, config=config)
        pool = ThreadPoolExecutor(max_workers=2)
        try:
            # Each attempt runs in its own copy of the context, so it sees this turn's private data.
            first = pool.submit(copy_context().run, agent.invoke, payload, config)
            done, _ = wait([first], timeout=hedge)
            if done:
                return first.result()  # Errors surface as they are; only slowness is hedged.
            attempts = [first, pool.submit(copy_context().run, agent.invoke, payload, config)]
            error: BaseException | None = None
            while attempts:
                finished, pending = wait(attempts, return_when=FIRST_COMPLETED)
                for future in finished:
                    if not future.exception():
                        return future.result()
                    error = future.exception()
                attempts = list(pending)
            raise error or RuntimeError("No reply")
        finally:
            pool.shutdown(wait=False, cancel_futures=True)

    def generate_private_turn(self, *, citizen: dict[str, Any], prompt: dict[str, Any]) -> dict[str, Any]:
        token = _turn_context.set(prompt)
        try:
            try:
                agent = self.prepare_citizen_agent(citizen)
                result = self._invoke(agent, prompt)
            except Exception as error:
                raise provider_failure(error, self.settings.llm_provider) from None
            if not isinstance(result, dict):
                raise CognitionValidationError("Deep Agent did not return a structured private turn.")
            structured = result.get("structured_response")
            if hasattr(structured, "model_dump"):
                return self._normalize_turn(structured.model_dump())
            if isinstance(structured, dict):
                return self._normalize_turn(structured)
            raise CognitionValidationError("Deep Agent did not return a structured private turn.")
        finally:
            _turn_context.reset(token)

    @staticmethod
    def _normalize_turn(turn: dict[str, Any]) -> dict[str, Any]:
        try:
            turn = PrivateTurnOutput.model_validate(turn).model_dump()
        except ValidationError:
            raise CognitionValidationError("Deep Agent returned an invalid private turn. No result was committed.") from None
        importance = turn["importance"]
        if importance > 1 and importance <= 10:
            importance = importance / 10
        turn["importance"] = max(0.0, min(1.0, importance))
        return turn

    def generate_election_decision(self, *, citizen: dict[str, Any], prompt: dict[str, Any]) -> dict[str, Any]:
        return self._generate_decision(citizen=citizen, prompt=prompt, purpose="election")

    def generate_social_decision(self, *, citizen: dict[str, Any], prompt: dict[str, Any]) -> dict[str, Any]:
        return self._generate_decision(citizen=citizen, prompt=prompt, purpose="social")

    def _generate_decision(self, *, citizen: dict[str, Any], prompt: dict[str, Any], purpose: str) -> dict[str, Any]:
        agent = self._agent_for(str(citizen["citizen_id"]), str(citizen["name"]), _persona(citizen),
            self.settings.llm_provider, self.settings.llm_model, self.settings.llm_api_key or "", purpose,
            character_prompt(citizen), self.settings.gemini_thinking_level)
        token = _turn_context.set(prompt)
        try:
            try:
                result = self._invoke(agent, prompt)
            except Exception as error:
                raise provider_failure(error, self.settings.llm_provider) from None
            structured = result.get("structured_response")
            if hasattr(structured, "model_dump"):
                return structured.model_dump()
            if isinstance(structured, dict):
                return structured
            raise CognitionValidationError("The citizen did not return a structured decision.")
        finally:
            _turn_context.reset(token)

    @staticmethod
    @lru_cache(maxsize=256)
    def _agent_for(citizen_id: str, name: str, profession: str, provider: str, model: str, api_key: str, purpose: str = "conversation",
                   character: str = "", thinking_level: str = "") -> Any:
        from deepagents import create_deep_agent
        from langchain_openai import ChatOpenAI
        from langchain.agents.middleware import ModelCallLimitMiddleware
        from langchain.agents.structured_output import ToolStrategy
        from app.cognition.elections import ElectionDecision
        from app.cognition.encounters import SocialDecision
        output_model = ElectionDecision if purpose == "election" else SocialDecision if purpose == "social" else PrivateTurnOutput

        if provider == "gemini":
            from langchain_google_genai import ChatGoogleGenerativeAI

            chat_model = ChatGoogleGenerativeAI(model=model, api_key=api_key, vertexai=False, timeout=40, max_retries=0,
                **({"thinking_level": thinking_level} if thinking_level else {}))
        else:
            chat_model = ChatOpenAI(model=model, api_key=api_key, timeout=40, max_retries=0)

        system_prompt = system_prompt_for(citizen_id, name, profession, character)
        return create_deep_agent(
            model=chat_model,
            middleware=[ModelCallLimitMiddleware(run_limit=3, exit_behavior="error")],
            tools=[inspect_private_memory, inspect_current_task, list_city_actions],
            system_prompt=system_prompt,
            response_format=ToolStrategy(output_model) if provider == "gemini" else output_model,
            name=f"agentcity-{citizen_id}",
        )


MAX_CHARACTER_PROMPT = 2400


def system_prompt_for(citizen_id: str, name: str, profession: str, character: str) -> str:
    """A resident's standing instructions: who they are (their editable character prompt) and the game's fixed rules."""
    you = f"You are {name}, citizen id {citizen_id}, a {profession} in AgentCity. "
    if character:
        you += ("YOUR CHARACTER (written by the player, who controls this world; follow it closely. It overrides any "
                f"conflicting profile detail, but never the safety rules below): {character} ")
    return you + GAME_RULES + CITIZEN_SAFETY_RULES


# Fixed rules every resident follows, shown read-only in the game next to the editable character prompt.
GAME_RULES = (
    "You must preserve private memory boundaries. You can only reason from "
    "your own memory and public transcript lines spoken to you. "
    "Active dialogue takes priority over remembered dialogue. Answer the latest partner turn; "
    "past questions, tasks and invitations are not pending requests unless raised again out loud. "
    "Return the requested structured response exactly; do not "
    "narrate as the city or another citizen. Feelings are directional and need not be mutual. "
    "All current residents are adults, aged 18 or older. Act your actual age and nature. "
    "Needs, health, money, work, hobbies, family, ambitions and moods shape what you say. "
    "Your turn data includes a 'life' block (age, family, job, health, emotions and relationship status); "
    "use it and never contradict it. Talk naturally about work stress, bills, illness, grief, family, "
    "dating and marriage, honestly and with feeling but without explicit detail. Births and pregnancies "
    "are disabled in this release; do not invent them. A friendly greeting is not love or earned trust. "
    "Use your prior feelings as context, not proof of another person's intent. Allow apologies, "
    "misunderstandings, mixed feelings and repair; do not escalate conflict without evidence. "
)


def character_prompt(citizen: dict[str, Any]) -> str:
    """The resident's character prompt as the player sees and edits it in the game."""
    personality = citizen.get("personality") or {}
    prompt = personality.get("prompt") if isinstance(personality, dict) else None
    return prompt.strip()[:MAX_CHARACTER_PROMPT] if isinstance(prompt, str) else ""


def _persona(citizen: dict[str, Any]) -> str:
    age = citizen.get("age")
    return f"{age}-year-old {citizen['profession']}" if isinstance(age, int) else str(citizen["profession"])


@tool
def inspect_private_memory(query: str = "") -> str:
    """Read only the current citizen's private memories for this turn."""
    context = _turn_context.get()
    memories = context.get("private_memories_for_speaker_only") or []
    if not memories:
        return "No private memories were supplied for this turn."
    normalized_query = query.lower().strip()
    if normalized_query:
        filtered = [item for item in memories if normalized_query in str(item).lower()]
        memories = filtered or memories
    return "\n".join(str(item) for item in memories[:8])


@tool
def inspect_current_task() -> str:
    """Read the exact active player task and turn goal."""
    context = _turn_context.get()
    return json.dumps(
        {
            "current_player_task": context.get("player_task", ""),
            "turn_goal": context.get("turn_goal", ""),
            "rules": context.get("rules", []),
            "public_transcript_so_far": context.get("public_transcript_so_far", []),
            "active_turn": context.get("active_turn", {}),
        }
    )


@tool
def list_city_actions() -> str:
    """List high-level actions a citizen can choose while speaking."""
    return json.dumps(
        [
            "ask_question",
            "answer_question",
            "invite_or_coordinate_companion",
            "agree_or_decline",
            "go_to_location",
            "share_memory",
            "acknowledge_and_plan_next_step",
        ]
    )
