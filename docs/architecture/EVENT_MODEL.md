# EVENT_MODEL.md

> สถานะ: Draft สำหรับ AI Coding Agent  
> ระบบ: Basketball Scoreboard + Tournament Management Web Application  
> สถาปัตยกรรมหลัก: Event Sourcing + Projection + Audit Trail  
> Default rules profile: FIBA  
> Database target: MariaDB/InnoDB บน Hostatom/Plesk-compatible architecture  
> Realtime target: Polling-first with optional Socket.IO/WebSocket when hosting supports it

---

## 0. Purpose

ไฟล์นี้เป็นสัญญากลางของระบบ **Match Event Model** สำหรับให้ AI Coding Agent ใช้ออกแบบและเขียนโค้ดโดยไม่เดาเอง

เป้าหมายของไฟล์นี้คือกำหนดว่า:

- เหตุการณ์ของการแข่งขันบาสเกตบอลต้องเก็บอย่างไร
- event ไหนเป็น source of truth
- payload ของ event ต้องมีอะไร
- validation ต้องตรวจอะไร
- projection ต้องเปลี่ยน state อย่างไร
- permission ใดใช้ event ไหนได้
- correction / undo ต้องทำอย่างไรโดยไม่ทำลายประวัติ
- MariaDB ต้องเก็บ event stream อย่างไรให้ปลอดภัย
- realtime client ต้อง sync event อย่างไรเมื่อหลุด connection

[SYSTEM RECOMMENDATION] ระบบนี้ต้องถือว่า `match_events` คือ **source of truth** ส่วน scoreboard, foul dashboard, clock dashboard, summary, replay และ tournament standings เป็นเพียง projection/read model ที่ rebuild ได้

---

## 1. Core Principle

## 1.1 Match Events Are the Source of Truth

หนึ่งแมตช์ต้องมี event stream เดียวที่เรียงลำดับแน่นอน

```txt
Match
 └─ match_events
     ├─ seq_no = 1
     ├─ seq_no = 2
     ├─ seq_no = 3
     └─ ...
```

ทุก state ที่แสดงบน UI ต้องสามารถคำนวณย้อนกลับจาก `match_events` ได้ เช่น:

- score
- period
- game clock
- shot clock
- team fouls
- player fouls
- timeout usage
- possession
- direction
- match status
- correction history
- replay timeline
- match summary

## 1.2 Event Stream Rule

```txt
One match = one ordered append-only event stream.
```

ห้ามมี event stream แยกสำหรับ score, foul, clock แบบต่างคนต่างเดิน เพราะจะทำให้ sequence, replay และ correction สับสน

---

## 2. Non-Negotiable Event Rules

AI Agent ต้องทำตามกฎต่อไปนี้ทุกครั้ง:

1. ห้าม update historical event
2. ห้าม delete historical event
3. ห้าม rewrite `seq_no`
4. ห้ามใช้ mutable `scoreboard_state` เป็น source of truth
5. ห้ามให้ client ส่งคะแนน/foul/clock state แล้วเชื่อทันที
6. ทุก command ต้อง validate server-side
7. ทุก accepted command ต้อง append event
8. rejected command ห้าม append domain event แต่ควร log security/validation event ในระบบ log
9. correction ต้องใช้ compensating event
10. correction ต้องมี reason
11. correction ต้องเก็บ actor, role, device, timestamp, old value, new value, correlationId, causationId และ event sequence
12. projection ต้อง rebuild ได้จาก event stream
13. snapshot เป็น optimization เท่านั้น ไม่ใช่ source of truth
14. socket/polling broadcast เป็น delivery mechanism เท่านั้น ไม่ใช่ persistence
15. ทุก event ต้องมี `ruleProfileId`
16. ถ้า event มีผลจากกติกาทางการ ต้องมี `sourceRuleRef` หรือคืน `[NEEDS SOURCE]`
17. ถ้าไม่แน่ใจว่ากติกาถูกต้อง ห้าม implement แบบเดา

---

## 3. Statement Labels

ใช้ label ต่อไปนี้ใน comment, documentation และ agent output:

- `[OFFICIAL RULE]` สำหรับกติกาที่ตรวจสอบได้จากเอกสารทางการ
- `[SYSTEM RECOMMENDATION]` สำหรับข้อเสนอด้าน architecture, UX, database, API, security หรือ QA
- `[ASSUMPTION]` สำหรับ decision ที่ยังไม่มี source ทางการหรือยังรอ Product Owner ยืนยัน
- `[NEEDS SOURCE]` เมื่อ rule หรือ regulation ยังไม่มีเอกสารยืนยัน

---

## 4. Event Stream

## 4.1 Event Ordering

ทุก event ใน match เดียวกันต้องเรียงด้วย `seqNo`

```ts
type SeqNo = number; // starts at 1, increases by 1
```

กฎ:

- match แรกเริ่มยังไม่มี event หรือ `lastSeqNo = 0`
- event แรกต้องเป็น `seqNo = 1`
- event ถัดไปต้องเป็น `lastSeqNo + 1`
- ห้าม skip sequence
- ห้าม duplicate `seqNo` ใน match เดียวกัน
- ต้องมี unique constraint: `(match_id, seq_no)`

## 4.2 Optimistic Concurrency

ทุก command จาก client/operator ต้องส่ง `expectedSeq`

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

server ต้องตรวจ:

```txt
if command.expectedSeq !== currentMatch.lastSeqNo:
    reject command with INVALID_EXPECTED_SEQ
```

[SYSTEM RECOMMENDATION] วิธีนี้ป้องกัน scorer สองคนกดคำสั่งพร้อมกันแล้ว state ชนกัน

## 4.3 Command Idempotency

ทุก command ต้องมี `commandId`

ต้องมี unique constraint:

```txt
unique(match_id, command_id)
```

ถ้า client ส่ง command เดิมซ้ำ:

- ห้าม append event ซ้ำ
- return result เดิมถ้ามีได้
- ถ้า result เดิมหาไม่ได้ ให้ return `DUPLICATE_COMMAND`

---

## 5. Event Metadata

ทุก event ต้องมี metadata อย่างน้อยต่อไปนี้:

```ts
type MatchEvent<TPayload = unknown> = {
  eventId: string;
  matchId: string;
  seqNo: number;

  eventType: MatchEventType;
  payload: TPayload;

  actorUserId: string | null;
  actorRole: ActorRole;
  actorDisplayName?: string;
  deviceId: string | null;

  occurredAt: string;
  recordedAt: string;

  correlationId: string;
  causationId: string | null;
  commandId: string | null;
  expectedSeq: number | null;

  ruleProfileId: string;
  sourceRuleRef?: string | null;

  reason?: string | null;

  schemaVersion: number;
  appVersion?: string | null;

  isCorrection: boolean;
  correctedEventId?: string | null;

  metadata?: Record<string, unknown>;
};
```

## 5.1 Metadata Field Definitions

| Field | Required | Meaning |
|---|---:|---|
| `eventId` | yes | unique event id เช่น UUID/ULID |
| `matchId` | yes | match ที่ event นี้อยู่ |
| `seqNo` | yes | ลำดับ event ภายใน match |
| `eventType` | yes | ชนิด event |
| `payload` | yes | ข้อมูลเฉพาะของ event |
| `actorUserId` | conditional | user ที่ทำ action; public/system อาจเป็น null |
| `actorRole` | yes | role ณ เวลาที่ทำ event |
| `deviceId` | conditional | อุปกรณ์ operator/public/admin |
| `occurredAt` | yes | เวลาที่เกิด action ตาม server หรือ trusted source |
| `recordedAt` | yes | เวลาที่ event ถูกบันทึกลง DB |
| `correlationId` | yes | id เชื่อม request/command flow |
| `causationId` | conditional | event/command ที่ทำให้ event นี้เกิด |
| `commandId` | conditional | command id จาก client |
| `expectedSeq` | conditional | expected sequence จาก command |
| `ruleProfileId` | yes | rules profile ที่ใช้ validate event |
| `sourceRuleRef` | optional | reference กติกาที่เกี่ยวข้อง |
| `reason` | required for correction | เหตุผล correction/manual override |
| `schemaVersion` | yes | event schema version |
| `appVersion` | optional | version ของ app ตอนสร้าง event |
| `isCorrection` | yes | event นี้เป็น correction หรือไม่ |
| `correctedEventId` | conditional | event เดิมที่ถูกแก้ |
| `metadata` | optional | auxiliary info ที่ไม่ควรใช้เป็น state หลัก |

## 5.2 Time Fields

[SYSTEM RECOMMENDATION] สำหรับระบบบน Shared Hosting/Plesk ให้ใช้ server timestamp เป็นหลัก

- `occurredAt` = เวลาที่ server รับรองว่า action เกิด
- `recordedAt` = เวลาที่ insert database สำเร็จ
- `clientTimestamp` ใช้เพื่อ debug เท่านั้น ห้ามใช้ตัดสิน state หลัก

---

## 6. Actor Roles

```ts
type ActorRole =
  | 'ADMIN'
  | 'REFEREE'
  | 'SCORER'
  | 'TIMER'
  | 'SHOT_CLOCK_OPERATOR'
  | 'VIEWER'
  | 'PUBLIC_DISPLAY'
  | 'SYSTEM';
```

กฎ:

- `PUBLIC_DISPLAY` ห้ามสร้าง command event
- `VIEWER` ห้ามสร้าง command event
- `SYSTEM` ใช้กับ event ที่ระบบสร้าง เช่น projection rebuild marker, migration marker หรือ scheduled sync
- operator roles ต้องถูก assign กับ match ก่อนจึงทำ live command ได้

---

## 7. Event Type Naming Convention

Event type ใช้รูปแบบ:

```txt
DOMAIN_ACTION_PAST_TENSE
```

ตัวอย่าง:

```txt
SCORE_ADDED
GAME_CLOCK_STARTED
PLAYER_FOUL_ADDED
TIMEOUT_GRANTED
CORRECTION_APPLIED
```

กฎ:

- ใช้ past tense เพราะ event คือสิ่งที่เกิดขึ้นแล้ว
- ห้ามใช้ชื่อ command เป็น event เช่น `ADD_SCORE`
- ห้ามใช้ชื่อกำกวม เช่น `UPDATE_STATE`
- ห้ามใช้ event ใหญ่เกินไป เช่น `MATCH_UPDATED`
- event ต้องมีความหมายโดเมนชัดเจน

---

## 8. Event Categories

```txt
Match Lifecycle Events
Period Events
Game Clock Events
Shot Clock Events
Score Events
Foul Events
Timeout Events
Possession Events
Direction Events
Roster Events
Correction Events
Replay/Audit Events
Tournament Result Events
System Events
```

---

# 9. Event Catalog

## 9.1 Match Lifecycle Events

### MATCH_CREATED

ใช้เมื่อสร้าง match

```ts
type MatchCreatedPayload = {
  tournamentId: string | null;
  stageId?: string | null;
  groupId?: string | null;
  homeTeamId: string;
  awayTeamId: string;
  scheduledStartAt?: string | null;
  venueId?: string | null;
  courtId?: string | null;
  ruleProfileId: string;
};
```

Validation:

- `homeTeamId !== awayTeamId`
- `ruleProfileId` ต้องมีอยู่จริง
- match ต้องยังไม่เคยมี event
- permission: `match:create`

Projection effect:

- create match projection
- status = `SCHEDULED`
- score = 0-0
- currentPeriod = 0
- lastSeqNo = event.seqNo

Audit:

- required

---

### MATCH_READY_SET

ใช้เมื่อ match ถูก mark ว่าพร้อมเริ่ม

```ts
type MatchReadySetPayload = {
  readyByUserId: string;
  checkedItems: {
    teamsConfirmed: boolean;
    rostersConfirmed: boolean;
    officialsConfirmed: boolean;
    ruleProfileConfirmed: boolean;
    scoreboardConnected?: boolean;
  };
};
```

Validation:

- match status ต้องเป็น `SCHEDULED` หรือ `PRE_GAME`
- roster ต้องพร้อมตาม policy ของ tournament
- permission: `match:prepare`

Projection effect:

- status = `READY`

Audit:

- required

---

### MATCH_STARTED

```ts
type MatchStartedPayload = {
  startedAt: string;
  startingPeriod: 1;
};
```

Validation:

- match status ต้องเป็น `READY`
- period ต้องเป็น 1
- permission: `match:operate_clock`

Projection effect:

- status = `LIVE`
- currentPeriod = 1
- periodType = `REGULATION`
- gameClock.remainingMs = ruleProfile.periodDurationSeconds * 1000

Audit:

- required

---

### MATCH_SUSPENDED

```ts
type MatchSuspendedPayload = {
  suspendedAt: string;
  reason: string;
};
```

Validation:

- reason required
- match status ต้องเป็น `LIVE`
- permission: `match:suspend`

Projection effect:

- status = `SUSPENDED`
- clocks stopped

Audit:

- required

---

### MATCH_RESUMED

```ts
type MatchResumedPayload = {
  resumedAt: string;
  reason?: string;
};
```

Validation:

- match status ต้องเป็น `SUSPENDED`
- permission: `match:suspend`

Projection effect:

- status = `LIVE`

Audit:

- required

---

### MATCH_FINISHED

```ts
type MatchFinishedPayload = {
  finishedAt: string;
  finalHomeScore: number;
  finalAwayScore: number;
  resultStatus: 'DRAFT' | 'OFFICIAL';
};
```

Validation:

- match status ต้องเป็น `LIVE` หรือ `PENDING_FINAL_REVIEW`
- score must not be tied unless tournament allows draw
- if tied under FIBA normal profile -> must create overtime instead
- permission: `match:finish`

Projection effect:

- status = `FINISHED` หรือ `OFFICIAL` ตาม workflow
- freeze live operator controls except correction/admin flow

Audit:

- required

---

### MATCH_RESULT_OFFICIALIZED

```ts
type MatchResultOfficializedPayload = {
  officializedAt: string;
  officialHomeScore: number;
  officialAwayScore: number;
  approvedByUserId: string;
};
```

Validation:

- match status ต้องเป็น `FINISHED`
- permission: `match:officialize`

Projection effect:

- status = `OFFICIAL`
- tournament standings projection can update

Audit:

- required

---

## 9.2 Period Events

### PERIOD_STARTED

```ts
type PeriodStartedPayload = {
  periodNumber: number;
  periodType: 'REGULATION' | 'OVERTIME';
  durationMs: number;
  startedAt: string;
};
```

Validation:

- period sequence must be valid
- cannot start period if previous period still live
- permission: `match:operate_clock`

Projection effect:

- currentPeriod set
- period status = `LIVE`
- gameClock.remainingMs = durationMs
- shotClock may be reset based on possession policy

Audit:

- required

---

### PERIOD_ENDED

```ts
type PeriodEndedPayload = {
  periodNumber: number;
  periodType: 'REGULATION' | 'OVERTIME';
  endedAt: string;
  homeScoreAtEnd: number;
  awayScoreAtEnd: number;
};
```

Validation:

- period must be current
- game clock should be 0 or manual end reason required
- permission: `match:operate_clock`
- if Q4 ends tied under FIBA normal profile, next decision should be overtime

Projection effect:

- period status = `ENDED`
- gameClock stopped
- shotClock stopped
- period summary updated

Audit:

- required

---

### OVERTIME_STARTED

```ts
type OvertimeStartedPayload = {
  overtimeNumber: number;
  durationMs: number;
  startedAt: string;
};
```

Validation:

- regulation ended
- score tied
- ruleProfile allows overtime
- permission: `match:operate_clock`

Projection effect:

- currentPeriod = 4 + overtimeNumber
- periodType = `OVERTIME`
- gameClock.remainingMs = overtimeDuration
- overtime timeout quota initialized

Audit:

- required

---

## 9.3 Game Clock Events

[SYSTEM RECOMMENDATION] ระบบนี้ต้องใช้ **deadline-based clock model** ไม่ใช้ backend `setInterval()` update DB ทุกวินาที

### GAME_CLOCK_SET

```ts
type GameClockSetPayload = {
  periodNumber: number;
  previousRemainingMs: number;
  newRemainingMs: number;
  reason: string;
};
```

Validation:

- `newRemainingMs >= 0`
- `newRemainingMs <= periodDurationMs`
- reason required
- permission: `match:correct_clock` หรือ `match:operate_clock` ตาม mode

Projection effect:

- gameClock.remainingMs = newRemainingMs
- gameClock.isRunning = false
- gameClock.startedAt = null

Audit:

- required
- old value and new value required

---

### GAME_CLOCK_STARTED

```ts
type GameClockStartedPayload = {
  periodNumber: number;
  remainingMsAtStart: number;
  serverStartedAt: string;
};
```

Validation:

- match status = `LIVE`
- period status = `LIVE`
- gameClock.isRunning = false
- remainingMsAtStart > 0
- permission: `match:operate_clock`

Projection effect:

```txt
gameClock.isRunning = true
gameClock.remainingMsAtStart = remainingMsAtStart
gameClock.serverStartedAt = serverStartedAt
```

Display calculation:

```txt
remaining = remainingMsAtStart - (nowServerSynced - serverStartedAt)
```

Audit:

- required

---

### GAME_CLOCK_STOPPED

```ts
type GameClockStoppedPayload = {
  periodNumber: number;
  remainingMsAtStop: number;
  serverStoppedAt: string;
  stopReason:
    | 'OFFICIAL_WHISTLE'
    | 'TIMEOUT'
    | 'PERIOD_END'
    | 'OPERATOR_MANUAL'
    | 'CORRECTION'
    | 'SYSTEM';
};
```

Validation:

- gameClock.isRunning = true
- remainingMsAtStop >= 0
- permission: `match:operate_clock`

Projection effect:

```txt
gameClock.isRunning = false
gameClock.remainingMs = remainingMsAtStop
gameClock.serverStartedAt = null
```

Audit:

- required

---

### GAME_CLOCK_EXPIRED_CONFIRMED

```ts
type GameClockExpiredConfirmedPayload = {
  periodNumber: number;
  confirmedAt: string;
  remainingMs: 0;
};
```

Validation:

- computed clock <= 0
- permission: `match:operate_clock`

Projection effect:

- gameClock.remainingMs = 0
- gameClock.isRunning = false
- period may become `PENDING_END_CONFIRMATION`

Audit:

- required

---

## 9.4 Shot Clock Events

[SYSTEM RECOMMENDATION] Shot clock ต้องใช้ deadline-based model เช่นเดียวกับ game clock

RM-04 bounded implementation profile:

- The implemented/authorized shot-clock events are `SHOT_CLOCK_RESET` and `SHOT_CLOCK_SET` only.
- Reset 14 and Reset 24 are explicit operator-selected commands; the payload enum is server validated.
- `SHOT_CLOCK_STARTED` and `SHOT_CLOCK_STOPPED` below describe a broader future model and are not authorized for
  RM-04 implementation, API endpoints, or UI controls.
- Automatic/context-aware 14/24 selection is deferred and must not be inferred from this event catalog.
- `[NEEDS SOURCE] Missing governing document: authoritative FIBA shot-clock operational rules required for
  automatic/context-aware 14/24 reset decisions.`
- `SHOT_CLOCK_SET` is correction-style: explicit confirmation, a non-empty server-validated reason, and audit are
  mandatory. It remains authorized by the existing shot-clock operation capability.

### SHOT_CLOCK_SET

```ts
type ShotClockSetPayload = {
  previousRemainingMs: number | null;
  newRemainingMs: number | null;
  reason: string;
};
```

Validation:

- reason required
- `newRemainingMs` can be null only when shot clock is off
- permission: `match:operate_shot_clock`

Projection effect:

- shotClock.remainingMs = newRemainingMs
- shotClock.isRunning = false

Audit:

- required

---

### SHOT_CLOCK_STARTED

```ts
type ShotClockStartedPayload = {
  remainingMsAtStart: number;
  serverStartedAt: string;
};
```

Validation:

- shotClock.isRunning = false
- remainingMsAtStart > 0
- permission: `match:operate_shot_clock`

Projection effect:

- shotClock.isRunning = true
- shotClock.remainingMsAtStart = remainingMsAtStart
- shotClock.serverStartedAt = serverStartedAt

Audit:

- required

---

### SHOT_CLOCK_STOPPED

```ts
type ShotClockStoppedPayload = {
  remainingMsAtStop: number;
  serverStoppedAt: string;
  stopReason:
    | 'GAME_CLOCK_STOPPED'
    | 'BALL_DEAD'
    | 'SHOT_CLOCK_VIOLATION'
    | 'OPERATOR_MANUAL'
    | 'CORRECTION'
    | 'SYSTEM';
};
```

Validation:

- shotClock.isRunning = true
- permission: `match:operate_shot_clock`

Projection effect:

- shotClock.isRunning = false
- shotClock.remainingMs = remainingMsAtStop

Audit:

- required

---

### SHOT_CLOCK_RESET_24

```ts
type ShotClockReset24Payload = {
  previousRemainingMs: number | null;
  newRemainingMs: 24000;
  reasonCode:
    | 'NEW_TEAM_CONTROL_BACKCOURT'
    | 'CHANGE_OF_POSSESSION'
    | 'BALL_LEGALLY_TOUCHES_RING_AND_OPPONENT_CONTROL'
    | 'MANUAL_REFEREE_DECISION'
    | 'CORRECTION';
  sourceContext?: ShotClockDecisionContext;
};
```

Validation:

- must be allowed by `decideShotClockReset`
- if manual referee decision, reason required
- permission: `match:operate_shot_clock`

Projection effect:

- shotClock.remainingMs = 24000
- shotClock.isRunning = false unless restart requested separately

Audit:

- required

---

### SHOT_CLOCK_RESET_14

```ts
type ShotClockReset14Payload = {
  previousRemainingMs: number | null;
  newRemainingMs: 14000;
  reasonCode:
    | 'OFFENSIVE_REBOUND_AFTER_RING'
    | 'SAME_TEAM_FRONTCOURT_RESET'
    | 'FRONTCOURT_THROW_IN_AFTER_FOUL_OR_VIOLATION'
    | 'MANUAL_REFEREE_DECISION'
    | 'CORRECTION';
  sourceContext?: ShotClockDecisionContext;
};
```

Validation:

- must be allowed by `decideShotClockReset`
- if manual referee decision, reason required
- permission: `match:operate_shot_clock`

Projection effect:

- shotClock.remainingMs = 14000
- shotClock.isRunning = false unless restart requested separately

Audit:

- required

---

### SHOT_CLOCK_CONTINUED

```ts
type ShotClockContinuedPayload = {
  remainingMs: number;
  reasonCode:
    | 'SAME_TEAM_FRONTCOURT_WITH_14_OR_MORE'
    | 'NO_CHANGE_OF_CONTROL'
    | 'DEFENSIVE_TOUCH_OUT_OF_BOUNDS'
    | 'MANUAL_REFEREE_DECISION';
  sourceContext?: ShotClockDecisionContext;
};
```

Validation:

- must be allowed by rules engine
- permission: `match:operate_shot_clock`

Projection effect:

- shotClock.remainingMs unchanged
- shotClock status unchanged unless specified

Audit:

- required

---

### SHOT_CLOCK_TURNED_OFF

```ts
type ShotClockTurnedOffPayload = {
  previousRemainingMs: number | null;
  reasonCode:
    | 'GAME_CLOCK_LESS_THAN_SHOT_CLOCK_THRESHOLD'
    | 'PERIOD_END'
    | 'MANUAL_REFEREE_DECISION';
};
```

Validation:

- ruleProfile must allow shot clock off in context
- permission: `match:operate_shot_clock`

Projection effect:

- shotClock.isVisible = false
- shotClock.remainingMs = null
- shotClock.isRunning = false

Audit:

- required

---

## 9.5 Score Events

### SCORE_ADDED

```ts
type ScoreAddedPayload = {
  teamId: string;
  playerId?: string | null;
  points: 1 | 2 | 3;
  periodNumber: number;
  gameClockRemainingMs: number;
  scoreBefore: {
    home: number;
    away: number;
  };
  scoreAfter: {
    home: number;
    away: number;
  };
  scoringMethod:
    | 'FREE_THROW'
    | 'TWO_POINT_FIELD_GOAL'
    | 'THREE_POINT_FIELD_GOAL'
    | 'MANUAL_SCORE';
};
```

Validation:

- team must be home or away team
- points must be 1, 2, or 3
- playerId must be on match roster if provided
- match status must be `LIVE`
- period must be active
- permission: `match:operate_score`
- if scoringMethod = `MANUAL_SCORE`, reason recommended or required by tournament policy

Projection effect:

- increment team score
- update player points if playerId provided
- update running score
- update match summary

Audit:

- required

---

### SCORE_REMOVED_BY_CORRECTION

```ts
type ScoreRemovedByCorrectionPayload = {
  correctedEventId: string;
  teamId: string;
  playerId?: string | null;
  pointsRemoved: 1 | 2 | 3;
  scoreBefore: {
    home: number;
    away: number;
  };
  scoreAfter: {
    home: number;
    away: number;
  };
  reason: string;
};
```

Validation:

- correctedEventId must reference previous SCORE_ADDED
- reason required
- permission: `match:correct_score`

Projection effect:

- subtract score
- update player points if applicable
- mark original event as corrected in replay projection without mutating original event

Audit:

- required with old/new value

---

### SCORE_CORRECTED

```ts
type ScoreCorrectedPayload = {
  target:
    | { type: 'TEAM_SCORE'; teamId: string }
    | { type: 'PLAYER_POINTS'; playerId: string };
  previousValue: number;
  newValue: number;
  delta: number;
  reason: string;
  correctedEventIds?: string[];
};
```

Validation:

- reason required
- newValue >= 0
- permission: `match:correct_score`
- post-game correction may require admin approval

Projection effect:

- adjust projection value
- correction appears in replay/audit

Audit:

- required

[SYSTEM RECOMMENDATION] Prefer specific compensating events like `SCORE_REMOVED_BY_CORRECTION` over broad `SCORE_CORRECTED` when possible

---

## 9.6 Foul Events

### PLAYER_FOUL_ADDED

```ts
type PlayerFoulAddedPayload = {
  teamId: string;
  playerId: string;
  foulType:
    | 'PERSONAL'
    | 'TECHNICAL'
    | 'UNSPORTSMANLIKE'
    | 'DISQUALIFYING'
    | 'OFFENSIVE'
    | 'BENCH_TECHNICAL'
    | 'COACH_TECHNICAL'
    | 'OTHER_NEEDS_SOURCE';
  periodNumber: number;
  gameClockRemainingMs: number;
  countsAsPlayerFoul: boolean;
  countsAsTeamFoul: boolean;
  playerFoulsBefore: number;
  playerFoulsAfter: number;
  teamFoulsBefore: number;
  teamFoulsAfter: number;
  penaltyResult?: {
    freeThrows?: number;
    possessionAwardedToTeamId?: string;
    throwInLocation?: string;
    needsManualConfirmation?: boolean;
  };
};
```

Validation:

- player must be on match roster
- team must match player team
- foulType must be supported by loaded rule profile
- if foulType requires penalty matrix and not available -> `[NEEDS SOURCE]`
- permission: `match:operate_foul`

Projection effect:

- update player foul count if applicable
- update team foul count if applicable
- update team foul penalty state
- if player reaches foul limit, create/expect `PLAYER_FOULED_OUT`
- update match summary

Audit:

- required

---

### TEAM_FOUL_ADDED

```ts
type TeamFoulAddedPayload = {
  teamId: string;
  periodNumber: number;
  foulSourceEventId: string;
  teamFoulsBefore: number;
  teamFoulsAfter: number;
  penaltyStateAfter: 'NOT_IN_PENALTY' | 'IN_PENALTY';
};
```

Validation:

- must be caused by foul event
- should not be manually added without reason
- permission: `match:operate_foul`

Projection effect:

- teamFoulsByPeriod incremented
- penalty indicator updated

Audit:

- required

[SYSTEM RECOMMENDATION] `TEAM_FOUL_ADDED` may be derived by projection from `PLAYER_FOUL_ADDED`. If stored as event, it must use `causationId` linking to foul event

---

### PLAYER_FOULED_OUT

```ts
type PlayerFouledOutPayload = {
  teamId: string;
  playerId: string;
  playerFouls: number;
  foulLimit: number;
  foulSourceEventId: string;
};
```

Validation:

- playerFouls >= ruleProfile.playerFoulLimit
- source foul event must exist
- permission: `match:operate_foul` or system generated from foul event

Projection effect:

- player match status = `FOULED_OUT`
- UI shows foul-out alert
- player cannot be assigned active-on-court status unless corrected

Audit:

- required

---

### PLAYER_FOUL_CORRECTED

```ts
type PlayerFoulCorrectedPayload = {
  correctedEventId: string;
  teamId: string;
  playerId: string;
  previousFoulCount: number;
  newFoulCount: number;
  previousTeamFoulCount?: number;
  newTeamFoulCount?: number;
  reason: string;
};
```

Validation:

- correctedEventId must reference foul event
- reason required
- new count cannot be negative
- permission: `match:correct_foul`

Projection effect:

- update foul projection
- update foul-out status if needed
- update team penalty state if needed

Audit:

- required

---

## 9.7 Timeout Events

### TIMEOUT_GRANTED

```ts
type TimeoutGrantedPayload = {
  teamId: string;
  periodNumber: number;
  periodType: 'REGULATION' | 'OVERTIME';
  gameClockRemainingMs: number;
  timeoutNumberForTeamInHalfOrOvertime: number;
  durationMs: number;
  quotaContext: {
    firstHalfUsed: number;
    secondHalfUsed: number;
    overtimeUsed: number;
    lateQ4Used?: number;
    lateQ4Limit?: number;
  };
};
```

Validation:

- timeout availability must pass `canGrantTimeout`
- team must be home/away
- permission: `match:operate_timeout`
- if timeout rule cannot be verified -> reject with `NEEDS_SOURCE`

Projection effect:

- increment timeout count
- stop game clock if running
- stop shot clock if required by operation policy
- show timeout timer

Audit:

- required

---

### TIMEOUT_CANCELLED_BY_CORRECTION

```ts
type TimeoutCancelledByCorrectionPayload = {
  correctedEventId: string;
  teamId: string;
  periodNumber: number;
  reason: string;
};
```

Validation:

- correctedEventId references TIMEOUT_GRANTED
- reason required
- permission: `match:correct_timeout`

Projection effect:

- decrement timeout count
- update timeout summary
- original timeout remains in replay as corrected

Audit:

- required

---

## 9.8 Possession and Direction Events

### POSSESSION_CHANGED

```ts
type PossessionChangedPayload = {
  previousTeamId: string | null;
  newTeamId: string | null;
  reason:
    | 'JUMP_BALL'
    | 'TURNOVER'
    | 'DEFENSIVE_REBOUND'
    | 'MADE_BASKET'
    | 'FOUL_PENALTY'
    | 'ALTERNATING_POSSESSION'
    | 'MANUAL_OPERATOR'
    | 'CORRECTION';
};
```

Validation:

- newTeamId must be home/away or null
- permission: `match:operate_possession`
- manual reason may require note

Projection effect:

- possessionTeamId updated
- public possession indicator updated
- may affect shot clock decision context

Audit:

- required

---

### DIRECTION_SWITCHED

```ts
type DirectionSwitchedPayload = {
  previousDirection: {
    homeAttacks: 'LEFT' | 'RIGHT';
    awayAttacks: 'LEFT' | 'RIGHT';
  };
  newDirection: {
    homeAttacks: 'LEFT' | 'RIGHT';
    awayAttacks: 'LEFT' | 'RIGHT';
  };
  reason:
    | 'HALFTIME'
    | 'PERIOD_RULE'
    | 'MANUAL_OPERATOR'
    | 'CORRECTION';
};
```

Validation:

- direction must be opposite between teams
- permission: `match:operate_direction`
- automatic switch should happen at configured period transition

Projection effect:

- public scoreboard offensive direction updated
- operator UI direction labels updated

Audit:

- required

---

## 9.9 Roster and Player Status Events

### MATCH_ROSTER_CONFIRMED

```ts
type MatchRosterConfirmedPayload = {
  teamId: string;
  playerIds: string[];
  confirmedByUserId: string;
};
```

Validation:

- players must be in tournament roster
- jersey numbers must be valid and unique within team
- permission: `match:manage_roster`

Projection effect:

- match roster locked or marked confirmed

Audit:

- required

---

### PLAYER_MARKED_ACTIVE

```ts
type PlayerMarkedActivePayload = {
  teamId: string;
  playerId: string;
  active: boolean;
  reason?: string;
};
```

Validation:

- player must be on match roster
- player must not be fouled out or disqualified unless correction
- permission: `match:manage_roster` or assigned scorer role

Projection effect:

- player match status updated

Audit:

- required

---

## 9.10 Correction Events

### CORRECTION_REQUESTED

```ts
type CorrectionRequestedPayload = {
  targetEventId?: string | null;
  correctionType:
    | 'SCORE'
    | 'FOUL'
    | 'CLOCK'
    | 'SHOT_CLOCK'
    | 'TIMEOUT'
    | 'POSSESSION'
    | 'ROSTER'
    | 'MATCH_RESULT'
    | 'OTHER';
  requestedChange: Record<string, unknown>;
  reason: string;
};
```

Validation:

- reason required
- permission: `match:request_correction`
- targetEventId should exist when correcting existing event

Projection effect:

- correction queue updated
- no live state change unless applied

Audit:

- required

---

### CORRECTION_APPLIED

```ts
type CorrectionAppliedPayload = {
  correctionRequestEventId?: string | null;
  targetEventId?: string | null;
  correctionType:
    | 'SCORE'
    | 'FOUL'
    | 'CLOCK'
    | 'SHOT_CLOCK'
    | 'TIMEOUT'
    | 'POSSESSION'
    | 'ROSTER'
    | 'MATCH_RESULT'
    | 'OTHER';
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  compensatingEventIds: string[];
  reason: string;
};
```

Validation:

- reason required
- permission: `match:apply_correction`
- must create or reference compensating event(s)
- original event must remain unchanged

Projection effect:

- correction state updated
- replay timeline marks corrected sequence
- audit logs updated

Audit:

- required

---

### CORRECTION_REJECTED

```ts
type CorrectionRejectedPayload = {
  correctionRequestEventId: string;
  rejectedByUserId: string;
  reason: string;
};
```

Validation:

- reason required
- permission: `match:apply_correction`

Projection effect:

- correction request status = `REJECTED`

Audit:

- required

---

## 9.11 Tournament Result Events

[SYSTEM RECOMMENDATION] Tournament standings should be projection from official match results, not manually edited table values

### MATCH_RESULT_PUBLISHED_TO_TOURNAMENT

```ts
type MatchResultPublishedToTournamentPayload = {
  tournamentId: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  resultStatus: 'DRAFT' | 'OFFICIAL';
};
```

Validation:

- match must be finished
- permission: `tournament:publish_result`
- if status official, match must be officialized

Projection effect:

- tournament standings/bracket projection updates

Audit:

- required

---

### TOURNAMENT_STANDINGS_RECALCULATED

```ts
type TournamentStandingsRecalculatedPayload = {
  tournamentId: string;
  triggeredByMatchId?: string;
  recalculatedAt: string;
  reason: string;
};
```

Validation:

- reason required
- permission: system/admin

Projection effect:

- standing projection version updated

Audit:

- required

---

## 9.12 System Events

### PROJECTION_REBUILT

```ts
type ProjectionRebuiltPayload = {
  projectionName: string;
  matchId?: string;
  fromSeqNo: number;
  toSeqNo: number;
  rebuiltAt: string;
  reason: string;
};
```

Validation:

- system/admin only
- reason required

Projection effect:

- projection metadata updated

Audit:

- required

---

### SNAPSHOT_CREATED

```ts
type SnapshotCreatedPayload = {
  matchId: string;
  snapshotSeqNo: number;
  createdAt: string;
  snapshotVersion: number;
};
```

Validation:

- system/admin only
- snapshotSeqNo must equal existing event seq

Projection effect:

- snapshot table updated
- no domain state change

Audit:

- optional system audit

[SYSTEM RECOMMENDATION] `SNAPSHOT_CREATED` may be a system log instead of match event if you do not want infrastructure events in domain stream

---

# 10. Required Event Attributes by Category

| Category | Audit | Permission | Rule validation | Projection effect | Correction support |
|---|---:|---:|---:|---:|---:|
| Match lifecycle | yes | yes | yes | yes | partial |
| Period | yes | yes | yes | yes | yes |
| Game clock | yes | yes | yes | yes | yes |
| Shot clock | yes | yes | yes | yes | yes |
| Score | yes | yes | yes | yes | yes |
| Foul | yes | yes | yes | yes | yes |
| Timeout | yes | yes | yes | yes | yes |
| Possession | yes | yes | yes | yes | yes |
| Direction | yes | yes | yes | yes | yes |
| Roster | yes | yes | conditional | yes | yes |
| Correction | yes | yes | yes | yes | yes |
| Tournament result | yes | yes | yes | yes | yes |

---

# 11. Command to Event Mapping

## 11.1 Command Handling Flow

```txt
Client command
  ↓
Authenticate user/session
  ↓
Authorize permission
  ↓
Validate command payload
  ↓
Load current projection/snapshot + current lastSeqNo
  ↓
Check expectedSeq
  ↓
Run rules engine
  ↓
If rejected:
    return COMMAND_REJECTED
  ↓
If accepted:
    begin DB transaction
      append event(s)
      update match_stream last_seq_no
      update projection
      insert audit log
      insert command dedup record
    commit
  ↓
Return accepted event(s) + newSeqNo
  ↓
Realtime delivery via polling/Socket.IO
```

## 11.2 Mapping Table

| Command | Primary Event | Possible Additional Events |
|---|---|---|
| `CreateMatchCommand` | `MATCH_CREATED` | — |
| `StartMatchCommand` | `MATCH_STARTED` | `PERIOD_STARTED` |
| `StartGameClockCommand` | `GAME_CLOCK_STARTED` | `SHOT_CLOCK_STARTED` optional |
| `StopGameClockCommand` | `GAME_CLOCK_STOPPED` | `SHOT_CLOCK_STOPPED` optional |
| `SetGameClockCommand` | `GAME_CLOCK_SET` | `CORRECTION_APPLIED` if correction |
| `ResetShotClock24Command` | `SHOT_CLOCK_RESET_24` | — |
| `ResetShotClock14Command` | `SHOT_CLOCK_RESET_14` | — |
| `AddScoreCommand` | `SCORE_ADDED` | `POSSESSION_CHANGED` optional/manual |
| `AddPlayerFoulCommand` | `PLAYER_FOUL_ADDED` | `TEAM_FOUL_ADDED`, `PLAYER_FOULED_OUT` |
| `GrantTimeoutCommand` | `TIMEOUT_GRANTED` | `GAME_CLOCK_STOPPED`, `SHOT_CLOCK_STOPPED` |
| `ChangePossessionCommand` | `POSSESSION_CHANGED` | possible shot clock decision event |
| `SwitchDirectionCommand` | `DIRECTION_SWITCHED` | — |
| `RequestCorrectionCommand` | `CORRECTION_REQUESTED` | — |
| `ApplyCorrectionCommand` | `CORRECTION_APPLIED` | compensating event(s) |
| `FinishMatchCommand` | `MATCH_FINISHED` | `MATCH_RESULT_PUBLISHED_TO_TOURNAMENT` optional |
| `OfficializeResultCommand` | `MATCH_RESULT_OFFICIALIZED` | `MATCH_RESULT_PUBLISHED_TO_TOURNAMENT` |

---

# 12. Projection Effects

## 12.1 Main Match Projection

```ts
type LiveMatchProjection = {
  matchId: string;
  lastSeqNo: number;
  status: 'SCHEDULED' | 'READY' | 'LIVE' | 'SUSPENDED' | 'FINISHED' | 'OFFICIAL';

  ruleProfileId: string;

  teams: {
    homeTeamId: string;
    awayTeamId: string;
  };

  score: {
    home: number;
    away: number;
  };

  currentPeriod: {
    number: number;
    type: 'REGULATION' | 'OVERTIME';
    status: 'NOT_STARTED' | 'LIVE' | 'ENDED' | 'PENDING_END_CONFIRMATION';
  };

  gameClock: ClockProjection;
  shotClock: ShotClockProjection;

  fouls: {
    teamFoulsByPeriod: Record<string, Record<number, number>>;
    playerFouls: Record<string, number>;
    fouledOutPlayerIds: string[];
  };

  timeouts: {
    usedByTeam: Record<string, TimeoutUsageProjection>;
  };

  possession: {
    teamId: string | null;
    direction?: DirectionProjection;
  };

  corrections: {
    pendingCount: number;
    appliedCount: number;
    rejectedCount: number;
  };

  updatedAt: string;
};
```

## 12.2 Projection Rebuild Rule

Projection rebuild must:

1. start from empty initial state or snapshot
2. apply events in `seqNo ASC`
3. fail fast if sequence gap found
4. never mutate event rows
5. record rebuild metadata
6. compare checksum/version if implemented

---

# 13. MariaDB / Hostatom-Compatible Event Store

## 13.1 Core Tables

[SYSTEM RECOMMENDATION] ใช้ MariaDB InnoDB และ transaction ทุกครั้งที่ append event

```sql
CREATE TABLE match_streams (
  match_id CHAR(36) PRIMARY KEY,
  last_seq_no INT NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL,
  rule_profile_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;
```

```sql
CREATE TABLE match_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  seq_no INT NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  payload_json JSON NOT NULL,

  actor_user_id CHAR(36) NULL,
  actor_role VARCHAR(60) NOT NULL,
  device_id CHAR(36) NULL,

  occurred_at DATETIME(3) NOT NULL,
  recorded_at DATETIME(3) NOT NULL,

  correlation_id CHAR(36) NOT NULL,
  causation_id CHAR(36) NULL,
  command_id CHAR(36) NULL,
  expected_seq INT NULL,

  rule_profile_id CHAR(36) NOT NULL,
  source_rule_ref VARCHAR(255) NULL,

  reason TEXT NULL,

  schema_version INT NOT NULL DEFAULT 1,
  app_version VARCHAR(50) NULL,

  is_correction TINYINT(1) NOT NULL DEFAULT 0,
  corrected_event_id CHAR(36) NULL,

  metadata_json JSON NULL,

  UNIQUE KEY uq_event_id (event_id),
  UNIQUE KEY uq_match_seq (match_id, seq_no),
  UNIQUE KEY uq_match_command (match_id, command_id),
  KEY idx_match_events_match_seq (match_id, seq_no),
  KEY idx_match_events_type (event_type),
  KEY idx_match_events_actor (actor_user_id),
  KEY idx_match_events_recorded_at (recorded_at)
) ENGINE=InnoDB;
```

Note:

- ถ้า MariaDB version ไม่รองรับ `JSON` แบบ native ตามต้องการ ให้ใช้ `LONGTEXT` + application-level JSON validation
- `command_id` อาจเป็น null สำหรับ system/import events; unique nullable behavior ต้องทดสอบกับ MariaDB version ที่ใช้จริง
- ถ้าต้องรองรับ duplicate null behavior แบบแน่นอน ให้แยก `command_deduplication` table

```sql
CREATE TABLE command_deduplication (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  match_id CHAR(36) NOT NULL,
  command_id CHAR(36) NOT NULL,
  first_event_id CHAR(36) NULL,
  result_status VARCHAR(40) NOT NULL,
  result_json JSON NULL,
  created_at DATETIME(3) NOT NULL,

  UNIQUE KEY uq_match_command_dedup (match_id, command_id)
) ENGINE=InnoDB;
```

```sql
CREATE TABLE match_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  snapshot_id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  last_seq_no INT NOT NULL,
  state_json JSON NOT NULL,
  projection_version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,

  UNIQUE KEY uq_snapshot_id (snapshot_id),
  KEY idx_match_snapshot_latest (match_id, last_seq_no)
) ENGINE=InnoDB;
```

```sql
CREATE TABLE live_match_projections (
  match_id CHAR(36) PRIMARY KEY,
  last_seq_no INT NOT NULL,
  state_json JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;
```

```sql
CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  audit_id CHAR(36) NOT NULL,
  match_id CHAR(36) NULL,
  event_id CHAR(36) NULL,
  actor_user_id CHAR(36) NULL,
  actor_role VARCHAR(60) NOT NULL,
  device_id CHAR(36) NULL,
  action VARCHAR(100) NOT NULL,
  old_value_json JSON NULL,
  new_value_json JSON NULL,
  reason TEXT NULL,
  correlation_id CHAR(36) NOT NULL,
  causation_id CHAR(36) NULL,
  seq_no INT NULL,
  created_at DATETIME(3) NOT NULL,

  UNIQUE KEY uq_audit_id (audit_id),
  KEY idx_audit_match_seq (match_id, seq_no),
  KEY idx_audit_actor (actor_user_id),
  KEY idx_audit_created_at (created_at)
) ENGINE=InnoDB;
```

## 13.2 Append Transaction

Pseudo SQL flow:

```sql
START TRANSACTION;

SELECT last_seq_no
FROM match_streams
WHERE match_id = ?
FOR UPDATE;

-- verify last_seq_no = expectedSeq in application code

INSERT INTO match_events (...)
VALUES (... seq_no = last_seq_no + 1 ...);

UPDATE match_streams
SET last_seq_no = last_seq_no + 1,
    updated_at = NOW(3)
WHERE match_id = ?;

UPDATE live_match_projections
SET last_seq_no = ?,
    state_json = ?,
    updated_at = NOW(3)
WHERE match_id = ?;

INSERT INTO audit_logs (...);

COMMIT;
```

กฎ:

- ต้องใช้ transaction
- ต้อง lock stream row ด้วย `FOR UPDATE`
- ถ้า insert event สำเร็จแต่ projection update ไม่สำเร็จ ต้อง rollback
- ถ้า projection rebuild ภายหลังได้ อาจเลือก append event ก่อนแล้ว rebuild async/manual แต่ live control ต้องรู้ว่า projection stale

---

# 14. Realtime Delivery Model

## 14.1 Polling-First Protocol

เพราะ target hosting เป็น Shared Hosting/Plesk ที่ WebSocket อาจไม่เสถียร ให้ใช้ polling-first

Client public/operator ดึง event หลัง seq ล่าสุด:

```http
GET /api/matches/:matchId/events?afterSeq=123
```

Response:

```json
{
  "matchId": "match_123",
  "fromSeq": 124,
  "toSeq": 130,
  "currentSeq": 130,
  "events": [],
  "serverTime": "2026-06-26T12:00:00.000Z",
  "fullSyncRequired": false
}
```

ถ้า client seq เก่าเกินไป:

```json
{
  "matchId": "match_123",
  "currentSeq": 900,
  "events": [],
  "snapshot": {},
  "fullSyncRequired": true
}
```

## 14.2 Live State Endpoint

```http
GET /api/matches/:matchId/live-state
```

Response:

```json
{
  "matchId": "match_123",
  "lastSeqNo": 130,
  "state": {},
  "serverTime": "2026-06-26T12:00:00.000Z"
}
```

## 14.3 Optional Socket.IO

ถ้า hosting รองรับ WebSocket/Socket.IO จริง ให้ใช้เป็น delivery optimization เท่านั้น

Socket event:

```ts
type MatchEventsPublished = {
  matchId: string;
  fromSeq: number;
  toSeq: number;
  events: MatchEvent[];
  serverTime: string;
};
```

กฎ:

- Socket broadcast ห้ามเป็น source of truth
- client ต้องยังใช้ `lastSeqNo`
- reconnect ต้องเรียก events endpoint เพื่อ catch up
- public room read-only
- operator command ยังต้อง validate server-side

---

# 15. Correction Model

## 15.1 Correction Is Not Delete

ตัวอย่างผิด:

```sql
DELETE FROM match_events WHERE event_id = 'wrong_score_event';
```

ห้ามทำเด็ดขาด

ตัวอย่างถูก:

```txt
seq 10 SCORE_ADDED +3 wrong team
seq 11 CORRECTION_REQUESTED reason="กดผิดทีม"
seq 12 SCORE_REMOVED_BY_CORRECTION target=seq10
seq 13 SCORE_ADDED +3 correct team
seq 14 CORRECTION_APPLIED references seq11, seq12, seq13
```

## 15.2 Required Correction Reason

Correction reason ต้อง:

- ไม่ว่าง
- เก็บใน event
- เก็บใน audit_logs
- แสดงใน replay/admin audit screen
- required สำหรับ post-entry edits

## 15.3 Correction Impact

Correction อาจกระทบ:

- score
- player stats
- team fouls
- player foul-out
- timeout quota
- period state
- tournament standings
- match result
- replay timeline

ดังนั้น projection ต้อง rebuild ได้หลัง correction

---

# 16. Validation Rules

## 16.1 General Event Validation

ทุก event ต้องตรวจ:

- eventType อยู่ใน catalog
- payload ตรง schema
- actor มีสิทธิ์
- match exists
- expectedSeq ถูกต้อง
- ruleProfile exists
- event source ไม่ขัดกับ match status
- reason required เมื่อเป็น correction/manual override
- commandId ไม่ซ้ำ
- seqNo ต่อเนื่อง

## 16.2 Score Validation

- points = 1, 2, 3
- teamId เป็นทีมใน match
- playerId ถ้ามีต้องอยู่ใน match roster
- match status = LIVE
- period active
- scoreAfter ต้องตรงกับ scoreBefore + points
- score ห้ามติดลบหลัง correction

## 16.3 Clock Validation

- remainingMs >= 0
- remainingMs <= period duration
- start clock เฉพาะตอน clock stopped
- stop clock เฉพาะตอน clock running
- set clock ต้องมี reason ถ้าไม่ใช่ setup
- deadline-based calculation only

## 16.4 Foul Validation

- player belongs to team
- player is eligible in match roster
- foul type must be supported by rule profile
- player foul count must not exceed logic without status update
- foul-out must trigger when limit reached
- foul correction cannot make negative count

## 16.5 Timeout Validation

- teamId valid
- timeout quota available
- period context valid
- late Q4 limit enforced under FIBA profile
- overtime timeout quota handled separately
- unavailable timeout must reject command

## 16.6 Shot Clock Validation

- reset decision must come from `decideShotClockReset`
- manual reset needs reason
- 24/14/no-reset/off cases must be explicit
- shot clock cannot run when off
- shot clock cannot show negative

---

# 17. Permission Requirements by Event Type

| Event Type Pattern | Permission |
|---|---|
| `MATCH_CREATED` | `match:create` |
| `MATCH_READY_SET` | `match:prepare` |
| `MATCH_STARTED` | `match:operate_clock` |
| `MATCH_FINISHED` | `match:finish` |
| `MATCH_RESULT_OFFICIALIZED` | `match:officialize` |
| `PERIOD_*` | `match:operate_clock` |
| `GAME_CLOCK_*` | `match:operate_clock` or `match:correct_clock` |
| `SHOT_CLOCK_*` | `match:operate_shot_clock` |
| `SCORE_ADDED` | `match:operate_score` |
| `SCORE_*_CORRECTION` | `match:correct_score` |
| `PLAYER_FOUL_ADDED` | `match:operate_foul` |
| `PLAYER_FOUL_CORRECTED` | `match:correct_foul` |
| `TIMEOUT_GRANTED` | `match:operate_timeout` |
| `TIMEOUT_CANCELLED_BY_CORRECTION` | `match:correct_timeout` |
| `POSSESSION_CHANGED` | `match:operate_possession` |
| `DIRECTION_SWITCHED` | `match:operate_direction` |
| `CORRECTION_REQUESTED` | `match:request_correction` |
| `CORRECTION_APPLIED` | `match:apply_correction` |
| `CORRECTION_REJECTED` | `match:apply_correction` |
| `MATCH_RESULT_PUBLISHED_TO_TOURNAMENT` | `tournament:publish_result` |

กฎ:

- `Admin` อาจมีทุก permission ภายใน organization
- `Referee/Scorer` ได้เฉพาะ assigned match
- `Viewer/Public` read-only
- deny by default

---

# 18. Event Serialization

## 18.1 JSON Payload

payload ต้อง serialize เป็น JSON object เท่านั้น

ห้าม payload เป็น:

- plain string
- array top-level
- binary
- unserialized class instance

ถูกต้อง:

```json
{
  "teamId": "team_home",
  "points": 2,
  "periodNumber": 1
}
```

## 18.2 Schema Versioning

ทุก event มี `schemaVersion`

เมื่อเปลี่ยน payload:

- ห้ามแก้ event เก่า
- เพิ่ม event schema version ใหม่
- projection ต้องอ่าน old/new schema ได้ หรือมี migration event
- document migration ใน `EVENT_MIGRATIONS.md`

---

# 19. Error Codes

Rules/command handler ต้องคืน error code ที่ machine-readable

```txt
MATCH_NOT_FOUND
MATCH_NOT_LIVE
INVALID_EVENT_TYPE
INVALID_PAYLOAD
UNAUTHORIZED_COMMAND
INVALID_EXPECTED_SEQ
DUPLICATE_COMMAND
RULE_VIOLATION
NEEDS_SOURCE
CORRECTION_REASON_REQUIRED
INVALID_CORRECTION_TARGET
PLAYER_NOT_IN_MATCH_ROSTER
PLAYER_FOULED_OUT
TIMEOUT_QUOTA_EXCEEDED
SHOT_CLOCK_DECISION_REQUIRED
GAME_CLOCK_NOT_RUNNING
GAME_CLOCK_ALREADY_RUNNING
PERIOD_NOT_ACTIVE
MATCH_ALREADY_FINISHED
PROJECTION_STALE
```

Error response:

```ts
type CommandRejected = {
  status: 'REJECTED';
  reasonCode: string;
  message: string;
  currentSeq: number;
  requiredAction?: 'FULL_SYNC' | 'RETRY_WITH_LATEST_SEQ' | 'ASK_ADMIN' | 'NEEDS_SOURCE';
};
```

---

# 20. Replay Model

Replay UI ต้องแสดง event timeline ได้

```ts
type ReplayItem = {
  seqNo: number;
  eventType: MatchEventType;
  displayTime: string;
  periodNumber?: number;
  gameClockRemainingMs?: number;
  actorDisplayName?: string;
  summary: string;
  isCorrection: boolean;
  correctedEventId?: string;
  correctionReason?: string;
};
```

Replay rules:

- original event must still appear
- corrected event must show corrected marker
- compensating events must appear
- viewer role may see simplified replay
- admin role may see full audit details

---

# 21. AI Agent Implementation Rules

AI Coding Agent ต้อง:

1. อ่าน `AI_AGENT_RULES.md` ก่อน
2. อ่าน `PROJECT_BRIEF.md`
3. อ่าน `ARCHITECTURE_PRINCIPLES.md`
4. อ่าน `RULES_PROFILE_FIBA.md`
5. อ่าน `RULES_ENGINE_SPEC.md`
6. อ่าน `DOMAIN_MODEL.md`
7. อ่าน `USER_ROLES_AND_PERMISSIONS.md`
8. อ่านไฟล์นี้ก่อนสร้าง code event store
9. ห้ามเพิ่ม event type ใหม่โดยไม่ update event catalog
10. ห้ามแก้ payload ของ event เดิมโดยไม่เพิ่ม schema version
11. ห้ามสร้าง API/socket command ที่ไม่ append event
12. ห้ามให้ UI แก้ projection โดยตรง
13. ห้าม trust client-calculated score/foul/clock
14. ต้องเขียน tests ทุก event handler

---

# 22. Suggested TypeScript File Structure

```txt
src/
  domain/
    events/
      match-event.types.ts
      match-event-catalog.ts
      match-event-schemas.ts
      event-metadata.ts
      event-versioning.ts

    commands/
      command-envelope.ts
      command-result.ts
      command-handlers/

    projections/
      live-match-projection.ts
      projection-reducer.ts
      projection-rebuild.ts

    rules/
      rules-engine.ts
      fiba-rule-profile.ts

    audit/
      audit-log.types.ts

  infrastructure/
    db/
      match-event.repository.ts
      match-stream.repository.ts
      projection.repository.ts
      audit-log.repository.ts

    realtime/
      polling-events.controller.ts
      socket-events.gateway.ts

  tests/
    event-model/
    projection/
    command-handlers/
```

---

# 23. Required Tests

## 23.1 Event Store Tests

- append first event seq 1
- append second event seq 2
- reject duplicate seq
- reject wrong expectedSeq
- reject duplicate commandId
- rollback projection when append transaction fails
- replay event stream rebuilds same projection
- snapshot rehydrate + replay after snapshot works

## 23.2 Score Event Tests

- add 1 point
- add 2 points
- add 3 points
- reject invalid points
- reject wrong team
- correction removes score without deleting original event
- player points projection updates

## 23.3 Clock Event Tests

- start stopped game clock
- reject start when already running
- stop running game clock
- reject stop when already stopped
- set game clock with reason
- clock display calculation from deadline model
- period ends at zero

## 23.4 Shot Clock Event Tests

- reset 24
- reset 14
- no reset / continued
- turn off shot clock
- reject invalid manual reset without reason
- shot clock deadline calculation

## 23.5 Foul Event Tests

- add player foul
- increment team foul
- team reaches penalty
- player reaches foul-out
- correct foul count
- reject foul for player not in roster
- require source for unsupported foul penalty automation

## 23.6 Timeout Event Tests

- grant first-half timeout within quota
- reject timeout over first-half quota
- enforce second-half quota
- enforce late Q4 max timeout rule
- grant overtime timeout
- cancel timeout by correction

## 23.7 Realtime Tests

- client polls after last seq
- client receives missed events
- full sync required when gap too large
- socket reconnect uses events endpoint
- public client cannot send command

## 23.8 Security Tests

- viewer cannot append event
- public display cannot append event
- scorer cannot operate unassigned match
- correction requires permission
- correction requires reason
- role from client payload ignored

## 23.9 Concurrency Tests

- two commands with same expectedSeq: only one succeeds
- duplicate commandId returns idempotent result
- transaction rollback leaves no partial event
- projection lastSeqNo matches stream lastSeqNo

---

# 24. Acceptance Criteria

`EVENT_MODEL.md` ถือว่าถูก implement แล้วเมื่อ:

- มี `match_events` append-only storage
- มี unique `(match_id, seq_no)`
- ทุก command ใช้ `expectedSeq`
- ทุก event มี required metadata
- correction ไม่ลบหรือแก้ event เดิม
- correction มี reason + audit log
- projection rebuild จาก event stream ได้
- live scoreboard อ่านจาก projection ไม่ใช่ client state
- realtime sync ใช้ `lastSeqNo`
- public/viewer ไม่สามารถ append command event ได้
- tests ครอบคลุม score, clock, shot clock, foul, timeout, correction, replay, RBAC, reconnect และ concurrency

---

# 25. Forbidden Implementations

AI Agent ห้ามเขียนแบบนี้:

```sql
UPDATE matches SET home_score = home_score + 2 WHERE id = ?;
```

ยกเว้นเป็น projection update ภายใน transaction หลัง append event แล้วเท่านั้น

ห้าม:

```sql
DELETE FROM match_events WHERE id = ?;
```

ห้าม:

```ts
socket.on('score:update', (stateFromClient) => {
  saveScore(stateFromClient.homeScore, stateFromClient.awayScore);
});
```

ห้าม:

```ts
if (client.role === 'ADMIN') allow();
```

ห้าม:

```ts
setInterval(() => {
  db.updateClockEverySecond();
}, 1000);
```

ให้ใช้:

```txt
Command
 -> Server validation
 -> Rules engine decision
 -> Append event
 -> Update projection
 -> Client sync by seq
```

---

# 26. Open Decisions for Product Owner

[ASSUMPTION] รายการต่อไปนี้ต้องให้ Product Owner ตัดสินใจก่อน implement production เต็ม:

1. จะใช้ role แยก `SCORER`, `TIMER`, `SHOT_CLOCK_OPERATOR` จริงหรือรวมเป็น `REFEREE_SCORER`
2. correction ระหว่างเกมให้ scorer apply ได้ทันทีหรือ admin/referee approval
3. post-game correction ต้อง approval กี่คน
4. tournament standings จะ update จาก draft result หรือ official result เท่านั้น
5. local rules มี timeout/foul/shot-clock override หรือไม่
6. ต้องเก็บ player statistics ระดับละเอียดแค่ไหนใน MVP
7. shot clock automation จะทำเต็มตาม FIBA หรือเริ่มจาก manual assisted mode
8. public replay จะแสดง correction detail แค่ไหน
9. MariaDB version ที่ Hostatom ใช้รองรับ JSON/check constraints ระดับใด
10. Socket.IO ใช้ได้จริงบน hosting หรือใช้ polling-only

---

# 27. Next Documents

หลังจากไฟล์นี้ ควรออกแบบต่อ:

1. `PROJECTION_MODEL.md`
2. `CORRECTION_MODEL.md`
3. `AUDIT_LOG_MODEL.md`
4. `API_CONTRACTS.md`
5. `SOCKET_CONTRACTS.md`
6. `DATABASE_SCHEMA.md`
7. `TEST_PLAN.md`

