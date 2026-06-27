# API_CONTRACTS.md

## 0. Document Status

**Status:** Draft for implementation  
**Owner:** System Architect / AI Agent Controller  
**Primary consumers:** Backend AI Agent, Frontend AI Agent, QA Agent, Security Reviewer  
**Default deployment target:** Hostatom / Plesk Shared Hosting + MariaDB  
**Default realtime mode:** REST polling-first  
**Optional realtime mode:** Socket.IO / WebSocket only if hosting confirms stable support

---

## 1. Purpose

This document defines the REST API contracts for the Basketball Scoreboard and Tournament Management web application.

The API must support:

- Tournament management
- Team management
- Player and roster management
- Match scheduling
- Live match operation
- Game clock and shot clock control
- Score control
- Team fouls and player fouls
- Timeout
- Overtime
- Match summary
- Historical replay
- Undo / correction / audit log
- Multi-screen realtime operation
- Role-based access control
- Polling-first realtime sync on shared hosting

---

## 2. Core API Principles

[SYSTEM RECOMMENDATION] The API must be designed around event sourcing.

### 2.1 Source of Truth

`match_events` is the source of truth.

The API must never treat mutable scoreboard rows as the official record.

```txt
Client command
  -> API validates auth/RBAC/payload/rules/expectedSeq
  -> API appends match_event in MariaDB transaction
  -> API updates/rebuilds projection
  -> API returns currentSeq + projection patch/full state
  -> public/operator screens poll latest projection/events
```

### 2.2 Hostatom / Shared Hosting Compatible Principle

Because the deployment target may not support reliable long-running processes, permanent background workers, custom reverse proxy, or guaranteed WebSocket port binding, the API must work without requiring:

- background worker process
- daemon process
- Python runtime
- Uvicorn / FastAPI
- SSH access
- root/admin privileges
- systemd / supervisor
- custom internal port binding
- always-on Socket.IO server

Therefore, the API must support:

- standard HTTP request/response
- polling by `lastEventSeq`
- deadline-based game clock calculation
- deadline-based shot clock calculation
- database-backed event replay
- idempotent commands

Socket.IO may be added later as a delivery optimization, but it must not be required for correctness.

### 2.3 API Versioning

All endpoints must be versioned:

```txt
/api/v1/...
```

Breaking changes require a new version:

```txt
/api/v2/...
```

### 2.4 Response Format

All responses should use a consistent envelope.

```ts
type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: {
    requestId: string;
    currentSeq?: number;
    serverTime: string;
  };
};

type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    fieldErrors?: Record<string, string[]>;
  };
  meta: {
    requestId: string;
    serverTime: string;
    currentSeq?: number;
  };
};
```

### 2.5 Time Format

All API timestamps must use ISO 8601 UTC strings.

```txt
2026-06-26T10:15:30.123Z
```

Display timezone is a frontend concern.

### 2.6 IDs

Recommended ID format:

```txt
UUID v7 preferred
UUID v4 acceptable
```

AI agents must not use auto-increment IDs as public IDs.

MariaDB may use internal numeric primary keys if needed, but public API IDs should be opaque.

---

## 3. Authentication Policy

### 3.1 Auth Required by Default

All endpoints require authentication except explicitly public endpoints.

Public endpoints must be read-only.

```txt
Default: authenticated
Exception: /public/*
```

### 3.2 Supported Auth Modes

Recommended for Hostatom/Plesk:

```txt
Option A: Secure HTTP-only session cookie
Option B: Bearer access token
```

For browser web app, secure HTTP-only cookie is preferred when possible.

### 3.3 CSRF

If cookie-based authentication is used, all write endpoints must require CSRF protection.

Required for:

```txt
POST
PUT
PATCH
DELETE
```

Not required for:

```txt
GET public read endpoints
```

### 3.4 Never Trust Client Role

The client may display role-based UI, but the API must always resolve role/permission server-side from authenticated user and assignment records.

Forbidden:

```txt
payload.role = "Admin"
payload.canEdit = true
payload.permission = "match.score.operate"
```

Any client-sent role/permission field must be ignored or rejected.

---

## 4. Authorization Policy

### 4.1 Deny by Default

Every route must explicitly declare required permission.

If no permission rule exists, access is denied.

### 4.2 Permission Scopes

Permissions may be scoped by:

```txt
organization
tournament
match
public
```

### 4.3 Match Assignment Requirement

Referee / Scorer / Timer / Shot Clock Operator may operate only assigned matches.

Example:

```txt
user has role Referee/Scorer
AND user is assigned to match
AND match is not locked/finalized
AND command is allowed for current match state
```

### 4.4 Public Endpoints

Public endpoints are read-only and must never expose:

- internal user IDs except public display names
- audit log details
- correction private reason if marked internal
- authentication tokens
- permissions
- device IDs
- raw sensitive metadata

---

## 5. Validation Policy

### 5.1 Zod Required

All request bodies, params, and query strings must be validated with Zod or equivalent schema validation.

Validation layers:

```txt
1. Route params validation
2. Query validation
3. Body validation
4. Auth validation
5. RBAC validation
6. Domain/rules validation
7. Concurrency validation
8. Idempotency validation
```

### 5.2 Unknown Fields

For command payloads, unknown fields should be rejected.

For query filters, unknown query fields should be ignored only if explicitly documented.

### 5.3 Numeric Safety

Scores, fouls, period numbers, remaining milliseconds, and sequence numbers must be validated as safe integers.

---

## 6. Command Contract

Live match actions are represented as commands.

Even when using REST polling-first, commands must include the same metadata expected for realtime operation.

### 6.1 Base Command Request

```ts
type BaseCommandRequest<TPayload> = {
  commandId: string;
  matchId: string;
  expectedSeq: number;
  correlationId: string;
  clientTimestamp: string;
  deviceId?: string;
  payload: TPayload;
};
```

### 6.2 Base Command Response

```ts
type CommandAccepted<TProjection = unknown> = {
  accepted: true;
  commandId: string;
  matchId: string;
  appendedEvents: Array<{
    eventId: string;
    seqNo: number;
    eventType: string;
  }>;
  currentSeq: number;
  projection?: TProjection;
  serverTime: string;
};

type CommandRejected = {
  accepted: false;
  commandId?: string;
  matchId?: string;
  currentSeq?: number;
  reasonCode: string;
  message: string;
  details?: unknown;
  serverTime: string;
};
```

### 6.3 Idempotency

`commandId` must be unique per match.

If the same command is submitted again:

- If already accepted, return the same result or equivalent accepted response.
- If previously rejected due to validation, return rejected response.
- Never append duplicate events.

Required database support:

```txt
unique(match_id, command_id)
```

### 6.4 Optimistic Concurrency

Every live command must include `expectedSeq`.

The API must compare:

```txt
expectedSeq === current match last_seq_no
```

If mismatch:

```txt
409 CONFLICT
INVALID_EXPECTED_SEQ
```

The response must include currentSeq and optionally latest projection so the client can resync.

---

## 7. Error Codes

AI agents must use stable error codes, not free-text only errors.

### 7.1 General Errors

```txt
BAD_REQUEST
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
METHOD_NOT_ALLOWED
VALIDATION_FAILED
RATE_LIMITED
INTERNAL_ERROR
SERVICE_UNAVAILABLE
```

### 7.2 Auth / RBAC Errors

```txt
AUTH_REQUIRED
INVALID_SESSION
CSRF_REQUIRED
CSRF_INVALID
PERMISSION_DENIED
MATCH_ASSIGNMENT_REQUIRED
PUBLIC_READ_ONLY
```

### 7.3 Match Command Errors

```txt
MATCH_NOT_FOUND
MATCH_NOT_STARTED
MATCH_ALREADY_STARTED
MATCH_ALREADY_FINISHED
MATCH_LOCKED
MATCH_FINALIZED
INVALID_MATCH_STATE
INVALID_EXPECTED_SEQ
DUPLICATE_COMMAND
COMMAND_ALREADY_ACCEPTED
COMMAND_ALREADY_REJECTED
RULE_VIOLATION
NEEDS_SOURCE
```

### 7.4 Clock Errors

```txt
GAME_CLOCK_ALREADY_RUNNING
GAME_CLOCK_ALREADY_STOPPED
GAME_CLOCK_NOT_RUNNING
GAME_CLOCK_INVALID_REMAINING_MS
PERIOD_NOT_ACTIVE
PERIOD_ALREADY_ENDED
PERIOD_CANNOT_END_WHILE_CLOCK_RUNNING
```

### 7.5 Shot Clock Errors

```txt
SHOT_CLOCK_ALREADY_RUNNING
SHOT_CLOCK_ALREADY_STOPPED
SHOT_CLOCK_INVALID_REMAINING_MS
SHOT_CLOCK_RESET_NOT_ALLOWED
SHOT_CLOCK_DECISION_NEEDS_CONTEXT
```

### 7.6 Score Errors

```txt
INVALID_SCORE_VALUE
INVALID_SCORE_TEAM
INVALID_SCORE_PLAYER
PLAYER_NOT_IN_MATCH_ROSTER
PLAYER_NOT_ACTIVE
```

### 7.7 Foul Errors

```txt
INVALID_FOUL_TYPE
INVALID_FOUL_PLAYER
PLAYER_FOULED_OUT
TEAM_FOUL_PENALTY_STATE_INVALID
FOUL_PENALTY_NEEDS_SOURCE
```

### 7.8 Timeout Errors

```txt
TIMEOUT_QUOTA_EXCEEDED
TIMEOUT_NOT_AVAILABLE
TIMEOUT_ALREADY_ACTIVE
TIMEOUT_NOT_ACTIVE
TIMEOUT_RULE_NEEDS_SOURCE
```

### 7.9 Correction Errors

```txt
CORRECTION_REASON_REQUIRED
CORRECTION_PERMISSION_REQUIRED
TARGET_EVENT_NOT_FOUND
TARGET_EVENT_ALREADY_CORRECTED
CORRECTION_NOT_ALLOWED_AFTER_FINALIZATION
CORRECTION_REQUIRES_ADMIN_APPROVAL
```

---

## 8. Public APIs

Public APIs are read-only and may be used by spectator screens, scoreboard display screens, livestream overlays, or public websites.

### 8.1 Get Public Match Scoreboard

```http
GET /api/v1/public/matches/:matchId/scoreboard
```

Returns current public scoreboard projection.

Response:

```ts
type PublicScoreboardResponse = {
  matchId: string;
  tournamentId?: string;
  homeTeam: {
    teamId: string;
    name: string;
    shortName?: string;
    logoUrl?: string;
    score: number;
    teamFouls: number;
    timeoutsRemaining?: number;
  };
  awayTeam: {
    teamId: string;
    name: string;
    shortName?: string;
    logoUrl?: string;
    score: number;
    teamFouls: number;
    timeoutsRemaining?: number;
  };
  period: {
    number: number;
    type: "REGULATION" | "OVERTIME";
    label: string;
  };
  gameClock: {
    status: "STOPPED" | "RUNNING" | "EXPIRED";
    remainingMs: number;
    startedAtServerTime?: string;
    serverTime: string;
  };
  shotClock: {
    status: "STOPPED" | "RUNNING" | "EXPIRED" | "OFF";
    remainingMs?: number;
    startedAtServerTime?: string;
    serverTime: string;
  };
  possession?: {
    teamId: string;
    direction?: "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT";
  };
  matchStatus:
    | "SCHEDULED"
    | "WARMUP"
    | "IN_PROGRESS"
    | "HALFTIME"
    | "BETWEEN_PERIODS"
    | "OVERTIME"
    | "FINISHED"
    | "FINALIZED";
  lastEventSeq: number;
  updatedAt: string;
};
```

Polling recommendation:

```txt
Public display: 500-1000 ms
Livestream overlay: 500-1000 ms
Archive page: 5-30 seconds
```

### 8.2 Poll Public Match Events

```http
GET /api/v1/public/matches/:matchId/events?afterSeq=123&limit=100
```

Returns public-safe event feed.

Response:

```ts
type PublicEventsResponse = {
  matchId: string;
  fromSeq: number;
  toSeq: number;
  currentSeq: number;
  hasMore: boolean;
  events: PublicMatchEvent[];
  serverTime: string;
};
```

Public events must exclude sensitive audit metadata.

### 8.3 Get Public Schedule

```http
GET /api/v1/public/tournaments/:tournamentId/schedule
```

Query:

```txt
?date=2026-06-26
?stageId=...
?teamId=...
```

### 8.4 Get Public Standings

```http
GET /api/v1/public/tournaments/:tournamentId/standings
```

### 8.5 Get Public Match Summary

```http
GET /api/v1/public/matches/:matchId/summary
```

---

## 9. Auth APIs

### 9.1 Login

```http
POST /api/v1/auth/login
```

Request:

```ts
type LoginRequest = {
  usernameOrEmail: string;
  password: string;
};
```

Response:

```ts
type LoginResponse = {
  user: {
    userId: string;
    displayName: string;
    roles: string[];
  };
  session: {
    expiresAt: string;
    csrfToken?: string;
  };
};
```

### 9.2 Logout

```http
POST /api/v1/auth/logout
```

### 9.3 Current User

```http
GET /api/v1/auth/me
```

Response:

```ts
type CurrentUserResponse = {
  userId: string;
  displayName: string;
  roles: string[];
  permissions: Array<{
    permission: string;
    scopeType: "organization" | "tournament" | "match" | "global";
    scopeId?: string;
  }>;
  assignedMatches: string[];
};
```

---

## 10. Tournament APIs

### 10.1 Create Tournament

```http
POST /api/v1/tournaments
```

Permission:

```txt
tournament.create
```

Request:

```ts
type CreateTournamentRequest = {
  organizationId?: string;
  name: string;
  seasonId?: string;
  ruleProfileId: string;
  format:
    | "SINGLE_MATCH"
    | "ROUND_ROBIN"
    | "GROUP_STAGE"
    | "SINGLE_ELIMINATION"
    | "DOUBLE_ELIMINATION"
    | "BEST_OF_SERIES"
    | "AGGREGATE_SERIES"
    | "CUSTOM";
  startsAt?: string;
  endsAt?: string;
  timezone: string;
};
```

### 10.2 List Tournaments

```http
GET /api/v1/tournaments
```

Query:

```txt
?organizationId=...
?status=DRAFT|PUBLISHED|IN_PROGRESS|FINISHED|ARCHIVED
?page=1
?pageSize=50
```

### 10.3 Get Tournament

```http
GET /api/v1/tournaments/:tournamentId
```

### 10.4 Update Tournament

```http
PATCH /api/v1/tournaments/:tournamentId
```

Permission:

```txt
tournament.update
```

### 10.5 Publish Tournament

```http
POST /api/v1/tournaments/:tournamentId/publish
```

Permission:

```txt
tournament.publish
```

### 10.6 Archive Tournament

```http
POST /api/v1/tournaments/:tournamentId/archive
```

Permission:

```txt
tournament.archive
```

---

## 11. Tournament Stage APIs

### 11.1 Create Stage

```http
POST /api/v1/tournaments/:tournamentId/stages
```

Request:

```ts
type CreateStageRequest = {
  name: string;
  type:
    | "ROUND_ROBIN"
    | "GROUP_STAGE"
    | "SINGLE_ELIMINATION"
    | "DOUBLE_ELIMINATION"
    | "BEST_OF_SERIES"
    | "AGGREGATE_SERIES"
    | "CUSTOM";
  orderNo: number;
  startsAt?: string;
  endsAt?: string;
};
```

### 11.2 List Stages

```http
GET /api/v1/tournaments/:tournamentId/stages
```

### 11.3 Update Stage

```http
PATCH /api/v1/tournament-stages/:stageId
```

### 11.4 Delete Draft Stage

```http
DELETE /api/v1/tournament-stages/:stageId
```

Only allowed if no official matches/events depend on the stage.

---

## 12. Team APIs

### 12.1 Create Team

```http
POST /api/v1/teams
```

Request:

```ts
type CreateTeamRequest = {
  organizationId?: string;
  name: string;
  shortName?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
};
```

### 12.2 List Teams

```http
GET /api/v1/teams
```

### 12.3 Get Team

```http
GET /api/v1/teams/:teamId
```

### 12.4 Update Team

```http
PATCH /api/v1/teams/:teamId
```

### 12.5 Add Team to Tournament

```http
POST /api/v1/tournaments/:tournamentId/teams
```

Request:

```ts
type AddTournamentTeamRequest = {
  teamId: string;
  seedNo?: number;
  groupId?: string;
};
```

---

## 13. Player APIs

### 13.1 Create Player

```http
POST /api/v1/players
```

Request:

```ts
type CreatePlayerRequest = {
  teamId?: string;
  firstName: string;
  lastName?: string;
  displayName: string;
  birthDate?: string;
  jerseyNumber?: string;
};
```

### 13.2 List Players

```http
GET /api/v1/players
```

Query:

```txt
?teamId=...
?search=...
```

### 13.3 Update Player

```http
PATCH /api/v1/players/:playerId
```

---

## 14. Roster APIs

### 14.1 Add Player to Tournament Roster

```http
POST /api/v1/tournaments/:tournamentId/teams/:teamId/roster
```

Request:

```ts
type AddTournamentRosterPlayerRequest = {
  playerId: string;
  jerseyNumber: string;
  status: "ACTIVE" | "INACTIVE";
};
```

Validation:

```txt
jersey number must be unique within tournament team roster
player must belong to team or be explicitly allowed as guest player
```

### 14.2 List Tournament Roster

```http
GET /api/v1/tournaments/:tournamentId/teams/:teamId/roster
```

### 14.3 Update Tournament Roster Player

```http
PATCH /api/v1/tournament-rosters/:rosterEntryId
```

### 14.4 Create Match Roster

```http
POST /api/v1/matches/:matchId/rosters
```

Request:

```ts
type CreateMatchRosterRequest = {
  teamId: string;
  players: Array<{
    playerId: string;
    jerseyNumber: string;
    starter?: boolean;
    active: boolean;
  }>;
};
```

---

## 15. Match APIs

### 15.1 Create Match

```http
POST /api/v1/tournaments/:tournamentId/matches
```

Request:

```ts
type CreateMatchRequest = {
  stageId?: string;
  groupId?: string;
  homeTeamId: string;
  awayTeamId: string;
  venueId?: string;
  courtId?: string;
  scheduledAt?: string;
  ruleProfileId: string;
};
```

### 15.2 List Matches

```http
GET /api/v1/matches
```

Query:

```txt
?tournamentId=...
?teamId=...
?status=...
?date=...
?page=1
?pageSize=50
```

### 15.3 Get Match

```http
GET /api/v1/matches/:matchId
```

Returns match metadata, not full event stream by default.

### 15.4 Get Match Live State

```http
GET /api/v1/matches/:matchId/live-state
```

Permission:

```txt
match.view
```

Returns operator-safe live projection.

### 15.5 Get Match Events

```http
GET /api/v1/matches/:matchId/events?afterSeq=0&limit=200
```

Permission:

```txt
match.events.read
```

Admin/scorer version may include full metadata depending on permission.

### 15.6 Get Match Summary

```http
GET /api/v1/matches/:matchId/summary
```

### 15.7 Get Match Replay Timeline

```http
GET /api/v1/matches/:matchId/replay?fromSeq=0&toSeq=9999
```

### 15.8 Assign Match Officials

```http
POST /api/v1/matches/:matchId/officials
```

Permission:

```txt
match.officials.manage
```

Request:

```ts
type AssignMatchOfficialsRequest = {
  officials: Array<{
    userId: string;
    role:
      | "REFEREE"
      | "SCORER"
      | "ASSISTANT_SCORER"
      | "TIMER"
      | "SHOT_CLOCK_OPERATOR"
      | "VIEWER";
  }>;
};
```

---

## 16. Live Command APIs

REST command APIs are the primary safe live-control path for Hostatom/Plesk deployment.

All command endpoints:

- require authentication
- require RBAC
- require match assignment
- require `expectedSeq`
- require `commandId`
- validate rules server-side
- append events in transaction
- update projection in transaction or immediately after
- return `currentSeq`
- support idempotency

### 16.1 Start Match

```http
POST /api/v1/matches/:matchId/commands/start-match
```

Permission:

```txt
match.clock.operate
```

Request:

```ts
type StartMatchCommand = BaseCommandRequest<{
  startingPeriodNo: number;
}>;
```

Appended events:

```txt
MATCH_STARTED
PERIOD_STARTED
GAME_CLOCK_SET
SHOT_CLOCK_SET
```

### 16.2 Start Period

```http
POST /api/v1/matches/:matchId/commands/start-period
```

Request:

```ts
type StartPeriodCommand = BaseCommandRequest<{
  periodNo: number;
  periodType: "REGULATION" | "OVERTIME";
}>;
```

### 16.3 End Period

```http
POST /api/v1/matches/:matchId/commands/end-period
```

Appended events:

```txt
PERIOD_ENDED
```

May trigger:

```txt
OVERTIME_REQUIRED
MATCH_FINISHED
```

depending on score and period.

### 16.4 Finish Match

```http
POST /api/v1/matches/:matchId/commands/finish-match
```

Permission:

```txt
match.finish
```

### 16.5 Finalize Match

```http
POST /api/v1/matches/:matchId/commands/finalize-match
```

Permission:

```txt
match.finalize
```

Finalization locks ordinary scorer corrections unless admin override is allowed.

---

## 17. Score Command APIs

### 17.1 Add Score

```http
POST /api/v1/matches/:matchId/commands/score/add
```

Permission:

```txt
match.score.operate
```

Request:

```ts
type AddScoreCommand = BaseCommandRequest<{
  teamId: string;
  playerId?: string;
  points: 1 | 2 | 3;
  periodNo: number;
  gameClockRemainingMs?: number;
  shotClockRemainingMs?: number;
  note?: string;
}>;
```

Validation:

```txt
team must be home or away team
points must be 1, 2, or 3
playerId, if provided, must be active in match roster
period must be active
match must be in progress
```

Appended event:

```txt
SCORE_ADDED
```

### 17.2 Remove Score by Correction

```http
POST /api/v1/matches/:matchId/commands/score/remove-by-correction
```

This should normally be called through correction flow, not direct UI.

Request:

```ts
type RemoveScoreByCorrectionCommand = BaseCommandRequest<{
  targetEventId: string;
  reason: string;
}>;
```

Appended event:

```txt
SCORE_REMOVED_BY_CORRECTION
```

---

## 18. Game Clock Command APIs

Deadline-based clock model must be used.

### 18.1 Start Game Clock

```http
POST /api/v1/matches/:matchId/commands/game-clock/start
```

Permission:

```txt
match.clock.operate
```

Request:

```ts
type StartGameClockCommand = BaseCommandRequest<{
  periodNo: number;
  remainingMs: number;
}>;
```

Event payload must store:

```ts
{
  periodNo: number;
  remainingMs: number;
  startedAtServerTime: string;
}
```

### 18.2 Stop Game Clock

```http
POST /api/v1/matches/:matchId/commands/game-clock/stop
```

Request:

```ts
type StopGameClockCommand = BaseCommandRequest<{
  periodNo: number;
  clientObservedRemainingMs?: number;
}>;
```

Server must calculate official remainingMs based on server time.

### 18.3 Set Game Clock

```http
POST /api/v1/matches/:matchId/commands/game-clock/set
```

Permission:

```txt
match.clock.correct
```

Request:

```ts
type SetGameClockCommand = BaseCommandRequest<{
  periodNo: number;
  remainingMs: number;
  reason: string;
}>;
```

Validation:

```txt
reason required
audit required
correction event required if changing official state
```

---

## 19. Shot Clock Command APIs

### 19.1 Start Shot Clock

```http
POST /api/v1/matches/:matchId/commands/shot-clock/start
```

### 19.2 Stop Shot Clock

```http
POST /api/v1/matches/:matchId/commands/shot-clock/stop
```

### 19.3 Reset Shot Clock 24

```http
POST /api/v1/matches/:matchId/commands/shot-clock/reset-24
```

Request:

```ts
type ResetShotClock24Command = BaseCommandRequest<{
  reasonCode:
    | "NEW_TEAM_CONTROL_BACKCOURT"
    | "CHANGE_OF_POSSESSION"
    | "ADMIN_CORRECTION"
    | "MANUAL_OVERRIDE";
  reason?: string;
}>;
```

### 19.4 Reset Shot Clock 14

```http
POST /api/v1/matches/:matchId/commands/shot-clock/reset-14
```

Request:

```ts
type ResetShotClock14Command = BaseCommandRequest<{
  reasonCode:
    | "OFFENSIVE_REBOUND_AFTER_RING"
    | "FRONTCOURT_THROW_IN_AFTER_FOUL_OR_VIOLATION"
    | "ADMIN_CORRECTION"
    | "MANUAL_OVERRIDE";
  reason?: string;
}>;
```

### 19.5 Set Shot Clock

```http
POST /api/v1/matches/:matchId/commands/shot-clock/set
```

Permission:

```txt
match.shot_clock.correct
```

Request:

```ts
type SetShotClockCommand = BaseCommandRequest<{
  remainingMs?: number;
  status?: "STOPPED" | "RUNNING" | "OFF";
  reason: string;
}>;
```

---

## 20. Foul Command APIs

### 20.1 Add Player Foul

```http
POST /api/v1/matches/:matchId/commands/fouls/player/add
```

Permission:

```txt
match.foul.operate
```

Request:

```ts
type AddPlayerFoulCommand = BaseCommandRequest<{
  teamId: string;
  playerId: string;
  foulType:
    | "PERSONAL"
    | "TECHNICAL"
    | "UNSPORTSMANLIKE"
    | "DISQUALIFYING"
    | "OFFENSIVE"
    | "BENCH_TECHNICAL"
    | "COACH_TECHNICAL"
    | "OTHER_NEEDS_SOURCE";
  periodNo: number;
  countsAsTeamFoul?: boolean;
  freeThrowsAwarded?: number;
  possessionAfter?: {
    teamId: string;
    throwInLocation?: string;
  };
  note?: string;
}>;
```

Validation:

```txt
player must be active in match roster
foul type must be supported by loaded rule profile
if foul penalty matrix is incomplete, return NEEDS_SOURCE
if player reaches foul limit, append PLAYER_FOULED_OUT event
```

Appended events may include:

```txt
PLAYER_FOUL_ADDED
TEAM_FOUL_ADDED
PLAYER_FOULED_OUT
```

### 20.2 Correct Player Foul

```http
POST /api/v1/matches/:matchId/commands/fouls/player/correct
```

Permission:

```txt
match.foul.correct
```

Request:

```ts
type CorrectPlayerFoulCommand = BaseCommandRequest<{
  targetEventId: string;
  correctedPlayerId?: string;
  correctedFoulType?: string;
  reason: string;
}>;
```

---

## 21. Timeout Command APIs

### 21.1 Grant Timeout

```http
POST /api/v1/matches/:matchId/commands/timeouts/grant
```

Permission:

```txt
match.timeout.operate
```

Request:

```ts
type GrantTimeoutCommand = BaseCommandRequest<{
  teamId: string;
  periodNo: number;
  timeoutType?: "REGULAR";
  gameClockRemainingMs?: number;
}>;
```

Validation:

```txt
team must have timeout quota available
late Q4 limit must be checked for FIBA profile
overtime timeout quota must be checked
```

Appended event:

```txt
TIMEOUT_GRANTED
```

### 21.2 Cancel Timeout by Correction

```http
POST /api/v1/matches/:matchId/commands/timeouts/cancel-by-correction
```

Request:

```ts
type CancelTimeoutByCorrectionCommand = BaseCommandRequest<{
  targetEventId: string;
  reason: string;
}>;
```

---

## 22. Possession / Direction Command APIs

### 22.1 Change Possession

```http
POST /api/v1/matches/:matchId/commands/possession/change
```

Permission:

```txt
match.possession.operate
```

Request:

```ts
type ChangePossessionCommand = BaseCommandRequest<{
  teamId: string;
  reasonCode:
    | "JUMP_BALL"
    | "TURNOVER"
    | "DEFENSIVE_REBOUND"
    | "AFTER_SCORE"
    | "ALTERNATING_POSSESSION"
    | "MANUAL_CORRECTION";
  reason?: string;
}>;
```

### 22.2 Switch Direction

```http
POST /api/v1/matches/:matchId/commands/direction/switch
```

Request:

```ts
type SwitchDirectionCommand = BaseCommandRequest<{
  homeDirection: "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT";
  awayDirection: "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT";
  reasonCode: "HALFTIME" | "OVERTIME" | "MANUAL_CORRECTION";
  reason?: string;
}>;
```

---

## 23. Correction APIs

Correction APIs must create compensating events. They must never mutate original events.

### 23.1 Request Correction

```http
POST /api/v1/matches/:matchId/corrections
```

Permission:

```txt
match.correction.request
```

Request:

```ts
type RequestCorrectionRequest = {
  commandId: string;
  expectedSeq: number;
  correlationId: string;
  targetEventIds: string[];
  correctionType:
    | "SCORE"
    | "FOUL"
    | "CLOCK"
    | "SHOT_CLOCK"
    | "TIMEOUT"
    | "POSSESSION"
    | "ROSTER"
    | "OTHER";
  reason: string;
  proposedAction:
    | "REMOVE_EVENT_EFFECT"
    | "REPLACE_EVENT"
    | "ADD_MISSING_EVENT"
    | "SET_CORRECT_STATE"
    | "ADMIN_NOTE_ONLY";
  payload: unknown;
};
```

Validation:

```txt
reason required
target events must exist
target events must belong to match
user must have correction permission
post-finalization correction may require admin permission
```

Appended event:

```txt
CORRECTION_REQUESTED
```

### 23.2 Apply Correction

```http
POST /api/v1/matches/:matchId/corrections/:correctionId/apply
```

Permission:

```txt
match.correction.apply
```

Appended events:

```txt
CORRECTION_APPLIED
plus domain compensating events
```

### 23.3 Reject Correction

```http
POST /api/v1/matches/:matchId/corrections/:correctionId/reject
```

Permission:

```txt
match.correction.reject
```

Request:

```ts
type RejectCorrectionRequest = {
  reason: string;
};
```

### 23.4 List Corrections

```http
GET /api/v1/matches/:matchId/corrections
```

Permission:

```txt
match.correction.read
```

---

## 24. Projection APIs

Projection APIs are optimized for UI.

### 24.1 Live Scoreboard Projection

```http
GET /api/v1/matches/:matchId/projections/live-scoreboard
```

### 24.2 Operator Score Projection

```http
GET /api/v1/matches/:matchId/projections/operator-score
```

### 24.3 Foul Projection

```http
GET /api/v1/matches/:matchId/projections/fouls
```

### 24.4 Timeout Projection

```http
GET /api/v1/matches/:matchId/projections/timeouts
```

### 24.5 Clock Projection

```http
GET /api/v1/matches/:matchId/projections/clock
```

### 24.6 Shot Clock Projection

```http
GET /api/v1/matches/:matchId/projections/shot-clock
```

### 24.7 Match Summary Projection

```http
GET /api/v1/matches/:matchId/projections/summary
```

### 24.8 Tournament Standings Projection

```http
GET /api/v1/tournaments/:tournamentId/projections/standings
```

### 24.9 Rebuild Projection

```http
POST /api/v1/matches/:matchId/projections/rebuild
```

Permission:

```txt
projection.rebuild
```

Request:

```ts
type RebuildProjectionRequest = {
  projectionName:
    | "live_scoreboard"
    | "operator_score"
    | "fouls"
    | "timeouts"
    | "clock"
    | "shot_clock"
    | "summary"
    | "replay"
    | "all";
  fromSeq?: number;
  reason: string;
};
```

---

## 25. Polling Realtime APIs

These APIs are mandatory for Hostatom/Plesk compatibility.

### 25.1 Poll Match Sync

```http
GET /api/v1/matches/:matchId/sync?lastEventSeq=123&projection=live_scoreboard
```

Response:

```ts
type MatchSyncResponse = {
  matchId: string;
  lastEventSeqFromClient: number;
  currentSeq: number;
  serverTime: string;
  mode: "NO_CHANGES" | "EVENTS" | "FULL_STATE";
  events?: MatchEvent[];
  projection?: unknown;
  requiresFullSync: boolean;
};
```

Rules:

```txt
If currentSeq === lastEventSeq -> NO_CHANGES
If gap is small -> return missed events
If gap is too large -> return full projection
If projection version mismatch -> FULL_STATE
```

### 25.2 Public Match Sync

```http
GET /api/v1/public/matches/:matchId/sync?lastEventSeq=123
```

Public-safe response only.

### 25.3 Recommended Polling Intervals

```txt
Operator control screen: 300-500 ms
Public scoreboard screen: 500-1000 ms
Admin dashboard: 1000-3000 ms
Schedule/standings pages: 5000-30000 ms
```

AI agents must avoid polling intervals below 250 ms unless explicitly approved.

---

## 26. Audit Log APIs

### 26.1 List Audit Logs

```http
GET /api/v1/audit-logs
```

Permission:

```txt
audit.read
```

Query:

```txt
?matchId=...
?tournamentId=...
?actorUserId=...
?action=...
?from=...
?to=...
?page=1
?pageSize=50
```

### 26.2 Get Audit Log Entry

```http
GET /api/v1/audit-logs/:auditLogId
```

Audit logs must include:

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

---

## 27. Rule Profile APIs

### 27.1 List Rule Profiles

```http
GET /api/v1/rule-profiles
```

### 27.2 Get Rule Profile

```http
GET /api/v1/rule-profiles/:ruleProfileId
```

### 27.3 Create Custom Rule Profile

```http
POST /api/v1/rule-profiles
```

Permission:

```txt
rule_profile.create
```

Custom profiles must be marked as local/custom and must not claim to be official unless supported by source document.

### 27.4 Update Rule Profile

```http
PATCH /api/v1/rule-profiles/:ruleProfileId
```

Permission:

```txt
rule_profile.update
```

Official baseline profiles should be immutable after use.

---

## 28. Venue / Court APIs

### 28.1 Create Venue

```http
POST /api/v1/venues
```

### 28.2 List Venues

```http
GET /api/v1/venues
```

### 28.3 Create Court

```http
POST /api/v1/venues/:venueId/courts
```

### 28.4 List Courts

```http
GET /api/v1/venues/:venueId/courts
```

---

## 29. Admin User APIs

### 29.1 Create User

```http
POST /api/v1/users
```

Permission:

```txt
user.create
```

### 29.2 List Users

```http
GET /api/v1/users
```

### 29.3 Update User

```http
PATCH /api/v1/users/:userId
```

### 29.4 Assign Role

```http
POST /api/v1/users/:userId/roles
```

### 29.5 Revoke Role

```http
DELETE /api/v1/users/:userId/roles/:roleId
```

---

## 30. Rate Limiting

Required rate limiting:

```txt
Auth login: strict
Public polling: moderate
Operator commands: strict but practical
Admin APIs: moderate
```

Recommended starting limits:

```txt
POST /auth/login: 5 attempts / 5 minutes / IP
Public sync: 120 requests / minute / IP
Operator sync: 240 requests / minute / authenticated user
Command endpoints: 120 requests / minute / authenticated user
```

Rate limits must not break normal match operation. Adjust after load testing.

---

## 31. Caching Policy

### 31.1 No Cache for Live Operator APIs

Operator APIs must not be cached by browser/proxy.

Headers:

```http
Cache-Control: no-store
```

### 31.2 Public Scoreboard

Public scoreboard may use very short cache only if it does not break live accuracy.

Recommended:

```http
Cache-Control: no-store
```

### 31.3 Static Assets

Frontend assets may be cached aggressively.

---

## 32. Pagination

List endpoints must support pagination.

Standard query:

```txt
?page=1&pageSize=50
```

Response meta:

```ts
type PaginationMeta = {
  page: number;
  pageSize: number;
  total?: number;
  hasNext: boolean;
};
```

For event streams, prefer sequence-based pagination:

```txt
?afterSeq=123&limit=200
```

---

## 33. Sorting and Filtering

Use explicit filters.

Forbidden:

```txt
raw SQL filter from query string
```

Allowed:

```txt
?status=IN_PROGRESS
?teamId=...
?date=...
?from=...
?to=...
```

All filters must be validated.

---

## 34. File Upload APIs

Default scope: not required for MVP.

If implemented later:

```txt
team logos
player photos
tournament documents
```

Security requirements:

```txt
validate file type
validate file size
rename file server-side
do not execute uploaded files
store outside executable path if possible
```

---

## 35. API Security Checklist

Every write endpoint must verify:

```txt
[ ] Authenticated user exists
[ ] CSRF checked if using cookie auth
[ ] Payload validated
[ ] Permission checked server-side
[ ] Scope checked
[ ] Match assignment checked where relevant
[ ] Match state checked
[ ] Rule engine checked where relevant
[ ] expectedSeq checked for match commands
[ ] commandId idempotency checked for commands
[ ] Database transaction used
[ ] Audit log written for correction/privileged actions
[ ] Response returns currentSeq where relevant
```

---

## 36. Transaction Rules

### 36.1 Live Command Transaction

A command transaction should perform:

```txt
1. load match stream row FOR UPDATE or equivalent safe lock
2. verify expectedSeq
3. verify commandId idempotency
4. validate command with rules engine
5. append match_events
6. update match_stream last_seq_no
7. update projection tables or mark projection dirty
8. insert audit log if required
9. commit
10. return currentSeq + projection
```

### 36.2 Rejected Command

Rejected commands must not append domain events.

Optional:

```txt
store rejected command log for security/debugging
```

### 36.3 Projection Failure

If event append succeeds but projection update fails inside the same transaction, rollback both.

If using async/lazy projection later, mark projection as stale and rebuild from events.

For Hostatom simple deployment, prefer same-request projection update.

---

## 37. MariaDB Requirements

Minimum assumptions:

```txt
MariaDB with InnoDB
transaction support enabled
unique constraints available
JSON column support preferred
```

Critical indexes:

```sql
CREATE UNIQUE INDEX ux_match_events_match_seq
ON match_events(match_id, seq_no);

CREATE UNIQUE INDEX ux_match_events_event_id
ON match_events(event_id);

CREATE UNIQUE INDEX ux_command_dedup_match_command
ON command_deduplication(match_id, command_id);

CREATE INDEX ix_match_events_match_type
ON match_events(match_id, event_type);

CREATE INDEX ix_match_events_match_recorded
ON match_events(match_id, recorded_at);
```

---

## 38. Optional Socket.IO Compatibility

If Socket.IO is available, it must follow the same command contract.

Socket events must not bypass REST validation logic.

Recommended approach:

```txt
Socket command -> call same command handler service -> append event -> broadcast projection/event
```

Forbidden:

```txt
Socket command directly mutates projection
Socket command bypasses RBAC
Socket command trusts client score/clock
```

Socket may broadcast:

```txt
match.event.appended
match.projection.updated
match.full_sync_required
```

But clients must still recover using:

```http
GET /api/v1/matches/:matchId/sync?lastEventSeq=...
```

---

## 39. AI Agent Implementation Rules

AI agents must:

```txt
- Implement API routes from this contract.
- Use shared command handler logic for REST and optional socket.
- Validate with Zod.
- Enforce RBAC server-side.
- Use event store as source of truth.
- Return currentSeq for command and sync endpoints.
- Support polling-first realtime.
- Add tests for every endpoint.
```

AI agents must not:

```txt
- Create mutable scoreboard_state as official truth.
- Update match score directly without event.
- Delete match_events.
- Trust client role.
- Trust client-calculated clock as official.
- Implement WebSocket-only realtime.
- Require background workers for MVP correctness.
- Hide correction reason.
- Skip audit log for corrections.
```

---

## 40. Required API Tests

### 40.1 Auth / RBAC

```txt
- unauthenticated write request rejected
- viewer cannot send match command
- scorer cannot operate unassigned match
- admin can manage tournament
- public endpoint read-only
```

### 40.2 Command Tests

```txt
- add score creates SCORE_ADDED event
- duplicate commandId does not duplicate score
- wrong expectedSeq returns 409
- command returns currentSeq
- command updates projection
```

### 40.3 Clock Tests

```txt
- start game clock stores startedAtServerTime
- stop game clock calculates remainingMs server-side
- set clock requires reason
```

### 40.4 Shot Clock Tests

```txt
- reset 24 creates SHOT_CLOCK_RESET_24
- reset 14 creates SHOT_CLOCK_RESET_14
- unsupported shot clock decision returns NEEDS_SOURCE
```

### 40.5 Correction Tests

```txt
- correction requires reason
- correction creates compensating event
- original event remains unchanged
- correction appears in audit log
```

### 40.6 Polling Sync Tests

```txt
- no new events returns NO_CHANGES
- missed events returned after lastEventSeq
- large gap returns FULL_STATE
- public sync hides sensitive metadata
```

### 40.7 Projection Tests

```txt
- projection rebuild from match_events
- projection lastEventSeq equals currentSeq
- projection bug does not mutate events
```

---

## 41. Acceptance Criteria

This API contract is accepted when:

```txt
[ ] Every live command uses BaseCommandRequest.
[ ] Every live command requires expectedSeq.
[ ] Every live command supports commandId idempotency.
[ ] Every write endpoint validates auth and RBAC.
[ ] Public endpoints are read-only.
[ ] All correction endpoints require reason.
[ ] All correction effects are represented as compensating events.
[ ] No endpoint mutates historical match_events.
[ ] Projection endpoints return lastEventSeq/currentSeq.
[ ] Polling sync works without Socket.IO.
[ ] MariaDB transaction rules are followed.
[ ] API tests cover auth, RBAC, commands, correction, replay, and polling sync.
```

---

## 42. Open Product Decisions

The Product Owner must decide:

```txt
1. Should Scorer and Referee be one role or separate roles in MVP?
2. Should Timer and Shot Clock Operator have separate accounts?
3. Should post-finalization correction require Admin only?
4. Should public scoreboard show player foul counts?
5. Should public scoreboard show timeout remaining?
6. Should shot clock correction require reason every time?
7. Should match finalization automatically update tournament standings?
8. What is the maximum acceptable polling delay for match-day use?
9. Should guest players be allowed in tournament rosters?
10. Should public event feed expose correction events or only corrected state?
```

---

## 43. Next Safe Implementation Step

After this file is approved, implement in this order:

```txt
1. ERROR_CODES.md
2. DATABASE_SCHEMA.md
3. EVENT_STORE_SCHEMA.md
4. AUTH_CONTRACTS.md
5. API route skeletons
6. Zod schemas
7. Command handler service
8. Projection read endpoints
9. Polling sync endpoint
10. API integration tests
```
