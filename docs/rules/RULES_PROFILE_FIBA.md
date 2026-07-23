# RULES_PROFILE_FIBA.md

> Status: Approved project rules profile draft  
> Default profile: `FIBA_2024`  
> Last updated: 2026-06-26  
> Owner: Product Owner / Basketball System Architect  
> Applies to: Basketball Scoreboard + Tournament Management web application

---

## 0. Purpose

[SYSTEM RECOMMENDATION] This file defines the default FIBA rules profile that AI coding agents, backend validators, UI workflows, projections, replay logic, and tests must use when implementing the Basketball Scoreboard and Tournament Management system.

This file is not a full replacement for the official FIBA rulebook. It is a machine-readable project profile containing only the rules that the application must enforce or display.

If a rule is not written in this file or in an approved rule document, the AI agent must not invent it.

Required response when source is missing:

```txt
[NEEDS SOURCE] Missing governing document: <document name or rule area>
```

---

## 1. Profile Identity

```yaml
profileId: FIBA_2024
profileName: FIBA Official Basketball Rules 2024
profileType: OFFICIAL_RULE_PROFILE
status: DEFAULT
sport: basketball
discipline: 5x5
governingBody: FIBA
officialRuleDocument: Official Basketball Rules 2024
officialInterpretationDocument: Official Basketball Rules Interpretations 2024
projectUse: default_rules_profile
```

[OFFICIAL RULE] FIBA Official Basketball Rules are the official source for this profile. AI agents must use the official rule documents as the governing source when implementing rule logic.

[SYSTEM RECOMMENDATION] Store `ruleProfileId = "FIBA_2024"` on every match, every match event, every correction, and every replay session so that historical matches can be reconstructed under the rule profile active at the time.

---

## 2. Source Hierarchy

AI agents must resolve rule conflicts using this order:

1. [OFFICIAL RULE] Official FIBA rule documents loaded into project knowledge or linked in the approved source registry.
2. [OFFICIAL RULE] Official FIBA interpretations loaded into project knowledge or linked in the approved source registry.
3. [SYSTEM RECOMMENDATION] Approved project rule specs such as `RULES_ENGINE_SPEC.md`, `EVENT_MODEL.md`, and `DOMAIN_MODEL.md`.
4. [ASSUMPTION] Tournament-specific local overrides approved by Product Owner.
5. AI general knowledge is not an official source.

If a requested rule is not supported by one of the first four sources, stop and mark `[NEEDS SOURCE]`.

---

## 3. Approved Source Registry

| Source key | Document | Purpose | Status |
|---|---|---|---|
| `FIBA_OBR_2024` | FIBA Official Basketball Rules 2024 | Main rulebook | Approved |
| `FIBA_OBRI_2024` | FIBA Official Basketball Rules Interpretations 2024 | Interpretations and examples | Approved for later detailed engine work |
| `PROJECT_RULES_PROFILE_FIBA` | This file | Project-specific machine-readable profile | Approved draft |
| `RULES_ENGINE_SPEC` | `RULES_ENGINE_SPEC.md` | Validator and state-machine implementation | Pending creation |
| `FOUL_PENALTY_MATRIX` | `FOUL_PENALTY_MATRIX.md` | Full foul penalty matrix | Pending creation |
| `SHOT_CLOCK_STATE_MACHINE` | `SHOT_CLOCK_STATE_MACHINE.md` | Full 24/14/no-reset transition matrix | Pending creation |

---

## 4. Scope

This profile covers the minimum FIBA rules needed for the first production-safe scoreboard and tournament system:

- Game structure
- Regulation periods
- Overtime
- Game clock configuration
- Shot clock configuration
- Basic shot clock reset policy
- Time-out quota
- Team foul penalty threshold
- Player foul limit
- Basic foul-out handling
- Rule verification behavior
- Event and validation requirements

This profile does not yet fully implement:

- Full technical foul penalty matrix
- Full unsportsmanlike foul penalty matrix
- Full disqualifying foul penalty matrix
- Fighting penalties
- Correctable errors
- Instant replay system
- Head coach challenge
- Detailed substitution rules
- Protest workflow
- Scoresheet marking format
- Media time-outs
- Competition-specific classification rules

For those areas, AI agents must use `[NEEDS SOURCE]` or create separate rule-spec files with official references.

---

## 5. Core Game Config

[OFFICIAL RULE] FIBA game structure uses 4 regulation quarters of 10 minutes each, with overtime periods of 5 minutes when required.

```yaml
coreGameConfig:
  periods:
    regulationPeriodCount: 4
    periodDurationSeconds: 600
    periodLabelType: QUARTER
  overtime:
    enabled: true
    overtimeDurationSeconds: 300
    overtimePeriodLabelPrefix: OT
    repeatUntilWinner: true
  intervals:
    preGameIntervalMinutes: 20
    betweenQ1Q2Seconds: 120
    halfTimeIntervalSeconds: 900
    betweenQ3Q4Seconds: 120
    beforeOvertimeSeconds: 120
  winner:
    higherScoreAtEndOfPlayingTimeWins: true
```

### System requirements

[SYSTEM RECOMMENDATION]

- Do not hard-code period duration in UI components.
- Use `rulesProfile.coreGameConfig`.
- Store period state in match projection.
- Store period start/end events in `match_events`.
- Overtime must be created by rule validation, not by UI-only logic.
- Historical replay must show the period labels generated from this profile.

---

## 6. Game Clock Config

```yaml
gameClockConfig:
  clockDirection: COUNT_DOWN
  regulationInitialRemainingMs: 600000
  overtimeInitialRemainingMs: 300000
  displayFormat:
    default: MM_SS
    underOneMinute: SS_TENTHS_OPTIONAL
  deadlineBasedClockRecommended: true
```

### Deadline-based clock policy

[SYSTEM RECOMMENDATION] The backend must not depend on a long-running `setInterval()` process to update the game clock every second.

Use a deadline-based model:

```txt
When clock starts:
- append GAME_CLOCK_STARTED
- store serverStartedAt
- store remainingMsAtStart

When client displays:
- remainingMs = remainingMsAtStart - (clientNowSyncedToServer - serverStartedAt)

When clock stops:
- server calculates remainingMs
- append GAME_CLOCK_STOPPED
- update projection
```

This approach works better on shared hosting and also supports replay.

### Required events

```txt
PERIOD_STARTED
PERIOD_ENDED
OVERTIME_STARTED
GAME_CLOCK_STARTED
GAME_CLOCK_STOPPED
GAME_CLOCK_SET_BY_CORRECTION
GAME_CLOCK_EXPIRED
```

### Required validators

```txt
canStartGameClock(matchState)
canStopGameClock(matchState)
canSetGameClock(matchState, correctionReason)
canEndPeriod(matchState)
shouldStartOvertime(matchState)
```

---

## 7. Shot Clock Config

[OFFICIAL RULE] FIBA shot clock requires a team to attempt a shot for a goal within 24 seconds after control conditions defined by Article 29. The ball must leave the player's hand before the shot clock signal and then touch the ring or enter the basket for a valid attempt.

```yaml
shotClockConfig:
  enabled: true
  defaultSeconds: 24
  offensiveReboundSeconds: 14
  frontcourtResetSeconds: 14
  backcourtResetSeconds: 24
  countDirection: COUNT_DOWN
  displayFormat: SS
  canBeOffWhenNotRequired: true
```

---

## 8. Shot Clock Reset Policy

### 8.0 RM-04 Manual Operator Boundary

RM-04 authorizes only explicit operator-selected Reset 14 and Reset 24 commands through the existing server-validated
14/24 payload enum. This bounded UI does not select a reset value from game context and does not claim automatic FIBA
reset compliance. The broader contextual decision model below remains deferred and is not authorization for new
commands, events, endpoints, or automatic behavior.

`SHOT_CLOCK_START`, `SHOT_CLOCK_STOP`, `SHOT_CLOCK_STARTED`, and `SHOT_CLOCK_STOPPED` are outside the RM-04 command
surface. Period and match lifecycle remain in their existing lifecycle domain.

`[NEEDS SOURCE] Missing governing document: authoritative FIBA shot-clock operational rules required for
automatic/context-aware 14/24 reset decisions.`

[SYSTEM RECOMMENDATION] The UI must never decide final shot clock reset values by itself. The UI may send a command such as `REQUEST_SHOT_CLOCK_RESET`, but the backend must validate the reset against the current match state, event context, and this rules profile.

### 8.1 Basic reset decision table

| Situation | Result | Source label |
|---|---:|---|
| New live-ball control after start of period / overtime | Start/reset 24 | [OFFICIAL RULE] |
| Throw-in touched legally and thrower-in team remains in control | Start shot clock | [OFFICIAL RULE] |
| Same team keeps possession; throw-in in backcourt after stoppage caused by non-control team | Reset 24 | [OFFICIAL RULE] |
| Same team keeps possession; throw-in in frontcourt; 14 or more seconds showing | Continue, no reset | [OFFICIAL RULE] |
| Same team keeps possession; throw-in in frontcourt; 13 or fewer seconds showing | Reset 14 | [OFFICIAL RULE] |
| New offensive team awarded throw-in in backcourt | Reset 24 | [OFFICIAL RULE] |
| New offensive team awarded throw-in in frontcourt | Reset 14 | [OFFICIAL RULE] |
| Technical foul by team in control, same team retains throw-in nearest stop location | No reset, continue | [OFFICIAL RULE] |
| Ball touches opponent's ring; opponents gain control | Reset 24 | [OFFICIAL RULE] |
| Ball touches opponent's ring; same team regains control | Reset 14 | [OFFICIAL RULE] |
| Unsportsmanlike/disqualifying foul penalty with frontcourt throw-in line | Reset 14 | [OFFICIAL RULE] |
| Unknown context | Reject command and require manual correction reason | [SYSTEM RECOMMENDATION] |

### 8.2 Required shot clock context fields

Every shot-clock reset command must provide enough context for validation:

```ts
type ShotClockResetContext = {
  matchId: string;
  teamInControlId?: string;
  previousTeamInControlId?: string;
  throwInTeamId?: string;
  throwInLocation?: "BACKCOURT" | "FRONTCOURT" | "THROW_IN_LINE" | "UNKNOWN";
  stoppageReason?:
    | "FOUL_BY_CONTROL_TEAM"
    | "FOUL_BY_NON_CONTROL_TEAM"
    | "VIOLATION_BY_CONTROL_TEAM"
    | "VIOLATION_BY_NON_CONTROL_TEAM"
    | "BALL_OUT_OF_BOUNDS"
    | "TECHNICAL_FOUL_BY_CONTROL_TEAM"
    | "UNSPORTSMANLIKE_FOUL"
    | "DISQUALIFYING_FOUL"
    | "BALL_HIT_RING"
    | "TIMEOUT"
    | "ALTERNATING_POSSESSION"
    | "REFEREE_STOPPAGE"
    | "UNKNOWN";
  currentShotClockMs?: number;
  currentGameClockMs?: number;
  periodType: "REGULATION" | "OVERTIME";
  periodNumber: number;
};
```

### 8.3 Required shot clock events

```txt
SHOT_CLOCK_STARTED
SHOT_CLOCK_STOPPED
SHOT_CLOCK_RESET_TO_24
SHOT_CLOCK_RESET_TO_14
SHOT_CLOCK_CONTINUED_WITHOUT_RESET
SHOT_CLOCK_SET_BY_CORRECTION
SHOT_CLOCK_EXPIRED
SHOT_CLOCK_SIGNAL_ERROR_CORRECTED
```

### 8.4 Required validators

```txt
decideShotClockReset(context): ShotClockDecision
canStartShotClock(matchState)
canStopShotClock(matchState)
canManuallySetShotClock(matchState, correctionReason)
```

### 8.5 Shot clock decision return shape

```ts
type ShotClockDecision = {
  allowed: boolean;
  action:
    | "RESET_24"
    | "RESET_14"
    | "CONTINUE"
    | "TURN_OFF"
    | "REJECT"
    | "MANUAL_CORRECTION_REQUIRED";
  newRemainingMs?: number;
  reasonCode: string;
  sourceRuleRefs: string[];
  explanation: string;
};
```

---

## 9. Timeout Config

[OFFICIAL RULE] FIBA time-outs last 1 minute. Each team may be granted 2 time-outs in the first half, 3 in the second half with a maximum of 2 when the game clock shows 2:00 or less in the fourth quarter, and 1 in each overtime.

```yaml
timeoutConfig:
  timeoutDurationSeconds: 60
  firstHalfTimeouts: 2
  secondHalfTimeouts: 3
  maxTimeoutsLastTwoMinutesQ4: 2
  overtimeTimeoutsPerOvertime: 1
  unusedTimeoutCarryOver:
    firstHalfToSecondHalf: false
    secondHalfToOvertime: false
    overtimeToNextOvertime: false
  requesterRoles:
    officialRuleRequester:
      - HEAD_COACH
      - FIRST_ASSISTANT_COACH
    systemOperatorAllowedRoles:
      - ADMIN
      - REFEREE
      - SCORER
```

### 9.1 Timeout opportunity policy

[OFFICIAL RULE] Time-out opportunities must follow FIBA time-out rules.

[SYSTEM RECOMMENDATION] For MVP, the system may not fully detect every live-ball/dead-ball timeout opportunity automatically. If not enough state exists to validate a timeout opportunity, the system must require the scorer/referee to confirm and record the reason.

```yaml
timeoutOpportunityMode:
  mvp: OPERATOR_CONFIRMED
  productionTarget: RULE_VALIDATED
```

### 9.2 Timeout event types

```txt
TIMEOUT_REQUESTED
TIMEOUT_GRANTED
TIMEOUT_STARTED
TIMEOUT_ENDED
TIMEOUT_CANCELLED_BY_CORRECTION
TIMEOUT_DENIED_BY_RULE
```

### 9.3 Required timeout validators

```txt
canGrantTimeout(matchState, teamId)
getTimeoutQuota(matchState, teamId)
isLastTwoMinutesOfFourthQuarter(matchState)
isOvertime(matchState)
```

### 9.4 Timeout validation output

```ts
type TimeoutDecision = {
  allowed: boolean;
  reasonCode:
    | "TIMEOUT_ALLOWED"
    | "NO_TIMEOUT_REMAINING"
    | "LAST_TWO_MINUTES_Q4_LIMIT_REACHED"
    | "TIMEOUT_NOT_ALLOWED_FOR_SCORING_TEAM"
    | "TIMEOUT_OPPORTUNITY_NOT_AVAILABLE"
    | "UNKNOWN_REQUIRES_OFFICIAL_CONFIRMATION";
  sourceRuleRefs: string[];
  explanation: string;
};
```

---

## 10. Team Foul Config

[OFFICIAL RULE] A team is in team foul penalty situation after it has committed 4 team fouls in a quarter. Fouls in each overtime are considered as committed in the fourth quarter.

```yaml
teamFoulConfig:
  penaltyThresholdPerQuarter: 4
  penaltyStartsAfterCommittedFouls: 4
  overtimeCountsAsFourthQuarter: true
  intervalFoulsCountInFollowingPeriod: true
```

### 10.1 Projection fields

```ts
type TeamFoulProjection = {
  teamId: string;
  periodNumber: number;
  periodType: "REGULATION" | "OVERTIME";
  teamFoulsThisPeriod: number;
  isInPenalty: boolean;
  penaltySourceRuleRefs: string[];
};
```

### 10.2 Required foul events

```txt
TEAM_FOUL_ADDED
TEAM_FOUL_CORRECTED
TEAM_FOUL_REMOVED_BY_CORRECTION
TEAM_ENTERED_PENALTY
```

### 10.3 Required validators

```txt
shouldCountAsTeamFoul(foulContext)
getTeamFoulCountForPenalty(matchState, teamId)
isTeamInPenalty(matchState, teamId)
```

[NEEDS SOURCE] Full count/non-count behavior for every special foul type must be specified in `FOUL_PENALTY_MATRIX.md` before implementing automatic free-throw and possession penalties.

---

## 11. Player Foul Config

[OFFICIAL RULE] A player who has committed 5 fouls must leave the game immediately.

```yaml
playerFoulConfig:
  playerFoulLimit: 5
  foulOutStatus: FOULED_OUT
  immediateSubstitutionRequired: true
```

### 11.1 Required player foul events

```txt
PLAYER_FOUL_ADDED
PLAYER_FOUL_CORRECTED
PLAYER_FOUL_REMOVED_BY_CORRECTION
PLAYER_FOULED_OUT
PLAYER_REINSTATED_BY_CORRECTION
```

### 11.2 Required validators

```txt
canAssignFoulToPlayer(matchState, playerId)
getPlayerFoulCount(matchState, playerId)
isPlayerFouledOut(matchState, playerId)
```

### 11.3 UI requirement

[SYSTEM RECOMMENDATION]

- When player reaches 5 fouls, operator UI must show a high-priority warning.
- The public scoreboard may show foul count but must not expose admin correction controls.
- If a foul is corrected below 5, append a correction event and rebuild player status projection.

---

## 12. Scoring Config

```yaml
scoringConfig:
  allowedPointValues:
    - 1
    - 2
    - 3
  supportsPlayerScoring: true
  supportsTeamOnlyScoringFallback: true
  scoreCorrectionRequiresReason: true
```

### 12.1 Required score events

```txt
SCORE_ADDED
SCORE_CORRECTED
SCORE_REMOVED_BY_CORRECTION
PLAYER_SCORE_ASSIGNED
PLAYER_SCORE_CORRECTED
```

### 12.2 Required validators

```txt
canAddScore(matchState, teamId, points)
canAssignScoreToPlayer(matchState, playerId, points)
canCorrectScore(matchState, correctionReason)
```

[SYSTEM RECOMMENDATION] Manual score addition is allowed for speed during live operation, but corrections must preserve audit history.

---

## 13. Possession and Direction Config

```yaml
possessionConfig:
  trackPossessionArrow: true
  trackOffensiveDirection: true
  switchDirectionAtHalfTime: true
```

### Required events

```txt
POSSESSION_CHANGED
ALTERNATING_POSSESSION_SET
OFFENSIVE_DIRECTION_SWITCHED
```

[NEEDS SOURCE] Detailed alternating possession procedure and all jump-ball situations must be verified against the official rule document before full automation.

---

## 14. Match Lifecycle

```yaml
matchLifecycle:
  states:
    - SCHEDULED
    - PRE_GAME
    - IN_PROGRESS
    - PERIOD_BREAK
    - HALF_TIME
    - OVERTIME_BREAK
    - FINAL_PENDING_REVIEW
    - FINAL_OFFICIAL
    - CORRECTED_AFTER_FINAL
```

### Required lifecycle events

```txt
MATCH_CREATED
MATCH_ROSTER_CONFIRMED
MATCH_STARTED
PERIOD_STARTED
PERIOD_ENDED
OVERTIME_STARTED
MATCH_ENDED
MATCH_MARKED_OFFICIAL
MATCH_REOPENED_FOR_CORRECTION
MATCH_CORRECTED_AFTER_FINAL
```

---

## 15. Rule Enforcement Levels

Every rule in this profile must define its enforcement level.

```yaml
enforcementLevels:
  HARD_BLOCK:
    description: Command must be rejected if rule fails.
  CONFIRMATION_REQUIRED:
    description: Operator may continue only after explicit confirmation and reason.
  WARNING_ONLY:
    description: UI warns but does not block.
  NOT_AUTOMATED:
    description: Requires official/manual decision.
```

### Suggested enforcement map

| Rule area | Enforcement level |
|---|---|
| Period duration config | HARD_BLOCK |
| Overtime duration config | HARD_BLOCK |
| Timeout quota | HARD_BLOCK |
| Timeout opportunity | CONFIRMATION_REQUIRED for MVP, HARD_BLOCK for full engine |
| Player foul-out | HARD_BLOCK for player participation, WARNING for operator workflow |
| Team foul penalty threshold | HARD_BLOCK for projection, CONFIRMATION_REQUIRED for penalty administration until matrix is complete |
| Shot clock reset | CONFIRMATION_REQUIRED if context incomplete, HARD_BLOCK if context is complete and invalid |
| Score correction reason | HARD_BLOCK |
| Unknown official rule | HARD_BLOCK with `[NEEDS SOURCE]` |

---

## 16. Machine-Readable Profile Draft

AI agents may use this object as the initial implementation target.

```ts
export const FIBA_2024_RULES_PROFILE = {
  profileId: "FIBA_2024",
  profileName: "FIBA Official Basketball Rules 2024",
  status: "DEFAULT",
  sourceKeys: ["FIBA_OBR_2024", "FIBA_OBRI_2024"],

  game: {
    regulationPeriodCount: 4,
    periodDurationSeconds: 600,
    overtimeDurationSeconds: 300,
    repeatOvertimeUntilWinner: true,
    preGameIntervalSeconds: 1200,
    betweenPeriodIntervalSeconds: 120,
    halfTimeIntervalSeconds: 900,
    beforeOvertimeIntervalSeconds: 120,
  },

  gameClock: {
    direction: "COUNT_DOWN",
    regulationInitialRemainingMs: 600_000,
    overtimeInitialRemainingMs: 300_000,
    deadlineBasedClockRecommended: true,
  },

  shotClock: {
    enabled: true,
    defaultSeconds: 24,
    backcourtResetSeconds: 24,
    frontcourtResetSeconds: 14,
    offensiveReboundSeconds: 14,
    decisionMode: "RULE_VALIDATED_WITH_MANUAL_CONFIRMATION_FALLBACK",
  },

  timeout: {
    durationSeconds: 60,
    firstHalfTimeouts: 2,
    secondHalfTimeouts: 3,
    maxTimeoutsLastTwoMinutesQ4: 2,
    overtimeTimeoutsPerOvertime: 1,
    carryOver: {
      firstHalfToSecondHalf: false,
      secondHalfToOvertime: false,
      overtimeToNextOvertime: false,
    },
  },

  fouls: {
    playerFoulLimit: 5,
    teamFoulPenaltyThresholdPerQuarter: 4,
    overtimeTeamFoulsCountAsFourthQuarter: true,
    fullPenaltyMatrixRequired: true,
  },

  scoring: {
    allowedPointValues: [1, 2, 3],
    correctionRequiresReason: true,
  },

  possession: {
    trackAlternatingPossession: true,
    trackOffensiveDirection: true,
    switchDirectionAtHalfTime: true,
  },

  enforcement: {
    unknownOfficialRule: "NEEDS_SOURCE",
    correctionReasonRequired: true,
    serverSideValidationRequired: true,
  },
} as const;
```

---

## 17. Required Backend Rule Service

AI agents must implement the rules profile behind a backend rule service, not directly inside UI components.

```ts
interface RulesProfileService {
  getProfile(profileId: string): RulesProfile;
  validateCommand(command: MatchCommand, state: MatchState): RuleDecision;
  canGrantTimeout(state: MatchState, teamId: string): TimeoutDecision;
  decideShotClockReset(context: ShotClockResetContext): ShotClockDecision;
  isTeamInPenalty(state: MatchState, teamId: string): boolean;
  isPlayerFouledOut(state: MatchState, playerId: string): boolean;
  shouldStartOvertime(state: MatchState): boolean;
}
```

---

## 18. Event Metadata Requirements

Every event affected by this rules profile must include:

```ts
type RuleAwareEventMetadata = {
  ruleProfileId: "FIBA_2024";
  sourceRuleRefs: string[];
  ruleDecisionCode?: string;
  ruleDecisionExplanation?: string;
};
```

Example:

```json
{
  "eventType": "SHOT_CLOCK_RESET_TO_14",
  "payload": {
    "teamId": "team_home",
    "remainingMs": 14000,
    "reason": "SAME_TEAM_FRONTCOURT_13_OR_LESS"
  },
  "metadata": {
    "ruleProfileId": "FIBA_2024",
    "sourceRuleRefs": ["FIBA_OBR_2024:29.2.2"],
    "ruleDecisionCode": "RESET_14_FRONTCOURT_13_OR_LESS"
  }
}
```

---

## 19. UI Requirements

### 19.1 Operator UI

[SYSTEM RECOMMENDATION]

- Display active rule profile: `FIBA_2024`.
- Display current period and remaining time.
- Display team timeout usage by half/overtime.
- Display team foul count and penalty status.
- Display player foul count and foul-out warning.
- Display shot clock with reset 24, reset 14, continue, and manual correction actions.
- Show warning when command requires official confirmation.
- Require reason for corrections.

### 19.2 Public scoreboard UI

[SYSTEM RECOMMENDATION]

- Read-only.
- Never sends scoring/foul/clock commands.
- Displays score, period, game clock, shot clock, team fouls, timeouts, possession arrow if enabled.
- Must recover state using projection + event sequence.

### 19.3 Replay UI

[SYSTEM RECOMMENDATION]

- Must replay events using the rule profile stored on the match.
- Must not use current rule profile if replaying a historical match created under a previous profile.

---

## 20. Test Requirements

AI agents must add tests for every rule implemented from this profile.

### 20.1 Game structure tests

```txt
- FIBA regulation match has 4 periods.
- Each regulation period starts with 600 seconds.
- Overtime starts with 300 seconds.
- If score is tied after Q4, overtime is allowed.
- If score is not tied after Q4, match can be finalized.
```

### 20.2 Timeout tests

```txt
- Team can use 2 timeouts in first half.
- Third first-half timeout is rejected.
- Team can use 3 timeouts in second half.
- In last 2 minutes of Q4, no more than 2 second-half timeouts are allowed.
- Each overtime allows 1 timeout.
- Unused regulation timeouts do not carry to overtime.
```

### 20.3 Shot clock tests

```txt
- New control starts 24 seconds.
- Same team frontcourt with 14 or more seconds continues without reset.
- Same team frontcourt with 13 or fewer seconds resets to 14.
- New offensive team backcourt resets to 24.
- New offensive team frontcourt resets to 14.
- Ball hits ring and same team regains control resets to 14.
- Ball hits ring and opponent gains control resets to 24.
- Unknown context requires manual confirmation or correction reason.
```

### 20.4 Foul tests

```txt
- Player receives 5th foul and becomes FOULED_OUT.
- Team enters penalty after 4 team fouls in a quarter.
- Overtime team fouls count as fourth-quarter team fouls.
- Foul correction below 5 reinstates player only through correction event.
```

### 20.5 Audit and replay tests

```txt
- Every rule-based command stores ruleProfileId.
- Correction requires reason.
- Replay uses event ruleProfileId.
- Projection can be rebuilt from events.
```

---

## 21. Edge Cases

AI agents must handle or explicitly defer the following edge cases:

```txt
- Score tied after Q4.
- Score corrected after Q4 changes overtime requirement.
- Wrong player assigned 5th foul.
- Team foul correction changes penalty state.
- Timeout granted incorrectly in last 2 minutes of Q4.
- Shot clock reset to 24 instead of 14.
- Shot clock reset context missing throw-in location.
- Public scoreboard reconnects after missing reset event.
- Match reopened after final official result.
```

---

## 22. Local Rules Override Policy

[ASSUMPTION] Some school, university, or local tournaments may modify durations, timeout counts, foul limits, or shot clock behavior.

Local overrides are allowed only if:

1. Product Owner approves the override.
2. Override is saved as a new `rulesProfileId`, such as `LOCAL_SCHOOL_2026`.
3. The override clearly lists which FIBA rules were changed.
4. Existing historical matches remain attached to their original profile.
5. AI agent does not call local overrides “official FIBA rules”.

Example:

```yaml
profileId: LOCAL_SCHOOL_2026
extends: FIBA_2024
overrides:
  game.periodDurationSeconds: 480
  timeout.firstHalfTimeouts: 1
approval:
  approvedBy: product_owner
  approvedAt: 2026-06-26
```

---

## 23. Forbidden AI Agent Behavior

AI agents must not:

- Invent FIBA rules.
- Mix NBA/NCAA rules into FIBA profile.
- Hard-code FIBA values directly into React components.
- Store mutable scoreboard state as source of truth.
- Allow client-calculated timeout/foul/shot-clock decisions to override server validation.
- Implement special foul penalties without source references.
- Delete or mutate historical events to fix a wrong rule decision.
- Use current rule profile to replay old matches without checking event metadata.
- Ignore `[NEEDS SOURCE]`.

---

## 24. Definition of Done

A rule implementation is done only when:

```txt
- Rule appears in this file or another approved rule spec.
- Source rule reference is recorded.
- Backend validator exists.
- Event metadata stores ruleProfileId.
- Projection behavior is defined.
- UI behavior is defined.
- Unit tests exist.
- Edge case tests exist.
- Correction behavior exists.
- Replay behavior is verified.
```

---

## 25. Next Required Files

After this file, create:

```txt
RULES_ENGINE_SPEC.md
SHOT_CLOCK_STATE_MACHINE.md
FOUL_PENALTY_MATRIX.md
DOMAIN_MODEL.md
EVENT_MODEL.md
DATABASE_SCHEMA.md
TEST_PLAN.md
```

[SYSTEM RECOMMENDATION] Do not implement full foul automation before `FOUL_PENALTY_MATRIX.md` is created and reviewed.
