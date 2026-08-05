# CODE_REVIEW_CHECKLIST.md

## 0. Purpose

This checklist is used to review every code change produced by an AI coding agent, developer, or automation before merge, release, or match-day deployment.

The goal is to prevent unsafe changes that could break:

- live scoreboard correctness
- match event history
- correction and audit trail
- replayability
- realtime synchronization
- MariaDB transaction safety
- role-based access control
- tournament standings
- match-day reliability on Hostatom/Plesk shared hosting

This project is not a normal CRUD scoreboard. It is a production-grade Basketball Scoreboard and Tournament Management system.

---

## 1. Review Severity Levels

Use these severity labels during review.

| Severity | Meaning | Merge Decision |
|---|---|---|
| P0_BLOCKER | Can corrupt score, foul, time, event stream, audit log, or authorization | Must not merge |
| P1_HIGH | Can break live match operation, reconnect, projection, or correction flow | Must fix before release |
| P2_MEDIUM | Can cause bad UX, missing test, weak error handling, or maintainability risk | Fix before stable release |
| P3_LOW | Naming, formatting, comments, minor refactor issue | Can merge with follow-up if safe |

### P0 Blocker Examples

- Mutates or deletes `match_events`
- Stores mutable scoreboard state as source of truth
- Bypasses RBAC
- Trusts score, foul, role, permission, or clock state from client
- Applies correction without reason
- Does not use `expectedSeq` for live commands
- Writes event without transaction
- Breaks rebuild from event stream
- Allows public scoreboard to send commands
- Implements long-running backend timer with `setInterval()` as authoritative clock
- Uses technology not supported by the approved deployment mode without approval

---

## 2. Files Reviewer Must Check Before Review

The reviewer must compare the code against these project documents:

- `AI_AGENT_RULES.md`
- `PROJECT_BRIEF.md`
- `ARCHITECTURE_PRINCIPLES.md`
- `RULES_PROFILE_FIBA.md`
- `RULES_ENGINE_SPEC.md`
- `DOMAIN_MODEL.md`
- `USER_ROLES_AND_PERMISSIONS.md`
- `EVENT_MODEL.md`
- `PROJECTION_MODEL.md`
- `API_CONTRACTS.md`
- `SOCKET_CONTRACTS.md`
- `DATABASE_SCHEMA.md`
- `UI_DASHBOARDS.md`
- `KEYBOARD_SHORTCUTS.md`
- `TEST_PLAN.md`
- `ACCEPTANCE_CRITERIA.md`
- `EDGE_CASES.md`

If the code conflicts with these documents, the code is wrong unless the Product Owner has approved a document change first.

---

## 3. Pull Request Review Summary Template

Every review should start with this summary.

```md
## Review Summary

Decision:
- [ ] Approved
- [ ] Approved with comments
- [ ] Changes requested
- [ ] Blocked

Risk Level:
- [ ] P0_BLOCKER
- [ ] P1_HIGH
- [ ] P2_MEDIUM
- [ ] P3_LOW

Reviewed Areas:
- [ ] Architecture
- [ ] Event sourcing
- [ ] Rules engine
- [ ] API
- [ ] Realtime / polling
- [ ] Database / MariaDB
- [ ] Security / RBAC
- [ ] Audit / correction
- [ ] UI / UX
- [ ] Tests
- [ ] Hostatom/Plesk deployment

Main Finding:
<short explanation>

Required Fixes:
1. ...
2. ...

Safe to deploy to match-day environment?
- [ ] Yes
- [ ] No
```

---

## 4. Architecture Checklist

### 4.1 Event-Sourced Architecture

- [ ] The change preserves `match_events` as the source of truth.
- [ ] The change does not treat `scoreboard_state`, `live_match_projection`, or UI state as authoritative.
- [ ] The change uses append-only events for match state changes.
- [ ] The change does not update historical events.
- [ ] The change does not delete historical events.
- [ ] Undo/correction uses compensating events.
- [ ] Read models/projections are rebuildable from `match_events`.
- [ ] Snapshots are used only as optimization.
- [ ] Event stream ordering is preserved by `matchId + seqNo`.
- [ ] The code does not introduce hidden state outside the event stream.

P0 blocker if:

- Any match state can be changed without producing an event.
- Old event payloads can be overwritten.
- Replay from event stream produces a different result than live state.

### 4.2 Hostatom/Plesk Compatibility

- [ ] The code works with the approved Hostatom/Plesk deployment model.
- [ ] The code does not require Python, FastAPI, Uvicorn, Alembic, systemd, supervisor, or root access.
- [ ] The code does not require a permanent background worker unless explicitly approved.
- [ ] The code does not rely on custom nginx reverse proxy rules unless Hostatom has confirmed support.
- [ ] The frontend can be deployed as static build output if needed.
- [ ] Backend behavior is compatible with Node.js support available through Plesk.
- [ ] Realtime behavior has polling fallback.
- [ ] The system remains usable if Socket.IO/WebSocket is disabled.

P0 blocker if:

- The feature only works with an unsupported long-running backend process.
- Live match control fails when Socket.IO is unavailable.

### 4.3 Technology Boundaries

- [ ] Frontend uses approved stack: Vite/React/TypeScript unless otherwise approved.
- [ ] Backend uses approved stack: Node.js/TypeScript with Fastify or Express.
- [ ] Database uses MariaDB/InnoDB.
- [ ] Validation uses Zod or approved equivalent.
- [ ] Tests use Vitest/Jest/Playwright or approved equivalent.
- [ ] No unapproved heavy dependency is added.
- [ ] No package requiring native build tools is added without deployment verification.

---

## 5. Domain Model Checklist

- [ ] `Team` is not confused with `TournamentRoster`.
- [ ] `TournamentRoster` is not confused with `MatchRoster`.
- [ ] `Player` master data is separated from match participation state.
- [ ] `Match` aggregate owns period, score, clock, shot clock, foul, timeout, possession, correction, and event sequence.
- [ ] `RuleProfile` is linked to match/rules decisions.
- [ ] `MatchOfficial` or assignment data is used to restrict scorer/referee access.
- [ ] Public viewer state is separated from operator/admin state.
- [ ] Domain logic is not implemented only in UI components.
- [ ] Domain invariants are enforced server-side.

P0 blocker if:

- A client can directly set score/foul/clock without server-side domain validation.
- A user can operate an unassigned match.

---

## 6. Rules Engine Checklist

### 6.1 General Rule Validation

- [ ] The code uses `RULES_PROFILE_FIBA.md` as the default rule profile.
- [ ] The code does not invent official rules.
- [ ] Unknown rule logic returns `[NEEDS SOURCE]` or a rule-specific error.
- [ ] Rules engine returns machine-readable decisions.
- [ ] Rule decisions include `allowed`, `reasonCode`, `explanation`, and `sourceRuleRef` where available.
- [ ] Rule logic is not duplicated across UI, API, and socket handlers.
- [ ] Command handlers call the rules engine before appending events.

### 6.2 FIBA Core Checks

- [ ] Game structure supports 4 quarters.
- [ ] Regulation period duration is 10 minutes by default.
- [ ] Overtime duration is 5 minutes by default.
- [ ] Timeout quota supports first half, second half, last two minutes of Q4, and overtime.
- [ ] Team foul penalty threshold is handled by rule profile.
- [ ] Player foul-out at 5 fouls is handled by rule profile.
- [ ] Shot clock supports reset 24, reset 14, continue/no-reset, and shot-clock-off conditions where implemented.

P0 blocker if:

- The code hard-codes a non-FIBA rule into default mode.
- The code silently applies NBA/NCAA/local rules without explicit selected profile.

---

## 7. Event Model Checklist

### 7.1 Event Metadata

Every appended event must include:

- [ ] `eventId`
- [ ] `matchId`
- [ ] `seqNo`
- [ ] `eventType`
- [ ] `payload`
- [ ] `actorUserId`
- [ ] `actorRole`
- [ ] `deviceId`
- [ ] `occurredAt`
- [ ] `recordedAt`
- [ ] `correlationId`
- [ ] `causationId`
- [ ] `expectedSeq`
- [ ] `ruleProfileId`
- [ ] `reason` when required

P0 blocker if:

- Live match events can be stored without actor, sequence, or event type.
- Correction events can be stored without reason.

### 7.2 Event Type Validity

- [ ] Event type is in the approved event catalog.
- [ ] Payload matches event-specific schema.
- [ ] Event has a projection effect defined.
- [ ] Event has permission requirement defined.
- [ ] Event has audit requirement defined.
- [ ] New event types are documented in `EVENT_MODEL.md`.
- [ ] New event types have tests.

### 7.3 Event Sequence

- [ ] `seqNo` increments by exactly 1 per match.
- [ ] `unique(match_id, seq_no)` is preserved.
- [ ] `expectedSeq` is checked before append.
- [ ] Concurrent commands with stale `expectedSeq` are rejected.
- [ ] The response returns latest/current sequence.
- [ ] Command replay does not duplicate events.

P0 blocker if:

- Multiple commands can write the same sequence number.
- Stale operator state can overwrite live match state.

---

## 8. Command Handling Checklist

Every live command must follow this flow:

- [ ] Authenticate actor.
- [ ] Authorize actor for match and command.
- [ ] Validate payload with Zod or approved validator.
- [ ] Validate `commandId`.
- [ ] Check idempotency / deduplication.
- [ ] Lock or transactionally protect match stream.
- [ ] Compare `expectedSeq`.
- [ ] Run rules engine.
- [ ] Append event.
- [ ] Update stream sequence.
- [ ] Update projection/snapshot when required.
- [ ] Insert audit log when required.
- [ ] Commit transaction.
- [ ] Return accepted/rejected response with current sequence.

P0 blocker if:

- Events are appended before validation.
- Projection is updated without event append.
- Event append and projection update can partially succeed without recovery plan.

---

## 9. MariaDB / Database Checklist

### 9.1 Storage Engine and Constraints

- [ ] Tables use InnoDB.
- [ ] `match_events.event_id` is unique.
- [ ] `match_events(match_id, seq_no)` is unique.
- [ ] `command_deduplication(match_id, command_id)` is unique.
- [ ] Important foreign keys are present or intentionally documented.
- [ ] Indexes exist for live polling queries.
- [ ] JSON columns are used carefully and validated at application layer.
- [ ] No unsupported PostgreSQL-only SQL is used.
- [ ] Migrations are compatible with Hostatom/Plesk deployment workflow.

### 9.2 Transaction Safety

- [ ] Event append and `match_streams.last_seq_no` update happen in one transaction.
- [ ] Projection update happens in same transaction when possible.
- [ ] Audit log insert happens in same transaction when related to correction/privileged command.
- [ ] Transaction rollback leaves no partial state.
- [ ] Concurrent command tests exist.

P0 blocker if:

- Score/foul/clock can change without transaction.
- `match_streams.last_seq_no` can diverge from actual latest event.

### 9.3 Migration Review

- [ ] Migration is reversible or has manual rollback notes.
- [ ] Migration does not drop live match data.
- [ ] Migration does not change event payload meaning without versioning.
- [ ] Migration has backup instructions.
- [ ] Migration has tested seed/demo data if needed.
- [ ] Migration can be run without SSH if needed, for example through SQL file or approved Plesk-compatible script.

---

## 10. Projection Checklist

- [ ] Projection reads from event stream.
- [ ] Projection stores `lastEventSeq`.
- [ ] Projection is rebuildable.
- [ ] Projection update is deterministic.
- [ ] Projection update handles duplicate events safely.
- [ ] Projection update handles correction events.
- [ ] Projection does not write back into `match_events`.
- [ ] Projection bug cannot corrupt event store.
- [ ] Rebuild script/test exists for affected projection.
- [ ] Public projection excludes sensitive fields.
- [ ] Operator projection includes necessary operational state.
- [ ] Admin projection includes audit/correction context where authorized.

P0 blocker if:

- Projection becomes source of truth.
- Rebuild from events cannot reproduce live projection.

---

## 11. API Checklist

### 11.1 REST API

- [ ] Endpoint is documented in `API_CONTRACTS.md`.
- [ ] Auth is required except approved public read endpoints.
- [ ] RBAC is enforced server-side.
- [ ] Input is validated with Zod or approved validator.
- [ ] API never trusts client-calculated score/foul/clock state.
- [ ] Live command endpoint requires command envelope.
- [ ] Response returns `currentSeq` or `latestSeq` where relevant.
- [ ] Error responses use approved error codes.
- [ ] Public endpoints are read-only.
- [ ] Admin endpoints are not accessible to scorer/viewer roles.
- [ ] Rate limiting or abuse protection is considered for public/polling endpoints.

### 11.2 Command Envelope

Every live command must include:

- [ ] `commandId`
- [ ] `matchId`
- [ ] `expectedSeq`
- [ ] `correlationId`
- [ ] `clientTimestamp`
- [ ] `payload`

P0 blocker if:

- A live command can be accepted without `expectedSeq`.
- A live command can be accepted without server-side authorization.

---

## 12. Socket / Realtime Checklist

This project is REST/polling-first on Hostatom/Plesk. Socket.IO is optional.

### 12.1 Polling-First Realtime

- [ ] Public scoreboard can update through polling.
- [ ] Operator dashboard can recover through polling.
- [ ] Polling endpoint accepts `lastEventSeq`.
- [ ] Polling response returns missed events and/or current projection.
- [ ] Client can detect stale state.
- [ ] Client can request full sync.
- [ ] Polling interval is reasonable for shared hosting.
- [ ] Polling failure does not corrupt local UI state.

### 12.2 Optional Socket.IO

- [ ] Socket.IO is not required for correctness.
- [ ] Socket.IO is not source of truth.
- [ ] Socket message handler reuses same command handler as REST.
- [ ] Socket handshake is authenticated.
- [ ] Every socket message is authorized.
- [ ] Public socket room is read-only.
- [ ] Socket reconnect sends `lastEventSeq`.
- [ ] Server responds with missed events or `FULL_STATE_SYNC_REQUIRED`.
- [ ] Duplicate socket commands are idempotent.
- [ ] Socket failure falls back to REST polling.

P0 blocker if:

- Live match operation depends only on socket broadcast.
- Public clients can send command messages.

---

## 13. Clock and Shot Clock Checklist

### 13.1 Deadline-Based Clock Model

- [ ] Clock does not depend on backend `setInterval()` as authoritative source.
- [ ] Start event stores remaining time and server timestamp/deadline.
- [ ] Stop event calculates remaining time server-side.
- [ ] UI display can derive ticking time from projection.
- [ ] Reconnect restores correct remaining time.
- [ ] Clock expiry is handled deterministically.
- [ ] Manual clock set requires permission and audit where appropriate.

### 13.2 Game Clock

- [ ] Start/stop commands validate match and period state.
- [ ] Period start/end events are sequenced.
- [ ] Period cannot end incorrectly when rule validation blocks it.
- [ ] Overtime is created only when rules allow/require it.
- [ ] Clock correction requires reason.

### 13.3 Shot Clock

- [ ] Reset 24 command is explicit and audited where needed.
- [ ] Reset 14 command is explicit and audited where needed.
- [ ] No-reset logic is handled by rules engine where automated.
- [ ] Manual shot clock set requires permission.
- [ ] Shot clock display recovers after polling reconnect.
- [ ] Shot clock is not stored as client-only state.

P0 blocker if:

- Clock/shot clock continues authoritatively only in browser without server event state.
- Reconnect produces wrong official clock state.

---

## 14. Score Control Checklist

- [ ] Score add uses event append.
- [ ] Score correction uses compensating events.
- [ ] Score subtract is not implemented as direct mutation.
- [ ] Score payload includes team side/teamId.
- [ ] Player scoring attribution is optional only if documented.
- [ ] Wrong team/player correction flow exists.
- [ ] Score projection rebuilds correctly.
- [ ] Score event requires authorized scorer/referee/admin.
- [ ] Public viewer cannot modify score.
- [ ] Tests include +1, +2, +3, wrong team correction, duplicate command, stale `expectedSeq`.

P0 blocker if:

- Score can be overwritten directly.
- Score correction deletes original score event.

---

## 15. Foul Control Checklist

- [ ] Team foul state derives from events.
- [ ] Player foul state derives from events.
- [ ] Player foul-out is rule-profile driven.
- [ ] Team foul penalty is rule-profile driven.
- [ ] Foul assigned to wrong player can be corrected through compensating event.
- [ ] Foul projection updates player, team, and summary views.
- [ ] Foul event stores actor and device.
- [ ] Technical/unsportsmanlike/disqualifying foul automation is not guessed without source.
- [ ] Tests cover player foul limit, team penalty, wrong player correction, foul after period end, and duplicate command.

P0 blocker if:

- AI agent invents penalty logic for unsupported foul types.
- Player foul-out is ignored when configured rule profile requires it.

---

## 16. Timeout Checklist

- [ ] Timeout quota is validated by rule profile.
- [ ] Timeout event stores team, period, remaining time context, actor, and reason if correction.
- [ ] Timeout correction uses compensating event.
- [ ] UI prevents obvious over-quota timeout.
- [ ] Server still validates even if UI blocks.
- [ ] Timeout projection rebuilds from events.
- [ ] Tests cover first half quota, second half quota, last two minutes Q4 limit, overtime quota, duplicate command, and stale `expectedSeq`.

P0 blocker if:

- Client can grant timeout by changing local state.
- Timeout quota is enforced only in UI.

---

## 17. Correction and Audit Checklist

### 17.1 Correction Flow

- [ ] Correction requires permission.
- [ ] Correction requires reason.
- [ ] Correction references target event(s).
- [ ] Correction creates compensating event(s).
- [ ] Original event remains unchanged.
- [ ] Correction appears in replay timeline.
- [ ] Correction updates projections deterministically.
- [ ] Correction is included in match summary/audit.
- [ ] Correction after match finalization follows stricter permission rules.

### 17.2 Audit Metadata

Audit/correction logs must include:

- [ ] actor
- [ ] role
- [ ] device
- [ ] timestamp
- [ ] old value
- [ ] new value
- [ ] reason
- [ ] correlation ID
- [ ] causation ID
- [ ] event sequence
- [ ] IP/user agent where available

P0 blocker if:

- Correction can happen without reason.
- Original event can be edited in place.
- Audit log is missing actor or timestamp.

---

## 18. RBAC / Security Checklist

### 18.1 Authorization

- [ ] Deny-by-default policy is enforced.
- [ ] Role is loaded from server-side auth/session.
- [ ] Client-provided role is ignored.
- [ ] Admin permissions are separated from scorer permissions.
- [ ] Scorer/referee can operate only assigned matches.
- [ ] Viewer/public can only read approved public data.
- [ ] Every API request checks authorization.
- [ ] Every socket message checks authorization.
- [ ] Correction permissions are stricter than normal live scoring where needed.
- [ ] Audit log access is admin-only unless explicitly allowed.

### 18.2 Authentication and Session

- [ ] Sensitive endpoints require authenticated session/token.
- [ ] Session expiration is handled.
- [ ] CSRF protection is considered for cookie-based auth.
- [ ] Password/session/token data is not logged.
- [ ] Rate limiting is considered for login and polling endpoints.

### 18.3 Data Exposure

- [ ] Public scoreboard does not expose private user data.
- [ ] Public APIs do not expose audit logs.
- [ ] Error messages do not leak stack traces.
- [ ] Logs do not contain passwords or tokens.

P0 blocker if:

- Public viewer can send live match commands.
- Scorer can operate any match without assignment check.
- Authorization exists only in frontend.

---

## 19. UI / UX Checklist

### 19.1 Operator UI

- [ ] Buttons are large enough for touch use.
- [ ] High contrast is used for live operation.
- [ ] Critical buttons are visually distinct.
- [ ] Dangerous actions require confirmation or long press.
- [ ] Correction actions require reason.
- [ ] Current `eventSeq` is visible.
- [ ] Connection status is visible.
- [ ] Stale state warning is visible.
- [ ] Operator cannot keep sending commands with stale `expectedSeq` without sync.
- [ ] Keyboard shortcuts match `KEYBOARD_SHORTCUTS.md`.
- [ ] Keyboard repeat does not accidentally spam commands.

### 19.2 Public Scoreboard UI

- [ ] Public screen is read-only.
- [ ] Public screen supports 16:9 fullscreen display.
- [ ] Public display uses projection state.
- [ ] Public display handles stale/offline state gracefully.
- [ ] Public display does not show admin/debug data.

### 19.3 Accessibility and Reliability

- [ ] Main controls are usable without precise mouse input.
- [ ] Error messages are understandable under match pressure.
- [ ] Manual full sync button exists for operator.
- [ ] UI prevents obvious duplicate action but server remains source of truth.

---

## 20. Replay and Historical Review Checklist

- [ ] Replay is built from `match_events`.
- [ ] Replay includes corrections.
- [ ] Replay can show event sequence.
- [ ] Replay can show actor/device where authorized.
- [ ] Replay does not require current projection to be trusted.
- [ ] Replay works after projection rebuild.
- [ ] Replay has tests for corrected score/foul/timeout events.
- [ ] Public replay excludes private audit fields unless authorized.

P0 blocker if:

- Replay hides corrections or rewrites history.
- Replay is generated from mutable current state only.

---

## 21. Tournament Checklist

- [ ] Tournament creation validates required fields.
- [ ] Team registration is separated from match roster.
- [ ] Match scheduling validates teams, court, and time where implemented.
- [ ] Match finalization updates tournament standings projection.
- [ ] Standings can be rebuilt from official match results/events.
- [ ] Standings recompute after result correction.
- [ ] Tie-break logic is documented before implementation.
- [ ] Unsupported tournament rules return `[NEEDS SOURCE]` or require Product Owner decision.

P0 blocker if:

- Standings are manually edited without event/audit trail.
- AI agent invents official tie-break rules without source.

---

## 22. Error Handling Checklist

- [ ] Errors use approved error codes.
- [ ] `INVALID_EXPECTED_SEQ` returns current sequence.
- [ ] `DUPLICATE_COMMAND` returns prior result if available.
- [ ] `UNAUTHORIZED_COMMAND` does not reveal sensitive data.
- [ ] `RULE_VIOLATION` includes reason code.
- [ ] Validation errors identify invalid fields safely.
- [ ] Client handles rejected command by syncing state.
- [ ] Server logs enough context for debugging without leaking secrets.

Common error codes:

```txt
MATCH_NOT_FOUND
UNAUTHORIZED_COMMAND
INVALID_EXPECTED_SEQ
RULE_VIOLATION
PLAYER_FOULED_OUT
TIMEOUT_QUOTA_EXCEEDED
MATCH_ALREADY_FINISHED
DUPLICATE_COMMAND
CORRECTION_REASON_REQUIRED
VALIDATION_FAILED
FULL_STATE_SYNC_REQUIRED
```

---

## 23. Testing Checklist

### 23.1 Required Test Types

- [ ] Unit tests for rules engine.
- [ ] Unit tests for event reducers/projections.
- [ ] Integration tests for command transaction.
- [ ] API tests for auth/RBAC/validation.
- [ ] Polling reconnect tests.
- [ ] Duplicate command tests.
- [ ] Concurrent `expectedSeq` tests.
- [ ] Correction/audit tests.
- [ ] UI tests for critical operator flows.
- [ ] E2E tests for live scoreboard flow.
- [ ] Tournament standings tests where affected.

### 23.2 Required Match-Day Test Coverage

- [ ] Game clock start/stop/set.
- [ ] Shot clock start/stop/reset 24/reset 14/set.
- [ ] Home/Away +1/+2/+3.
- [ ] Team foul add/correct.
- [ ] Player foul add/correct/foul-out.
- [ ] Timeout quota.
- [ ] Period end and overtime.
- [ ] Correction with reason and audit.
- [ ] Public scoreboard polling sync.
- [ ] Operator reconnect/full sync.
- [ ] Duplicate command idempotency.
- [ ] Concurrent expectedSeq conflict.
- [ ] Admin/Scorer/Viewer RBAC.
- [ ] Projection rebuild from `match_events`.
- [ ] Match summary after finalization.

P0 blocker if:

- No tests are added for a live command feature.
- Correction/audit behavior is changed without tests.
- Concurrency-sensitive code has no integration test.

---

## 24. Performance and Match-Day Reliability Checklist

- [ ] Public polling interval is reasonable for shared hosting.
- [ ] Operator polling interval is reasonable and configurable.
- [ ] API queries use indexes.
- [ ] Projection endpoints are lightweight.
- [ ] Event polling uses `afterSeq` / `lastEventSeq`.
- [ ] Full-state sync is available.
- [ ] Large event history does not slow live scoreboard.
- [ ] Snapshot/projection strategy is used for fast hydration.
- [ ] Logs are sufficient for match-day troubleshooting.
- [ ] There is a manual fallback plan if hosting or internet fails.

P1 high risk if:

- Public scoreboard requires reading full event history every poll.
- Live state endpoint performs heavy unindexed queries.

---

## 25. Deployment Checklist

### 25.1 Before Deploy

- [ ] Database backup completed.
- [ ] Migration reviewed.
- [ ] Migration tested on staging/local copy.
- [ ] Build succeeds.
- [ ] Tests pass.
- [ ] Environment variables are documented.
- [ ] Hostatom/Plesk compatibility confirmed.
- [ ] Public scoreboard smoke test completed.
- [ ] Operator login smoke test completed.
- [ ] API health check completed.

### 25.2 After Deploy

- [ ] Login works.
- [ ] Public scoreboard loads.
- [ ] Operator dashboard loads.
- [ ] Create test match works.
- [ ] Score command appends event.
- [ ] Projection updates.
- [ ] Polling sync works.
- [ ] Correction requires reason.
- [ ] Viewer cannot send command.
- [ ] Logs show no startup errors.
- [ ] Rollback path is still available.

---

## 26. AI Agent Output Review

The AI agent must provide:

- [ ] Implementation summary.
- [ ] Files changed.
- [ ] Reason for each change.
- [ ] Domain impact.
- [ ] Event impact.
- [ ] Database impact.
- [ ] API/socket impact.
- [ ] Security/RBAC impact.
- [ ] Tests added.
- [ ] Manual verification steps.
- [ ] Risks.
- [ ] Rollback impact.
- [ ] Open questions.

Reject the AI agent output if:

- It says "done" without tests.
- It changes schema without migration notes.
- It changes event model without approval.
- It skips RBAC explanation.
- It does not mention projection/rebuild impact.
- It cannot explain how reconnect or stale state is handled.

---

## 27. Manual Match-Day Smoke Test

Run this before using the system in a real match.

```txt
1. Login as Admin.
2. Create tournament.
3. Create teams.
4. Create match.
5. Assign scorer/referee.
6. Open operator dashboard.
7. Open public scoreboard in another device/window.
8. Start match.
9. Add Home +2.
10. Confirm public scoreboard updates.
11. Add Away +3.
12. Start/stop game clock.
13. Reset shot clock 24.
14. Reset shot clock 14.
15. Add team foul.
16. Add player foul.
17. Grant timeout.
18. Disconnect public scoreboard network briefly.
19. Reconnect and confirm latest state.
20. Submit duplicate command and confirm no duplicate event.
21. Submit stale expectedSeq command and confirm rejection.
22. Correct wrong score with reason.
23. Confirm original event still exists.
24. Confirm audit log exists.
25. End period.
26. Finalize match.
27. Open match summary.
28. Rebuild projection from match_events on test copy.
29. Confirm rebuilt state matches live state.
```

Failure in steps 8-24 means the system is not safe for match-day live operation.

---

## 28. Definition of Approved

A change can be approved only when:

- [ ] It preserves event sourcing.
- [ ] It preserves append-only event history.
- [ ] It enforces RBAC server-side.
- [ ] It validates inputs server-side.
- [ ] It uses `expectedSeq` for live commands.
- [ ] It handles duplicate commands.
- [ ] It updates projections safely.
- [ ] It supports polling reconnect.
- [ ] It stores required audit metadata.
- [ ] It has required tests.
- [ ] It is compatible with Hostatom/Plesk + MariaDB deployment constraints.
- [ ] It has no P0 blocker.
- [ ] It has no unresolved P1 issue for match-day release.

---

## 29. Reviewer Final Sign-Off Template

```md
## Final Review Sign-Off

Feature / PR:
Reviewer:
Date:

Architecture:
- [ ] Pass
- [ ] Fail

Event Sourcing:
- [ ] Pass
- [ ] Fail

Rules Engine:
- [ ] Pass
- [ ] Fail

MariaDB / Transactions:
- [ ] Pass
- [ ] Fail

API / Realtime:
- [ ] Pass
- [ ] Fail

RBAC / Security:
- [ ] Pass
- [ ] Fail

Audit / Correction:
- [ ] Pass
- [ ] Fail

UI / UX:
- [ ] Pass
- [ ] Fail

Tests:
- [ ] Pass
- [ ] Fail

Hostatom/Plesk Compatibility:
- [ ] Pass
- [ ] Fail

Decision:
- [ ] Approved
- [ ] Changes requested
- [ ] Blocked

Notes:
...
```

---

## 30. Non-Negotiable Final Reminder

If a code change makes it impossible to answer these questions, it must not be merged:

1. Who changed the match state?
2. What event was created?
3. What was the event sequence?
4. What rule allowed or rejected it?
5. What permission allowed it?
6. What device submitted it?
7. What projection changed?
8. Can the state be rebuilt from events?
9. Can the correction be replayed?
10. Can a disconnected client recover correctly?

If the answer is unclear, request changes.
