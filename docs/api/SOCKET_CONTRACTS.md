# SOCKET_CONTRACTS.md

## 0. Document Status

[SYSTEM RECOMMENDATION] This document defines the optional Socket.IO realtime delivery contract for the Basketball Scoreboard and Tournament Management system.

This system is designed for **Hostatom / Plesk Shared Hosting + MariaDB** constraints. Therefore, Socket.IO must be treated as an **optional realtime accelerator**, not the source of truth.

The authoritative write path remains:

```txt
Client Command
 -> Server validation
 -> RBAC check
 -> Rules Engine decision
 -> MariaDB transaction
 -> append match_events
 -> update projections/snapshots
 -> return current seqNo
 -> optional socket broadcast
```

Socket.IO broadcast is delivery only.

It must never replace:

- `match_events`
- REST command acknowledgement
- projection rebuild
- polling sync
- audit log
- MariaDB transaction safety

---

## 1. Purpose

`SOCKET_CONTRACTS.md` tells AI coding agents how realtime communication must work when Socket.IO is available.

It exists to prevent these mistakes:

- using socket broadcast as persistence
- trusting client-calculated score, foul, clock, or permission state
- accepting socket commands without RBAC
- losing state after reconnect
- letting public scoreboard clients send operator commands
- creating separate socket-only logic that bypasses REST/API validation
- using backend timers that depend on long-running `setInterval()`
- assuming Hostatom Shared Hosting behaves like a VPS

---

## 2. Hosting Compatibility Policy

### 2.1 Default Mode: Polling-First

[SYSTEM RECOMMENDATION] Because the target hosting may be Shared Hosting under Plesk, the default realtime strategy is:

```txt
REST command APIs for writes
+
HTTP polling / sync APIs for reads
+
Socket.IO only if hosting support is confirmed
```

Required polling endpoints are defined in `API_CONTRACTS.md`, especially:

```http
GET /api/v1/matches/:matchId/sync?lastEventSeq=123&projection=live_scoreboard
GET /api/v1/matches/:matchId/live-state
GET /api/v1/matches/:matchId/events?afterSeq=123
```

### 2.2 Socket.IO Is Optional

Socket.IO may be used when the deployment environment supports:

- long-running Node.js application through Plesk
- stable WebSocket upgrade or HTTP long-polling fallback
- HTTPS/WSS
- session or token authentication
- safe reverse proxy configuration
- acceptable latency during match operations

### 2.3 Socket.IO Must Have Polling Fallback

Every screen must still work if Socket.IO is unavailable.

Allowed behavior:

```txt
Socket available:
  receive projection patches instantly
  continue periodic low-frequency sync

Socket unavailable:
  use polling sync only
  command submission still works via REST APIs
```

Forbidden behavior:

```txt
Socket unavailable:
  scoreboard stops updating
  operator cannot submit commands
  missed events cannot be recovered
```

---

## 3. Core Principles

## 3.1 Match Events Are Source of Truth

[SYSTEM RECOMMENDATION] Socket.IO messages are not facts. They are delivery notifications.

The facts are:

```txt
match_events
match_snapshots
live_match_projections
audit_logs
```

## 3.2 Ordered Event Stream

One match has one ordered stream:

```txt
matchId + seqNo
```

Every client must track:

```ts
lastEventSeq: number;
lastProjectionVersion?: number;
```

## 3.3 No Client Authority

The server must never trust client-provided:

- score
- foul count
- clock value
- shot clock value
- role
- permission
- event sequence as truth
- player status
- timeout quota
- possession state

The client may send commands only. The server decides whether a command is valid.

## 3.4 Reconnect Must Be Safe

Every client must be able to recover using:

```txt
lastEventSeq
currentSnapshot
missedEvents
currentSeq
```

If missed event recovery is not possible, server returns:

```txt
FULL_STATE_SYNC_REQUIRED
```

## 3.5 Socket Commands Must Use Same Command Handler

[SYSTEM RECOMMENDATION] If socket commands are enabled, they must call the same server-side command handler used by REST command APIs.

Forbidden:

```txt
socket.on("score:add", () => update scoreboard row directly)
```

Required:

```txt
socket command
 -> shared command handler
 -> validation
 -> RBAC
 -> rules engine
 -> append event
 -> update projection
 -> ack result
 -> broadcast projection patch
```

---

## 4. Recommended Realtime Architecture

```txt
+--------------------------+
| Operator Browser         |
| REST commands            |
| optional Socket.IO       |
+------------+-------------+
             |
             | HTTPS/WSS
             v
+--------------------------+
| Node.js Backend          |
| Fastify/Express          |
| Socket.IO optional       |
| Zod validation           |
| RBAC                     |
| Rules Engine             |
+------------+-------------+
             |
             | transaction
             v
+--------------------------+
| MariaDB / InnoDB         |
| match_events             |
| projections              |
| snapshots                |
| audit_logs               |
+------------+-------------+
             |
             | projection patch
             v
+--------------------------+
| Public Scoreboard        |
| Polling-first            |
| optional socket updates  |
+--------------------------+
```

---

## 5. Socket Namespace

Use one namespace for live match operations:

```txt
/live
```

Example client connection:

```ts
const socket = io("/live", {
  transports: ["websocket", "polling"],
  auth: {
    token: accessToken,
    deviceId,
    clientType: "operator"
  }
});
```

Allowed `clientType` values:

```txt
operator
public_scoreboard
viewer
admin
replay
```

---

## 6. Rooms

## 6.1 Required Room Names

```txt
match:{matchId}:public
match:{matchId}:operator
match:{matchId}:admin
match:{matchId}:replay
```

## 6.2 Room Purpose

| Room | Purpose | Can Receive | Can Send Commands |
|---|---|---|---|
| `match:{matchId}:public` | Public scoreboard / spectators | live scoreboard projection | No |
| `match:{matchId}:operator` | Assigned scorer/referee/operator screens | operator projection, command results, warnings | Yes, if authorized |
| `match:{matchId}:admin` | Admin monitoring and correction | full match state, audit alerts | Yes, if authorized |
| `match:{matchId}:replay` | Historical replay UI | replay timeline patches | No live match commands |

## 6.3 Room Join Policy

Client must request room join explicitly:

```ts
{
  matchId: string;
  roomType: "public" | "operator" | "admin" | "replay";
  lastEventSeq?: number;
  lastProjectionVersion?: number;
}
```

Server validates:

- authenticated user
- requested room type
- match existence
- match access scope
- role permission
- assignment to match if operator
- public access policy if public scoreboard

Public scoreboard may join public room without full user login only if the system allows public token or public match display.

---

## 7. Socket Authentication

## 7.1 Handshake Requirements

Every socket handshake must include:

```ts
type SocketAuth = {
  token?: string;
  sessionId?: string;
  deviceId: string;
  clientType: "operator" | "public_scoreboard" | "viewer" | "admin" | "replay";
  appVersion?: string;
};
```

At least one of `token` or `sessionId` is required unless the server explicitly supports public scoreboard tokens.

## 7.2 Server Authentication Steps

The server must:

1. verify token or session
2. load user identity
3. load roles from server-side database/session
4. load assigned matches if role is operator
5. attach `authContext` to socket
6. reject unauthenticated connections unless public access is configured

Example server-side auth context:

```ts
type SocketAuthContext = {
  userId: string | null;
  roles: string[];
  permissions: string[];
  organizationId?: string;
  assignedMatchIds: string[];
  deviceId: string;
  clientType: string;
  isPublic: boolean;
};
```

## 7.3 Never Trust Client Role

Forbidden:

```ts
if (payload.role === "admin") allow();
```

Required:

```ts
const authContext = await loadAuthContextFromServer(socket);
authorizeSocketMessage(authContext, message);
```

---

## 8. Socket Authorization

## 8.1 Deny by Default

Every socket message must be denied unless explicitly allowed.

## 8.2 Authorize Every Message

Handshake authorization is not enough.

Each message must check:

- user identity
- role
- permission
- match assignment
- match status
- room type
- command type
- payload validity

## 8.3 Public Clients Are Read-Only

Public scoreboard clients may receive:

```txt
MATCH_STATE_SYNCED
PROJECTION_PATCHED
CLOCK_TICK_HINT
MATCH_STATUS_CHANGED
CONNECTION_HEALTH
```

Public scoreboard clients must not send:

```txt
COMMAND_SUBMIT
SCORE_ADD
FOUL_ADD
CLOCK_START
CLOCK_STOP
SHOT_CLOCK_RESET
TIMEOUT_GRANT
CORRECTION_APPLY
```

If a public client sends an operator command, server must return:

```txt
COMMAND_REJECTED
reasonCode = UNAUTHORIZED_COMMAND
```

and optionally log suspicious activity.

---

## 9. Client Command Format

## 9.1 Command Envelope

Every command must include:

```ts
type SocketCommandEnvelope<TPayload> = {
  commandId: string;
  matchId: string;
  expectedSeq: number;
  correlationId: string;
  clientTimestamp: string;
  commandType: SocketCommandType;
  payload: TPayload;
};
```

## 9.2 Required Metadata

| Field | Required | Purpose |
|---|---:|---|
| `commandId` | Yes | idempotency / duplicate protection |
| `matchId` | Yes | route to match stream |
| `expectedSeq` | Yes | optimistic concurrency |
| `correlationId` | Yes | trace related actions |
| `clientTimestamp` | Yes | client-side timing reference, not authoritative |
| `commandType` | Yes | command routing |
| `payload` | Yes | command data |

## 9.3 Server Metadata

Server must add:

```ts
type ServerCommandMetadata = {
  actorUserId: string;
  actorRole: string;
  deviceId: string;
  serverReceivedAt: string;
  requestIp?: string;
  userAgent?: string;
};
```

The client cannot provide these as trusted values.

---

## 10. Socket Command Types

Socket commands are optional. REST command APIs remain the default write path for Hostatom compatibility.

Allowed command types when socket write mode is enabled:

```txt
MATCH_START
PERIOD_START
PERIOD_END
OVERTIME_START

GAME_CLOCK_START
GAME_CLOCK_STOP
GAME_CLOCK_SET

SHOT_CLOCK_START
SHOT_CLOCK_STOP
SHOT_CLOCK_RESET_24
SHOT_CLOCK_RESET_14
SHOT_CLOCK_SET

SCORE_ADD
SCORE_REMOVE_BY_CORRECTION

PLAYER_FOUL_ADD
PLAYER_FOUL_CORRECT
TEAM_FOUL_ADJUST_BY_CORRECTION

TIMEOUT_GRANT
TIMEOUT_CANCEL_BY_CORRECTION

POSSESSION_CHANGE
DIRECTION_SWITCH

CORRECTION_REQUEST
CORRECTION_APPLY
CORRECTION_REJECT
```

Forbidden direct command types:

```txt
SET_SCORE_TOTAL
SET_TEAM_FOUL_TOTAL
SET_PLAYER_FOUL_TOTAL
SET_MATCH_STATE_WITHOUT_EVENT
DELETE_EVENT
UPDATE_EVENT
OVERRIDE_SEQ_NO
BYPASS_RULES_ENGINE
```

---

## 11. Server Response Events

## 11.1 Required Responses

```txt
COMMAND_ACCEPTED
COMMAND_REJECTED
STATE_PATCHED
FULL_STATE_SYNC_REQUIRED
MATCH_STATE_SYNCED
MISSED_EVENTS_DELIVERED
ROOM_JOINED
ROOM_JOIN_REJECTED
CONNECTION_HEALTH
```

## 11.2 COMMAND_ACCEPTED

Sent to the command sender when the command is accepted and committed.

```ts
type CommandAccepted = {
  type: "COMMAND_ACCEPTED";
  commandId: string;
  matchId: string;
  seqNo: number;
  currentSeq: number;
  eventIds: string[];
  projectionVersion?: number;
  serverTime: string;
};
```

Rules:

- emit only after database transaction commits
- must include current sequence
- must not be emitted before event append succeeds

## 11.3 COMMAND_REJECTED

```ts
type CommandRejected = {
  type: "COMMAND_REJECTED";
  commandId?: string;
  matchId?: string;
  reasonCode: SocketReasonCode;
  explanation: string;
  currentSeq?: number;
  serverTime: string;
  details?: Record<string, unknown>;
};
```

Common reason codes:

```txt
UNAUTHENTICATED
UNAUTHORIZED_COMMAND
INVALID_PAYLOAD
INVALID_EXPECTED_SEQ
DUPLICATE_COMMAND
MATCH_NOT_FOUND
MATCH_NOT_ACTIVE
MATCH_ALREADY_FINISHED
RULE_VIOLATION
TIMEOUT_QUOTA_EXCEEDED
PLAYER_FOULED_OUT
CORRECTION_REASON_REQUIRED
NEEDS_SOURCE
SERVER_ERROR
```

## 11.4 STATE_PATCHED

Sent to rooms after projection update.

```ts
type StatePatched<TProjectionPatch> = {
  type: "STATE_PATCHED";
  matchId: string;
  projectionName: ProjectionName;
  fromSeq: number;
  toSeq: number;
  projectionVersion: number;
  patch: TProjectionPatch;
  serverTime: string;
};
```

Rules:

- patches are optimization
- client must verify sequence continuity
- if continuity is broken, client must request full sync

## 11.5 FULL_STATE_SYNC_REQUIRED

```ts
type FullStateSyncRequired = {
  type: "FULL_STATE_SYNC_REQUIRED";
  matchId: string;
  reasonCode:
    | "SEQ_GAP"
    | "PROJECTION_VERSION_MISMATCH"
    | "MISSED_EVENTS_TOO_LARGE"
    | "SERVER_RECOVERY_UNAVAILABLE"
    | "CLIENT_STATE_TOO_OLD";
  currentSeq: number;
  syncUrl: string;
  serverTime: string;
};
```

---

## 12. Reconnect Contract

## 12.1 Client Reconnect Request

On reconnect, client sends:

```ts
type ReconnectRequest = {
  matchId: string;
  roomType: "public" | "operator" | "admin" | "replay";
  lastEventSeq: number;
  lastProjectionVersion?: number;
  clientProjectionName?: ProjectionName;
};
```

## 12.2 Server Reconnect Response

Server responds with one of:

```txt
MISSED_EVENTS_DELIVERED
MATCH_STATE_SYNCED
FULL_STATE_SYNC_REQUIRED
ROOM_JOIN_REJECTED
```

## 12.3 MISSED_EVENTS_DELIVERED

```ts
type MissedEventsDelivered = {
  type: "MISSED_EVENTS_DELIVERED";
  matchId: string;
  fromSeqExclusive: number;
  toSeqInclusive: number;
  currentSeq: number;
  events: MatchEvent[];
  currentProjection?: unknown;
  projectionVersion?: number;
  serverTime: string;
};
```

## 12.4 MATCH_STATE_SYNCED

```ts
type MatchStateSynced = {
  type: "MATCH_STATE_SYNCED";
  matchId: string;
  currentSeq: number;
  snapshotSeq: number;
  projectionName: ProjectionName;
  projection: unknown;
  serverTime: string;
};
```

## 12.5 Reconnect Rule

If the server cannot safely provide missed events, it must require full sync.

Forbidden:

```txt
Reconnect accepted with no seq check.
Client keeps stale state silently.
```

---

## 13. Projection Names

Allowed projection names:

```txt
live_scoreboard_projection
operator_score_projection
foul_projection
timeout_projection
clock_projection
shot_clock_projection
match_summary_projection
replay_timeline_projection
tournament_standings_projection
```

Socket messages must reference one of these names.

---

## 14. Live Clock and Shot Clock Contract

## 14.1 No Backend Tick Dependency

[SYSTEM RECOMMENDATION] For Hostatom-compatible architecture, server must not rely on a permanent backend timer.

Forbidden:

```ts
setInterval(() => {
  updateClockEverySecondInDatabase();
}, 1000);
```

Required model:

```txt
GAME_CLOCK_STARTED event stores:
- remainingMs
- startedAtServerTime

Client display computes:
remainingMs - (clientAdjustedNow - startedAtServerTime)

GAME_CLOCK_STOPPED event stores:
- stoppedAtServerTime
- remainingMsAfterStop
```

## 14.2 Clock Sync Event

Server may send periodic clock hints:

```ts
type ClockTickHint = {
  type: "CLOCK_TICK_HINT";
  matchId: string;
  currentSeq: number;
  serverTime: string;
  gameClock: {
    status: "RUNNING" | "STOPPED";
    remainingMs: number;
    startedAtServerTime?: string;
  };
  shotClock: {
    status: "RUNNING" | "STOPPED" | "OFF";
    remainingMs?: number;
    startedAtServerTime?: string;
  };
};
```

This event is only a display hint.

It must not create match facts by itself.

---

## 15. Room Join Contract

## 15.1 Client Event: JOIN_MATCH_ROOM

```ts
type JoinMatchRoom = {
  type: "JOIN_MATCH_ROOM";
  matchId: string;
  roomType: "public" | "operator" | "admin" | "replay";
  lastEventSeq?: number;
  projectionName?: ProjectionName;
};
```

## 15.2 Server Event: ROOM_JOINED

```ts
type RoomJoined = {
  type: "ROOM_JOINED";
  matchId: string;
  room: string;
  roomType: "public" | "operator" | "admin" | "replay";
  currentSeq: number;
  projectionName: ProjectionName;
  projection: unknown;
  serverTime: string;
};
```

## 15.3 Server Event: ROOM_JOIN_REJECTED

```ts
type RoomJoinRejected = {
  type: "ROOM_JOIN_REJECTED";
  matchId?: string;
  roomType?: string;
  reasonCode:
    | "UNAUTHENTICATED"
    | "UNAUTHORIZED_ROOM"
    | "MATCH_NOT_FOUND"
    | "PUBLIC_ACCESS_DISABLED"
    | "INVALID_PAYLOAD";
  explanation: string;
  serverTime: string;
};
```

---

## 16. Public Scoreboard Contract

## 16.1 Public Client Allowed Events

Public scoreboard clients may receive:

```txt
ROOM_JOINED
MATCH_STATE_SYNCED
STATE_PATCHED
CLOCK_TICK_HINT
FULL_STATE_SYNC_REQUIRED
CONNECTION_HEALTH
```

## 16.2 Public Client Forbidden Events

Public clients must not receive:

- full audit log
- private correction reason if not public
- user identity details
- admin-only projection
- operator assignment details
- authentication-sensitive data

## 16.3 Public Scoreboard Display Requirements

Public scoreboard must display:

- home team name
- away team name
- home score
- away score
- period
- game clock
- shot clock
- team fouls
- timeout indicators if enabled
- possession arrow if enabled
- connection status
- last synced seq if debug mode is enabled

---

## 17. Operator Screen Contract

## 17.1 Operator Client Allowed Actions

Operator clients may send commands only if assigned and authorized:

- score control
- foul control
- game clock control
- shot clock control
- timeout control
- possession control
- correction request
- allowed correction apply if role policy permits

## 17.2 Operator Feedback Requirements

Operator UI must show:

- command pending
- command accepted
- command rejected
- reason code
- current seq
- stale state warning
- reconnecting state
- full sync required state
- duplicate command warning

---

## 18. Admin Room Contract

Admin room may receive:

- full match projection
- audit alerts
- correction requests
- rejected command logs if enabled
- operator connection status

Admin room can submit privileged commands only if RBAC permits.

Even Admin commands must:

- pass validation
- pass rules engine or explicit override policy
- include reason for correction
- write audit log
- append events instead of mutating history

---

## 19. Replay Room Contract

Replay room is read-only.

Replay client may request:

```txt
REPLAY_LOAD_TIMELINE
REPLAY_SEEK
REPLAY_PLAY
REPLAY_PAUSE
```

These are UI playback commands only. They must not alter match state.

Replay data source:

```txt
match_events
replay_timeline_projection
match_snapshots
```

---

## 20. Error and Reason Code Catalog

```txt
UNAUTHENTICATED
UNAUTHORIZED_ROOM
UNAUTHORIZED_COMMAND
INVALID_PAYLOAD
INVALID_COMMAND_TYPE
INVALID_EXPECTED_SEQ
SEQ_GAP
DUPLICATE_COMMAND
MATCH_NOT_FOUND
MATCH_NOT_ACTIVE
MATCH_ALREADY_FINISHED
MATCH_LOCKED
MATCH_ARCHIVED
RULE_VIOLATION
NEEDS_SOURCE
TIMEOUT_QUOTA_EXCEEDED
PLAYER_FOULED_OUT
TEAM_NOT_IN_MATCH
PLAYER_NOT_IN_MATCH_ROSTER
CORRECTION_REASON_REQUIRED
CORRECTION_TARGET_NOT_FOUND
PROJECTION_VERSION_MISMATCH
SERVER_RECOVERY_UNAVAILABLE
RATE_LIMITED
SERVER_ERROR
```

Each rejection must include:

```ts
{
  reasonCode: string;
  explanation: string;
  currentSeq?: number;
  serverTime: string;
}
```

---

## 21. Rate Limiting

## 21.1 Required Limits

The server should rate-limit:

- room join attempts
- command submissions
- correction requests
- reconnect storms
- public scoreboard connections
- sync requests

## 21.2 Suggested Starting Limits

[ASSUMPTION] Initial limits for local/testing deployment:

```txt
operator commands: 20 per 10 seconds per user/device/match
correction commands: 5 per minute per user/match
join room: 10 per minute per device
public sync: 1-2 requests per second per client
```

Production values must be tuned after load testing.

---

## 22. Duplicate Command Handling

Every command must use `commandId`.

Server must store command result or deduplication record:

```txt
unique(match_id, command_id)
```

If duplicate command arrives:

- do not append a new event
- return original result if available
- otherwise return `DUPLICATE_COMMAND`

---

## 23. Optimistic Concurrency

Every command must include `expectedSeq`.

If current match seq is not equal to `expectedSeq`, server must reject:

```txt
COMMAND_REJECTED
reasonCode = INVALID_EXPECTED_SEQ
currentSeq = actual current seq
```

Client should then sync and let operator retry if still appropriate.

---

## 24. Message Ordering

Socket delivery may arrive late or out of order.

Client must:

- apply patches only when `fromSeq === lastEventSeq + 1`
- update `lastEventSeq` only after successful application
- request full sync when seq gap occurs
- never guess missing state

Server must:

- include `fromSeq` and `toSeq` in patches
- include `currentSeq` in all acks
- allow HTTP sync fallback

---

## 25. Security Requirements

## 25.1 Transport

Production deployment must use:

```txt
HTTPS / WSS
```

## 25.2 Origin Policy

Server should allow only configured origins.

```txt
allowedOrigins:
- official operator domain
- public scoreboard domain
- local match-day domain if configured
```

## 25.3 Payload Validation

All incoming socket payloads must be validated using Zod or equivalent.

Invalid payload returns:

```txt
COMMAND_REJECTED
reasonCode = INVALID_PAYLOAD
```

## 25.4 Audit Logging

Audit logs required for:

- correction request
- correction applied
- correction rejected
- privileged admin command
- permission denied for sensitive command
- repeated suspicious command attempts
- match state override attempt
- rule override

Audit log must include:

- actor
- role
- device
- timestamp
- commandId
- correlationId
- matchId
- reason if applicable
- old value if applicable
- new value if applicable
- event sequence if committed

---

## 26. Socket Event Naming Convention

Use uppercase server events:

```txt
COMMAND_ACCEPTED
COMMAND_REJECTED
STATE_PATCHED
MATCH_STATE_SYNCED
FULL_STATE_SYNC_REQUIRED
ROOM_JOINED
ROOM_JOIN_REJECTED
CONNECTION_HEALTH
CLOCK_TICK_HINT
```

Use uppercase command types:

```txt
SCORE_ADD
GAME_CLOCK_START
SHOT_CLOCK_RESET_24
```

Use one client event to submit commands:

```txt
COMMAND_SUBMIT
```

Example:

```ts
socket.emit("COMMAND_SUBMIT", {
  commandId,
  matchId,
  expectedSeq,
  correlationId,
  clientTimestamp,
  commandType: "SCORE_ADD",
  payload: {
    teamId,
    playerId,
    points: 2
  }
});
```

---

## 27. Server Broadcast Rules

## 27.1 Broadcast After Commit Only

Server must broadcast only after:

1. command is accepted
2. transaction commits
3. projection is updated or can be fetched

## 27.2 Broadcast Targets

Example:

```txt
SCORE_ADD accepted:
- sender gets COMMAND_ACCEPTED
- operator room gets STATE_PATCHED(operator_score_projection)
- public room gets STATE_PATCHED(live_scoreboard_projection)
- admin room gets STATE_PATCHED(admin match projection)
```

## 27.3 Do Not Broadcast Sensitive Fields Publicly

Public room patch must not include:

- actor user id
- correction reason if private
- audit metadata
- permission info
- internal command IDs
- admin-only warning details

---

## 28. Client State Machine

Every client should implement:

```txt
DISCONNECTED
CONNECTING
CONNECTED
JOINING_ROOM
SYNCING
LIVE
STALE
RECONNECTING
FULL_SYNC_REQUIRED
ERROR
```

## 28.1 Operator UI Behavior

```txt
LIVE:
  commands enabled

STALE:
  commands disabled or require resync
  show "state outdated"

RECONNECTING:
  commands disabled
  show connection warning

FULL_SYNC_REQUIRED:
  fetch REST sync endpoint
  rehydrate projection
```

## 28.2 Public Scoreboard UI Behavior

```txt
LIVE:
  display normal

STALE:
  show subtle connection warning if enabled

RECONNECTING:
  continue local clock display briefly
  mark connection state

FULL_SYNC_REQUIRED:
  fetch latest projection
```

---

## 29. REST Fallback Contract

Socket client must know how to fall back to REST:

```http
GET /api/v1/matches/:matchId/sync?lastEventSeq=123&projection=live_scoreboard
POST /api/v1/matches/:matchId/commands/score
POST /api/v1/matches/:matchId/commands/clock/start
POST /api/v1/matches/:matchId/commands/shot-clock/reset
```

Fallback rule:

```txt
If socket command submit fails or times out:
  show pending/error
  optionally retry via REST with same commandId
```

Important:

- same `commandId` prevents duplicate event append
- same `expectedSeq` still applies
- REST result is authoritative

---

## 30. Timeout and Retry Policy

## 30.1 Command Timeout

[ASSUMPTION] Initial client timeout:

```txt
operator command acknowledgement timeout: 3000 ms
```

If timeout occurs:

- show pending warning
- call REST command-status endpoint if available
- do not blindly resubmit with new commandId
- retry same commandId only if designed safe

## 30.2 Command Status Endpoint

Recommended endpoint:

```http
GET /api/v1/matches/:matchId/commands/:commandId/status
```

Possible statuses:

```txt
UNKNOWN
PENDING
ACCEPTED
REJECTED
DUPLICATE
```

---

## 31. TypeScript Types

Recommended file:

```txt
src/shared/contracts/socket.contract.ts
```

Example types:

```ts
export type RoomType = "public" | "operator" | "admin" | "replay";

export type ProjectionName =
  | "live_scoreboard_projection"
  | "operator_score_projection"
  | "foul_projection"
  | "timeout_projection"
  | "clock_projection"
  | "shot_clock_projection"
  | "match_summary_projection"
  | "replay_timeline_projection"
  | "tournament_standings_projection";

export type SocketServerEvent =
  | "COMMAND_ACCEPTED"
  | "COMMAND_REJECTED"
  | "STATE_PATCHED"
  | "MATCH_STATE_SYNCED"
  | "FULL_STATE_SYNC_REQUIRED"
  | "MISSED_EVENTS_DELIVERED"
  | "ROOM_JOINED"
  | "ROOM_JOIN_REJECTED"
  | "CONNECTION_HEALTH"
  | "CLOCK_TICK_HINT";

export type SocketClientEvent =
  | "JOIN_MATCH_ROOM"
  | "LEAVE_MATCH_ROOM"
  | "COMMAND_SUBMIT"
  | "SYNC_REQUEST";
```

---

## 32. Zod Validation

Every incoming payload must have a schema.

Example:

```ts
export const SocketCommandEnvelopeSchema = z.object({
  commandId: z.string().uuid(),
  matchId: z.string().uuid(),
  expectedSeq: z.number().int().nonnegative(),
  correlationId: z.string().uuid(),
  clientTimestamp: z.string().datetime(),
  commandType: z.string(),
  payload: z.unknown()
});
```

Each `commandType` must narrow payload with a specific schema.

---

## 33. Implementation File Structure

Recommended backend structure:

```txt
src/
  realtime/
    socket.gateway.ts
    socket.auth.ts
    socket.authorization.ts
    socket.rooms.ts
    socket.events.ts
    socket.schemas.ts
    socket.rate-limit.ts
    socket.types.ts

  matches/
    commands/
      command-handler.ts
      score.commands.ts
      clock.commands.ts
      shot-clock.commands.ts
      foul.commands.ts
      timeout.commands.ts
      correction.commands.ts

  events/
    event-store.ts
    event-types.ts
    event-projector.ts

  projections/
    live-scoreboard.projector.ts
    operator-score.projector.ts
    foul.projector.ts
    clock.projector.ts
    shot-clock.projector.ts
```

---

## 34. AI Agent Implementation Rules

AI agent must:

- read `AI_AGENT_RULES.md` first
- read `API_CONTRACTS.md`
- read `EVENT_MODEL.md`
- read `PROJECTION_MODEL.md`
- use shared command handlers for REST and Socket.IO
- validate every socket payload
- authorize every socket message
- include `expectedSeq`
- include `commandId`
- include `correlationId`
- broadcast only after database commit
- support REST/polling fallback
- write tests for reconnect and duplicate commands

AI agent must not:

- create socket-only command logic
- update scoreboard projection directly from socket payload
- trust client role
- trust client score/foul/clock
- skip expected sequence check
- skip idempotency
- skip audit for correction
- implement backend tick loop as source of truth
- remove polling fallback
- assume WebSocket is guaranteed on Hostatom

---

## 35. Required Tests

## 35.1 Socket Auth Tests

- unauthenticated socket rejected
- public token can join public room only
- operator can join assigned match operator room
- operator cannot join unassigned match operator room
- viewer cannot join operator room
- public scoreboard cannot send command

## 35.2 Command Tests

- valid command returns `COMMAND_ACCEPTED`
- invalid payload returns `COMMAND_REJECTED`
- stale `expectedSeq` returns `INVALID_EXPECTED_SEQ`
- duplicate `commandId` does not append duplicate event
- unauthorized command is rejected
- accepted command appends event and broadcasts patch

## 35.3 Reconnect Tests

- reconnect with current seq returns state synced
- reconnect with missed events returns missed events
- reconnect with old seq returns full sync required
- seq gap triggers full sync
- client can recover after socket disconnect using REST sync

## 35.4 Projection Tests

- score event broadcasts public scoreboard patch
- foul event broadcasts foul projection patch
- correction event rebuilds projections correctly
- public projection excludes private audit fields

## 35.5 Clock Tests

- clock start event uses deadline-based model
- clock display can recover after reconnect
- server does not need permanent tick loop
- shot clock reset patch is sent correctly

## 35.6 Security Tests

- forged client role ignored
- payload with unexpected fields rejected or sanitized
- correction without reason rejected
- admin-only events not broadcast to public room
- rate limit rejects spam commands

---

## 36. Acceptance Criteria

Socket.IO implementation is acceptable only when:

- every screen still works without Socket.IO using REST/polling
- every socket command uses shared command handler
- every socket command validates payload server-side
- every socket command enforces RBAC server-side
- every command includes `commandId`, `expectedSeq`, `correlationId`
- every accepted command appends event in MariaDB before broadcast
- every client can reconnect with `lastEventSeq`
- sequence gap causes full sync
- public clients are read-only
- correction actions require reason and audit log
- clock and shot clock do not depend on backend `setInterval()` as source of truth
- tests cover auth, reconnect, duplicate command, stale seq, public read-only, and projection patching

---

## 37. Open Product Decisions

The Product Owner must decide:

1. Will socket commands be enabled, or will sockets be read-only?
2. Will public scoreboard access require public token?
3. Will operator devices be pre-registered?
4. How many public viewers must be supported during live matches?
5. What maximum acceptable scoreboard delay is allowed?
6. Should the system display connection warnings publicly?
7. Should admin room receive rejected command alerts?
8. Should correction reasons be visible in public match summary?
9. Should local match-day mode be supported in addition to Hostatom?
10. Should Socket.IO be disabled automatically if health checks fail?

---

## 38. Recommended Default for This Project

[SYSTEM RECOMMENDATION] For the current Hostatom/Plesk + MariaDB plan, use this default:

```txt
Command submission:
  REST first

Realtime display:
  polling sync first
  Socket.IO optional

Socket command mode:
  disabled by default
  can be enabled later after deployment test

Public scoreboard:
  polling every 500-1000 ms
  optional socket patch if stable

Operator screens:
  REST commands
  polling every 300-500 ms
  optional socket patch for faster feedback

Persistence:
  MariaDB match_events

Clock:
  deadline-based model

Correction:
  compensating events only
```

This keeps the system usable on Shared Hosting while still allowing upgrade to VPS/cloud realtime later without rewriting the domain model.
