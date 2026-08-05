# KEYBOARD_SHORTCUTS.md

## 0. Document Purpose

[SYSTEM RECOMMENDATION] This file defines the keyboard shortcut policy for the Basketball Scoreboard and Tournament Management web application.

The purpose of keyboard shortcuts is to make live match operation faster, safer, and more consistent during real basketball games.

This file is not a basketball rule document. It is a system UX and command-input specification.

Keyboard shortcuts must never bypass:

- backend validation
- RBAC
- rule validation
- optimistic concurrency
- event sourcing
- audit logging
- correction reason requirements

---

## 1. Scope

This document covers keyboard shortcuts for:

- score control
- game clock control
- shot clock control
- team foul control
- player foul control
- timeout control
- possession control
- offensive direction switching
- correction workflow
- replay/navigation tools
- emergency sync and safety actions

This document applies to:

- operator score dashboard
- foul control dashboard
- clock and shot clock dashboard
- timeout dashboard
- main live control dashboard
- public scoreboard pairing mode only where explicitly allowed

This document does not define official basketball rules.

[OFFICIAL RULE] Basketball rule decisions must be validated by `RULES_PROFILE_FIBA.md` and `RULES_ENGINE_SPEC.md`.

---

## 2. Design Principles

[SYSTEM RECOMMENDATION] Keyboard shortcuts are allowed only as a fast input method. They must not modify local UI state as truth.

Every shortcut must produce a backend command or open a confirmation flow.

### 2.1 Core Principles

- Shortcuts must be fast.
- Shortcuts must be predictable.
- Shortcuts must be visible in the UI.
- Shortcuts must be disabled when the user is typing in text fields.
- Shortcuts must be role-aware.
- Shortcuts must be match-aware.
- Shortcuts must use the current `expectedSeq`.
- Shortcuts must show immediate feedback.
- Shortcuts must never silently fail.
- Shortcuts must never directly mutate projections.
- Shortcuts must never bypass correction flow.

### 2.2 Safety Principles

[SYSTEM RECOMMENDATION] Shortcuts are divided into three safety levels.

| Safety Level | Meaning | Examples | Required UX |
|---|---|---|---|
| `SAFE` | Common reversible live actions | Add score, start/stop clock | Immediate command with toast/status |
| `GUARDED` | Actions that can affect game flow significantly | Reset shot clock, timeout, end period | Long press or confirm depending context |
| `DANGEROUS` | Corrections, manual clock set, delete-like behavior | Score correction, clock set, event correction | Confirmation + reason + permission |

---

## 3. Global Shortcut Rules

### 3.1 Focus Rules

Keyboard shortcuts must be ignored when focus is inside:

- text input
- textarea
- select dropdown
- contenteditable area
- modal text field
- search box
- reason field

Exception: `Escape` may close an active modal if safe.

### 3.2 Modifier Rules

Use simple physical keys for live operation where possible.

Avoid browser-reserved shortcuts such as:

- `Ctrl+R`
- `Cmd+R`
- `Ctrl+W`
- `Cmd+W`
- `Ctrl+L`
- `Cmd+L`
- `Alt+Left`
- `Alt+Right`
- `F5`
- `F11`
- `Ctrl+Shift+I`

### 3.3 Keyboard Layout Rule

[SYSTEM RECOMMENDATION] Use `KeyboardEvent.code` rather than `KeyboardEvent.key` for operator shortcuts when possible.

Reason:

- `code` represents physical key position.
- `key` changes with language layout.
- Score table operators may use Thai/English keyboard layouts.

Example:

```ts
event.code === "KeyQ"
```

is preferred over:

```ts
event.key === "q"
```

for live operator commands.

### 3.4 Role Rule

Shortcuts must be enabled only if the authenticated user has permission for the command.

Examples:

- Viewer: no live command shortcuts.
- Public scoreboard screen: no command shortcuts except display-only fullscreen controls.
- Referee / Scorer: assigned match only.
- Admin: may access correction/admin shortcuts, but still must provide reason for corrections.

### 3.5 State Rule

Shortcut availability must depend on match state.

Examples:

- Cannot add score before match starts unless pre-game manual correction is allowed.
- Cannot start clock after match is final.
- Cannot grant timeout if quota is exceeded.
- Cannot reset shot clock if shot clock is disabled for rule/context.
- Cannot end period twice.

---

## 4. Command Envelope

Every shortcut-generated command must use the standard command envelope.

```ts
type ShortcutCommandEnvelope<TPayload> = {
  commandId: string;
  matchId: string;
  expectedSeq: number;
  correlationId: string;
  clientTimestamp: string;
  inputSource: "KEYBOARD_SHORTCUT";
  shortcutCode: string;
  payload: TPayload;
};
```

### 4.1 Required Metadata

Every shortcut command must include:

- `commandId`
- `matchId`
- `expectedSeq`
- `correlationId`
- `clientTimestamp`
- `inputSource`
- `shortcutCode`
- `payload`

### 4.2 Server-Side Validation

The server must validate:

- authentication
- authorization
- match assignment
- command idempotency
- `expectedSeq`
- payload schema
- rule engine decision
- match state
- correction reason when required

---

## 5. Recommended Default Keyboard Layout

[SYSTEM RECOMMENDATION] The default layout is optimized for a laptop keyboard used by one live operator.

The left side controls Home team.
The right side controls Away team.
The center controls game/shot clock.

```txt
┌──────────────────────────────────────────────────────────┐
│ Home Score/Foul        Clock / Shot Clock     Away Score │
│ Q W E                  Space / R / T          I O P      │
│ A S D                  C / V / B              J K L      │
│ Z X C                  Possession             N M ,      │
└──────────────────────────────────────────────────────────┘
```

This is a recommendation. Tournament organizers may define a local shortcut profile, but the app must show the active profile clearly.

---

## 6. Score Shortcuts

### 6.1 Default Score Shortcuts

| Command | Shortcut | Safety | Permission |
|---|---:|---|---|
| Home +1 | `Q` | SAFE | `match.score.update` |
| Home +2 | `W` | SAFE | `match.score.update` |
| Home +3 | `E` | SAFE | `match.score.update` |
| Away +1 | `I` | SAFE | `match.score.update` |
| Away +2 | `O` | SAFE | `match.score.update` |
| Away +3 | `P` | SAFE | `match.score.update` |

### 6.2 Score Command Payload

```ts
type AddScorePayload = {
  teamSide: "HOME" | "AWAY";
  points: 1 | 2 | 3;
  playerId?: string;
  periodId: string;
};
```

### 6.3 Score Validation

Server must validate:

- match exists
- user can operate assigned match
- match is not final
- points are `1`, `2`, or `3`
- team belongs to match
- player belongs to active match roster when `playerId` is provided
- `expectedSeq` equals current stream sequence

### 6.4 Score UI Feedback

After shortcut press, UI must show:

- pending command indicator
- team affected
- points added
- current `expectedSeq`
- success or rejection message

Example:

```txt
Home +2 submitted
Waiting for event seq 145...
```

### 6.5 Score Correction

Direct subtract shortcuts are disabled by default.

[SYSTEM RECOMMENDATION] Score subtraction should go through correction flow because it is usually an official correction, not a normal live scoring action.

Optional guarded shortcuts:

| Command | Shortcut | Safety | Required Flow |
|---|---:|---|---|
| Correct last Home score | `Shift+Q` | DANGEROUS | confirmation + reason |
| Correct last Away score | `Shift+P` | DANGEROUS | confirmation + reason |

---

## 7. Game Clock Shortcuts

### 7.1 Default Game Clock Shortcuts

| Command | Shortcut | Safety | Permission |
|---|---:|---|---|
| Start / Stop game clock | `Space` | SAFE | `match.clock.operate` |
| Stop game clock only | `S` when clock running | SAFE | `match.clock.operate` |
| Start game clock only | `S` when clock stopped | SAFE | `match.clock.operate` |
| Manual set game clock | `Shift+G` | DANGEROUS | `match.clock.correct` |

### 7.2 Clock Model

[SYSTEM RECOMMENDATION] Clock shortcut actions must use deadline-based clock model.

Do not use backend `setInterval()` to store time every second.

When starting clock:

```txt
GAME_CLOCK_STARTED
- remainingMs
- startedAtServerTime
```

When stopping clock:

```txt
GAME_CLOCK_STOPPED
- remainingMs calculated by server
- stoppedAtServerTime
```

### 7.3 Game Clock Command Payload

```ts
type ToggleGameClockPayload = {
  action: "START" | "STOP" | "TOGGLE";
  periodId: string;
  displayedRemainingMs: number;
};
```

### 7.4 Manual Clock Set Payload

```ts
type SetGameClockPayload = {
  periodId: string;
  remainingMs: number;
  reason: string;
};
```

Manual clock set requires:

- permission
- confirmation
- reason
- audit log
- compensating/correction event when applicable

---

## 8. Shot Clock Shortcuts

### 8.1 Default Shot Clock Shortcuts

| Command | Shortcut | Safety | Permission |
|---|---:|---|---|
| Start / Stop shot clock | `X` | SAFE | `match.shot_clock.operate` |
| Reset shot clock to 24 | `R` | GUARDED | `match.shot_clock.operate` |
| Reset shot clock to 14 | `T` | GUARDED | `match.shot_clock.operate` |
| Stop shot clock | `V` | SAFE | `match.shot_clock.operate` |
| Manual set shot clock | `Shift+S` | DANGEROUS | `match.shot_clock.correct` |

### 8.2 Shot Clock Safety

[SYSTEM RECOMMENDATION] Shot clock reset shortcuts should use either:

- long press for 300 ms, or
- immediate command with large undo/correction affordance, depending tournament preference

Default: long press for shot clock reset.

Reason: accidental shot clock reset can heavily affect a live game.

### 8.3 Shot Clock Payloads

```ts
type ResetShotClockPayload = {
  resetTo: 24 | 14;
  reasonCode:
    | "NEW_TEAM_CONTROL"
    | "FRONTCOURT_THROW_IN"
    | "BALL_HIT_RING_OFFENSIVE_REBOUND"
    | "MANUAL_OPERATOR_DECISION"
    | "NEEDS_SOURCE";
  periodId: string;
};
```

```ts
type SetShotClockPayload = {
  remainingMs: number;
  reason: string;
};
```

### 8.4 Rule Engine Integration

Shot clock reset shortcuts must call:

```ts
decideShotClockReset(context, matchState, ruleProfile)
```

If the rules engine returns `NEEDS_SOURCE`, the UI must require manual confirmation and reason.

---

## 9. Team Foul Shortcuts

### 9.1 Default Team Foul Shortcuts

| Command | Shortcut | Safety | Permission |
|---|---:|---|---|
| Home team foul +1 | `A` | SAFE | `match.foul.update` |
| Away team foul +1 | `L` | SAFE | `match.foul.update` |
| Correct Home team foul | `Shift+A` | DANGEROUS | `match.foul.correct` |
| Correct Away team foul | `Shift+L` | DANGEROUS | `match.foul.correct` |

### 9.2 Team Foul Payload

```ts
type AddTeamFoulPayload = {
  teamSide: "HOME" | "AWAY";
  periodId: string;
  foulType?: "PERSONAL" | "TECHNICAL" | "UNSPORTSMANLIKE" | "DISQUALIFYING" | "OTHER";
  playerId?: string;
};
```

### 9.3 Team Foul Projection Effect

Adding a team foul may affect:

- team foul count by period
- penalty indicator
- public scoreboard team foul display
- match summary
- audit timeline

---

## 10. Player Foul Shortcuts

### 10.1 Player Foul Input Policy

[SYSTEM RECOMMENDATION] Player fouls should not rely on one-key shortcuts only because the operator must identify the player.

Preferred flow:

1. Press team foul shortcut.
2. Select player quickly from large roster grid.
3. Confirm foul type if needed.
4. Submit command.

### 10.2 Optional Roster Grid Shortcut

| Command | Shortcut | Safety | Permission |
|---|---:|---|---|
| Open Home roster foul picker | `D` | SAFE | `match.foul.update` |
| Open Away roster foul picker | `J` | SAFE | `match.foul.update` |
| Confirm selected player foul | `Enter` | SAFE | `match.foul.update` |
| Cancel picker | `Escape` | SAFE | none |

### 10.3 Player Foul Payload

```ts
type AddPlayerFoulPayload = {
  teamSide: "HOME" | "AWAY";
  playerId: string;
  periodId: string;
  foulType:
    | "PERSONAL"
    | "TECHNICAL"
    | "UNSPORTSMANLIKE"
    | "DISQUALIFYING"
    | "OTHER";
  countsAsTeamFoul: boolean;
};
```

### 10.4 Player Foul Rule Checks

Server must validate:

- player is in match roster
- player is eligible or active depending match rules
- player has not already fouled out
- foul type is supported by loaded rule profile
- team foul effect is defined or marked `[NEEDS SOURCE]`

[NEEDS SOURCE] Full foul penalty automation requires `FOUL_PENALTY_MATRIX.md`.

---

## 11. Timeout Shortcuts

### 11.1 Default Timeout Shortcuts

| Command | Shortcut | Safety | Permission |
|---|---:|---|---|
| Grant Home timeout | `Z` | GUARDED | `match.timeout.grant` |
| Grant Away timeout | `/` | GUARDED | `match.timeout.grant` |
| Open timeout dashboard | `Y` | SAFE | `match.timeout.view` |
| Correct timeout | `Shift+Y` | DANGEROUS | `match.timeout.correct` |

### 11.2 Timeout Safety

Timeout grant must require one of:

- long press for 500 ms, or
- confirmation modal

Default: confirmation modal.

Reason: timeout quota and late-game timeout constraints can affect official match administration.

### 11.3 Timeout Payload

```ts
type GrantTimeoutPayload = {
  teamSide: "HOME" | "AWAY";
  periodId: string;
  requestedBy?: "HEAD_COACH" | "FIRST_ASSISTANT_COACH" | "OFFICIAL";
};
```

### 11.4 Timeout Rule Check

Server must call:

```ts
canGrantTimeout(matchState, ruleProfile, teamId, context)
```

Rejected timeout command must not append a match event.

---

## 12. Possession and Direction Shortcuts

### 12.1 Default Shortcuts

| Command | Shortcut | Safety | Permission |
|---|---:|---|---|
| Switch possession | `C` | SAFE | `match.possession.update` |
| Set Home possession | `1` | SAFE | `match.possession.update` |
| Set Away possession | `0` | SAFE | `match.possession.update` |
| Switch offensive direction | `B` | GUARDED | `match.direction.update` |

### 12.2 Direction Safety

Direction switch should be guarded because it changes visual meaning on public display.

Default: confirmation outside period breaks, immediate only during configured interval transition.

### 12.3 Possession Payload

```ts
type ChangePossessionPayload = {
  possessionTeamSide: "HOME" | "AWAY";
  reasonCode:
    | "ALTERNATING_POSSESSION"
    | "TURNOVER"
    | "MADE_BASKET"
    | "OFFICIAL_SIGNAL"
    | "MANUAL_OPERATOR_DECISION";
};
```

---

## 13. Period and Match Lifecycle Shortcuts

### 13.1 Default Shortcuts

| Command | Shortcut | Safety | Permission |
|---|---:|---|---|
| Start period | `Enter` | GUARDED | `match.period.operate` |
| End period | `Shift+Enter` | DANGEROUS | `match.period.operate` |
| Start overtime | `Shift+O` | DANGEROUS | `match.period.operate` |
| Finalize match | `Shift+F` | DANGEROUS | `match.finalize` |

### 13.2 Lifecycle Safety

End period, start overtime, and finalize match must require:

- confirmation
- current score display
- current period display
- warning if clocks are still running
- reason when manually forced

---

## 14. Correction Shortcuts

### 14.1 Correction Philosophy

[SYSTEM RECOMMENDATION] Correction actions are never normal shortcuts.

They must open a correction workflow.

Correction must use compensating events.

Historical events must remain unchanged.

### 14.2 Default Correction Shortcuts

| Command | Shortcut | Safety | Permission |
|---|---:|---|---|
| Open correction panel | `Ctrl+K` | SAFE | `match.correction.view` |
| Undo last own pending command | `Ctrl+Z` | GUARDED | `match.correction.request` |
| Submit correction | `Ctrl+Enter` inside correction modal | DANGEROUS | `match.correction.apply` |
| Cancel correction | `Escape` | SAFE | none |

### 14.3 Correction Required Fields

Every correction must include:

- target event sequence or event id
- correction type
- old visible value
- new intended value
- reason
- actor user id
- actor role
- device id
- correlation id
- causation id

### 14.4 Correction Payload

```ts
type CorrectionRequestPayload = {
  targetEventId?: string;
  targetSeqNo?: number;
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
  proposedEvents: Array<unknown>;
};
```

---

## 15. Replay and Navigation Shortcuts

Replay shortcuts are read-only.

| Command | Shortcut | Safety | Permission |
|---|---:|---|---|
| Open replay timeline | `Ctrl+R` alternative disabled by default | SAFE | `match.replay.view` |
| Previous event | `ArrowLeft` in replay mode | SAFE | `match.replay.view` |
| Next event | `ArrowRight` in replay mode | SAFE | `match.replay.view` |
| Jump to live | `End` in replay mode | SAFE | `match.replay.view` |
| Exit replay | `Escape` | SAFE | none |

[SYSTEM RECOMMENDATION] Avoid defaulting to `Ctrl+R` because browsers use it for refresh. Prefer a UI button or configurable shortcut such as `Alt+R` only after testing browser behavior.

---

## 16. Emergency and Sync Shortcuts

### 16.1 Sync Shortcuts

| Command | Shortcut | Safety | Permission |
|---|---:|---|---|
| Force full state sync | `Alt+S` | SAFE | any authenticated operator |
| Show connection details | `Alt+D` | SAFE | any authenticated operator |
| Toggle shortcut help overlay | `?` | SAFE | all users |

### 16.2 Emergency Lock

| Command | Shortcut | Safety | Permission |
|---|---:|---|---|
| Lock operator input | `Alt+L` | GUARDED | operator |
| Unlock operator input | `Alt+U` | GUARDED | operator |
| Admin freeze match controls | `Shift+Alt+L` | DANGEROUS | admin |

Emergency lock does not alter official match state.
It only disables UI command submission.

---

## 17. Public Scoreboard Shortcuts

Public scoreboard screen must be read-only.

Allowed shortcuts:

| Command | Shortcut | Safety |
|---|---:|---|
| Toggle fullscreen prompt | `F` | SAFE |
| Show/hide connection status | `D` | SAFE |
| Force full sync | `S` | SAFE |
| Show display pairing code | `P` | SAFE |

Public scoreboard shortcuts must never send match control commands.

---

## 18. Shortcut Help Overlay

Every operator dashboard must include a shortcut help overlay.

Shortcut:

```txt
?
```

The overlay must show:

- active role
- active match
- active dashboard
- enabled shortcuts
- disabled shortcuts with reason
- safety level
- whether shortcut requires confirmation
- current event sequence
- connection state

---

## 19. Shortcut Configuration Model

### 19.1 Config File Shape

```ts
type ShortcutConfig = {
  version: string;
  profileName: string;
  locale: "th-TH" | "en-US";
  shortcuts: Array<{
    actionId: string;
    code: string;
    modifiers?: {
      ctrl?: boolean;
      shift?: boolean;
      alt?: boolean;
      meta?: boolean;
    };
    safetyLevel: "SAFE" | "GUARDED" | "DANGEROUS";
    dashboardScope: string[];
    requiredPermission?: string;
    confirmationRequired: boolean;
    longPressMs?: number;
  }>;
};
```

### 19.2 Storage

Shortcut profiles may be stored in:

- frontend default config
- organization settings
- tournament settings
- user preference

Precedence:

```txt
user preference
> tournament shortcut profile
> organization shortcut profile
> system default
```

### 19.3 Safety Override Rule

A user or tournament may change the key binding.

A user or tournament may not downgrade safety level.

Example:

- `SHOT_CLOCK_RESET_24` may be remapped from `R` to another key.
- It must remain `GUARDED` or stricter.
- It cannot become unsafe immediate action unless explicitly approved by Product Owner and tournament policy.

---

## 20. Shortcut Event Logging

[SYSTEM RECOMMENDATION] Shortcut usage should be included in command metadata for audit and troubleshooting.

Example metadata:

```json
{
  "inputSource": "KEYBOARD_SHORTCUT",
  "shortcutCode": "KeyQ",
  "dashboard": "score-control",
  "clientTimestamp": "2026-06-26T10:15:00.000Z"
}
```

For non-correction normal actions, shortcut metadata may be stored in `match_events.metadata`.

For corrections, shortcut metadata must also be visible in `audit_logs`.

---

## 21. Error Handling

### 21.1 Rejected Shortcut Command

When a command is rejected, UI must show:

- command name
- reason code
- explanation
- current server sequence
- current client sequence
- suggested next action

Example:

```txt
Shot clock reset rejected.
Reason: EXPECTED_SEQ_MISMATCH
Server is at seq 152, your screen was at seq 150.
Full state sync required.
```

### 21.2 Common Error Codes

- `UNAUTHORIZED_COMMAND`
- `MATCH_NOT_ASSIGNED`
- `MATCH_NOT_ACTIVE`
- `EXPECTED_SEQ_MISMATCH`
- `DUPLICATE_COMMAND`
- `RULE_VIOLATION`
- `TIMEOUT_QUOTA_EXCEEDED`
- `PLAYER_FOULED_OUT`
- `CORRECTION_REASON_REQUIRED`
- `FULL_STATE_SYNC_REQUIRED`
- `NEEDS_SOURCE`

---

## 22. Touchscreen Compatibility

[SYSTEM RECOMMENDATION] Every keyboard shortcut must have an equivalent large touchscreen button.

Keyboard shortcuts are enhancements, not the only operation method.

Operator buttons should show their shortcut label.

Example:

```txt
HOME +2    [W]
RESET 24   [Hold R]
TIMEOUT H  [Confirm Z]
```

---

## 23. Accessibility and Visibility

Shortcut UI must support:

- high contrast
- large font
- visible focus state
- no reliance on color alone
- clear active/inactive state
- clear confirmation prompts
- readable distance display for public mode

---

## 24. AI Agent Implementation Rules

AI agent must:

- define shortcut actions as typed constants
- centralize shortcut mapping
- never scatter keyboard handlers across components
- implement role-aware shortcut filtering
- implement focus-safe keyboard handling
- implement confirmation flow for guarded/dangerous actions
- implement command envelope generation
- include shortcut metadata in commands
- write tests for each shortcut category

AI agent must not:

- update score directly in frontend state
- bypass REST command handler
- bypass event sourcing
- use socket-only command logic
- skip `expectedSeq`
- skip permission validation
- skip correction reason
- use browser-reserved shortcuts as required defaults
- allow public scoreboard to send match commands

---

## 25. Recommended Frontend File Structure

```txt
src/
  shortcuts/
    shortcut-actions.ts
    shortcut-config.ts
    shortcut-types.ts
    shortcut-safety.ts
    shortcut-permissions.ts
    useKeyboardShortcuts.ts
    shortcut-command-factory.ts
    shortcut-help-overlay.tsx

  features/
    score-control/
      score-shortcuts.ts
    clock-control/
      clock-shortcuts.ts
    foul-control/
      foul-shortcuts.ts
    timeout-control/
      timeout-shortcuts.ts
    replay/
      replay-shortcuts.ts
```

---

## 26. Required Tests

### 26.1 Unit Tests

- pressing Home +1 creates correct command envelope
- pressing Away +3 creates correct command envelope
- shortcuts ignored inside input fields
- viewer cannot trigger operator shortcuts
- public scoreboard cannot send commands
- dangerous shortcut opens confirmation
- correction shortcut requires reason
- shot clock reset uses guarded behavior
- expectedSeq included in every command
- duplicate rapid key press creates separate command IDs unless blocked by pending policy

### 26.2 Integration Tests

- shortcut submits REST command
- backend validates RBAC
- backend validates expectedSeq
- rejected command shows reason
- accepted command appends event
- projection updates after polling sync
- shortcut command metadata appears in event metadata

### 26.3 E2E Tests

- operator adds Home +2 by keyboard and public scoreboard updates
- operator starts/stops game clock by keyboard
- operator resets shot clock to 14 with guarded shortcut
- timeout shortcut opens confirmation and submits after confirm
- correction flow cannot submit without reason
- connection stale state blocks unsafe shortcut until sync
- two operators pressing score shortcuts at same time results in one conflict handled safely

---

## 27. Acceptance Criteria

`KEYBOARD_SHORTCUTS.md` is implemented correctly when:

- all live shortcuts send backend commands, not local mutations
- all commands include `commandId`, `matchId`, `expectedSeq`, `correlationId`, `clientTimestamp`
- shortcuts are role-aware
- shortcuts are match-state-aware
- public scoreboard remains read-only
- dangerous actions require confirmation and reason where applicable
- correction uses compensating event flow
- shortcut help overlay shows active bindings
- shortcuts are disabled when typing in input fields
- polling/full sync recovers from stale state
- tests cover safe, guarded, and dangerous shortcut behavior

---

## 28. Product Owner Decisions Still Required

[ASSUMPTION] These decisions should be confirmed before final UI implementation:

1. Should score subtraction shortcuts exist at all?
2. Should shot clock reset be long-press or confirmation?
3. Should timeout shortcut use long-press or modal confirmation?
4. Should one operator handle all shortcuts, or should dashboards be split by role?
5. Should keyboard shortcut profiles be editable per tournament?
6. Should public scoreboard display shortcut controls for pairing/fullscreen only?
7. Should mobile/tablet operation prioritize touch buttons over keyboard?

Until confirmed, use the safe defaults in this document.

---

## 29. Default Shortcut Summary

| Area | Home | Away | Shared |
|---|---|---|---|
| Score +1 | `Q` | `I` | |
| Score +2 | `W` | `O` | |
| Score +3 | `E` | `P` | |
| Team foul +1 | `A` | `L` | |
| Player foul picker | `D` | `J` | |
| Timeout | `Z` | `/` | |
| Clock toggle | | | `Space` |
| Shot clock toggle | | | `X` |
| Reset shot clock 24 | | | `Hold R` |
| Reset shot clock 14 | | | `Hold T` |
| Stop shot clock | | | `V` |
| Switch possession | | | `C` |
| Switch direction | | | `B` |
| Correction panel | | | `Ctrl+K` |
| Full sync | | | `Alt+S` |
| Shortcut help | | | `?` |

---

## 30. Final Rule

[SYSTEM RECOMMENDATION] Keyboard shortcuts are input accelerators only.

They are never the source of truth.

The source of truth remains:

```txt
match_events
```

All shortcut actions must become validated commands, then append events, then update projections, then update UI.
