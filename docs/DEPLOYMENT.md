# Production deployment

## Topology

- **Vercel:** Next.js frontend, served over HTTPS.
- **Render or Railway:** FastAPI Docker service, served over HTTPS.
- **Supabase:** PostgreSQL database only. Browser clients do not receive database credentials or service-role keys.

## Database release

1. Apply the base schema at `src/server/db/schema.sql` to an empty project.
2. In the Supabase SQL editor, copy `backend/migrations/002_authenticated_rls.sql`, replace `REPLACE_BEFORE_RUNNING` with a generated secret, and execute it as the database owner.
3. Use the resulting `app_backend` connection URL only in the FastAPI host. It must use TLS and a role with `NOBYPASSRLS`.
4. Do not place the FastAPI database URL in Vercel.

FastAPI sets `app.current_user_id` with `SET LOCAL` inside every database operation. The policies then enforce that transactions, private categories, budgets, and goals belong to that authenticated user. The setting is transaction-local, preventing identity leakage through Supabase/PgBouncer pooled connections.

## FastAPI host variables

```text
DATABASE_URL=<app_backend TLS connection URL>
APP_SECRET=<random secret of at least 32 characters>
NODE_ENV=production
AI_PROVIDER=openai
OPENAI_API_KEY=<required when AI_PROVIDER=openai; keep server-only>
AI_MODEL_NAME=gpt-4o-mini
CORS_ORIGINS=["https://YOUR-VERCEL-DOMAIN"]
```

`OPENAI_API_KEY`, database passwords, session tokens, and password hashes are server-only. Never use a `NEXT_PUBLIC_` prefix for them.

## Vercel variables

```text
BACKEND_PUBLIC_URL=https://YOUR-FASTAPI-DOMAIN/api/v1
BACKEND_INTERNAL_URL=https://YOUR-FASTAPI-DOMAIN/api/v1
NEXT_PUBLIC_APP_NAME=LedgerLens
NEXT_PUBLIC_APP_URL=https://YOUR-VERCEL-DOMAIN
```

## Release verification

After both services are HTTPS-hosted, use two demo accounts to test signup/login, transaction CRUD, budgets, dashboard, insights, goals, AI read tools, confirmed AI writes, logout, and cross-user record access. Confirm a user cannot read, modify, or receive another demo user's data.

## Known limitations

The local deterministic assistant provides limited formatting. Set a server-only OpenAI key for provider-backed conversational responses. Legacy TypeScript server files remain during migration cleanup and should be removed after the first production rollback window.
