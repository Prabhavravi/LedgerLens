# LedgerLens — AI-Powered Expense Tracker

> Production note: the active application path is **Next.js UI → FastAPI → PostgreSQL/Supabase**. Legacy Next.js API routes are retained only as migration rollback artifacts and must not be deployed as an application backend.

## Overview

This is the security-first foundation for a multi-tenant personal-finance application. It intentionally supplies boundaries and contracts, rather than prematurely implementing the product’s transaction, budget, dashboard, or chat UI.

## Stack

Next.js 14 App Router, React, TypeScript, Tailwind CSS, PostgreSQL/Supabase-compatible RLS, FastAPI, Pydantic, asyncpg, pytest, Docker, and a Python AI tool layer.

## Runtime architecture

The Next.js application is the frontend. Its browser requests use the same-origin `/backend-api/*` path, which Next rewrites to FastAPI at `/api/v1/*`; this preserves secure `HttpOnly` cookies without exposing a browser-accessible API secret. FastAPI is the canonical backend for authentication, validation, business rules, analytics, insights, and AI tools. The legacy Next API/server layer remains in the repository temporarily for rollback only and must not receive new business logic.

For local development, start FastAPI from `backend` with `uvicorn app.main:app --reload --port 8000`, then start Next.js normally. Configure `BACKEND_PUBLIC_URL` and `BACKEND_INTERNAL_URL` as shown in `.env.example`.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). UI routes live in `src/app`; server-only code lives in `src/server`; domain/API/AI contracts live in `src/types`.

## Local setup

1. Copy `.env.example` to `.env.local` and set real server secrets.
2. Install packages with `npm install`.
3. Run `npm run dev`; visit `/api/health`.
4. Run `npm run typecheck`, `npm run lint`, and `npm test`.

## Environment variables

`DATABASE_URL`, `APP_SECRET`, and AI keys are server-only; they must never have the `NEXT_PUBLIC_` prefix or be imported by browser components. Only non-secret app metadata may use `NEXT_PUBLIC_`.

## Database

`src/server/db/schema.sql` defines tenant-owned transactions and budgets with PostgreSQL RLS. Application repositories must receive their `userId` from `requireAuthenticatedUser`, and database adapters must establish the matching RLS identity.

## Authentication

Email/password authentication stores an adaptive `scrypt` password hash, never the password. Login and signup issue an opaque random session token; only its SHA-256 hash is stored in PostgreSQL. The plaintext token exists solely in an `HttpOnly`, `SameSite=Lax` cookie (also `Secure` in production). `getAuthenticatedUser()` looks up and validates the session on the server, including expiry and logout revocation. Protected route groups redirect unauthenticated visitors to `/login`.

## Transactions and categories

`/api/transactions` supports authenticated create/list operations; `/api/transactions/:id` supports authenticated update/delete. `TransactionService` gets the identity from `requireAuthenticatedUser()` and validates that a category is global or owned by that user and has the matching income/expense type. SQL reads, updates, and deletes include both the record ID and authenticated user ID. Global categories are seeded by the schema; users may create and manage only their private categories through `/api/categories`.

## Budget service interface

`BudgetService` owns all budget calculations. `listStatusesForCurrentUser(month)` returns a `BudgetStatus` for each current-user budget. Server-only callers such as future analytics and AI tools may use `getBudgetStatus(authenticatedUser, categoryId, month)`. A status includes `budget`, `category`, `spentCents`, `remainingCents`, `percentageUsed`, and `exceeded`; UI code consumes this result rather than reimplementing the calculation.

## Analytics service interface

`AnalyticsService` is the deterministic source for dashboard numbers. `getFinancialSummary(user, period)`, `getCategoryBreakdown(user, period)`, `getSpendingTrends(user, period)`, `getBudgetOverview(user, period)`, and `getDashboardForCurrentUser(period)` return typed, authenticated-user-scoped data. Savings are `income - expenses`; savings rate is `savings / income × 100` (or `null` with no income); category share is `category expense / total expenses × 100`; month-over-month change compares the current and preceding calendar month. The React dashboard only renders these outputs.

## Deterministic insights

`InsightService` analyzes authenticated analytics data; it is not an LLM. Defaults are configurable in `DEFAULT_INSIGHT_THRESHOLDS`: category surge ≥25%, overall month-over-month movement ≥25%, and budget-approaching ≥80%. It emits category surges only when both periods have non-zero spending, budget overruns/near-limits from `BudgetService`, and overall spending changes only with a non-zero prior-period baseline. For a category surge, the savings opportunity uses an explicit 20% reduction of current spending as an illustrative target—not an optimal recommendation. Each `FinancialInsight` contains the rule evidence, amounts, severity, explanation, recommendation, and supporting figures.

## Financial goals and monthly action plans

Goals are private, tenant-owned records with a name, target amount, current saved amount, target date, and optional description. The deterministic `GoalService` owns goal status and action-plan calculations; its action-plan entry point derives the authenticated user internally and never accepts a caller-supplied user ID. The dashboard and `/goals` page render its typed results, while the assistant accesses them through `get_my_financial_goals` and `get_my_goal_action_plan`.

Formulas are explicit: `remaining = max(0, target − saved)`; `progress = min(100, saved / target × 100)`; `remaining months` counts the current target month inclusively and is zero after the deadline; and `required average monthly saving = ceil(remaining / remaining months)` (the full remaining amount when due this month). Current monthly net savings is `income − expenses`; a plan is on track when it meets or exceeds the required monthly saving, otherwise its savings gap is `required − current net savings`. Adjustment opportunities are grounded in this month's category totals and show an illustrative 20% reduction for the top three spending categories. They are suggestions, not guarantees or mathematically optimal advice.

## AI tool boundary

The authenticated `POST /api/ai/tools` endpoint calls `AuthenticatedToolOrchestrator`, then the centralized `ToolRegistry`, then existing services. The LLM receives only metadata and JSON schemas for these allow-listed tools: `get_my_transactions`, `get_my_financial_summary`, `get_my_category_spending`, `get_my_spending_trends`, `get_my_budget_status`, `create_my_transaction`, `update_my_transaction`, and `create_or_update_my_budget`. None accepts `userId` or `user_id`; the registry rejects either key recursively and injects `requireAuthenticatedUser()`’s server-verified identity. Tools have no SQL or database credential access, and logs include only tool name, verified user ID, duration, outcome, error code, and input keys.

Example: `get_my_transactions({ startDate: "2026-09-01", endDate: "2026-09-30", type: "expense", limit: 20 })`; `create_or_update_my_budget({ categoryId: "<uuid>", amount: 10000, month: "2026-09" })`. Amounts are decimal currency units at the tool boundary and become integer cents in the business services.

## Financial assistant and confirmed actions

The version-controlled `FINANCIAL_ASSISTANT_SYSTEM_PROMPT` requires grounded data, explicit calculations, factual/recommendation separation, and resistance to prompt injection. `/api/ai/assistant` authenticates the request then invokes `FinancialAssistantOrchestrator`. It supplies only approved tool metadata to the provider, executes model-selected read tools with the verified user context, returns their structured results to the provider, and stops after five tool rounds.

Write tools (`create_my_transaction`, `update_my_transaction`, and `create_or_update_my_budget`) never run through the conversation endpoint. They produce a pending action card instead. Only the user's **Confirm Action** click calls `POST /api/ai/assistant/action`; that route re-authenticates the session, allow-lists the tool, validates its Zod input, then executes the existing service in the server-derived user context. The UI removes a completed proposal and refreshes server-rendered financial data. Every tool execution produces a safe server audit event containing the verified user ID, action type, timestamp, tool name, input field names, outcome, error code where applicable, and duration—never raw records, tokens, or secrets. With `AI_PROVIDER=openai` and a server-only `OPENAI_API_KEY`, the provider uses the Responses API custom-function pattern; without a key, a deterministic local provider supports limited local demonstration.

## AI

The model can receive only registered tool metadata. It does not receive SQL, database credentials, or a user ID. `ToolRegistry` rejects model-supplied `userId`/`user_id` and injects the verified server context during execution.
