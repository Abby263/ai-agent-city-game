# AgentCity

AgentCity is a playable 2D AI city simulation where citizens are autonomous agents with daily routines, needs, money, relationships, memory, and goals. The current MVP intentionally focuses on five active student agents so the story is easy to follow before scaling back to the full city.

This repo is `ai-agent-city-game`. The visible product name is `AgentCity`.

Play online: https://ai-agent-city-game.vercel.app

## Stack

- Frontend: Next.js, React, Phaser, Tailwind, shadcn-style primitives, Zustand
- Backend: FastAPI, Pydantic, SQLAlchemy
- Realtime: WebSocket
- Database: cloud Postgres with pgvector, Neon recommended
- LLM: OpenAI Responses API
- Embeddings: OpenAI embeddings, default `text-embedding-3-small`

## Autonomy Direction

AgentCity uses a Hermes-inspired loop: citizens collect observations, retrieve memories, reason selectively, form plans, talk to nearby citizens, and write new memories back into the city. The linked Hermes Agent project is a useful reference for self-improving agents with persistent memory, skill learning, cross-session recall, scheduled automations, and subagents. AgentCity applies those ideas inside a game simulation rather than embedding Hermes as a runtime dependency.

Auto Mode in the UI starts the city and keeps ticks flowing from the browser. As the five students cross paths, the backend creates social opportunities, LLM cognition can generate conversations, and relationships shift from strangers to acquaintances to friends over time.

## Local Setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Create a cloud Postgres database.

Recommended: Neon Postgres with pgvector. Copy the project connection string and set `DATABASE_URL` or `NEON_DATABASE_URL` in `.env`. See [docs/cloud-database.md](docs/cloud-database.md).

3. Backend:

```bash
cd backend
uv venv
uv pip install -e ".[dev]"
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

4. Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## LLM Modes

`LLM_MODE=mock` runs a deterministic cognition fallback for development and tests.

`LLM_MODE=real` requires `OPENAI_API_KEY` and uses the OpenAI Responses API for citizen thoughts, conversations, plans, reflections, and mayor summaries. Movement, schedules, needs, salary, inventory, and pathing stay deterministic so the game does not call the LLM constantly.

The default cognition limits are:

```bash
MAX_LLM_CALLS_PER_TICK=2
MAX_CONVERSATIONS_PER_TICK=1
LLM_COGNITION_INTERVAL_TICKS=4
ACTIVE_CITIZEN_IDS=cit_009,cit_010,cit_021,cit_022,cit_026
```

Set `ACTIVE_CITIZEN_IDS=all` to activate the full seeded city later, or provide a comma-separated list to choose a custom playable cast. The inactive citizens remain in the codebase and database.

## Database

AgentCity no longer depends on a local Postgres/Redis stack for normal development. The backend accepts Supabase, Neon, or any hosted Postgres URL through `DATABASE_URL`.

On startup the backend enables pgvector with `CREATE EXTENSION IF NOT EXISTS vector`, creates the SQLAlchemy tables, and seeds Navora if empty. Redis remains optional future infrastructure and is not required for V1 gameplay.

## Core Gameplay

- Watch five student agents move across a 40x40 top-down city map.
- Tap or click any student to see thoughts, memory, relationships, mood, needs, money, schedule, and goals.
- Assign a task to any student and watch it become a goal, memory, and possible conversation trigger.
- Trigger city events such as flu outbreak, traffic accident, food shortage, school exam, festival, bank policy change, and power outage.
- Change mayor policies for tax, hospitals, school funding, roads, farming subsidies, and public health.
- Observe WebSocket-streamed thoughts, conversations, memories, reflections, and city metrics.
- Play from desktop or mobile; the UI stacks the city map, citizen panel, roster, and story feed on smaller screens.

## How To Play

1. Open the city and let the clock run at `1x` or use `Step 15m`.
2. Tap Ava, Mateo, Noah, Iris, or Leo on the map to follow one student.
3. Use `Give [name] a task` to ask them to talk, study, visit the park, or check on someone.
4. Read `Life`, `Memory`, and `Talk` to understand their goals, memories, conversations, and relationship stage.
5. Use `Make Something Happen` for a school exam, festival, flu outbreak, or power outage, then open `Story` when you want the feed.

## Verification

Backend tests:

```bash
cd backend
uv run pytest
```

Frontend checks:

```bash
cd frontend
npm run lint
npm run build
```
