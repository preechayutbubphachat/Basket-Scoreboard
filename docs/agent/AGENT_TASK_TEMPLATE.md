# AGENT_TASK_TEMPLATE.md

## 0. Purpose

[SYSTEM RECOMMENDATION] ไฟล์นี้คือ template กลางสำหรับสั่งงาน AI Coding Agent ทุกครั้งก่อนเริ่มแก้โค้ด สร้าง feature, refactor, migration, test, UI, API, realtime, database, security หรือ documentation

เป้าหมายของ template นี้คือทำให้ AI agent ทำงานแบบควบคุมได้ ตรวจสอบได้ และไม่ละเมิดหลักสำคัญของระบบ Basketball Scoreboard และ Tournament Management เช่น:

- `match_events` เป็น source of truth
- ห้ามแก้/loss historical event
- correction ต้องใช้ compensating event
- REST API และ realtime channel ต้อง enforce RBAC
- MariaDB transaction ต้องปลอดภัย
- polling/reconnect ต้องกลับ state ได้ถูกต้อง
- UI ต้องไม่แก้ scoreboard state เอง
- feature ต้องมี tests และ acceptance criteria
- ห้ามเดากติกา FIBA หรือกติกาทางการอื่นโดยไม่มี source

ใช้ไฟล์นี้ทุกครั้งก่อนสั่ง AI agent ทำงาน

---

## 1. How To Use This Template

ให้ Product Owner / Architect / Lead Developer copy section `TASK REQUEST` ด้านล่าง แล้วกรอกข้อมูลให้ชัดเจนก่อนส่งให้ AI agent

AI agent ต้อง:

1. อ่านไฟล์ที่ระบุใน `Files to Read First`
2. สรุปความเข้าใจของงานก่อนลงมือ
3. ระบุ assumptions และ risks
4. ระบุ files ที่คาดว่าจะเปลี่ยน
5. ระบุ tests ที่ต้องเพิ่ม/แก้
6. หยุดถามถ้าชนกับกติกา, event model, database schema, RBAC หรือ architecture
7. ห้าม implement ถ้า task ไม่ผ่าน Required Pre-Flight Checklist

---

## 2. Required Files To Read First

AI agent ต้องอ่านไฟล์เหล่านี้ก่อนเริ่มงานทุกครั้ง เว้นแต่ task เป็นเอกสารเล็กมากและ Architect อนุญาตชัดเจน

```txt
/docs/agent/AI_AGENT_RULES.md
/docs/product/PROJECT_BRIEF.md
/docs/architecture/ARCHITECTURE_PRINCIPLES.md
/docs/architecture/DOMAIN_MODEL.md
/docs/architecture/EVENT_MODEL.md
/docs/architecture/PROJECTION_MODEL.md
/docs/rules/RULES_PROFILE_FIBA.md
/docs/rules/RULES_ENGINE_SPEC.md
/docs/security/USER_ROLES_AND_PERMISSIONS.md
/docs/api/API_CONTRACTS.md
/docs/api/SOCKET_CONTRACTS.md
/docs/database/DATABASE_SCHEMA.md
/docs/ui/UI_DASHBOARDS.md
/docs/ui/KEYBOARD_SHORTCUTS.md
/docs/quality/TEST_PLAN.md
/docs/quality/ACCEPTANCE_CRITERIA.md
/docs/quality/EDGE_CASES.md
```

ถ้าไฟล์บางไฟล์ยังไม่มี ให้ AI agent ต้องระบุว่า:

```txt
[NEEDS SOURCE] Missing project document: <file name>
```

และห้ามเดา policy ที่ควรมาจากไฟล์นั้น

---

## 3. Task Types

เลือก task type ให้ชัดเจนก่อนส่งงาน

```txt
FEATURE
BUGFIX
REFACTOR
DATABASE_MIGRATION
API_IMPLEMENTATION
UI_IMPLEMENTATION
REALTIME_SYNC
RULES_ENGINE
SECURITY
TESTING
DOCUMENTATION
PERFORMANCE
DEPLOYMENT
HOTFIX
REVIEW_ONLY
```

### 3.1 Feature Task

ใช้เมื่อต้องสร้างความสามารถใหม่ เช่น score control, foul control, replay, correction, standings

ต้องระบุ:

- domain entity ที่เกี่ยวข้อง
- command ที่เพิ่ม
- event ที่ append
- projection ที่เปลี่ยน
- API endpoint ที่เพิ่ม/แก้
- UI state ที่เพิ่ม/แก้
- permission ที่ต้องใช้
- tests ที่ต้องมี

### 3.2 Bugfix Task

ใช้เมื่อแก้พฤติกรรมผิด เช่น shot clock reset ผิด, polling stale, duplicate command

ต้องระบุ:

- expected behavior
- actual behavior
- reproduction steps
- affected event/projection
- regression tests

### 3.3 Refactor Task

ใช้เมื่อปรับโครงสร้างโค้ดโดยไม่เปลี่ยน behavior

ต้องระบุ:

- behavior ที่ต้องคงเดิม
- tests ที่ต้องผ่านก่อนและหลัง
- files ที่ห้ามแตะ
- rollback plan

### 3.4 Database Migration Task

ใช้เมื่อเพิ่ม/แก้ table/index/constraint

ต้องระบุ:

- migration file name
- up SQL
- down SQL หรือ rollback note
- data backfill plan
- production risk
- compatibility กับ MariaDB/InnoDB
- วิธีรันผ่าน Plesk/phpMyAdmin ถ้าไม่มี SSH

### 3.5 Hotfix Task

ใช้สำหรับแก้ปัญหาด่วนในวันแข่งขัน

ต้องจำกัด scope ให้เล็กที่สุด และต้องไม่เปลี่ยน event model หรือ migration ใหญ่โดยไม่อนุมัติ

---

# TASK REQUEST

> Copy section นี้เพื่อใช้สั่งงาน AI agent

## A. Task Summary

```md
## Task
<อธิบายงานให้ชัดเจนใน 1-5 ประโยค>

## Task Type
<FEATURE | BUGFIX | REFACTOR | DATABASE_MIGRATION | API_IMPLEMENTATION | UI_IMPLEMENTATION | REALTIME_SYNC | RULES_ENGINE | SECURITY | TESTING | DOCUMENTATION | PERFORMANCE | DEPLOYMENT | HOTFIX | REVIEW_ONLY>

## Priority
<LOW | MEDIUM | HIGH | MATCH_DAY_CRITICAL>

## Target Release
<MVP | Beta | Production | Hotfix | Future Phase>

## Owner
<Product Owner / Architect / Developer / AI Agent Name>

## Date
<YYYY-MM-DD>
```

---

## B. Product Context

```md
## Product Context
ระบบนี้เป็นเว็บแอป Basketball Scoreboard และ Tournament Management ที่ต้องใช้งานจริงในสนามแข่งขัน ไม่ใช่ demo scoreboard

## User Story
As a <Admin | Referee | Scorer | Viewer | Public Scoreboard>,
I want to <goal>,
so that <benefit>.

## Business Goal
<เช่น ลดการกดผิด, รองรับ replay, ใช้จัดทัวร์นาเมนต์, รองรับหลายจอ, ใช้บน Hostatom/Plesk>

## Match-Day Impact
<อธิบายว่าถ้าฟีเจอร์นี้พังจะกระทบการแข่งขันอย่างไร>
```

---

## C. Scope

```md
## In Scope
- <สิ่งที่จะทำ 1>
- <สิ่งที่จะทำ 2>
- <สิ่งที่จะทำ 3>

## Out of Scope
- <สิ่งที่ห้ามทำใน task นี้ 1>
- <สิ่งที่ห้ามทำใน task นี้ 2>
- <สิ่งที่ต้องทำใน task ถัดไป>

## Non-Goals
- <สิ่งที่ไม่ใช่เป้าหมาย แม้จะเกี่ยวข้อง>
```

ตัวอย่าง:

```md
## In Scope
- เพิ่ม API สำหรับ Home +1/+2/+3 และ Away +1/+2/+3
- Append SCORE_ADDED event
- Update live_scoreboard_projection
- Add RBAC check สำหรับ scorer/admin
- Add duplicate command handling

## Out of Scope
- ไม่ทำ player stat attribution ใน task นี้
- ไม่ทำ shot chart
- ไม่เปลี่ยน event metadata schema

## Non-Goals
- ไม่ optimize UI animation
```

---

## D. Files To Read First

```md
## Files to Read First
- AI_AGENT_RULES.md
- PROJECT_BRIEF.md
- ARCHITECTURE_PRINCIPLES.md
- DOMAIN_MODEL.md
- EVENT_MODEL.md
- PROJECTION_MODEL.md
- RULES_PROFILE_FIBA.md
- RULES_ENGINE_SPEC.md
- USER_ROLES_AND_PERMISSIONS.md
- API_CONTRACTS.md
- SOCKET_CONTRACTS.md
- DATABASE_SCHEMA.md
- UI_DASHBOARDS.md
- TEST_PLAN.md
- ACCEPTANCE_CRITERIA.md
- EDGE_CASES.md
```

AI agent ต้องตอบกลับว่าอ่านและเข้าใจไฟล์เหล่านี้แล้ว พร้อมสรุป constraints ที่เกี่ยวข้องกับ task

---

## E. Architecture Constraints

```md
## Architecture Constraints
- Use MariaDB/InnoDB.
- Hostatom/Plesk shared hosting compatible.
- REST command API is the primary write path.
- Polling-first realtime sync is required.
- Socket.IO is optional realtime acceleration only.
- Do not rely on long-running background workers.
- Do not rely on Python environment.
- Do not rely on SSH-only deployment.
- Use deadline-based clock model.
- Do not use backend setInterval as source of truth.
```

---

## F. Event Sourcing Constraints

```md
## Event Sourcing Constraints
- Treat match_events as the source of truth.
- One match has one ordered event stream.
- Every command must include expectedSeq.
- Every accepted command must append at least one event unless explicitly read-only.
- Every event must include required metadata.
- Do not update historical events.
- Do not delete historical events.
- Use compensating events for undo/correction.
- Projection bugs must not corrupt event store.
```

---

## G. Required Command Envelope

ทุก live command ต้องใช้ envelope นี้

```ts
type CommandEnvelope<TPayload> = {
  commandId: string;
  matchId: string;
  expectedSeq: number;
  correlationId: string;
  clientTimestamp: string;
  actorUserId?: string;
  deviceId?: string;
  payload: TPayload;
};
```

### Command Envelope Rules

```md
- commandId is required for idempotency.
- expectedSeq is required for optimistic concurrency.
- correlationId is required for traceability.
- clientTimestamp is not trusted as server time.
- actorUserId must come from authenticated session, not client payload.
- role/permission must come from server-side auth context.
```

---

## H. Domain Impact

```md
## Domain Entities Affected
- <Tournament | Team | Player | Match | MatchEvent | Projection | User | Role | Permission | AuditLog>

## Aggregate Affected
- <Match | Tournament | Team | User | None>

## Domain Invariants
- <Invariant 1>
- <Invariant 2>
- <Invariant 3>

## State Transitions
Before:
<state>

Command:
<command>

After:
<state>
```

ตัวอย่าง:

```md
## Domain Entities Affected
- Match
- MatchEvent
- live_scoreboard_projection
- AuditLog

## Aggregate Affected
- Match

## Domain Invariants
- Score cannot go below 0.
- Event seqNo must be strictly increasing per match.
- Public scoreboard cannot send score commands.

## State Transitions
Before:
homeScore = 10, lastSeq = 42

Command:
ADD_SCORE home +2 expectedSeq=42

After:
homeScore = 12, lastSeq = 43
SCORE_ADDED event appended
```

---

## I. Event Model Impact

```md
## Events To Add
- <EVENT_TYPE>

## Events To Modify
- <EVENT_TYPE or NONE>

## Events To Deprecate
- <EVENT_TYPE or NONE>

## Event Payload
```ts
type <EventName>Payload = {
  // fields
};
```

## Event Metadata Required
- eventId
- matchId
- seqNo
- eventType
- payload
- actorUserId
- actorRole
- deviceId
- occurredAt
- recordedAt
- correlationId
- causationId
- expectedSeq
- ruleProfileId
```

### Event Change Approval Rule

```md
If this task requires new event type or event payload change:
- STOP
- Explain why
- Propose migration/rebuild impact
- Ask Architect approval before implementation
```

---

## J. Projection Impact

```md
## Projections Affected
- live_scoreboard_projection
- operator_score_projection
- foul_projection
- timeout_projection
- clock_projection
- shot_clock_projection
- match_summary_projection
- replay_timeline_projection
- tournament_standings_projection

## Projection Update Rules
- Projection must be updated from event application logic.
- Projection must be rebuildable from match_events.
- Projection update must not be the only source of truth.
- Store lastEventSeq in projection.
```

ตัวอย่าง:

```md
## Projections Affected
- live_scoreboard_projection
- match_summary_projection
- replay_timeline_projection

## Projection Update Rules
On SCORE_ADDED:
- increment team score by points
- update lastEventSeq
- add replay timeline item
```

---

## K. API Impact

```md
## API Endpoints To Add
- <METHOD> /api/v1/<path>

## API Endpoints To Modify
- <METHOD> /api/v1/<path>

## Request Body
```ts
type RequestBody = {
  commandId: string;
  expectedSeq: number;
  correlationId: string;
  clientTimestamp: string;
  payload: unknown;
};
```

## Response Body
```ts
type ApiResponse = {
  ok: boolean;
  currentSeq: number;
  eventIds?: string[];
  projection?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

## API Rules
- Auth required except public read endpoints.
- RBAC required.
- Validate payload with Zod.
- Return currentSeq.
- Rejected command must not append event.
```

---

## L. Socket / Realtime Impact

```md
## Realtime Mode
- Primary: REST polling
- Optional: Socket.IO patch broadcast

## Polling Endpoint
GET /api/v1/matches/:matchId/sync?lastEventSeq=<number>&projection=<projectionName>

## Realtime Requirements
- Client sends lastEventSeq.
- Server returns missedEvents or full projection.
- Client hydrates latest state correctly.
- Socket.IO broadcast is not persistence.
- Socket.IO loss must be recoverable by polling.
```

---

## M. Database Impact

```md
## Tables Affected
- <table name>

## Migration Required
<YES | NO>

## New Columns
- <column name>

## New Indexes
- <index name>

## Constraints
- <constraint>

## Transaction Requirements
- Use InnoDB transaction.
- Lock match_streams row with SELECT ... FOR UPDATE when appending event.
- Insert command_deduplication row for idempotency.
- Insert match_events.
- Update match_streams last_seq_no.
- Update projection tables.
- Insert audit_logs when required.
- Commit.
```

### MariaDB Compatibility

```md
- Must support MariaDB on shared hosting.
- Avoid PostgreSQL-specific syntax.
- Avoid unsupported generated columns unless confirmed.
- JSON fields are allowed but must be validated at application layer.
- Migrations must be runnable via SQL file if SSH is unavailable.
```

---

## N. Security / RBAC Impact

```md
## Required Permissions
- <permission>

## Roles Allowed
- Admin
- Referee / Scorer
- Viewer
- Public

## Authorization Rules
- Deny by default.
- Validate every API request.
- Validate every socket command.
- Never trust role from client.
- Public clients are read-only.
- Referee/Scorer can operate only assigned matches.
```

### Security Checks

```md
- Authentication checked server-side.
- Permission checked server-side.
- Match assignment checked server-side.
- Payload validated server-side.
- Rate limit considered.
- Audit log written for privileged/correction actions.
```

---

## O. Rules Engine Impact

```md
## Rule Functions Used
- canStartMatch
- canEndPeriod
- shouldCreateOvertime
- canGrantTimeout
- getTeamFoulPenaltyState
- getPlayerFoulStatus
- decideShotClockReset
- canApplyCorrection

## Rule Source
- RULES_PROFILE_FIBA.md
- RULES_ENGINE_SPEC.md
- Additional source: <file or NONE>

## Unknown Rules
If unknown official rule is needed:
[NEEDS SOURCE] Missing governing document: <rule area>
```

---

## P. UI Impact

```md
## UI Screens Affected
- Main live scoreboard dashboard
- Match pairing dashboard
- Score control dashboard
- Foul control dashboard
- Clock and shot clock dashboard
- Timeout dashboard
- Match summary dashboard
- Replay dashboard
- Admin tournament dashboard

## UI State Changes
- <state change>

## User Feedback Required
- loading
- command pending
- command accepted
- command rejected
- stale state
- reconnecting
- full sync required
- permission denied
```

### UI Safety Rules

```md
- UI must not mutate authoritative state locally.
- UI may optimistically show pending state only if clearly marked.
- Correction actions require confirmation and reason.
- Dangerous actions require confirmation or long press.
- Show current event sequence.
- Show connection status.
- Show stale state warning.
```

---

## Q. Tests Required

```md
## Unit Tests
- <test case>

## Integration Tests
- <test case>

## API Tests
- <test case>

## UI Tests
- <test case>

## E2E Tests
- <test case>

## Regression Tests
- <test case>

## Manual Verification
- <step 1>
- <step 2>
- <step 3>
```

### Minimum Test Areas

ทุก feature ที่แตะ live match ต้องพิจารณา test กลุ่มนี้:

```txt
game clock
shot clock
scoring
team fouls
player fouls
timeout
overtime
correction
replay
RBAC
polling reconnect
optional socket reconnect
duplicate commands
concurrent operator actions
projection rebuild
audit log
```

---

## R. Edge Cases To Cover

```md
## Edge Cases
- Duplicate commandId
- expectedSeq conflict
- Operator reconnects with stale state
- Public scoreboard receives stale projection
- Correction after period end
- Correction after match final
- MariaDB transaction rollback
- Projection rebuild after bug
- User without permission attempts command
- Two operators submit same action at same seq
```

---

## S. Acceptance Criteria

```md
## Acceptance Criteria
- <criterion 1>
- <criterion 2>
- <criterion 3>
```

### Standard Acceptance Criteria

```md
- Feature does not bypass event sourcing.
- Feature does not mutate historical events.
- Feature validates input with Zod.
- Feature enforces RBAC server-side.
- Feature handles duplicate commandId.
- Feature handles expectedSeq conflict.
- Feature updates projection from event.
- Projection is rebuildable from match_events.
- Polling reconnect returns correct state.
- Tests are added and passing.
- Manual verification steps are documented.
```

---

## T. Risks

```md
## Risks
- <risk 1>
- <risk 2>

## Mitigation
- <mitigation 1>
- <mitigation 2>
```

### Risk Categories

```txt
RULE_RISK
EVENT_MODEL_RISK
DATABASE_RISK
REALTIME_RISK
RBAC_RISK
CORRECTION_RISK
UI_SAFETY_RISK
HOSTING_RISK
MATCH_DAY_RISK
```

---

## U. Rollback Plan

```md
## Rollback Plan
- <how to rollback code>
- <how to rollback migration>
- <how to rebuild projection>
- <how to recover from partial failure>
```

### Rollback Rules

```md
- Historical events must not be deleted.
- If a bug creates wrong event, fix with correction event.
- If projection is wrong, rebuild projection from match_events.
- If migration fails, stop deployment and restore database backup.
```

---

## V. Required Agent Output

AI agent ต้องตอบผลลัพธ์สุดท้ายด้วย format นี้ทุกครั้ง

```md
# Implementation Report

## 1. Summary
<what was implemented>

## 2. Files Changed
- <file path>: <reason>

## 3. Domain Impact
<domain changes>

## 4. Event Impact
<events added/used/changed>

## 5. API Impact
<endpoints added/changed>

## 6. Database Impact
<migrations/tables/indexes>

## 7. UI Impact
<screens/components changed>

## 8. Security Impact
<RBAC/auth changes>

## 9. Tests Added
- <test>

## 10. Tests Not Added
- <test and reason>

## 11. Risks
<remaining risks>

## 12. Manual Verification Steps
- <step>

## 13. Rollback Notes
<rollback notes>

## 14. Next Safe Step
<next step>
```

---

## W. Stop Conditions

AI agent ต้องหยุดและถาม Architect/Product Owner ก่อนทำต่อ ถ้าเจอเงื่อนไขเหล่านี้:

```md
- ต้องเปลี่ยน event metadata
- ต้องลบหรือแก้ historical event
- ต้องเปลี่ยน rules profile
- ต้องเดากติกาทางการ
- ต้องเปลี่ยน permission model
- ต้องเปิด public write endpoint
- ต้อง bypass RBAC เพื่อให้เทสผ่าน
- ต้องใช้ background worker ถาวรบน Hostatom/Plesk
- ต้องใช้ Python/FastAPI/Uvicorn/Alembic
- ต้องใช้ PostgreSQL-specific feature ใน MariaDB mode
- ต้องเพิ่ม dependency ใหญ่ที่ hosting อาจไม่รองรับ
- ต้องแก้ production data
- ต้องแก้ migration ที่รันไปแล้ว
- ต้องใช้ socket เป็น source of truth
- ต้องใช้ client-calculated score/foul/clock เป็น authoritative state
```

---

## X. Forbidden Agent Behavior

AI agent ห้ามทำสิ่งต่อไปนี้:

```md
- ห้ามตอบว่า done โดยไม่มี tests
- ห้ามแก้ database schema โดยไม่สร้าง migration
- ห้ามแก้ event model โดยไม่ระบุ impact
- ห้าม hard-code FIBA rules ใน UI component
- ห้าม trust role/permission จาก client
- ห้ามให้ Viewer หรือ Public ส่ง live commands
- ห้าม update scoreboard_state เป็น truth หลัก
- ห้ามใช้ setInterval backend เป็น authoritative clock
- ห้ามลบ event เพื่อ undo
- ห้ามแก้ projection ด้วย manual SQL โดยไม่อธิบาย rebuild path
- ห้ามสร้าง socket command handler คนละ logic กับ REST command handler
- ห้ามสร้าง code ที่ใช้ได้เฉพาะ local แต่ deploy บน Hostatom/Plesk ไม่ได้
```

---

## Y. Pre-Flight Checklist

ก่อนเริ่ม implement AI agent ต้องตอบ checklist นี้:

```md
## Pre-Flight Checklist
- [ ] I read all required files.
- [ ] I understand the task scope.
- [ ] I identified affected domain entities.
- [ ] I identified affected event types.
- [ ] I identified affected projections.
- [ ] I identified required permissions.
- [ ] I identified API/socket impact.
- [ ] I identified database impact.
- [ ] I identified tests required.
- [ ] I identified edge cases.
- [ ] I found no stop condition.
```

ถ้ามี stop condition ให้หยุดและรายงานทันที

---

## Z. Mini Templates

### Z.1 Score Command Task

```md
## Task
Implement score add command for Home/Away +1/+2/+3.

## Task Type
API_IMPLEMENTATION

## In Scope
- POST /api/v1/matches/:matchId/commands/score
- SCORE_ADDED event
- live_scoreboard_projection update
- duplicate command handling
- expectedSeq conflict handling
- scorer/admin permission
- tests

## Out of Scope
- player scoring attribution
- shot chart
- box score advanced stats

## Events To Add
- SCORE_ADDED

## Projections Affected
- live_scoreboard_projection
- operator_score_projection
- match_summary_projection
- replay_timeline_projection

## Required Tests
- home +1
- home +2
- home +3
- away +1
- away +2
- away +3
- duplicate commandId
- expectedSeq conflict
- viewer denied
- public denied
```

---

### Z.2 Shot Clock Reset Task

```md
## Task
Implement shot clock reset commands for 24 and 14 seconds.

## Task Type
RULES_ENGINE

## In Scope
- RESET_SHOT_CLOCK_24 command
- RESET_SHOT_CLOCK_14 command
- SHOT_CLOCK_RESET_24 event
- SHOT_CLOCK_RESET_14 event
- shot_clock_projection update
- scorer/admin permission
- tests

## Out of Scope
- automatic full FIBA shot clock decision matrix
- referee signal recognition

## Events To Add
- SHOT_CLOCK_RESET_24
- SHOT_CLOCK_RESET_14

## Required Tests
- reset 24
- reset 14
- reset while game clock stopped
- reset while shot clock running
- duplicate command
- expectedSeq conflict
```

---

### Z.3 Correction Task

```md
## Task
Implement correction request and correction application flow.

## Task Type
FEATURE

## In Scope
- correction reason required
- CORRECTION_REQUESTED
- correction compensating event
- CORRECTION_APPLIED
- audit log
- admin/scorer permission rules
- replay timeline update

## Out of Scope
- automatic official protest handling

## Events To Add
- CORRECTION_REQUESTED
- CORRECTION_APPLIED
- event-specific compensating event

## Required Tests
- correction without reason rejected
- viewer denied
- public denied
- original event unchanged
- compensating event created
- projection updated
- replay timeline shows original and correction
```

---

### Z.4 Polling Reconnect Task

```md
## Task
Implement polling reconnect sync using lastEventSeq.

## Task Type
REALTIME_SYNC

## In Scope
- GET /api/v1/matches/:matchId/sync
- lastEventSeq query
- missedEvents response
- full projection fallback
- stale state UI warning
- public scoreboard sync

## Out of Scope
- Socket.IO connection recovery

## Required Tests
- client up to date
- client missed 1 event
- client missed many events
- lastEventSeq too old
- invalid match id
- viewer/public read-only
```

---

## AA. Definition Of Ready

Task พร้อมให้ AI agent ทำเมื่อ:

```md
- [ ] มี task summary ชัดเจน
- [ ] ระบุ task type แล้ว
- [ ] ระบุ in scope / out of scope แล้ว
- [ ] ระบุ files to read แล้ว
- [ ] ระบุ affected domain/event/projection/API/database/UI แล้ว
- [ ] ระบุ permissions แล้ว
- [ ] ระบุ tests แล้ว
- [ ] ระบุ edge cases แล้ว
- [ ] ไม่มี stop condition ที่ยังไม่ตัดสินใจ
```

---

## AB. Definition Of Done

Task เสร็จจริงเมื่อ:

```md
- [ ] Code implements requested behavior.
- [ ] No historical events are mutated/deleted.
- [ ] Event metadata is complete.
- [ ] RBAC enforced server-side.
- [ ] Payloads validated with Zod.
- [ ] MariaDB transaction safety preserved.
- [ ] Projections updated from events.
- [ ] Projections can be rebuilt.
- [ ] Polling reconnect works.
- [ ] Duplicate command handled.
- [ ] Concurrent expectedSeq conflict handled.
- [ ] Tests added and passing.
- [ ] Manual verification documented.
- [ ] Risks documented.
- [ ] Rollback notes documented.
- [ ] Acceptance criteria satisfied.
```

---

## AC. Final Reminder For AI Agent

[SYSTEM RECOMMENDATION] ทำให้ระบบใช้งานในสนามจริงได้ก่อน แล้วค่อยทำให้สวยขึ้น

ห้ามเลือกทางลัดที่ทำให้:

- replay ไม่ได้
- audit ไม่ครบ
- correction ทำลาย history
- public scoreboard ส่ง command ได้
- reconnect แล้ว state ผิด
- operator สองคนกดพร้อมกันแล้ว event sequence พัง
- ใช้งานบน Hostatom/Plesk ไม่ได้
- deploy แล้วต้องใช้ SSH/Python/background process ที่ hosting ไม่รองรับ

ถ้าไม่แน่ใจ ให้หยุดและถาม ไม่ใช่เดา
