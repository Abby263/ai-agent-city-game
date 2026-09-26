# AgentCity Setup

This guide sets up AgentCity with browser short-term session memory by default, a FastAPI backend, and a Next.js + Three.js frontend.

The 3D town needs a browser with WebGL 2 and hardware acceleration enabled. Current desktop Chrome, Edge, Firefox, Safari, and modern mobile browsers generally support it; older devices or restricted browser settings may not. No Blender installation, paid assets, additional environment variables, or external model downloads are required for the 3D scene. The existing OpenAI configuration is unchanged. See [3D town controls and rendering](docs/3d-town.md) for controls and performance details.

## Prerequisites

Conversation audio uses the browser's speech synthesis service. No additional
API key, environment variable, server process, or paid TTS provider is needed.
During a conversation, tap the speaker icon to enable voices and adjust the
volume slider. Enable sound again after reloading the page. Install/enable an
English system voice if the browser has no usable voices. Voice quality varies
by device; unsupported or blocked speech falls back to subtitles. Local voices
are preferred, but the browser may offer voices backed by its own online service.
Pausing stops speech; resuming restarts the current line.

- Node.js 20+; Node 24 works.
- npm 10+.
- Python 3.11+.
- `uv` for Python dependency management.
- Optional: a hosted Postgres database if you want durable memory. Short-term memory works without Neon or Supabase.
- A Gemini API key from Google AI Studio, or an OpenAI API key, for real citizen cognition.

## Environment Files

AgentCity uses two env files:

- Root `.env` for the FastAPI backend.
- `frontend/.env.local` for the Next.js frontend.

Create them from the example:

```bash
cp .env.example .env
cat > frontend/.env.local <<'EOF'
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_MEMORY_MODE=browser
EOF
```

The local Next.js development server forwards `/api/*` to FastAPI at `http://127.0.0.1:8000`. This avoids cross-origin/separate-port browser requests, including embedded previews and phones on your local network. If FastAPI uses another address, set `LOCAL_API_ORIGIN` in `frontend/.env.local` and restart Next.js. This variable is server-only and development-only. Production remains a static export with hosting-managed `/api` routing; serving `frontend/out` alone requires a separate API proxy or an explicit `NEXT_PUBLIC_API_URL` at build time.

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
| `LLM_MODE` | Yes | `real` | Intelligent gameplay requires a live LLM provider. |
| `LLM_PROVIDER` | Yes | `gemini` | `gemini` or `openai`. The example env uses Gemini; no automatic fallback. |
| `GEMINI_API_KEY` | For Gemini | Your Google AI Studio key | Backend-only. Never prefix with `NEXT_PUBLIC_`. |
| `GEMINI_MODEL` | For Gemini | `gemini-3.5-flash-lite` | Used for structured planning and Deep Agent dialogue. |
| `OPENAI_API_KEY` | For OpenAI | `sk-...` | Ignored in Gemini mode, including for embeddings. |
| `OPENAI_MODEL` | For OpenAI | `gpt-4.1-nano` | Used when `LLM_PROVIDER=openai`. |
| `OPENAI_EMBEDDING_MODEL` | Optional for OpenAI | `text-embedding-3-small` | Gemini mode currently uses text memory, not vector retrieval. |
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
- Clearing browser storage starts a fresh city. Redeploying does not normally clear an existing local world.

The frontend builds its initial citizens from the YAML profiles. The backend provides required LLM cognition through `/cognition/session` (or `/api/cognition/session` behind the Vercel prefix). Do not set `NEXT_PUBLIC_WS_URL` for browser mode.

### Current Local Playtest

The new game UI and player takeover use `NEXT_PUBLIC_MEMORY_MODE=browser`. No Neon or Redis is required. Set the selected provider's API key only in the backend environment. Never use a `NEXT_PUBLIC_` prefix for any API key.

For a frontend on port 3010, add `http://127.0.0.1:3010,http://localhost:3010` to backend `CORS_ORIGINS`. Run the backend on port 8000 and the frontend with `npm run dev -- --port 3010`. No deployment is required. The existing Vercel deployment is intentionally left paused.

`npm run dev` and `npm run build` generate `frontend/src/lib/generated/citizens.json` from `backend/app/citizens/profiles/*.yaml`. Add a profile or change `active: true`, then restart/rebuild the frontend. Existing saved worlds keep their cast; back up your world before clearing its localStorage to start with the new cast. The browser cast uses YAML `active`; `ACTIVE_CITIZEN_IDS` is a backend-only override.

Verification commands:

```bash
cd frontend
npm test
npm run typecheck
npm run lint
npm run build
cd ../backend
uv run pytest -q
```

Browser mode uses an eight-second normal tick cadence (four seconds at 2x) and at most one cognition candidate per tick. Walking a player-controlled citizen does not call an LLM. Hiding the tab pauses new work. A paused or replaced world revision discards late model results. Provider requests already in flight cannot be unbilled by pausing. The backend `MAX_LLM_CALLS_PER_TICK` settings apply to the server simulation, not as a global API quota. Add authentication and server-side quotas before reopening public hosting.

Memory is isolated per citizen in browser mode. The browser stores each citizen's
short-term memories under `agentcity.v11.memory.<citizen_id>`, and the backend
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
- Seeds Nakameguro if the database is empty.

If you use Supabase transaction pooler on port `6543`, the app automatically disables psycopg prepared statements.

## Neon Setup

1. Create a Neon project.
2. Copy the pooled or direct Postgres connection string.
3. Put it in `.env`:

```bash
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require
```

The backend handles table creation and city seeding on startup.

## Gemini Setup

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Add it to the root `.env` (which is ignored by Git), not to frontend code:

```bash
LLM_MODE=real
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-google-ai-studio-key
GEMINI_MODEL=gemini-3.5-flash-lite
MEMORY_STORAGE=short_term
```

3. Install updated backend dependencies and restart FastAPI. No frontend rebuild is needed when changing the provider or model.
4. Open `/api/health` through the running local frontend to confirm `llm_provider=gemini` and the selected model. `llm_configured` means a key exists, not that Google has validated it. Send a short in-game message to test live access.

The model was verified with real structured planning and a Deep Agent reply. Google rejected the older `gemini-2.5-flash-lite` for this new-user key and recommended `gemini-3.5-flash-lite`; keep the model configurable rather than assuming older models stay available.

Google lists a [free tier for this model](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite), subject to account availability and quota. An API key does not itself guarantee free billing; check your project tier in AI Studio. This app does not enable billing, upgrade your account, or fall back to a paid provider. Rate-limit failures stop the action for a later retry. Deep Agent turns retain the three-model-call cap; a conversation can have several turns, so use Manual mode while evaluating your quota.

Free-tier prompts and responses may be used to improve Google's products under its terms. Keep real personal or sensitive information out of citizen messages. In Gemini mode, private text journals still work; OpenAI embedding calls and pgvector semantic queries are not used. Existing vectors are not reinterpreted as Gemini vectors. Rotate keys exposed in chat or logs and update `.env`.

## OpenAI Setup

For real intelligent citizens:

```bash
LLM_MODE=real
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key
OPENAI_MODEL=gpt-4.1-nano
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
MAX_LLM_CALLS_PER_TICK=2
MAX_CONVERSATIONS_PER_TICK=1
LLM_COGNITION_INTERVAL_TICKS=4
ACTIVE_CITIZEN_IDS=profile
```

`ACTIVE_CITIZEN_IDS=profile` is recommended. It keeps the active cast controlled from the citizen YAML files.

In OpenAI mode, missing `OPENAI_API_KEY` blocks citizen tasks instead of using fake template cognition. In Gemini mode, the required key is `GEMINI_API_KEY`.

## Vercel Setup

### Deploy Without Local Play History

Run `node scripts/stage-deployment.mjs` from the repository root. It creates a
temporary, code-only release folder and prints its full file manifest. Deploy
that folder with `vercel --cwd <printed-directory> --prod --yes`.
The generated citizen roster is rebuilt from source YAML during the build.
The source profiles include fictional starting backgrounds, not learned
conversation history. No local database, browser save, exported world, log,
environment file or unrelated production folder is included. Secrets are
configured separately in Vercel's environment settings, never in uploaded source.

With `NEXT_PUBLIC_MEMORY_MODE=browser`, each origin has its own browser save.
Localhost history is not transferred or synchronized to the hosted domain.
New online conversations are sent to the hosted API and selected LLM provider
as needed to generate replies; browser-local storage does not mean offline AI.
An existing save on the same hosted domain remains there across redeployments.

The production app is intended to run at:

```text
https://ai-agent-city-game.vercel.app
```

The hosted game is static-first to reduce Vercel Fluid Active CPU usage:

- The Next.js game shell is exported as static files.
- Initial city state, movement, short-term memory, relationships, and conversation history run in the browser.
- `/api` is only used for real LLM cognition, such as task planning or an agent conversation.

The repo uses Vercel Services in `vercel.json`:

- `frontend/` is mounted at `/`.
- `backend/main.py` is mounted at `/api` for LLM cognition and optional server mode.

Connect the Vercel project to the GitHub repo. With Vercel Git integration enabled, every merge to `main` creates a new production deployment and every pull request gets a preview deployment.

Set these Vercel environment variables for Production, Preview, and Development:

| Variable | Value |
| --- | --- |
| `MEMORY_STORAGE` | `short_term` |
| `LLM_MODE` | `real` |
| `LLM_PROVIDER` | `gemini` |
| `GEMINI_API_KEY` | Your Google AI Studio key. Backend-only. |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
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
npx vercel env add LLM_PROVIDER production
npx vercel env add GEMINI_API_KEY production
npx vercel env add GEMINI_MODEL production
npx vercel env add LLM_MODE production
npx vercel env add MAX_LLM_CALLS_PER_TICK production
npx vercel env add MAX_CONVERSATIONS_PER_TICK production
npx vercel env add LLM_COGNITION_INTERVAL_TICKS production
npx vercel env add ACTIVE_CITIZEN_IDS production
npx vercel env add NEXT_PUBLIC_API_URL production
npx vercel env add NEXT_PUBLIC_MEMORY_MODE production
npx vercel --prod
```

Repeat env additions for `preview` and `development`, or set them in the Vercel dashboard for all environments.

Important: a missing key for the selected provider makes cognition unavailable and blocks tasks. For OpenAI instead, set `LLM_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL`. Public Vercel hosting remains paused; these instructions do not authorize resuming deployment.

### Avoiding Vercel Free-Tier Pauses

Vercel Hobby includes a limited amount of Fluid Active CPU per month for Functions. This app should not spend Function CPU on normal page loads. Keep these settings in production:

```text
NEXT_PUBLIC_MEMORY_MODE=browser
NEXT_PUBLIC_API_URL=/api
```

Do not turn on server memory mode for the public demo unless you are ready to pay for more Function usage. Server mode sends normal ticks, reads, and memory calls through `/api`; browser mode keeps those in localStorage and calls `/api` only for real AI cognition.

If the quota is already exhausted, the immediate options are:

- wait until the next Vercel billing cycle resets the included usage
- upgrade the Vercel team to Pro or enable paid on-demand usage
- pause public traffic until the next cycle
- temporarily remove the selected provider's key (`GEMINI_API_KEY` or `OPENAI_API_KEY`) to block cognition calls while keeping the static game loadable

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

If you are using durable Postgres mode, AgentCity seeds Nakameguro only when the database is empty. To reset a cloud database during development, drop the app tables and restart the backend.

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
