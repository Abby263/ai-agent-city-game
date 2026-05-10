# AgentCity Setup

This guide sets up AgentCity with browser short-term session memory by default, a FastAPI backend, and a Next.js + Phaser frontend.

## Prerequisites

- Node.js 20+; Node 24 works.
- npm 10+.
- Python 3.11+.
- `uv` for Python dependency management.
- Optional: a hosted Postgres database if you want durable memory. Short-term memory works without Neon or Supabase.
- An OpenAI API key for real citizen cognition.

## Environment Files

AgentCity uses two env files:

- Root `.env` for the FastAPI backend.
- `frontend/.env.local` for the Next.js frontend.

Create them from the example:

```bash
cp .env.example .env
cat > frontend/.env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/city
EOF
```

## Backend Environment Variables

Set these in the root `.env`.

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `MEMORY_STORAGE` | Optional | `short_term` | Default backend seed/cognition mode. Does not require Neon. Set `postgres` only when you want durable cloud memory. |
| `DATABASE_FALLBACK_URL` | Optional | `sqlite+pysqlite:////tmp/agentcity-short-term.db` | Backend fallback seed database URL. Vercel gameplay state is browser-session based, not dependent on this for task progress. |
| `DATABASE_URL` | Only for `MEMORY_STORAGE=postgres` | `postgresql+psycopg://...` | Preferred durable database URL. Neon or Supabase can be used later. |
| `SUPABASE_DATABASE_URL` | Optional | `postgresql+psycopg://postgres.PROJECT_REF:...@aws-0-REGION.pooler.supabase.com:5432/postgres` | Used in Postgres mode if `DATABASE_URL` is empty. |
| `NEON_DATABASE_URL` | Optional | `postgresql+psycopg://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require` | Used in Postgres mode if `DATABASE_URL` and `SUPABASE_DATABASE_URL` are empty. |
| `ALLOW_EPHEMERAL_DB_FALLBACK` | Optional | `true` | In Postgres mode, lets the API fall back to short-term memory if hosted Postgres is unreachable. |
| `LLM_MODE` | Yes | `real` | Intelligent gameplay requires OpenAI cognition. |
| `OPENAI_API_KEY` | Yes | `sk-...` | Required for citizen planning, conversations, thoughts, and memory formation. |
| `OPENAI_MODEL` | Yes | `gpt-4.1-nano` | Citizen cognition model. |
| `OPENAI_EMBEDDING_MODEL` | Yes | `text-embedding-3-small` | Memory embedding model. |
| `MAX_LLM_CALLS_PER_TICK` | Yes | `2` | Caps citizen cognition calls per simulation tick. Movement and basic needs do not call the LLM. |
| `MAX_CONVERSATIONS_PER_TICK` | Yes | `1` | Caps conversations created per tick. |
| `LLM_COGNITION_INTERVAL_TICKS` | Yes | `4` | Runs LLM cognition every N ticks unless a high-priority in-tick event needs it. |
| `TICK_MINUTES` | Yes | `15` | In-game minutes per tick. |
| `ACTIVE_CITIZEN_IDS` | Yes | `profile` | Uses citizens marked `active: true` in `backend/app/citizens/profiles/*.yaml`. Use `all` to activate the full city, or a comma-separated list for a custom cast. |
| `CORS_ORIGINS` | Yes | `http://localhost:3000` | Comma-separated frontend origins. |

Redis is not required for V1 gameplay.

## Short-Term Browser Memory

In the default web game mode, the browser stores the active city session in `localStorage`.

This means:

- Vercel does not need Neon, Supabase, Redis, or a durable local database for the MVP.
- Assign task, tick, conversation, relationship, and memory state stay consistent in one browser session.
- Reloading the same browser keeps the current short-term city state.
- Opening the game in a different browser/device starts a separate short-term session.
- Redeploying or clearing browser storage starts a fresh city.

The backend still provides the initial seeded city and optional OpenAI cognition through `/api/cognition/session`.

Memory is isolated per citizen in browser mode. The browser stores each citizen's
short-term memories under `agentcity.v9.memory.<citizen_id>`, and the backend
conversation workflow only passes a citizen the memories for the current speaking
agent. Spoken transcript lines are public; private memory is not.

Frontend env:

| Variable | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_MEMORY_MODE` | `browser` | Default. Uses browser session memory. |
| `NEXT_PUBLIC_MEMORY_MODE` | `server` | Only use when a durable Postgres backend should own all game state. |

## Optional Supabase/Neon Setup

Skip this section for the default short-term memory mode.

1. Create a Supabase or Neon project.
2. In the Supabase dashboard, open **Connect**.
3. Copy a Postgres connection string.
4. For a persistent local FastAPI server:
   - Use **Direct connection** if your network supports IPv6.
   - Otherwise use **Session pooler**, which works over IPv4.
5. Put the URL in `.env`:

```bash
DATABASE_URL=postgresql+psycopg://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
MEMORY_STORAGE=postgres
```

The backend automatically:

- Adds `sslmode=require` for Supabase hosts if missing.
- Runs `CREATE EXTENSION IF NOT EXISTS vector`.
- Creates all AgentCity tables.
- Seeds Navora if the database is empty.

If you use Supabase transaction pooler on port `6543`, the app automatically disables psycopg prepared statements.

## Neon Setup

1. Create a Neon project.
2. Copy the pooled or direct Postgres connection string.
3. Put it in `.env`:

```bash
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require
```

The backend handles table creation and city seeding on startup.

## OpenAI Setup

For real intelligent citizens:

```bash
LLM_MODE=real
OPENAI_API_KEY=sk-your-key
OPENAI_MODEL=gpt-4.1-nano
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
MAX_LLM_CALLS_PER_TICK=2
MAX_CONVERSATIONS_PER_TICK=1
LLM_COGNITION_INTERVAL_TICKS=4
ACTIVE_CITIZEN_IDS=profile
```

`ACTIVE_CITIZEN_IDS=profile` is recommended. It keeps the active cast controlled from the citizen YAML files.

Without `OPENAI_API_KEY`, citizen tasks are visibly blocked instead of using fake template cognition.

## Vercel Setup

The production app is intended to run at:

```text
https://ai-agent-city-game.vercel.app
```

The repo uses Vercel Services in `vercel.json`:

- `frontend/` is mounted at `/`.
- `backend/main.py` is mounted at `/api`.

Connect the Vercel project to the GitHub repo. With Vercel Git integration enabled, every merge to `main` creates a new production deployment and every pull request gets a preview deployment.

Set these Vercel environment variables for Production, Preview, and Development:

| Variable | Value |
| --- | --- |
| `MEMORY_STORAGE` | `short_term` |
| `LLM_MODE` | `real` |
| `OPENAI_API_KEY` | Your OpenAI API key. Required for intelligent gameplay. |
| `OPENAI_MODEL` | `gpt-4.1-nano` |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` |
| `MAX_LLM_CALLS_PER_TICK` | `2` |
| `MAX_CONVERSATIONS_PER_TICK` | `1` |
| `LLM_COGNITION_INTERVAL_TICKS` | `4` |
| `TICK_MINUTES` | `15` |
| `ACTIVE_CITIZEN_IDS` | `profile` |
| `CORS_ORIGINS` | `https://ai-agent-city-game.vercel.app` |
| `NEXT_PUBLIC_API_URL` | `/api` |
| `NEXT_PUBLIC_MEMORY_MODE` | `browser` |
| `DATABASE_FALLBACK_URL` | `sqlite+pysqlite:////tmp/agentcity-short-term.db` |

Optional only if you deploy the API separately:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_WS_URL` | `wss://YOUR_API_DOMAIN/ws/city` |

When frontend and backend are deployed together through Vercel Services, leave `NEXT_PUBLIC_WS_URL` unset. The frontend derives the WebSocket URL from `NEXT_PUBLIC_API_URL`.

Using the Vercel CLI:

```bash
npx vercel link --yes --project ai-agent-city-game
npx vercel env add MEMORY_STORAGE production
npx vercel env add DATABASE_FALLBACK_URL production
npx vercel env add OPENAI_API_KEY production
npx vercel env add LLM_MODE production
npx vercel env add OPENAI_MODEL production
npx vercel env add OPENAI_EMBEDDING_MODEL production
npx vercel env add MAX_LLM_CALLS_PER_TICK production
npx vercel env add MAX_CONVERSATIONS_PER_TICK production
npx vercel env add LLM_COGNITION_INTERVAL_TICKS production
npx vercel env add ACTIVE_CITIZEN_IDS production
npx vercel env add NEXT_PUBLIC_API_URL production
npx vercel env add NEXT_PUBLIC_MEMORY_MODE production
npx vercel --prod
```

Repeat env additions for `preview` and `development`, or set them in the Vercel dashboard for all environments.

Important: if `LLM_MODE=real` but `OPENAI_API_KEY` is missing, cognition endpoints return unavailable and tasks are blocked. The app no longer fabricates template conversations.

## Install Dependencies

Backend:

```bash
cd backend
uv venv
uv pip install -e ".[dev]"
```

Frontend:

```bash
cd frontend
npm install
```

## Run the App

Terminal 1, backend:

```bash
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Terminal 2, frontend:

```bash
cd frontend
npm run dev
```

Open:

```text
http://localhost:3000
```

## How To Play After It Opens

1. Start in `Manual`. Manual mode keeps the city quiet until you assign a task.
2. Start with the default five-student cast: Ava, Mateo, Noah, Iris, and Leo. The older full-city citizens remain in the database/code but are inactive unless `ACTIVE_CITIZEN_IDS` changes.
3. Tap or click a student on the map or in the roster.
4. Use `Give [name] a task`, type a natural-language task, and click `Assign Task`. The citizen decides who to approach and where to go.
5. Open `Talk` to follow the latest conversation transcript, relationship stage, task context, and recent city moments.
6. Let the task finish automatically, click `Pause`, or use `Close Task` in the student profile.
7. Switch to `Auto` when you want students to move, meet, talk, remember, and react autonomously.
8. In `Auto`, use `Make Something Happen` to trigger an event, then open `Talk` when you want the feed.
9. Use the right panel tabs:
   - `Life`: current task, needs, money, goals, and schedule.
   - `Memory`: durable memories and personal summary.
   - `Talk`: recent conversations, relationship stage, trust, warmth, and familiarity.

## Verify Setup

Backend health check:

```bash
curl -sS http://127.0.0.1:8000/city/state
```

Backend tests:

```bash
cd backend
uv run pytest
```

Frontend checks:

```bash
cd frontend
npm run typecheck
npm run lint
npm run build
```

## Reset the City

For the default browser short-term mode, reset the city by clearing site data for `ai-agent-city-game.vercel.app` or localhost in your browser. That removes the localStorage play session and the next reload starts from the seeded city again.

If you are using durable Postgres mode, AgentCity seeds Navora only when the database is empty. To reset a cloud database during development, drop the app tables and restart the backend.

Use this only on a development database:

```sql
drop table if exists mayor_policies cascade;
drop table if exists daily_plans cascade;
drop table if exists reflections cascade;
drop table if exists conversations cascade;
drop table if exists relationships cascade;
drop table if exists memories cascade;
drop table if exists city_events cascade;
drop table if exists citizens cascade;
drop table if exists locations cascade;
drop table if exists simulation_states cascade;
```

Then restart:

```bash
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Optional Temporary SQLite Demo

For a backend-only offline smoke test:

```bash
cd backend
DATABASE_URL=sqlite:///./agentcity-dev.db LLM_MODE=real OPENAI_API_KEY=sk-your-key uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

This is not durable and does not provide pgvector semantic retrieval. The playable Vercel MVP uses browser short-term session memory instead.

## Troubleshooting

### Backend says a database URL is required

This only applies when `MEMORY_STORAGE=postgres`. Either set `MEMORY_STORAGE=short_term`, or provide one of:

- `DATABASE_URL`
- `SUPABASE_DATABASE_URL`
- `NEON_DATABASE_URL`

### Supabase connection fails locally

Use the Supabase **Session pooler** URL instead of the direct URL if your local network does not support IPv6.

### pgvector errors

Confirm your database supports the `vector` extension. Supabase and Neon support pgvector. The backend runs:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Frontend cannot connect

Check `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/city
```

Restart `npm run dev` after changing frontend env vars.

### Real LLM mode is not generating real thoughts

Check:

```bash
LLM_MODE=real
OPENAI_API_KEY=sk-your-key
```

Then restart the backend.
