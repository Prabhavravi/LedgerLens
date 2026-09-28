# Deployment

## Services

- **Next.js:** frontend pages, server-side session bridge, and `/backend-api/*` rewrite. Deploy on Vercel or using the root Dockerfile.
- **FastAPI:** all application API endpoints under `/api/v1`, including authentication, financial services, and AI. Deploy using `backend/Dockerfile` with `backend` as the build context.
- **Supabase:** PostgreSQL storage. This application uses its own opaque sessions, not Supabase Auth.

## Database release

For a new Supabase project, apply these files as the database owner:

1. `backend/migrations/001_initial_schema.sql` creates the original schema and category seeds. It expects Supabase's `auth.uid()` function.
2. `backend/migrations/002_authenticated_rls.sql` replaces the policies with the current session-based identity. Replace `REPLACE_BEFORE_RUNNING` with a strong generated password before execution.

Set FastAPI's database URL to the resulting `app_backend` login role, with TLS. The role must retain `NOBYPASSRLS`; do not connect financial application queries as a superuser. Migration 002 references Supabase's `anon` and `authenticated` roles, so adapt the SQL deliberately before using plain PostgreSQL.

For an existing database with both migrations already applied, the repository cleanup requires no database migration. Migration 001 is a relocation of the original base schema, not a new schema change. Never rerun it against an existing database. Startup does not execute SQL migrations automatically.

## FastAPI environment

Use `backend/.env.example` as the local template. Configure hosted secrets through the backend host:

```text
DATABASE_URL=<app_backend TLS connection URL>
APP_SECRET=<strong random secret>
NODE_ENV=production
AI_PROVIDER=openai
OPENAI_API_KEY=<provider key>
AI_MODEL_NAME=<supported model for the selected provider>
CORS_ORIGINS=["https://YOUR-FRONTEND-DOMAIN"]
```

For Anthropic, select `AI_PROVIDER=anthropic`, set `ANTHROPIC_API_KEY`, and choose a matching model. The limited deterministic assistant is enabled only by explicitly choosing `AI_PROVIDER=local`; a missing hosted-provider key does not trigger a fallback.

Keep database credentials, AI keys, session tokens, and password hashes out of frontend configuration. Runtime Python dependencies live in `requirements.txt`; test tooling lives in `requirements-dev.txt` and is not installed by the backend Dockerfile.

## Next.js environment

Use the root `.env.example` as the template:

```text
BACKEND_PUBLIC_URL=https://YOUR-FASTAPI-DOMAIN/api/v1
BACKEND_INTERNAL_URL=https://YOUR-FASTAPI-DOMAIN/api/v1
```

`BACKEND_PUBLIC_URL` supplies the Next.js rewrite destination; the browser still calls `/backend-api/*` on the frontend origin. `BACKEND_INTERNAL_URL` is used by the server-side session check. Both must point to the same application backend and include `/api/v1` without a trailing slash.

Next.js records rewrites during its production build. Configure `BACKEND_PUBLIC_URL` before building; rebuild after changing it. For the root Dockerfile, pass `--build-arg BACKEND_PUBLIC_URL=https://YOUR-FASTAPI-DOMAIN/api/v1` and set `BACKEND_INTERNAL_URL` in the running container. Do not put a database URL in the Next.js host.

## Release checks

Run `pnpm check` and, with the backend Python environment active, `pnpm test:backend`. CI runs the same categories of checks. Tests use in-memory backend dependencies and do not certify live database policies or AI provider integration.

After deployment, check `/backend-api/health` through the frontend and `/api/v1/health` on FastAPI. Use two accounts to verify signup/login, transaction editing, budgets, dashboard, insights, goals, assistant reads, confirmed assistant writes, logout, and cross-user record access. Verify HTTPS cookies and session validation through the Next.js proxy.

Application clients must use `/backend-api/*` through Next.js or `/api/v1/*` directly on FastAPI. The old Next.js `/api/*` implementation and FastAPI's unversioned `/api/*` alias have been removed.
