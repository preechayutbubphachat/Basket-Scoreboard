# AI_AGENT_RULES.md

> Version: 0.1.0  
> Status: Draft for project foundation  
> Owner: Product Owner / System Architect  
> Applies to: AI Coding Agents, AI Copilots, Code Review Agents, Refactor Agents, Test Agents, Documentation Agents  
> Project: Basketball Scoreboard and Tournament Management Web Application

---

## 0. Purpose

This document defines the operating rules for every AI agent working on this project.

The goal is to prevent the AI agent from producing quick demo-style code that breaks production requirements such as:

- official basketball rule correctness
- event history
- replay
- correction and undo
- audit logs
- realtime synchronization
- socket reconnect recovery
- role-based access control
- tournament consistency
- testability

This file is the constitution of the AI development workflow.

If any task instruction conflicts with this document, the AI agent must follow this document first and report the conflict.

---

## 1. Mission

Build a production-grade web-based Basketball Scoreboard and Tournament Management system.

The system must support live basketball match operation, tournament management, multi-screen realtime dashboards, official-style match records, correction workflows, audit logs, historical replay, and role-based access control.

The system must not be designed as a simple mutable scoreboard state application.

---

## 2. Project Context

The previous scoreboard system already supports:

- two team names
- quarter duration
- number of quarters
- team foul limit
- shot clock
- start and stop game clock
- reset shot clock
- add and subtract score
- add and subtract fouls
- switch possession or offensive direction
- two-screen operation:
  - operator screen
  - public scoreboard screen

The new system must expand this into a full basketball operations platform with:

- tournament management
- team management
- player management
- roster management
- match scheduling
- game clock
- shot clock
- score control
- team fouls
- player fouls
- timeout
- overtime
- main live scoreboard dashboard
- match pairing dashboard
- score control dashboard
- foul control dashboard
- match summary dashboard
- historical replay
- undo, correction, and audit log
- multi-screen realtime operation
- role-based access control

---

## 3. Primary Operating Principle

### 3.1 Match events are the source of truth

The AI agent must treat `match_events` as the authoritative source of truth for match state.

The current scoreboard state, public display state, foul dashboard state, summary dashboard, replay timeline, and tournament standings must be derived from events, snapshots, or projections.

The AI agent must not design the system so that a mutable `scoreboard_state` row is the only source of truth.

Correct pattern:

```text
Command
  -> validate permission
  -> validate payload
  -> validate rule
  -> append match_event
  -> update snapshot/projection
  -> broadcast derived state
```

Incorrect pattern:

```text
Client sends new score
  -> server trusts score
  -> update scoreboard_state directly
  -> broadcast new score
```

---

## 4. Non-Negotiable Rules

The following rules are mandatory.

### 4.1 Event sourcing and auditability

- Treat `match_events` as the source of truth.
- Use append-only event streams.
- Never mutate historical match events.
- Never delete historical match events.
- Use compensating events for undo and correction.
- Every event must be reconstructable and replayable.
- Every correction must preserve the original event.
- Every correction must include a reason.
- Every correction must create an audit log entry.
- Every correction must include actor, role, device, timestamp, correlation ID, causation ID, and event sequence.

### 4.2 Rules correctness

- Use FIBA as the default rules profile.
- Do not invent official basketball rules.
- Do not hard-code league-specific assumptions into generic domain logic.
- If a rule is missing, mark it as:

```text
[NEEDS SOURCE] Missing governing document: <document name or rule area>
```

- If NBA, NCAA, or local rules are requested but not loaded, do not guess.
- Rules must be represented as configurable rule profiles where possible.

### 4.3 Security and authorization

- Enforce RBAC on every REST API.
- Enforce RBAC on every Socket.IO command.
- Use deny-by-default authorization.
- Never trust role, permission, score, foul, clock, timeout, possession, or match state sent from the client.
- Validate every command payload server-side.
- Public scoreboard clients must be read-only.
- Operator clients may send commands only when authorized for the match.
- Admin permissions must not bypass audit requirements.
- Correction workflows must require authorization and reason.

### 4.4 Realtime safety

- Use one socket room per match.
- Do not rely on socket broadcast as persistence.
- Every operator command must include:
  - `commandId`
  - `matchId`
  - `expectedSeq`
  - `correlationId`
  - `timestamp`
  - `payload`
- On reconnect, clients must hydrate latest state and catch up missed events from `lastEventSeq`.
- Duplicate commands must be idempotently rejected or safely ignored.
- Concurrent commands must be protected by optimistic concurrency.

### 4.5 Database safety

- Prefer PostgreSQL.
- Use `match_events` as append-only event store.
- Use `match_snapshots` for fast rehydration.
- Use projections/read models for UI.
- Add unique constraint on `(match_id, seq_no)`.
- Use optimistic concurrency with `expected_last_event_seq`.
- Use database transactions when appending events and updating snapshots/projections.
- Do not update projections without ensuring event append succeeded.
- Projection data must be rebuildable from events.

### 4.6 UX safety

- Live operator screens must optimize for:
  - speed
  - error prevention
  - high contrast
  - touchscreen use
  - keyboard shortcuts
  - large buttons
  - clear state feedback
  - full-screen operation
- Public scoreboard must optimize for:
  - distant readability
  - 16:9 display
  - high contrast
  - stable layout
  - low visual clutter
- Correction actions must require confirmation and reason.
- Dangerous commands must not be triggered accidentally.

### 4.7 Testing requirements

Every feature must include tests for:

- game clock
- shot clock
- scoring
- team fouls
- player fouls
- timeout
- overtime
- correction
- replay
- RBAC
- socket reconnect
- duplicate events
- concurrent operator actions

No implementation is considered complete without tests or a clear explanation of why tests could not be added.

---

## 5. Required Files Before Coding

Before writing or modifying production code, the AI agent must read and follow these files:

```text
/docs/agent/AI_AGENT_RULES.md
/docs/product/PROJECT_BRIEF.md
/docs/product/USER_ROLES_AND_PERMISSIONS.md
/docs/rules/RULES_PROFILE_FIBA.md
/docs/rules/RULES_ENGINE_SPEC.md
/docs/architecture/ARCHITECTURE_PRINCIPLES.md
/docs/architecture/DOMAIN_MODEL.md
/docs/architecture/EVENT_MODEL.md
/docs/architecture/PROJECTION_MODEL.md
/docs/architecture/CORRECTION_MODEL.md
/docs/architecture/AUDIT_LOG_MODEL.md
/docs/api/API_CONTRACTS.md
/docs/api/SOCKET_CONTRACTS.md
/docs/database/DATABASE_SCHEMA.md
/docs/database/EVENT_STORE_SCHEMA.md
/docs/security/SECURITY_MODEL.md
/docs/quality/TEST_PLAN.md
/docs/quality/ACCEPTANCE_CRITERIA.md
/docs/quality/EDGE_CASES.md
```

If one or more required files are missing, the AI agent must report the missing file and proceed only with safe assumptions when explicitly allowed.

---

## 6. Source Hierarchy

When information conflicts, follow this priority order:

1. Project owner explicit decision
2. Official governing rule document loaded in the project knowledge base
3. Approved project specification files in `/docs`
4. Existing codebase behavior with passing tests
5. Architecture principles in this file
6. AI model general knowledge

The AI agent must not use general knowledge to override loaded official rules or approved project specs.

---

## 7. Statement Labels

The AI agent must label important design statements using these labels:

```text
[OFFICIAL RULE]
```

Use only when the statement is verified from a loaded governing rules document.

```text
[SYSTEM RECOMMENDATION]
```

Use for architecture, UX, database, API, security, QA, and implementation guidance.

```text
[ASSUMPTION]
```

Use for project decisions that are not yet confirmed by official rules or approved specs.

```text
[NEEDS SOURCE]
```

Use when a rule or regulation cannot be verified from loaded documents.

Examples:

```text
[OFFICIAL RULE] FIBA regulation games use 4 periods of 10 minutes.
```

```text
[SYSTEM RECOMMENDATION] Store match events append-only and rebuild scoreboard projections from the event stream.
```

```text
[ASSUMPTION] The first MVP will support only FIBA profile until another rule profile is loaded.
```

```text
[NEEDS SOURCE] Missing governing document: NCAA men's basketball shot clock reset rules.
```

---

## 8. Agent Roles

The AI agent may act in one or more of these roles depending on the task.

### 8.1 Product Analyst

Responsibilities:

- clarify requirements
- identify missing scope
- define acceptance criteria
- prevent feature creep

### 8.2 Basketball Rules Analyst

Responsibilities:

- apply loaded rule profiles
- identify missing governing documents
- translate rules into rule tables and state machines
- avoid inventing official rules

### 8.3 Product Architect

Responsibilities:

- define modules
- define dashboards
- define user workflows
- align MVP scope with production roadmap

### 8.4 Database Designer

Responsibilities:

- design PostgreSQL schema
- preserve event sourcing
- define constraints
- define indexes
- define migrations
- protect auditability

### 8.5 Backend Architect

Responsibilities:

- design command handlers
- validate payloads
- enforce permissions
- manage event append transactions
- build projections
- handle concurrency

### 8.6 Frontend Architect

Responsibilities:

- design operator UI states
- design public scoreboard UI
- handle socket reconnect
- prevent mis-taps
- show state feedback

### 8.7 QA Planner

Responsibilities:

- create unit tests
- create integration tests
- create E2E tests
- create reconnect tests
- create replay tests
- create RBAC tests

### 8.8 Security Reviewer

Responsibilities:

- enforce deny-by-default authorization
- review API and socket permissions
- verify audit logs
- check sensitive data exposure
- review correction workflow

---

## 9. Implementation Answer Format

When asked to design, implement, review, or modify anything related to code, database, API, socket, or architecture, the AI agent must answer using this structure:

```text
1. Assumptions
2. Domain model
3. Event model
4. API contracts
5. Socket contracts
6. Database changes
7. UI states
8. Test cases
9. Edge cases
10. Next safe implementation step
```

If a section is not applicable, write:

```text
Not applicable for this task.
```

Do not silently omit sections for implementation tasks.

---

## 10. Command Handling Rules

All live match operations must be modeled as commands that result in events.

### 10.1 Command input format

Every command must include:

```ts
type MatchCommand = {
  commandId: string;
  matchId: string;
  expectedSeq: number;
  correlationId: string;
  timestamp: string;
  actorUserId?: string;
  deviceId?: string;
  payload: unknown;
};
```

The server must derive `actorUserId`, role, and permissions from authenticated session context, not from untrusted client payload.

### 10.2 Command processing flow

Required flow:

```text
1. Authenticate user
2. Authorize command for match
3. Validate payload schema
4. Load current match snapshot/projection
5. Verify expected sequence
6. Apply rules engine validation
7. Create domain event
8. Append event transactionally
9. Update snapshot/projection
10. Write audit log if required
11. Broadcast derived event/state to socket rooms
12. Return accepted/rejected response
```

### 10.3 Command rejection

A command must be rejected when:

- user is unauthenticated
- user lacks permission
- match does not exist
- match is not assigned to operator
- `expectedSeq` is stale
- payload is invalid
- rule validation fails
- command is duplicated
- match state does not allow the action
- correction reason is missing
- rule profile is missing for rule-dependent command

Use structured error codes.

---

## 11. Event Model Rules

### 11.1 Event metadata

Every event must include:

```ts
type MatchEvent = {
  eventId: string;
  matchId: string;
  seqNo: number;
  eventType: string;
  payload: unknown;
  actorUserId: string;
  actorRole: string;
  deviceId: string;
  occurredAt: string;
  recordedAt: string;
  correlationId: string;
  causationId?: string;
  ruleProfileId: string;
  reason?: string;
};
```

### 11.2 Required event categories

The agent must design events in these categories:

```text
MATCH_LIFECYCLE
PERIOD
GAME_CLOCK
SHOT_CLOCK
SCORE
TEAM_FOUL
PLAYER_FOUL
TIMEOUT
POSSESSION
DIRECTION
CORRECTION
AUDIT
TOURNAMENT_RESULT
```

### 11.3 Event naming convention

Use past-tense event names:

Correct:

```text
SCORE_ADDED
PLAYER_FOUL_CHARGED
GAME_CLOCK_STARTED
SHOT_CLOCK_RESET_TO_14
TIMEOUT_GRANTED
CORRECTION_APPLIED
```

Incorrect:

```text
ADD_SCORE
CHARGE_FOUL
START_CLOCK
RESET_SHOTCLOCK
GRANT_TIMEOUT
APPLY_CORRECTION
```

Commands are imperative.
Events are past-tense facts.

### 11.4 Event immutability

The AI agent must not generate code that updates these fields after insertion:

- `eventId`
- `matchId`
- `seqNo`
- `eventType`
- `payload`
- `actorUserId`
- `actorRole`
- `deviceId`
- `occurredAt`
- `recordedAt`
- `correlationId`
- `causationId`
- `ruleProfileId`
- `reason`

If correction is required, append a new correction event.

---

## 12. Correction and Undo Rules

### 12.1 Correction principle

Undo and correction must be implemented through compensating events.

The system must preserve the original event and add a new event that explains the correction.

### 12.2 Required correction metadata

Every correction must include:

- original event ID
- correction event ID
- correction type
- reason
- actor user ID
- actor role
- device ID
- old value
- new value
- timestamp
- match ID
- previous sequence
- new sequence
- correlation ID
- causation ID

### 12.3 Correction examples

Correct:

```text
SCORE_ADDED seq=101
SCORE_CORRECTED seq=108 reason="Wrong team selected"
```

Incorrect:

```text
UPDATE match_events SET payload = ...
```

Correct:

```text
PLAYER_FOUL_CHARGED seq=44
PLAYER_FOUL_CORRECTED seq=45 reason="Foul assigned to wrong player"
```

Incorrect:

```text
DELETE FROM player_fouls WHERE ...
```

---

## 13. Rule Profile Policy

### 13.1 Default rule profile

FIBA is the default rule profile.

### 13.2 Missing rule policy

If a requested rule is not available in the loaded knowledge base, the agent must write:

```text
[NEEDS SOURCE] Missing governing document: <rule area>
```

### 13.3 Multi-profile policy

The agent must design rule profiles so that NBA, NCAA, or local competition rules can be added later without rewriting core domain logic.

Do not hard-code these into generic logic:

- period duration
- number of periods
- overtime duration
- foul-out limit
- team foul penalty threshold
- timeout allocation
- shot clock reset rules
- possession rules
- tie-break rules
- roster eligibility rules

### 13.4 Rule profile object example

```ts
type RuleProfile = {
  ruleProfileId: string;
  code: 'FIBA_2024' | 'NBA_2025_26' | 'NCAA_PENDING' | string;
  periodCount: number;
  periodDurationSeconds: number;
  overtimeDurationSeconds: number;
  shotClockSeconds: number;
  offensiveReboundShotClockSeconds: number;
  playerFoulLimit: number;
  teamFoulPenaltyThreshold: number;
  timeoutPolicy: unknown;
  shotClockResetPolicy: unknown;
  foulPenaltyMatrix: unknown;
};
```

---

## 14. RBAC and Permission Rules

### 14.1 Default roles

Use these default roles:

```text
Admin
Referee / Scorer
Viewer
```

### 14.2 Admin

Admin can manage:

- tournaments
- teams
- players
- rosters
- matches
- users
- rule profiles
- corrections
- audit logs

Admin still must provide correction reasons for post-entry edits.

### 14.3 Referee / Scorer

Referee / Scorer can operate assigned matches:

- score
- player fouls
- team fouls
- game clock
- shot clock
- timeout
- possession
- correction request

Referee / Scorer must not operate unassigned matches.

### 14.4 Viewer

Viewer is read-only:

- public scoreboard
- schedule
- standings
- match summary

Viewer must never send match operation commands.

### 14.5 Permission enforcement

Permissions must be checked:

- on REST endpoints
- on Socket.IO connection
- on every socket message
- inside command handlers
- before correction operations
- before replay export
- before audit log access

Do not rely only on frontend hiding buttons.

---

## 15. Socket.IO Rules

### 15.1 Room naming

Use these room patterns:

```text
match:{matchId}:public
match:{matchId}:operator
match:{matchId}:admin
```

### 15.2 Public room

Public room receives read-only projection updates:

- score
- period
- game clock
- shot clock
- team fouls
- timeout count
- possession indicator
- match status

Public room must not receive sensitive audit metadata.

### 15.3 Operator room

Operator room receives:

- full operator projection
- command accepted/rejected messages
- validation errors
- current sequence
- reconnect instructions
- correction state

### 15.4 Admin room

Admin room may receive:

- audit events
- correction requests
- match operation logs
- conflict warnings

### 15.5 Reconnect protocol

Client reconnect request:

```json
{
  "matchId": "match_123",
  "lastEventSeq": 120
}
```

Server response:

```json
{
  "matchId": "match_123",
  "currentSeq": 128,
  "snapshot": {},
  "missedEvents": [],
  "requiresFullSync": false
}
```

If missed events cannot be safely replayed, server must return:

```json
{
  "requiresFullSync": true,
  "reason": "EVENT_GAP_TOO_LARGE_OR_SNAPSHOT_REQUIRED"
}
```

---

## 16. API Rules

### 16.1 REST API policy

REST APIs should be used for:

- tournament management
- team management
- player management
- roster management
- match setup
- summary
- historical replay
- audit log review
- correction approval workflow

Live match control may use Socket.IO commands, but the backend command validation rules must be shared.

### 16.2 API response format

Use consistent response format:

```ts
type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    correlationId?: string;
    currentSeq?: number;
  };
};
```

### 16.3 Error code examples

```text
UNAUTHENTICATED
FORBIDDEN
MATCH_NOT_FOUND
MATCH_NOT_ASSIGNED
INVALID_PAYLOAD
INVALID_EXPECTED_SEQ
DUPLICATE_COMMAND
RULE_PROFILE_NOT_LOADED
RULE_VIOLATION
CORRECTION_REASON_REQUIRED
EVENT_APPEND_FAILED
PROJECTION_UPDATE_FAILED
SOCKET_RESYNC_REQUIRED
```

---

## 17. Database Rules

### 17.1 Required core tables

The AI agent must preserve these core concepts:

```text
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
rule_profiles
match_events
match_snapshots
match_projections
audit_logs
```

### 17.2 match_events constraints

Minimum constraints:

```sql
UNIQUE (match_id, seq_no)
UNIQUE (event_id)
NOT NULL event_type
NOT NULL payload
NOT NULL actor_user_id
NOT NULL recorded_at
```

### 17.3 Transaction requirements

Event append must be transactionally safe.

Required transaction flow:

```text
BEGIN
  lock or version-check match stream
  verify expected sequence
  insert match_event
  update match current sequence
  update snapshot/projection if applicable
  insert audit log if applicable
COMMIT
```

If transaction fails, do not broadcast success.

---

## 18. Projection Rules

### 18.1 Projection principle

Projections are read models.

They are allowed to be updated, deleted, and rebuilt.

Events are not.

### 18.2 Required projections

At minimum:

```text
live_scoreboard_projection
operator_match_projection
score_control_projection
foul_control_projection
clock_projection
shot_clock_projection
timeout_projection
match_summary_projection
replay_timeline_projection
tournament_standings_projection
```

### 18.3 Projection rebuild

The AI agent must preserve a way to rebuild projections from event streams.

Any projection update logic must be deterministic.

---

## 19. UI Rules

### 19.1 Operator UI

Operator screens must show:

- current match
- team names
- current score
- current period
- game clock
- shot clock
- team fouls
- player fouls
- timeouts
- possession
- current sequence number
- connection status
- command status
- correction mode status

### 19.2 Public scoreboard UI

Public scoreboard must show:

- home team name
- away team name
- home score
- away score
- period
- game clock
- shot clock
- team fouls
- timeout count if configured
- possession arrow if configured

### 19.3 Correction UI

Correction UI must require:

- selected event or field
- old value
- new value
- correction reason
- confirmation
- authorized role

### 19.4 UI safety

The AI agent must avoid:

- tiny buttons for live operations
- dangerous one-click destructive actions
- hiding connection state
- hiding command failures
- updating UI optimistically without reconciliation
- showing public viewers unauthorized audit details

---

## 20. Testing Rules

### 20.1 Unit tests

Required for:

- rules engine
- command validators
- event reducers
- projection builders
- permission checks
- correction logic
- sequence validation
- duplicate command handling

### 20.2 Integration tests

Required for:

- command -> event append -> projection update
- correction workflow
- socket command authorization
- reconnect with missed events
- stale expected sequence rejection
- transaction rollback on projection failure

### 20.3 E2E tests

Required for:

- start match
- add score
- add foul
- timeout
- period end
- overtime
- correction
- public scoreboard update
- operator reconnect
- viewer read-only enforcement

### 20.4 Test naming

Use descriptive names:

```text
should_reject_add_score_when_expected_seq_is_stale
should_append_compensating_event_when_score_is_corrected
should_rebuild_live_scoreboard_projection_from_match_events
should_deny_viewer_socket_command
should_resync_operator_after_reconnect_with_missed_events
```

---

## 21. Required Output for Code Changes

For every code change, the AI agent must provide:

```text
## Implementation Summary

## Files Changed

## Reason for Change

## Architecture Impact

## Event Model Impact

## API Impact

## Socket Impact

## Database Impact

## Security Impact

## Tests Added or Updated

## Risks

## Rollback Impact

## Manual Verification Steps
```

If no tests were added, the AI agent must explain why.

---

## 22. When the Agent Must Ask Before Proceeding

The AI agent must stop and ask for approval before:

- changing event model semantics
- renaming event types
- changing correction behavior
- changing rule profile values
- changing authorization rules
- removing audit fields
- deleting or rewriting migrations
- replacing PostgreSQL with another database
- changing Socket.IO protocol
- removing reconnect recovery
- removing tests
- making destructive data changes
- simplifying event sourcing into mutable CRUD state
- hard-coding NBA, NCAA, or local rules
- changing public scoreboard display requirements
- adding external services that affect deployment or cost

---

## 23. When the Agent Must Not Ask and Should Proceed Safely

The AI agent may proceed without asking when:

- adding missing tests for existing behavior
- improving type safety without changing behavior
- adding payload validation
- adding permission checks
- adding audit fields required by this document
- fixing spelling or documentation formatting
- refactoring with no behavior change and tests pass
- adding error handling for existing command paths
- improving reconnect safety without protocol breakage

---

## 24. Forbidden Outputs

The AI agent must not output:

- code that trusts client-sent score as truth
- code that trusts client-sent role as truth
- code that updates historical events
- code that deletes match events for undo
- socket commands without authorization checks
- API endpoints without server-side validation
- correction code without reason
- rule logic with no source or rule profile
- tournament standings logic that cannot be recomputed
- UI that hides command failure
- tests that only assert happy path
- migrations that drop production data without explicit approval

---

## 25. Branch and Commit Rules

Recommended branch naming:

```text
feature/<area>-<short-description>
fix/<area>-<short-description>
test/<area>-<short-description>
docs/<area>-<short-description>
```

Recommended commit message format:

```text
<type>(<scope>): <summary>
```

Examples:

```text
feat(events): add match event append service
fix(socket): reject viewer operator commands
test(clock): add stale expected sequence tests
docs(agent): add AI agent governance rules
```

---

## 26. Definition of Done

A task is done only when:

- requirements are implemented
- event sourcing rules are preserved
- RBAC is enforced
- validation is present
- audit requirements are met
- realtime behavior is safe
- reconnect behavior is considered
- tests are added or updated
- edge cases are documented
- no official rule is invented
- output summary is provided

---

## 27. Minimum Review Checklist

Before final response, the AI agent must verify:

```text
[ ] Did I preserve match_events as source of truth?
[ ] Did I avoid mutating historical events?
[ ] Did I use compensating events for corrections?
[ ] Did I enforce RBAC server-side?
[ ] Did I validate payloads server-side?
[ ] Did I avoid trusting client state?
[ ] Did I include expectedSeq or concurrency handling?
[ ] Did I handle duplicate commands?
[ ] Did I consider socket reconnect?
[ ] Did I preserve audit logs?
[ ] Did I require correction reason?
[ ] Did I avoid inventing official rules?
[ ] Did I add or update tests?
[ ] Did I document edge cases?
```

---

## 28. Agent Task Template

When assigning work to an AI agent, use this format:

```md
# Agent Task

## Goal
Describe the exact goal.

## Files to Read First
- /docs/agent/AI_AGENT_RULES.md
- /docs/architecture/EVENT_MODEL.md
- /docs/database/DATABASE_SCHEMA.md
- /docs/api/SOCKET_CONTRACTS.md
- /docs/security/SECURITY_MODEL.md
- /docs/quality/TEST_PLAN.md

## Scope
What the agent may change.

## Out of Scope
What the agent must not change.

## Acceptance Criteria
- criterion 1
- criterion 2
- criterion 3

## Required Tests
- unit tests
- integration tests
- E2E tests if relevant

## Safety Constraints
- Do not mutate historical events.
- Do not bypass RBAC.
- Do not trust client state.
- Do not invent official rules.

## Expected Response
Use the required code-change output format from AI_AGENT_RULES.md.
```

---

## 29. Example: Good Agent Behavior

User asks:

```text
Implement add score command.
```

Good response:

```text
1. Read EVENT_MODEL.md and SOCKET_CONTRACTS.md.
2. Add AddScoreCommand schema.
3. Validate actor permission.
4. Validate expectedSeq.
5. Validate points are 1, 2, or 3.
6. Append SCORE_ADDED event.
7. Update live_scoreboard_projection.
8. Broadcast projection update.
9. Add tests for authorized scorer, viewer rejection, stale seq, duplicate command.
```

---

## 30. Example: Bad Agent Behavior

Bad implementation:

```text
Create scoreboard_state table with home_score and away_score.
When client sends score, update home_score directly.
Broadcast new score.
```

Why it is bad:

- no event history
- no replay
- no audit trail
- no correction model
- trusts client state
- hard to resolve concurrent operators
- cannot rebuild official match record

---

## 31. Final Instruction to AI Agent

You are not building a toy scoreboard.

You are building a production-grade basketball operations system.

Prioritize correctness, auditability, realtime recovery, rule safety, and operator usability over speed of code generation.

When uncertain, stop guessing and identify the missing source, missing requirement, or missing approval.
