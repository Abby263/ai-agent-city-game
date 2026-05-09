# AgentCity Architecture

AgentCity is split into a playable Phaser city client and a FastAPI simulation server.

The default MVP keeps the full seeded city in storage but exposes only five active student agents:

- Ava Singh
- Mateo Garcia
- Noah Mensah
- Iris Novak
- Leo Brooks

This is controlled by `ACTIVE_CITIZEN_IDS`. Set it to `all` to activate the full roster, or to any comma-separated citizen IDs for a custom cast.

## Runtime Flow

1. The frontend opens the city with `GET /city/state`.
2. The frontend connects to `WS /ws/city`.
3. Simulation ticks update deterministic systems: clock, schedules, movement, needs, health, economy, education, transport, and city events.
4. The cognition pipeline scores citizens for meaningful moments.
5. Selected citizens retrieve memories from Postgres/pgvector.
6. OpenAI Responses API generates structured thoughts, plans, conversations, memories, and reflections when `LLM_MODE=real`.
7. Results are persisted and streamed to the frontend.

## Memory Layers

- Short-term: recent observations and nearby events.
- Episodic: important citizen experiences.
- Relationship: social context tied to another citizen.
- Semantic summary: compact citizen-level memory summary.
- Reflection: daily or event-driven interpretation.

## Cost Controls

- Movement and need updates never call an LLM.
- `MAX_LLM_CALLS_PER_TICK` limits cognition work.
- `MAX_CONVERSATIONS_PER_TICK` limits social exchanges.
- `LLM_COGNITION_INTERVAL_TICKS` avoids running cognition every movement tick.
- The current defaults are two cognition calls and one conversation every fourth tick.
- Stable citizen persona and city rules are kept in prompt prefixes.
- Memory retrieval sends only the most relevant memories.

## Persistence

Cloud Postgres is the source of truth for V1. Neon is the expected deployment database for this project, and Supabase also works because both support Postgres with the `vector` extension.

Redis is not required for V1. The current MVP streams directly from FastAPI WebSockets; a queue/event-bus can be added later when background cognition workers are split from the API process.
