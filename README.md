# LedgerLens

LedgerLens is a personal finance application for recording income and expenses, setting category budgets, tracking savings goals, and asking an AI assistant about your financial records.

## Current architecture

```text
Browser (React)
  → Next.js /backend-api/* proxy
  → FastAPI /api/v1/*
  → authentication + Pydantic validation
  → Python services
  → repositories + transaction-local tenant context
  → PostgreSQL / Supabase
```

Next.js owns pages, components, and a server-side session check. FastAPI owns authentication, financial business rules, database access, and AI tools. There is no Next.js application API or TypeScript financial backend.

## Project map

```text
src/
  app/                  Next.js pages, layouts, styles, loading/error screens
  components/           Interactive feature workspaces and shared UI
  lib/backend/          Server-only FastAPI session integration
  types/                Frontend data contracts matching FastAPI JSON
backend/
  app/
    api/                HTTP routes and request-scoped dependency construction
    schemas/            Pydantic input validation and output models
    services/           Authentication, business rules, financial calculations
    repositories/       Parameterized SQL and record mapping
    db/                 Connection pool and tenant database wrapper
    ai/                 Model adapters, prompts, orchestration, approved tools
    main.py             FastAPI application startup and route registration
    config.py           Backend environment settings
    exceptions.py       Consistent API error responses
  migrations/           Ordered SQL setup and tenant-isolation migration
  tests/                Backend unit, API, security, and resilience tests
  requirements.txt      Runtime Python dependencies
  requirements-dev.txt  Runtime dependencies plus pytest tooling
test/                   Frontend session/proxy tests and test-only mocks
docs/                   Architecture and deployment instructions
.github/workflows/      Frontend and backend CI checks
```

## Local setup

Prerequisites: Node.js 20.19+ (a supported LTS version), pnpm 11.19.0, Python 3.12+, and a PostgreSQL database. The supplied initial SQL targets Supabase; see the database instructions below.

From the repository root:

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r backend/requirements-dev.txt
cp backend/.env.example backend/.env
```

On Windows, activate the virtual environment with `backend\.venv\Scripts\Activate.ps1` in PowerShell.

Fill in `backend/.env` with the database connection details. Database credentials and AI keys belong only in the backend environment. The root `.env.local` contains the two backend URLs used by Next.js.

Start the backend in the terminal with the Python environment activated:

```sh
pnpm dev:backend
```

In a second terminal, start Next.js:

```sh
pnpm dev
```

Open `http://localhost:3000`. FastAPI's health endpoint is `http://127.0.0.1:8000/api/v1/health`; the same endpoint through Next.js is `http://localhost:3000/backend-api/health`. FastAPI exposes interactive API documentation at `http://127.0.0.1:8000/docs`.

## Database setup

For a new Supabase database, run these SQL files in order using the SQL editor as the database owner:

1. `backend/migrations/001_initial_schema.sql` creates the tables and shared categories. It retains the original Supabase `auth.uid()` policies as the historical base migration.
2. `backend/migrations/002_authenticated_rls.sql` replaces those policies with the application-session tenant context and creates the restricted `app_backend` role. Replace `REPLACE_BEFORE_RUNNING` with a strong password before executing this file.

Use the resulting `app_backend` connection string in FastAPI's `DATABASE_URL`. An existing database that has already received both migrations needs no SQL changes for this folder cleanup. Do not rerun migration 001 on an existing database. These SQL files are applied manually; app startup does not run migrations.

The base migration expects Supabase's `auth.uid()` function, and migration 002 references Supabase roles. These files are not a turnkey bootstrap for a plain local PostgreSQL installation.

## Features and data flow

- **Accounts:** email/password authentication with scrypt password hashes and opaque session tokens. PostgreSQL stores only token hashes; the browser receives an HttpOnly session cookie.
- **Transactions:** create, list, filter, edit, and delete income or expenses. Categories must be shared or belong to the current user and match the transaction type.
- **Budgets:** one budget per user/category/month, with spent amount, remaining amount, percentage used, and threshold status calculated by the backend.
- **Dashboard:** income, expenses, net savings, category spending, monthly trends, large expenses, and budgets. The UI also requests insights and goals.
- **Insights:** deterministic rules for category increases, budget limits, monthly changes, and illustrative savings opportunities.
- **Goals:** saved amount, target, deadline, contributions, and deterministic action plans based on current monthly savings. Contributions update goal progress; they do not create financial transactions.
- **Assistant:** approved tools reuse the same Python services as the forms. Read tools execute during conversation; writes produce a confirmation card and execute through a separate authenticated action endpoint.

Money is stored as integer minor units. Fields are named `amountCents`, but the current UI displays rupees, so these represent paise. UI forms and AI tools convert currency amounts to minor units before calling financial services.

## AI configuration

Set `AI_PROVIDER=local` explicitly to use the limited, deterministic development assistant without external API calls. There is no automatic fallback when a provider key is missing.

For OpenAI, set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `AI_MODEL_NAME`. For Anthropic, set `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, and a matching `AI_MODEL_NAME`. Provider settings are backend-only.

The assistant has twelve approved tools: seven reads and five writes. The tool registry validates inputs and rejects model-supplied `userId` or `user_id` fields recursively. It receives the authenticated identity from FastAPI. Conversation history is held in browser component state; it is not persisted in the database.

## Checks

```sh
pnpm check            # TypeScript, ESLint, frontend tests, production build
pnpm test:backend     # Run with the Python virtual environment activated
```

Frontend tests exercise cookie forwarding, session failure behavior, and proxy routing. Python tests cover API behavior, validation, business calculations, authentication, tenant isolation, and AI tool boundaries using in-memory dependencies. These tests do not replace verification against a real database or live model provider. CI runs both suites and the frontend build.

See [Architecture](docs/ARCHITECTURE.md) for the code boundaries and [Deployment](docs/DEPLOYMENT.md) for hosting and release verification.
