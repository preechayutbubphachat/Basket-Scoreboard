# TEST_PLAN.md

## 0. Purpose

[SYSTEM RECOMMENDATION] This document defines the required testing strategy for the Basketball Scoreboard and Tournament Management web application.

The goal is to prevent AI coding agents from building a visually working demo that fails during real match operation.

This test plan focuses on:

- FIBA-first match control
- Event-sourced match state
- MariaDB/InnoDB transaction safety
- Polling-first realtime sync for Hostatom/Plesk compatibility
- Optional Socket.IO delivery
- Correction and audit trail
- Role-based access control
- Multi-screen live operation
- Tournament standings consistency

---

## 1. Testing Principles

### 1.1 Source of Truth

[SYSTEM RECOMMENDATION] `match_events` is the source of truth.

Tests must verify that:

- Live scoreboard state is derived from projections.
- Projections are rebuildable from `match_events`.
- Snapshots are optimization only.
- UI never mutates score, foul, clock, timeout, or possession state locally as truth.
- Socket messages and polling responses are delivery mechanisms only.

### 1.2 Append-only Event Store

Tests must verify that:

- Historical events are never updated.
- Historical events are never deleted.
- Corrections use compensating events.
- Every event has a sequence number.
- `match_id + seq_no` is unique.
- Duplicate commands do not create duplicate events.

### 1.3 Server-side Validation

Tests must verify that every command is validated server-side:

- Payload schema validation
- RBAC validation
- Match assignment validation
- Rules engine validation
- `expectedSeq` validation
- Command idempotency validation
- Correction reason validation

### 1.4 Hostatom / Shared Hosting Compatibility

[SYSTEM RECOMMENDATION] Because the target deployment may use Hostatom/Plesk Shared Hosting with MariaDB, tests must not assume:

- SSH access
- Python runtime
- background worker reliability
- systemd / supervisor
- permanent custom port binding
- always-on WebSocket

Therefore, the system must pass with:

- REST command APIs
- polling-first sync
- deadline-based game clock
- deadline-based shot clock
- MariaDB transactions
- no backend `setInterval()` timer as source of truth

---

## 2. Test Levels

## 2.1 Unit Tests

Unit tests verify pure functions and small modules.

Required areas:

- Rules engine functions
- Clock calculation functions
- Shot clock decision functions
- Score projection reducer
- Foul projection reducer
- Timeout quota reducer
- Event payload validators
- Permission helpers
- Error code mapping
- Command envelope validation

Recommended tools:

- Vitest or Jest
- TypeScript
- Zod validation tests

---

## 2.2 Integration Tests

Integration tests verify multiple modules working together.

Required areas:

- Command handler + rules engine + MariaDB transaction
- Event append + projection update
- Correction event flow
- RBAC + assigned match authorization
- Polling sync after new events
- Duplicate command handling
- Concurrent `expectedSeq` conflict
- Rebuild projection from event stream

Recommended tools:

- Vitest/Jest integration tests
- Test database using MariaDB-compatible engine
- Transaction rollback between tests when possible

---

## 2.3 API Tests

API tests verify REST contracts.

Required areas:

- Public endpoints
- Authenticated endpoints
- Admin endpoints
- Match operation endpoints
- Correction endpoints
- Projection endpoints
- Audit endpoints
- Error responses

Every API test must check:

- HTTP status code
- response shape
- `currentSeq`
- `lastEventSeq`
- error code
- permission behavior
- database side effects

---

## 2.4 UI Component Tests

UI component tests verify dashboard behavior.

Required areas:

- Live scoreboard display
- Operator controls
- Score buttons
- Foul controls
- Clock controls
- Shot clock controls
- Timeout controls
- Correction confirmation dialog
- Connection status indicator
- Event sequence display
- Keyboard shortcut behavior

UI tests must verify that components:

- Do not calculate official state as source of truth.
- Render from projection data.
- Disable controls when user lacks permission.
- Show stale state warning when polling fails.
- Require confirmation for dangerous actions.

---

## 2.5 End-to-End Tests

E2E tests verify realistic user workflows.

Required areas:

- Admin creates tournament.
- Admin creates teams and players.
- Admin schedules match.
- Scorer operates live match.
- Viewer sees public scoreboard update.
- Operator corrects wrong score.
- System replays match timeline.
- Standings update after final result.

Recommended tool:

- Playwright

---

## 2.6 Manual Match-Day Tests

Manual tests are required before real competition.

Required areas:

- Two-screen operation
- Keyboard shortcuts
- Touchscreen operation
- Public scoreboard visibility
- Polling latency
- Internet interruption behavior
- Browser refresh recovery
- Device reconnect
- Wrong command correction
- End-of-game finalization

---

## 3. Test Data Requirements

## 3.1 Required Seed Data

Test environment must include:

- 1 organization
- 1 tournament
- 1 division
- 1 stage
- 1 group
- 4 teams
- 12 players per team
- 2 venues
- 2 courts
- 3 users:
  - Admin
  - Referee / Scorer
  - Viewer
- 1 FIBA rule profile
- 2 scheduled matches
- 1 live match
- 1 completed match

---

## 3.2 Required Match Fixtures

Create reusable match fixtures:

```txt
MATCH_FIXTURE_001_EMPTY_SCHEDULED
- status: SCHEDULED
- no events

MATCH_FIXTURE_002_READY_TO_START
- status: READY
- rosters confirmed
- officials assigned

MATCH_FIXTURE_003_Q1_RUNNING
- period: Q1
- game clock running
- shot clock running
- score exists

MATCH_FIXTURE_004_Q4_TIED_END
- status: REGULATION_ENDED
- score tied
- overtime required

MATCH_FIXTURE_005_COMPLETED
- status: FINAL
- final score confirmed

MATCH_FIXTURE_006_WITH_CORRECTIONS
- includes wrong score
- includes correction events
- includes audit trail
```

---

## 4. Required Test Areas

# 4.1 Game Clock Tests

## Purpose

Verify that the game clock works without relying on backend background timers.

## Required Cases

| ID | Scenario | Expected Result |
|---|---|---|
| CLOCK-001 | Start game clock from stopped state | `GAME_CLOCK_STARTED` event appended |
| CLOCK-002 | Stop running game clock | `GAME_CLOCK_STOPPED` event appended with recalculated remaining time |
| CLOCK-003 | Start clock when already running | Command rejected |
| CLOCK-004 | Stop clock when already stopped | Command rejected or no-op by policy |
| CLOCK-005 | Set clock with valid reason | `GAME_CLOCK_SET` event appended and audit created |
| CLOCK-006 | Set clock without reason | Command rejected |
| CLOCK-007 | Clock reaches zero on UI | UI shows 00:00 and period end action becomes available |
| CLOCK-008 | Browser refresh during running clock | UI recalculates from server timestamp |
| CLOCK-009 | Polling delayed while clock running | UI remains deadline-based and correct after sync |
| CLOCK-010 | Clock correction after period ends | Requires correction permission and reason |

## Acceptance Criteria

- Backend stores `remainingMs`, `startedAtServerTime`, and running status.
- UI derives display time from projection and server timestamp.
- No backend `setInterval()` is required as source of truth.
- Every manual time adjustment is audited.

---

# 4.2 Shot Clock Tests

## Purpose

Verify 24 / 14 / no-reset / stopped shot clock behavior.

## Required Cases

| ID | Scenario | Expected Result |
|---|---|---|
| SHOT-001 | Reset shot clock to 24 | `SHOT_CLOCK_RESET_24` event appended |
| SHOT-002 | Reset shot clock to 14 | `SHOT_CLOCK_RESET_14` event appended |
| SHOT-003 | Stop shot clock | `SHOT_CLOCK_STOPPED` event appended |
| SHOT-004 | Start shot clock | `SHOT_CLOCK_STARTED` event appended |
| SHOT-005 | Set shot clock manually | Requires reason and audit |
| SHOT-006 | Reset 14 after offensive rebound | Projection shows 14 seconds |
| SHOT-007 | No reset situation | Previous remaining time preserved |
| SHOT-008 | Shot clock expires before game clock | UI shows violation alert state |
| SHOT-009 | Game clock below shot clock threshold | Rules engine decides whether shot clock is off or active |
| SHOT-010 | Wrong shot clock reset corrected | Compensating event created |

## Acceptance Criteria

- Shot clock decisions come from rules engine.
- UI buttons only submit commands.
- Manual override requires reason.
- Reset decision can be replayed from event stream.

---

# 4.3 Scoring Tests

## Purpose

Verify scoring events, player attribution, correction, and projection updates.

## Required Cases

| ID | Scenario | Expected Result |
|---|---|---|
| SCORE-001 | Add Home +1 | `SCORE_ADDED` event appended, home score +1 |
| SCORE-002 | Add Home +2 | `SCORE_ADDED` event appended, home score +2 |
| SCORE-003 | Add Home +3 | `SCORE_ADDED` event appended, home score +3 |
| SCORE-004 | Add Away +1 | away score +1 |
| SCORE-005 | Add Away +2 | away score +2 |
| SCORE-006 | Add Away +3 | away score +3 |
| SCORE-007 | Add score to invalid team | Command rejected |
| SCORE-008 | Add invalid points such as 4 | Command rejected |
| SCORE-009 | Assign points to player not in match roster | Command rejected |
| SCORE-010 | Correct wrong team score | Compensating correction events created |
| SCORE-011 | Correct wrong player attribution | Score total remains correct, player stat corrected |
| SCORE-012 | Duplicate score command with same commandId | Only one event exists |
| SCORE-013 | Score command with stale expectedSeq | Command rejected with sequence conflict |

## Acceptance Criteria

- Score projection is rebuildable from events.
- Wrong score correction does not mutate original event.
- Public scoreboard updates through projection sync.
- Audit exists for correction.

---

# 4.4 Team Fouls Tests

## Purpose

Verify team foul count and penalty state.

## Required Cases

| ID | Scenario | Expected Result |
|---|---|---|
| TFOUL-001 | Add first team foul in Q1 | team foul count = 1 |
| TFOUL-002 | Add fourth team foul in Q1 | penalty state becomes active after threshold |
| TFOUL-003 | Add team foul in new period | period foul count starts separately |
| TFOUL-004 | Correct wrong team foul | compensating event created |
| TFOUL-005 | Team foul added to invalid team | command rejected |
| TFOUL-006 | Foul projection rebuild | same foul count after rebuild |
| TFOUL-007 | Overtime team foul handling | follows configured FIBA rule profile |

## Acceptance Criteria

- Team foul count is period-aware.
- Penalty state is derived by rules engine.
- Correction uses events, not direct update.

---

# 4.5 Player Fouls Tests

## Purpose

Verify player foul count, foul-out status, and roster validation.

## Required Cases

| ID | Scenario | Expected Result |
|---|---|---|
| PFOUL-001 | Add player foul | player foul count increases |
| PFOUL-002 | Add foul to player not in match roster | command rejected |
| PFOUL-003 | Player reaches 5 fouls | `PLAYER_FOULED_OUT` state appears |
| PFOUL-004 | Attempt to assign active play to fouled-out player | command rejected or warning by policy |
| PFOUL-005 | Correct wrong player foul | compensating event created |
| PFOUL-006 | Rebuild foul projection | player foul state matches latest projection |
| PFOUL-007 | Add technical/unsportsmanlike/disqualifying foul without penalty matrix | returns `[NEEDS SOURCE]` or manual mode by policy |

## Acceptance Criteria

- Player foul-out is rule-profile driven.
- Foul correction requires reason.
- Player and team foul effects are traceable.

---

# 4.6 Timeout Tests

## Purpose

Verify timeout quota, timing, role permission, and correction.

## Required Cases

| ID | Scenario | Expected Result |
|---|---|---|
| TIMEOUT-001 | Grant first-half timeout | timeout count decreases for team |
| TIMEOUT-002 | Exceed first-half timeout quota | command rejected |
| TIMEOUT-003 | Grant second-half timeout | second-half quota used |
| TIMEOUT-004 | Last 2 minutes Q4 limit | max allowed timeout rule enforced |
| TIMEOUT-005 | Overtime timeout | overtime quota used |
| TIMEOUT-006 | Viewer attempts timeout command | command rejected |
| TIMEOUT-007 | Timeout cancelled by correction | compensating event created |
| TIMEOUT-008 | Timeout without valid team | command rejected |
| TIMEOUT-009 | Timeout timer display | UI uses deadline-based countdown |

## Acceptance Criteria

- Timeout availability comes from rules engine.
- Timeout command requires authorized operator.
- Correction requires reason and audit log.

---

# 4.7 Overtime Tests

## Purpose

Verify tied-score period ending and overtime creation.

## Required Cases

| ID | Scenario | Expected Result |
|---|---|---|
| OT-001 | End Q4 with tied score | `shouldCreateOvertime` returns true |
| OT-002 | Start overtime | `OVERTIME_STARTED` event appended |
| OT-003 | End Q4 with non-tied score | match can be finalized |
| OT-004 | End OT still tied | another overtime is created |
| OT-005 | Overtime duration | uses rule profile duration |
| OT-006 | Overtime timeout quota | one timeout per overtime by rule profile |
| OT-007 | Correction changes final score from tied to non-tied | match finalization/OT state recalculated by policy |
| OT-008 | Correction changes final score from non-tied to tied | requires admin/referee correction flow |

## Acceptance Criteria

- Overtime is rule-profile driven.
- Overtime is not hard-coded in UI.
- Finalization respects latest official projection.

---

# 4.8 Correction Tests

## Purpose

Verify undo/correction is audit-safe.

## Required Cases

| ID | Scenario | Expected Result |
|---|---|---|
| CORR-001 | Correction without reason | rejected |
| CORR-002 | Correction by viewer | rejected |
| CORR-003 | Correction by assigned scorer | allowed if policy permits |
| CORR-004 | Correction after match final | requires elevated permission |
| CORR-005 | Correct wrong score | compensating events created |
| CORR-006 | Correct wrong foul | compensating events created |
| CORR-007 | Correct wrong clock | `GAME_CLOCK_SET` or correction event with audit |
| CORR-008 | Original event remains unchanged | verified in DB |
| CORR-009 | Audit log contains actor, role, device, reason, old/new values | verified |
| CORR-010 | Replay timeline shows both original and correction | verified |

## Acceptance Criteria

- No correction updates/deletes old events.
- Correction flow creates audit log.
- Projection reflects corrected official state.
- Replay remains historically explainable.

---

# 4.9 Replay Tests

## Purpose

Verify historical replay from event stream.

## Required Cases

| ID | Scenario | Expected Result |
|---|---|---|
| REPLAY-001 | Replay empty match | initial state shown |
| REPLAY-002 | Replay scoring sequence | score changes event by event |
| REPLAY-003 | Replay foul sequence | foul state changes event by event |
| REPLAY-004 | Replay correction | original event and correction visible |
| REPLAY-005 | Jump to event sequence | state at that sequence is reconstructed |
| REPLAY-006 | Rebuild summary from replay | summary matches projection |
| REPLAY-007 | Replay does not mutate live state | no DB writes occur |

## Acceptance Criteria

- Replay reads events and snapshots only.
- Replay can reconstruct state at any sequence.
- Replay marks correction events clearly.

---

# 4.10 RBAC Tests

## Purpose

Verify deny-by-default authorization.

## Required Cases

| ID | Scenario | Expected Result |
|---|---|---|
| RBAC-001 | Anonymous accesses public scoreboard | allowed |
| RBAC-002 | Anonymous sends command | rejected |
| RBAC-003 | Viewer sends score command | rejected |
| RBAC-004 | Scorer operates assigned match | allowed |
| RBAC-005 | Scorer operates unassigned match | rejected |
| RBAC-006 | Admin manages tournament | allowed |
| RBAC-007 | Admin edits rule profile | allowed |
| RBAC-008 | Scorer edits user role | rejected |
| RBAC-009 | Socket command checks permission per message | verified |
| RBAC-010 | Role value sent from client is ignored | server-side role used |

## Acceptance Criteria

- Every API request is authorized.
- Every socket message is authorized.
- Public clients are read-only.
- Match assignment is enforced.

---

# 4.11 Polling Reconnect Tests

## Purpose

Verify realtime behavior without relying on WebSocket.

## Required Cases

| ID | Scenario | Expected Result |
|---|---|---|
| POLL-001 | Client polls with latest seq | no missed events returned |
| POLL-002 | Client polls with old seq | missed events returned |
| POLL-003 | Client misses multiple score events | projection catches up |
| POLL-004 | Browser refresh during live match | latest projection loaded |
| POLL-005 | Polling request fails temporarily | UI shows stale connection warning |
| POLL-006 | Polling resumes | UI catches up from lastEventSeq |
| POLL-007 | Polling returns FULL_STATE_SYNC_REQUIRED | client reloads full projection |
| POLL-008 | Public display reconnects after 30 seconds | scoreboard becomes correct |

## Acceptance Criteria

- Polling sync works without Socket.IO.
- Client tracks `lastEventSeq`.
- Server can return missed events and current projection.
- UI shows connection status.

---

# 4.12 Socket Reconnect Tests

## Purpose

Verify optional Socket.IO behavior if enabled.

## Required Cases

| ID | Scenario | Expected Result |
|---|---|---|
| SOCKET-001 | Client joins public room | receives read-only projection patches |
| SOCKET-002 | Public client sends command | rejected |
| SOCKET-003 | Operator reconnects with lastEventSeq | missed events returned or full sync required |
| SOCKET-004 | Socket disconnects | polling fallback continues |
| SOCKET-005 | Socket command with stale expectedSeq | rejected |
| SOCKET-006 | Unauthorized socket message | rejected and logged |
| SOCKET-007 | Socket duplicate commandId | no duplicate event |
| SOCKET-008 | Socket unavailable on hosting | app still works via polling |

## Acceptance Criteria

- Socket.IO is optional.
- REST/polling path remains primary.
- Socket messages never bypass command handler.

---

# 4.13 Duplicate Event Tests

## Purpose

Verify idempotency and duplicate command handling.

## Required Cases

| ID | Scenario | Expected Result |
|---|---|---|
| DUP-001 | Same commandId submitted twice | one event only |
| DUP-002 | Retry after network timeout | original command result returned |
| DUP-003 | Same payload different commandId | treated as separate command |
| DUP-004 | Duplicate correction command | one correction flow only |
| DUP-005 | Duplicate socket and REST command same commandId | one event only |

## Acceptance Criteria

- `command_deduplication` prevents duplicate events.
- Idempotent retry is safe.
- User sees consistent command result.

---

# 4.14 Concurrent Operator Action Tests

## Purpose

Verify optimistic concurrency with `expectedSeq`.

## Required Cases

| ID | Scenario | Expected Result |
|---|---|---|
| CONC-001 | Two operators add score with same expectedSeq | one succeeds, one gets conflict |
| CONC-002 | Operator retries after sync | command succeeds with new expectedSeq |
| CONC-003 | Score and foul submitted simultaneously | deterministic event order |
| CONC-004 | Correction and live score submitted simultaneously | concurrency rule enforced |
| CONC-005 | Timeout and period end submitted simultaneously | rules engine rejects invalid order |
| CONC-006 | MariaDB transaction rollback on failure | no partial event/projection state |

## Acceptance Criteria

- No duplicate sequence numbers.
- No skipped sequence numbers except by explicit policy.
- Projection matches committed events.
- Failed command leaves no partial writes.

---

# 4.15 Tournament Standings Tests

## Purpose

Verify standings are derived from official match results and rebuilt after corrections.

## Required Cases

| ID | Scenario | Expected Result |
|---|---|---|
| STAND-001 | Completed match updates standings | wins/losses/points updated |
| STAND-002 | Draft result does not update official standings | no official standings change |
| STAND-003 | Finalized result updates standings | standings projection updated |
| STAND-004 | Correct final score after finalization | standings recomputed |
| STAND-005 | Match result changed from Team A win to Team B win | standings recomputed correctly |
| STAND-006 | Group standings rebuilt from matches | same result after rebuild |
| STAND-007 | Tie-break not specified | returns `[NEEDS SOURCE]` or tournament policy required |
| STAND-008 | Public standings endpoint | read-only and projection-based |

## Acceptance Criteria

- Standings are projection/read model.
- Standings can be rebuilt.
- Tie-break logic must be profile/policy driven.
- Corrections after finalization update standings safely.

---

## 5. Cross-Cutting Test Matrix

| Area | Unit | Integration | API | UI | E2E | Manual |
|---|---:|---:|---:|---:|---:|---:|
| Game clock | Yes | Yes | Yes | Yes | Yes | Yes |
| Shot clock | Yes | Yes | Yes | Yes | Yes | Yes |
| Scoring | Yes | Yes | Yes | Yes | Yes | Yes |
| Team fouls | Yes | Yes | Yes | Yes | Yes | Yes |
| Player fouls | Yes | Yes | Yes | Yes | Yes | Yes |
| Timeout | Yes | Yes | Yes | Yes | Yes | Yes |
| Overtime | Yes | Yes | Yes | Yes | Yes | Yes |
| Correction | Yes | Yes | Yes | Yes | Yes | Yes |
| Replay | Yes | Yes | Yes | Yes | Yes | Optional |
| RBAC | Yes | Yes | Yes | Yes | Yes | Optional |
| Polling reconnect | No | Yes | Yes | Yes | Yes | Yes |
| Socket reconnect | No | Yes | Yes | Yes | Optional | Optional |
| Duplicate commands | Yes | Yes | Yes | No | Yes | Optional |
| Concurrent operators | No | Yes | Yes | No | Yes | Manual |
| Tournament standings | Yes | Yes | Yes | Yes | Yes | Yes |

---

## 6. API Test Requirements

Every command API test must send this command envelope:

```ts
{
  commandId: string;
  matchId: string;
  expectedSeq: number;
  correlationId: string;
  clientTimestamp: string;
  payload: unknown;
}
```

Every command API response must include:

```ts
{
  ok: boolean;
  commandId: string;
  matchId: string;
  currentSeq: number;
  events?: MatchEvent[];
  projection?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

Required API error cases:

```txt
UNAUTHENTICATED
FORBIDDEN
MATCH_NOT_FOUND
INVALID_PAYLOAD
INVALID_EXPECTED_SEQ
DUPLICATE_COMMAND
RULE_VIOLATION
CORRECTION_REASON_REQUIRED
MATCH_NOT_ASSIGNED
MATCH_ALREADY_FINAL
NEEDS_SOURCE
```

---

## 7. Database Test Requirements

## 7.1 Required Constraints

Tests must verify:

```txt
match_events.event_id UNIQUE
match_events(match_id, seq_no) UNIQUE
command_deduplication(match_id, command_id) UNIQUE
match_streams.last_seq_no updates transactionally
audit_logs created for correction
projection last_event_seq equals latest committed event
```

## 7.2 Transaction Failure Tests

Required cases:

| ID | Scenario | Expected Result |
|---|---|---|
| DB-001 | Event insert succeeds but projection update fails | transaction rollback |
| DB-002 | Projection update succeeds but audit insert fails | transaction rollback for correction |
| DB-003 | Duplicate seq_no insert | database rejects |
| DB-004 | Duplicate commandId insert | database rejects or returns existing result |
| DB-005 | Rules engine rejects command | no event inserted |
| DB-006 | Permission rejects command | no event inserted |

---

## 8. Projection Rebuild Tests

Required cases:

| ID | Scenario | Expected Result |
|---|---|---|
| PROJ-001 | Delete projection table rows in test environment | rebuild succeeds from events |
| PROJ-002 | Rebuild live scoreboard projection | score/clock/fouls match expected |
| PROJ-003 | Rebuild foul projection | player/team fouls match expected |
| PROJ-004 | Rebuild replay timeline | all events ordered by seqNo |
| PROJ-005 | Rebuild standings projection | standings match official match results |
| PROJ-006 | Rebuild after correction | corrected state produced |

Acceptance criteria:

- Projection rebuild never changes `match_events`.
- Projection rebuild is deterministic.
- Projection rebuild can resume from checkpoint where applicable.

---

## 9. UI Test Requirements

Required UI behaviors:

- Buttons show disabled state when user lacks permission.
- Operator screen shows current `eventSeq`.
- Operator screen shows connection status.
- Public scoreboard is read-only.
- Stale state warning appears when polling fails.
- Manual full sync button reloads projection.
- Dangerous actions require confirmation or long press.
- Correction actions require reason.
- Keyboard shortcuts respect same safety rules as buttons.
- UI handles command conflict by prompting sync/retry.

Required UI states:

```txt
LOADING
READY
SUBMITTING_COMMAND
COMMAND_ACCEPTED
COMMAND_REJECTED
STALE_CONNECTION
FULL_SYNC_REQUIRED
READ_ONLY
UNAUTHORIZED
CORRECTION_REQUIRED_REASON
```

---

## 10. Performance and Match-Day Reliability Tests

## 10.1 Polling Load Tests

Required cases:

| ID | Scenario | Expected Result |
|---|---|---|
| PERF-001 | 1 operator + 1 public display polling | stable |
| PERF-002 | 2 operator screens + 2 public displays | stable |
| PERF-003 | 10 viewer displays polling every 1s | acceptable DB/API load |
| PERF-004 | 50 public viewers with slower polling | system remains responsive or rate limits |
| PERF-005 | Score command during active polling load | command latency acceptable |

Recommended polling intervals:

```txt
Operator screen: 300-700 ms
Public scoreboard: 500-1000 ms
Viewer schedule/standings: 3-10 seconds
Admin dashboard: 2-5 seconds
```

## 10.2 Reliability Cases

| ID | Scenario | Expected Result |
|---|---|---|
| REL-001 | Browser refresh during live match | state restored |
| REL-002 | Network disconnect for 10 seconds | UI catches up |
| REL-003 | Node.js process restarts | latest state loaded from MariaDB |
| REL-004 | User submits command then network times out | retry with same commandId is safe |
| REL-005 | Public display left open for full match | no memory leak or drift |
| REL-006 | Clock running while polling pauses | display recovers from server projection |

---

## 11. Security Test Requirements

Required cases:

| ID | Scenario | Expected Result |
|---|---|---|
| SEC-001 | Client sends fake role=Admin | server ignores client role |
| SEC-002 | Client sends score state directly | rejected |
| SEC-003 | Client sends negative score delta | rejected unless correction endpoint and reason |
| SEC-004 | Client changes matchId to unassigned match | rejected |
| SEC-005 | Viewer calls admin endpoint | rejected |
| SEC-006 | CSRF attempt on command endpoint | rejected by configured policy |
| SEC-007 | Large payload attack | rejected |
| SEC-008 | Invalid JSON payload | rejected |
| SEC-009 | Rate limit repeated commands | rejected or throttled |
| SEC-010 | Unauthorized socket command | rejected and logged |

Acceptance criteria:

- Permission checks are server-side.
- Validation is server-side.
- Sensitive audit data is not exposed to public users.
- Public endpoints never leak private user details.

---

## 12. Rule Source Test Requirements

When a feature depends on official basketball rules:

- If documented in `RULES_PROFILE_FIBA.md`, tests must reference the rule config.
- If not documented, rules engine must return `[NEEDS SOURCE]`.
- AI agent must not create NBA/NCAA/local rules without approved profile.
- Local tournament overrides must be stored as explicit rule profile overrides.

Required cases:

| ID | Scenario | Expected Result |
|---|---|---|
| RULESRC-001 | FIBA period duration loaded | 600 seconds |
| RULESRC-002 | FIBA overtime duration loaded | 300 seconds |
| RULESRC-003 | FIBA player foul limit loaded | 5 |
| RULESRC-004 | Unknown foul penalty requested | `[NEEDS SOURCE]` |
| RULESRC-005 | NBA profile requested but not loaded | `[NEEDS SOURCE]` |

---

## 13. Regression Test Suite

Before every deploy, run:

```txt
Unit tests:
- rules engine
- projections
- validators
- permission helpers

Integration tests:
- command handling
- event append transaction
- correction flow
- polling sync
- projection rebuild

API tests:
- auth
- command endpoints
- correction endpoints
- public endpoints

E2E tests:
- live match operation
- public scoreboard sync
- correction
- finalization
- standings update
```

No deployment is allowed if:

- Event append tests fail.
- Correction tests fail.
- RBAC tests fail.
- Projection rebuild tests fail.
- Polling reconnect tests fail.
- Database transaction tests fail.

---

## 14. Manual Pre-Match Checklist

Before using system in a real match:

```txt
[ ] Admin login works.
[ ] Scorer login works.
[ ] Public scoreboard URL works.
[ ] Match roster is correct.
[ ] Rule profile is correct.
[ ] Operator screen shows correct match.
[ ] Public scoreboard shows correct match.
[ ] Score buttons tested.
[ ] Clock start/stop tested.
[ ] Shot clock reset 24 tested.
[ ] Shot clock reset 14 tested.
[ ] Team foul button tested.
[ ] Player foul flow tested.
[ ] Timeout flow tested.
[ ] Correction flow tested.
[ ] Polling reconnect tested by refreshing browser.
[ ] Public display reconnect tested.
[ ] Keyboard shortcuts tested.
[ ] Manual full sync tested.
[ ] Backup/export route checked.
```

---

## 15. Manual Post-Match Checklist

After each match:

```txt
[ ] Final score confirmed.
[ ] Match status set to FINAL.
[ ] Match summary generated.
[ ] Event stream export available.
[ ] Audit log reviewed if corrections occurred.
[ ] Tournament standings updated.
[ ] Public result visible.
[ ] Replay timeline available.
[ ] Any incident recorded.
```

---

## 16. AI Agent Testing Rules

AI coding agents must follow these rules:

- Do not mark work complete without tests.
- Do not create command handlers without API tests.
- Do not create event types without projection tests.
- Do not create correction logic without audit tests.
- Do not create UI controls without permission-state tests.
- Do not create socket behavior without polling fallback tests.
- Do not create tournament standings without rebuild tests.
- Do not bypass rules engine in tests just to pass.
- Do not change expected behavior without updating this file and acceptance criteria.

---

## 17. Suggested Test File Structure

```txt
/tests
  /unit
    rules-engine.test.ts
    clock-calculation.test.ts
    shot-clock-decision.test.ts
    score-projection.test.ts
    foul-projection.test.ts
    timeout-projection.test.ts
    permission.test.ts
    validators.test.ts

  /integration
    command-handler.test.ts
    event-store-transaction.test.ts
    correction-flow.test.ts
    projection-rebuild.test.ts
    polling-sync.test.ts
    concurrent-commands.test.ts
    duplicate-commands.test.ts

  /api
    auth.api.test.ts
    tournaments.api.test.ts
    matches.api.test.ts
    live-commands.api.test.ts
    corrections.api.test.ts
    projections.api.test.ts
    public.api.test.ts

  /e2e
    live-match-flow.spec.ts
    public-scoreboard.spec.ts
    correction-flow.spec.ts
    replay.spec.ts
    tournament-standings.spec.ts
    rbac.spec.ts

  /fixtures
    users.fixture.ts
    tournament.fixture.ts
    teams.fixture.ts
    players.fixture.ts
    matches.fixture.ts
    events.fixture.ts
```

---

## 18. Definition of Done for Testing

A feature is not complete until:

```txt
[ ] Unit tests added.
[ ] Integration tests added where applicable.
[ ] API tests added where applicable.
[ ] UI/E2E tests added for visible behavior.
[ ] RBAC tests added.
[ ] Event append behavior tested.
[ ] Projection behavior tested.
[ ] Correction/audit tested if feature affects official state.
[ ] Polling reconnect tested if feature affects live display.
[ ] Duplicate command behavior tested if feature accepts commands.
[ ] Concurrent expectedSeq behavior tested if feature writes events.
[ ] Manual verification steps documented.
```

---

## 19. Minimum MVP Test Gate

The MVP cannot be used in a real match unless these pass:

```txt
MVP-GATE-001 Game clock start/stop/set
MVP-GATE-002 Shot clock start/stop/reset 24/reset 14/set
MVP-GATE-003 Home/Away score +1/+2/+3
MVP-GATE-004 Team foul add/correct
MVP-GATE-005 Player foul add/correct/foul-out
MVP-GATE-006 Timeout quota
MVP-GATE-007 Period end and overtime
MVP-GATE-008 Correction with reason and audit
MVP-GATE-009 Public scoreboard polling sync
MVP-GATE-010 Operator reconnect/full sync
MVP-GATE-011 Duplicate command idempotency
MVP-GATE-012 Concurrent expectedSeq conflict
MVP-GATE-013 Admin/Scorer/Viewer RBAC
MVP-GATE-014 Projection rebuild from match_events
MVP-GATE-015 Match summary after finalization
```

---

## 20. Open Testing Decisions

[ASSUMPTION] Product Owner should confirm:

```txt
1. Target maximum number of simultaneous public viewers per match.
2. Acceptable scoreboard update latency.
3. Whether Socket.IO will be enabled after hosting test.
4. Whether local backup/export is required before every match.
5. Whether scorer and timer are one role or separate roles in MVP.
6. Whether player attribution is required for scoring in MVP.
7. Whether full foul penalty automation is required in MVP or manual mode first.
8. Whether standings tie-break rules are required in MVP.
```

Until confirmed, AI agent must use safe defaults:

```txt
- Polling-first realtime
- Event-sourced write model
- Manual override with reason for uncertain rule cases
- FIBA default profile
- No undocumented NBA/NCAA/local rule logic
```
