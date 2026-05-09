# Cloud Database Setup

AgentCity is cloud-Postgres-first. Use Neon or Supabase instead of a local Postgres/Redis stack.

## Neon

Use the Neon pooled or direct Postgres connection string:

```bash
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require
```

The backend creates the pgvector extension and AgentCity tables on startup.

## Supabase

1. Create a Supabase project.
2. In the project dashboard, open **Connect** and copy a Postgres connection string.
3. For a long-running FastAPI server, use Direct connection if IPv6 is available, otherwise use Supavisor **Session pooler**.
4. Put the URL in `.env`:

```bash
DATABASE_URL=postgresql+psycopg://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

5. Start the backend:

```bash
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend runs `CREATE EXTENSION IF NOT EXISTS vector` and creates the AgentCity tables on startup.

## Notes

- `postgres://` and `postgresql://` URLs are normalized to `postgresql+psycopg://`.
- `sslmode=require` is added automatically for Supabase and Neon hosts if it is missing.
- Supabase transaction pooler URLs on port `6543` disable psycopg prepared statements automatically because transaction pooling does not support them.
- Redis is not required for V1; FastAPI WebSockets stream game updates directly.
