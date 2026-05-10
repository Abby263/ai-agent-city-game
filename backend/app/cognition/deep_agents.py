from __future__ import annotations

import json
from contextvars import ContextVar
from functools import lru_cache
from typing import Any

from app.config import Settings
from langchain_core.tools import tool
from pydantic import BaseModel, Field


_turn_context: ContextVar[dict[str, Any]] = ContextVar("agentcity_turn_context", default={})


class PrivateTurnOutput(BaseModel):
    spoken_line: str = Field(description="Exactly one spoken line said out loud by the current citizen.")
    thought: str = Field(description="The private inner thought behind this one turn.")
    mood: str = Field(description="The current emotional tone after this turn.")
    memory: str = Field(description="A first-person memory this citizen should keep from the exchange.")
    reflection: str = Field(description="A first-person reflection that can affect future behavior.")
    importance: float = Field(
        default=0.5,
        description="How important this turn is to remember, from 0.0 to 1.0.",
    )


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
            str(citizen["profession"]),
            self.settings.openai_model,
            self.settings.openai_api_key or "",
        )

    def generate_private_turn(self, *, citizen: dict[str, Any], prompt: dict[str, Any]) -> dict[str, Any]:
        agent = self.prepare_citizen_agent(citizen)
        token = _turn_context.set(prompt)
        try:
            result = agent.invoke({"messages": [{"role": "user", "content": json.dumps(prompt)}]})
            structured = result.get("structured_response")
            if isinstance(structured, PrivateTurnOutput):
                return self._normalize_turn(structured.model_dump())
            if hasattr(structured, "model_dump"):
                return self._normalize_turn(structured.model_dump())
            if isinstance(structured, dict):
                return self._normalize_turn(structured)
            raise ValueError("Deep Agent did not return a structured private turn.")
        finally:
            _turn_context.reset(token)

    @staticmethod
    def _normalize_turn(turn: dict[str, Any]) -> dict[str, Any]:
        importance = float(turn.get("importance", 0.5))
        if importance > 1 and importance <= 10:
            importance = importance / 10
        turn["importance"] = max(0.0, min(1.0, importance))
        return turn

    @staticmethod
    @lru_cache(maxsize=64)
    def _agent_for(citizen_id: str, name: str, profession: str, model: str, api_key: str) -> Any:
        from deepagents import create_deep_agent
        from langchain_openai import ChatOpenAI

        system_prompt = (
            f"You are {name}, citizen id {citizen_id}, a {profession} in AgentCity. "
            "You must preserve private memory boundaries. You can only reason from "
            "your own memory and public transcript lines spoken to you. Return the "
            "structured private turn exactly, including the importance score; do not "
            "narrate as the city or another citizen."
        )
        return create_deep_agent(
            model=ChatOpenAI(model=model, api_key=api_key),
            tools=[inspect_private_memory, inspect_current_task, list_city_actions],
            system_prompt=system_prompt,
            response_format=PrivateTurnOutput,
            name=f"agentcity-{citizen_id}",
        )


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
