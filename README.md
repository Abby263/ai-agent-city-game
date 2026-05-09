# AgentCity

AgentCity is a playable 2D AI city simulation where citizens are autonomous agents with daily routines, needs, money, relationships, memory, and goals. The current MVP intentionally focuses on five active student agents so the story is easy to follow before scaling back to the full city.

This repo is `ai-agent-city-game`. The visible product name is `AgentCity`.

Play online: https://ai-agent-city-game.vercel.app

## Stack

- Frontend: Next.js, React, Phaser, Tailwind, shadcn-style primitives, Zustand
- Backend: FastAPI, Pydantic, SQLAlchemy
- Realtime: WebSocket
- Memory store: short-term SQLite by default, optional cloud Postgres + pgvector for durable memory
- LLM: OpenAI Responses API
- Embeddings: OpenAI embeddings, default `text-embedding-3-small`

## Autonomy Direction

AgentCity uses a Hermes-inspired loop: citizens collect observations, retrieve memories, reason selectively, form plans, talk to nearby citizens, and write new memories back into the city. The linked Hermes Agent project is a useful reference for self-improving agents with persistent memory, skill learning, cross-session recall, scheduled automations, and subagents. AgentCity applies those ideas inside a game simulation rather than embedding Hermes as a runtime dependency.

Manual Mode is the easiest way to follow the game: the city waits, the player assigns one student task, the task runs, conversations/memories are written, and the city pauses when the task completes. Autonomous Mode starts the living-city loop: students follow routines, meet naturally, LLM cognition can generate conversations, and relationships shift from strangers to acquaintances to friends over time.

## Local Setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Optional: create a cloud Postgres database.

The default `MEMORY_STORAGE=short_term` uses a temporary SQLite database so the game runs without Neon. For durable memory later, set `MEMORY_STORAGE=postgres` and provide `DATABASE_URL` or `NEON_DATABASE_URL`. See [docs/cloud-database.md](docs/cloud-database.md).

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

AgentCity does not require Neon for V1. By default it uses short-term SQLite memory in `/tmp`, which is enough for playable sessions and avoids hosted database quota failures.

For durable memory, set `MEMORY_STORAGE=postgres` and provide Supabase, Neon, or another hosted Postgres URL through `DATABASE_URL`. In Postgres mode, startup enables pgvector with `CREATE EXTENSION IF NOT EXISTS vector`, creates the SQLAlchemy tables, and seeds Navora if empty. Redis remains optional future infrastructure and is not required for V1 gameplay.

## Core Gameplay

- Watch five student agents move across a 40x40 top-down city map.
- Tap or click any student to see thoughts, memory, relationships, mood, needs, money, schedule, and goals.
- Use Manual Mode to assign a focused task to any student, choose a conversation target, and watch the task close when complete.
- Use Autonomous Mode to trigger city events such as flu outbreak, traffic accident, food shortage, school exam, festival, bank policy change, and power outage.
- Change mayor policies for tax, hospitals, school funding, roads, farming subsidies, and public health in Autonomous Mode.
- Observe WebSocket-streamed thoughts, conversations, memories, reflections, and city metrics.
- Play from desktop or mobile; the UI stacks the city map, citizen panel, roster, and story feed on smaller screens.

## How To Play

1. Start in `Manual`.
2. Tap Ava, Mateo, Noah, Iris, or Leo on the map to follow one student.
3. Use `Give [name] a task`, choose a conversation target, and click `Assign Task`.
4. Open `Talk` to read the latest conversation as a transcript.
5. Let the task finish automatically, or use `Pause` / `Close Task`.
6. Switch to `Auto` when you want the students to move, meet, talk, and react without direct player instructions.

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
