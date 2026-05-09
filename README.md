# AgentCity

AgentCity is a playable 2D AI city simulation where every citizen is an autonomous agent with a profession, daily routine, needs, money, relationships, memory, and goals.

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

Auto Mode in the UI starts the city and keeps ticks flowing from the browser. As citizens cross paths, the backend creates social opportunities, LLM cognition can generate conversations, and relationships shift from strangers to acquaintances to friends over time.

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

`LLM_MODE=real` requires `OPENAI_API_KEY` and uses the OpenAI Responses API for citizen thoughts, conversations, plans, reflections, and mayor summaries. Movement, schedules, needs, salary, inventory, and pathing stay deterministic so the game remains responsive and affordable.

## Database

AgentCity no longer depends on a local Postgres/Redis stack for normal development. The backend accepts Supabase, Neon, or any hosted Postgres URL through `DATABASE_URL`.

On startup the backend enables pgvector with `CREATE EXTENSION IF NOT EXISTS vector`, creates the SQLAlchemy tables, and seeds Navora if empty. Redis remains optional future infrastructure and is not required for V1 gameplay.

## Core Gameplay

- Watch citizens move across a 40x40 top-down city map.
- Inspect any citizen to see thoughts, memory, relationships, mood, needs, money, schedule, and goals.
- Trigger city events such as flu outbreak, traffic accident, food shortage, school exam, festival, bank policy change, and power outage.
- Change mayor policies for tax, hospitals, school funding, roads, farming subsidies, and public health.
- Observe WebSocket-streamed thoughts, conversations, memories, reflections, and city metrics.

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
