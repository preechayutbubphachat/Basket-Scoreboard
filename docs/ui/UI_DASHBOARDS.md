# UI_DASHBOARDS.md

## 0. Purpose

[SYSTEM RECOMMENDATION] This document defines the UI dashboard architecture for the Basketball Scoreboard and Tournament Management web application.

The goal is to help AI coding agents design and implement operator screens, public scoreboard screens, tournament screens, summary screens, and replay screens without turning the system into a simple mutable scoreboard demo.

This UI must support real match-day operation where speed, clarity, correction safety, realtime state recovery, and role-based access control are more important than visual decoration.

---

## 1. Core UI Principle

[SYSTEM RECOMMENDATION] The UI is not the source of truth.

The UI must read from projections and submit commands to the backend. It must never directly calculate and persist official match state.

Official state flow:

```txt
User action
  -> Command payload
  -> API / optional Socket command
  -> Server-side auth + RBAC
  -> Server-side validation
  -> Rules Engine
  -> Append match_event
  -> Update projection
  -> UI sync by polling / optional socket patch
```

The UI must treat these backend objects as authoritative:

```txt
match_events           = historical source of truth
match_projections      = current UI read models
match_snapshots        = fast rehydration optimization
audit_logs             = correction and privileged action trail
```

---

## 2. Hosting and Realtime Compatibility

[SYSTEM RECOMMENDATION] This project targets Hostatom / Plesk Shared Hosting compatibility.

Because the hosting environment may not guarantee long-running backend processes, SSH access, Python runtime, process managers, port binding, or stable WebSocket reverse proxy configuration, the UI must be designed with **polling-first realtime**.

### 2.1 Realtime Priority

```txt
Primary realtime method:
  REST polling with lastEventSeq

Optional enhancement:
  Socket.IO state patches if hosting supports stable WebSocket

Fallback:
  Manual refresh + full-state sync
```

### 2.2 Required Sync Fields

Every live dashboard must display and internally track:

```ts
type LiveSyncMeta = {
  matchId: string;
  currentSeq: number;
  lastSyncedSeq: number;
  projectionVersion: string;
  serverTime: string;
  connectionStatus: 'ONLINE' | 'SYNCING' | 'STALE' | 'OFFLINE' | 'ERROR';
  lastSyncAt: string;
};
```

### 2.3 Polling Intervals

[ASSUMPTION] Default polling intervals may be adjusted after real-world testing.

```txt
Public scoreboard:
  500ms - 1000ms during live match

Operator dashboard:
  300ms - 700ms during live match

Admin / summary / standings:
  2000ms - 10000ms depending on page

Replay screen:
  no polling required unless watching live replay
```

### 2.4 UI Sync API

Live dashboards should call:

```http
GET /api/v1/matches/:matchId/sync?lastEventSeq=:seq&projection=live_scoreboard
GET /api/v1/matches/:matchId/state
GET /api/v1/matches/:matchId/events?afterSeq=:seq
```

The UI must handle:

```txt
- no new event
- missed events
- projection patch
- full state sync required
- expectedSeq conflict
- unauthorized command
- match locked / finished
- correction pending
```

---

## 3. Required Dashboards

The system must support these dashboards:

```txt
1. Main Live Scoreboard Dashboard
2. Match Pairing Dashboard
3. Score Control Dashboard
4. Foul Control Dashboard
5. Clock and Shot Clock Dashboard
6. Timeout Dashboard
7. Match Summary Dashboard
8. Replay Dashboard
9. Admin Tournament Dashboard
```

Optional later dashboards:

```txt
10. Roster / Lineup Dashboard
11. Public Schedule Dashboard
12. Public Standings Dashboard
13. Audit Log Dashboard
14. Rule Profile Dashboard
15. Venue / Court Dashboard
```

---

## 4. Global UI Design Principles

### 4.1 Operator UX Principles

All operator dashboards must prioritize:

```txt
- Large buttons
- High contrast
- Touchscreen friendly layout
- Keyboard shortcuts
- Clear undo / correction flow
- Confirmation for destructive or correction actions
- Current event sequence visibility
- Connection status visibility
- Minimal hidden actions
- Clear active team / possession / period / clock status
- Low cognitive load during live match
```

### 4.2 Public Display Principles

Public scoreboard screens must prioritize:

```txt
- Distant readability
- Full-screen 16:9 layout
- Very large team scores
- Team names clearly visible
- Period and game clock clearly visible
- Shot clock clearly visible
- Team fouls and timeout indicators
- Possession indicator
- Minimal clutter
- Dark / high contrast display mode
```

### 4.3 Admin UI Principles

Admin screens must prioritize:

```txt
- Data accuracy
- Safe editing
- Clear lifecycle states
- Audit visibility
- Search and filtering
- Import/export readiness
- Confirmation before publishing or correcting official results
```

---

## 5. Global Layout Standards

### 5.1 Recommended Frontend Stack

```txt
Frontend:
  Vite + React + TypeScript

UI:
  Tailwind CSS + shadcn/ui or equivalent component system

State:
  React Query / TanStack Query for server state
  Local UI state only for temporary interaction state

Validation:
  Zod schemas shared with API contracts when possible

Testing:
  Vitest
  Testing Library
  Playwright
```

### 5.2 Layout Shells

The application should have separate layout shells:

```txt
/public
  Public no-login screens

/operator
  Live match operation screens

/admin
  Tournament and system administration

/replay
  Historical replay and audit timeline

/auth
  Login / session screens
```

### 5.3 Screen Density Modes

Operator screens should support:

```txt
Comfortable mode:
  tablets, laptops, desktop

Compact mode:
  smaller laptops

Fullscreen mode:
  scoreboard display / TV output
```

### 5.4 Touch Target Size

[SYSTEM RECOMMENDATION] Operator buttons should be large enough for fast touch input.

Minimum practical target:

```txt
Primary live control button:
  at least 72px height

Secondary action button:
  at least 48px height

Dangerous / correction button:
  at least 48px height + confirmation
```

---

## 6. Global Navigation Model

### 6.1 Public Navigation

```txt
/public/scoreboard/:matchId
/public/schedule
/public/standings/:tournamentId
/public/match-summary/:matchId
```

### 6.2 Operator Navigation

```txt
/operator/matches
/operator/matches/:matchId/score
/operator/matches/:matchId/fouls
/operator/matches/:matchId/clock
/operator/matches/:matchId/timeouts
/operator/matches/:matchId/summary
/operator/matches/:matchId/corrections
```

### 6.3 Admin Navigation

```txt
/admin
/admin/tournaments
/admin/tournaments/:id
/admin/tournaments/:id/stages
/admin/tournaments/:id/teams
/admin/tournaments/:id/matches
/admin/teams
/admin/players
/admin/users
/admin/rule-profiles
/admin/audit-logs
```

### 6.4 Replay Navigation

```txt
/replay/matches/:matchId
/replay/matches/:matchId/events
/replay/matches/:matchId/snapshots
```

---

## 7. Role-Based UI Access

### 7.1 Role Visibility

```txt
Admin:
  Can access admin dashboards and assigned or all match operation screens depending on policy.

Referee / Scorer:
  Can access assigned match operator screens.

Viewer:
  Can access public read-only screens and authorized summaries.

Public:
  Can access public scoreboard, schedule, standings, and published summaries only.
```

### 7.2 UI Must Not Enforce Alone

[SYSTEM RECOMMENDATION] Hiding a button in UI is not authorization.

Every command must still be authorized server-side.

The UI may hide or disable unavailable controls for usability, but the backend must reject unauthorized commands.

### 7.3 Assigned Match Rule

Operator UI must show only matches assigned to the user unless the user has admin permission.

```txt
Allowed:
  scorer assigned to match A sees match A operation dashboard

Not allowed:
  scorer assigned to match A directly opens match B operation URL and can control it
```

---

## 8. Shared Live Dashboard Header

Every operator live screen must include a consistent header.

### 8.1 Required Header Elements

```txt
- Tournament name
- Match code / match number
- Home team
- Away team
- Current period
- Game clock
- Shot clock
- Current score
- Match status
- Current event sequence
- Connection status
- Logged-in user name and role
- Device label
```

### 8.2 Match Status Badges

```txt
SCHEDULED
WARMUP
READY
LIVE
PERIOD_BREAK
HALFTIME
TIMEOUT
OVERTIME
FINISHED
LOCKED
UNDER_REVIEW
CORRECTED
ABANDONED
```

### 8.3 Connection Status States

```txt
ONLINE:
  polling/socket sync is healthy

SYNCING:
  reconnecting or fetching missed events

STALE:
  latest sync older than allowed threshold

OFFLINE:
  network unavailable

ERROR:
  last sync failed repeatedly
```

### 8.4 Event Sequence Display

Every live operator screen must display:

```txt
Seq: 128
Last sync: 13:22:04
Expected seq for next command: 128
```

If the UI detects a mismatch, it must not submit command silently. It must sync first or show conflict warning.

---

## 9. Shared Command Button Rules

### 9.1 Command Envelope

Every live command from the UI must include:

```ts
type CommandEnvelope<TPayload> = {
  commandId: string;
  matchId: string;
  expectedSeq: number;
  correlationId: string;
  clientTimestamp: string;
  payload: TPayload;
};
```

### 9.2 Button States

Live command buttons must support:

```txt
READY
PENDING
ACCEPTED
REJECTED
DISABLED
SYNC_REQUIRED
CONFIRM_REQUIRED
```

### 9.3 Optimistic UI Policy

[SYSTEM RECOMMENDATION] For official score, foul, timeout, clock, and shot clock state, do not permanently apply optimistic UI as official state.

Allowed:

```txt
- show button pending state
- show temporary spinner
- show command accepted toast
```

Not allowed:

```txt
- change official score before backend accepts event
- change foul count as final before event is appended
- assume timeout was granted before rules engine validates
```

### 9.4 Duplicate Click Protection

Every command button must:

```txt
- generate commandId once per click
- disable while pending
- handle duplicate command response idempotently
- not generate multiple events from double tap
```

---

## 10. Main Live Scoreboard Dashboard

### 10.1 Purpose

Public-facing scoreboard for display on TV/projector/large screen.

### 10.2 Route

```txt
/public/scoreboard/:matchId
```

### 10.3 Access

```txt
Public read-only
No command submission
No admin controls
No hidden operator shortcuts
```

### 10.4 Data Source

```txt
Projection:
  live_scoreboard_projection

Sync:
  polling-first
  optional socket patch
```

### 10.5 Required Display Elements

```txt
- Home team name
- Away team name
- Home score
- Away score
- Period / quarter
- Game clock
- Shot clock
- Team fouls
- Timeout indicators
- Possession arrow / indicator
- Match status
- Optional venue / court
- Optional tournament name
```

### 10.6 Recommended 16:9 Layout

```txt
+--------------------------------------------------+
| Tournament / Match / Court                       |
+----------------------+---------------------------+
| HOME TEAM            | AWAY TEAM                 |
|       88             |        84                 |
+----------------------+---------------------------+
| Period Q4            | Game Clock 02:14          |
| Shot Clock 14        | Possession HOME           |
+----------------------+---------------------------+
| Fouls H: 4 A: 3      | Timeouts H: 1 A: 2        |
+--------------------------------------------------+
```

### 10.7 Clock Display Rule

Clock display must derive from backend projection:

```txt
if clock is stopped:
  display remainingMs

if clock is running:
  display remainingMs - (clientNow - serverStartedAtAdjusted)
```

The UI must resync with server time frequently to avoid drift.

### 10.8 Public Scoreboard Must Not

```txt
- show correction buttons
- show raw event debug data by default
- show admin-only audit log
- send score/foul/clock commands
- expose internal user identity data
```

---

## 11. Match Pairing Dashboard

### 11.1 Purpose

Show scheduled matches, current pairing, court assignment, match status, and upcoming games.

### 11.2 Routes

```txt
/public/schedule
/admin/tournaments/:id/matches
/operator/matches
```

### 11.3 Users

```txt
Public:
  read published schedule

Viewer:
  read schedule and standings

Referee / Scorer:
  read assigned matches

Admin:
  create, edit, publish, postpone, cancel, assign court
```

### 11.4 Required Fields

```txt
- Match number
- Tournament
- Stage / group / bracket round
- Home team
- Away team
- Venue / court
- Scheduled start
- Actual start
- Match status
- Assigned officials
- Score result if completed
```

### 11.5 Match Status Actions

Admin may:

```txt
- create match
- edit schedule
- assign teams
- assign court
- assign officials
- publish match
- postpone match
- cancel match
- lock final result
```

Referee / Scorer may:

```txt
- open assigned match
- mark ready if permission granted
- start match if permission granted
```

### 11.6 Safety Rules

```txt
- Cannot start match without teams
- Cannot start match without rule profile
- Cannot start match without match roster if roster is required
- Cannot change teams after match started without admin correction workflow
- Cannot delete completed match if it has events
```

---

## 12. Score Control Dashboard

### 12.1 Purpose

Fast and safe score operation for live match control.

### 12.2 Route

```txt
/operator/matches/:matchId/score
```

### 12.3 Users

```txt
Referee / Scorer assigned to match
Admin with match operation permission
```

### 12.4 Data Source

```txt
Projection:
  operator_score_projection

Commands:
  POST /api/v1/matches/:matchId/commands/score/add
  POST /api/v1/matches/:matchId/commands/score/correct
```

### 12.5 Required Display Elements

```txt
- Home team score
- Away team score
- Large +1 +2 +3 buttons for each team
- Optional player selector for points attribution
- Recent scoring events
- Current period and clock
- Current event sequence
- Undo/correction entry point
```

### 12.6 Recommended Layout

```txt
+------------------------------------------------+
| Header: Match / Clock / Seq / Connection       |
+----------------------+-------------------------+
| HOME  52             | AWAY  49                |
| [+1] [+2] [+3]       | [+1] [+2] [+3]           |
| Player select        | Player select           |
+----------------------+-------------------------+
| Recent scoring events                          |
| 128 HOME #7 +2  Q3 04:11                       |
| 127 AWAY #12 +3 Q3 04:35                       |
+------------------------------------------------+
| Correction / Review                            |
+------------------------------------------------+
```

### 12.7 Score Command Payload

```ts
type AddScorePayload = {
  teamId: string;
  playerId?: string;
  points: 1 | 2 | 3;
  periodNumber: number;
  gameClockRemainingMs: number;
  note?: string;
};
```

### 12.8 Score Button Rules

```txt
- +1, +2, +3 must be separate and large
- subtract score button must not be a normal live button
- wrong score must use correction flow
- player attribution can be optional for MVP but must be supported by event model
```

### 12.9 Correction Shortcut

Allowed correction entry:

```txt
Recent event row -> Correct
```

Not allowed:

```txt
Directly edit score number field and save
```

---

## 13. Foul Control Dashboard

### 13.1 Purpose

Manage player fouls, team fouls, foul-out status, and foul correction.

### 13.2 Route

```txt
/operator/matches/:matchId/fouls
```

### 13.3 Users

```txt
Referee / Scorer assigned to match
Admin with correction permission
```

### 13.4 Data Source

```txt
Projection:
  foul_projection

Commands:
  POST /api/v1/matches/:matchId/commands/fouls/player/add
  POST /api/v1/matches/:matchId/commands/fouls/correct
```

### 13.5 Required Display Elements

```txt
- Team foul count per current period
- Player foul count
- Player status: ACTIVE, BENCH, FOULED_OUT, DISQUALIFIED
- Team penalty warning
- Foul type selector
- Recent foul events
- Correction entry point
```

### 13.6 Player Foul List

Each player row should show:

```txt
- Jersey number
- Player name
- Current foul count
- Status
- Quick add foul button
- Correct recent foul button
```

### 13.7 Foul Types

[NEEDS SOURCE] Full automation for technical, unsportsmanlike, disqualifying, fighting, and special situations requires `FOUL_PENALTY_MATRIX.md`.

Until that file exists, UI may allow manual event recording but must avoid automatically assigning complex penalties unless the rule is documented.

Recommended foul type options:

```txt
PERSONAL
TECHNICAL
UNSPORTSMANLIKE
DISQUALIFYING
OFFENSIVE
BENCH_TECHNICAL
COACH_TECHNICAL
OTHER_NEEDS_REVIEW
```

### 13.8 Warnings

UI must clearly warn when:

```txt
- player reaches foul limit
- team reaches penalty threshold
- foul type needs manual review
- correction reason is required
```

### 13.9 Foul Command Payload

```ts
type AddPlayerFoulPayload = {
  teamId: string;
  playerId: string;
  foulType: string;
  periodNumber: number;
  gameClockRemainingMs: number;
  countsAsTeamFoul: boolean;
  note?: string;
};
```

---

## 14. Clock and Shot Clock Dashboard

### 14.1 Purpose

Operate game clock, shot clock, period transitions, and clock corrections.

### 14.2 Route

```txt
/operator/matches/:matchId/clock
```

### 14.3 Users

```txt
Referee / Scorer assigned to match
Timer role if separated
Shot Clock Operator role if separated
Admin with match operation permission
```

### 14.4 Data Source

```txt
Projection:
  clock_projection
  shot_clock_projection

Commands:
  POST /api/v1/matches/:matchId/commands/clock/start
  POST /api/v1/matches/:matchId/commands/clock/stop
  POST /api/v1/matches/:matchId/commands/clock/set
  POST /api/v1/matches/:matchId/commands/shot-clock/start
  POST /api/v1/matches/:matchId/commands/shot-clock/stop
  POST /api/v1/matches/:matchId/commands/shot-clock/reset
  POST /api/v1/matches/:matchId/commands/period/start
  POST /api/v1/matches/:matchId/commands/period/end
```

### 14.5 Required Display Elements

```txt
- Game clock large display
- Shot clock large display
- Period / quarter
- Clock running/stopped state
- Shot clock running/stopped state
- Start/stop game clock button
- Start/stop shot clock button
- Reset shot clock 24
- Reset shot clock 14
- Manual set game clock
- Manual set shot clock
- End period button
- Start next period / overtime button
```

### 14.6 Deadline-Based Clock Model

[SYSTEM RECOMMENDATION] UI must support deadline-based clock calculation.

When clock is running, projection should include:

```ts
type RunningClockProjection = {
  status: 'RUNNING';
  remainingMsAtStart: number;
  startedAtServerTime: string;
  serverTimeAtResponse: string;
};
```

UI display formula:

```txt
displayRemainingMs =
  remainingMsAtStart - (clientNowAdjustedToServer - startedAtServerTime)
```

When clock is stopped:

```ts
type StoppedClockProjection = {
  status: 'STOPPED';
  remainingMs: number;
};
```

### 14.7 Clock Safety Rules

```txt
- Manual set clock requires confirmation and reason
- End period requires confirmation
- Start overtime requires score tied or admin override
- Clock commands must include expectedSeq
- UI must prevent command if state is stale
```

### 14.8 Shot Clock Reset Options

UI must expose:

```txt
- Reset 24
- Reset 14
- Stop
- Start
- Set manually
```

[OFFICIAL RULE] The rules engine must decide when 24, 14, or no reset is correct according to the loaded FIBA profile. UI must not hard-code all shot clock decisions without rules engine validation.

---

## 15. Timeout Dashboard

### 15.1 Purpose

Track and grant team timeouts according to rule profile.

### 15.2 Route

```txt
/operator/matches/:matchId/timeouts
```

### 15.3 Users

```txt
Referee / Scorer assigned to match
Admin with match operation permission
```

### 15.4 Data Source

```txt
Projection:
  timeout_projection

Commands:
  POST /api/v1/matches/:matchId/commands/timeouts/grant
  POST /api/v1/matches/:matchId/commands/timeouts/correct
```

### 15.5 Required Display Elements

```txt
- Timeout remaining for each team
- Timeout used in first half
- Timeout used in second half
- Timeout used in overtime
- Late Q4 timeout limit warning
- Grant timeout button per team
- Active timeout countdown if implemented
- Recent timeout events
- Correction entry point
```

### 15.6 Timeout Command Payload

```ts
type GrantTimeoutPayload = {
  teamId: string;
  periodNumber: number;
  gameClockRemainingMs: number;
  requestedBy?: 'HEAD_COACH' | 'ASSISTANT_COACH' | 'BENCH' | 'OFFICIAL';
  note?: string;
};
```

### 15.7 Timeout Safety Rules

```txt
- UI must show if timeout is unavailable
- Backend rules engine must make final decision
- Correction requires reason
- Timeout cancellation must use correction event
```

---

## 16. Match Summary Dashboard

### 16.1 Purpose

Show match result, scoring by period, fouls, timeouts, key events, and final official state.

### 16.2 Routes

```txt
/operator/matches/:matchId/summary
/public/match-summary/:matchId
/admin/matches/:matchId/summary
```

### 16.3 Users

```txt
Public:
  published summary only

Viewer:
  read-only authorized summary

Referee / Scorer:
  assigned match summary

Admin:
  full summary and correction/audit access
```

### 16.4 Data Source

```txt
Projection:
  match_summary_projection
```

### 16.5 Required Display Elements

```txt
- Final score
- Score by period
- Overtime score if any
- Team fouls by period
- Player fouls
- Timeouts used
- Match status
- Officials
- Venue / court
- Event sequence range
- Correction status
- Published / official status
```

### 16.6 Admin Actions

Admin may:

```txt
- publish result
- lock result
- reopen for correction
- export summary
- view audit trail
```

### 16.7 Public Summary Must Not Show

```txt
- internal correction reasons unless approved
- private user/device audit metadata
- unpublished event notes
```

---

## 17. Replay Dashboard

### 17.1 Purpose

Reconstruct match timeline from `match_events`, inspect corrections, and replay historical state.

### 17.2 Route

```txt
/replay/matches/:matchId
```

### 17.3 Users

```txt
Admin
Referee / Scorer for assigned match if permitted
Viewer only if replay is public/published
```

### 17.4 Data Source

```txt
Projection:
  replay_timeline_projection

Fallback:
  match_events
```

### 17.5 Required Display Elements

```txt
- Event timeline
- Event sequence number
- Event type
- Actor role
- Occurred time
- Game clock at event
- Period
- Payload summary
- Correction links
- State at selected event
- Play / pause replay controls
- Step forward / step back
- Jump to sequence
```

### 17.6 Replay Controls

```txt
- Play
- Pause
- Step next event
- Step previous event
- Jump to period
- Jump to correction
- Jump to scoring event
- Jump to foul event
```

### 17.7 Correction Visualization

Corrections must show:

```txt
Original event
  -> Correction requested
  -> Compensating event(s)
  -> Correction applied/rejected
```

The original event must remain visible.

### 17.8 Replay Safety Rules

```txt
- Replay must not modify official state
- Replay state must be derived from event stream
- Replay bug must not write to match_events
```

---

## 18. Admin Tournament Dashboard

### 18.1 Purpose

Manage tournaments, teams, players, rosters, stages, matches, rule profiles, users, and audit logs.

### 18.2 Route

```txt
/admin
/admin/tournaments
/admin/tournaments/:id
```

### 18.3 Users

```txt
Admin only
```

### 18.4 Required Modules

```txt
- Tournament setup
- Stage setup
- Group setup
- Match scheduling
- Team registration
- Player registration
- Roster assignment
- Venue / court management
- Officials assignment
- Rule profile selection
- User and role management
- Result publishing
- Audit log review
```

### 18.5 Tournament Setup Fields

```txt
- Tournament name
- Season
- Division
- Format
- Rule profile
- Start date
- End date
- Venues
- Courts
- Publication status
```

### 18.6 Stage Setup Fields

```txt
- Stage name
- Stage type
- Order
- Group count
- Match format
- Advancement rule
- Tiebreak rule reference
```

[NEEDS SOURCE] Official tiebreak automation must be documented in tournament rule files before full automation.

### 18.7 Admin Safety Rules

```txt
- Cannot delete tournament with official matches unless archived policy exists
- Cannot change rule profile after match started without admin override and audit log
- Cannot edit official result without correction workflow
- Cannot publish standings if required matches are not official unless draft mode
```

---

## 19. Correction Flow UI

### 19.1 Purpose

Prevent silent destructive edits and preserve audit trail.

### 19.2 Entry Points

Correction can start from:

```txt
- Recent event list
- Match summary
- Replay timeline
- Admin audit review
```

### 19.3 Required Correction Form Fields

```txt
- Target event sequence
- Correction type
- Reason
- Proposed replacement payload
- Optional note
- Confirm checkbox
```

### 19.4 Required UI Warnings

```txt
This will not delete the original event.
The system will append correction event(s).
The replay and audit log will show this correction.
```

### 19.5 Correction Actions

```txt
CORRECTION_REQUESTED
CORRECTION_APPLIED
CORRECTION_REJECTED
```

### 19.6 Correction Must Never

```txt
- directly edit old match_events row
- hide original event from replay
- change final score without audit log
- allow empty reason
```

---

## 20. Keyboard Shortcuts

Keyboard shortcuts must be configurable and must not bypass confirmation rules.

### 20.1 Global Shortcut Rules

```txt
- Show visible shortcut hints
- Allow disable shortcuts
- Ignore shortcuts while typing in input fields
- Require confirmation for correction/destructive actions
- Debounce repeated keydown events
- Log command normally through backend
```

### 20.2 Suggested Shortcuts

[ASSUMPTION] Actual keys should be confirmed with Product Owner after operator testing.

```txt
Space:
  Start / stop game clock

Home team:
  A = +1
  S = +2
  D = +3

Away team:
  J = +1
  K = +2
  L = +3

Shot clock:
  R = reset 24
  T = reset 14

Possession:
  P = change possession

Sync:
  Ctrl + R = force full sync
```

### 20.3 Forbidden Shortcut Behavior

```txt
- No shortcut may delete event
- No shortcut may apply correction without reason
- No shortcut may override RBAC
- No shortcut may directly mutate local official score
```

---

## 21. Design System Requirements

### 21.1 Color and Contrast

UI must provide:

```txt
- High contrast mode
- Dark display mode for scoreboard
- Clear active/inactive button states
- Warning colors for dangerous actions
- Connection status colors
```

### 21.2 Typography

```txt
Public scoreboard:
  Very large numeric font

Operator:
  Large readable labels
  Compact but clear event list

Admin:
  Standard data table typography
```

### 21.3 Components

Recommended shared components:

```txt
LiveMatchHeader
ConnectionStatusBadge
EventSeqBadge
TeamScorePanel
ClockDisplay
ShotClockDisplay
CommandButton
ConfirmActionDialog
CorrectionDialog
RecentEventsPanel
PlayerFoulTable
TimeoutIndicator
PossessionIndicator
SyncWarningBanner
AuditTrailDrawer
```

---

## 22. UI State Management

### 22.1 Server State

Use server-state tooling for:

```txt
- match projections
- tournament lists
- teams
- players
- rosters
- audit logs
```

Recommended:

```txt
TanStack Query
```

### 22.2 Local State

Local state may be used only for:

```txt
- open/close modal
- selected player
- pending form input
- temporary command pending state
- replay playback position
```

### 22.3 Forbidden Local State

Local state must not be the official source for:

```txt
- score
- fouls
- timeout count
- clock state
- shot clock state
- match status
- possession
- event sequence
```

---

## 23. Error Handling UI

### 23.1 Command Rejection Display

When backend rejects command, UI must show:

```txt
- reasonCode
- human-readable message
- whether full sync is required
- recommended action
```

Example:

```txt
Command rejected: INVALID_EXPECTED_SEQ
This dashboard is behind the official match state.
Sync latest state before submitting another command.
```

### 23.2 Common Error Codes

```txt
UNAUTHORIZED
FORBIDDEN
MATCH_NOT_FOUND
MATCH_NOT_ASSIGNED
INVALID_EXPECTED_SEQ
DUPLICATE_COMMAND
RULE_VIOLATION
MATCH_LOCKED
CORRECTION_REASON_REQUIRED
FULL_STATE_SYNC_REQUIRED
VALIDATION_ERROR
```

### 23.3 Error Recovery

UI must provide:

```txt
- Retry command if safe
- Force sync
- Return to match list
- Contact admin message
```

---

## 24. Offline and Stale State Handling

### 24.1 Stale State Threshold

[ASSUMPTION] Initial thresholds:

```txt
Operator screen stale:
  no successful sync for > 2 seconds during live match

Public scoreboard stale:
  no successful sync for > 5 seconds during live match

Admin screen stale:
  no successful sync for > 30 seconds
```

### 24.2 Stale Operator UI

When stale:

```txt
- show large warning banner
- disable high-risk commands
- allow force sync
- do not silently continue submitting commands with old expectedSeq
```

### 24.3 Offline Public Scoreboard

When offline:

```txt
- keep last known state visible
- show subtle OFFLINE / LAST UPDATED indicator
- auto recover when sync returns
```

---

## 25. Security and Privacy UI Rules

### 25.1 Session Handling

```txt
- show current user and role on operator/admin screens
- auto logout or lock screen if session expires
- do not expose admin controls to public
```

### 25.2 Sensitive Data

Public screens must not expose:

```txt
- user IDs
- device IDs
- internal audit reasons
- private notes
- unpublished correction details
```

### 25.3 CSRF / Auth

UI must follow API auth policy:

```txt
- include auth token/session cookies according to backend design
- include CSRF token if cookie-based auth is used
- never store privileged secrets in public pages
```

---

## 26. Accessibility Requirements

### 26.1 Operator Accessibility

```txt
- large readable controls
- clear labels
- keyboard operation
- focus visible
- no color-only critical state
- prevent accidental double activation
```

### 26.2 Public Display Accessibility

```txt
- high contrast
- large numbers
- readable team names
- minimal animation
- avoid flashing effects
```

---

## 27. Mobile and Tablet Behavior

### 27.1 Operator Tablet Mode

```txt
- two-column team controls
- sticky clock header
- bottom correction drawer
- large buttons
```

### 27.2 Mobile Admin Mode

Admin pages may support mobile for schedule review, but live operation should be optimized first for tablet/laptop.

### 27.3 Public Scoreboard Mobile Mode

Mobile public scoreboard should show:

```txt
- score
- clock
- period
- fouls
- basic status
```

---

## 28. Page-Level Specs

### 28.1 `/operator/matches`

Purpose:

```txt
Show assigned matches and allow operator to enter live dashboards.
```

Required:

```txt
- assigned match list
- status
- start time
- teams
- court
- open score
- open fouls
- open clock
```

### 28.2 `/operator/matches/:matchId/score`

Purpose:

```txt
Score control.
```

Must include:

```txt
- score buttons
- recent scoring events
- correction entry
- sync status
```

### 28.3 `/operator/matches/:matchId/fouls`

Purpose:

```txt
Foul control.
```

Must include:

```txt
- player list
- team foul count
- foul add button
- penalty warning
```

### 28.4 `/operator/matches/:matchId/clock`

Purpose:

```txt
Clock and shot clock control.
```

Must include:

```txt
- game clock
- shot clock
- period controls
- reset 24 / reset 14
```

### 28.5 `/public/scoreboard/:matchId`

Purpose:

```txt
Main public scoreboard.
```

Must include:

```txt
- large scores
- game clock
- shot clock
- period
- fouls
- possession
```

### 28.6 `/replay/matches/:matchId`

Purpose:

```txt
Historical replay and audit-friendly event timeline.
```

Must include:

```txt
- timeline
- event details
- state at sequence
- correction links
```

---

## 29. API Integration Requirements

### 29.1 Query Keys

Recommended query key pattern:

```ts
['match-sync', matchId, projectionName]
['match-state', matchId]
['match-events', matchId, afterSeq]
['tournament', tournamentId]
['standings', tournamentId]
```

### 29.2 Command Mutation Pattern

Every command mutation should:

```txt
1. Read latest projection currentSeq
2. Build command envelope
3. Submit command
4. Wait for accepted/rejected
5. Trigger sync
6. Update UI from server response/projection
```

### 29.3 Command Response Contract

```ts
type CommandResult = {
  status: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE_ACCEPTED' | 'SYNC_REQUIRED';
  commandId: string;
  matchId: string;
  currentSeq: number;
  appendedEvents?: Array<{
    eventId: string;
    seqNo: number;
    eventType: string;
  }>;
  reasonCode?: string;
  message?: string;
};
```

---

## 30. Testing Requirements

### 30.1 Unit Tests

Required:

```txt
- clock display calculation
- shot clock display calculation
- stale state detection
- command envelope creation
- duplicate click prevention
- role-based button visibility
- correction form validation
```

### 30.2 Component Tests

Required:

```txt
- ScoreControlDashboard
- FoulControlDashboard
- ClockDashboard
- PublicScoreboard
- TimeoutDashboard
- CorrectionDialog
- ConnectionStatusBadge
```

### 30.3 E2E Tests

Required:

```txt
- public scoreboard reads live projection
- scorer adds +2 score
- scorer double clicks +2 but only one event is accepted
- stale operator cannot submit command without sync
- unauthorized viewer cannot submit command
- correction requires reason
- clock start/stop updates display
- shot clock reset 24 / 14 updates display
- foul-out warning appears at player foul limit
- reconnect/polling catches missed events
```

### 30.4 Visual Tests

Recommended:

```txt
- public scoreboard 16:9 display
- high contrast mode
- tablet operator layout
- button disabled/pending/rejected states
```

---

## 31. Edge Cases

UI must handle:

```txt
- event seq changes between click and submit
- operator double taps score button
- two operators submit at same expectedSeq
- backend accepts event but response is delayed
- backend rejects command due to stale seq
- public scoreboard misses polling cycle
- browser clock differs from server clock
- match is locked while operator page is open
- correction changes score after period ends
- match enters overtime after tied score
- player fouls out
- team reaches foul penalty
- internet drops during timeout
- socket connected but polling detects newer seq
```

---

## 32. AI Agent Implementation Rules

AI coding agents must:

```txt
- implement UI against API_CONTRACTS.md
- read projections instead of raw event stream for live dashboards
- include currentSeq in command envelope
- display connection status on live dashboards
- display current event sequence on operator screens
- use correction flow instead of direct destructive edit
- add tests for every dashboard behavior
```

AI coding agents must not:

```txt
- mutate official score in local state as source of truth
- hide backend rejection
- bypass RBAC because button is hidden
- directly update database from frontend
- implement scoreboard by editing one mutable scoreboard_state row
- create delete-event or update-event UI
- assume Socket.IO is always available on Hostatom
```

---

## 33. Suggested Frontend File Structure

```txt
src/
  app/
    public/
      scoreboard/
      schedule/
      standings/
    operator/
      matches/
      score/
      fouls/
      clock/
      timeouts/
      summary/
    admin/
      tournaments/
      teams/
      players/
      users/
      audit/
    replay/
      matches/

  components/
    live/
      LiveMatchHeader.tsx
      ConnectionStatusBadge.tsx
      EventSeqBadge.tsx
      ClockDisplay.tsx
      ShotClockDisplay.tsx
      TeamScorePanel.tsx
      CommandButton.tsx
      RecentEventsPanel.tsx
    score/
      ScoreControlDashboard.tsx
      ScoreButtons.tsx
    fouls/
      FoulControlDashboard.tsx
      PlayerFoulTable.tsx
    corrections/
      CorrectionDialog.tsx
      CorrectionReasonField.tsx
    scoreboard/
      PublicScoreboard.tsx
    replay/
      ReplayTimeline.tsx

  hooks/
    useMatchSync.ts
    useCommandMutation.ts
    useClockDisplay.ts
    useShotClockDisplay.ts
    useConnectionStatus.ts
    useKeyboardShortcuts.ts

  api/
    matchApi.ts
    commandApi.ts
    tournamentApi.ts
    publicApi.ts

  types/
    projections.ts
    commands.ts
    dashboard.ts
```

---

## 34. Definition of Done

A dashboard is done only when:

```txt
- It reads from the correct projection
- It never treats local state as official state
- It displays current event sequence
- It displays connection status
- It handles stale state
- It sends command envelope with commandId and expectedSeq
- It handles accepted/rejected/duplicate/sync-required responses
- It respects role-based visibility
- Backend still enforces authorization
- Correction actions require reason
- Relevant tests are added
- Public screens are read-only
- UI works with polling-first sync
```

---

## 35. Open Product Decisions

[ASSUMPTION] Product Owner should confirm later:

```txt
1. Should score control and foul control be separate screens by default?
2. Should operator tablets use landscape-only mode?
3. Should player attribution be required for every score in MVP?
4. Should scorer and timer be separate roles in MVP?
5. What keyboard shortcuts are preferred by actual operators?
6. Should public scoreboard show player stats or only team score?
7. Should local event cache be enabled in browser during live match?
8. How visible should correction history be to public viewers?
9. Should admin be allowed to operate live match by default?
10. Should match-day mode hide all non-essential admin navigation?
```
