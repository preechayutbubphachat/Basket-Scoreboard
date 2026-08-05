# ARCHITECTURE_PRINCIPLES.md

> Version: Hostatom / Plesk Shared Hosting + MariaDB compatible architecture  
> Purpose: Lock the technical architecture for a production-minded Basketball Scoreboard and Tournament Management web application that can run primarily on web hosting while preserving auditability, replayability, and realtime-like match operation.

---

## 0. Executive Decision

[SYSTEM RECOMMENDATION] **MariaDB can be used for this project** if the database layer is designed carefully around append-only match events, optimistic concurrency, idempotent commands, snapshots, and projections.

[SYSTEM RECOMMENDATION] Because the target hosting is Shared Hosting under Plesk with limited Node.js support and no guaranteed long-running background process, the architecture must avoid assumptions that require:

- SSH access
- Python runtime
- FastAPI / Uvicorn
- Alembic migrations
- systemd / supervisor
- custom reverse proxy configuration
- guaranteed internal port binding
- permanent background workers
- server-side interval loops for game clock or shot clock

[SYSTEM RECOMMENDATION] The safe host-only architecture is:

```txt
Browser Clients
  ├─ Operator Dashboard
  ├─ Public Scoreboard Display
  ├─ Foul Control Dashboard
  ├─ Match Summary Dashboard
  └─ Admin / Tournament Dashboard
        │
        ▼
Plesk-hosted Web App
  ├─ Static Frontend: Vite + React + TypeScript
  ├─ Node.js API App if supported by Plesk
  ├─ Optional Socket.IO only if hosting confirms WebSocket compatibility
  └─ Guaranteed fallback: HTTP event polling
        │
        ▼
MariaDB
  ├─ match_events
  ├─ match_snapshots
  ├─ live_match_projections
  ├─ command_deduplication
  ├─ audit_logs
  └─ tournament projections
```

[SYSTEM RECOMMENDATION] For Shared Hosting, realtime must be designed as **Realtime Transport Adapter**:

1. Preferred: Socket.IO/WebSocket, only if Hostatom confirms stable support.
2. Fallback: HTTP event polling using `lastEventSeq`.
3. Emergency fallback: refresh live projection by `stateVersion`.

The system must work correctly even when WebSocket is unavailable.

---

## 1. Core Principle

[SYSTEM RECOMMENDATION] `match_events` is the source of truth.

The current scoreboard state, public display, operator dashboard, match summary, replay timeline, and tournament standings are all projections derived from event streams.

```txt
Commands
  -> Validate permission
  -> Validate rules
  -> Append match_events
  -> Update projection/snapshot
  -> Notify clients or allow polling clients to catch up
```

Do not treat a mutable `scoreboard_state` row as the official record.

---

## 2. Hosting Reality: Hostatom / Plesk Shared Hosting

[ASSUMPTION] Based on the hosting constraints provided by the Product Owner, the target hosting environment has the following limitations:

- No SSH access.
- No Python environment guarantee.
- No root/admin access.
- No systemd or supervisor.
- No guaranteed permanent background process.
- No guaranteed custom port binding such as `127.0.0.1:8010`.
- Reverse proxy configuration may require provider review.
- Node.js is available only through Plesk-supported features.

[SYSTEM RECOMMENDATION] Therefore:

- Do not build this project with FastAPI.
- Do not depend on Uvicorn.
- Do not depend on Alembic.
- Do not require a queue worker for correctness.
- Do not require server-side timers to tick every second.
- Do not require WebSocket to be the only realtime mechanism.
- Do not require Redis for the host-only MVP.
- Do not assume background jobs will always run.

---

## 3. Final Recommended Stack for Host-Only Mode

### 3.1 Frontend

[SYSTEM RECOMMENDATION]

```txt
Frontend: Vite + React + TypeScript
UI: Tailwind CSS + shadcn/ui
State: Zustand or Redux Toolkit
Validation: Zod
Build Output: Static files
Deploy Target: Plesk document root
```

Why Vite instead of full server-side Next.js:

- Static build is easier to deploy on Shared Hosting.
- Does not require a persistent Node.js server for rendering.
- Works well with browser-based dashboards.
- Lower deployment complexity for non-SSH hosting.

[ASSUMPTION] Next.js may still be used only in static export mode, but the default should be Vite + React.

---

### 3.2 Backend

[SYSTEM RECOMMENDATION]

```txt
Backend: Node.js + TypeScript
Framework: Fastify preferred, Express acceptable
Runtime: Plesk-supported Node.js
API style: REST commands + realtime adapter
Validation: Zod
Database Driver: mysql2
Query Builder: Drizzle ORM or Kysely
```

Recommended priority:

1. **Fastify + TypeScript + Zod + mysql2 + Drizzle/Kysely**
2. Express only if Fastify deployment becomes problematic on Plesk.
3. Avoid NestJS for host-only MVP because it adds runtime and build complexity.

---

### 3.3 Database

[SYSTEM RECOMMENDATION]

```txt
Database: MariaDB
Engine: InnoDB
Charset: utf8mb4
Collation: utf8mb4_unicode_ci
Primary design: Append-only event store + projections
```

MariaDB is acceptable if:

- `match_events` is append-only.
- `match_id + seq_no` is unique.
- Commands are idempotent through `command_id`.
- Writes use transactions.
- Concurrent commands use optimistic concurrency or row locking.
- Clock state is stored as derived state, not as a continuously updated timer row.

---

### 3.4 Realtime Transport

[SYSTEM RECOMMENDATION] Use a transport abstraction:

```ts
interface RealtimeTransport {
  publishMatchEvents(matchId: string, events: MatchEvent[]): Promise<void>;
  publishStateChanged(matchId: string, stateVersion: number): Promise<void>;
}
```

Implementations:

```txt
SocketIoTransport       Optional, only if hosting supports stable WebSocket
PollingTransport        Required, works on Shared Hosting
NoopTransport           Safe fallback, clients poll state
```

The application must still be correct if realtime publish fails.

---

## 4. Realtime Strategy for Shared Hosting

### 4.1 Correctness First

[SYSTEM RECOMMENDATION] Realtime broadcast is not persistence.

Even if Socket.IO works, every public display must be able to recover from the database using:

```txt
matchId
lastEventSeq
currentProjectionVersion
```

---

### 4.2 Guaranteed Fallback: Event Polling

[SYSTEM RECOMMENDATION] Every live screen must support polling:

```http
GET /api/matches/:matchId/events?afterSeq=123
GET /api/matches/:matchId/live-state
```

Recommended polling intervals:

```txt
Operator dashboard: 300-500 ms during live match
Public scoreboard: 500-1000 ms
Viewer page: 1000-3000 ms
Admin pages: 3000-10000 ms
```

[ASSUMPTION] These intervals should be tuned after load testing on the actual hosting plan.

---

### 4.3 Polling Response Shape

```json
{
  "matchId": "match_123",
  "fromSeq": 123,
  "toSeq": 126,
  "events": [],
  "projection": {
    "seqNo": 126,
    "homeScore": 42,
    "awayScore": 40,
    "period": 3,
    "gameClock": {
      "status": "RUNNING",
      "remainingMs": 328000,
      "serverTime": "2026-06-26T12:00:00.000Z"
    },
    "shotClock": {
      "status": "RUNNING",
      "remainingMs": 12000,
      "serverTime": "2026-06-26T12:00:00.000Z"
    }
  },
  "requiresFullSync": false
}
```

---

### 4.4 Optional Socket.IO

[SYSTEM RECOMMENDATION] Socket.IO can be enabled only after the hosting provider confirms:

- WebSocket upgrade works through Plesk.
- Node.js app can stay active enough for live operation.
- Proxy timeout will not interrupt match sessions.
- Multiple clients can remain connected during a match.
- Logs are available for debugging.

If not confirmed, do not depend on Socket.IO for live match operation.

---

## 5. Clock and Shot Clock Architecture Without Background Workers

### 5.1 Do Not Tick on Server

[SYSTEM RECOMMENDATION] Do not update game clock or shot clock in the database every second.

On Shared Hosting, server-side timers are risky because the process may sleep, restart, or be killed.

### 5.2 Deadline-Based Clock Model

Use event-sourced clock state:

```ts
type ClockStatus = 'STOPPED' | 'RUNNING' | 'EXPIRED';

type ClockState = {
  status: ClockStatus;
  remainingMsAtLastStop: number;
  startedAtServerMs: number | null;
  lastEventSeq: number;
};
```

When clock starts:

```txt
Append GAME_CLOCK_STARTED
Store:
- remainingMsAtLastStop
- startedAtServerMs = server now
```

When clients render:

```txt
if RUNNING:
  displayedRemaining = remainingMsAtLastStop - (clientSyncedNow - startedAtServerMs)
else:
  displayedRemaining = remainingMsAtLastStop
```

When clock stops:

```txt
serverNow = trusted server time
newRemaining = remainingMsAtLastStop - (serverNow - startedAtServerMs)
Append GAME_CLOCK_STOPPED with newRemaining
```

[SYSTEM RECOMMENDATION] This makes clock work without a permanent backend loop.

---

### 5.3 Shot Clock Uses Same Pattern

Shot clock state should also be event-based:

```txt
SHOT_CLOCK_STARTED
SHOT_CLOCK_STOPPED
SHOT_CLOCK_RESET_24
SHOT_CLOCK_RESET_14
SHOT_CLOCK_SET
SHOT_CLOCK_EXPIRED_CONFIRMED
```

[ASSUMPTION] Because Shared Hosting cannot guarantee a real-time server buzzer event, the UI may show zero immediately, but official expiration should be confirmed by the operator/referee event.

---

## 6. Event Sourcing Pattern

### 6.1 Event Stream

[SYSTEM RECOMMENDATION] One match has one ordered event stream.

```txt
match_id = one event stream
seq_no = strictly increasing per match
```

### 6.2 Event Metadata

Every event must include:

```txt
event_id
match_id
seq_no
event_type
payload_json
actor_user_id
actor_role
device_id
occurred_at
recorded_at
correlation_id
causation_id
command_id
rule_profile_id
reason
```

### 6.3 Event Rules

```txt
- Events are append-only.
- Do not update old events.
- Do not delete old events.
- Use correction events to reverse or adjust prior events.
- Projections are rebuildable.
- Snapshots are optimization only.
```

---

## 7. MariaDB Event Store Design

### 7.1 Required Core Tables

```txt
users
roles
permissions
user_roles

tournaments
tournament_stages
teams
players
tournament_rosters
matches
match_rosters
match_officials

match_streams
match_events
match_snapshots
live_match_projections
command_deduplication
audit_logs
```

---

### 7.2 `match_streams`

Purpose: maintain current sequence number and lock one match stream during command handling.

```sql
CREATE TABLE match_streams (
  match_id CHAR(36) PRIMARY KEY,
  current_seq_no BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL,
  rule_profile_id VARCHAR(64) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 7.3 `match_events`

```sql
CREATE TABLE match_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  seq_no BIGINT NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  payload_json JSON NOT NULL,
  actor_user_id CHAR(36) NOT NULL,
  actor_role VARCHAR(50) NOT NULL,
  device_id VARCHAR(100) NULL,
  command_id CHAR(36) NOT NULL,
  correlation_id CHAR(36) NOT NULL,
  causation_id CHAR(36) NULL,
  rule_profile_id VARCHAR(64) NOT NULL,
  reason TEXT NULL,
  occurred_at DATETIME(3) NOT NULL,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE KEY uq_event_id (event_id),
  UNIQUE KEY uq_match_seq (match_id, seq_no),
  UNIQUE KEY uq_match_command (match_id, command_id),
  KEY idx_match_events_match_seq (match_id, seq_no),
  KEY idx_match_events_type (event_type),
  KEY idx_match_events_recorded_at (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 7.4 `live_match_projections`

```sql
CREATE TABLE live_match_projections (
  match_id CHAR(36) PRIMARY KEY,
  last_seq_no BIGINT NOT NULL,
  projection_json JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_live_match_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 7.5 `match_snapshots`

```sql
CREATE TABLE match_snapshots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  match_id CHAR(36) NOT NULL,
  last_seq_no BIGINT NOT NULL,
  snapshot_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_match_snapshot_seq (match_id, last_seq_no),
  KEY idx_match_snapshot_latest (match_id, last_seq_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 7.6 `audit_logs`

```sql
CREATE TABLE audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  audit_id CHAR(36) NOT NULL,
  match_id CHAR(36) NULL,
  actor_user_id CHAR(36) NOT NULL,
  actor_role VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  old_value_json JSON NULL,
  new_value_json JSON NULL,
  reason TEXT NULL,
  correlation_id CHAR(36) NOT NULL,
  causation_id CHAR(36) NULL,
  event_seq_no BIGINT NULL,
  device_id VARCHAR(100) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE KEY uq_audit_id (audit_id),
  KEY idx_audit_match (match_id),
  KEY idx_audit_actor (actor_user_id),
  KEY idx_audit_recorded_at (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 8. Command Handling With MariaDB

### 8.1 Required Command Payload

Every command must include:

```ts
type MatchCommand = {
  commandId: string;
  matchId: string;
  expectedSeq: number;
  correlationId: string;
  timestamp: string;
  payload: unknown;
};
```

### 8.2 Transaction Flow

[SYSTEM RECOMMENDATION]

```txt
BEGIN

1. Authenticate user
2. Authorize command by role + assigned match
3. Validate payload with Zod
4. SELECT match_streams row FOR UPDATE
5. Check expectedSeq == current_seq_no
6. Check command_id has not already been applied
7. Rehydrate state from live projection or snapshot + events
8. Validate command against rules engine
9. Generate one or more domain events
10. Insert events into match_events
11. Update match_streams.current_seq_no
12. Update live_match_projections
13. Insert audit_logs when required

COMMIT

14. Publish realtime notification if available
15. Return new seqNo and projection
```

### 8.3 Expected Sequence Conflict

If `expectedSeq` is stale:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_EXPECTED_SEQ",
    "message": "Client state is stale. Full sync required.",
    "currentSeq": 142
  }
}
```

The client must fetch latest state before retrying.

---

## 9. Projection Strategy

[SYSTEM RECOMMENDATION] The UI should read from projections for speed.

Core projections:

```txt
live_match_projection
operator_score_projection
foul_projection
timeout_projection
clock_projection
shot_clock_projection
match_summary_projection
replay_timeline_projection
tournament_standings_projection
```

Projection rules:

```txt
- Projection is rebuildable.
- Projection is not official history.
- If projection is corrupted, rebuild from match_events.
- Projection updates should occur in the same transaction as event append when possible.
```

---

## 10. Correction and Undo

[SYSTEM RECOMMENDATION] Undo is not delete.

Wrong score example:

```txt
Original:
SCORE_ADDED home +2 player A

Correction:
CORRECTION_REQUESTED
SCORE_CORRECTED or SCORE_REMOVED_BY_CORRECTION
CORRECTION_APPLIED
```

Every correction requires:

```txt
actor
role
device
timestamp
old value
new value
reason
correlation ID
causation ID
event sequence
```

Post-entry edits must require correction reason.

---

## 11. RBAC and Security

### 11.1 Default Roles

```txt
Admin
- full tournament, team, match, user, rule profile, correction, audit management

Referee / Scorer
- operate score, fouls, clock, shot clock, timeout, possession, and corrections within assigned matches

Viewer
- read-only public scoreboard, schedule, standings, and summaries
```

### 11.2 Security Rules

```txt
- Deny by default.
- Enforce RBAC on all REST APIs.
- Enforce RBAC on every realtime/socket command.
- Never trust role or permission sent from client.
- Never trust score/foul/clock state sent from client.
- Validate every command payload server-side.
- Store audit logs for all corrections.
```

---

## 12. UI Architecture

### 12.1 Required Dashboards

```txt
- Main live scoreboard dashboard
- Match pairing dashboard
- Score control dashboard
- Foul control dashboard
- Clock and shot clock dashboard
- Timeout dashboard
- Match summary dashboard
- Replay dashboard
- Admin tournament dashboard
```

### 12.2 Operator UI Rules

```txt
- Large buttons
- High contrast
- Touchscreen friendly
- Keyboard shortcuts
- Clear clock state
- Clear shot clock state
- Clear connection status
- Clear current event sequence
- Confirmation for correction actions
- Reason required for correction actions
```

### 12.3 Public Scoreboard Rules

```txt
- Full-screen 16:9 layout
- Large numbers readable from distance
- No editing controls
- Auto-recover from stale state
- Show reconnecting indicator if polling/socket fails
```

---

## 13. Host-Only Reliability Policy

[SYSTEM RECOMMENDATION] If the system is fully hosted on Shared Hosting, the Product Owner must accept these operational risks:

```txt
- Internet outage can affect the match operation.
- Hosting throttling can affect realtime responsiveness.
- WebSocket may not be available or stable.
- Node.js app lifecycle may be controlled by Plesk.
- Debugging live issues may be harder than on VPS/local server.
```

Mitigations:

```txt
- Use polling fallback.
- Use event sequence recovery.
- Keep operator clients on latest state.
- Use local browser clock rendering from server timestamps.
- Provide manual export after match.
- Provide emergency manual scoreboard fallback.
- Test on actual hosting plan before real tournament day.
```

---

## 14. Deployment Policy

### 14.1 Hostatom Shared Hosting Deployment

```txt
Frontend:
- npm run build
- upload dist/ to document root

Backend:
- compile TypeScript to JavaScript
- deploy Node.js app through Plesk Node.js feature
- configure environment variables in Plesk
- ensure API base URL works from frontend

Database:
- create MariaDB database in hosting panel
- apply SQL migration files through phpMyAdmin or hosting database tool
- seed admin user and default FIBA rule profile
```

### 14.2 Environment Variables

```txt
DATABASE_URL
JWT_SECRET
SESSION_SECRET
APP_BASE_URL
CORS_ORIGIN
NODE_ENV
PUBLIC_API_BASE_URL
REALTIME_MODE=polling|socketio
```

---

## 15. Migration Policy for No-SSH Hosting

[SYSTEM RECOMMENDATION] Do not depend on CLI-only migrations on production Shared Hosting.

Use:

```txt
/docs/database/migrations/*.sql
/docs/database/ROLLBACKS.md
```

Deployment process:

```txt
1. Generate migration SQL locally.
2. Review migration SQL.
3. Backup database.
4. Apply migration through phpMyAdmin/Plesk database tool.
5. Verify schema version.
6. Run smoke tests from browser.
```

Required table:

```sql
CREATE TABLE schema_migrations (
  version VARCHAR(100) PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  description TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 16. Testing Architecture

Required tests:

```txt
- Game clock
- Shot clock
- Score control
- Team fouls
- Player fouls
- Timeout
- Overtime
- Correction
- Replay
- RBAC
- Polling reconnect
- Optional socket reconnect
- Duplicate commands
- Concurrent operator actions
- MariaDB transaction conflict
```

Host-only specific tests:

```txt
- Polling under live match frequency
- Two operator tabs with same expectedSeq
- Public scoreboard after missed events
- Node.js app restart during match
- Browser refresh during running clock
- Slow network on public display
```

---

## 17. Forbidden Architecture

AI agents must not implement:

```txt
- Python FastAPI backend for Hostatom Shared Hosting mode
- Uvicorn runtime
- Alembic production dependency
- Server-side setInterval as authoritative clock
- Mutable-only scoreboard_state source of truth
- Event deletion for undo
- Client-calculated score as official score
- Client-sent role as authorization proof
- WebSocket-only realtime without polling fallback
- Redis-required design for host-only MVP
```

---

## 18. Architecture Decision Records

Every major architecture change must create an ADR:

```txt
/docs/adr/ADR-0001-use-mariadb-on-shared-hosting.md
/docs/adr/ADR-0002-use-polling-fallback-for-realtime.md
/docs/adr/ADR-0003-use-deadline-based-clock-model.md
```

ADR format:

```md
# ADR-XXXX Title

## Status
Accepted | Proposed | Rejected

## Context

## Decision

## Consequences

## Alternatives Considered
```

---

## 19. Definition of Done

A feature is done only when:

```txt
- Command validation exists.
- RBAC exists.
- Event is appended.
- Projection is updated.
- Audit log exists if correction/privileged action.
- Polling recovery works.
- Duplicate command is handled.
- Stale expectedSeq is rejected.
- Unit tests exist.
- Integration tests exist for DB transaction behavior.
- UI shows success/error clearly.
```

---

## 20. Recommended First Build Sequence

[SYSTEM RECOMMENDATION]

```txt
1. Static frontend shell with Vite + React
2. MariaDB schema
3. Node.js Fastify API on Plesk-compatible structure
4. Auth + RBAC
5. Match event store
6. Command handler with expectedSeq
7. Live projection endpoint
8. Polling live scoreboard
9. Operator score controls
10. Clock and shot clock deadline model
11. Foul controls
12. Timeout controls
13. Correction flow
14. Replay timeline
15. Tournament schedule and standings
16. Optional Socket.IO transport if hosting proves stable
```

---

## 21. Final Position

[SYSTEM RECOMMENDATION] Yes, MariaDB is acceptable.

[SYSTEM RECOMMENDATION] Yes, the system can be designed to run primarily on the web host.

[SYSTEM RECOMMENDATION] However, for real match-day safety on Shared Hosting, the architecture must be:

```txt
MariaDB event-sourced
REST command based
polling-first realtime
Socket.IO optional
deadline-based clocks
projection-driven UI
no background-worker dependency
no Python dependency
no mutable scoreboard-only source of truth
```

This is the best balance between easy field management and production-minded reliability under Shared Hosting limitations.
