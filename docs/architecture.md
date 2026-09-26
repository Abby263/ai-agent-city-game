# AgentCity Architecture

AgentCity is split into a playable Three.js city client and a FastAPI cognition/simulation server. The default local-first browser runtime and its private agent exchanges are documented in the [README architecture diagrams](../README.md#architecture-diagrams).

The default MVP keeps the full seeded city in storage but exposes only five active student agents:

- Ava Singh
- Mateo Garcia
- Noah Mensah
- Iris Novak
- Leo Brooks

This is controlled by citizen profile files plus `ACTIVE_CITIZEN_IDS`. The default `ACTIVE_CITIZEN_IDS=profile` reads citizens marked `active: true` in `backend/app/citizens/profiles/*.yaml`. Set it to `all` to activate the full roster, or to any comma-separated citizen IDs for a custom cast.

## Runtime Flow

1. In browser memory mode, the frontend restores its local world or seeds one from the citizen profiles. The optional server mode instead loads `GET /city/state` and listens on `WS /ws/city`.
2. Simulation ticks update mechanical game state; the Three.js renderer projects that state into a continuously animated town without calling an LLM.
3. Meaningful tasks and exchanges call the FastAPI cognition endpoints. Each speaker receives only their own private context and witnessed dialogue.
4. The selected Gemini or OpenAI provider and the LangGraph/Deep Agents exchange generate plans, spoken lines, private thoughts, memories, and reflections. Both planning and private turns use the same configured provider; there is no cross-provider fallback.
5. The browser commits valid results to its world, relationships, transcript, and per-citizen journals. Stale results from interrupted actions are discarded.

See [3D town architecture](3d-town.md) for geometry, navigation, camera, and resource lifecycle details.

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

Browser localStorage is the default short-term world store. Optional server mode can use cloud Postgres with pgvector. The 3D conversion does not require a database, alter agent memory ownership, or migrate saved worlds.

Redis is not required for V1. The current MVP streams directly from FastAPI WebSockets; a queue/event-bus can be added later when background cognition workers are split from the API process.
