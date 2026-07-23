# ACCEPTANCE_CRITERIA.md

## 0. Purpose

This document defines the acceptance criteria for the Basketball Scoreboard and Tournament Management web application.

It is used by:
- Product Owner
- System Architect
- AI Coding Agent
- QA
- Manual tester
- Match-day operator

The purpose is to prevent incomplete features from being marked as “done” just because the screen appears to work.

A feature is accepted only when it is:
- functionally correct
- rule-safe
- event-sourced
- audit-safe
- permission-safe
- projection-safe
- reconnect-safe
- test-covered
- usable during a real basketball match

---

## 1. Global Acceptance Rules

### 1.1 Source of Truth

Every accepted live match feature must satisfy all of the following:

- `match_events` is the source of truth.
- UI state must be derived from projection or snapshot.
- Projection must be rebuildable from `match_events`.
- No feature may store only mutable scoreboard state as the official truth.
- No feature may update historical events.
- No feature may delete historical events.
- Corrections must be represented by new compensating events.
- Audit log must preserve who changed what, when, why, and from which device.

Accepted when:
- A match can be replayed from event sequence `1..N`.
- Current scoreboard state can be rebuilt from event stream.
- Projection rebuild produces the same score, fouls, timeout, period, and clock state as the live UI.
- Historical correction trail remains visible.

Rejected when:
- The feature directly overwrites score/foul/clock without event history.
- The feature deletes incorrect events.
- The UI has a different truth from server projection.
- The database has no way to explain how the current score was reached.

---

### 1.2 Command Envelope

Every state-changing command must include:

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

Accepted when:
- Server validates all required fields.
- `commandId` is used for idempotency.
- `expectedSeq` is used for optimistic concurrency.
- `correlationId` links related commands/events/logs.
- Server rejects malformed commands.
- Server never trusts client-calculated score, foul, clock, role, or permission state.

Rejected when:
- Client sends final score directly and server accepts it.
- Client sends role or permission and server trusts it.
- Duplicate command creates duplicate event.
- Concurrent commands silently overwrite each other.

---

### 1.3 Validation

Accepted when:
- Every REST command validates payload with Zod or approved schema validation.
- Every optional Socket.IO command validates the same schema as REST.
- Rule validation runs server-side.
- Authorization runs server-side.
- Rejected command does not append a match event.
- Rejected command returns stable error code.

Rejected when:
- Validation exists only in frontend.
- Socket command bypasses REST command validation.
- Error message is unclear or not machine-readable.
- Invalid command changes projection.

---

### 1.4 Authorization

Accepted when:
- Auth is required for all non-public endpoints.
- RBAC is checked for every API request.
- RBAC is checked for every socket message if Socket.IO is enabled.
- Public scoreboard clients are read-only.
- Referee/Scorer can operate only assigned matches.
- Admin actions are denied unless user has admin permission.
- Deny-by-default is implemented.

Rejected when:
- UI hiding is the only protection.
- Viewer can call live command endpoints.
- Public scoreboard can submit score/foul/clock commands.
- Referee/Scorer can operate unassigned match.
- Socket room membership grants unlimited command permission.

---

### 1.5 MariaDB Transaction Safety

Accepted when every live command that appends an event follows this transaction pattern:

1. Authenticate user.
2. Authorize permission.
3. Validate payload.
4. Check `command_deduplication`.
5. Lock `match_streams` row with `SELECT ... FOR UPDATE`.
6. Compare `expectedSeq` with `last_seq_no`.
7. Run rules engine.
8. Insert `match_events`.
9. Update `match_streams.last_seq_no`.
10. Update projections/snapshots when possible.
11. Insert audit log when required.
12. Commit.

Rejected when:
- Event append and projection update can commit separately without recovery plan.
- `seq_no` can duplicate.
- `last_seq_no` can move backward.
- Command conflict is ignored.
- Audit log is inserted without matching event or correlation ID.

---

### 1.6 Realtime Delivery

For Hostatom/Plesk shared-hosting mode, REST polling is the primary realtime mechanism.

Accepted when:
- Public scoreboard can sync by `lastEventSeq`.
- Operator dashboard can sync by `lastEventSeq`.
- Server returns current projection and/or missed events.
- UI detects stale state.
- UI can request full resync.
- Optional Socket.IO is only an accelerator, not persistence.

Rejected when:
- Realtime depends only on socket broadcast.
- Client that disconnects misses events forever.
- Server cannot recover state after page refresh.
- Clock display freezes without stale warning.

---

## 2. Live Scoreboard Acceptance Criteria

### 2.1 Public Scoreboard Display

Accepted when:
- Public scoreboard shows home team name.
- Public scoreboard shows away team name.
- Public scoreboard shows home score.
- Public scoreboard shows away score.
- Public scoreboard shows current period.
- Public scoreboard shows game clock.
- Public scoreboard shows shot clock.
- Public scoreboard shows team fouls.
- Public scoreboard shows timeout count or timeout availability if enabled.
- Public scoreboard shows possession indicator if enabled.
- Public scoreboard shows connection/sync status in a non-distracting way.
- Public scoreboard is readable in fullscreen 16:9 layout.
- Public scoreboard supports distant readability.

Rejected when:
- Public scoreboard needs admin login for display mode.
- Public scoreboard can mutate match state.
- Public scoreboard reads raw event stream for every render instead of projection.
- Public scoreboard does not recover after refresh.

---

### 2.2 Realtime Update Delay

Accepted when:
- Score changes appear on public scoreboard within configured target delay.
- Recommended target for polling mode: 300–1000 ms depending on hosting load.
- UI shows stale indicator if no successful sync within configured stale threshold.
- Manual full sync button is available for operator/admin screens.

Rejected when:
- UI silently displays stale state.
- Public display can be more than one event behind without warning.
- Network error is hidden from operator.

---

### 2.3 Scoreboard Source of Truth

Accepted when:
- Scoreboard state comes from `live_scoreboard_projection`.
- `live_scoreboard_projection.last_event_seq` matches server sequence after sync.
- Rebuilding projection from `match_events` produces the same score.
- Correction events update scoreboard projection without deleting old events.

Rejected when:
- Scoreboard stores independent official score.
- Scoreboard has manual state not backed by event.
- Corrected score cannot be explained by event timeline.

---

## 3. Score Control Acceptance Criteria

### 3.1 Add Score

Accepted when:
- Authorized operator can add +1, +2, +3 to home team.
- Authorized operator can add +1, +2, +3 to away team.
- Score command creates `SCORE_ADDED` event.
- Event contains team ID, points, period, clock context, actor, device, and correlation ID.
- Projection updates score from event.
- Duplicate `commandId` does not double score.
- Wrong `expectedSeq` returns conflict and does not append event.

Rejected when:
- Score is updated directly in projection only.
- Client sends total score and server accepts it as truth.
- Duplicate click creates duplicate points.
- Viewer can add score.

---

### 3.2 Subtract Score

Accepted when:
- Direct score subtraction is treated as correction workflow.
- Correction requires permission.
- Correction requires reason.
- Correction references target event or explains manual adjustment.
- Correction creates compensating event.
- Original score event remains unchanged.

Rejected when:
- Operator can silently subtract score without reason.
- Existing score event is edited.
- Audit log has no old/new value.
- Score projection differs from replay result.

---

### 3.3 Score Attribution

Accepted when:
- If player attribution is enabled, score event can include player ID.
- Server validates player is in match roster.
- Server rejects score attribution to inactive, ejected, fouled-out, or non-rostered player unless approved override exists.
- Missing player attribution is allowed only if product mode allows team-only scoring.

Rejected when:
- Score can be assigned to player outside match roster.
- Player stats and team score become inconsistent.
- System requires player attribution in a mode where user selected team-only scoring.

---

## 4. Game Clock Acceptance Criteria

### 4.1 Clock Model

Accepted when:
- Game clock uses deadline-based model.
- Backend does not rely on long-running `setInterval()` to persist every second.
- `GAME_CLOCK_STARTED` stores remaining time and server start timestamp.
- `GAME_CLOCK_STOPPED` stores computed remaining time.
- UI derives display from server timestamp and remaining time.
- Refreshing browser preserves correct clock state.

Rejected when:
- Clock works only while one browser tab remains open.
- Server writes every second as the official clock.
- Clock state is lost on refresh.
- Clock continues visually without server-backed running state.

---

### 4.2 Start / Stop Clock

Accepted when:
- Authorized operator can start game clock.
- Authorized operator can stop game clock.
- Cannot start already running clock without idempotent handling.
- Cannot stop already stopped clock without idempotent handling.
- Start/stop commands append events.
- Projection reflects running/stopped status.
- Audit metadata exists.

Rejected when:
- Start/stop only changes frontend state.
- Double start corrupts remaining time.
- Double stop creates negative time.
- Viewer can operate clock.

---

### 4.3 Set Clock

Accepted when:
- Setting clock requires elevated permission or guarded operator permission.
- Setting clock requires reason if match has already started.
- New value is validated against current period duration.
- `GAME_CLOCK_SET` event records old value, new value, reason, actor, and device.
- Projection updates from event.
- Replay timeline shows clock correction.

Rejected when:
- Clock can be edited silently.
- Clock can be set beyond period duration.
- Clock can become negative.
- Existing start/stop event is edited.

---

### 4.4 Period Expiration

Accepted when:
- UI clearly indicates when clock reaches 0.
- Operator can confirm period end.
- `PERIOD_ENDED` event is appended.
- Next period cannot start until valid transition.
- If final regulation period ends tied, system suggests overtime creation.
- If final regulation period ends not tied, system allows match finalization.

Rejected when:
- Period ends automatically without official confirmation in a mode that requires manual confirmation.
- Match finalizes while score is tied in knockout/non-draw mode.
- Overtime is skipped when required.
- New period starts with invalid clock duration.

---

## 5. Shot Clock Acceptance Criteria

### 5.1 Shot Clock Model

Accepted when:
- Shot clock also uses deadline-based model.
- Backend does not require permanent background process.
- Shot clock running/stopped/remaining state survives refresh.
- Shot clock can be displayed independently from game clock.
- Shot clock projection is rebuildable from events.

Rejected when:
- Shot clock exists only as frontend timer.
- Shot clock cannot recover after page reload.
- Shot clock and game clock drift without resync.

---

### 5.2 Reset 24

Accepted when:
- Authorized operator can reset shot clock to 24.
- Command creates `SHOT_CLOCK_RESET_24` event.
- Event stores reason/context if required.
- Projection updates remaining shot clock.
- Reset is guarded if configured as high-risk shortcut.

Rejected when:
- Reset 24 silently overwrites shot clock state without event.
- Reset can be triggered by viewer.
- Reset is not visible in replay.

---

### 5.3 Reset 14

Accepted when:
- Authorized operator can reset shot clock to 14.
- Command creates `SHOT_CLOCK_RESET_14` event.
- Projection updates correctly.
- UI clearly distinguishes reset 14 from reset 24.
- Shortcut for reset 14 is guarded or visually separated.

Rejected when:
- Reset 14 uses same command as reset 24.
- UI makes 14/24 easy to confuse.
- Replay cannot explain why shot clock was reset to 14.

---

### 5.4 Manual Shot Clock Set

Accepted when:
- Manual set requires permission.
- Manual set requires reason after match starts.
- Value is validated.
- Event records old value, new value, actor, reason.
- Projection updates from event.

Rejected when:
- Manual set is silent.
- Invalid value is accepted.
- Manual set bypasses audit.

---

### 5.5 Shot Clock Rule Automation

Accepted when:
- Any automated shot clock decision comes from rules engine.
- If rule context is incomplete, system returns `NEEDS_SOURCE` or requires manual decision.
- AI agent does not invent unverified FIBA edge cases.
- Operator can manually correct with reason when official decision differs from suggestion.

Rejected when:
- UI hard-codes shot clock logic.
- AI agent guesses rule not documented in rules profile.
- Backend applies rule without source reference or reason code.

---

## 6. Team Foul Acceptance Criteria

### 6.1 Add Team Foul

Accepted when:
- Team foul can be added through player foul event or approved manual team foul command.
- Team foul count is period-specific.
- Projection shows team fouls for current period.
- Team foul penalty state updates after threshold.
- Event contains team ID, period, actor, and correlation ID.

Rejected when:
- Team fouls are global for whole match without period separation.
- Team foul count cannot be rebuilt from events.
- Projection and event replay produce different foul count.

---

### 6.2 Team Foul Penalty

Accepted when:
- Rules engine returns penalty state from team foul count and period.
- UI shows penalty status clearly.
- Penalty state is derived, not manually stored as untracked truth.
- Overtime handling follows rules profile or returns `NEEDS_SOURCE`.

Rejected when:
- Penalty status is manually toggled without event or rule decision.
- Team penalty remains wrong after correction.
- Overtime team foul behavior is guessed without source.

---

### 6.3 Correct Team Foul

Accepted when:
- Correction requires permission.
- Correction requires reason.
- Original foul event remains unchanged.
- Compensating correction updates projection.
- Audit log records old/new foul count or target event.

Rejected when:
- Team foul number is directly edited.
- Correction has no reason.
- Replay timeline hides correction.

---

## 7. Player Foul Acceptance Criteria

### 7.1 Add Player Foul

Accepted when:
- Authorized operator can add foul to player in match roster.
- Server validates player belongs to match roster.
- Event contains player ID, team ID, foul type if enabled, period, clock context, actor, and device.
- Player foul projection updates.
- Team foul projection updates when foul counts as team foul.
- Duplicate command does not double foul.

Rejected when:
- Foul can be assigned to non-rostered player.
- Player foul updates but team foul does not update when it should.
- Team foul updates but player foul event is missing.
- Viewer can add foul.

---

### 7.2 Player Foul-Out

Accepted when:
- Rules engine detects player reaching foul limit.
- System creates or derives foul-out status according to approved model.
- UI clearly marks player as fouled out.
- Scorer is warned before assigning additional participation to fouled-out player.
- Correction that removes foul also recalculates foul-out state.

Rejected when:
- Player can continue as normal after reaching foul limit with no warning.
- Foul-out is hard-coded in UI only.
- Correction does not update foul-out state.

---

### 7.3 Foul Type Safety

Accepted when:
- Basic personal foul can be recorded.
- Technical, unsportsmanlike, disqualifying, fighting, special foul logic is implemented only when source-backed penalty matrix exists.
- Missing rule returns `[NEEDS SOURCE]` and requires manual official handling.
- System can record manual note if full automation is not available.

Rejected when:
- AI agent invents penalty result.
- Technical/unsportsmanlike/disqualifying foul is treated as normal personal foul without warning.
- System silently applies unverified free throw/possession logic.

---

## 8. Timeout Acceptance Criteria

### 8.1 Grant Timeout

Accepted when:
- Timeout command requires assigned operator permission.
- Server validates timeout quota using rules engine.
- Timeout event records team ID, period, clock context, actor, device, and correlation ID.
- Timeout projection updates.
- Timeout count is grouped correctly by half/overtime according to rules profile.
- UI displays remaining timeout availability.

Rejected when:
- Timeout count is only a frontend variable.
- Timeout can exceed quota without override.
- Viewer can grant timeout.
- Timeout correction cannot be audited.

---

### 8.2 Timeout Duration

Accepted when:
- Timeout duration comes from rules profile.
- Timeout clock can be displayed if feature enabled.
- Timeout does not corrupt game clock state.
- Timeout can be cancelled/corrected with reason.

Rejected when:
- Timeout duration is hard-coded randomly in UI.
- Timeout starts/stops game clock without event.
- Timeout is removed by deleting event.

---

### 8.3 Timeout Correction

Accepted when:
- Cancelling timeout requires permission.
- Cancelling timeout requires reason.
- `TIMEOUT_CANCELLED_BY_CORRECTION` or equivalent compensating event is appended.
- Original event remains unchanged.
- Projection recalculates timeout count.

Rejected when:
- Timeout row is deleted.
- Correction does not appear in replay.
- Audit log does not include reason.

---

## 9. Period and Overtime Acceptance Criteria

### 9.1 Start Match

Accepted when:
- Match can start only from valid pre-game state.
- Required teams are assigned.
- Rule profile is assigned.
- Initial period and clock are initialized.
- Start match appends event.
- Projection updates status.

Rejected when:
- Match starts without teams.
- Match starts without rule profile.
- Match starts twice and corrupts state.

---

### 9.2 Start / End Period

Accepted when:
- Period transitions follow rules engine.
- Starting period initializes correct game clock duration.
- Ending period appends `PERIOD_ENDED`.
- Direction switch behavior follows configured product decision.
- UI clearly shows period status.

Rejected when:
- Period can skip from Q1 to Q3 without approved correction.
- Clock duration is wrong.
- Period state exists only in UI.

---

### 9.3 Overtime

Accepted when:
- If regulation ends tied and match requires winner, system suggests overtime.
- Overtime duration comes from rules profile.
- Overtime appends `OVERTIME_STARTED`.
- Overtime timeout quota is tracked separately or according to rules profile.
- Multiple overtimes are supported.

Rejected when:
- Match finalizes tied when winner is required.
- Overtime uses regulation period duration.
- Overtime breaks team foul/timeout projection.

---

## 10. Correction Acceptance Criteria

### 10.1 Correction Permission

Accepted when:
- Correction requires authorized role.
- Admin can correct according to permission.
- Referee/Scorer can correct only assigned match if allowed.
- Viewer and public clients cannot correct.
- Post-match correction may require stronger permission than live correction.

Rejected when:
- Any logged-in user can correct score/foul/clock.
- Role is checked only in frontend.
- Socket correction bypasses REST authorization.

---

### 10.2 Correction Reason

Accepted when:
- Every correction requires non-empty reason.
- Reason is stored in event metadata or audit log.
- Reason is visible in admin audit view.
- Reason is visible in replay/correction timeline where appropriate.
- System rejects correction with missing reason.

Rejected when:
- Reason is optional for correction.
- Reason is stored only in browser.
- Correction is not explainable later.

---

### 10.3 Compensating Event

Accepted when:
- Correction creates new event(s).
- Original event remains unchanged.
- Correction references target event when possible.
- Projection is recalculated from event stream.
- Audit log links correction request and applied events with correlation ID.

Rejected when:
- Original event is edited.
- Incorrect event is deleted.
- Projection is manually patched without event.
- Replay timeline cannot show correction.

---

### 10.4 Correction Workflow

Accepted when:
- Correction may be requested.
- Correction may be approved/applied by authorized role.
- Correction may be rejected with reason.
- UI confirms high-risk correction.
- Correction result syncs to public scoreboard and operator dashboards.

Rejected when:
- Correction happens with one accidental click.
- Rejected correction still changes state.
- Public scoreboard does not update after correction.

---

## 11. Replay Acceptance Criteria

### 11.1 Replay Timeline

Accepted when:
- Replay timeline is built from `match_events`.
- Events are ordered by `seq_no`.
- Replay can show score progression.
- Replay can show fouls, timeout, clock changes, shot clock changes, and corrections.
- Replay can identify actor, device, and timestamp for audit-visible actions.

Rejected when:
- Replay is based on UI log only.
- Replay skips corrections.
- Replay order differs from event sequence.

---

### 11.2 State at Sequence

Accepted when:
- System can rebuild match state at a given sequence number.
- Rebuilt state matches projection checkpoint at that sequence if available.
- Replay can start from snapshot and apply missed events.
- Projection rebuild does not modify event store.

Rejected when:
- Cannot inspect past state.
- Snapshot is treated as source of truth.
- Rebuild changes historical events.

---

## 12. Reconnect / Polling Acceptance Criteria

### 12.1 Client Sync

Accepted when:
- Client sends `lastEventSeq`.
- Server returns missed events, projection patch, or full state.
- Client updates `lastEventSeq`.
- UI detects if full sync is required.
- Refreshing page restores latest state.

Rejected when:
- Client has no sequence tracking.
- Missed events are ignored.
- Refresh causes score reset.
- UI silently continues from stale state.

---

### 12.2 Public Scoreboard Reconnect

Accepted when:
- Public scoreboard auto-syncs after network interruption.
- Public scoreboard cannot send commands during reconnect.
- Public scoreboard shows stale/offline indicator.
- Public scoreboard recovers latest projection when network returns.

Rejected when:
- Scoreboard freezes with no warning.
- Scoreboard reconnect creates commands.
- Scoreboard requires manual database repair after reconnect.

---

### 12.3 Operator Reconnect

Accepted when:
- Operator screen rehydrates latest projection.
- Operator screen compares local `expectedSeq` to server `currentSeq`.
- Operator cannot submit stale command without conflict handling.
- Operator can trigger full sync.

Rejected when:
- Operator submits command based on stale state and overwrites newer event.
- Reconnect loses pending command status.
- Conflict message is unclear.

---

## 13. Socket.IO Optional Acceptance Criteria

Socket.IO is optional and must not replace polling-first reliability.

Accepted when:
- System works fully without Socket.IO.
- Socket.IO events are delivery optimization only.
- Socket reconnect uses same `lastEventSeq` recovery.
- Socket command path, if enabled, uses same command handler as REST.
- Socket command authorization is checked per message.

Rejected when:
- Socket broadcast is the only update mechanism.
- Socket command has separate business logic from REST.
- Socket connection implies permission.
- Missed socket packets cannot be recovered.

---

## 14. Duplicate Event / Idempotency Acceptance Criteria

### 14.1 Duplicate Command

Accepted when:
- Same `commandId` submitted twice returns same result or idempotent duplicate response.
- Duplicate command does not append second event.
- Duplicate command does not update projection twice.
- Duplicate command is logged or traceable.

Rejected when:
- Double-click adds score twice for same command.
- Retry after network error creates duplicate event.
- Duplicate command causes sequence gap.

---

### 14.2 Duplicate Event Protection

Accepted when:
- `match_events.event_id` is unique.
- `(match_id, seq_no)` is unique.
- Duplicate insert fails safely.
- Failed duplicate does not corrupt projection.

Rejected when:
- Two events share same sequence.
- Projection applies same event twice.
- Duplicate prevention exists only in frontend.

---

## 15. Concurrent Operator Actions Acceptance Criteria

Accepted when:
- Two operators submitting with same `expectedSeq` cannot both commit silently.
- First valid command commits.
- Second command receives conflict or requires resync.
- Conflict response includes server `currentSeq`.
- UI can refresh state and retry intentionally.

Rejected when:
- Last write wins silently.
- Both commands receive same sequence.
- Score/foul state becomes inconsistent.
- Conflict creates partial projection update.

---

## 16. Tournament Management Acceptance Criteria

### 16.1 Tournament Creation

Accepted when:
- Admin can create tournament.
- Required fields are validated.
- Tournament has rule profile reference.
- Tournament has status lifecycle.
- Non-admin cannot create tournament unless explicitly permitted.

Rejected when:
- Tournament exists without rule profile.
- Viewer can create tournament.
- Tournament status is arbitrary text without lifecycle.

---

### 16.2 Team Registration

Accepted when:
- Admin can add team to tournament.
- Duplicate team entry is prevented.
- Team master and tournament roster are separate.
- Removing team after schedule generation requires guarded workflow.

Rejected when:
- Team master is overwritten by tournament-specific data.
- Duplicate teams break standings.
- Removing team deletes historical matches.

---

### 16.3 Match Scheduling

Accepted when:
- Admin can create match between tournament teams.
- Match references teams, venue/court if enabled, scheduled time, and rule profile.
- Match starts only when required setup is complete.
- Schedule change after match start is restricted.

Rejected when:
- Match can start without teams.
- Match can reference non-tournament teams without override.
- Schedule edit corrupts event stream.

---

### 16.4 Standings

Accepted when:
- Standings are projection/read model.
- Standings can be rebuilt from official match results.
- Correction to finalized match triggers standings recalculation or marks standings stale.
- Tie-break logic is source-backed or explicitly marked `[NEEDS SOURCE]`.

Rejected when:
- Standings are manually edited without audit.
- Corrected match result does not affect standings.
- AI agent invents tie-break rules.

---

## 17. Match Summary Acceptance Criteria

Accepted when:
- Match summary is generated from event stream/projections.
- Summary includes final score.
- Summary includes period scores if available.
- Summary includes fouls/timeouts if enabled.
- Summary includes correction history if admin view.
- Summary is available after match finalization.
- Public summary excludes sensitive audit details.

Rejected when:
- Summary is manually typed as official truth.
- Summary differs from replay.
- Post-match correction does not update summary.

---

## 18. Admin Audit Log Acceptance Criteria

Accepted when audit log stores:
- actor user ID
- actor role
- device ID
- action type
- target entity
- old value when applicable
- new value when applicable
- reason when required
- timestamp
- IP/user-agent if available
- correlation ID
- causation ID
- event sequence when applicable

Rejected when:
- Audit log lacks actor.
- Correction lacks reason.
- Audit log cannot link to event sequence.
- Privileged action leaves no trace.

---

## 19. Security Acceptance Criteria

Accepted when:
- Password/session policy is implemented according to approved auth design.
- All private APIs require authentication.
- All commands require authorization.
- Public endpoints expose only safe read-only data.
- CSRF protection exists for cookie-based auth.
- Rate limiting or abuse protection exists for command endpoints where possible.
- Input validation prevents malformed JSON and invalid enum values.
- Error responses do not leak secrets.

Rejected when:
- Admin route can be accessed by URL guessing.
- Public token can operate match.
- Backend trusts frontend role.
- Secrets are committed to repository.

---

## 20. UI / UX Acceptance Criteria

### 20.1 Operator UI

Accepted when:
- Buttons are large enough for touchscreen use.
- Dangerous actions require confirmation or long press.
- Correction actions require reason.
- UI shows current `seqNo`.
- UI shows connection state.
- UI shows stale state warning.
- UI prevents repeated click while command is pending or handles idempotency.
- Keyboard shortcuts are visible in help overlay.

Rejected when:
- High-risk buttons are small and adjacent.
- UI hides command error.
- Operator cannot tell whether command succeeded.
- Correction is too easy to trigger accidentally.

---

### 20.2 Public Display UI

Accepted when:
- Fullscreen 16:9 layout works.
- Text and numbers are readable from distance.
- Display has high contrast.
- Non-essential controls are hidden.
- Public display has no command buttons.
- Public display recovers from refresh.

Rejected when:
- Public display shows admin controls.
- Score numbers are too small.
- Browser refresh loses match state.

---

## 21. AI Agent Definition of Done

An AI-generated feature is accepted only when the agent reports:

- Files changed
- Reason for change
- Event types affected
- API endpoints affected
- Projection affected
- Permission affected
- Audit impact
- Tests added
- Edge cases covered
- Manual verification steps
- Rollback impact

Rejected when the AI agent:
- Only says “implemented”
- Provides no tests
- Does not mention event/projection impact
- Changes schema without migration note
- Changes rule behavior without source
- Bypasses existing command handler
- Stores mutable scoreboard state as truth

---

## 22. MVP Release Gate

The MVP cannot be used in a real match until all of the following pass:

- Match setup
- Team setup
- Public scoreboard display
- Score +1/+2/+3
- Game clock start/stop/set
- Shot clock start/stop/reset 24/reset 14/set
- Team foul add/correct
- Player foul add/correct/foul-out warning
- Timeout grant/correct
- Period start/end
- Overtime creation
- Correction with reason
- Replay timeline
- Match summary
- RBAC for Admin / Referee-Scorer / Viewer
- Public read-only access
- Polling reconnect
- Duplicate command handling
- Concurrent command conflict
- Projection rebuild from `match_events`
- MariaDB backup/export procedure

---

## 23. Final Acceptance Statement

A feature is accepted only if it can answer these questions:

1. What event was created?
2. Who created it?
3. When was it created?
4. From which device?
5. Which permission allowed it?
6. Which rule allowed it?
7. What projection changed?
8. Can it be replayed?
9. Can it be corrected without deleting history?
10. Can the UI recover after reconnect?
11. Can the state be rebuilt from `match_events`?
12. Are tests proving the behavior?

If the answer to any critical question is “no”, the feature is not production-ready.
