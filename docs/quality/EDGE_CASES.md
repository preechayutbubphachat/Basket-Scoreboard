# EDGE_CASES.md

## 0. Purpose

[SYSTEM RECOMMENDATION] This file defines high-risk edge cases for the Basketball Scoreboard and Tournament Management system.

The purpose is to prevent AI coding agents from building only the happy path. A feature is not production-ready until its edge cases are handled, tested, and documented.

This system is intended for live basketball competition. Edge cases must be treated as normal operating scenarios, not rare exceptions.

---

## 1. Scope

This document covers edge cases for:

- Game clock
- Shot clock
- Scoring
- Team fouls
- Player fouls
- Timeout
- Period transitions
- Overtime
- Possession and direction
- Correction / undo
- Replay
- Polling-first realtime sync
- Optional Socket.IO sync
- Duplicate commands
- Concurrent operator actions
- RBAC / authorization
- Tournament standings
- Match finalization
- Hostatom / Plesk / MariaDB deployment constraints

---

## 2. Core Principles

### 2.1 Source of Truth

[SYSTEM RECOMMENDATION] `match_events` is the source of truth.

Edge case handling must not directly mutate scoreboard totals, foul totals, clock totals, standings, or summary records as authoritative truth.

Allowed:

- Append new events
- Rebuild projections
- Create compensating correction events
- Recompute snapshots
- Recompute standings

Forbidden:

- Delete historical events
- Update old event payloads
- Directly patch score without an event
- Trust client-side clock as official
- Trust client-side score/foul state as official
- Treat Socket.IO broadcast as persistence

---

## 3. Severity Levels

| Severity | Meaning | Required Handling |
|---|---|---|
| P0 | Can corrupt official match record or cause wrong winner | Must block, validate, log, test |
| P1 | Can cause wrong public display or operator confusion | Must recover and show clear UI feedback |
| P2 | Can cause minor delay or non-critical mismatch | Must sync/rebuild or show warning |
| P3 | Cosmetic / usability issue | Fix when possible |

---

## 4. Edge Case Format

Every edge case should be documented in this format:

```md
## EDGE-ID: Title

Severity:
Area:
Trigger:
Risk:
Expected behavior:
Event handling:
Projection effect:
UI behavior:
Audit requirement:
Permission requirement:
Test requirement:
```

AI agents must use this format when adding new edge cases.

---

# 5. Game Clock Edge Cases

## CLK-001: Game clock expires while shot clock is still running

Severity: P0  
Area: Game clock / Shot clock / Period transition

Trigger:
- Game clock reaches `00:00`.
- Shot clock still has time remaining.

Risk:
- Shot clock may continue after period ends.
- Public scoreboard may show invalid active state.
- Operator may accidentally continue match in wrong period.

Expected behavior:
- Game clock becomes stopped.
- Shot clock becomes stopped.
- Period end state is entered.
- UI shows period ended / awaiting confirmation.
- No new scoring/foul/timeout command should be accepted unless allowed by match state and correction flow.

Event handling:
- Append `GAME_CLOCK_EXPIRED` or `PERIOD_CLOCK_EXPIRED`.
- Append `SHOT_CLOCK_STOPPED` if shot clock was running.
- Append `PERIOD_END_PENDING` if manual confirmation is required.

Projection effect:
- `clock_projection.gameClock.running = false`
- `shot_clock_projection.running = false`
- `live_scoreboard_projection.periodStatus = "END_PENDING"`

UI behavior:
- Show full-screen warning: "Period clock expired"
- Disable normal live controls except:
  - confirm period end
  - correction
  - manual clock set
  - audit note

Audit requirement:
- Record system-generated expiration event.
- If operator adjusts clock after expiry, require reason.

Permission requirement:
- `match.clock.adjust` for manual correction.
- `match.period.confirmEnd` for period finalization.

Test requirement:
- Simulate game clock expiring while shot clock is running.
- Verify both clocks stop.
- Verify projections rebuild correctly from events.

---

## CLK-002: Operator stops game clock late

Severity: P1  
Area: Game clock / correction

Trigger:
- Referee whistles.
- Operator stops clock late.
- Game clock has run down too far.

Risk:
- Official clock is wrong.
- Time correction may be needed.

Expected behavior:
- Operator can use `GAME_CLOCK_SET` only with permission.
- Correction requires reason.
- Original clock events remain unchanged.
- New clock set event is appended.

Event handling:
- Existing `GAME_CLOCK_STOPPED` remains.
- Append `GAME_CLOCK_SET` with corrected `remainingMs`.
- Append `CORRECTION_APPLIED` if part of correction workflow.

Projection effect:
- Clock projection uses latest valid clock-set event.
- Replay timeline shows late stop and correction.

UI behavior:
- Show correction modal:
  - old remaining time
  - new remaining time
  - required reason
  - actor and device

Audit requirement:
- Required.

Permission requirement:
- `match.clock.correct`

Test requirement:
- Stop late.
- Apply clock correction.
- Rebuild projection.
- Verify audit log contains old/new values and reason.

---

## CLK-003: Start game clock while already running

Severity: P1  
Area: Game clock

Trigger:
- Operator presses start twice.
- Duplicate keyboard shortcut.
- Browser retries command.

Risk:
- Duplicate start event.
- Clock calculation becomes inconsistent.

Expected behavior:
- Reject command if clock is already running.
- If commandId is duplicate, return original result.
- Do not append a second start event.

Event handling:
- No new event if duplicate or invalid.
- Return `DUPLICATE_COMMAND` or `CLOCK_ALREADY_RUNNING`.

Projection effect:
- No change.

UI behavior:
- Show non-blocking warning.

Audit requirement:
- Log rejected privileged command if suspicious or repeated.

Permission requirement:
- `match.clock.operate`

Test requirement:
- Submit same start command twice.
- Submit different start command while running.
- Verify only one event is appended.

---

## CLK-004: Stop game clock while already stopped

Severity: P1  
Area: Game clock

Expected behavior:
- Reject as `CLOCK_ALREADY_STOPPED`.
- No event appended unless this is a documented correction command.

Test requirement:
- Stop clock twice.
- Verify sequence does not increment on invalid second stop.

---

## CLK-005: Set game clock to invalid value

Severity: P0  
Area: Game clock validation

Invalid examples:
- Negative time
- More than period duration
- Non-integer milliseconds
- Null time
- Time format not parseable

Expected behavior:
- Reject with validation error.
- No event appended.

Test requirement:
- Validate all invalid values.

---

# 6. Shot Clock Edge Cases

## SCLK-001: Shot clock reset 24 when it should be 14

Severity: P0  
Area: Shot clock / rules engine

Trigger:
- Operator presses reset 24 after offensive rebound or frontcourt reset situation where 14 should apply.

Risk:
- Wrong shot clock affects possession and game fairness.

Expected behavior:
- If rules engine has enough context, reject reset 24 and suggest reset 14.
- If context is ambiguous, allow manual override only with reason and audit.
- Never silently change to 24.

Event handling:
- Preferred: append `SHOT_CLOCK_RESET_14`.
- If manual override: append `SHOT_CLOCK_SET` or `SHOT_CLOCK_RESET_24_MANUAL_OVERRIDE` with reason.

Projection effect:
- Shot clock projection updates based on accepted event only.

UI behavior:
- Show warning:
  - "Rule context suggests 14 seconds"
  - Options: cancel / reset 14 / manual override with reason

Audit requirement:
- Required for override.

Permission requirement:
- `match.shotClock.operate`
- `match.shotClock.override` for manual override

Test requirement:
- Context requires 14.
- Attempt reset 24.
- Verify block or override reason required.

---

## SCLK-002: Shot clock reset 14 when it should be 24

Severity: P0  
Area: Shot clock / rules engine

Expected behavior:
- Same as SCLK-001 but reversed.
- Rules engine returns `SHOT_CLOCK_RESET_SHOULD_BE_24`.

Test requirement:
- Backcourt new possession context.
- Attempt reset 14.
- Verify correct behavior.

---

## SCLK-003: No reset situation but operator presses reset

Severity: P0  
Area: Shot clock

Trigger:
- Ball goes out of bounds but same team retains possession and rules indicate no reset.
- Operator presses reset.

Expected behavior:
- Reject if rules context is known.
- If context is manual/ambiguous, require override reason.
- Append correction/override event only if authorized.

Event handling:
- Reject normal reset.
- Optional append `SHOT_CLOCK_SET` with reason.

UI behavior:
- Show current shot clock and rule decision.

Test requirement:
- Simulate no-reset context.
- Attempt reset.
- Verify no automatic reset.

---

## SCLK-004: Shot clock should be off when game clock is below threshold

Severity: P1  
Area: Shot clock / game clock interaction

Trigger:
- Game clock has less time than shot clock threshold.
- New possession occurs.
- Shot clock may need to be disabled/off according to configured rule profile.

Expected behavior:
- Rules engine decides whether shot clock should be off.
- UI must display shot clock as hidden/off/inactive, not counting down.
- Manual override requires reason.

Event handling:
- Append `SHOT_CLOCK_DISABLED` or `SHOT_CLOCK_SET_OFF` if supported by event model.
- Otherwise append `SHOT_CLOCK_SET` with `isVisible=false` in payload if approved.

Projection effect:
- `shot_clock_projection.visible = false`
- `shot_clock_projection.running = false`

Test requirement:
- Game clock below threshold.
- New control.
- Verify shot clock off behavior.

---

## SCLK-005: Shot clock expires while game clock still running

Severity: P0  
Area: Shot clock violation

Trigger:
- Shot clock reaches 0.
- Game clock remains active.

Expected behavior:
- Shot clock stops.
- Game clock behavior depends on operator/referee workflow and rule profile.
- System should show `SHOT_CLOCK_EXPIRED`.
- Do not automatically change possession unless configured and validated.

Event handling:
- Append `SHOT_CLOCK_EXPIRED`.
- Optional `SHOT_CLOCK_STOPPED`.

UI behavior:
- Visual and audio alert.
- Operator chooses next action:
  - stop game clock
  - possession change
  - correction
  - reset shot clock

Audit requirement:
- System-generated event should be traceable.

Test requirement:
- Shot clock expires.
- Verify alert and event.
- Verify no unauthorized automatic possession change.

---

## SCLK-006: Start shot clock while game clock is stopped

Severity: P1  
Area: Clock sync

Expected behavior:
- Usually reject unless manual mode is enabled.
- Return `GAME_CLOCK_NOT_RUNNING` or `SHOT_CLOCK_START_REQUIRES_GAME_CLOCK`.
- Manual override requires permission and reason.

Test requirement:
- Stop game clock.
- Attempt shot clock start.
- Verify behavior.

---

# 7. Scoring Edge Cases

## SCORE-001: Wrong team score added

Severity: P0  
Area: Scoring / correction

Trigger:
- Operator adds points to Home instead of Away or vice versa.

Expected behavior:
- Original `SCORE_ADDED` remains.
- Correction creates compensating event.
- Correct score is added to correct team.
- Projection recalculates score.

Event handling example:
```txt
seq 20 SCORE_ADDED home +3
seq 21 CORRECTION_REQUESTED reason="กดผิดทีม"
seq 22 SCORE_REMOVED_BY_CORRECTION targetSeq=20 home -3
seq 23 SCORE_ADDED away +3
seq 24 CORRECTION_APPLIED
```

Projection effect:
- Live scoreboard shows corrected score.
- Replay timeline shows both mistake and correction.

UI behavior:
- Correction modal:
  - wrong event
  - target team
  - correct team
  - points
  - reason

Audit requirement:
- Required.

Permission requirement:
- `match.score.correct`

Test requirement:
- Add wrong team score.
- Correct it.
- Rebuild projection.
- Verify final score and audit trail.

---

## SCORE-002: Wrong player assigned points

Severity: P1  
Area: Player statistics / summary

Trigger:
- Points assigned to wrong player.

Expected behavior:
- Team score may remain unchanged.
- Player stat projection changes through correction events.
- Original scoring event remains.

Event handling:
- Append `PLAYER_SCORE_ATTRIBUTION_CORRECTED` or use correction pattern.
- If event model does not support this yet, mark `[NEEDS SOURCE]` / `[SYSTEM GAP]` and require event model extension.

Projection effect:
- Team score unchanged if points/team same.
- Player stats updated.

UI behavior:
- Correction modal should allow player attribution correction separately from team score correction.

Audit requirement:
- Required.

Permission requirement:
- `match.score.correct`
- `match.playerStats.correct`

Test requirement:
- Score +2 for player A.
- Correct to player B.
- Verify team score unchanged and player stats corrected.

---

## SCORE-003: Score corrected after period ends

Severity: P0  
Area: Score / period / summary

Trigger:
- Period already ended.
- Operator discovers score mistake in previous period.

Expected behavior:
- Allow only through correction flow.
- Require reason.
- Correction event references original event and period.
- Period remains ended unless clock/period correction is also applied.

Projection effect:
- Period score and total score update.
- Match summary updates.
- Replay timeline shows correction after period end.

UI behavior:
- Warn: "You are correcting a previous period."

Audit requirement:
- Required.

Permission requirement:
- `match.score.correctPastPeriod`

Test requirement:
- End Q1.
- Correct Q1 score.
- Verify period score and total score.

---

## SCORE-004: Score corrected after match finalization

Severity: P0  
Area: Score / final result / tournament standings

Expected behavior:
- Require elevated permission.
- Require reason.
- Reopen official result state or create post-final correction event.
- Recompute match summary.
- Recompute tournament standings/bracket if result changed.

Event handling:
- Append `MATCH_RESULT_CORRECTION_REQUESTED`
- Append compensating score events
- Append `MATCH_RESULT_CORRECTED`
- Append `STANDINGS_RECOMPUTE_REQUESTED` if tournament affected

UI behavior:
- Show high-risk warning.
- Show affected downstream objects:
  - standings
  - bracket
  - next match pairing
  - published result

Audit requirement:
- Required and high priority.

Permission requirement:
- `match.result.correctFinal`
- `tournament.standings.recompute`

Test requirement:
- Finalize match.
- Correct score.
- Verify standings recompute.

---

## SCORE-005: Invalid score value

Invalid examples:
- +0
- +4
- negative score through normal score command
- non-integer points
- points without teamId

Expected behavior:
- Reject with validation error.
- No event appended.

Test requirement:
- Validate +1/+2/+3 only for normal score add.

---

# 8. Team Foul Edge Cases

## TFOUL-001: Team reaches penalty threshold

Severity: P1  
Area: Team fouls / rules engine

Trigger:
- Team foul count reaches configured threshold.

Expected behavior:
- Projection marks team as in penalty according to rule profile.
- UI shows penalty indicator.
- No automatic free throw award unless foul engine has enough rule context.

Event handling:
- Append `TEAM_FOUL_ADDED` or derive from `PLAYER_FOUL_ADDED` depending on model.
- Projection calculates penalty status.

Projection effect:
- `teamFoulsByPeriod[teamId] += 1`
- `isInPenalty = true` when threshold reached according to profile

UI behavior:
- Show visible penalty marker.

Test requirement:
- Add fouls to threshold.
- Verify penalty indicator.

---

## TFOUL-002: Foul assigned to wrong team

Severity: P1  
Area: Team fouls / correction

Expected behavior:
- Use correction events.
- Recompute penalty status.

Test requirement:
- Assign team foul to Home.
- Correct to Away.
- Verify both foul counts and penalty state.

---

## TFOUL-003: Team foul correction causes penalty state to disappear

Severity: P1  
Area: Foul projection

Trigger:
- Team had 5 fouls.
- One foul is removed/corrected.
- Team now has 4 or lower depending threshold semantics.

Expected behavior:
- Projection recomputes penalty state from event stream.
- UI updates penalty marker.
- Replay shows transition.

Test requirement:
- Add team fouls.
- Correct one.
- Rebuild projection.

---

# 9. Player Foul Edge Cases

## PFOUL-001: Player reaches foul limit

Severity: P0  
Area: Player fouls / eligibility

Trigger:
- Player receives configured foul count limit.

Expected behavior:
- Player status becomes `FOULED_OUT`.
- UI clearly marks player as unavailable.
- Further normal foul/scoring actions for player should be blocked or warn depending context.

Event handling:
- Append `PLAYER_FOUL_ADDED`.
- Append or derive `PLAYER_FOULED_OUT`.

Projection effect:
- `playerFouls[playerId] = limit`
- `playerStatus = FOULED_OUT`

UI behavior:
- Foul dashboard highlights player.
- Roster picker disables player for normal active play.

Audit requirement:
- Required via event metadata.

Permission requirement:
- `match.foul.operate`

Test requirement:
- Add fouls until limit.
- Verify foul-out state.
- Attempt to assign action to fouled-out player.

---

## PFOUL-002: Foul assigned to wrong player

Severity: P1  
Area: Player fouls / correction

Expected behavior:
- Original event remains.
- Correction removes foul impact from wrong player and applies to correct player.
- If wrong player was fouled out, foul-out status must be recomputed.

Projection effect:
- Recompute player foul counts from event stream.
- Recompute foul-out state.

Test requirement:
- Assign fifth foul to wrong player.
- Correct to another player.
- Verify foul-out status moves correctly.

---

## PFOUL-003: Technical / unsportsmanlike / disqualifying foul needs rule source

Severity: P0  
Area: Foul matrix / rules source

Trigger:
- Operator selects technical, unsportsmanlike, disqualifying, fighting, bench technical, coach technical, or special situation.

Risk:
- Free throws, possession, team foul counting, and disqualification can be wrong.

Expected behavior:
- If `FOUL_PENALTY_MATRIX.md` is not implemented/loaded, return `[NEEDS SOURCE]`.
- System may allow manual record-only foul entry if configured, but must not auto-award penalties without rule source.
- Manual override requires reason.

Event handling:
- Append foul event only if payload includes:
  - foulType
  - chargedTo
  - countsAsTeamFoul decision
  - penalty decision
  - ruleSourceRef or manualOverrideReason

UI behavior:
- Show warning:
  - "Penalty automation unavailable for this foul type"
  - "Requires official source or manual override"

Audit requirement:
- Required.

Permission requirement:
- `match.foul.special`
- `match.rule.override` for manual penalty decisions

Test requirement:
- Try special foul without penalty matrix.
- Verify `[NEEDS SOURCE]` or manual override only.

---

## PFOUL-004: Player receives foul after being fouled out

Severity: P0  
Area: Player eligibility

Expected behavior:
- Reject normal foul assignment to fouled-out player unless correction/special administrative case.
- Return `PLAYER_ALREADY_FOULED_OUT`.

Test requirement:
- Foul out player.
- Try add another foul.
- Verify rejection.

---

# 10. Timeout Edge Cases

## TO-001: Timeout requested after quota exhausted

Severity: P0  
Area: Timeout / rules engine

Expected behavior:
- Reject command.
- No event appended.
- UI shows remaining timeout count.

Test requirement:
- Use all timeouts.
- Request another.
- Verify rejection.

---

## TO-002: Timeout limit in last two minutes of Q4

Severity: P0  
Area: Timeout / FIBA rule profile

Expected behavior:
- Rules engine enforces configured late-game limit.
- If uncertain, return `[NEEDS SOURCE]`.

Test requirement:
- Enter final 2 minutes Q4.
- Validate max allowed timeouts.

---

## TO-003: Timeout requested by unauthorized user

Severity: P0  
Area: RBAC

Expected behavior:
- Reject with `FORBIDDEN`.
- No event appended.
- Log authorization failure if privileged endpoint.

Test requirement:
- Viewer attempts timeout.
- Public scoreboard attempts timeout.
- Verify rejection.

---

## TO-004: Timeout cancelled by correction

Severity: P1  
Area: Timeout / correction

Expected behavior:
- Original timeout remains.
- Append `TIMEOUT_CANCELLED_BY_CORRECTION`.
- Recompute timeout count.

Test requirement:
- Grant timeout.
- Cancel by correction.
- Verify quota restored if rules allow.

---

# 11. Period and Overtime Edge Cases

## PERIOD-001: Period ends with pending foul

Severity: P1  
Area: Period transition / foul

Trigger:
- Game clock expires.
- Foul was called at or near expiry.
- Operator has not entered foul yet.

Expected behavior:
- System allows post-period foul entry with reason/context if authorized.
- Event must reference period and clock context.
- UI should warn "Entering event after period clock expired."

Test requirement:
- Expire period.
- Enter foul for previous period.
- Verify projection and audit.

---

## PERIOD-002: Overtime after tied score

Severity: P0  
Area: Match lifecycle

Expected behavior:
- If regulation ends tied, system should require overtime creation.
- Match cannot be finalized as normal winner.
- Append `OVERTIME_STARTED` after confirmation.

Test requirement:
- End Q4 tied.
- Attempt finalize.
- Verify blocked.
- Start OT.
- Verify period state.

---

## PERIOD-003: Attempt overtime when score not tied

Severity: P0  
Area: Rules engine

Expected behavior:
- Reject unless admin override with reason.
- No overtime event appended by normal command.

Test requirement:
- End Q4 with non-tied score.
- Attempt start OT.
- Verify rejection.

---

## PERIOD-004: End period twice

Severity: P1  
Area: Idempotency

Expected behavior:
- Duplicate command returns original result.
- Different command rejected if period already ended.

Test requirement:
- Submit period end twice.
- Verify only one event.

---

# 12. Possession and Direction Edge Cases

## POSS-001: Possession changed accidentally

Severity: P1  
Area: Possession / correction

Expected behavior:
- Allow correction with reason.
- Projection recalculates possession indicator.
- Public scoreboard updates.

Test requirement:
- Change possession.
- Correct possession.
- Verify final projection.

---

## POSS-002: Direction switch at wrong time

Severity: P1  
Area: Direction / period transition

Trigger:
- Operator switches offensive direction mid-period accidentally.

Expected behavior:
- Direction switch should be guarded.
- Require confirmation if match is active.
- Correction requires reason.

Test requirement:
- Attempt mid-period direction switch.
- Verify guard/confirmation.

---

# 13. Correction and Undo Edge Cases

## CORR-001: Correction without reason

Severity: P0  
Area: Audit

Expected behavior:
- Reject.
- No event appended.
- Return `CORRECTION_REASON_REQUIRED`.

Test requirement:
- Submit correction with empty reason.
- Verify rejection.

---

## CORR-002: Correction targets non-existent event

Severity: P0  
Area: Event integrity

Expected behavior:
- Reject.
- Return `TARGET_EVENT_NOT_FOUND`.

Test requirement:
- Reference unknown seqNo/eventId.
- Verify rejection.

---

## CORR-003: Correction targets already corrected event

Severity: P1  
Area: Correction chain

Expected behavior:
- System should detect event has existing correction.
- Either block or require explicit correction-of-correction workflow.
- Never silently apply duplicate correction.

Test requirement:
- Correct event.
- Try correct same event again.
- Verify policy.

---

## CORR-004: Correction after match finalized

Severity: P0  
Area: Final result / tournament

Expected behavior:
- Require elevated permission.
- Require reason.
- Recompute projections and tournament standings if affected.
- Mark result as corrected.

Test requirement:
- Finalize match.
- Correct score.
- Verify summary and standings.

---

# 14. Replay Edge Cases

## REPLAY-001: Replay must show original mistake and correction

Severity: P1  
Area: Replay / audit

Expected behavior:
- Replay timeline shows both original event and correction event.
- "Current state" mode can show corrected outcome.
- "Historical timeline" mode must preserve original sequence.

Test requirement:
- Add wrong score.
- Correct it.
- Replay event stream.
- Verify both modes.

---

## REPLAY-002: Projection rebuild differs from stored projection

Severity: P0  
Area: Projection integrity

Expected behavior:
- Rebuild from `match_events`.
- Compare checksum/lastSeq if implemented.
- Stored projection may be replaced.
- Event store must not be changed.

Test requirement:
- Corrupt projection in test.
- Rebuild.
- Verify state restored.

---

# 15. Realtime / Polling Edge Cases

## RT-001: Client reconnects after missed events

Severity: P0  
Area: Polling / reconnect

Trigger:
- Client last saw seq 100.
- Server current seq is 108.

Expected behavior:
- Client calls sync with `lastEventSeq=100`.
- Server returns:
  - current projection
  - missed events or state patch
  - currentSeq = 108
- Client hydrates correctly.

API example:
```http
GET /api/v1/matches/:matchId/sync?lastEventSeq=100&projection=live_scoreboard
```

Test requirement:
- Simulate missed events.
- Verify sync catches up.

---

## RT-002: Client reconnects with future lastEventSeq

Severity: P1  
Area: Sync validation

Trigger:
- Client sends `lastEventSeq=999`.
- Server current seq is 120.

Expected behavior:
- Return `FULL_STATE_SYNC_REQUIRED`.
- Client must discard local state and hydrate from projection.

Test requirement:
- Send future seq.
- Verify full sync.

---

## RT-003: Polling returns stale projection

Severity: P1  
Area: Projection update

Expected behavior:
- Response includes projection `lastEventSeq`.
- If projection behind event stream, server should either:
  - update projection before responding, or
  - return `PROJECTION_STALE_RETRY`, or
  - return event patch from event store.

Test requirement:
- Event stream ahead of projection.
- Verify client does not accept stale state as final.

---

## RT-004: Optional Socket.IO disconnects mid-match

Severity: P1  
Area: Socket fallback

Expected behavior:
- UI shows socket disconnected.
- Polling continues.
- No loss of official state.
- Socket reconnect uses `lastEventSeq`.

Test requirement:
- Disconnect socket.
- Continue match through REST/polling.
- Verify scoreboard remains correct.

---

## RT-005: Duplicate socket command

Severity: P0  
Area: Idempotency

Expected behavior:
- Same `commandId` returns original command result.
- No duplicate event.
- If same commandId with different payload, reject as conflict/security issue.

Test requirement:
- Submit same socket command twice.
- Submit same commandId with altered payload.
- Verify behavior.

---

# 16. Concurrent Operator Edge Cases

## CONC-001: Two operators submit at same expectedSeq

Severity: P0  
Area: Optimistic concurrency

Trigger:
- Operator A and Operator B both submit command with `expectedSeq=50`.

Expected behavior:
- First accepted command appends seq 51.
- Second command rejected with `EXPECTED_SEQ_CONFLICT`.
- Second client receives latest projection/currentSeq and must retry intentionally.

Event handling:
- Only one event for seq 51.
- Unique `(match_id, seq_no)` prevents duplicate sequence.

Projection effect:
- Only accepted command changes projection.

Test requirement:
- Concurrent requests.
- Verify one commit and one conflict.

---

## CONC-002: Operator retry after expectedSeq conflict

Severity: P1  
Area: UX / command retry

Expected behavior:
- UI must not auto-retry dangerous commands.
- UI shows latest state and asks operator to confirm.
- Safe commands may be retried only if still valid and product policy allows.

Test requirement:
- Conflict score command.
- UI receives latest state.
- Operator confirms retry with new expectedSeq.

---

## CONC-003: Admin correction while scorer operates live match

Severity: P0  
Area: Correction / concurrency

Expected behavior:
- Correction must use expectedSeq.
- If live command changes state first, correction may conflict and require re-evaluation.
- No silent override.

Test requirement:
- Submit correction and score command concurrently.
- Verify one wins and the other revalidates.

---

# 17. RBAC and Security Edge Cases

## SEC-001: Public scoreboard tries to send command

Severity: P0  
Area: Security

Expected behavior:
- Reject.
- Public token/session has read-only permission.
- No event appended.

Test requirement:
- Public client attempts score/clock command.
- Verify forbidden.

---

## SEC-002: Scorer operates unassigned match

Severity: P0  
Area: Match authorization

Expected behavior:
- Reject.
- Role alone is not enough; assignment required.

Test requirement:
- Scorer assigned to Match A tries Match B.
- Verify forbidden.

---

## SEC-003: Client sends forged role

Severity: P0  
Area: Security

Expected behavior:
- Server ignores client-sent role.
- Server resolves actor permissions from session/token/database.
- Reject forged command.

Test requirement:
- Payload includes `actorRole=Admin`.
- Authenticated user is Viewer.
- Verify forbidden.

---

## SEC-004: Command payload includes score total instead of delta

Severity: P1  
Area: Validation / trust boundary

Expected behavior:
- Reject client-calculated authoritative totals.
- Commands should express intent, e.g. add score +2, not "set homeScore=80" unless correction flow.

Test requirement:
- Send direct total update through normal score endpoint.
- Verify rejection.

---

# 18. MariaDB / Hostatom Deployment Edge Cases

## HOST-001: Node.js process restarts during live match

Severity: P0  
Area: Hosting / persistence

Expected behavior:
- State recovered from MariaDB.
- UI polling detects reconnect.
- Latest projection/snapshot loaded.
- No event loss if transaction committed.

Test requirement:
- Simulate process restart.
- Verify match state from database.

---

## HOST-002: Request times out during event append

Severity: P0  
Area: Transaction safety

Expected behavior:
- Transaction either commits fully or rolls back fully.
- Client checks command status by `commandId`.
- No partial projection update without event.

Test requirement:
- Simulate failure after event insert before projection update.
- Verify transaction rollback or recovery.

---

## HOST-003: No WebSocket support

Severity: P1  
Area: Deployment

Expected behavior:
- System works with REST polling only.
- UI clearly shows polling mode.
- All official state sync works through API.

Test requirement:
- Disable Socket.IO.
- Run live match through polling.

---

## HOST-004: MariaDB JSON support limitations

Severity: P2  
Area: Database compatibility

Expected behavior:
- Store JSON payload as `JSON` or `LONGTEXT` depending hosting support.
- Validate JSON in application layer using Zod.
- Do not rely on advanced DB JSON features unless verified.

Test requirement:
- Insert/read event payload.
- Validate payload in app.

---

# 19. Tournament Standings Edge Cases

## STAND-001: Match result corrected after standings published

Severity: P0  
Area: Tournament standings

Expected behavior:
- Standings marked stale.
- Recompute standings from finalized/corrected match results.
- Publish corrected standings with audit trail.

Event handling:
- Match correction event appended.
- Tournament projection recompute triggered.

UI behavior:
- Admin sees affected standings.
- Public may show "updated" timestamp.

Test requirement:
- Publish standings.
- Correct match result.
- Verify standings recompute.

---

## STAND-002: Tie-break rules missing

Severity: P0  
Area: Tournament rules

Expected behavior:
- If tie-break rule profile not defined, mark `[NEEDS SOURCE]`.
- Do not invent tie-break order.
- Admin must configure/approve tie-break policy.

Test requirement:
- Teams tied.
- Missing tiebreak config.
- Verify system refuses official ranking or marks provisional.

---

## STAND-003: Match forfeiture / walkover

Severity: P1  
Area: Tournament result

Expected behavior:
- Requires tournament rule source or local rule profile.
- Do not hard-code forfeiture score unless approved.
- Audit required.

Test requirement:
- Try record forfeit without rule profile.
- Verify `[NEEDS SOURCE]` or manual policy required.

---

# 20. Match Finalization Edge Cases

## FINAL-001: Finalize match while score tied and no overtime

Severity: P0  
Area: Match lifecycle

Expected behavior:
- Reject under FIBA-style winner-required profile.
- Require overtime unless tournament format explicitly allows tie.

Test requirement:
- End regulation tied.
- Attempt finalize.
- Verify blocked.

---

## FINAL-002: Finalize match with stale projection

Severity: P0  
Area: Projection integrity

Expected behavior:
- Server checks projection lastEventSeq equals stream lastSeq.
- If stale, rebuild/update projection before finalization.

Test requirement:
- Projection behind event stream.
- Attempt finalize.
- Verify server updates or blocks.

---

## FINAL-003: Finalize match with unresolved correction request

Severity: P1  
Area: Correction workflow

Expected behavior:
- Block finalization or require admin confirmation depending policy.
- UI lists unresolved correction requests.

Test requirement:
- Create correction request.
- Attempt finalize.
- Verify block/warning.

---

# 21. UI Edge Cases

## UI-001: Operator screen state older than server

Severity: P1  
Area: UI sync

Expected behavior:
- UI compares local `lastEventSeq` with server `currentSeq`.
- If stale, disable command buttons or warn until sync completes.

Test requirement:
- Delay polling response.
- Submit command with stale expectedSeq.
- Verify conflict handling.

---

## UI-002: Keyboard shortcut repeats due to key hold

Severity: P0  
Area: Input safety

Expected behavior:
- Shortcuts must debounce.
- Dangerous actions require long-press or confirmation.
- `commandId` prevents duplicate event.

Test requirement:
- Hold score key.
- Verify configured behavior.
- Hold reset shot clock key.
- Verify guarded behavior.

---

## UI-003: Public scoreboard loses fullscreen / display reloads

Severity: P2  
Area: Public display

Expected behavior:
- On reload, public scoreboard hydrates from projection.
- No manual intervention needed.
- Show loading/sync indicator.

Test requirement:
- Reload public display mid-match.
- Verify state correct.

---

# 22. Required Edge Case Test Matrix

Every release candidate must pass at least these tests:

| ID | Area | Required |
|---|---|---|
| CLK-001 | Game clock expiry | Yes |
| SCLK-001 | Wrong 24 reset | Yes |
| SCLK-002 | Wrong 14 reset | Yes |
| SCORE-001 | Wrong team correction | Yes |
| SCORE-004 | Post-final correction | Yes |
| TFOUL-001 | Team penalty threshold | Yes |
| PFOUL-001 | Player foul-out | Yes |
| PFOUL-003 | Special foul needs source | Yes |
| TO-001 | Timeout quota exhausted | Yes |
| PERIOD-002 | Overtime after tie | Yes |
| CORR-001 | Correction reason required | Yes |
| RT-001 | Polling missed events | Yes |
| RT-005 | Duplicate command | Yes |
| CONC-001 | Concurrent expectedSeq conflict | Yes |
| SEC-001 | Public command blocked | Yes |
| HOST-001 | Backend restart recovery | Yes |
| STAND-001 | Standings recompute after correction | Yes |
| FINAL-001 | Tied finalization blocked | Yes |

---

# 23. AI Agent Rules for Edge Cases

AI coding agents must:

- Add tests for every new edge case they claim to handle.
- Never "fix" edge cases by mutating old events.
- Never bypass rules engine to make UI work.
- Never implement special foul automation without verified rule source.
- Never implement tournament tiebreak logic without approved rule profile.
- Never rely on Socket.IO alone for recovery.
- Always support polling sync with `lastEventSeq`.
- Always include permission checks for correction and override flows.
- Always include audit metadata for correction events.
- Always document unresolved edge cases as `[NEEDS SOURCE]` or `[SYSTEM GAP]`.

---

# 24. Definition of Done

An edge case is considered handled only when:

- Expected behavior is documented.
- API/socket/command behavior is defined.
- Event handling is defined.
- Projection behavior is defined.
- UI feedback is defined.
- Permission requirement is defined.
- Audit requirement is defined.
- Unit test exists where applicable.
- Integration/API test exists where applicable.
- E2E/manual test exists for match-day critical flows.
- Rebuild from `match_events` produces correct state.
- Polling reconnect returns correct state.
- No historical event is updated or deleted.

---

# 25. Open Decisions for Product Owner

[ASSUMPTION] These decisions should be confirmed before full automation:

1. Should manual override be allowed for shot clock reset decisions?
2. Which users can perform post-final match corrections?
3. Should public scoreboard show correction notices or only final corrected state?
4. Should standings automatically republish after match correction?
5. Should local tournament rules allow tied games in group stage?
6. Should system support forfeits/walkovers in MVP?
7. Should player statistics be official in MVP or only team score/foul?
8. Should score attribution to players be required or optional?
9. Should shot clock be controlled on a separate dashboard/device?
10. Should Socket.IO be enabled only after Hostatom confirms stable support?

