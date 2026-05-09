# AgentCity Setup

This guide sets up AgentCity with a hosted Postgres database, a FastAPI backend, and a Next.js + Phaser frontend.

## Prerequisites

- Node.js 20+; Node 24 works.
- npm 10+.
- Python 3.10+.
- `uv` for Python dependency management.
- A hosted Postgres database. Neon is the expected deployment database; Supabase also works.
- Optional: an OpenAI API key for real citizen cognition.

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
| `DATABASE_URL` | Yes | `postgresql+psycopg://...` | Preferred single database URL. Neon or Supabase recommended. |
| `SUPABASE_DATABASE_URL` | Optional | `postgresql+psycopg://postgres.PROJECT_REF:...@aws-0-REGION.pooler.supabase.com:5432/postgres` | Used if `DATABASE_URL` is empty. |
| `NEON_DATABASE_URL` | Optional | `postgresql+psycopg://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require` | Used if `DATABASE_URL` and `SUPABASE_DATABASE_URL` are empty. |
| `LLM_MODE` | Yes | `mock` or `real` | Use `mock` without an OpenAI key; use `real` for intelligent citizens. |
| `OPENAI_API_KEY` | Required for real LLM | `sk-...` | Only needed when `LLM_MODE=real`. |
| `OPENAI_MODEL` | Yes | `gpt-4.1-nano` | Citizen cognition model. |
| `OPENAI_EMBEDDING_MODEL` | Yes | `text-embedding-3-small` | Memory embedding model. |
| `MAX_LLM_CALLS_PER_TICK` | Yes | `4` | Caps citizen cognition calls per simulation tick. |
| `MAX_CONVERSATIONS_PER_TICK` | Yes | `2` | Caps conversations created per tick. |
| `TICK_MINUTES` | Yes | `15` | In-game minutes per tick. |
| `CORS_ORIGINS` | Yes | `http://localhost:3000` | Comma-separated frontend origins. |

Redis is not required for V1 gameplay.

## Supabase Setup

1. Create a Supabase project.
2. In the Supabase dashboard, open **Connect**.
3. Copy a Postgres connection string.
4. For a persistent local FastAPI server:
   - Use **Direct connection** if your network supports IPv6.
   - Otherwise use **Session pooler**, which works over IPv4.
5. Put the URL in `.env`:

```bash
DATABASE_URL=postgresql+psycopg://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
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
```

For local development without paid API calls:

```bash
LLM_MODE=mock
OPENAI_API_KEY=
```

Mock mode keeps the game playable but uses deterministic template thoughts instead of real LLM cognition.

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

AgentCity seeds Navora only when the database is empty. To reset a cloud database during development, drop the app tables and restart the backend.

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

The normal setup should use Neon or Supabase. For a quick offline smoke test only:

```bash
cd backend
DATABASE_URL=sqlite:///./agentcity-dev.db LLM_MODE=mock uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

This is not the recommended memory setup because pgvector semantic retrieval requires Postgres.

## Troubleshooting

### Backend says a database URL is required

Set one of:

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
