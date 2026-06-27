# DOMAIN_MODEL.md

## 0. Document Status

**Document type:** Core architecture / domain design  
**Project:** Basketball Scoreboard and Tournament Management Web Application  
**Default rules profile:** FIBA-first  
**Target deployment mode:** Hostatom/Plesk-compatible web deployment with MariaDB, polling-first realtime, and optional Socket.IO when hosting supports it  
**Primary consumers:** AI Coding Agent, backend developer, frontend developer, database designer, QA planner, security reviewer

---

## 1. Purpose

This document defines the domain model for a production-grade Basketball Scoreboard and Tournament Management system.

The goal is to make sure every AI agent and developer understands the difference between:

- Tournament setup data
- Team master data
- Player master data
- Tournament roster
- Match roster
- Live match state
- Append-only match events
- Rebuildable projections
- Audit logs
- User permissions

This document is **not** a full database schema.  
Database table definitions belong in `DATABASE_SCHEMA.md`.

This document is **not** an API contract.  
REST and Socket.IO payloads belong in `API_CONTRACTS.md` and `SOCKET_CONTRACTS.md`.

This document is **not** a full rules engine.  
Rule decisions belong in `RULES_PROFILE_FIBA.md` and `RULES_ENGINE_SPEC.md`.

---

## 2. Non-Negotiable Domain Principles

[SYSTEM RECOMMENDATION]

1. `MatchEvent` is the source of truth for live match state.
2. `MatchSnapshot` is an optimization, not the source of truth.
3. `MatchProjection` is rebuildable and may be deleted/rebuilt.
4. Score, foul, timeout, possession, clock, shot clock, and correction history must be derived from events.
5. Historical events must never be mutated or deleted.
6. Undo/correction must use compensating events.
7. Tournament standings and match summaries must be derived from official match results and match event projections.
8. Client-calculated score, foul, clock, or role state must never be trusted as authoritative.
9. Rule profile must be attached to each match, because future tournaments may use different rules.
10. User permissions must be evaluated against both role and context, for example assigned match, tournament, and organization.

---

## 3. Core Domain Map

```txt
Organization
 ├─ Season
 │   └─ Tournament
 │       ├─ Division
 │       ├─ Stage
 │       │   ├─ Group
 │       │   └─ Match
 │       │       ├─ MatchRoster
 │       │       ├─ MatchOfficial
 │       │       ├─ MatchEvent
 │       │       ├─ MatchSnapshot
 │       │       ├─ MatchProjection
 │       │       └─ AuditLog
 │       ├─ TournamentRoster
 │       └─ StandingsProjection
 │
 ├─ Team
 │   └─ Player
 │
 ├─ Venue
 │   └─ Court
 │
 └─ User
     ├─ Role
     └─ Permission
```

---

## 4. Bounded Contexts

### 4.1 Identity and Access Context

Owns:

- `User`
- `Role`
- `Permission`
- `UserRole`
- assignment of officials/operators to tournaments and matches

Responsibilities:

- Authentication identity
- RBAC
- Contextual match authorization
- Read-only public access policy
- Admin/scorer/viewer permission boundaries

Must not own:

- Match score
- Match fouls
- Game clock
- Tournament standings logic

---

### 4.2 Tournament Management Context

Owns:

- `Organization`
- `Season`
- `Tournament`
- `Division`
- `Stage`
- `Group`
- `TournamentRoster`
- match generation policy
- standings policy

Responsibilities:

- Create tournament
- Configure stages
- Configure divisions
- Register teams
- Approve tournament rosters
- Generate match schedule
- Publish standings
- Publish bracket/progression when applicable

Must not own:

- Live match clock state
- Live shot clock state
- Live score state
- Player foul state during match

---

### 4.3 Team and Roster Context

Owns:

- `Team`
- `Player`
- `TournamentRoster`
- `MatchRoster`

Responsibilities:

- Team master data
- Player master data
- Jersey number management
- Tournament eligibility
- Match lineup
- Starter/substitute availability

Important distinction:

```txt
Team master roster
  = all players known to the team

TournamentRoster
  = players approved for one tournament

MatchRoster
  = players selected/available for one match
```

AI agents must not merge these three concepts into one table or one object.

---

### 4.4 Match Operations Context

Owns:

- `Match`
- `MatchOfficial`
- `MatchEvent`
- `MatchSnapshot`
- `MatchProjection`
- live match command handling
- correction workflow

Responsibilities:

- Match lifecycle
- Period state
- Game clock state
- Shot clock state
- Score state
- Team foul state
- Player foul state
- Timeout state
- Possession state
- Direction state
- Correction state
- Event sequence
- Live projections
- Replay timeline

This is the most important context for the live scoreboard.

---

### 4.5 Rules Context

Owns:

- `RuleProfile`
- rule references
- validation config
- rule version metadata

Responsibilities:

- FIBA default configuration
- Period/overtime config
- Timeout config
- Team foul penalty config
- Player foul limit config
- Shot clock config
- Rule decision references

Must not directly append events.  
The rules engine validates command decisions, then the command handler appends events.

---

### 4.6 Audit and Compliance Context

Owns:

- `AuditLog`
- correction audit metadata
- privileged action logs

Responsibilities:

- Actor tracking
- Role tracking
- Device tracking
- Old value / new value where applicable
- Correction reason
- Correlation ID
- Causation ID
- Event sequence
- Security-sensitive action history

---

## 5. Aggregate Roots

### 5.1 Organization Aggregate

**Aggregate root:** `Organization`

Represents the owner of tournaments and resources, such as a school, league, club, arena, or event organizer.

Owns or groups:

- Seasons
- Tournaments
- Teams
- Venues
- Users
- Roles
- Permissions

Typical fields:

```ts
type Organization = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  timezone: string;
  createdAt: string;
  updatedAt: string;
};
```

Domain rules:

- Organization slug must be unique.
- Archived organizations must not create new tournaments.
- Users may belong to more than one organization only if the product explicitly supports it.

---

### 5.2 Season Aggregate

**Aggregate root:** `Season`

Represents a time-bound competition season under one organization.

Typical fields:

```ts
type Season = {
  id: string;
  organizationId: string;
  name: string;
  startsAt?: string;
  endsAt?: string;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
};
```

Domain rules:

- A season belongs to exactly one organization.
- A tournament may optionally belong to a season.
- Archiving a season must not delete tournaments or match events.

---

### 5.3 Tournament Aggregate

**Aggregate root:** `Tournament`

Represents a competition event.

Owns:

- Divisions
- Stages
- Groups
- Tournament team registrations
- Tournament roster approvals
- Tournament-level rule profile selection
- Tournament schedule settings

Typical fields:

```ts
type Tournament = {
  id: string;
  organizationId: string;
  seasonId?: string;
  name: string;
  code: string;
  defaultRuleProfileId: string;
  timezone: string;
  status:
    | "DRAFT"
    | "REGISTRATION_OPEN"
    | "SCHEDULED"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "ARCHIVED";
  startsAt?: string;
  endsAt?: string;
};
```

Domain rules:

- Tournament code must be unique within organization.
- Tournament cannot start without at least one stage.
- Tournament cannot be completed while any required match is unfinished.
- Tournament standings are projections and must be recomputable from official match results.
- Tournament default rule profile can be overridden at match level only by authorized Admin.

---

### 5.4 Division Aggregate

**Aggregate root:** `Division`

Represents a category inside a tournament.

Examples:

- U12 Boys
- U15 Girls
- Open Men
- Open Women
- 3x3 Mixed
- Senior

Typical fields:

```ts
type Division = {
  id: string;
  tournamentId: string;
  name: string;
  code: string;
  ageCategory?: string;
  genderCategory?: "MALE" | "FEMALE" | "MIXED" | "OPEN";
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
};
```

Domain rules:

- A division belongs to one tournament.
- A match belongs to one division when divisions are enabled.
- A team can be registered in more than one division only if allowed by tournament policy.

---

### 5.5 Stage Aggregate

**Aggregate root:** `Stage`

Represents a phase of competition.

Examples:

- Group stage
- Preliminary round
- Quarterfinals
- Semifinals
- Final
- Classification round
- Round robin stage

Typical fields:

```ts
type Stage = {
  id: string;
  tournamentId: string;
  divisionId?: string;
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
  status: "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "LOCKED";
};
```

Domain rules:

- Stage order must be unique within tournament/division.
- A locked stage must not be modified without Admin correction workflow.
- Stage progression rules must be explicit and not inferred by AI.

---

### 5.6 Group Aggregate

**Aggregate root:** `Group`

Represents a set of teams inside a stage.

Typical fields:

```ts
type Group = {
  id: string;
  stageId: string;
  name: string;
  code: string;
  orderNo: number;
};
```

Domain rules:

- Group belongs to one stage.
- A match may belong to one group.
- Standings are calculated per group when group stage is enabled.
- Group tiebreak logic must come from tournament rules and must not be guessed.

---

### 5.7 Team Aggregate

**Aggregate root:** `Team`

Represents a team master record.

Typical fields:

```ts
type Team = {
  id: string;
  organizationId: string;
  name: string;
  shortName?: string;
  code?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
};
```

Domain rules:

- Team name should be unique within organization or tournament depending on product policy.
- Archiving a team must not remove historical match records.
- Team master data must not be used as match roster directly.
- Team display name at match time should be snapshotted to preserve historical display.

---

### 5.8 Player Aggregate

**Aggregate root:** `Player`

Represents a player master record.

Typical fields:

```ts
type Player = {
  id: string;
  organizationId: string;
  teamId?: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  birthDate?: string;
  gender?: "MALE" | "FEMALE" | "OTHER" | "UNSPECIFIED";
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
};
```

Domain rules:

- Player master record must not be deleted if used in any match event.
- Player display name at match time should be snapshotted in match roster.
- Eligibility belongs to tournament roster, not player master alone.

---

### 5.9 TournamentRoster Aggregate

**Aggregate root:** `TournamentRoster`

Represents players approved for one team in one tournament/division.

Typical fields:

```ts
type TournamentRoster = {
  id: string;
  tournamentId: string;
  divisionId?: string;
  teamId: string;
  playerId: string;
  jerseyNumber?: string;
  status:
    | "PENDING"
    | "APPROVED"
    | "REJECTED"
    | "SUSPENDED"
    | "WITHDRAWN";
  approvedByUserId?: string;
  approvedAt?: string;
};
```

Domain rules:

- Jersey number uniqueness should be enforced within team + tournament/division when tournament policy requires it.
- Only approved players can be added to match roster unless Admin override is allowed.
- Roster changes after tournament starts must be audited.
- Tournament roster is not the same as match roster.

[NEEDS SOURCE] Missing governing document: local tournament eligibility and roster rules.

---

### 5.10 Match Aggregate

**Aggregate root:** `Match`

Represents one scheduled basketball game.

Owns:

- Period state
- Game clock state
- Shot clock state
- Score state
- Team foul state
- Player foul state
- Timeout state
- Possession state
- Correction state
- Event sequence

Typical fields:

```ts
type Match = {
  id: string;
  organizationId: string;
  tournamentId?: string;
  divisionId?: string;
  stageId?: string;
  groupId?: string;
  venueId?: string;
  courtId?: string;

  homeTeamId: string;
  awayTeamId: string;

  ruleProfileId: string;

  scheduledStartAt?: string;
  actualStartAt?: string;
  actualEndAt?: string;

  status:
    | "DRAFT"
    | "SCHEDULED"
    | "READY"
    | "IN_PROGRESS"
    | "PERIOD_BREAK"
    | "TIMEOUT"
    | "SUSPENDED"
    | "ENDED_UNOFFICIAL"
    | "FINAL_OFFICIAL"
    | "CANCELLED"
    | "FORFEITED";

  currentSeqNo: number;
  publicVisibility: "PRIVATE" | "PUBLIC" | "UNLISTED";
};
```

Domain rules:

- Match must have exactly two teams.
- Match must have one rule profile.
- Match events belong to exactly one match.
- Match state must be rebuildable from events.
- Match can become `FINAL_OFFICIAL` only after authorized finalization.
- After finalization, correction requires Admin permission and reason.
- For live operation, command handler must verify `expectedSeq`.

---

### 5.11 MatchRoster Aggregate

**Aggregate root:** `MatchRoster`

Represents players selected for one match.

Typical fields:

```ts
type MatchRoster = {
  id: string;
  matchId: string;
  teamId: string;
  playerId: string;
  tournamentRosterId?: string;

  displayName: string;
  jerseyNumber?: string;

  status:
    | "AVAILABLE"
    | "STARTER"
    | "BENCH"
    | "INACTIVE"
    | "INJURED"
    | "EJECTED"
    | "FOULED_OUT";

  isCaptain?: boolean;
};
```

Domain rules:

- Match roster belongs to one match.
- Player must belong to one of the two teams in the match.
- A player cannot be in both home and away roster for the same match.
- Jersey conflicts should be blocked or explicitly flagged before match start.
- Foul-out status is derived from match events, not manually edited.
- Ejected/disqualified status should be event-derived.

---

### 5.12 MatchOfficial Aggregate

**Aggregate root:** `MatchOfficial`

Represents assignment of users to match operations.

Examples:

- Referee
- Scorer
- Timer
- Shot clock operator
- Assistant scorer
- Admin observer

Typical fields:

```ts
type MatchOfficial = {
  id: string;
  matchId: string;
  userId: string;
  role:
    | "REFEREE"
    | "SCORER"
    | "ASSISTANT_SCORER"
    | "TIMER"
    | "SHOT_CLOCK_OPERATOR"
    | "ADMIN_OBSERVER";
  status: "ASSIGNED" | "ACTIVE" | "REMOVED";
  assignedByUserId: string;
  assignedAt: string;
};
```

Domain rules:

- Operator command permissions are based on assignment and role.
- A Viewer is never a match official.
- Removing an official must be audited.
- Assignment does not override organization-level account suspension.

---

### 5.13 RuleProfile Aggregate

**Aggregate root:** `RuleProfile`

Represents a versioned set of game rules.

Typical fields:

```ts
type RuleProfile = {
  id: string;
  code: string;
  name: string;
  governingBody: "FIBA" | "NBA" | "NCAA" | "LOCAL" | "CUSTOM";
  version: string;
  status: "DRAFT" | "ACTIVE" | "DEPRECATED" | "ARCHIVED";

  periods: number;
  periodDurationSeconds: number;
  overtimeDurationSeconds: number;

  shotClockSeconds: number;
  offensiveReboundShotClockSeconds: number;

  playerFoulLimit: number;
  teamFoulPenaltyThreshold: number;

  timeoutConfigJson: unknown;
  foulPenaltyConfigJson?: unknown;
  shotClockResetConfigJson?: unknown;

  sourceDocumentRef?: string;
};
```

Domain rules:

- Default profile is FIBA unless Product Owner selects another profile.
- Match stores `ruleProfileId` to preserve rule version at game time.
- Do not silently update rules of historical matches.
- RuleProfile changes after use should create new version instead of editing old version.
- Unknown official rule must be marked `[NEEDS SOURCE]`.

---

### 5.14 Venue Aggregate

**Aggregate root:** `Venue`

Represents a physical location.

Typical fields:

```ts
type Venue = {
  id: string;
  organizationId: string;
  name: string;
  address?: string;
  timezone: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
};
```

Domain rules:

- Venue can contain multiple courts.
- Venue timezone should be explicit to avoid schedule confusion.
- Archived venue must not be used for new schedules.

---

### 5.15 Court Aggregate

**Aggregate root:** `Court`

Represents a court inside a venue.

Typical fields:

```ts
type Court = {
  id: string;
  venueId: string;
  name: string;
  code?: string;
  status: "ACTIVE" | "INACTIVE" | "MAINTENANCE" | "ARCHIVED";
};
```

Domain rules:

- Court belongs to one venue.
- Schedule conflict detection should check court + time range.
- Court status must be checked before scheduling.

---

### 5.16 MatchEvent Aggregate

**Aggregate root:** `MatchEvent`

Represents an immutable fact that happened to a match.

Typical fields:

```ts
type MatchEvent = {
  id: string;
  matchId: string;
  seqNo: number;

  eventType: string;
  payload: unknown;

  actorUserId: string;
  actorRole: string;
  deviceId?: string;

  occurredAt: string;
  recordedAt: string;

  correlationId: string;
  causationId?: string;
  commandId?: string;

  ruleProfileId: string;
  reason?: string;

  isCorrection: boolean;
  correctsEventId?: string;
};
```

Domain rules:

- Event is append-only.
- `matchId + seqNo` must be unique.
- `matchId + commandId` should be unique for idempotency.
- Event sequence must increase by one per match.
- Events must be inserted inside a transaction.
- Historical events must never be updated to “fix” a mistake.
- Correction creates new event with reason and links to corrected event.
- Event payload must be validated by event type.

---

### 5.17 MatchSnapshot Aggregate

**Aggregate root:** `MatchSnapshot`

Represents serialized match state at a specific sequence number.

Typical fields:

```ts
type MatchSnapshot = {
  id: string;
  matchId: string;
  lastSeqNo: number;
  stateJson: unknown;
  createdAt: string;
  createdByProcess: string;
};
```

Domain rules:

- Snapshot is an optimization.
- Snapshot must be rebuildable from events.
- Snapshot must not contain hidden facts that are absent from event stream.
- Snapshot can be deleted and rebuilt.
- Snapshot should be created periodically or after important lifecycle events.

---

### 5.18 MatchProjection Aggregate

**Aggregate root:** `MatchProjection`

Represents read-optimized current state for UI.

Projection types:

- `LIVE_SCOREBOARD`
- `OPERATOR_STATE`
- `FOUL_CONTROL`
- `CLOCK_STATE`
- `SHOT_CLOCK_STATE`
- `MATCH_SUMMARY`
- `REPLAY_TIMELINE`
- `PUBLIC_SCOREBOARD`
- `STANDINGS_INPUT`

Typical fields:

```ts
type MatchProjection = {
  id: string;
  matchId: string;
  projectionType: string;
  lastSeqNo: number;
  dataJson: unknown;
  rebuiltAt?: string;
  updatedAt: string;
};
```

Domain rules:

- Projection is rebuildable.
- Projection cannot be source of truth.
- UI may read projection for performance.
- If projection is stale, client must request full sync or missed events.
- Projection update should occur in the same transaction as event append when possible.
- Projection bugs must not corrupt `MatchEvent`.

---

### 5.19 AuditLog Aggregate

**Aggregate root:** `AuditLog`

Represents security-sensitive and correction-sensitive action history.

Typical fields:

```ts
type AuditLog = {
  id: string;
  organizationId: string;
  tournamentId?: string;
  matchId?: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;

  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;

  oldValueJson?: unknown;
  newValueJson?: unknown;

  reason?: string;

  correlationId: string;
  causationId?: string;
  eventSeqNo?: number;

  createdAt: string;
};
```

Domain rules:

- Every correction must create audit log.
- Every role/permission change must create audit log.
- Every match finalization/unfinalization must create audit log.
- Every rejected privileged command should be loggable.
- Post-entry edits require reason.
- Audit log is append-only.

---

### 5.20 User Aggregate

**Aggregate root:** `User`

Represents a system account.

Typical fields:

```ts
type User = {
  id: string;
  organizationId?: string;
  email?: string;
  username?: string;
  displayName: string;
  status: "ACTIVE" | "SUSPENDED" | "INVITED" | "ARCHIVED";
  lastLoginAt?: string;
};
```

Domain rules:

- Suspended users cannot send commands.
- Viewer accounts cannot send match operation commands.
- Public anonymous viewer may read only explicitly public endpoints.
- User identity must be resolved server-side.

---

### 5.21 Role Aggregate

**Aggregate root:** `Role`

Default roles:

- `ADMIN`
- `REFEREE`
- `SCORER`
- `VIEWER`

Extended match operation roles:

- `TIMER`
- `SHOT_CLOCK_OPERATOR`
- `ASSISTANT_SCORER`

Typical fields:

```ts
type Role = {
  id: string;
  organizationId?: string;
  code: string;
  name: string;
  scope: "SYSTEM" | "ORGANIZATION" | "TOURNAMENT" | "MATCH";
};
```

Domain rules:

- Role alone is not enough; command authorization must check context.
- Example: a Scorer may operate only assigned matches.
- Viewer is read-only.
- Admin correction still requires reason.

---

### 5.22 Permission Aggregate

**Aggregate root:** `Permission`

Examples:

- `tournament:create`
- `tournament:update`
- `team:create`
- `player:update`
- `match:schedule`
- `match:operate_score`
- `match:operate_clock`
- `match:operate_shot_clock`
- `match:operate_foul`
- `match:grant_timeout`
- `match:apply_correction`
- `match:finalize`
- `audit:read`

Typical fields:

```ts
type Permission = {
  id: string;
  code: string;
  description: string;
};
```

Domain rules:

- Deny by default.
- Permission must be evaluated server-side.
- Socket messages must run the same authorization policy as REST APIs.
- Client-provided role/permission must be ignored.

---

## 6. Match Aggregate Detail

The `Match` aggregate is the core of the live system.

### 6.1 Match Owns These State Areas

```txt
Match
 ├─ PeriodState
 ├─ GameClockState
 ├─ ShotClockState
 ├─ ScoreState
 ├─ TeamFoulState
 ├─ PlayerFoulState
 ├─ TimeoutState
 ├─ PossessionState
 ├─ DirectionState
 ├─ CorrectionState
 └─ EventSequenceState
```

---

### 6.2 PeriodState

```ts
type PeriodState = {
  currentPeriod: number;
  periodType: "REGULATION" | "OVERTIME";
  status:
    | "NOT_STARTED"
    | "IN_PROGRESS"
    | "ENDED"
    | "BREAK"
    | "MATCH_ENDED";
  regulationPeriods: number;
  overtimeCount: number;
};
```

Derived from events such as:

- `MATCH_READY_CONFIRMED`
- `PERIOD_STARTED`
- `PERIOD_ENDED`
- `OVERTIME_STARTED`
- `MATCH_ENDED`
- `MATCH_FINALIZED`

Domain rules:

- Match starts at period 1.
- Regulation periods follow rule profile.
- Overtime is created only when score is tied at the end of regulation or previous overtime.
- Final result should not be official until authorized finalization.

---

### 6.3 GameClockState

```ts
type GameClockState = {
  status: "STOPPED" | "RUNNING" | "EXPIRED";
  remainingMs: number;
  startedAtServerTime?: string;
  lastStoppedAt?: string;
};
```

Derived from events such as:

- `GAME_CLOCK_SET`
- `GAME_CLOCK_STARTED`
- `GAME_CLOCK_STOPPED`
- `GAME_CLOCK_EXPIRED`
- `PERIOD_STARTED`
- `PERIOD_ENDED`

Domain rules:

- Use deadline-based clock calculation.
- Do not require backend `setInterval`.
- Server computes remaining time on stop.
- Client may render countdown visually, but server remains authoritative.
- Clock correction requires correction event and audit log.

---

### 6.4 ShotClockState

```ts
type ShotClockState = {
  status: "STOPPED" | "RUNNING" | "EXPIRED" | "OFF";
  remainingMs: number;
  startedAtServerTime?: string;
  lastResetToSeconds?: 24 | 14 | number;
};
```

Derived from events such as:

- `SHOT_CLOCK_SET`
- `SHOT_CLOCK_STARTED`
- `SHOT_CLOCK_STOPPED`
- `SHOT_CLOCK_RESET_24`
- `SHOT_CLOCK_RESET_14`
- `SHOT_CLOCK_TURNED_OFF`
- `SHOT_CLOCK_EXPIRED`

Domain rules:

- Shot clock is governed by rule profile.
- Reset decision must come from rules engine.
- Manual shot clock set requires permission and audit reason when used as correction.
- Client display is not authoritative.

---

### 6.5 ScoreState

```ts
type ScoreState = {
  home: number;
  away: number;
  byPeriod: Record<string, { home: number; away: number }>;
  scoringEvents: Array<{
    eventId: string;
    teamId: string;
    playerId?: string;
    points: 1 | 2 | 3;
    period: number;
    clockDisplay?: string;
  }>;
};
```

Derived from events such as:

- `SCORE_ADDED`
- `SCORE_CORRECTED`
- `SCORE_CANCELLED_BY_CORRECTION`

Domain rules:

- Score must never be overwritten directly.
- Subtract score in UI should create correction/compensating event.
- Score by player is optional only if product mode allows team-only scoring.
- Wrong score team/player correction requires reason.

---

### 6.6 TeamFoulState

```ts
type TeamFoulState = {
  byTeamByPeriod: Record<string, Record<string, number>>;
  penaltyStateByTeam: Record<string, boolean>;
};
```

Derived from events such as:

- `PLAYER_FOUL_ADDED`
- `TEAM_FOUL_ADDED`
- `FOUL_CORRECTED`
- `TEAM_FOUL_CANCELLED_BY_CORRECTION`

Domain rules:

- Team foul penalty state must be derived from rule profile.
- Team foul count resets per period according to rule profile.
- Overtime handling must follow rule profile.
- Foul types need `FOUL_PENALTY_MATRIX.md` before full automation.

---

### 6.7 PlayerFoulState

```ts
type PlayerFoulState = {
  playerFouls: Record<string, number>;
  playerStatus: Record<string, "AVAILABLE" | "FOULED_OUT" | "EJECTED" | "DISQUALIFIED">;
};
```

Derived from events such as:

- `PLAYER_FOUL_ADDED`
- `PLAYER_FOUL_CORRECTED`
- `PLAYER_FOULED_OUT`
- `PLAYER_DISQUALIFIED`

Domain rules:

- Foul-out is derived from foul count and rule profile.
- Player foul correction must recompute player status.
- Disqualification logic may require additional official rule source.
- Do not manually edit player foul count without event.

---

### 6.8 TimeoutState

```ts
type TimeoutState = {
  usedByTeamByHalfOrOvertime: Record<string, Record<string, number>>;
  activeTimeout?: {
    teamId: string;
    startedAt: string;
    durationMs: number;
  };
};
```

Derived from events such as:

- `TIMEOUT_GRANTED`
- `TIMEOUT_STARTED`
- `TIMEOUT_ENDED`
- `TIMEOUT_CANCELLED_BY_CORRECTION`

Domain rules:

- Timeout availability must be validated by rules engine.
- Timeout correction must use compensating event.
- Timeout duration belongs to rule profile.
- Timeout display may be rendered client-side but source is event state.

---

### 6.9 PossessionState

```ts
type PossessionState = {
  teamInControlId?: string;
  alternatingPossessionArrowTeamId?: string;
  lastPossessionChangeEventId?: string;
};
```

Derived from events such as:

- `POSSESSION_SET`
- `POSSESSION_CHANGED`
- `ALTERNATING_POSSESSION_SET`
- `ALTERNATING_POSSESSION_SWITCHED`

Domain rules:

- Possession state must be explicit.
- Direction switch is not identical to possession switch.
- Alternating possession logic must not be guessed if source rule is missing.
- Manual possession correction requires event.

---

### 6.10 DirectionState

```ts
type DirectionState = {
  homeAttackingDirection?: "LEFT" | "RIGHT";
  awayAttackingDirection?: "LEFT" | "RIGHT";
  switchedAtHalftime: boolean;
};
```

Derived from events such as:

- `DIRECTION_SET`
- `DIRECTION_SWITCHED`

Domain rules:

- Direction is display/operator state.
- Direction does not itself change possession.
- Direction switch should be expected at halftime but must be manually confirmable.
- UI must show direction clearly.

---

### 6.11 CorrectionState

```ts
type CorrectionState = {
  pendingCorrections: Array<{
    correctionId: string;
    requestedByUserId: string;
    targetEventId: string;
    reason: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "APPLIED";
  }>;
};
```

Derived from events such as:

- `CORRECTION_REQUESTED`
- `CORRECTION_APPROVED`
- `CORRECTION_REJECTED`
- `CORRECTION_APPLIED`

Domain rules:

- Every correction requires reason.
- Correction must link to target event when applicable.
- Correction must create audit log.
- Post-final correction requires elevated permission.

---

### 6.12 EventSequenceState

```ts
type EventSequenceState = {
  currentSeqNo: number;
  lastEventId?: string;
  lastUpdatedAt?: string;
};
```

Domain rules:

- Every command must include `expectedSeq`.
- If `expectedSeq` does not match current sequence, reject command or require resync.
- Duplicate command ID must be idempotently ignored or return existing result.
- Sequence is per match, not global.

---

## 7. Key Relationships

```txt
Organization 1 ── * Tournament
Organization 1 ── * Team
Organization 1 ── * User
Organization 1 ── * Venue

Season 1 ── * Tournament

Tournament 1 ── * Division
Tournament 1 ── * Stage
Tournament 1 ── * Match
Tournament 1 ── * TournamentRoster

Division 1 ── * Stage
Division 1 ── * Match

Stage 1 ── * Group
Stage 1 ── * Match

Group 1 ── * Match

Team 1 ── * Player
Team 1 ── * TournamentRoster
Team 1 ── * MatchRoster

Player 1 ── * TournamentRoster
Player 1 ── * MatchRoster

Match 1 ── * MatchRoster
Match 1 ── * MatchOfficial
Match 1 ── * MatchEvent
Match 1 ── * MatchSnapshot
Match 1 ── * MatchProjection
Match 1 ── * AuditLog

RuleProfile 1 ── * Match

Venue 1 ── * Court
Court 1 ── * Match

User 1 ── * MatchOfficial
User * ── * Role
Role * ── * Permission
```

---

## 8. Entity Ownership Rules

### 8.1 What Match Owns

`Match` owns the live state and event stream.

```txt
Match owns:
- score state
- period state
- game clock state
- shot clock state
- team foul state
- player foul state
- timeout state
- possession state
- direction state
- correction state
- event sequence
```

### 8.2 What Tournament Owns

`Tournament` owns competition structure.

```txt
Tournament owns:
- divisions
- stages
- groups
- tournament team registration
- tournament roster approval
- match scheduling policy
- standings policy
```

### 8.3 What Team Owns

`Team` owns identity and master roster.

```txt
Team owns:
- team name
- logo
- colors
- active/inactive status
- player master association
```

### 8.4 What User Owns

`User` owns identity only.  
Permissions are assigned through roles and contextual assignments.

---

## 9. Lifecycle Models

### 9.1 Tournament Lifecycle

```txt
DRAFT
  -> REGISTRATION_OPEN
  -> SCHEDULED
  -> IN_PROGRESS
  -> COMPLETED
  -> ARCHIVED
```

Rules:

- `DRAFT`: editable setup
- `REGISTRATION_OPEN`: teams/rosters can be added
- `SCHEDULED`: matches exist
- `IN_PROGRESS`: at least one match started
- `COMPLETED`: all required matches finalized
- `ARCHIVED`: read-only historical mode

---

### 9.2 Match Lifecycle

```txt
DRAFT
  -> SCHEDULED
  -> READY
  -> IN_PROGRESS
  -> PERIOD_BREAK
  -> IN_PROGRESS
  -> ENDED_UNOFFICIAL
  -> FINAL_OFFICIAL
```

Alternative states:

```txt
SUSPENDED
CANCELLED
FORFEITED
```

Rules:

- Match cannot be `IN_PROGRESS` without teams, rule profile, and minimum setup.
- `FINAL_OFFICIAL` is read-only except correction workflow.
- `CANCELLED` match should not produce normal standings result unless tournament policy says so.
- `FORFEITED` must be represented as official result event, not silent score edit.

---

### 9.3 Player Match Status Lifecycle

```txt
AVAILABLE
  -> STARTER
  -> BENCH
  -> FOULED_OUT
  -> EJECTED
  -> DISQUALIFIED
```

Rules:

- `FOULED_OUT` is derived from player foul count and rule profile.
- `EJECTED` / `DISQUALIFIED` requires event and rule source.
- `INACTIVE` player should not receive live scoring/foul events without override.

---

### 9.4 Event Lifecycle

```txt
COMMAND_RECEIVED
  -> COMMAND_VALIDATED
  -> EVENT_APPENDED
  -> PROJECTION_UPDATED
  -> CLIENTS_SYNCED
```

Rejected command:

```txt
COMMAND_RECEIVED
  -> COMMAND_REJECTED
  -> OPTIONAL_AUDIT_LOG
```

Rules:

- Rejected command does not append match event.
- Accepted command appends one or more events atomically.
- Projection update failure must be recoverable by rebuild.

---

## 10. Commands and Domain Events

This document defines the domain meaning.  
Command payload details belong in `API_CONTRACTS.md` and `SOCKET_CONTRACTS.md`.

### 10.1 Common Command Metadata

Every command should include:

```ts
type CommandMetadata = {
  commandId: string;
  matchId: string;
  expectedSeq: number;
  correlationId: string;
  clientTimestamp: string;
  actorUserId: string; // server-resolved
  deviceId?: string;
};
```

### 10.2 Match Setup Commands

Examples:

- `CreateMatch`
- `AssignTeamsToMatch`
- `AssignRuleProfileToMatch`
- `AssignCourtToMatch`
- `ConfirmMatchReady`
- `AssignMatchOfficial`

Resulting events:

- `MATCH_CREATED`
- `MATCH_TEAMS_ASSIGNED`
- `MATCH_RULE_PROFILE_ASSIGNED`
- `MATCH_COURT_ASSIGNED`
- `MATCH_READY_CONFIRMED`
- `MATCH_OFFICIAL_ASSIGNED`

---

### 10.3 Live Operation Commands

Examples:

- `StartPeriod`
- `EndPeriod`
- `StartGameClock`
- `StopGameClock`
- `SetGameClock`
- `StartShotClock`
- `StopShotClock`
- `ResetShotClock24`
- `ResetShotClock14`
- `AddScore`
- `AddPlayerFoul`
- `GrantTimeout`
- `ChangePossession`
- `SwitchDirection`

Resulting events:

- `PERIOD_STARTED`
- `PERIOD_ENDED`
- `GAME_CLOCK_STARTED`
- `GAME_CLOCK_STOPPED`
- `GAME_CLOCK_SET`
- `SHOT_CLOCK_STARTED`
- `SHOT_CLOCK_STOPPED`
- `SHOT_CLOCK_RESET_24`
- `SHOT_CLOCK_RESET_14`
- `SCORE_ADDED`
- `PLAYER_FOUL_ADDED`
- `TEAM_FOUL_STATE_UPDATED`
- `TIMEOUT_GRANTED`
- `POSSESSION_CHANGED`
- `DIRECTION_SWITCHED`

---

### 10.4 Correction Commands

Examples:

- `RequestCorrection`
- `ApplyScoreCorrection`
- `ApplyFoulCorrection`
- `ApplyClockCorrection`
- `CancelTimeoutByCorrection`
- `RejectCorrection`

Resulting events:

- `CORRECTION_REQUESTED`
- `CORRECTION_APPLIED`
- `SCORE_CANCELLED_BY_CORRECTION`
- `FOUL_CANCELLED_BY_CORRECTION`
- `CLOCK_CORRECTED`
- `TIMEOUT_CANCELLED_BY_CORRECTION`
- `CORRECTION_REJECTED`

Rules:

- Correction command must include reason.
- Correction must include target event when possible.
- Correction must create audit log.
- Correction must not mutate target event.

---

## 11. Projection Models

Projection details belong in `PROJECTION_MODEL.md`, but the domain requires these projection types.

### 11.1 LiveScoreboardProjection

Used by public scoreboard.

Contains:

- home team display
- away team display
- home score
- away score
- current period
- game clock display
- shot clock display
- team fouls
- timeout indicators
- possession/direction indicators
- match status
- lastSeqNo

### 11.2 OperatorProjection

Used by operator screens.

Contains:

- all live scoreboard fields
- command availability flags
- warning states
- expectedSeq
- connection state hint
- recent events
- pending corrections

### 11.3 FoulProjection

Used by foul control dashboard.

Contains:

- player list
- jersey number
- personal foul count
- team foul count
- foul-out warning
- penalty state
- disqualification warning if implemented

### 11.4 MatchSummaryProjection

Used after match.

Contains:

- final score
- score by period
- team fouls by period
- player fouls
- scoring timeline if tracked
- corrections summary
- official status

### 11.5 ReplayTimelineProjection

Used for historical replay.

Contains:

- ordered event timeline
- seqNo
- event type
- display text
- actor
- clock display
- resulting score/foul/clock state

---

## 12. Hostatom / MariaDB Compatibility Rules

[SYSTEM RECOMMENDATION]

Because the target environment may be Shared Hosting under Plesk:

1. Domain model must not require always-on background workers.
2. Clocks must use deadline-based state.
3. Realtime must support polling by `lastEventSeq`.
4. Socket.IO is optional, not required for correctness.
5. MariaDB transactions must protect event append and sequence updates.
6. All projections must be rebuildable from MariaDB event store.
7. Scheduled jobs should be optional or manually triggerable.
8. System must degrade gracefully when WebSocket is unavailable.

---

## 13. Domain Invariants

### 13.1 Match Invariants

- Match has exactly two teams.
- Home and away team must be different.
- Match has exactly one active rule profile.
- Event sequence is strictly increasing per match.
- Score cannot be negative.
- Team fouls cannot be negative.
- Player fouls cannot be negative.
- Final official match cannot be modified except through correction workflow.
- Public scoreboard is read-only.

### 13.2 Event Invariants

- Event cannot exist without match.
- Event must have unique `matchId + seqNo`.
- Event must include actor metadata.
- Event must include correlation ID.
- Event created by correction must include reason.
- Event payload must validate against event type schema.
- Event must not be physically deleted.

### 13.3 Roster Invariants

- Match roster player must belong to one team in the match.
- Same player must not appear for both teams in same match.
- Jersey number conflicts must be detected.
- Tournament roster approval is separate from match roster selection.
- Historical roster display should remain stable even if player/team master data changes later.

### 13.4 Permission Invariants

- Viewer cannot send commands.
- Public scoreboard cannot send commands.
- Referee/Scorer can operate only assigned matches unless Admin override exists.
- Admin actions still require audit trail where sensitive.
- Permission is checked server-side on every API/socket command.

---

## 14. Naming Conventions

### 14.1 Entity Names

Use singular PascalCase in TypeScript domain models:

```txt
Tournament
Match
MatchEvent
MatchProjection
AuditLog
```

Use snake_case for database tables:

```txt
tournaments
matches
match_events
match_projections
audit_logs
```

### 14.2 IDs

Use UUID or ULID.

Recommended:

```txt
UUID v7 or ULID
```

Rationale:

- sortable enough for logs
- unique across distributed clients
- friendly for event IDs

### 14.3 Status Values

Use uppercase enum-like strings:

```txt
DRAFT
SCHEDULED
IN_PROGRESS
FINAL_OFFICIAL
ARCHIVED
```

### 14.4 Event Types

Use uppercase snake case:

```txt
SCORE_ADDED
GAME_CLOCK_STARTED
PLAYER_FOUL_ADDED
CORRECTION_APPLIED
```

---

## 15. What AI Agent Must Not Do

AI agent must not:

1. Collapse tournament roster and match roster into one concept.
2. Store score only in a mutable `scoreboard_state` table.
3. Delete or update `match_events` to fix mistakes.
4. Use client-provided role or permission as truth.
5. Put FIBA rules directly inside React components.
6. Use backend `setInterval` as the authoritative clock.
7. Assume Socket.IO always works on Shared Hosting.
8. Generate NBA/NCAA rules without loaded source documents.
9. Finalize a match by only setting score values.
10. Recompute standings from mutable scores without official result events.
11. Treat projections as source of truth.
12. Allow correction without reason.
13. Allow public scoreboard clients to send operation commands.
14. Skip concurrency checks with `expectedSeq`.
15. Add new event type without defining payload, validation, permission, projection effect, and tests.

---

## 16. Minimum TypeScript Domain File Structure

Recommended structure:

```txt
/src
  /domain
    /identity
      user.entity.ts
      role.entity.ts
      permission.entity.ts

    /tournament
      organization.entity.ts
      season.entity.ts
      tournament.entity.ts
      division.entity.ts
      stage.entity.ts
      group.entity.ts

    /team
      team.entity.ts
      player.entity.ts
      tournament-roster.entity.ts
      match-roster.entity.ts

    /venue
      venue.entity.ts
      court.entity.ts

    /rules
      rule-profile.entity.ts

    /match
      match.entity.ts
      match-official.entity.ts
      match-event.entity.ts
      match-snapshot.entity.ts
      match-projection.entity.ts
      match-state.types.ts

    /audit
      audit-log.entity.ts
```

---

## 17. Minimum Domain Tests

Every implementation must include tests for:

### 17.1 Match

- Create match with two teams
- Reject match with same team on both sides
- Attach FIBA rule profile
- Move match from scheduled to ready
- Start match
- Finalize match
- Reject operation after finalization without correction permission

### 17.2 Event Sequence

- Append first event with seq 1
- Reject duplicate seq
- Reject stale `expectedSeq`
- Deduplicate duplicate `commandId`
- Rebuild state from event stream

### 17.3 Score

- Add 1, 2, 3 points
- Reject negative score
- Correct wrong score with compensating event
- Rebuild score by period

### 17.4 Fouls

- Add player foul
- Derive player foul count
- Derive team foul count
- Derive penalty state
- Derive foul-out state
- Correct wrong foul assignment

### 17.5 Timeout

- Grant timeout within quota
- Reject timeout over quota
- Correct timeout event
- Derive timeout count by half/overtime

### 17.6 Clock

- Start game clock
- Stop game clock
- Calculate remaining time deadline-based
- Correct clock value
- Expire period

### 17.7 Realtime Recovery

- Client requests events after seq
- Client receives missed events
- Client requests full projection sync
- Projection lastSeqNo matches event stream

### 17.8 Security

- Viewer cannot operate match
- Public scoreboard cannot operate match
- Scorer can operate assigned match
- Scorer cannot operate unassigned match
- Admin correction requires reason

---

## 18. Acceptance Criteria

The domain model is acceptable when:

- Every core entity has clear ownership.
- `Match` aggregate ownership is explicit.
- `MatchEvent` is the only source of truth for live match facts.
- Tournament, roster, match, projection, and audit concepts are not mixed.
- MariaDB/Hostatom constraints are acknowledged.
- RuleProfile is attached to match.
- Correction workflow is domain-level, not UI-only.
- RBAC and contextual permission requirements are visible in the model.
- The model can support live scoreboard, operator dashboards, match summary, replay, and tournament standings.
- AI agent can implement database/API/socket/UI files without guessing entity meanings.

---

## 19. Open Decisions for Product Owner

[ASSUMPTION]

These require Product Owner confirmation before final implementation:

1. Will one organization manage multiple tournaments?
2. Will one user be allowed in multiple organizations?
3. Must the MVP support player-level scoring, or team-only scoring first?
4. Must jersey numbers be unique per tournament team?
5. Will tournament roster approval be required before match roster?
6. Will public viewers require login, or can public scoreboard be anonymous?
7. Will match officials be assigned per match or can any scorer operate any match?
8. Will the system support multiple courts simultaneously in MVP?
9. Will tournament standings be included in MVP or Phase 2?
10. Will local rule overrides be allowed in admin UI?

Until confirmed, AI agent must implement the safer default:

```txt
single organization
team-only scoring allowed but player scoring model prepared
match-specific official assignment
public scoreboard read-only
FIBA default rule profile
event sourcing enabled from day one
```

---

## 20. Next Related Documents

After this file, AI agent must read or create:

```txt
EVENT_MODEL.md
PROJECTION_MODEL.md
DATABASE_SCHEMA.md
API_CONTRACTS.md
SOCKET_CONTRACTS.md
SECURITY_MODEL.md
TEST_PLAN.md
```

