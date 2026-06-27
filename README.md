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

This branch implements Phase 1 Foundation only:

- npm workspace monorepo
- TypeScript base config
- Fastify API skeleton
- Vite React web skeleton
- package skeletons for domain, event model, and API contracts
- environment example
- migration and tests folders
- API health check
- placeholder API test

It intentionally does not implement dashboards, Socket.IO, match commands, projections, mutable scoreboard state, or basketball rules in UI.

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
npm run migrate
```

API health endpoint:

```http
GET /api/v1/health
```

## Next Safe Step

Phase 2 should add the MariaDB-backed match event store MVP:

- `match_streams`
- append-only `match_events`
- command envelope with `commandId`, `matchId`, `expectedSeq`, `correlationId`, `clientTimestamp`, and `payload`
- command deduplication
- row locking with `SELECT ... FOR UPDATE`
- projection update from appended events
