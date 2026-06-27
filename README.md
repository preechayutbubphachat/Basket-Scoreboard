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

## Auth And RBAC Status

The API has a foundation-level auth/RBAC layer for protected MVP endpoints. Public scoreboard reads remain unauthenticated and read-only.

Development and tests can use controlled headers:

- `x-dev-user-role: ADMIN | SCORER | REFEREE | VIEWER`
- `x-dev-user-id: <uuid>`
- `x-dev-match-ids: <comma-separated match IDs>`

Dev auth headers are disabled in production unless `DEV_AUTH_ENABLED=true`. Keep `DEV_AUTH_ENABLED=false` by default and do not enable it on a public server. The system is not match-day ready until real login/session or token auth is implemented.

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
```

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
