# AgentCity Autonomy Model

AgentCity should feel like a city of people, not a dashboard of bots.

The current implementation uses LangGraph + Deep Agents as the agent workflow
layer and OpenAI as the strict structured cognition layer for citizen planning,
conversation, reflection, and memory writing. The local game engine does not
decide what a person should say or who they should talk to for a player task; it
advances city time, moves sprites, records memory, and validates that the AI
produced a real exchange before the task is marked complete.

The design borrows the useful ideas from Hermes Agent, LangGraph, and Deep Agents:

- persistent memory that compounds over time
- recall of past conversations and social history
- autonomous reflection and planning
- a planner/orchestrator step before a citizen acts
- worker-style citizen agents that report results back through the game state
- subagents as a scalable path for city-wide institutions

Hermes Agent reference: https://github.com/nousresearch/hermes-agent
Deep Agents reference: https://reference.langchain.com/python/deepagents/

## In-Game Loop

Every playable tick:

1. The engine advances city time, sprite movement, location state, and visible events.
2. The orchestrator creates observations for any active task or autonomous social moment.
3. The LLM task planner decides the citizen's target citizens, location, and visible plan.
4. LangGraph runs private exchange nodes: actor turn, target reply, actor follow-up, target close.
5. Each node invokes the current citizen's cached Deep Agent graph with a structured private-turn response contract.
6. Each private turn receives only that citizen's private memory plus the public transcript so far.
7. OpenAI Responses API returns strict JSON for the turn, spoken line, memory, reflection, and mood.
8. The engine validates required conversations before closing the task.
9. Conversations write separate memories for each participant.
10. Relationship scores evolve from stranger to acquaintance to friend to trusted friend.
11. The UI streams visible thoughts, conversations, memory updates, and relationship context.

## Memory Boundary

Each citizen has private runtime memory. A citizen can learn a fact only from:

- their own seed/persona memory
- memories written after their own actions
- words spoken to them in a conversation
- public city events visible to everyone

The orchestrator can route a task, but it must not leak one citizen's private
memory into another citizen's prompt. If Ava asks Mateo whether he was invited to
dinner, Mateo answers from Mateo's memory only. If Mateo has not heard about an
invitation, the correct human answer is uncertainty, not a hallucinated yes.

## Auto Mode

Auto Mode is the playable version of the autonomy loop. It starts the city and keeps ticks flowing while the player observes.

In Auto Mode, citizens do not need direct player commands to talk. The game emits
social opportunities when citizens share a location or cross paths, and LLM cognition
turns important opportunities into conversations.

## Relationship Development

A first meeting starts as a stranger relationship. Repeated positive conversations increase:

- familiarity
- warmth
- trust

When those values pass thresholds, the relationship becomes:

- Acquaintance
- Friend
- Trusted friend

The conversation is saved to durable memory for both citizens so future conversations can reference past interactions.

## Future Hermes-Style Extensions

Good next steps:

- Deep Agents subagents for school, hospital, bank, mayor office, and emergency response
- citizen self-improvement journals that become retrievable memories
- profession-specific learned skills and tools
- nightly memory consolidation from session memory into durable storage
- autonomous city institutions, such as hospital, school, bank, and mayor agents
- background scheduled simulation jobs
- subagent delegation for major city crises
