# RULES_ENGINE_SPEC.md

> Version: 1.0  
> Status: Draft for implementation  
> Owner: System Architect / Basketball Rules Analyst  
> Default rules profile: `RULES_PROFILE_FIBA.md`  
> Applies to: Backend command validation, projections, replay, correction review, tests

---

## 0. Purpose

ไฟล์นี้กำหนดวิธีสร้าง **Rules Engine** สำหรับระบบ Basketball Scoreboard และ Tournament Management ให้ AI Coding Agent เข้าใจว่า “กติกา” ต้องถูกแปลงเป็น **logic ที่ตรวจสอบได้** ไม่ใช่ข้อความอธิบายลอย ๆ หรือเงื่อนไขที่ฝังไว้กระจัดกระจายใน UI

Rules Engine ต้องทำหน้าที่เป็นชั้นกลางระหว่าง:

```txt
User Command
  -> Authorization
  -> Payload Validation
  -> Rules Engine Validation
  -> Append Match Event
  -> Update Snapshot / Projection
  -> Broadcast / Polling Sync
```

[SYSTEM RECOMMENDATION] ห้ามให้ frontend เป็นผู้ตัดสินกติกาสุดท้าย เช่น timeout ยังเหลือไหม, ผู้เล่น foul-out หรือยัง, shot clock ควร reset 24/14/no reset หรือไม่ เพราะ client state สามารถเก่า ผิด หรือถูกแก้ไขได้

---

## 1. Mission

Rules Engine มีภารกิจหลัก 5 อย่าง:

1. Validate คำสั่งก่อน append event
2. ตัดสินผลของกติกาแบบ deterministic
3. คืนผลแบบ machine-readable ให้ backend, UI และ tests ใช้ร่วมกัน
4. แยก rule profile ออกจาก business logic เพื่อรองรับ FIBA/NBA/NCAA/local rules ในอนาคต
5. ป้องกัน AI agent เดากติกาทางการเมื่อยังไม่มี source

---

## 2. Non-Negotiable Rules

- Rules Engine ต้องใช้ `RuleProfile` เป็น input เสมอ
- ห้าม hard-code ค่า FIBA ไว้กระจัดกระจายใน service หรือ component
- ห้ามให้ UI เป็นแหล่งตัดสินกติกาสุดท้าย
- ห้ามให้ client ส่งค่า score/foul/clock state แล้ว server เชื่อทันที
- ทุก command ที่กระทบ match state ต้องผ่าน Rules Engine หรือ explicit bypass ที่มี audit reason
- ทุก rule decision ต้องคืน `RuleDecision`
- ทุก `RuleDecision` ต้องมี `reasonCode`
- ถ้าเป็นกติกาทางการ ต้องมี `sourceRuleRef`
- ถ้ายังไม่มีเอกสารยืนยัน ให้คืน `[NEEDS SOURCE]` และห้าม implement automation แบบเด็ดขาด
- Correction ต้องใช้ compensating event ไม่ใช่แก้ event เดิม
- Replay ต้องได้ผล state เดียวกับ live projection เมื่อใช้ event stream เดียวกัน

---

## 3. Relationship with Other Project Files

AI agent ต้องอ่านไฟล์เหล่านี้ก่อนแก้ Rules Engine:

```txt
/docs/agent/AI_AGENT_RULES.md
/docs/product/PROJECT_BRIEF.md
/docs/rules/RULES_PROFILE_FIBA.md
/docs/rules/RULES_ENGINE_SPEC.md
/docs/architecture/DOMAIN_MODEL.md
/docs/architecture/EVENT_MODEL.md
/docs/architecture/PROJECTION_MODEL.md
/docs/api/API_CONTRACTS.md
/docs/api/SOCKET_CONTRACTS.md
/docs/database/DATABASE_SCHEMA.md
/docs/quality/TEST_PLAN.md
/docs/quality/EDGE_CASES.md
```

[SYSTEM RECOMMENDATION] ถ้าไฟล์ใดไม่มี ให้ AI agent ต้องแจ้งว่า dependency ยังไม่ครบ แทนการเดาโครงสร้างเอง

---

## 4. Rule Statement Labels

ใช้ label เหล่านี้ใน code comment, test name, issue, PR description และเอกสาร design:

| Label | ใช้เมื่อ |
|---|---|
| `[OFFICIAL RULE]` | กติกาที่ตรวจจากเอกสาร governing document แล้ว |
| `[SYSTEM RECOMMENDATION]` | คำแนะนำด้าน architecture, UX, API, DB, security, QA |
| `[ASSUMPTION]` | decision ของระบบที่ยังไม่ได้เป็นกติกาทางการ |
| `[NEEDS SOURCE]` | ยังไม่มีเอกสารกติกาทางการรองรับ |

---

## 5. Source Hierarchy

เมื่อเกิดความขัดแย้ง ให้ถือแหล่งข้อมูลตามลำดับนี้:

1. Product Owner decision สำหรับ local tournament override
2. Official governing document ของ rule profile ที่ active อยู่
3. `RULES_PROFILE_FIBA.md`
4. `RULES_ENGINE_SPEC.md`
5. Approved architecture documents
6. Existing tests ที่ผ่านและตรงกับเอกสาร
7. AI model general knowledge

[SYSTEM RECOMMENDATION] AI agent ห้ามใช้ความรู้ทั่วไปของโมเดลไป override เอกสารกติกาที่โหลดไว้

---

## 6. Core Design Principle

Rules Engine ต้องเป็น **pure decision layer** ให้มากที่สุด

```txt
Input:
- current match state
- rule profile
- command context
- event context

Output:
- allowed / not allowed
- reason code
- explanation
- rule effects
- warnings
- required audit metadata
```

[SYSTEM RECOMMENDATION] Rules Engine ไม่ควร query database โดยตรง ถ้าจำเป็นต้องใช้ข้อมูลเพิ่ม ให้ service layer ดึงข้อมูลแล้วส่งเข้า function เป็น input เพื่อให้ unit test ง่ายและ deterministic

---

## 7. Required Responsibilities

Rules Engine ต้องรับผิดชอบอย่างน้อย:

```txt
- Validate match start
- Validate period start/end
- Validate overtime creation
- Validate game clock start/stop/set
- Validate shot clock start/stop/set/reset
- Validate score event
- Validate timeout availability
- Validate team foul penalty state
- Validate player foul-out
- Validate possession change
- Validate direction switch
- Validate correction eligibility
- Validate replay consistency assumptions
- Validate rule profile support
```

---

## 8. Out of Scope for Initial Rules Engine

Initial version ยังไม่ควร automate สิ่งเหล่านี้แบบเต็มจนกว่าจะมีเอกสารเฉพาะ:

```txt
- Full foul penalty matrix
- Technical foul penalty automation
- Unsportsmanlike foul penalty automation
- Disqualifying foul penalty automation
- Fighting rule automation
- Correctable error full workflow
- Protest workflow
- Referee challenge workflow
- Free throw sequence automation
- Complex substitution legality
```

สำหรับรายการข้างต้น ให้ใช้ policy:

```txt
[NEEDS SOURCE] Missing governing document or detailed rule matrix.
```

หรือให้บันทึกเป็น manual scorer/referee decision พร้อม audit log

---

## 9. Rule Profile Input

Rules Engine ต้องรับ `RuleProfile` เป็น input ทุกครั้ง

```ts
export type RuleProfileId = "FIBA_2024" | "LOCAL_CUSTOM" | string;

export interface RuleProfile {
  id: RuleProfileId;
  name: string;
  version: string;
  governingBody: "FIBA" | "NBA" | "NCAA" | "LOCAL";
  status: "default" | "approved" | "draft" | "deprecated";

  game: {
    regulationPeriods: number;
    periodDurationMs: number;
    overtimeDurationMs: number;
    requireWinner: boolean;
  };

  clock: {
    useDeadlineBasedClock: boolean;
    stopAtPeriodEnd: boolean;
    allowManualClockSet: boolean;
    manualClockSetRequiresReason: boolean;
  };

  shotClock: {
    enabled: boolean;
    defaultMs: number;
    frontcourtResetMs: number;
    offensiveReboundResetMs: number;
    allowManualSet: boolean;
    manualSetRequiresReason: boolean;
  };

  timeout: {
    durationMs: number;
    firstHalfLimit: number;
    secondHalfLimit: number;
    lastTwoMinutesQ4Limit: number;
    overtimeLimitPerPeriod: number;
    requesterRoles: string[];
  };

  foul: {
    playerFoulLimit: number;
    teamFoulPenaltyThreshold: number;
    overtimeTeamFoulsCountAsPeriod?: number;
    enableFullPenaltyMatrix: boolean;
  };

  possession: {
    useAlternatingPossession: boolean;
    directionSwitchAtHalfTime: boolean;
  };

  sourceRefs: RuleSourceRef[];
}
```

---

## 10. Rule Source Reference

ทุกกติกาทางการต้องอ้างอิง source ได้

```ts
export interface RuleSourceRef {
  ruleProfileId: string;
  documentName: string;
  documentVersion: string;
  article?: string;
  section?: string;
  note?: string;
}
```

ตัวอย่าง:

```ts
const FIBA_ARTICLE_8: RuleSourceRef = {
  ruleProfileId: "FIBA_2024",
  documentName: "FIBA Official Basketball Rules",
  documentVersion: "2024",
  article: "8",
  note: "Playing time, tied score and overtime"
};
```

---

## 11. Rule Decision Output Format

ทุก function ต้องคืน `RuleDecision`

```ts
export type RuleSeverity = "info" | "warning" | "error" | "fatal";

export interface RuleDecision<TData = unknown> {
  allowed: boolean;
  reasonCode: string;
  explanation: string;
  severity: RuleSeverity;

  sourceRuleRef?: RuleSourceRef;
  needsSource?: boolean;

  data?: TData;

  warnings?: RuleWarning[];
  requiredAudit?: RequiredAuditMetadata;
  suggestedEvents?: SuggestedMatchEvent[];
}
```

### 11.1 Rule Warning

```ts
export interface RuleWarning {
  code: string;
  message: string;
  sourceRuleRef?: RuleSourceRef;
}
```

### 11.2 Required Audit Metadata

```ts
export interface RequiredAuditMetadata {
  required: boolean;
  reasonRequired: boolean;
  oldValueRequired: boolean;
  newValueRequired: boolean;
  actorRequired: boolean;
  deviceRequired: boolean;
}
```

### 11.3 Suggested Match Event

Rules Engine อาจเสนอ event ที่ควร append แต่ไม่ควร append เอง

```ts
export interface SuggestedMatchEvent {
  eventType: string;
  payload: Record<string, unknown>;
  requiresConfirmation: boolean;
  requiresReason: boolean;
}
```

[SYSTEM RECOMMENDATION] การ append event เป็นหน้าที่ command handler/service layer ไม่ใช่ Rules Engine เพื่อให้ควบคุม transaction และ concurrency ได้ชัดเจน

---

## 12. Standard Reason Codes

ใช้ reason code แบบคงที่เพื่อให้ frontend, tests และ logs ตรวจได้

```txt
OK
NEEDS_SOURCE
RULE_PROFILE_UNSUPPORTED
MATCH_NOT_READY
MATCH_ALREADY_STARTED
MATCH_ALREADY_FINISHED
PERIOD_NOT_STARTED
PERIOD_ALREADY_STARTED
PERIOD_ALREADY_ENDED
PERIOD_CLOCK_NOT_EXPIRED
OVERTIME_NOT_REQUIRED
OVERTIME_REQUIRED
GAME_CLOCK_ALREADY_RUNNING
GAME_CLOCK_ALREADY_STOPPED
GAME_CLOCK_INVALID_VALUE
SHOT_CLOCK_DISABLED
SHOT_CLOCK_INVALID_RESET_CONTEXT
SHOT_CLOCK_RESET_24
SHOT_CLOCK_RESET_14
SHOT_CLOCK_CONTINUE
SHOT_CLOCK_OFF
TIMEOUT_AVAILABLE
TIMEOUT_QUOTA_EXCEEDED
TIMEOUT_NOT_ALLOWED_NOW
TEAM_FOUL_PENALTY_ACTIVE
TEAM_FOUL_PENALTY_NOT_ACTIVE
PLAYER_ACTIVE
PLAYER_FOULED_OUT
PLAYER_NOT_ON_MATCH_ROSTER
SCORE_VALUE_INVALID
POSSESSION_CHANGE_ALLOWED
DIRECTION_SWITCH_ALLOWED
CORRECTION_REASON_REQUIRED
CORRECTION_NOT_ALLOWED
MANUAL_OVERRIDE_REQUIRES_REASON
```

---

## 13. Match State Input

Rules Engine ต้องรับ `MatchState` ที่สร้างจาก projection หรือ replay ของ event stream

```ts
export type MatchStatus =
  | "SCHEDULED"
  | "ROSTER_CONFIRMED"
  | "READY"
  | "LIVE"
  | "PERIOD_BREAK"
  | "HALFTIME"
  | "OVERTIME_BREAK"
  | "FINISHED"
  | "CANCELLED";

export interface MatchState {
  matchId: string;
  ruleProfileId: string;
  status: MatchStatus;

  seqNo: number;

  teams: {
    homeTeamId: string;
    awayTeamId: string;
  };

  score: {
    home: number;
    away: number;
  };

  period: {
    currentPeriod: number;
    periodType: "REGULATION" | "OVERTIME";
    regulationPeriods: number;
    started: boolean;
    ended: boolean;
  };

  gameClock: ClockState;
  shotClock: ShotClockState;

  fouls: FoulState;
  timeouts: TimeoutState;
  possession: PossessionState;

  rosters: MatchRosterState;

  flags: {
    correctionMode: boolean;
    finalScoreConfirmed: boolean;
  };
}
```

---

## 14. Clock State

```ts
export interface ClockState {
  running: boolean;
  durationMs: number;
  remainingMs: number;
  startedAtServerMs?: number;
  lastStoppedAtServerMs?: number;
}
```

[SYSTEM RECOMMENDATION] สำหรับ Hostatom/Plesk/MariaDB architecture ให้ใช้ deadline-based clock model ห้ามใช้ backend `setInterval()` เป็น source of truth

---

## 15. Shot Clock State

```ts
export interface ShotClockState {
  enabled: boolean;
  running: boolean;
  visible: boolean;
  durationMs: number;
  remainingMs: number;
  startedAtServerMs?: number;
  lastStoppedAtServerMs?: number;
  lastResetReason?: string;
}
```

---

## 16. Foul State

```ts
export interface FoulState {
  teamFoulsByPeriod: Record<string, Record<number, number>>;
  playerFouls: Record<string, number>;
  fouledOutPlayerIds: string[];
}
```

---

## 17. Timeout State

```ts
export interface TimeoutState {
  grantedTimeouts: Array<{
    teamId: string;
    period: number;
    periodType: "REGULATION" | "OVERTIME";
    grantedAtGameClockMs: number;
    eventSeqNo: number;
  }>;
}
```

---

## 18. Possession State

```ts
export interface PossessionState {
  teamInControlId?: string;
  alternatingPossessionTeamId?: string;
  offensiveDirection: {
    home: "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT";
    away: "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT";
  };
}
```

---

## 19. Match Roster State

```ts
export interface MatchRosterState {
  activePlayerIdsByTeam: Record<string, string[]>;
  benchPlayerIdsByTeam: Record<string, string[]>;
  playerTeamMap: Record<string, string>;
}
```

---

# 20. Required Functions

## 20.1 `canStartMatch(matchState, ruleProfile)`

### Purpose

ตรวจว่าการเริ่ม match ทำได้หรือไม่

```ts
export function canStartMatch(
  matchState: MatchState,
  ruleProfile: RuleProfile
): RuleDecision<{
  nextStatus: MatchStatus;
}>;
```

### Validation

- match ต้องอยู่สถานะ `READY`
- ต้องมี home/away team
- ต้องมี rule profile ที่ approved/default
- ต้องไม่ใช่ match ที่จบแล้ว
- ต้องมี roster ขั้นต่ำตาม policy ของระบบ
- ต้องมี currentPeriod = 1

### Output Examples

```ts
{
  allowed: true,
  reasonCode: "OK",
  explanation: "Match can be started.",
  severity: "info",
  data: { nextStatus: "LIVE" }
}
```

```ts
{
  allowed: false,
  reasonCode: "MATCH_NOT_READY",
  explanation: "Match cannot start because roster or match setup is not confirmed.",
  severity: "error"
}
```

---

## 20.2 `canStartPeriod(matchState, ruleProfile)`

```ts
export function canStartPeriod(
  matchState: MatchState,
  ruleProfile: RuleProfile
): RuleDecision<{
  periodDurationMs: number;
  gameClockRemainingMs: number;
}>;
```

### Validation

- match status ต้องเป็น `LIVE`, `PERIOD_BREAK`, `HALFTIME`, หรือ `OVERTIME_BREAK`
- period ปัจจุบันต้องยังไม่ started
- ถ้าเป็น regulation period ใช้ `ruleProfile.game.periodDurationMs`
- ถ้าเป็น overtime ใช้ `ruleProfile.game.overtimeDurationMs`

### Projection Effect

เมื่อ command handler append `PERIOD_STARTED`:

```txt
period.started = true
gameClock.remainingMs = periodDurationMs or overtimeDurationMs
gameClock.running = false
shotClock.remainingMs = ruleProfile.shotClock.defaultMs
```

---

## 20.3 `canEndPeriod(matchState, ruleProfile)`

```ts
export function canEndPeriod(
  matchState: MatchState,
  ruleProfile: RuleProfile
): RuleDecision<{
  nextStatus: MatchStatus;
  nextPeriod?: number;
  shouldCheckOvertime: boolean;
}>;
```

### Validation

- period ต้อง started แล้ว
- period ต้องยังไม่ ended
- game clock ควรเหลือ 0 หรือ manual override ต้องมี reason
- ถ้ายังเหลือเวลา ต้องคืน `MANUAL_OVERRIDE_REQUIRES_REASON`

### Output Cases

```txt
OK
PERIOD_NOT_STARTED
PERIOD_ALREADY_ENDED
PERIOD_CLOCK_NOT_EXPIRED
MANUAL_OVERRIDE_REQUIRES_REASON
```

---

## 20.4 `shouldCreateOvertime(matchState, ruleProfile)`

```ts
export function shouldCreateOvertime(
  matchState: MatchState,
  ruleProfile: RuleProfile
): RuleDecision<{
  createOvertime: boolean;
  overtimePeriodNumber?: number;
  overtimeDurationMs?: number;
}>;
```

### [OFFICIAL RULE] FIBA Baseline

- เกมต้องมีผู้ชนะ
- ถ้าจบ regulation แล้วคะแนนเสมอ ต้องมี overtime
- overtime ระยะเวลา 5 นาที ตาม `RULES_PROFILE_FIBA.md`

### Validation

- ต้องจบ regulation period สุดท้ายแล้ว
- ถ้าคะแนนไม่เสมอ ไม่ต้องสร้าง overtime
- ถ้าคะแนนเสมอและ `requireWinner = true` ให้สร้าง overtime

### Output Cases

```txt
OVERTIME_REQUIRED
OVERTIME_NOT_REQUIRED
```

---

## 20.5 `canGrantTimeout(matchState, ruleProfile, teamId, context)`

```ts
export interface TimeoutRequestContext {
  requestedByRole: "ADMIN" | "REFEREE" | "SCORER" | "COACH" | string;
  requestedAtServerMs: number;
  gameClockRemainingMs: number;
  isDeadBall: boolean;
  requestingTeamId: string;
}

export function canGrantTimeout(
  matchState: MatchState,
  ruleProfile: RuleProfile,
  teamId: string,
  context: TimeoutRequestContext
): RuleDecision<{
  timeoutDurationMs: number;
  usedInFirstHalf: number;
  usedInSecondHalf: number;
  usedInCurrentOvertime: number;
  remainingInWindow: number;
}>;
```

### [OFFICIAL RULE] FIBA Baseline

ตาม `RULES_PROFILE_FIBA.md`:

```txt
first half: 2
second half: 3
last 2 minutes Q4: max 2
overtime: 1 per overtime
timeout duration: 60 seconds
```

### Validation

- teamId ต้องเป็น home หรือ away
- match ต้อง live หรืออยู่ช่วงที่กติกาอนุญาตให้ timeout
- ตรวจ quota ตาม half
- ตรวจ quota ช่วง 2 นาทีสุดท้าย Q4
- ตรวจ quota ต่อ overtime
- ถ้าข้อมูล dead ball / live ball ไม่พอ ให้คืน `NEEDS_SOURCE` หรือ `TIMEOUT_NOT_ALLOWED_NOW` ตาม policy

### Important Limitation

[NEEDS SOURCE] สิทธิ์ขอ timeout ตามสถานการณ์ live/dead ball และกรณีทีมที่เพิ่งทำคะแนนในช่วงท้ายเกม ต้องอ้างอิงรายละเอียด official rule + interpretation ก่อน implement automation เต็มรูปแบบ

### Output Cases

```txt
TIMEOUT_AVAILABLE
TIMEOUT_QUOTA_EXCEEDED
TIMEOUT_NOT_ALLOWED_NOW
NEEDS_SOURCE
```

---

## 20.6 `getTeamFoulPenaltyState(matchState, ruleProfile, teamId)`

```ts
export function getTeamFoulPenaltyState(
  matchState: MatchState,
  ruleProfile: RuleProfile,
  teamId: string
): RuleDecision<{
  period: number;
  teamFouls: number;
  threshold: number;
  penaltyActive: boolean;
  nextFoulWouldTriggerPenalty: boolean;
}>;
```

### [OFFICIAL RULE] FIBA Baseline

- Team foul penalty active หลังทีมทำ team fouls ครบ threshold ใน period นั้น
- Default threshold จาก `RULES_PROFILE_FIBA.md` คือ 4
- Overtime team fouls อาจต้องนับเป็นส่วนต่อของ Q4 ตาม profile

### Validation

- teamId ถูกต้อง
- period ถูกต้อง
- ใช้ `teamFoulsByPeriod`

### Output Cases

```txt
TEAM_FOUL_PENALTY_ACTIVE
TEAM_FOUL_PENALTY_NOT_ACTIVE
```

### Note

[SYSTEM RECOMMENDATION] Function นี้บอกแค่ penalty situation active หรือไม่ ยังไม่ควรตัดสิน free throws อัตโนมัติจนกว่าจะมี `FOUL_PENALTY_MATRIX.md`

---

## 20.7 `getPlayerFoulStatus(matchState, ruleProfile, playerId)`

```ts
export function getPlayerFoulStatus(
  matchState: MatchState,
  ruleProfile: RuleProfile,
  playerId: string
): RuleDecision<{
  playerId: string;
  fouls: number;
  foulLimit: number;
  fouledOut: boolean;
  nextFoulWouldFoulOut: boolean;
}>;
```

### [OFFICIAL RULE] FIBA Baseline

ผู้เล่น foul-out เมื่อทำครบ foul limit ตาม `RULES_PROFILE_FIBA.md` ซึ่ง default คือ 5 fouls

### Validation

- playerId ต้องอยู่ใน match roster
- ตรวจจำนวน fouls จาก projection
- ถ้า `fouls >= foulLimit` ถือว่า fouled out

### Output Cases

```txt
PLAYER_ACTIVE
PLAYER_FOULED_OUT
PLAYER_NOT_ON_MATCH_ROSTER
```

### Suggested Event

ถ้าหลัง append foul event แล้วผู้เล่นถึง limit ให้ command handler สามารถ append event ต่อเนื่อง:

```txt
PLAYER_FOULED_OUT
```

หรือให้ projection derive สถานะนี้จาก foul count ก็ได้ แต่ต้องตัดสินแบบเดียวทั้งระบบ

---

## 20.8 `canAddPlayerFoul(matchState, ruleProfile, playerId, foulContext)`

```ts
export interface PlayerFoulContext {
  teamId: string;
  foulType:
    | "PERSONAL"
    | "TECHNICAL"
    | "UNSPORTSMANLIKE"
    | "DISQUALIFYING"
    | "OFFENSIVE"
    | "UNKNOWN";
  countsAsTeamFoul?: boolean;
  occurredAtGameClockMs: number;
  reason?: string;
}

export function canAddPlayerFoul(
  matchState: MatchState,
  ruleProfile: RuleProfile,
  playerId: string,
  foulContext: PlayerFoulContext
): RuleDecision<{
  playerFoulsBefore: number;
  playerFoulsAfter: number;
  teamFoulsBefore?: number;
  teamFoulsAfter?: number;
  playerWillFoulOut: boolean;
  teamPenaltyAfterEvent?: boolean;
}>;
```

### Validation

- player อยู่ใน roster
- player ยังไม่ fouled out
- foul type ต้องอยู่ใน set ที่ระบบรองรับ
- ถ้า foul type มีผลซับซ้อนและยังไม่มี matrix ให้คืน warning `NEEDS_SOURCE`
- ถ้า correction mode อาจอนุญาตได้แต่ต้องมี reason

### Important Limitation

[NEEDS SOURCE] Technical, unsportsmanlike, disqualifying, fighting และ special situations ต้องใช้ `FOUL_PENALTY_MATRIX.md` ก่อน automation เต็มรูปแบบ

---

## 20.9 `canAddScore(matchState, ruleProfile, scoreContext)`

```ts
export interface ScoreContext {
  teamId: string;
  playerId?: string;
  points: 1 | 2 | 3;
  occurredAtGameClockMs: number;
  isCorrection?: boolean;
  reason?: string;
}

export function canAddScore(
  matchState: MatchState,
  ruleProfile: RuleProfile,
  context: ScoreContext
): RuleDecision<{
  scoreBefore: number;
  scoreAfter: number;
}>;
```

### Validation

- teamId ต้องเป็น home หรือ away
- points ต้องเป็น 1, 2, 3 เท่านั้น
- match ต้อง live หรือ correction mode
- ถ้าระบุ playerId ต้องอยู่ในทีมและ match roster
- ถ้า match finished แล้ว ต้องใช้ correction flow และ reason

### Output Cases

```txt
OK
SCORE_VALUE_INVALID
PLAYER_NOT_ON_MATCH_ROSTER
CORRECTION_REASON_REQUIRED
MATCH_ALREADY_FINISHED
```

---

## 20.10 `decideShotClockReset(context, matchState, ruleProfile)`

```ts
export type ShotClockResetDecision =
  | "RESET_24"
  | "RESET_14"
  | "CONTINUE"
  | "OFF";

export interface ShotClockResetContext {
  trigger:
    | "NEW_TEAM_CONTROL"
    | "BALL_HIT_RING"
    | "OFFENSIVE_REBOUND"
    | "DEFENSIVE_REBOUND"
    | "FOUL"
    | "VIOLATION"
    | "BALL_OUT_OF_BOUNDS"
    | "TIMEOUT"
    | "MANUAL_RESET"
    | "PERIOD_START"
    | "UNKNOWN";

  teamInControlId?: string;
  previousTeamInControlId?: string;

  throwInLocation?: "BACKCOURT" | "FRONTCOURT" | "THROW_IN_LINE" | "UNKNOWN";

  sameTeamRetainsPossession?: boolean;

  currentShotClockRemainingMs: number;
  gameClockRemainingMs: number;

  manualValueMs?: number;
  reason?: string;
}

export function decideShotClockReset(
  context: ShotClockResetContext,
  matchState: MatchState,
  ruleProfile: RuleProfile
): RuleDecision<{
  decision: ShotClockResetDecision;
  nextShotClockMs?: number;
  keepCurrentValue?: boolean;
}>;
```

### [OFFICIAL RULE] FIBA Baseline

Rules Engine ต้องรองรับอย่างน้อย:

```txt
- Reset 24
- Reset 14
- Continue / no reset
- Shot clock off ตาม context ที่ profile รองรับ
```

### Minimum Required Logic

```txt
PERIOD_START -> RESET_24
NEW_TEAM_CONTROL in backcourt -> RESET_24
OFFENSIVE_REBOUND after ball hit ring -> RESET_14
same team frontcourt throw-in after certain stoppages:
  - if remaining < 14 -> RESET_14
  - if remaining >= 14 -> CONTINUE
MANUAL_RESET -> requires reason unless triggered by allowed operator shortcut
UNKNOWN -> NEEDS_SOURCE / manual referee decision
```

### Output Cases

```txt
SHOT_CLOCK_RESET_24
SHOT_CLOCK_RESET_14
SHOT_CLOCK_CONTINUE
SHOT_CLOCK_OFF
SHOT_CLOCK_INVALID_RESET_CONTEXT
NEEDS_SOURCE
MANUAL_OVERRIDE_REQUIRES_REASON
```

### Hostatom-Friendly Clock Policy

[SYSTEM RECOMMENDATION] Function นี้ต้องคืน `nextShotClockMs` เท่านั้น ห้ามเริ่ม background timer เอง การ start/stop clock ให้ใช้ event + server timestamp + client-side rendering

---

## 20.11 `canChangePossession(matchState, ruleProfile, context)`

```ts
export interface PossessionChangeContext {
  fromTeamId?: string;
  toTeamId: string;
  trigger:
    | "MADE_BASKET"
    | "DEFENSIVE_REBOUND"
    | "TURNOVER"
    | "FOUL"
    | "VIOLATION"
    | "JUMP_BALL"
    | "ALTERNATING_POSSESSION"
    | "MANUAL_CORRECTION"
    | "UNKNOWN";
  reason?: string;
}

export function canChangePossession(
  matchState: MatchState,
  ruleProfile: RuleProfile,
  context: PossessionChangeContext
): RuleDecision<{
  previousTeamId?: string;
  nextTeamId: string;
}>;
```

### Validation

- toTeamId ต้องเป็น home หรือ away
- manual correction ต้องมี reason
- unknown trigger ต้อง warning หรือ needs source
- ไม่ควรเปลี่ยน possession ถ้า match ไม่ live ยกเว้น correction/setup

---

## 20.12 `canSwitchDirection(matchState, ruleProfile, context)`

```ts
export interface DirectionSwitchContext {
  trigger: "HALFTIME" | "MANUAL_SETUP" | "MANUAL_CORRECTION";
  reason?: string;
}

export function canSwitchDirection(
  matchState: MatchState,
  ruleProfile: RuleProfile,
  context: DirectionSwitchContext
): RuleDecision<{
  homeDirection: "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT";
  awayDirection: "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT";
}>;
```

### Validation

- automatic switch allowed only at configured timing
- manual correction requires reason
- UI ต้องแสดง confirmation เพราะมีผลต่อ public scoreboard

---

## 20.13 `canApplyCorrection(matchState, ruleProfile, correctionContext)`

```ts
export interface CorrectionContext {
  targetEventId?: string;
  correctionType:
    | "SCORE"
    | "FOUL"
    | "CLOCK"
    | "SHOT_CLOCK"
    | "TIMEOUT"
    | "POSSESSION"
    | "ROSTER"
    | "MATCH_RESULT"
    | "UNKNOWN";
  requestedByRole: string;
  reason?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export function canApplyCorrection(
  matchState: MatchState,
  ruleProfile: RuleProfile,
  context: CorrectionContext
): RuleDecision<{
  requiresApproval: boolean;
  requiresAuditLog: boolean;
  suggestedCompensatingEventType: string;
}>;
```

### Validation

- reason ต้องมีเสมอ
- actor ต้องมี permission
- correction ต้องไม่ mutate old event
- ต้องสร้าง compensating event
- post-game correction อาจต้อง admin approval

### Output Cases

```txt
OK
CORRECTION_REASON_REQUIRED
CORRECTION_NOT_ALLOWED
MANUAL_OVERRIDE_REQUIRES_REASON
```

---

# 21. Command Handler Integration

ทุก command handler ต้องใช้ flow นี้:

```txt
1. Authenticate actor
2. Authorize actor for match and command
3. Validate payload schema
4. Load current match projection/snapshot
5. Verify expectedSeq
6. Call Rules Engine
7. If not allowed -> reject command with RuleDecision
8. If allowed -> append event in transaction
9. Update snapshot/projection
10. Insert audit log if required
11. Return new state + seqNo
12. Broadcast or make available through polling endpoint
```

ตัวอย่าง:

```ts
async function handleAddScoreCommand(command: AddScoreCommand) {
  const actor = await auth.requireActor(command);
  await rbac.requirePermission(actor, "MATCH_SCORE_UPDATE", command.matchId);

  const state = await matchStateRepo.load(command.matchId);
  concurrency.assertExpectedSeq(state.seqNo, command.expectedSeq);

  const decision = rulesEngine.canAddScore(state, ruleProfile, command.payload);

  if (!decision.allowed) {
    return rejectCommand(command, decision);
  }

  return db.transaction(async (tx) => {
    const event = await eventStore.append(tx, {
      matchId: command.matchId,
      expectedSeq: command.expectedSeq,
      type: "SCORE_ADDED",
      payload: command.payload,
      actor,
      correlationId: command.correlationId,
      causationId: command.commandId,
    });

    await projections.apply(tx, event);

    return acceptCommand(event);
  });
}
```

---

# 22. Projection Integration

Rules Engine ต้องไม่ทำ projection เอง แต่ projection ต้องใช้ logic เดียวกันหรือ invariant เดียวกัน

```txt
match_events
  -> applyEvent()
  -> live_match_projection
  -> UI / API / polling / replay
```

Projection ต้อง rebuild ได้จาก event stream

```txt
drop live_match_projection
replay match_events
rebuild same state
```

Acceptance:

```txt
Live state after commands = Replay state from events
```

---

# 23. MariaDB / Hostatom Compatible Rules

เนื่องจาก deployment อาจอยู่บน Hostatom Shared Hosting + MariaDB:

- ห้ามพึ่ง long-running background worker สำหรับ clock
- ห้ามใช้ backend interval เป็น source of truth
- ใช้ HTTP command + polling-first realtime ได้
- ใช้ Socket.IO เป็น optional ถ้า host รองรับจริง
- ทุก state ต้องกู้คืนจาก MariaDB ได้
- ใช้ transaction เมื่อ append event และ update projection
- ใช้ `expectedSeq` เพื่อ optimistic concurrency
- ใช้ `command_id` เพื่อ idempotency

---

# 24. Event Suggestions by Rule Function

Rules Engine ไม่ append event เอง แต่สามารถเสนอ event ได้

| Function | Suggested Events |
|---|---|
| `canStartMatch` | `MATCH_STARTED` |
| `canStartPeriod` | `PERIOD_STARTED`, `GAME_CLOCK_SET`, `SHOT_CLOCK_RESET_24` |
| `canEndPeriod` | `PERIOD_ENDED`, `GAME_CLOCK_STOPPED`, `SHOT_CLOCK_STOPPED` |
| `shouldCreateOvertime` | `OVERTIME_CREATED` |
| `canGrantTimeout` | `TIMEOUT_GRANTED`, `GAME_CLOCK_STOPPED`, `SHOT_CLOCK_STOPPED` |
| `canAddScore` | `SCORE_ADDED` |
| `canAddPlayerFoul` | `PLAYER_FOUL_ADDED`, `TEAM_FOUL_ADDED`, `PLAYER_FOULED_OUT` |
| `decideShotClockReset` | `SHOT_CLOCK_RESET_24`, `SHOT_CLOCK_RESET_14`, `SHOT_CLOCK_CONTINUED`, `SHOT_CLOCK_OFF` |
| `canApplyCorrection` | `CORRECTION_APPLIED`, domain-specific compensating event |

---

# 25. Permission Requirements by Rule Area

| Rule Area | Permission |
|---|---|
| Start match | `match.start` |
| Start/stop clock | `match.clock.operate` |
| Set clock manually | `match.clock.correct` |
| Reset shot clock | `match.shotClock.operate` |
| Set shot clock manually | `match.shotClock.correct` |
| Add score | `match.score.operate` |
| Correct score | `match.score.correct` |
| Add foul | `match.foul.operate` |
| Correct foul | `match.foul.correct` |
| Grant timeout | `match.timeout.operate` |
| Change possession | `match.possession.operate` |
| Switch direction | `match.direction.operate` |
| Apply correction | `match.correction.apply` |
| Post-game correction | `match.correction.postGame` |

[SYSTEM RECOMMENDATION] Permission ต้องถูก enforce ใน API/socket layer ก่อน Rules Engine แต่ Rules Engine สามารถคืน `requiredAudit` หรือ `requiresApproval` เพิ่มเติมได้

---

# 26. Error Response Contract

เมื่อ Rules Engine reject command ให้ API/socket คืนรูปแบบเดียวกัน:

```ts
export interface CommandRejectedResponse {
  type: "COMMAND_REJECTED";
  commandId: string;
  matchId: string;
  currentSeq: number;
  reasonCode: string;
  explanation: string;
  severity: RuleSeverity;
  sourceRuleRef?: RuleSourceRef;
  needsSource?: boolean;
  warnings?: RuleWarning[];
}
```

---

# 27. UI Mapping

Frontend ต้อง map `reasonCode` เป็นข้อความที่ operator เข้าใจง่าย

ตัวอย่าง:

| reasonCode | Operator message |
|---|---|
| `TIMEOUT_QUOTA_EXCEEDED` | ทีมนี้ใช้ time-out ครบโควตาแล้ว |
| `PLAYER_FOULED_OUT` | ผู้เล่นคนนี้ฟาวล์ครบ limit แล้ว |
| `CORRECTION_REASON_REQUIRED` | การแก้ไขต้องระบุเหตุผล |
| `INVALID_EXPECTED_SEQ` | สถานะเกมเปลี่ยนไปแล้ว กรุณา sync ใหม่ |
| `NEEDS_SOURCE` | ยังไม่มีแหล่งกติกายืนยัน ต้องให้ผู้ตัดสิน/ผู้จัดตัดสินใจ |

---

# 28. Test Requirements

ทุก function ใน Rules Engine ต้องมี unit tests

## 28.1 Required Unit Tests

```txt
canStartMatch
- ready match can start
- scheduled match without roster cannot start
- finished match cannot start

canEndPeriod
- period can end when clock is 0
- period cannot end while clock remains unless override reason exists
- already ended period cannot end again

shouldCreateOvertime
- tied final regulation creates overtime
- non-tied final regulation does not create overtime
- tied overtime creates another overtime if requireWinner true

canGrantTimeout
- first half quota allows within limit
- first half quota rejects after limit
- second half quota allows within limit
- last two minutes Q4 limit rejects after max
- overtime quota allows one per overtime
- overtime quota rejects second timeout in same overtime

getTeamFoulPenaltyState
- below threshold is not active
- at threshold is active
- overtime mapping follows rule profile

getPlayerFoulStatus
- below foul limit active
- at foul limit fouled out
- unknown player rejected

canAddScore
- valid 1/2/3 points allowed
- invalid points rejected
- finished match requires correction flow

decideShotClockReset
- period start resets 24
- new backcourt control resets 24
- offensive rebound after ring resets 14
- frontcourt same-team with less than 14 resets 14
- frontcourt same-team with 14 or more continues
- unknown trigger returns needs source or manual decision
```

## 28.2 Integration Tests

```txt
- Command accepted appends event and updates projection
- Command rejected appends no event
- Duplicate command returns existing result
- Concurrent commands with same expectedSeq: only one wins
- Rebuild projection from events equals live projection
- Correction creates compensating event and audit log
```

## 28.3 E2E Tests

```txt
- Full regulation game flow
- Overtime after tied score
- Score correction after wrong team score
- Foul correction after wrong player foul
- Timeout quota rejection
- Shot clock reset 24/14/continue
- Operator reconnect with lastEventSeq
- Public scoreboard receives updated state through polling
```

---

# 29. Edge Cases

Rules Engine ต้องพิจารณา edge cases อย่างน้อย:

```txt
- Operator กด score ผิดทีม
- Operator กด foul ผิดผู้เล่น
- Score correction หลังจบ period
- Score correction หลังจบ match
- Player foul reaches limit
- Team foul reaches penalty threshold
- Timeout requested when quota is used up
- Timeout requested in last two minutes Q4
- Shot clock reset wrong value
- Possession changed manually
- Direction switch performed at wrong time
- Clock stopped late
- Clock manually set backward/forward
- Two operators send commands at same expectedSeq
- Client reconnects with stale state
- Replay projection differs from live projection
```

---

# 30. Implementation File Structure

Recommended implementation:

```txt
/src
  /rules
    index.ts
    types.ts
    rule-decision.ts
    rule-profile.ts
    fiba-profile.ts

    /match
      can-start-match.ts
      can-start-period.ts
      can-end-period.ts
      should-create-overtime.ts

    /clock
      can-start-game-clock.ts
      can-stop-game-clock.ts
      can-set-game-clock.ts

    /shot-clock
      decide-shot-clock-reset.ts
      can-start-shot-clock.ts
      can-stop-shot-clock.ts
      can-set-shot-clock.ts

    /score
      can-add-score.ts
      can-correct-score.ts

    /foul
      get-team-foul-penalty-state.ts
      get-player-foul-status.ts
      can-add-player-foul.ts

    /timeout
      can-grant-timeout.ts

    /possession
      can-change-possession.ts
      can-switch-direction.ts

    /correction
      can-apply-correction.ts

  /rules/__tests__
    can-start-match.test.ts
    can-end-period.test.ts
    overtime.test.ts
    timeout.test.ts
    team-foul.test.ts
    player-foul.test.ts
    shot-clock-reset.test.ts
    correction.test.ts
```

---

# 31. Coding Rules for AI Agent

AI agent ต้องทำตามนี้:

```txt
- Start with types first.
- Add tests before or together with implementation.
- Do not mix rules with API controller.
- Do not mix rules with React component.
- Do not query database inside rule functions.
- Do not use Date.now() directly inside pure rules.
- Pass server time from command handler.
- Never mutate input matchState.
- Return new decision object.
- Use exhaustive switch for rule triggers.
- Unknown trigger must not silently pass.
- All manual overrides require reason.
```

---

# 32. Example: Pure Function Pattern

```ts
export function getPlayerFoulStatus(
  matchState: MatchState,
  ruleProfile: RuleProfile,
  playerId: string
): RuleDecision<PlayerFoulStatusData> {
  if (!matchState.rosters.playerTeamMap[playerId]) {
    return {
      allowed: false,
      reasonCode: "PLAYER_NOT_ON_MATCH_ROSTER",
      explanation: "Player is not listed in the match roster.",
      severity: "error",
    };
  }

  const fouls = matchState.fouls.playerFouls[playerId] ?? 0;
  const foulLimit = ruleProfile.foul.playerFoulLimit;
  const fouledOut = fouls >= foulLimit;

  return {
    allowed: !fouledOut,
    reasonCode: fouledOut ? "PLAYER_FOULED_OUT" : "PLAYER_ACTIVE",
    explanation: fouledOut
      ? "Player has reached the foul limit."
      : "Player is still eligible to play.",
    severity: fouledOut ? "warning" : "info",
    data: {
      playerId,
      fouls,
      foulLimit,
      fouledOut,
      nextFoulWouldFoulOut: fouls + 1 >= foulLimit,
    },
  };
}
```

---

# 33. Definition of Done

Rules Engine feature ถือว่าเสร็จเมื่อ:

```txt
- มี type definitions
- มี pure function implementation
- มี unit tests ครอบคลุม allowed/rejected/edge cases
- มี reasonCode ทุก branch
- มี sourceRuleRef สำหรับ official rules
- unknown/unsupported case คืน NEEDS_SOURCE
- command handler ใช้ function จริง
- rejected command ไม่ append event
- accepted command append event แบบ transaction
- projection rebuild ยังได้ผลถูกต้อง
- documentation updated
```

---

# 34. Next Required Files

หลังจากไฟล์นี้ ควรสร้างไฟล์ต่อไปนี้:

```txt
DOMAIN_MODEL.md
EVENT_MODEL.md
PROJECTION_MODEL.md
DATABASE_SCHEMA.md
API_CONTRACTS.md
SOCKET_CONTRACTS.md
TEST_PLAN.md
EDGE_CASES.md
FOUL_PENALTY_MATRIX.md
```

[SYSTEM RECOMMENDATION] ไฟล์ `FOUL_PENALTY_MATRIX.md` ควรทำก่อน automate penalty/free throw/possession consequence ของ foul types ที่ซับซ้อน

