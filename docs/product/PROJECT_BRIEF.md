# PROJECT_BRIEF.md

> Version: 1.0  
> Project: Basketball Scoreboard and Tournament Management Web Application  
> Default Rules Profile: FIBA-first  
> Primary Audience: AI Coding Agent, AI Pair Programmer, Human Developer, Product Owner, System Architect  
> Status: Canonical project overview for implementation planning

---

## 0. Purpose of This Document

This document gives AI agents and developers the full product context before any implementation work begins.

The system is **not a simple scoreboard demo**. It is a production-grade web application for:

- live basketball match operation,
- tournament management,
- team and roster management,
- real-time multi-screen scoreboard display,
- official match record keeping,
- correction and audit tracking,
- replay and post-game summary,
- role-based access control.

AI agents must read this file before generating architecture, database schema, APIs, Socket.IO events, UI screens, tests, or implementation code.

---

## 1. Product Goal

[SYSTEM RECOMMENDATION]

Build a **web-based Basketball Scoreboard and Tournament Management system** that can be used in real competitions by operators, scorers, referees, tournament admins, viewers, and public display screens.

The product must support both:

1. **Live match control**
   - game clock,
   - shot clock,
   - score,
   - team fouls,
   - player fouls,
   - timeout,
   - possession,
   - period and overtime,
   - public scoreboard display.

2. **Tournament operations**
   - tournaments,
   - stages,
   - teams,
   - players,
   - rosters,
   - schedules,
   - match pairings,
   - standings,
   - match summaries,
   - historical replay,
   - audit trail.

The product must be designed as a **basketball operations platform**, not just a page that shows two scores.

---

## 2. Product Vision

[SYSTEM RECOMMENDATION]

The long-term vision is to create a system that can support basketball events from a small school tournament to a semi-professional competition.

The system should allow:

- tournament organizers to create competitions,
- admins to register teams and players,
- scorers to operate live matches,
- referees or authorized officials to verify corrections,
- viewers to see public live scoreboards,
- teams to review match results,
- tournament admins to publish official summaries,
- auditors to reconstruct what happened in a match from event history.

The system should be reliable enough that, after the match, users can answer:

- Who changed the score?
- When was the foul added?
- Which device submitted the correction?
- What was the previous value?
- What is the current official value?
- Why was a correction made?
- Can the match be replayed from the event stream?

---

## 3. Existing System Capabilities

[ASSUMPTION]

The previous system already provides a strong single-match scoreboard foundation.

Existing capabilities include:

- two team names,
- quarter duration setting,
- number of quarters setting,
- team foul limit setting,
- shot clock support,
- start and stop game clock,
- reset shot clock,
- add and subtract score,
- add and subtract fouls,
- switch possession or offensive direction,
- keyboard-based operation,
- two-screen operation:
  - operator screen,
  - public scoreboard screen.

[SYSTEM RECOMMENDATION]

The new system should preserve the speed and simplicity of the existing live operation workflow, while adding production-grade data structure, auditability, permissions, tournament support, and real-time reliability.

---

## 4. Problem Statement

[SYSTEM RECOMMENDATION]

A basic scoreboard can display numbers, but it usually fails when real competition workflows appear:

- score is assigned to the wrong team,
- foul is assigned to the wrong player,
- shot clock is reset incorrectly,
- operator presses a shortcut twice,
- two operators send commands at the same time,
- public scoreboard loses connection,
- tournament standings must update after a corrected result,
- a match needs to be replayed later,
- a correction needs a reason and audit trail,
- different user roles need different permissions.

This system must solve those real operational problems from the beginning.

---

## 5. Core Product Principles

AI agents must preserve these principles across all generated work.

### 5.1 Match Events Are the Source of Truth

[SYSTEM RECOMMENDATION]

The authoritative match record must be an append-only `match_events` stream.

Do not treat a mutable `scoreboard_state` row as the source of truth.

Scoreboard state, match summary, player stats, foul display, timeout display, replay timeline, and standings are projections derived from events.

### 5.2 Corrections Must Not Destroy History

[SYSTEM RECOMMENDATION]

Corrections must be handled using compensating events.

Do not update or delete historical events to hide mistakes.

Every correction must preserve:

- original event,
- correction event,
- actor,
- role,
- device,
- timestamp,
- old value,
- new value,
- reason,
- correlation ID,
- causation ID,
- event sequence.

### 5.3 Realtime Broadcast Is Not Persistence

[SYSTEM RECOMMENDATION]

Socket.IO broadcasts are only a delivery mechanism.

The system must persist events first, then broadcast accepted events or projected state.

If a client disconnects, it must recover state from:

- latest snapshot,
- last known event sequence,
- missed events,
- full state resync if needed.

### 5.4 Never Trust Client State

[SYSTEM RECOMMENDATION]

Clients may send commands, but the server must validate all domain rules and permissions.

Never trust client-submitted:

- score,
- foul count,
- player foul count,
- clock state,
- shot clock state,
- role,
- permission,
- event sequence,
- match authority.

### 5.5 Rules Must Be Profile-Based

[SYSTEM RECOMMENDATION]

FIBA is the default rules profile.

Rules must be implemented through configurable rule profiles, not hard-coded across UI and backend.

If a rule is not available in loaded source documents, AI agents must mark:

`[NEEDS SOURCE] Missing governing document: <rule area>`

---

## 6. Target Users

### 6.1 Admin

Admin users manage the whole competition.

Admin can manage:

- tournaments,
- stages,
- groups,
- teams,
- players,
- rosters,
- matches,
- schedules,
- venues,
- courts,
- users,
- roles,
- permissions,
- rule profiles,
- correction approval,
- audit review.

Admin must not bypass audit logging.

### 6.2 Referee / Scorer / Operator

Referee, scorer, or operator users control assigned matches.

They can operate:

- score,
- game clock,
- shot clock,
- team fouls,
- player fouls,
- timeouts,
- period transitions,
- overtime,
- possession,
- correction workflow within permission scope.

They must only operate matches assigned to them or authorized by Admin.

### 6.3 Viewer

Viewer users are read-only.

Viewer can see:

- public scoreboard,
- schedule,
- match result,
- standings,
- match summary.

Viewer must not send live match commands.

### 6.4 Public Display Screen

Public display screens are read-only clients designed for full-screen 16:9 scoreboard display.

They should receive live projected state only.

They must not receive hidden admin/correction controls.

### 6.5 AI Agent

AI agents assist with design, coding, testing, review, and documentation.

AI agents must follow:

- `AI_AGENT_RULES.md`,
- this project brief,
- approved architecture docs,
- approved event model,
- approved database schema,
- approved security model,
- approved test plan.

---

## 7. New System Scope

The new system must support the following product areas.

### 7.1 Tournament Management

The system must support:

- create tournament,
- edit tournament settings,
- define competition format,
- define rule profile,
- manage stages,
- manage groups,
- manage schedule,
- assign venues and courts,
- manage match status,
- publish results,
- calculate standings,
- update brackets or pairings.

Initial supported formats may be limited by MVP, but the architecture must allow future formats.

Recommended format priority:

1. Single match operation,
2. Round Robin,
3. Group Stage + Single Elimination Playoff,
4. Single Elimination,
5. Best-of Series,
6. 2-game Aggregate,
7. Double Elimination,
8. Swiss system.

Swiss and advanced formats can be post-MVP unless explicitly prioritized.

### 7.2 Team Management

The system must support:

- create team,
- edit team name and abbreviation,
- team logo or colors,
- assign team to tournament,
- activate or deactivate team,
- manage tournament-specific team profile.

### 7.3 Player and Roster Management

The system must support:

- create player,
- assign player to team,
- assign jersey number,
- assign player to tournament roster,
- assign player to match roster,
- active/inactive status,
- starter/substitute marker if implemented later,
- jersey number validation,
- player eligibility notes.

[NEEDS SOURCE]

Official roster limits and eligibility constraints must be verified from governing rule documents or tournament regulations before enforcement.

### 7.4 Match Scheduling

The system must support:

- create match,
- assign home and away teams,
- assign venue,
- assign court,
- set match date and time,
- set match status,
- assign officials or operators,
- link match to tournament stage,
- link match to group or bracket,
- handle postponed or cancelled matches.

### 7.5 Game Clock

The system must support:

- configure period duration,
- start clock,
- stop clock,
- set clock,
- end period,
- start next period,
- handle interval,
- handle overtime,
- record clock-related events.

Clock operation must be server-authoritative.

### 7.6 Shot Clock

The system must support:

- configure shot clock duration,
- start shot clock,
- stop shot clock,
- reset to 24,
- reset to 14,
- manual set,
- synchronize with game clock when needed,
- record shot clock events.

[NEEDS SOURCE]

Every detailed automatic shot clock decision must be based on the active rule profile document.

### 7.7 Score Control

The system must support:

- add 1 point,
- add 2 points,
- add 3 points,
- subtract score only through correction flow or explicit correction event,
- assign points to team,
- optionally assign scorer player,
- validate match state before accepting score,
- record score event,
- update scoreboard projection.

### 7.8 Team Fouls

The system must support:

- add team foul,
- display team fouls by period,
- reset or roll over according to active rule profile,
- detect penalty state,
- correction flow for wrong team foul.

### 7.9 Player Fouls

The system must support:

- assign foul to player,
- track player foul count,
- display foul state,
- detect foul-out according to rule profile,
- handle foul correction,
- optionally classify foul type.

[NEEDS SOURCE]

Detailed penalty matrix for technical, unsportsmanlike, disqualifying, special situations, and correctable errors requires loaded governing documents before implementation.

### 7.10 Timeout

The system must support:

- request timeout,
- grant timeout,
- track timeout quota,
- display remaining timeout,
- timeout clock,
- timeout correction,
- timeout validation by rule profile.

### 7.11 Overtime

The system must support:

- detect tied score at end of regulation,
- create overtime period,
- configure overtime duration,
- track overtime-specific timeout rules,
- support multiple overtime periods until winner exists.

### 7.12 Main Live Scoreboard Dashboard

The system must support a public scoreboard display showing:

- team names,
- team scores,
- period,
- game clock,
- shot clock,
- team fouls,
- timeout indicators,
- possession indicator,
- optional tournament/match metadata.

This dashboard must be read-only.

### 7.13 Match Pairing Dashboard

The system must support a dashboard for:

- upcoming matches,
- active matches,
- completed matches,
- court assignment,
- stage/group context,
- next pairing,
- bracket or group progress.

### 7.14 Score Control Dashboard

The system must support a fast operator screen for:

- score add buttons,
- quick correction entry,
- current score,
- event sequence,
- connection status,
- confirmation for risky actions,
- keyboard shortcuts.

### 7.15 Foul Control Dashboard

The system must support:

- team foul controls,
- player foul controls,
- player list by team,
- foul-out warning,
- penalty state indicator,
- correction flow.

### 7.16 Match Summary Dashboard

The system must support:

- final score,
- period-by-period score,
- fouls summary,
- timeout summary,
- key event timeline,
- official result status,
- correction history,
- export or print support in later phases.

### 7.17 Historical Replay

The system must support:

- replay match events from sequence 1 to final sequence,
- rebuild match state at any event sequence,
- inspect corrections,
- compare original event and correction event,
- show timeline for audit review.

### 7.18 Undo / Correction / Audit Log

The system must support:

- correction request,
- correction approval if required,
- correction reason,
- compensating event,
- audit log,
- actor tracking,
- device tracking,
- old and new values,
- event sequence,
- correlation ID,
- causation ID.

### 7.19 Multi-Screen Realtime Operation

The system must support multiple live clients:

- operator screen,
- public scoreboard screen,
- foul control screen,
- match summary screen,
- admin dashboard,
- viewer clients.

All clients must sync through server-authoritative events and projections.

### 7.20 Role-Based Access Control

The system must support:

- Admin,
- Referee / Scorer,
- Viewer,
- possible future roles:
  - Tournament Manager,
  - Court Manager,
  - Stats Keeper,
  - Media Display Operator.

Authorization must be enforced server-side.

---

## 8. Out of Scope for MVP

[ASSUMPTION]

The following features are not required for first production MVP unless Product Owner explicitly prioritizes them:

- automated referee whistle detection,
- camera-based score recognition,
- OCR from physical scoresheets,
- advanced player statistics,
- shot chart,
- live video streaming,
- payment system,
- mobile app store release,
- AI automatic rule adjudication,
- NCAA/NBA complete rule support,
- fully automated bracket generation for all formats,
- federation-level registration system.

---

## 9. MVP Scope Recommendation

[SYSTEM RECOMMENDATION]

The safest MVP should focus on one complete vertical slice:

### MVP Goal

Operate one live basketball match with real-time public scoreboard, event history, corrections, audit log, and basic tournament linkage.

### MVP Must Include

- user login,
- role-based access,
- create tournament,
- create teams,
- create players,
- create match,
- assign teams to match,
- operator dashboard,
- public scoreboard dashboard,
- game clock controls,
- shot clock controls,
- score controls,
- team foul controls,
- basic player foul controls,
- timeout tracking,
- period and overtime support,
- append-only match events,
- projections,
- snapshots,
- correction flow,
- audit log,
- Socket.IO match room,
- reconnect recovery,
- test coverage for key flows.

### MVP May Defer

- complex bracket automation,
- advanced standings tiebreak explanation,
- detailed foul penalty matrix,
- full statistics engine,
- export to PDF,
- multi-language UI,
- advanced admin analytics.

---

## 10. Recommended Phase Plan

### Phase 0 — Documentation and Architecture Lock

Create and approve:

- `AI_AGENT_RULES.md`,
- `PROJECT_BRIEF.md`,
- `ARCHITECTURE_PRINCIPLES.md`,
- `DOMAIN_MODEL.md`,
- `EVENT_MODEL.md`,
- `DATABASE_SCHEMA.md`,
- `API_CONTRACTS.md`,
- `SOCKET_CONTRACTS.md`,
- `SECURITY_MODEL.md`,
- `TEST_PLAN.md`.

No production coding should start before these files are drafted.

### Phase 1 — Project Scaffold

Implement:

- monorepo or app structure,
- backend framework,
- frontend framework,
- database connection,
- authentication base,
- test runner,
- linting,
- formatting,
- environment configuration.

### Phase 2 — Event Store and Match Aggregate

Implement:

- `match_events`,
- event append transaction,
- optimistic concurrency,
- match snapshot,
- projection rebuild,
- command validation,
- event sequence.

### Phase 3 — Live Match Controls

Implement:

- score commands,
- clock commands,
- shot clock commands,
- foul commands,
- timeout commands,
- period commands,
- basic correction commands.

### Phase 4 — Realtime Screens

Implement:

- match socket rooms,
- operator dashboard,
- public scoreboard,
- reconnect flow,
- missed event replay,
- state hydration.

### Phase 5 — Tournament Core

Implement:

- tournament creation,
- teams,
- players,
- rosters,
- match scheduling,
- match pairing dashboard,
- match result publication.

### Phase 6 — Replay, Summary, Audit

Implement:

- replay timeline,
- match summary,
- correction history,
- audit log search,
- export-ready data model.

---

## 11. Match Lifecycle

[SYSTEM RECOMMENDATION]

A match should move through a controlled lifecycle.

Recommended match statuses:

```txt
DRAFT
SCHEDULED
READY_FOR_SETUP
PRE_GAME
LIVE
PERIOD_BREAK
HALFTIME
TIMEOUT
OVERTIME_PENDING
FINISHED_UNOFFICIAL
UNDER_REVIEW
OFFICIAL
CORRECTED
CANCELLED
POSTPONED
```

### Lifecycle Rules

- Match cannot go live without teams.
- Match cannot go live without active rule profile.
- Match cannot be official without final score.
- Post-game corrections require reason.
- Corrections after official status may require Admin permission.
- Tournament standings should use official or configured result status only.

---

## 12. Tournament Lifecycle

[SYSTEM RECOMMENDATION]

A tournament should move through:

```txt
DRAFT
REGISTRATION_OPEN
REGISTRATION_CLOSED
SCHEDULED
IN_PROGRESS
RESULTS_PENDING
COMPLETED
ARCHIVED
CANCELLED
```

### Tournament Rules

- Draft tournaments can be edited freely by Admin.
- Scheduled tournaments should restrict destructive edits.
- In-progress tournaments must preserve match and roster history.
- Completed tournaments should require elevated permission for corrections.
- Standings and brackets must be recomputed from official match results.

---

## 13. Core Domain Objects

The system should include at least these domain objects.

```txt
Organization
Tournament
Stage
Group
Venue
Court
Team
Player
TournamentRoster
Match
MatchRoster
MatchOfficial
RuleProfile
MatchEvent
MatchSnapshot
MatchProjection
AuditLog
User
Role
Permission
DeviceSession
```

### Important Domain Distinctions

Do not confuse:

- `Team` with `TournamentRoster`,
- `TournamentRoster` with `MatchRoster`,
- `Match` with `MatchEvent`,
- `MatchProjection` with official match history,
- `ScoreboardDisplayState` with source of truth,
- `UserRole` with server permission,
- `SocketConnection` with authorization.

---

## 14. Data Ownership and Source of Truth

[SYSTEM RECOMMENDATION]

### Source of Truth

| Data Area | Source of Truth |
|---|---|
| Match timeline | `match_events` |
| Current live match state | projection from `match_events` |
| Public scoreboard | live scoreboard projection |
| Replay | ordered event stream |
| Audit history | `audit_logs` + event metadata |
| Tournament standings | official match result projections |
| Roster history | tournament roster and match roster records |
| User permissions | server-side RBAC tables |
| Socket state | temporary connection state only |

### Important Rule

A projection can be deleted and rebuilt.

An event must not be deleted or rewritten.

---

## 15. Realtime Operation Requirements

[SYSTEM RECOMMENDATION]

The system must support one Socket.IO room per match.

Recommended rooms:

```txt
match:{matchId}:public
match:{matchId}:operator
match:{matchId}:admin
```

### Operator Clients

Operator clients may send commands only if authorized.

Every command must include:

```ts
{
  commandId: string;
  matchId: string;
  expectedSeq: number;
  correlationId: string;
  timestamp: string;
  payload: unknown;
}
```

### Public Clients

Public clients are read-only.

They receive:

- projected scoreboard state,
- event sequence,
- connection status,
- match status.

### Reconnect Flow

On reconnect, client sends:

```ts
{
  matchId: string;
  lastEventSeq: number;
}
```

Server returns:

```ts
{
  currentSnapshot: object;
  missedEvents: MatchEvent[];
  currentSeq: number;
  fullStateSyncRequired: boolean;
}
```

---

## 16. Security Requirements

[SYSTEM RECOMMENDATION]

Security must be built into the first implementation, not added later.

### Required Security Policies

- deny by default,
- authenticate all protected APIs,
- authorize every REST request,
- authorize every socket command,
- validate every payload server-side,
- never trust client role,
- never trust client score/foul/clock state,
- require correction reason,
- audit every privileged action,
- use secure session handling,
- rate-limit sensitive endpoints,
- prevent duplicate command execution,
- store device/session metadata where possible.

### Minimum Roles

```txt
ADMIN
SCORER
REFEREE
VIEWER
```

### Match-Level Authorization

A scorer or referee may operate only assigned matches unless Admin grants broader permission.

---

## 17. UX Requirements

[SYSTEM RECOMMENDATION]

Operator screens must prioritize speed and error prevention.

### Operator UI Principles

- large buttons,
- high contrast,
- touchscreen friendly,
- keyboard shortcuts,
- clear active team state,
- clear possession indicator,
- visible period and clock state,
- visible connection state,
- visible latest sequence number,
- confirmation for dangerous actions,
- correction reason modal,
- avoid crowded screens,
- separate score and foul controls if needed.

### Public Scoreboard UI Principles

- full-screen 16:9 layout,
- distant readability,
- large score numbers,
- clear team names,
- clear game clock,
- clear shot clock,
- minimal distractions,
- resilient reconnect indicator,
- no operator controls.

---

## 18. Testing Expectations

[SYSTEM RECOMMENDATION]

The product must include automated tests for:

- score commands,
- game clock commands,
- shot clock commands,
- team foul commands,
- player foul commands,
- timeout commands,
- period transition,
- overtime,
- correction,
- audit log,
- replay,
- projection rebuild,
- RBAC,
- socket authorization,
- reconnect recovery,
- duplicate command handling,
- concurrent operator commands,
- tournament result publication,
- standings recomputation after correction.

No feature is complete without tests for domain rules, permissions, and failure cases.

---

## 19. Acceptance Criteria

A first production MVP is acceptable only when all of the following are true.

### Live Match

- Operator can run a match from pre-game to finished.
- Scoreboard updates in realtime.
- Public display is read-only.
- Score, fouls, timeout, clock, shot clock, and period state are visible.
- Match state can be rebuilt from events.

### Event Store

- Every accepted command creates one or more events.
- Events are ordered by `match_id + seq_no`.
- Duplicate commands are rejected or idempotently handled.
- Concurrent commands with stale `expectedSeq` are rejected.

### Correction

- Correction requires permission.
- Correction requires reason.
- Original event remains unchanged.
- Correction creates compensating event.
- Audit log records actor, role, device, timestamp, old value, new value, reason, correlation ID, causation ID, and event sequence.

### Realtime

- Operator and public screens join match room.
- On reconnect, clients send `lastEventSeq`.
- Server returns missed events or full state sync.
- Socket broadcast is never the only source of truth.

### Security

- REST APIs enforce RBAC.
- Socket commands enforce RBAC.
- Client role is never trusted.
- Viewer cannot submit commands.
- Unauthorized commands are rejected and logged.

---

## 20. Non-Goals and Anti-Patterns

AI agents must avoid these mistakes.

### Non-Goals

Do not prioritize:

- beautiful UI without domain correctness,
- scoreboard demo without persistence,
- CRUD-only match state,
- client-only rules validation,
- hard-coded FIBA logic scattered across UI,
- socket-only event delivery,
- correction by editing old rows,
- admin bypass without audit.

### Forbidden Anti-Patterns

Never implement:

```txt
scoreboard_state as the only source of truth
update match_events set payload = ...
delete from match_events ...
client sends final score and server trusts it
socket message changes score without event persistence
public viewer socket can submit commands
correction without reason
manual database edit as normal correction flow
role check only in frontend
```

---

## 21. AI Agent Operating Instructions

Before starting any task, AI agents must:

1. Read `AI_AGENT_RULES.md`.
2. Read this `PROJECT_BRIEF.md`.
3. Identify affected domain areas.
4. Identify affected event types.
5. Identify affected API or socket contracts.
6. Identify security requirements.
7. Identify tests to add.
8. State assumptions.
9. Ask for approval only when the task changes approved architecture, event model, database schema, or official rule behavior.

For every implementation response, AI agents must include:

1. Assumptions
2. Domain model
3. Event model
4. API contracts
5. Socket contracts
6. Database changes
7. UI states
8. Test cases
9. Edge cases
10. Next safe implementation step

---

## 22. Open Questions

These questions must be answered by Product Owner or governing documents before final production implementation.

### Product Questions

- Which tournament format is required for MVP?
- Is player-level scoring required in MVP?
- Is substitution tracking required?
- Is offline mode required for match operation?
- Should correction require approval or only reason?
- Should public scoreboard be accessible without login?
- Should standings use only official results or live unofficial results too?
- Should match data be exportable to PDF or CSV?

### Rule Questions

- Which exact FIBA rule document version is approved?
- Are local tournament rules different from FIBA?
- Are youth basketball rules required?
- Are NBA or NCAA profiles required later?
- What official roster limits should be enforced?
- What foul penalty matrix must be implemented in MVP?

### Technical Questions

- NestJS or Fastify?
- Prisma or Drizzle?
- Redis required in MVP or later?
- Single-server deployment first or multi-server from day one?
- Cloud provider preference?
- Authentication provider preference?

---

## 23. Related Documents

AI agents should use this document together with:

```txt
/docs/agent/AI_AGENT_RULES.md
/docs/agent/AGENT_TASK_TEMPLATE.md
/docs/agent/CODE_REVIEW_CHECKLIST.md

/docs/product/PROJECT_BRIEF.md
/docs/product/MVP_SCOPE.md
/docs/product/USER_ROLES_AND_PERMISSIONS.md

/docs/rules/RULES_PROFILE_FIBA.md
/docs/rules/RULES_ENGINE_SPEC.md
/docs/rules/RULES_SOURCE_POLICY.md

/docs/architecture/ARCHITECTURE_PRINCIPLES.md
/docs/architecture/DOMAIN_MODEL.md
/docs/architecture/EVENT_MODEL.md
/docs/architecture/PROJECTION_MODEL.md
/docs/architecture/CORRECTION_MODEL.md
/docs/architecture/AUDIT_LOG_MODEL.md

/docs/api/API_CONTRACTS.md
/docs/api/SOCKET_CONTRACTS.md
/docs/api/ERROR_CODES.md

/docs/database/DATABASE_SCHEMA.md
/docs/database/EVENT_STORE_SCHEMA.md
/docs/database/SNAPSHOT_STRATEGY.md
/docs/database/MIGRATION_POLICY.md

/docs/security/SECURITY_MODEL.md
/docs/security/RBAC_POLICY.md
/docs/security/SOCKET_SECURITY.md

/docs/ui/UI_DASHBOARDS.md
/docs/ui/OPERATOR_SCREEN_SPEC.md
/docs/ui/PUBLIC_SCOREBOARD_SPEC.md
/docs/ui/CORRECTION_FLOW.md
/docs/ui/REPLAY_SCREEN_SPEC.md

/docs/quality/TEST_PLAN.md
/docs/quality/ACCEPTANCE_CRITERIA.md
/docs/quality/EDGE_CASES.md
/docs/quality/E2E_SCENARIOS.md
```

---

## 24. Definition of Done for This Document

This `PROJECT_BRIEF.md` is considered complete when:

- AI agent understands that this is not a simple scoreboard.
- Existing system capabilities are clearly listed.
- New product scope is clearly listed.
- MVP boundary is defined.
- Phase plan is defined.
- Roles and dashboards are defined.
- Match and tournament lifecycle are defined.
- Source of truth policy is defined.
- Realtime requirements are defined.
- Security expectations are defined.
- Testing expectations are defined.
- Open questions are listed.
- Related documents are linked.

---

## 25. Final Instruction to AI Agents

[SYSTEM RECOMMENDATION]

When in doubt, prefer:

- auditability over shortcut,
- event history over mutable state,
- server validation over client trust,
- rule profile over hard-code,
- explicit permission over implicit access,
- replayability over quick update,
- safe correction over silent edit,
- tests over assumptions.

If a requested implementation conflicts with this project brief, stop and report the conflict before coding.
