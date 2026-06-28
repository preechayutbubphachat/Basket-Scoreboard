# Basketball Scoreboard & Tournament Management Web App

Production-grade basketball scoreboard and tournament management web application.

## Architecture Rules

- Match events are the source of truth.
- Use event sourcing and append-only `match_events`.
- Never update or delete historical match events.
- Use projections for UI read models.
- Use compensating events for corrections.
- Use MariaDB + InnoDB for persistence.
- Use polling-first realtime sync.
- Socket.IO is optional and must not become the source of truth.
- Public screens are read-only.
- Commands must be authenticated, authorized, validated, deduplicated, concurrency checked, appended as events, projected, and audited when required.

## Current Scope

The repository currently includes Phase 1 Foundation and the Task 002 MariaDB migration foundation:

- npm workspace monorepo
- TypeScript base config
- Fastify API skeleton
- Vite React web skeleton
- package skeletons for domain, event model, and API contracts
- environment example
- ordered MariaDB migration files for auth, competition, matches, event store, projections, and audit logs
- API health check
- placeholder API test
- migration contract tests

It intentionally does not implement dashboards, Socket.IO, match commands, mutable scoreboard state, or basketball rules in UI.

## Repository Layout

```txt
apps/
  api/
  web/
packages/
  domain/
  event-model/
  api-contracts/
migrations/
tests/
```

## Development

```bash
npm install
npm run dev
npm run dev:web
npm run build
npm run test
npm run test:db
npm run db:check
npm run migrate:status
npm run migrate
```

Migration commands require `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, and `DATABASE_PASSWORD`. They do not run automatically when the API server starts.

## Production Session Auth And RBAC

The API uses server-side session authentication backed by MariaDB. Users log in with email and password, the server stores only SHA-256 hashes of random session and CSRF tokens, and the browser receives an HttpOnly session cookie. Login responses return a CSRF token for private write requests.

Production setup:

```bash
npm run migrate
npm run auth:seed
AUTH_BOOTSTRAP_ENABLED=true ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='replace-with-12-plus-chars' ADMIN_DISPLAY_NAME='Admin' npm run auth:create-admin
```

After creating the admin, remove `AUTH_BOOTSTRAP_ENABLED`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_DISPLAY_NAME` from the server environment. Do not commit those values.

Plesk production environment variables:

- `AUTH_COOKIE_NAME=basket_session`
- `AUTH_SESSION_TTL_MINUTES=480`
- `AUTH_COOKIE_SECURE=true`
- `AUTH_COOKIE_SAME_SITE=Lax`
- `DEV_AUTH_ENABLED=false`
- `AUTH_BOOTSTRAP_ENABLED=false`

Protected browser write requests must send `x-csrf-token`. Public scoreboard reads remain unauthenticated and read-only.

Development and tests can use controlled headers:

- `x-dev-user-role: ADMIN | SCORER | REFEREE | VIEWER`
- `x-dev-user-id: <uuid>`
- `x-dev-match-ids: <comma-separated match IDs>`

Dev auth headers are disabled in production unless `DEV_AUTH_ENABLED=true`. Keep `DEV_AUTH_ENABLED=false` by default and do not enable it on a public server.

The frontend includes a minimal production session auth UI at `/login`. It hydrates the browser session from `GET /api/v1/auth/me`, uses the HttpOnly session cookie with `credentials: include`, and keeps the CSRF token only in memory for private write requests. The browser must not store a raw session token in `localStorage` or `sessionStorage`.

The system is still not full match-day ready until complete match-day operator workflows exist.

## Match Official Assignments

Production SCORER and REFEREE sessions require an active `match_officials` assignment for the match before they can use match-scoped endpoints. Assignment is a scope check, not a permission grant: the user must still have the required role permission from `roles` / `permissions`.

ADMIN users can manage assignments through authenticated API endpoints:

```http
POST /api/v1/matches/:matchId/officials
GET /api/v1/matches/:matchId/officials
DELETE /api/v1/matches/:matchId/officials/:assignmentId
```

Supported assignment role codes are `REFEREE`, `SCORER`, `ASSISTANT_SCORER`, `TIMER`, `SHOT_CLOCK_OPERATOR`, and `MATCH_OPERATOR`. Score operation is allowed only for assigned scorer-style roles when the user also has `match.score.operate`. Viewer users remain read-only even if an assignment row is created accidentally.

`GET /api/v1/auth/me` returns `matchAssignments` for the authenticated user. Assignment changes are recorded in `audit_logs`; they do not append basketball `match_events`.

The frontend admin assignment UI is available at:

```text
/admin/matches
/admin/matches/:matchId/officials
```

Only authenticated ADMIN users should use these screens. `/admin/matches` loads the current MVP match list from `GET /api/v1/admin/matches` and links each match to its officials page. The officials page loads assignments through `GET /api/v1/matches/:matchId/officials`, creates assignments with `POST /api/v1/matches/:matchId/officials`, and revokes assignments with `DELETE /api/v1/matches/:matchId/officials/:assignmentId`. The UI hides admin controls from non-admin users, but the backend remains the authority for authorization and must reject forbidden requests.

## Operator Match Landing

Authenticated scorer/referee/operator users can open:

```text
/operator/matches
```

This page calls `GET /api/v1/operator/matches`. ADMIN users may see all current MVP matches for testing/navigation. SCORER and REFEREE users see only matches where they have an active `match_officials` assignment; revoked assignments are excluded. VIEWER users are denied for this operator route.

The operator landing page shows the teams or fallback IDs, status, scheduled time, venue, active assignment roles, and current event sequence when available. Score Control and Public Scoreboard buttons open the minimal score-control and public polling screens. This task does not add foul, clock, timeout, correction UI, or Socket.IO UI.

Current limitation: the live operator score UI only supports HOME/AWAY +1/+2/+3 score events. Create users/roles with the bootstrap scripts, create or locate matches through the API or smoke helper, then assign officials/operators through the admin assignment UI or API.

## Production Browser Smoke Test

Use this checklist on Plesk to verify the deployed app with a real MariaDB-backed match. The smoke helper is disabled unless `SMOKE_TEST_ENABLED=true` is set for that command.

```bash
git pull origin main
npm install
npm run build
npm run migrate
npm run auth:seed
AUTH_BOOTSTRAP_ENABLED=true ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='replace-with-12-plus-chars' ADMIN_DISPLAY_NAME='Admin' npm run auth:create-admin
SMOKE_TEST_ENABLED=true SMOKE_TEST_HOME_NAME="HOME" SMOKE_TEST_AWAY_NAME="AWAY" npm run smoke:create-match
```

The smoke match command creates or reuses the match code `Smoke Test Match`, creates or reuses the HOME/AWAY demo teams, ensures `match_streams` and scoreboard projection rows exist, and prints only:

```text
matchId=<id>
publicScoreboardPath=/public/scoreboard/<id>
operatorScorePath=/operator/matches/<id>/score
created=true|false
```

Browser checklist:

1. Login as admin.
2. Open `/admin/matches`.
3. Assign a scorer to the smoke match.
4. Login as the scorer.
5. Open `/operator/matches`.
6. Open score control for the smoke match.
7. Click `HOME +2`.
8. Open `/public/scoreboard/:matchId`.
9. Verify the public score updates.
10. Verify no private audit, session, password, token, or internal user data is visible.

The optional scorer-account helper is intentionally not included in this task. Create scorer users through the existing production bootstrap/admin workflow or direct controlled database operations, then assign the scorer through the admin assignment UI.

## Local MariaDB Verification

Create a local MariaDB database outside Git, then export the connection settings in your shell. Do not commit `.env` or secrets.

```bash
export DATABASE_HOST=localhost
export DATABASE_PORT=3306
export DATABASE_NAME=basketball_scoreboard
export DATABASE_USER=root
export DATABASE_PASSWORD=your-local-password

npm run db:check
npm run migrate:status
npm run migrate
npm run migrate
npm run test:db
```

Expected behavior:

- `db:check` prints connection and migration status without printing the database password.
- First `migrate` applies pending migrations on an empty database.
- Second `migrate` is idempotent and skips already-applied migrations with matching checksums.
- `test:db` is skipped when DB env vars are absent; when DB env vars are present, it connects to MariaDB and verifies migration status, migration execution, idempotency, and checksum mismatch detection.

## AI Git Workflow Policy

Before every commit, merge, or push to origin/main, AI coding agents must run `npm test` and `npm run build`. If database environment variables are available, they must also run `npm run test:db`, `npm run db:check`, and `npm run migrate:status`.

See:
[docs/agent/AI_GIT_WORKFLOW_POLICY.md](docs/agent/AI_GIT_WORKFLOW_POLICY.md)

## Project Design Documents

Canonical project contracts live under `docs/`:

- Agent workflow: [docs/agent/AI_AGENT_RULES.md](docs/agent/AI_AGENT_RULES.md), [docs/agent/AGENT_TASK_TEMPLATE.md](docs/agent/AGENT_TASK_TEMPLATE.md), [docs/agent/CODE_REVIEW_CHECKLIST.md](docs/agent/CODE_REVIEW_CHECKLIST.md)
- Product: [docs/product/PROJECT_BRIEF.md](docs/product/PROJECT_BRIEF.md)
- Architecture: [docs/architecture/ARCHITECTURE_PRINCIPLES.md](docs/architecture/ARCHITECTURE_PRINCIPLES.md), [docs/architecture/DOMAIN_MODEL.md](docs/architecture/DOMAIN_MODEL.md), [docs/architecture/EVENT_MODEL.md](docs/architecture/EVENT_MODEL.md), [docs/architecture/PROJECTION_MODEL.md](docs/architecture/PROJECTION_MODEL.md), [docs/architecture/COMMAND_EVENT_TRACEABILITY.md](docs/architecture/COMMAND_EVENT_TRACEABILITY.md)
- Rules: [docs/rules/RULES_PROFILE_FIBA.md](docs/rules/RULES_PROFILE_FIBA.md), [docs/rules/RULES_ENGINE_SPEC.md](docs/rules/RULES_ENGINE_SPEC.md)
- Security: [docs/security/USER_ROLES_AND_PERMISSIONS.md](docs/security/USER_ROLES_AND_PERMISSIONS.md)
- API: [docs/api/API_CONTRACTS.md](docs/api/API_CONTRACTS.md), [docs/api/SOCKET_CONTRACTS.md](docs/api/SOCKET_CONTRACTS.md)
- Database: [docs/database/DATABASE_SCHEMA.md](docs/database/DATABASE_SCHEMA.md)
- UI: [docs/ui/UI_DASHBOARDS.md](docs/ui/UI_DASHBOARDS.md), [docs/ui/KEYBOARD_SHORTCUTS.md](docs/ui/KEYBOARD_SHORTCUTS.md)
- Quality: [docs/quality/TEST_PLAN.md](docs/quality/TEST_PLAN.md), [docs/quality/ACCEPTANCE_CRITERIA.md](docs/quality/ACCEPTANCE_CRITERIA.md), [docs/quality/EDGE_CASES.md](docs/quality/EDGE_CASES.md)

API health endpoint:

```http
GET /api/v1/health
```

## Plesk Deployment

Plesk Node.js settings:

- Application Root: project root
- Document Root: `apps/web/dist`
- Application Startup File: `app.js`
- Preferred configuration: set database and secret values in Plesk Custom environment variables.
- Alternative configuration: create a root `.env` file on the server only when Custom environment variables are not available.
- Never commit `.env`.

Before Restart App:

```bash
npm install
npm run build
npm run migrate
npm run auth:seed
AUTH_BOOTSTRAP_ENABLED=true ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='replace-with-12-plus-chars' ADMIN_DISPLAY_NAME='Admin' npm run auth:create-admin
```

For the Vite frontend, set `VITE_API_BASE_URL=/api/v1` when the API is served from the same origin. Keep `DEV_AUTH_ENABLED=false` on public production deployments.

Health check:

```text
https://scoreboard.ob-gate.com/api/v1/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "basket-scoreboard-api"
}
```

## Next Safe Step

Phase 2 should wire the MariaDB-backed match event store MVP into the API:

- `match_streams`
- append-only `match_events`
- command envelope with `commandId`, `matchId`, `expectedSeq`, `correlationId`, `clientTimestamp`, and `payload`
- command deduplication
- row locking with `SELECT ... FOR UPDATE`
- projection update from appended events
