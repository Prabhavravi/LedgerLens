# Architecture

## Layers

| Layer | Responsibility |
| --- | --- |
| `src/app`, `src/components` | Presentation and route handlers only; no business logic or secrets. |
| `src/server/auth` | Verifies the request session and returns the authenticated user. |
| `src/server/validation` | Zod request/tool input schemas. |
| `src/server/services` | Business rules, called with server-derived user context. |
| `src/server/db` | Repository interfaces and PostgreSQL implementation; tenant filtering and RLS. |
| `src/server/ai` | Provider orchestration and allow-listed tool execution. |
| `src/types` | Shared domain, API, and AI contracts. |

## Security and data flow

`Browser → route/server action → requireAuthenticatedUser → validation → service(user.id) → repository(user.id) → PostgreSQL RLS`.

An AI read request follows `Browser → authenticated route → AiOrchestrator → ToolRegistry → service(user.id)`. A proposed AI write follows `Browser → authenticated route → AiOrchestrator → pending action`; it cannot mutate data. The user confirmation then follows `Browser → POST /api/ai/assistant/action → requireAuthenticatedUser → ToolRegistry → service(user.id) → repository(user.id)`. The model can request only registered tools; it receives neither a database connection nor a tenant identifier. Tool arguments containing `userId` or `user_id` fail before validation. Every user-owned SQL query must scope by the verified identity, while RLS provides database-level defense in depth.

Authentication follows `signup/login → scrypt hash verification → random opaque session token → hashed session row + HttpOnly cookie → getAuthenticatedUser() → service(user.id)`. No API accepts a user ID as its authorization authority. Invalid, expired, or revoked sessions resolve to no user; route-group guards redirect them, and API handlers return a safe `UNAUTHORIZED` error. Logout revokes the stored session before clearing the cookie.

## Database

Money uses integer cents. Tenant tables include `user_id`; indexes begin with it. The planned authentication adapter is Supabase Auth or Auth.js. It must set PostgreSQL’s authenticated identity before queries so `auth.uid()` policies are enforced.

## AI

An `LlmProvider` interface keeps vendor SDKs out of services. Providers get structured tool metadata only. Tool implementations must be small adapters around services, use Zod schemas, be allow-listed, and return structured, grounded facts. A bounded, audited tool loop and confirmation policy are required before destructive mutations are added.

## Error handling, tests, and deployment

`AppError` maps expected failures to safe API errors; unexpected errors are logged server-side and return a generic response. Unit tests cover validation, tenancy, tool spoofing, and cents arithmetic; integration tests will cover repository/RLS behavior; Playwright will cover auth and critical money flows. Docker/Vercel deployment reads secrets from the host environment; CI runs lint, typecheck, tests, and production build.
