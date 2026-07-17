# Basketball Scoreboard & Tournament Management

## Linear Roadmap Master

Status: authoritative delivery roadmap

Baseline recorded: 2026-07-16

Fresh-session entrypoint: this file

## 1. Authority And Purpose

This document is the current source of truth for delivery order. Older roadmap, phase, slice, and release documents remain historical evidence and must not be deleted or rewritten to manufacture a new history.

- No top-level milestone may be skipped.
- Exactly one top-level milestone may be active at a time.
- Sub-slices are allowed only inside the current milestone and only when discovered risk justifies them.
- Visual completion does not equal production completion.
- Fixture completion does not equal backend integration.
- Integration does not equal production deployment.
- A production status requires owner/deployment evidence, not a local build or merged commit.

## 2. Mandatory Startup Protocol

Every task must read, in order:

1. `AGENTS.md`
2. `docs/ROADMAP_MASTER.md`
3. `README.md`
4. `docs/product/PROJECT_BRIEF.md`
5. `docs/ui/UI_DASHBOARDS.md`
6. `docs/architecture/EVENT_MODEL.md`
7. `docs/security/USER_ROLES_AND_PERMISSIONS.md`
8. `docs/api/API_CONTRACTS.md`

Then read milestone-specific architecture, rule, API/socket, database, UI, quality, and deployment files. Before editing, verify the branch, `main`, `origin/main`, working-tree cleanliness, current milestone, approved slice, and file allowlist.

## 3. Baselines

```text
Pre-RM-02-I repository main baseline:
84c1b92f4a333f3a76636bc6bca84f5ce721395e

Pre-RM-02-I origin/main baseline:
84c1b92f4a333f3a76636bc6bca84f5ce721395e

Post-RM-02-I main/origin target:
this RM-02 integration governance commit (`docs(roadmap): record rm02 integration gate`)

Previous proven production before RM-02:
50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8

Owner-approved production Git target:
d6183f783a017f7547dc9bd34d2e39f484be3b57

Application-equivalent RM-02 integration state:
5d2553aa1fc4a81e68feab4b847e1e97647a7644

Production deployment status:
PRODUCTION COMPLETE WITH OBSERVATION LIMITATION
```

Canonical visual-target directory (local evidence only; assets are not committed):

```text
C:\2025\web-69\BasketBallScoreBoard2026\web_ScoreBoard\UI-design
```

The directory contains the 15 expected targets plus one additional discovered target, `Main Live Scoreboard Dashboard.png`. See `docs/ui/UI_DESIGN_INVENTORY.md`.

## 4. Status Vocabulary

Use only these status values:

| Status | Definition |
|---|---|
| `PENDING` | Not started; a prior top-level milestone is active or required. |
| `CURRENT` | The only active top-level milestone. |
| `DISCOVERY COMPLETE` | Discovery, evidence, risks, and contracts are documented; implementation has not been claimed. |
| `IMPLEMENTATION COMPLETE` | Approved implementation is complete locally and focused checks pass; integration is not yet claimed. |
| `INTEGRATED` | Approved commit is on `main` and `origin/main`; production is not implied. |
| `READY FOR PRODUCTION` | Integrated and all approved pre-production gates passed; owner deployment is pending. |
| `PRODUCTION COMPLETE` | Deployment and required production verification are proven. |
| `PRODUCTION COMPLETE WITH OBSERVATION LIMITATION` | Production verification passed except for a documented, non-safety-critical observation that could not be exercised. |
| `BLOCKED` | Work cannot proceed without resolving an explicit technical, evidence, access, or baseline blocker. |
| `NEEDS PRODUCT DECISION` | Product-owner policy or behavior decision is required before implementation. |
| `NEEDS SOURCE` | Governing basketball/tournament source is missing; official-rule automation must not be invented. |

## 5. Linear Top-Level Roadmap

| ID | Milestone | Status |
|---|---|---|
| RM-00 | Accessibility Integration Baseline | `INTEGRATED` |
| RM-01 | Shared Design System & Application Shell | `INTEGRATED` |
| RM-02 | Public Scoreboard Visual Parity Closure | `PRODUCTION COMPLETE WITH OBSERVATION LIMITATION` |
| RM-03 | Unified LiveMatchShell Foundation | `CURRENT` |
| RM-04 | Clock & Shot Clock Dashboard | `PENDING` |
| RM-05 | Score Control Dashboard | `PENDING` |
| RM-06 | Foul Control Dashboard | `PENDING` |
| RM-07 | Timeout Dashboard | `PENDING` |
| RM-08 | Lineup / Roster Dashboard | `PENDING` |
| RM-09 | Match Pairing Dashboard | `PENDING` |
| RM-10 | Court Operations Dashboard | `PENDING` |
| RM-11 | Match Summary Dashboard | `PENDING` |
| RM-12 | Historical Replay Dashboard | `PENDING` |
| RM-13 | Admin Tournament Dashboard | `PENDING` |
| RM-14 | Rule Profile Dashboard | `PENDING` |
| RM-15 | Audit Log Dashboard | `PENDING` |
| RM-16 | Public Schedule Dashboard | `PENDING` |
| RM-17 | Public Standings Dashboard | `PENDING` |
| RM-18 | Full-System UI, Security, Realtime & Production Closure | `PENDING` |

Current milestone slice state:

```text
RM-00 = INTEGRATED
RM-01 = INTEGRATED
RM-02 = PRODUCTION COMPLETE WITH OBSERVATION LIMITATION
RM-02-D1 = DISCOVERY COMPLETE
RM-02-P1 = IMPLEMENTATION COMPLETE
RM-02-P2 = IMPLEMENTATION COMPLETE
RM-02-P3 = IMPLEMENTATION COMPLETE
RM-02-P4 = IMPLEMENTATION COMPLETE
RM-02-P5-F1 = IMPLEMENTATION COMPLETE
RM-02-P5 = IMPLEMENTATION COMPLETE
RM-02-I = INTEGRATED
RM-02-P = PRODUCTION COMPLETE WITH OBSERVATION LIMITATION
RM-03 = CURRENT
RM-03-D1 = DISCOVERY COMPLETE
RM-03-P1 = IMPLEMENTATION COMPLETE
RM-03-P2 = BLOCKED BY AUTHORITATIVE ACCESS CONTRACT GAP
RM-03-P2-F1 = PENDING (AUTHORIZED TO BEGIN)
RM-03-P3 = PENDING (NOT AUTHORIZED)
RM-03-P4 = PENDING
RM-03-P5 = PENDING
RM-03-I = PENDING
RM-04 through RM-18 = PENDING
Next safe step: RM-03-P2-F1 - Server-Authoritative Effective Match Access Contract
```

## 6. Straight-Line Diagram

```text
RM-00
  ↓
RM-01
  ↓
RM-02
  ↓
RM-03
  ↓
RM-04
  ↓
RM-05
  ↓
RM-06
  ↓
RM-07
  ↓
RM-08
  ↓
RM-09
  ↓
RM-10
  ↓
RM-11
  ↓
RM-12
  ↓
RM-13
  ↓
RM-14
  ↓
RM-15
  ↓
RM-16
  ↓
RM-17
  ↓
RM-18
```

There is no parallel top-level path.

## 7. Milestone Requirements

### RM-00 - Accessibility Integration Baseline

- Objective: integrate the approved public-display focus and keyboard baseline without changing domain behavior.
- Visual target: shared public controls across `PublicScoreBoard.png` and `Main Live Scoreboard Dashboard.png`.
- Intended roles: public display viewers and keyboard users.
- Current implementation state: `INTEGRATED` at `4811444d11bfa2458dc2cd1c3266b716efe29a1a`; production deployment is unproven.
- Domain/API/socket/database dependencies: none added; existing public read models only.
- Security: public controls stay read-only; no auth/session/private metadata exposure.
- Acceptance: native controls, visible focus, forced-colors fallback, reduced motion, and hidden-control focus recovery.
- Tests: focused keyboard/focus contract plus existing public-display regressions.
- Production gate: owner build/restart and read-only browser verification.
- Known blockers: deployment evidence for `4811444d...` is absent.
- Source requirements: WCAG behavior; no basketball rule dependency.
- Next milestone: RM-01.

### RM-01 - Shared Design System & Application Shell

- Objective: establish shared tokens and reusable public/authenticated shell primitives for all target dashboards without redesigning domain behavior.
- Visual target: common language across all files in `UI-design`.
- Intended roles: public, operator, scorer, timer, shot-clock operator, referee, and admin.
- Current implementation state: `INTEGRATED`; RM-01-D1 is `DISCOVERY COMPLETE`; RM-01-P1, RM-01-P1-I, RM-01-P2, RM-01-P2-I, RM-01-P3, RM-01-P3-I, RM-01-P4, RM-01-P4-I, and RM-01-P5 are `INTEGRATED`. Next safe step: RM-02 - Public Scoreboard Visual Parity Closure.
- Domain dependencies: none; presentation only in the first slices.
- API/socket dependencies: preserve current clients and contracts; no transport redesign.
- Database dependencies: none.
- Security: public and authenticated shells remain separate; no protected metadata in public composition.
- Acceptance: token primitives reduce duplication without changing routes, commands, projections, or authorization.
- Tests: token/component contracts, auth-boundary regressions, responsive and focus verification.
- Production gate: integrate all RM-01 slices, complete local browser matrix, then owner-approved deployment gate.
- Known blockers: the remaining product decisions listed in RM-01-D1.
- Source requirements: existing design targets and WCAG; no new rule logic.
- Next milestone: RM-02.

### RM-02 - Public Scoreboard Visual Parity Closure

- Objective: close public scoreboard parity while preserving public-safe real data.
- Visual target: `PublicScoreBoard.png` and `Main Live Scoreboard Dashboard.png`.
- Intended roles: public viewers and kiosk/display operators with no command authority.
- Current implementation state: `PRODUCTION COMPLETE WITH OBSERVATION LIMITATION`; RM-02-D1 is `DISCOVERY COMPLETE`; RM-02-P1 through RM-02-P5 and RM-02-P5-F1 are `IMPLEMENTATION COMPLETE`; RM-02-I is `INTEGRATED`; RM-02-P passed with the documented non-safety-critical observation limitations.
- Domain dependencies: existing public live scoreboard and final-summary projections only.
- API/socket dependencies: existing public HTTP/socket allowlist mappers; no private sequence or event payloads.
- Database dependencies: existing derived projections; no mutable source-of-truth table.
- Security: no auth bootstrap on public routes; read-only; sanitized DOM and payloads.
- Acceptance: accessible zoom fallback, broadcast rail polish, local FINAL_SUMMARY browser fixture, and production closure.
- Tests: public DOM/metadata/ticker/auth-boundary/final-summary tests plus five public broadcast viewports.
- Production gate: owner deployment and read-only route/DOM/console verification.
- Known blockers: none for RM-02 closure. Native fullscreen automation, native zoom automation, disposable database coverage, and a naturally available production FINAL_SUMMARY remain documented observation limitations.
- Source requirements: no new basketball automation.
- Next milestone: RM-03.

### RM-03 - Unified LiveMatchShell Foundation

- Objective: create one authenticated live-match shell shared by clock, score, foul, and timeout dashboards.
- Visual target: Clock, Score, Foul, Timeout, and shared header regions in operator targets.
- Intended roles: assigned scorer, assistant scorer, timer, shot-clock operator, match operator, and admin.
- Current implementation state: `CURRENT`; RM-03-D1 is `DISCOVERY COMPLETE`; RM-03-P1 is `IMPLEMENTATION COMPLETE`; RM-03-P2 is `BLOCKED BY AUTHORITATIVE ACCESS CONTRACT GAP`; RM-03-P2-F1 is `PENDING` and authorized as the next safe step; RM-03-P3 remains `PENDING (NOT AUTHORIZED)`. The presentation-only shell foundation exists, but production routes have not adopted it and shared realtime ownership is not implemented.
- Domain dependencies: existing live projections and command-state models.
- API/socket dependencies: protected REST plus current reconnect/polling/socket notification behavior.
- Database dependencies: active `match_officials` assignment and existing projections/event stream.
- Security: server-derived permissions and active assignment checks on every protected request.
- Acceptance: shared hydration, stale/offline/permission states, navigation, and role-aware command surfaces without client-trusted permission.
- Tests: cross-role route, reconnect, assignment revocation, command denial, and shell rendering.
- Production gate: DB-backed authorization verification before deployment.
- Known blockers: no protected response currently returns server-calculated per-match effective capabilities, so RM-03-P2 navigation cannot proceed safely. RM-03-P2-F1 must close this contract gap first. DB-backed active-assignment authorization evidence remains mandatory before RM-03 integration/deployment closure.
- Source requirements: none for shell mechanics.
- Next milestone: RM-04.

### RM-04 - Clock & Shot Clock Dashboard

- Objective: deliver the production-grade clock and shot-clock operator dashboard.
- Visual target: `Clock and Shot Clock Dashboard.png`.
- Intended roles: TIMER, SHOT_CLOCK_OPERATOR, MATCH_OPERATOR, ADMIN.
- Current implementation state: `/operator/matches/:matchId/clock` and `OperatorClockPage` exist but visual/role parity is incomplete.
- Domain dependencies: server-authoritative deadline clocks; period lifecycle; correction events.
- API/socket dependencies: existing protected clock/shot-clock commands, expected sequence, idempotency, reconnect.
- Database dependencies: append-only events and clock projections.
- Security: TIMER game clock only; SHOT_CLOCK_OPERATOR shot clock only; corrections independently authorized.
- Acceptance: large clocks, safe start/stop/reset/set/period controls, confirmation and stale-state handling.
- Tests: role matrix, duplicate/concurrent commands, reconnect drift, correction, and responsive operator matrix.
- Production gate: DB-backed command-denial/no-event proof and owner deployment.
- Known blockers: exact rule-supported reset decisions must remain server validated.
- Source requirements: loaded FIBA clock/shot-clock sources; unsupported decisions use `NEEDS SOURCE`.
- Next milestone: RM-05.

### RM-05 - Score Control Dashboard

- Objective: deliver fast, safe, production-grade score operation.
- Visual target: `UI Score Control Dashboard.png`.
- Intended roles: SCORER, ASSISTANT_SCORER, MATCH_OPERATOR, ADMIN.
- Current implementation state: `/operator/matches/:matchId/score` and `OperatorScorePage` exist; full visual and shared-shell parity is pending.
- Domain dependencies: score events, optional player attribution, correction workflow.
- API/socket dependencies: protected score commands with server validation, expected sequence, idempotency, reconnect.
- Database dependencies: append-only events and operator/public projections.
- Security: active assignment and granular score permission; no direct score mutation.
- Acceptance: large +1/+2/+3 controls, pending/accepted/rejected/sync states, recent events, correction entry.
- Tests: authorization, duplicate clicks, stale sequence, concurrency, correction, keyboard, and responsive layouts.
- Production gate: real DB command and public projection verification.
- Known blockers: player-attribution product policy.
- Source requirements: score values are domain facts; no invented rule automation.
- Next milestone: RM-06.

### RM-06 - Foul Control Dashboard

- Objective: deliver player/team foul operation and correction safety.
- Visual target: `UI Foul Control Dashboard.png`.
- Intended roles: SCORER, ASSISTANT_SCORER, MATCH_OPERATOR, ADMIN.
- Current implementation state: `/operator/matches/:matchId/fouls` and `OperatorFoulPage` exist; full parity is pending.
- Domain dependencies: roster eligibility, foul projection, foul-out state, compensating correction.
- API/socket dependencies: protected foul commands with expected sequence/idempotency.
- Database dependencies: append-only foul/correction events and projections.
- Security: active assignment; correction permission remains independent.
- Acceptance: player rows, foul types, team penalty warning, recent events, safe unsupported-rule messaging.
- Tests: role denial, roster validation, duplicate/stale command, correction, and accessibility.
- Production gate: DB-backed role/assignment tests and owner verification.
- Known blockers: complex penalty automation.
- Source requirements: `[NEEDS SOURCE]` for complete technical/unsportsmanlike/disqualifying/fighting penalty matrix.
- Next milestone: RM-07.

### RM-07 - Timeout Dashboard

- Objective: deliver production timeout operation with rule-aware availability and correction.
- Visual target: `Timeout Dashboard.png`.
- Intended roles: MATCH_OPERATOR and ADMIN for timeout/lifecycle commands; other roles only where server policy grants them.
- Current implementation state: `/operator/matches/:matchId/timeouts` and `OperatorTimeoutPage` exist; full parity is pending.
- Domain dependencies: timeout projection, lifecycle context, correction events.
- API/socket dependencies: protected timeout commands with server validation, expected sequence, idempotency.
- Database dependencies: append-only timeout events and projection.
- Security: timeout and lifecycle remain limited to MATCH_OPERATOR/ADMIN unless policy changes.
- Acceptance: quotas, active timeout state, warnings, grant/end/correction flows, no client rule decision.
- Tests: authorization matrix, unavailable timeout, duplicates, stale state, correction, responsive UI.
- Production gate: DB-backed command/no-event denial proof and owner verification.
- Known blockers: detailed live/dead-ball timeout eligibility.
- Source requirements: `[NEEDS SOURCE]` where official timeout interpretation is not loaded.
- Next milestone: RM-08.

### RM-08 - Lineup / Roster Dashboard

- Objective: deliver roster readiness, starters, captain, lock, and correction workflows.
- Visual target: `Lineup Dashboard.png`.
- Intended roles: admin and authorized assigned scorer/operator.
- Current implementation state: admin roster and lineup routes/components exist; production-grade visual and permission closure is pending.
- Domain dependencies: tournament roster, match roster, lineup events/read models, eligibility.
- API/socket dependencies: existing roster/lineup APIs; protected writes only.
- Database dependencies: roster tables plus event/audit evidence for match-affecting changes.
- Security: server validates eligibility, scope, locks, and correction authority.
- Acceptance: home/away roster panels, starter selection, readiness checklist, lock confirmation, audit-safe correction.
- Tests: eligibility, lock/revocation, role denial, duplicate actions, responsive table/touch behavior.
- Production gate: real roster/assignment verification.
- Known blockers: roster-lock and captain policy decisions.
- Source requirements: tournament eligibility governing document where required.
- Next milestone: RM-09.

### RM-09 - Match Pairing Dashboard

- Objective: provide real schedule pairing, readiness, court, official assignment, and guarded admin actions.
- Visual target: `Match Pairing Dashboard.png`.
- Intended roles: public viewer, operator, and admin with role-specific surfaces.
- Current implementation state: tournament schedule and operator match-list routes exist; the complete pairing dashboard route is not implemented.
- Domain dependencies: tournaments, stages/groups, teams, matches, rosters, officials, courts.
- API/socket dependencies: schedule reads and protected scheduling/assignment/lifecycle APIs; gaps require discovery.
- Database dependencies: competition, match, roster, court, and assignment tables.
- Security: public published rows only; admin writes server-authorized and audited.
- Acceptance: real pairing rows, filters, readiness, selected-match detail, guarded cancellation/change operations.
- Tests: publication filtering, role scopes, incomplete data, conflicts, confirmation, responsive layout.
- Production gate: real tournament data and audit verification.
- Known blockers: exact pairing/edit/cancel contracts need discovery.
- Source requirements: tournament scheduling policy.
- Next milestone: RM-10.

### RM-10 - Court Operations Dashboard

- Objective: provide venue/court readiness, assignment timeline, staff/display health, and safe actions.
- Visual target: `Court Dashboard.png`.
- Intended roles: admin, venue manager if approved, match coordinator.
- Current implementation state: dedicated court dashboard route/component is `NOT IMPLEMENTED`.
- Domain dependencies: venue, court, schedule, display screens, assignments, readiness.
- API/socket dependencies: venue/court/readiness/device-health contracts require discovery; no invented endpoint.
- Database dependencies: existing venue/court schema plus any approved readiness model.
- Security: protected operational data; public display status must not leak device/session identifiers.
- Acceptance: real court cards/timeline/readiness, conflicts, safe assignment actions, audit trail.
- Tests: role denial, conflict states, device/public boundary, responsive tablet layout.
- Production gate: real multi-court data verification.
- Known blockers: readiness and device-health contracts.
- Source requirements: venue operating policy.
- Next milestone: RM-11.

### RM-11 - Match Summary Dashboard

- Objective: deliver authoritative operator/admin summary and public-safe final result.
- Visual target: `Match Summary Dashboard.png`.
- Intended roles: assigned operator, admin, and public viewers for published allowlisted output.
- Current implementation state: admin/operator summary routes and public FINAL_SUMMARY scene exist; full visual parity and production closure are pending.
- Domain dependencies: authoritative final outcome, replay-consistent projections, correction state.
- API/socket dependencies: existing summary/final-summary contracts; public allowlist remains unchanged unless separately approved.
- Database dependencies: append-only events and rebuildable summary projections.
- Security: public summary excludes player IDs, audit/correction reasons, sequence, actors, devices, and unpublished data.
- Acceptance: final score, period breakdown, fouls/timeouts where authorized, official/publication state, guarded actions.
- Tests: replay/snapshot/correction consistency, public unavailable state, authorization, responsive layout.
- Production gate: real finalized match read-only verification; no destructive production correction test.
- Known blockers: publication/lock/reopen policy.
- Source requirements: official result and tournament publication policy.
- Next milestone: RM-12.

### RM-12 - Historical Replay Dashboard

- Objective: reconstruct historical match state and correction chains without modifying official state.
- Visual target: `Replay Dashboard.png`.
- Intended roles: admin and authorized assigned operators; public only if separately published.
- Current implementation state: admin/operator replay routes and `MatchReplayPage` exist; target parity is partial.
- Domain dependencies: ordered event stream, projection replay, correction chain.
- API/socket dependencies: existing replay reads; no command path from replay.
- Database dependencies: append-only `match_events` and optional derived snapshots.
- Security: read-only, scoped RBAC, private actor/audit detail protected.
- Acceptance: event timeline, state-at-sequence, correction links, step/jump/play controls with no writes.
- Tests: deterministic reconstruction, original-event preservation, correction chain, scope denial, responsive UI.
- Production gate: read-only replay of a real match.
- Known blockers: public replay policy and large-stream performance budget.
- Source requirements: none beyond event schema.
- Next milestone: RM-13.

### RM-13 - Admin Tournament Dashboard

- Objective: unify tournament setup, readiness, publishing, access, and audited actions.
- Visual target: `Admin Tournament Dashboard.png`.
- Intended roles: ADMIN only, plus future delegated roles only after policy approval.
- Current implementation state: `/admin`, `/admin/tournaments`, schedule/standings/theme/display-screen pages exist; the visual target is partial.
- Domain dependencies: tournament/stage/group/team/player/roster/match/court/official/result/rule data.
- API/socket dependencies: existing admin APIs plus gaps discovered per module; no client-only authority.
- Database dependencies: competition/auth/display/audit schemas.
- Security: deny by default, CSRF on writes, confirmation/reason/audit for guarded actions.
- Acceptance: real overview metrics, operations, modules, role access, publication state, recent audit activity.
- Tests: admin-only routes, CSRF, permission boundaries, guarded actions, responsive desktop/tablet.
- Production gate: authorized admin read/write verification using safe fixtures or owner-approved data.
- Known blockers: delegated admin role policy and missing module contracts.
- Source requirements: tournament governing documents for advancement/tiebreak actions.
- Next milestone: RM-14.

### RM-14 - Rule Profile Dashboard

- Objective: manage versioned, source-backed rule profiles without claiming unsupported rules.
- Visual target: `rule-profiles.png`.
- Intended roles: ADMIN/rule administrator.
- Current implementation state: dedicated route/component is `NOT IMPLEMENTED`; rule documents and some contract guidance exist.
- Domain dependencies: versioned rule profile, source registry, validation status, assignment.
- API/socket dependencies: rule-profile contracts require implementation/discovery; no socket command authority.
- Database dependencies: existing rule profile schema if present; verify before implementation.
- Security: admin-only writes, immutable used versions, confirmation/reason/audit.
- Acceptance: source status, versioning, validation, assignment warnings, explicit `NEEDS SOURCE` states.
- Tests: source absence, immutability, authorization, audit, assignment conflict.
- Production gate: owner-approved governing documents and safe profile assignment test.
- Known blockers: missing official documents and penalty/tiebreak matrices.
- Source requirements: official source registry; never infer rules from images.
- Next milestone: RM-15.

### RM-15 - Audit Log Dashboard

- Objective: provide authorized forensic audit search and correction-chain review.
- Visual target: `Audit Log Dashboard.png`.
- Intended roles: ADMIN and narrowly scoped authorized reviewers.
- Current implementation state: match-scoped admin/operator audit pages exist; global `/admin/audit-logs` dashboard is `NOT IMPLEMENTED`.
- Domain dependencies: audit logs plus event/correction linkage.
- API/socket dependencies: protected paginated/filterable audit reads and exports; exact global contracts need discovery.
- Database dependencies: append-only audit logs and match events.
- Security: no public exposure; permission-checked export; private actor/device/session data remains protected.
- Acceptance: filters, severity/status, detail, before/after, correction chain, read-only timeline, audited export.
- Tests: authorization, filtering, redaction, export permission, tamper/append-only evidence.
- Production gate: authorized admin read-only verification.
- Known blockers: global audit/export contract.
- Source requirements: retention/export policy.
- Next milestone: RM-16.

### RM-16 - Public Schedule Dashboard

- Objective: deliver a published public schedule using real allowlisted data only.
- Visual target: `Public Schedule Dashboard.png`.
- Intended roles: unauthenticated public viewers.
- Current implementation state: public tournament schedule and SCHEDULE display scene exist; visual parity is partial.
- Domain dependencies: published tournament/match schedule projection.
- API/socket dependencies: existing public schedule/display reads; no auth request and no write.
- Database dependencies: derived published schedule data.
- Security: exclude draft/cancelled/unknown/incomplete/private operational fields and IDs not in approved public contract.
- Acceptance: real rows, filters, live/upcoming context, `Time TBD`, `Venue TBD`, safe empty state, no fake scores.
- Tests: publication/filter/limit, incomplete rows, public metadata allowlist, responsive layout.
- Production gate: read-only real schedule verification.
- Known blockers: final public navigation/filter scope.
- Source requirements: publication policy; no standings/tiebreak inference.
- Next milestone: RM-17.

### RM-17 - Public Standings Dashboard

- Objective: deliver published standings from a server-derived, source-backed projection.
- Visual target: `Public Standings Dashboard.png`.
- Intended roles: unauthenticated public viewers.
- Current implementation state: `/public/tournaments/:tournamentId/standings` and shared standings components exist; publication and visual closure remain pending.
- Domain dependencies: finalized/published results and standings projection.
- API/socket dependencies: public read-only standings contract; no auth request and no command.
- Database dependencies: derived standings projection rebuilt from authoritative results.
- Security: no private IDs, sequences, audit/correction metadata, or unpublished results.
- Acceptance: real ranking/table/form/status data supported by governing rules, safe empty/unavailable states, responsive readability.
- Tests: publication, correction rebuild, tie ambiguity, public allowlist, responsive layout.
- Production gate: owner-approved tournament data and read-only verification.
- Known blockers: tiebreak automation.
- Source requirements: `[NEEDS SOURCE]` tournament standings and tiebreak governing document.
- Next milestone: RM-18.

### RM-18 - Full-System UI, Security, Realtime & Production Closure

- Objective: close architecture, event integrity, RBAC, public/private boundaries, realtime, accessibility, production, recovery, and rollback.
- Visual target: all inventoried dashboards and shared system states.
- Intended roles: all approved roles and public viewers.
- Current implementation state: `PENDING`; earlier milestone evidence is prerequisite.
- Domain dependencies: complete event/replay/correction/tournament behavior from prior milestones.
- API/socket dependencies: protected/public contracts, one match room, polling fallback, reconnect/catch-up, duplicate/concurrent command handling.
- Database dependencies: migration integrity, append-only events/audits, rebuildable projections, backup/restore.
- Security: full RBAC/CSRF/session/public-contract verification; no client-trusted authority.
- Acceptance: all milestone criteria plus end-to-end match/tournament workflows, accessibility, responsive UI, recovery and rollback.
- Tests: full regression, DB-backed authorization/event integrity, realtime reconnect, concurrency, security, visual matrix, production smoke.
- Production gate: approved owner deployment, read-only and safe interactive verification, rollback proof.
- Known blockers: all unresolved prior milestone limitations and missing governing sources.
- Source requirements: all official basketball/tournament automation must have loaded governing evidence.
- Next milestone: none; roadmap closure requires production evidence.

## 8. Historical Roadmap Mapping

Historical identifiers remain evidence and map forward as follows:

| Historical ID | Roadmap mapping |
|---|---|
| 24G.3A | RM-02 completed baseline |
| 24G.3B | RM-02 completed baseline |
| 24G.3C | RM-02 completed baseline with natural-action observation limitation |
| 24G.3D-D1 | RM-01/RM-02 design and accessibility evidence |
| 24G.3D-P1 | RM-00 integrated accessibility baseline |
| 24G.3D-P2 | RM-02 remaining work |
| 24G.3D-P3 | RM-02 remaining work |
| 24G.3D-P4 | RM-02 remaining work |
| 24H.2B | RM-03 |

Historical phase guidance in `docs/product/PROJECT_BRIEF.md` and screen guidance in `docs/ui/UI_DASHBOARDS.md` remain architectural/product evidence. They do not override this linear delivery order.

## 9. Architecture Invariants

```text
match_events is append-only
no UPDATE/DELETE/DROP/TRUNCATE of match_events
no timer tick events
no client-authoritative official state
corrections use compensating events
one socket room per match
public clients are read-only
protected commands require RBAC
command payloads require server validation
expected sequence is enforced
duplicate commands are idempotent
reconnect hydrates and catches up safely
audit evidence is preserved
```

Match events are the source of truth. Projections and snapshots are derived, rebuildable state. Running clocks are calculated from server-authoritative timing data; they are not persisted as per-second events. Rejected commands do not append domain events.

## 10. Public/Private Boundary

Public pages, DOM, HTTP responses, sockets, display models, logs, and error details must not expose:

```text
actor
role
device
session
token
csrf
commandId
correlationId
causationId
correction reason
audit metadata
internal event sequence
projection sequence
private player identity outside approved public contracts
```

Authenticated operator/admin projections may expose only role-authorized operational metadata. UI hiding is not authorization; the server denies by default and rechecks active scope/assignment for protected requests.

## 11. Basketball-Rule Source Policy

Use FIBA as the default only when loaded governing documents support the rule. Images are visual targets, not governing sources.

```text
[NEEDS SOURCE] Missing governing document:
FIBA alternating-possession/possession-arrow operational semantics.
```

Tournament standings and tiebreak automation also require the tournament governing document. Unsupported or ambiguous official-rule behavior must stop at `NEEDS SOURCE`; it must not be inferred from UI examples, general knowledge, or fixture data.

## 12. Delivery Protocol Per Milestone

Every milestone follows:

```text
D1  Discovery and contract/visual gap audit
P1  Narrow implementation
T   Focused and regression testing
I   Fast-forward integration to main
V   Local visual/browser verification
P   Production owner deployment and read-only verification when required
C   Roadmap status update and closure
```

Additional sub-slices may be added only when discovery identifies a concrete risk that cannot safely fit the current slice. No sub-slice may bypass the top-level order.

## 13. Visual Evidence Policy

Every UI milestone must compare current output with its matching file in the local `UI-design` directory and provide local browser evidence at relevant viewports.

Minimum public broadcast viewports:

```text
1920×1080
1600×900
1366×768
1280×720
1024×576
```

Minimum operator/admin viewports:

```text
1920×1080
1600×900
1536×1024
1366×768
```

Screenshots may be generated for reports but must not be committed unless explicitly approved. Evidence must cover overflow/overlap, text fit, focus, reduced motion, forced colors when relevant, browser console, public metadata safety, and real-data/no-fake-data behavior.

## 14. Deployment Policy

- Codex never performs Plesk owner operations unless explicitly authorized and access is proven.
- No migration, restart, or production write occurs during visual discovery.
- Micro-slices are not deployed automatically.
- Production deployment occurs only at approved milestone gates.
- After integration approval, the owner receives exact Plesk instructions appropriate to the approved commit.
- Rollback returns to the last proven production commit, currently `50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8`, until newer production evidence is recorded.
- Never use force reset, destructive cleanup, or history rewriting as a deployment shortcut.

## 15. Roadmap Update Rule

Every completed slice must update:

```text
status
commit
parent
changed files
tests
browser evidence
known limitations
production status
next safe step
```

Roadmap updates must distinguish local implementation, integration, readiness, deployment, and production verification. They must not claim production completion without production evidence.

## 16. Current Evidence And Next Step

RM-01-D1 evidence is recorded in:

- `docs/ui/UI_DESIGN_INVENTORY.md`
- `docs/ui/RM01_DESIGN_SYSTEM_AUDIT.md`

Current roadmap state after RM-02 production verification closure:

```text
RM-00 = INTEGRATED
RM-01 = INTEGRATED
RM-02 = PRODUCTION COMPLETE WITH OBSERVATION LIMITATION
RM-02-D1 = DISCOVERY COMPLETE
RM-02-P1 = IMPLEMENTATION COMPLETE
RM-02-P2 = IMPLEMENTATION COMPLETE
RM-02-P3 = IMPLEMENTATION COMPLETE
RM-02-P4 = IMPLEMENTATION COMPLETE
RM-02-P5-F1 = IMPLEMENTATION COMPLETE
RM-02-P5 = IMPLEMENTATION COMPLETE
RM-02-I = INTEGRATED
RM-02-P = PRODUCTION COMPLETE WITH OBSERVATION LIMITATION
RM-03 = CURRENT
RM-03-D1 = DISCOVERY COMPLETE
RM-03-P1 = IMPLEMENTATION COMPLETE
RM-03-P2 = BLOCKED BY AUTHORITATIVE ACCESS CONTRACT GAP
RM-03-P2-F1 = PENDING (AUTHORIZED TO BEGIN)
RM-03-P3 = PENDING (NOT AUTHORIZED)
RM-03-P4 = PENDING
RM-03-P5 = PENDING
RM-03-I = PENDING
RM-04 through RM-18 = PENDING
```

RM-01-P1 integration evidence:

- Branch: `feature/rm01-p1-design-tokens-primitives`.
- Implementation commit: `bb5e9348b02e9231ef004a078a98a24fd9856279`.
- Implementation parent: `8ca25cc2fb2bbdcf81fcab4afee919cf6de26386`.
- Scope: dedicated semantic token and primitive CSS layers; `UiPanel`, `UiBadge`, `UiButton`, and `UiStatusIndicator`; focused component/token/public regression tests; token-equivalent public focus and scoreboard aliases.
- Production adoption: deferred to RM-01-P1-I because no current production component could be migrated without unnecessary visual risk; primitives were exercised through an external browser fixture and repository tests only.
- Focused tests: PASS. Integration rerun passed 71 tests across the four changed test files; implementation evidence remains 89 passed across token, primitive, public display, and public auth-boundary suites.
- Full validation: lint passed; 507 tests passed and 23 database-dependent tests skipped; `npm run build` and `npm run build:single` passed.
- Browser evidence: Chromium public scoreboard checks passed at 1920x1080, 1600x900, 1366x768, 1280x720, and 1024x576; primitive fixture checks passed at those sizes plus 1536x1024. No document overflow, console warning/error, failed resource, or public auth bootstrap request was observed.
- Visual regression: Arena frame, scoreboard grid, game-clock rectangle, and shot-clock rectangle were unchanged at 1920x1080, 1366x768, and 1024x576. Score bounding-box measurements varied only while the existing score-pulse animation was active; score CSS geometry was not changed and visual inspection remained equivalent.
- Accessibility: native button activation, disabled/busy states, heading association, visible status labels, focus-visible geometry, forced-colors fallback, and reduced-motion behavior passed.
- Known limitations: database-backed tests requiring a disposable configured database remained skipped; exact deterministic score-pixel comparison is not claimed because the existing score-pulse animation changes capture-time bounds.
- Production status: `NOT DEPLOYED`; last proven production remains unchanged.

RM-01-P2 implementation evidence:

- Branch: `feature/rm01-p2-public-display-shell`.
- Implementation commit: `c716eace47bf22ecf9165f3e17f2e592bf7e237f`.
- Parent baseline: `50c0c3223aed9d43bd12f439af570dbe337a70a0`.
- Scope: extracted `PublicDisplayShell` as a presentation-only boundary for the existing public frame, utility controls, fullscreen boundary, accessibility landmark, and scene content slot; scene models, public API mapping, polling, socket lifecycle, score/clock logic, and scene renderers remain outside the shell.
- Focused tests: PASS. The six public display, focus, live, recent-action, final-summary, and auth-boundary files passed 54 tests; the final shell/focus rerun passed 9 tests.
- Full validation: lint passed; 511 tests passed and 23 database-dependent tests skipped; `npm run build` and `npm run build:single` passed.
- Browser evidence: clean unauthenticated Chromium checks passed for LIVE, BLANK, SCHEDULE, and FINAL_SUMMARY. The LIVE -> BLANK -> SCHEDULE -> LIVE transition replaced scene content without stale ticker, metadata, or score DOM. No console warning/error, failed resource, public auth bootstrap request, or protected write request was observed.
- Geometry evidence: outer frame, header, scoreboard grid, team panels, central clock panel, game-clock and shot-clock rectangles, ticker, utility controls, and status rail matched the pre-extraction baseline at 1920x1080, 1600x900, 1366x768, 1280x720, and 1024x576. Existing score-pulse animation caused capture-time text-box variance only; score containers and all structural geometry were unchanged.
- Interaction and accessibility: utility tab order and native semantics are unchanged; refresh produced one public scoreboard request; fullscreen still targets `document.documentElement`; the single polite atomic ticker live region appears only for LIVE; focus-visible, forced-colors, and reduced-motion rules remain unchanged.
- Known limitations: database-backed tests requiring a disposable configured database remained skipped; exact deterministic score-text pixel comparison is not claimed because the existing score-pulse animation changes capture-time bounds; native fullscreen itself was not entered in headless Chromium, but target/API behavior was verified.
- Production status: `NOT DEPLOYED`; current main is not claimed as deployed and last proven production remains unchanged.

RM-01-P2-I integration evidence:

- Integration method: fast-forward merge of `feature/rm01-p2-public-display-shell` into `main`; no merge commit, rebase, amend, squash, cherry-pick, reset, or force push.
- Integrated implementation commit: `c716eace47bf22ecf9165f3e17f2e592bf7e237f`.
- Implementation parent: `50c0c3223aed9d43bd12f439af570dbe337a70a0`.
- Focused validation: PASS. `npm test -- tests/web/public-display-shell.test.ts tests/web/public-display-focus-keyboard.test.ts` passed 2 files and 9 tests.
- Full implementation validation: 511 passed; 23 database-dependent skipped; lint PASS; build PASS; build:single PASS.
- Scope: Roadmap closure only after integration; no implementation source edit was made during integration closure.
- Production: `NOT DEPLOYED / NOT PROVEN`; last proven production remains `50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8`.

RM-01-P3 implementation evidence:

- Branch: `feature/rm01-p3-authenticated-dashboard-shell`.
- Parent baseline: `53358bcb8c529761a6eefa5138f471d557cc816a`.
- Scope: added a presentation-only `AuthenticatedDashboardShell` with semantic header, named native-link navigation, labelled main content, display-only status/user/action slots, content density modes, and an optional secondary rail. Authentication, route guards, REST/socket authorization, CSRF, logout state, realtime ownership, command logic, and domain data remain outside the shell.
- Production adoption: limited to the existing read-only `/admin` landing route. Command and socket-heavy operator routes were not migrated; no route path or backend behavior changed.
- Focused validation: PASS. Authenticated shell, public auth isolation, public shell, and public focus suites passed 4 files and 33 tests.
- Full validation: lint passed; 517 tests passed and 23 database-dependent tests skipped; `npm run build` and `npm run build:single` passed.
- Browser evidence: authenticated Chromium checks passed at 1920x1080, 1600x900, 1536x1024, and 1366x768 with one main landmark, no document overflow, no header/content overlap, visible unclipped keyboard focus, and an available secondary rail. The authenticated route retained the existing two `/api/v1/auth/me` requests under React StrictMode. Forced-colors and reduced-motion emulation passed.
- Public regression: clean public Chromium checks passed for BLANK, SCHEDULE, and LIVE at 1024x576. Public pages rendered only `PublicDisplayShell`, made zero `/api/v1/auth/me` requests, remained overflow-free, kept the safe empty schedule/ticker states, and produced no console warning or error.
- Bundle evidence: `index-p10hDsOJ.js` 528.06 kB (138.24 kB gzip) and `index-CZPp_Dbb.css` 65.20 kB (13.00 kB gzip). The existing Vite chunk-size warning remains.
- Known limitations: database-backed tests requiring a disposable configured database remained skipped; no authenticated command/socket-heavy route was adopted in this foundation slice.
- Production status: `NOT DEPLOYED / NOT PROVEN`; last proven production remains `50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8`.

RM-01-P3-I integration evidence:

- Integration method: fast-forward merge of `feature/rm01-p3-authenticated-dashboard-shell` into `main`; no merge commit, rebase, amend, squash, cherry-pick, reset, or force push.
- Implementation commit: `590aa4b380d015bd1fc3d55b4c670d90d7df9126`.
- Implementation parent: `53358bcb8c529761a6eefa5138f471d557cc816a`.
- Focused validation: `PASS`.
- Full validation: 517 passed; 23 DB-dependent skipped; lint `PASS`; build `PASS`; build:single `PASS`.
- Scope: Roadmap closure only after integration; no implementation source edit was made during integration closure.
- Production: `NOT DEPLOYED / NOT PROVEN`; last proven production remains `50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8`.

RM-01-P4 implementation evidence:

- Branch: `feature/rm01-p4-status-command-table-primitives`.
- Parent baseline: `aecdda868589d92f7fe420509c9da9eb98bdab39`.
- Scope: added presentation-only connection status, command status, command safety panel, data table, and empty-state primitives. Network, socket, authentication, command execution, official rules, and domain calculations remain consumer- or server-owned.
- Production adoption: limited to the existing read-only `/admin` landing route for authenticated connection context and command-safety guidance. Public routes and command-heavy operator routes were not migrated.
- Focused validation: `PASS`. Status/command/table primitives, shared primitives, authenticated shell, public shell/focus, and public auth-boundary suites passed 6 files and 79 tests.
- Full validation: lint passed; 540 tests passed and 23 database-dependent tests skipped; `npm run build` and `npm run build:single` passed.
- Browser evidence: authenticated Chromium checks passed at 1920x1080, 1600x900, 1536x1024, and 1366x768 with no document overflow, one main landmark, one navigation landmark, visible safety guidance, and unclipped keyboard focus. The public LIVE fixture passed at 1024x576 with no authenticated primitive DOM, no forbidden metadata, no document overflow, and no console warning or error.
- Public visual regression: score digits remained off-white and non-wrapping; the game clock remained cyan; the shot clock remained red; secondary telemetry and the exact safe ticker empty state remained intact.
- Accessibility: visible text accompanies semantic status color, live-region behavior is opt-in, loading states expose busy semantics, the table uses native caption/header structure and local keyboard-scroll overflow, focus-visible styling is present, and forced-colors/reduced-motion contracts are covered by focused tests and CSS.
- Bundle evidence: `index-xvHp0H58.js` 530.76 kB (139.03 kB gzip) and `index-D_HkOqz-.css` 70.10 kB (13.72 kB gzip). The existing Vite chunk-size warning remains.
- Known limitations: database-backed tests requiring a disposable configured database remained skipped; forced-colors behavior was verified by CSS contract rather than browser emulation; the local public realtime fixture did not implement Socket.IO and therefore exercised the existing offline polling fallback.
- Production status: `NOT DEPLOYED / NOT PROVEN`; last proven production remains `50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8`.

RM-01-P4-I integration evidence:

- Implementation commit: `de8c8bad75e0ea35550410b32677f3ac6bae9433`.
- Implementation parent: `aecdda868589d92f7fe420509c9da9eb98bdab39`.
- Integration method: fast-forward merge to `main`; no merge commit, rebase, squash, amend, cherry-pick, reset, or force push.
- Scope: approved implementation integrated unchanged, followed by this Roadmap-only closure commit.
- Focused validation: `PASS`; `npx vitest run tests/web/status-command-table-primitives.test.ts tests/web/authenticated-dashboard-shell.test.ts tests/web/public-display-shell.test.ts tests/web/public-display-focus-keyboard.test.ts` passed 4 files and 38 tests.
- Full implementation validation: 540 passed; 23 database-dependent tests skipped; lint `PASS`; build `PASS`; build:single `PASS`.
- Known limitations: database-backed tests requiring a disposable configured database remained skipped; forced-colors browser emulation remained unavailable.
- Production: `NOT DEPLOYED / NOT PROVEN`; last proven production remains `50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8`.

RM-01-P5 closure evidence:

- RM-01 baseline final commit: `b2d13621f69b9cc7149a9361af4dc9bbac9fed59`.
- Visual targets: all 16 local `UI-design` targets were reviewed with Gridgeist. The shared dark operational canvas, surface and border hierarchy, cyan/red operational accents, off-white dominant values, restrained team accents, semantic headers/navigation/context bars, status and command presentation, dense tables, warning panels, secondary rails, strong focus treatment, and public/authenticated layout separation are supported by the RM-01 foundation. Screen-specific parity remains assigned to RM-02 through RM-18.
- Foundation closure: semantic design tokens; `UiPanel`; `UiBadge`; `UiButton`; `UiStatusIndicator`; `UiConnectionStatus`; `UiCommandStatus`; `UiCommandSafetyPanel`; `UiDataTable`; `UiEmptyState`; `PublicDisplayShell`; and `AuthenticatedDashboardShell` passed responsibility, semantic HTML, responsive, accessibility, public/private, network, socket, and domain-ownership review. No RM-01 source correction was required.
- Public browser matrix: Chromium passed LIVE at 1920x1080, 1600x900, 1366x768, 1280x720, and 1024x576. The exact 1024x576 viewport had no document overflow; scores, game clock, shot clock, ticker, status rail, lower frame, and unclipped 3px focus treatment remained visible. LIVE -> BLANK -> SCHEDULE -> LIVE produced no stale scene content. A local FINAL_SUMMARY unavailable fixture rendered the public-safe unavailable state.
- Authenticated browser matrix: Chromium passed `/admin` at 1920x1080, 1600x900, 1536x1024, and 1366x768 with one labelled main landmark, named navigation, semantic header, no document horizontal overflow, reachable navigation, visible unclipped focus, readable secondary rail, safe long Thai/English account context, and no layout overlap.
- Accessibility closure: native control semantics, text-backed statuses, deliberate live regions, semantic caption/header table contracts, local table overflow, 3px focus-visible treatment, runtime forced-colors emulation, and runtime reduced-motion emulation passed. Native fullscreen entry and exit also passed in local Chromium.
- Public/private and lifecycle closure: public fixture payloads and rendered DOM exposed no actor, role, device, session, token, CSRF, command/correlation/causation IDs, audit/correction metadata, or internal/projection sequence. Public auth requests and protected writes remained zero. RM-01 shells/primitives own no authentication, domain mutation, socket, reconnect, polling, timer, expected-sequence, idempotency, or server-authorization behavior.
- Browser resources: console errors `0`; console warnings `0`; page errors `0`; failed normal-load resources `0`. Navigation-aborted Socket.IO polling cleanup was observed separately during scene navigation and is not a normal-load resource failure.
- Focused validation: `PASS`; 12 frontend files and 156 tests passed across tokens, primitives, focus/keyboard, public shell, authenticated shell, status/command/table, public scoreboard, metadata, recent action, auth boundary, final summary, and brand-asset suites.
- Full validation: lint `PASS`; 540 tests passed and 23 database-dependent tests skipped; `npm run build` and `npm run build:single` passed.
- Bundle evidence: `index-xvHp0H58.js` 530.76 kB (139.03 kB gzip) and `index-D_HkOqz-.css` 70.10 kB (13.72 kB gzip). The existing Vite chunk-size warning remains recorded; code splitting is deferred outside RM-01-P5.
- Known limitation: 23 database-dependent tests requiring a disposable configured database remained skipped.
- Controlled historical rebuild: `DEFERRED / NOT RUN`.
- Timezone formatter: `FOLLOW-UP`.
- CSP: `FOLLOW-UP`.
- Production: `NOT DEPLOYED / NOT PROVEN`; last proven production remains `50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8`.

RM-02-P1 implementation evidence:

- Branch: `feature/rm02-public-scoreboard-parity`; parent baseline: `84c1b92f4a333f3a76636bc6bca84f5ce721395e`.
- Strategy: RM-02 uses stacked linear implementation commits on `feature/rm02-public-scoreboard-parity`; integration into `main` occurs only at RM-02-I.
- Scope: compact-height public-display utility rail positioning and header reservation only. Public API/socket contracts, projection mapping, polling/socket ownership, score/clock typography, normal scoreboard geometry, and scene data remain unchanged.
- D1 root cause: the three-column grid and document width already shrank without horizontal overflow; the defect was the absolute utility rail extending below the compact header into match metadata.
- Browser geometry: Chromium passed 1920x1080, 1600x900, 1536x864, 1366x768, 1280x720, 1024x576, and 960x540. Frame, header, metadata, grid, team panels, score containers, game clock, shot clock, ticker, and status rail remained unchanged or subpixel-equivalent at the required normal viewports. At 960x540, `clientWidth` and `scrollWidth` were both 960.
- Compact controls: the rail fits inside the 46px compact header, does not intersect header title/metadata/badge, scores, game clock, or shot clock, and retains native NORMAL, REFRESH, FULLSCREEN order, four-second auto-hide, focus-within recovery, and an unclipped 3px focus treatment.
- Accessibility: runtime forced-colors and reduced-motion emulation passed. Unsupported fullscreen omitted only FULLSCREEN while preserving NORMAL and REFRESH. Native browser zoom and fullscreen entry were not automated; the approved equivalent viewport matrix and target/API behavior were verified.
- Scene and lifecycle evidence: LIVE -> BLANK -> SCHEDULE -> LIVE removed stale LIVE/ticker/metadata content and restored only the correct LIVE scene. The route retained one scene refresh interval and one public-scoreboard polling interval while LIVE, one public socket subscription per LIVE mount, zero public auth requests, and zero protected writes.
- Public safety: no contract or rendered-model change; public sequence remains hidden, possession remains deferred `[NEEDS SOURCE]`, and the recent-action rail remains one polite atomic sanitized item with no fabricated feed.
- Focused validation: `PASS`; `tests/web/public-display-focus-keyboard.test.ts` and `tests/web/public-live-scoreboard-display.test.ts` passed 13 tests.
- Full validation: lint `PASS`; 541 tests passed and 23 database-dependent tests skipped; `npm run build` and `npm run build:single` passed.
- Bundle evidence: `index-DJ2riwX9.js` 530.76 kB (139.03 kB gzip) and `index-Fau7lclG.css` 70.44 kB (13.77 kB gzip). The existing Vite chunk-size warning remains.
- Browser quality: console errors `0`; console warnings `0`; page errors `0`; failed normal-load resources `0`; public auth requests `0`; protected writes `0`.
- Gridgeist: `PASS`; the compact rail remains visually secondary, uses safe margins, preserves broadcast readability and spacing rhythm, and introduces no score/clock typography shrink or additional visual noise.
- Product decision: the recent-action rail remains one atomic sanitized item through RM-02-P1; a multi-item public feed remains deferred pending explicit product approval.
- Controlled historical rebuild: `DEFERRED / NOT RUN`. Branch cleanup: `NOT APPLICABLE` while RM-02 remains current. Timezone formatter and CSP remain `FOLLOW-UP`.
- Production: `NOT DEPLOYED / NOT PROVEN`; last proven production remains `50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8`.

RM-02-P2 implementation evidence:

- Branch: `feature/rm02-public-scoreboard-parity`; parent baseline: `407106d052d70355b9a3dca67c93d564de5b1fe2`.
- Strategy: RM-02 continues as stacked linear implementation commits on `feature/rm02-public-scoreboard-parity`; integration into `main` occurs only at RM-02-I.
- Scope: presentation-only LIVE scoreboard hierarchy and rail polish. The public round, court, and venue fields now compose as a compact secondary row inside the existing header; absent metadata adds no decorative region; long Thai and English values remain in the DOM and truncate safely without document overflow.
- Grid recovery: at 1672x941 the main grid moved from y=192.78 to y=149.08, recovering 43.70px and leaving about 1.08px to the measured target y=148. At 1920x1080 it recovered 46.43px, at 1366x768 it recovered 33.25px, and at 1024x576 it recovered 10px while preserving compact-control clearance.
- Browser geometry: Chromium passed 1672x941, 1920x1080, 1600x900, 1366x768, 1280x720, 1024x576, and 960x540. Frame, integrated metadata, grid, team panels, center panel, ticker, status rail, and utility rail remained inside the document with zero horizontal overflow; utility controls did not intersect metadata or the main grid.
- Rail hierarchy: the one-item recent-action ticker received restrained contrast improvement and remains one polite atomic sanitized item. The icon-first system rail is more readable at distance while remaining tertiary to score and clocks. No data field or scene text changed.
- P1 and P3 boundaries: NORMAL, REFRESH, FULLSCREEN order, four-second auto-hide, focus-within reveal, 3px focus treatment, forced-colors, and reduced-motion behavior passed. Score, game-clock, shot-clock, and team-name scale variables plus scoreboard column ratios were not changed; intentional parity tuning remains RM-02-P3.
- Color and public safety: scores remain fixed off-white, the game clock remains cyan, and shot-clock warning remains red. Public sequence and private operational metadata remain absent; possession remains deferred `[NEEDS SOURCE]`; public auth requests and protected writes were both zero.
- Scene and lifecycle evidence: LIVE -> BLANK -> SCHEDULE -> LIVE rendered only scene-appropriate DOM with no stale ticker, metadata, or score content. Public polling and socket ownership were unchanged; normal-load console errors, warnings, page errors, and failed resources were zero.
- Focused validation: `PASS`; all eight `tests/web/public-*.test.ts` files passed 72 tests. The P2 metadata/header and rail contract subset passed 21 tests after the expected test-first failure.
- Full validation: lint `PASS`; 544 tests passed and 23 database-dependent tests skipped; `npm run build` and `npm run build:single` passed.
- Bundle evidence: `index-DfBwPxGE.js` 530.87 kB (139.06 kB gzip) and `index-DUHkgTaz.css` 70.65 kB (13.78 kB gzip). The existing Vite chunk-size warning remains.
- Gridgeist: `PASS`; scoreboard dominance, compact header composition, metadata readability, restrained rail weight, utility-control subordination, distant readability, spacing rhythm, compact-height safety, and broadcast composition passed review.
- Product decision: the recent-action rail remains one atomic sanitized item through RM-02-P2; a multi-item public feed remains deferred pending explicit product approval.
- Controlled historical rebuild: `DEFERRED / NOT RUN`. Branch cleanup: `NOT APPLICABLE` while RM-02 remains current. Timezone formatter and CSP remain `FOLLOW-UP`.
- Production: `NOT DEPLOYED / NOT PROVEN`; last proven production remains `50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8`.

RM-02-P3 implementation evidence:

- Branch: `feature/rm02-public-scoreboard-parity`; parent baseline: `dc4b2626f6b149d1601205f4a1b29204107446b6`.
- Strategy: RM-02 remains a stacked linear implementation branch; integration into `main` occurs only at RM-02-I. P4/P5/I were not started.
- Scope: presentation-only LIVE scoreboard geometry and typography plus focused visual-contract tests. No component data model, REST/socket contract, auth behavior, public mapper, event logic, dependency, or scene payload changed.
- Target geometry at 1672x941: the main grid remained y=149.08 and moved from 613.64px to 585.64px high. HOME/CENTER/AWAY became 597.25/364.34/597.25px, compared with the approximate 600/364/600px target. The shot-clock block became x=654.81, y=495.47, w=362.34, h=238.25, within the source-image measurement tolerance of the approximate x=654, y=496, w=364, h=237 target.
- Hierarchy: team names moved to y=222.66-263.45; score regions aligned at y=315.31-535.50; metric bands became 136.02px high; game-clock and shot-clock tracks were rebalanced without changing authoritative labels or values. Score digits remain fixed off-white and tabular; game clock remains cyan; shot-clock warning remains red.
- Responsive browser evidence: Chromium passed 1672x941, 1920x1080, 1600x900, 1366x768, 1280x720, 1024x576, and 960x540 with document horizontal and vertical overflow both zero. HOME/AWAY widths and score baselines remained symmetric at every viewport.
- Stress evidence: short, long English, long Thai, and mixed Thai/English team names stayed bounded to two lines; scores 0, 9, 99, and 100 stayed visible and non-wrapping; game clocks 10:00, 2:14, and 0:09 fit; shot clocks 24, 14, 9, and 0 fit; REG P4 and OT P1 retained authoritative formatter output.
- P1/P2 regression: compact NORMAL, REFRESH, FULLSCREEN semantics/order, four-second auto-hide, focus recovery, 3px focus treatment, reduced-motion behavior, integrated metadata hierarchy, ticker hierarchy, and secondary system rail remained intact. Header and metadata geometry remained unchanged; only the intended main-grid and lower-rail height allocation changed.
- Scene and lifecycle evidence: LIVE -> BLANK -> SCHEDULE -> LIVE rendered only scene-appropriate DOM with no stale score, metadata, or ticker. Existing polling/socket ownership remained unchanged; no new socket, subscription, interval, or layout observer was added.
- Public safety: public sequence remains hidden, possession remains deferred `[NEEDS SOURCE]`, and the recent-action rail remains one polite atomic sanitized item. Browser public auth requests and protected writes were both zero; console warnings/errors and failed normal-load resources were zero.
- Focused validation: `PASS`; six public display, live-scoreboard, metadata, recent-action, focus, and auth-boundary files passed 66 tests. The final P3 visual-contract file passed 11 tests after the expected test-first failure.
- Full validation: lint `PASS`; 546 tests passed and 23 database-dependent tests skipped; `npm run build` and `npm run build:single` passed.
- Bundle evidence: `index-CwWsRoZM.js` 530.87 kB (139.06 kB gzip) and `index-D6Sb-nSC.css` 71.12 kB (13.87 kB gzip). The existing Vite chunk-size warning remains.
- Gridgeist: `PASS`; column balance, score dominance, clock hierarchy, baseline alignment, long-name handling, metric density, distant readability, responsive scaling, compact safety, and broadcast composition passed review.
- Product decision: the recent-action rail remains one atomic sanitized item through RM-02-P3; a multi-item public feed remains deferred pending explicit product approval.
- Controlled historical rebuild: `DEFERRED / NOT RUN`. Branch cleanup: `NOT APPLICABLE` while RM-02 remains current. Timezone formatter and CSP remain `FOLLOW-UP`.
- Production: `NOT DEPLOYED / NOT PROVEN`; last proven production remains `50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8`.

RM-02-P4 implementation evidence:

- Branch: `feature/rm02-public-scoreboard-parity`; parent baseline: `1a1ab21f18e3385858d53514e0d072a841be2131`; implementation commit: this commit (`test(display): add final summary browser fixtures`).
- Scope: test-only FINAL_SUMMARY public-display fixture coverage plus this Roadmap evidence. No application source, API/socket contract, public mapper, route, package, migration, event, timer, authentication, or production-data behavior changed.
- Fixture mechanism: Playwright request interception supplies deterministic public `GET /api/v1/public/display/:screenSlug` responses to the existing generic public route. No test/debug query parameter, production fixture path, serialized initial state, or source-side fixture branch was added.
- Contract evidence: the authoritative finalized fixture rendered match `final-summary-fixture`, FINAL status, Bangkok Thunder 88, Chiang Mai Falcons 84, HOME winner, authoritative winner display name, tournament/round/location labels, and completion time. Nullable winner and optional metadata rendered without `null`, invented winner/location/time copy, or frontend winner calculation. The unavailable fixture rendered only `FINAL RESULT`, `RESULT NOT AVAILABLE`, and `Final summary is not available.` with no score, winner, or internal reason.
- Browser matrix: Chromium `149.0.7827.55` passed finalized and unavailable states at 1920x1080, 1600x900, 1366x768, 1280x720, 1024x576, and 960x540. Long English and Thai fixtures passed at 960x540 with bounded two-line clipping, visible off-white non-wrapping scores, and content contained inside the 16:9 frame. Nullable, forced-colors, and reduced-motion checks also passed.
- Lifecycle and public safety: FINAL_SUMMARY retained exactly one scene-refresh interval, created zero public socket connections, made zero auth requests and zero protected writes, exposed no authenticated-shell DOM or focus targets, and rendered no LIVE scoreboard, ticker, or metadata DOM. Fixture payloads and rendered DOM exposed no role, device, session, token, CSRF, command/correlation/causation IDs, audit/correction details, or projection/event sequence internals.
- LIVE regression: 1672x941, 1024x576, and 960x540 retained scores 88/84 in fixed off-white, cyan game clock, red shot clock, round/court/venue metadata, NORMAL/REFRESH/FULLSCREEN controls, focus rule, and `No public play updates available.`. No FINAL_SUMMARY change was made to LIVE, BLANK, or SCHEDULE behavior.
- Browser quality: console warnings/errors `0`; page errors `0`; FINAL_SUMMARY failed resources `0`. Three expected `net::ERR_ABORTED` Socket.IO long-poll requests occurred only when the LIVE regression fixture navigated between viewports; they are explicit fixture navigation teardown, not normal-load resource failures.
- Focused validation: `PASS`; seven public display, FINAL_SUMMARY, LIVE, metadata, recent-action, focus, shell, and auth-boundary files passed 74 tests. The FINAL_SUMMARY file passed 8 tests.
- Full validation: lint `PASS`; 549 tests passed and 23 database-dependent tests skipped; `npm run build` and `npm run build:single` passed. `npm run test:db` passed 2 source-guard tests and skipped 18 database-dependent tests because no disposable `DATABASE_*` environment was available (`DB_DEPENDENT_TESTS_UNAVAILABLE`).
- Bundle evidence: `index-CwWsRoZM.js` 530.87 kB (139.06 kB gzip) and `index-D6Sb-nSC.css` 71.12 kB (13.87 kB gzip). The existing Vite chunk-size warning remains.
- Gridgeist: `PASS`; finalized, unavailable, compact, long-English, and long-Thai captures preserved scoreboard/result hierarchy, off-white score dominance, safe spacing, bounded text, contrast, broadcast composition, and kiosk readability without production CSS changes.
- Product decision: the recent-action rail remains one atomic sanitized item; a multi-item public feed remains deferred pending explicit product approval. Controlled historical rebuild remains `DEFERRED / NOT RUN`; branch cleanup is `NOT APPLICABLE` while RM-02 remains current; timezone formatting and CSP remain `FOLLOW-UP`.
- Production: `NOT DEPLOYED / NOT PROVEN`; last proven production remains `50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8`. RM-02-P5 and RM-02-I were not started.

RM-02-P5-F1 implementation evidence:

- Branch: `feature/rm02-public-scoreboard-parity`; parent baseline: `6611869169693a94a993aecbbeb051e7df09e42c`; implementation commit: this commit (`test(display): stabilize final summary browser lifecycle`).
- Classification: `EXPECTED NAVIGATION TEARDOWN`. Detailed request tracing reproduced an old LIVE scoreboard polling `GET` ending as `net::ERR_ABORTED` only after the fixture intentionally began navigation to the next public scene. The application did not abort a steady-state public request.
- Harness fix: fixture navigation now waits for the exact public scoreboard `200` response and response completion before LIVE assertions. Expected teardown accounting is narrowly allowlisted by completed LIVE assertions, exact GET path, exact `fetch` or Socket.IO `xhr` resource type, exact `net::ERR_ABORTED`, and a known scene-navigation transition. Other request failures remain test failures; no broad suppression or arbitrary timeout was added.
- Scene lifecycle: deterministic `LIVE -> BLANK -> SCHEDULE -> LIVE_RETURN -> FINAL_SUMMARY -> UNAVAILABLE` navigation passed with stale scoreboard, ticker, metadata, final-score, and winner DOM excluded from subsequent scenes. FINAL_SUMMARY authoritative, nullable, and unavailable behavior remained intact.
- Repeat evidence: three consecutive browser runs passed all six lifecycle scenes with auth requests `0`, protected writes `0`, console warnings/errors `0`, page errors `0`, and unexpected failed requests `0`. Expected LIVE HTTP navigation teardowns ranged from `0` to `2`; expected Socket.IO navigation teardowns were `5` per run.
- LIVE regression: 1672x941, 1024x576, and 960x540 retained scores 88/84 in fixed off-white, cyan game clock, red shot clock, public metadata, controls, ticker empty state, and zero horizontal overflow. P1-P3 browser geometry and visual contracts remained intact.
- Focused validation: `PASS`; eight public display, FINAL_SUMMARY, LIVE, metadata, recent-action, shell, focus, and auth-boundary files passed 77 tests.
- Full validation: lint `PASS`; 549 tests passed and 23 database-dependent tests skipped; `npm run build` and `npm run build:single` passed. `npm run test:db` passed 2 source-guard tests and skipped 18 database-dependent tests because no disposable `DATABASE_*` environment was available (`DB_DEPENDENT_TESTS_UNAVAILABLE`).
- Bundle evidence: `index-CwWsRoZM.js` 530.87 kB (139.06 kB gzip) and `index-D6Sb-nSC.css` 71.12 kB (13.87 kB gzip). The existing Vite chunk-size warning remains.
- Scope: browser fixture lifecycle and Roadmap evidence only. No application source, API/socket contract, public mapper, route, dependency, migration, event-store, timer, authentication, production data, or public metadata behavior changed.
- Gridgeist: `PASS`; the P1-P3 responsive smoke retained arena hierarchy, score dominance, clock contrast, ticker treatment, controls, and kiosk containment without production UI changes.
- Production: `NOT DEPLOYED / NOT PROVEN`; last proven production remains `50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8`. RM-02-P5 and RM-02-I remain pending. Controlled historical rebuild remains `DEFERRED / NOT RUN`; branch cleanup is `NOT APPLICABLE`; timezone formatting and CSP remain `FOLLOW-UP`.

RM-02-P5 local closure evidence:

- Branch: `feature/rm02-public-scoreboard-parity`; parent baseline: `afbc5dd06e8541006706fdfc5ee72f25802914a8`; closure commit: this commit (`docs(roadmap): record rm02 local scoreboard closure`). The fresh closure matrix passed P1 `407106d052d70355b9a3dca67c93d564de5b1fe2`, P2 `dc4b2626f6b149d1601205f4a1b29204107446b6`, P3 `1a1ab21f18e3385858d53514e0d072a841be2131`, P4 `6611869169693a94a993aecbbeb051e7df09e42c`, and P5-F1 `afbc5dd06e8541006706fdfc5ee72f25802914a8`.
- Gridgeist parity: `PASS WITH LIMITATION`. At 1672x941 the header, integrated metadata, 597/364/597px column balance, 585.64px panel height, team-name hierarchy, off-white score dominance, cyan game clock, red shot-clock block, metrics, single ticker, tertiary status rail, hidden utilities, safe margins, and distant readability remained coherent against `PublicScoreBoard.png`. Remaining differences are `DATA-DEPENDENT` for optional logos/labels, `INTENTIONAL PRODUCT EVOLUTION` for the sanitized atomic ticker and secondary telemetry, `FUTURE PRODUCT DECISION` for a multi-item public feed, and `[NEEDS SOURCE]` for possession and bonus semantics; no `RM-02 DEFECT` remained.
- Viewport matrix: fresh isolated-page Chromium checks passed 1672x941, 1920x1080, 1600x900, 1536x864, 1366x768, 1280x720, 1024x576, and 960x540. At every size `clientWidth` equaled `scrollWidth`; frame, header, metadata, grid, three panels, both scores, game clock, shot clock, ticker, status rail, and utilities stayed inside the document.
- Zoom-equivalent matrix: 1920x1080, 1536x864, 1280x720, and 960x540 represented 100%, 125%, 150%, and 200% viewport equivalents with zero horizontal overflow and reachable scores, clocks, ticker, status rail, controls, and visible focus. This is viewport equivalence, not native browser zoom automation.
- Stress matrix: scores 0, 9, 27, 99, and 100; game clocks 10:00, 4:13, 0:09, and 0:00; shot clocks 24, 14, 9, and 0; short English, long English, real long Thai, and mixed Thai/English names and metadata; and REGULATION/OVERTIME labels all passed at 960x540 with zero horizontal overflow, contained values, aligned score tracks, and safe wrapping/clamping.
- Color policy: computed score color remained `rgb(248, 250, 252)` with tabular non-wrapping digits; game clock remained `rgb(103, 232, 249)`; shot clock remained `rgb(239, 68, 68)`. Team colors remained accents, borders, glows, and background tints only.
- P1 closure: NORMAL, REFRESH, FULLSCREEN order and native semantics passed; Refresh issued one public scoreboard GET; mouse reveal, four-second auto-hide after focus leaves the rail, focus-within retention, compact containment, 3px focus, forced-colors, reduced-motion, and 960x540 overflow checks passed. Native fullscreen entry was not exercised in headless Chromium.
- P2/P3 closure: integrated metadata omitted no-data rails, long English/Thai values stayed bounded, grid placement remained near the target top, columns stayed symmetric, panel height and score/clock hierarchy remained target-like, metrics stayed visible, REG/OT formatting passed, and the public ticker remained one polite atomic sanitized item. Possession remains excluded and bonus semantics remain `[NEEDS SOURCE]`.
- P4/P5-F1 closure: three consecutive FINAL_SUMMARY browser runs passed the 12-case finalized/unavailable matrix, nullable FINAL, long English, long Thai, forced-colors, reduced-motion, and `LIVE -> BLANK -> SCHEDULE -> LIVE_RETURN -> FINAL_SUMMARY -> UNAVAILABLE` isolation. Unexpected normal-load failures, console warnings/errors, page errors, auth requests, and protected writes were all `0` in every run. Narrow expected public scoreboard HTTP navigation teardowns were `1`, `0`, and `0`; Socket.IO navigation teardowns were `5` per run; static/resource failures were `0`.
- Public safety and realtime: public HTTP fixtures, public socket mapper contracts, rendered DOM, and fixture DOM remained clean for actor/role/device/session/token/CSRF, command/correlation/causation IDs, reasons, audit/correction details, and internal/projection sequence fields. The branch added zero socket, subscription, reconnect, polling, or timer-tick ownership; protected realtime and server-authoritative behavior remain unchanged.
- Accessibility: one semantic main, ordered headings and team labels, visible 3px focus, forced-colors fallback, reduced-motion behavior, one `role=status` / `aria-live=polite` / `aria-atomic=true` ticker, non-live clocks, text-backed status, unclipped compact focus, and meaningful FINAL/UNAVAILABLE text passed. Native fullscreen and native zoom automation remain documented limitations.
- Focused validation: `PASS`; eight public display, LIVE, FINAL_SUMMARY, metadata, recent-action, focus, shell, brand, and auth-boundary files passed 77 tests.
- Full validation: lint `PASS`; 549 tests passed and 23 database-dependent tests skipped; `npm run build` and `npm run build:single` passed. `npm run test:db` passed 2 source-guard tests and skipped 18 database-dependent tests because no disposable `DATABASE_*` environment was available (`DB_DEPENDENT_TESTS_UNAVAILABLE`).
- Bundle evidence: `index-CwWsRoZM.js` 530.87 kB (139.06 kB gzip) and `index-D6Sb-nSC.css` 71.12 kB (13.87 kB gzip). The existing Vite chunk-size warning remains.
- Guard result: the working tree was clean before this Roadmap-only write. The RM-02 branch delta contains no production fixture route, new public endpoint, broad failure suppression, fetch mutation, socket emission/ownership, private sequence exposure, historical `match_events` mutation, mutable scoreboard-state table, timer-tick event, dependency, or production-data change.
- Production: `NOT DEPLOYED / NOT PROVEN`; last proven production remains `50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8`. Recent action remains one atomic sanitized item and a multi-item feed remains deferred. Controlled historical rebuild remains `DEFERRED / NOT RUN`; branch cleanup remains `NOT APPLICABLE` until integration; timezone formatting and CSP remain `FOLLOW-UP`.

Next safe step:

```text
RM-03-D1 - Unified LiveMatchShell discovery and contract/visual gap audit
```

RM-02-I integration evidence:

- Branch: `feature/rm02-public-scoreboard-parity`; approved P5 closure: `4d85ce6067d1bb9cc3f95ab3e47c4a02d77dc8a7`; integration governance commit: this commit (`docs(roadmap): record rm02 integration gate`).
- Commit chain: the branch is a six-commit linear descendant of `84c1b92f4a333f3a76636bc6bca84f5ce721395e`, containing P1 `407106d052d70355b9a3dca67c93d564de5b1fe2`, P2 `dc4b2626f6b149d1601205f4a1b29204107446b6`, P3 `1a1ab21f18e3385858d53514e0d072a841be2131`, P4 `6611869169693a94a993aecbbeb051e7df09e42c`, P5-F1 `afbc5dd06e8541006706fdfc5ee72f25802914a8`, and P5 closure `4d85ce6067d1bb9cc3f95ab3e47c4a02d77dc8a7`; no merge or unrelated commit was present.
- Scope audit: eight files were approved across presentation-only LIVE scoreboard hierarchy/geometry, focused public visual and accessibility tests, deterministic FINAL_SUMMARY browser fixtures, lifecycle classification, and Roadmap evidence. No backend, API/socket contract, public mapper, auth/RBAC/CSRF, migration, dependency, deployment configuration, event-store, or production-data file changed.
- Architecture and security: event sourcing, append-only `match_events`, compensating correction behavior, server authority, public allowlist mapping, route-owned polling/socket behavior, and read-only public access remain unchanged. No mutable scoreboard-state table, timer-tick event, production fixture route, application fixture flag, public sequence, or private operational metadata was added.
- F1 guard: expected `net::ERR_ABORTED` teardown remains narrowly classified only after completed LIVE assertions, for the exact public scoreboard GET or Socket.IO polling path, exact resource type, and a known scene navigation. Every other failed request remains a test failure.
- Focused validation: `PASS`; eight public brand, display shell, focus/keyboard, LIVE, metadata, recent-action, FINAL_SUMMARY, and auth-boundary files passed 77 tests.
- Browser integration smoke: `PASS`; Chromium `149.0.7827.55` passed finalized/unavailable FINAL_SUMMARY, LIVE at 1672x941, 1024x576, and 960x540, and the LIVE -> BLANK -> SCHEDULE -> LIVE_RETURN -> FINAL_SUMMARY -> UNAVAILABLE lifecycle. Horizontal overflow, auth requests, protected writes, console warnings/errors, page errors, and unexpected failed resources were all `0`. Scores remained `rgb(248, 250, 252)`, game clock `rgb(103, 232, 249)`, shot clock `rgb(239, 68, 68)`, and the ticker remained one sanitized atomic empty state.
- Full validation: lint `PASS`; 549 tests passed and 23 database-dependent tests skipped; `npm run test:db` passed 2 source-guard tests and skipped 18 database-dependent tests (`DB_DEPENDENT_TESTS_UNAVAILABLE`); `npm run build` and `npm run build:single` passed.
- Bundle evidence: `index-CwWsRoZM.js` 530.87 kB (139.06 kB gzip) and `index-D6Sb-nSC.css` 71.12 kB (13.87 kB gzip). The existing Vite chunk-size warning remains.
- Gridgeist: `PASS WITH LIMITATION`; parity, hierarchy, responsive containment, zoom-equivalent viewports, public safety, and scene isolation passed. Native fullscreen and native browser zoom were not automated.
- Deferred policy: the recent-action rail remains one atomic sanitized item; a multi-item feed remains deferred. Controlled historical rebuild remains `DEFERRED / NOT RUN`; timezone formatting and CSP remain `FOLLOW-UP`. Possession and bonus automation remain excluded pending governing sources.
- Integration method: approved fast-forward only; no squash, rebase, cherry-pick, merge commit, reset, or force push. Branch cleanup was not run and remains an owner follow-up after integration.
- Production: `NOT DEPLOYED / NOT PROVEN`; last proven production remains `50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8`. RM-03 remains `PENDING` until the RM-02 owner deployment and read-only production verification gate is completed.

RM-02-P production closure evidence:

- Owner checkpoint: the owner-operated coherent redeployment/restart checkpoint was completed before this read-only rerun. Codex performed no deployment, restart, production authentication, migration, historical rebuild, scene mutation, scoreboard command, correction, or production-data mutation.
- Asset coherence: production root HTML directly referenced `index-CwWsRoZM.js`, `index-D6Sb-nSC.css`, and `scoreboard-favicon-BUI4TAzY.svg`; every reference returned HTTP 200 with the expected JavaScript, CSS, or SVG content type and the same `Thu, 16 Jul 2026 11:24:01 GMT` Last-Modified value. Classification: `COHERENT DEPLOYED ASSET SET`.
- Corrected favicon evidence: production `scoreboard-favicon-BUI4TAzY.svg` is the 563-byte LF Git blob with SHA-256 `e394f4536664a2b294d368d63d4fccfdbcc07430953b0ca9ae6b71bd16a594bf`. Windows local `scoreboard-favicon-CIGaN-da.svg` is the same source normalized to 571-byte CRLF by `core.autocrlf=true`. The filename difference is platform-dependent content hashing, not an old or mixed deployment.
- Deployed-build evidence: root, health, public display shell, and public display API returned HTTP 200; production LIVE behavior matched the integrated application state. Classification: `DEPLOYED BUILD BEHAVIOR VERIFIED`; content-hashed asset names are not treated as independent exact-SHA provenance.
- Public scene: `court-1-main` remained naturally `LIVE_SCOREBOARD` for public-safe match `93bd90bd-040d-48f5-bb9c-1354d6e80077`. No production scene was changed and no fixture/debug route or query parameter was used.
- Browser matrix: isolated Chromium checks passed 1920x1080, 1366x768, 1024x576, and 960x540. At every viewport document client width equaled scroll width and client height equaled scroll height; frame, scores, game clock, shot clock, ticker, metadata, compact status rail, and utility controls remained visible and contained.
- Visual policy: both scores remained fixed off-white `rgb(248, 250, 252)` with non-wrapping digits; the game clock remained cyan `rgb(103, 232, 249)`; the shot clock remained red `rgb(239, 68, 68)`; team colors remained panel borders, gradients, and tints only. The recent-action rail remained exactly one polite atomic sanitized item with `No public play updates available.`, no marquee, and no rotation animation.
- Public safety: public API, rendered DOM, and 20 captured Socket.IO response bodies exposed none of actor/role/device/session/token/CSRF, command/correlation/causation IDs, reasons, audit/correction details, expected/internal/projection sequence fields, or authenticated-shell DOM. Public auth requests and protected writes were both `0`.
- Realtime: each isolated viewport produced one public Socket.IO handshake and the expected `match:join` with `PUBLIC_SCOREBOARD`; outgoing command-like events, authenticated channels, forbidden outgoing metadata, duplicate ownership, and abnormal reconnect loops were `0`.
- Browser quality: console warnings/errors, page errors, failed steady-state requests, auth requests, and protected writes were all `0` at all four viewports. No navigation teardown was needed for the isolated checks.
- Accessibility: NORMAL, REFRESH, FULLSCREEN retained native focus order; each received a visible solid 3px focus outline; focus-within revealed the utility rail; metadata, scores, clocks, ticker, and text-backed system status remained readable. Native fullscreen was not exercised, and native zoom remains represented by the accepted equivalent viewport evidence.
- Scene scope: production naturally exposed LIVE only. FINAL_SUMMARY production behavior was not manufactured and remains covered by the accepted local P4 finalized/unavailable browser matrix.
- Decision: `PRODUCTION VERIFIED WITH LIMITATION`; canonical Roadmap state is `PRODUCTION COMPLETE WITH OBSERVATION LIMITATION`. Disposable DB coverage unavailable, native fullscreen not automated, native zoom represented by equivalent viewports, and no naturally available production FINAL_SUMMARY are accepted non-safety-critical observation limitations.
- Deferred policy: the recent-action rail remains one atomic sanitized item and a multi-item feed remains deferred. Controlled historical rebuild remains `DEFERRED / NOT RUN`; branch cleanup was not run and remains an owner follow-up; timezone formatting and CSP remain `FOLLOW-UP`. Possession remains excluded pending the missing FIBA alternating-possession/possession-arrow governing source.
- Roadmap transition: RM-02 is production complete with the observations above. RM-03 is now `CURRENT`, but no RM-03 work began in this task. The exact next safe gate is RM-03-D1 discovery and contract/visual gap audit.

RM-03-D1 discovery closure evidence:

- Decision: `READY WITH ARCHITECTURE DECISIONS`; the read-only discovery audited all 16 visual targets, authenticated/operator routes, shell primitives, RBAC, realtime, command, event/projection, responsive, accessibility, and public/private ownership boundaries without changing source, tests, configuration, Git history, or production.
- Composition: `LiveMatchShell` is a specialized authenticated live-match composition inside `AuthenticatedDashboardShell`; the authenticated dashboard shell remains the top-level shell and the final composition retains one semantic `main` landmark.
- Ownership: RM-03-P1 is presentation-only and introduces no realtime provider. Fetching, socket creation, room subscription, polling, reconnect, resync, clock interpolation, command execution, and authoritative domain state remain route, consumer, provider, or backend owned.
- Authorization: the server remains authoritative. Client roles are presentation hints only, and future role-aware navigation must derive from server-returned effective permissions and active assignments rather than client role assumptions.
- Integration gate: DB-backed active-assignment authorization, revocation, cross-match denial, and denied-command no-event/no-projection-change evidence remain required before RM-03 integration or deployment closure; this evidence does not block presentation-only RM-03-P1.
- Scope boundary: RM-04 through RM-18 remain `PENDING`; RM-03-P1 must not adopt production routes or implement clock, score, foul, timeout, lineup, pairing, court, or later milestone behavior.
- Deferred policy remains unchanged: the recent-action multi-item feed is `DEFERRED`; controlled historical rebuild is `DEFERRED / NOT RUN`; branch cleanup remains an owner follow-up; timezone formatting and CSP remain `FOLLOW-UP`.
- Rule boundary remains unchanged: `[NEEDS SOURCE] Missing governing document: FIBA alternating-possession/possession-arrow operational semantics.` No possession, bonus, standings, or tiebreak behavior may be inferred from visual targets.
- Authorization: RM-03-P1 is `PENDING (AUTHORIZED TO BEGIN)`.
- Next safe step: `RM-03-P1 - LiveMatchShell Contract and Presentation Component`.

RM-03-P1 implementation evidence:

- Branch: `feature/rm03-live-match-shell`; parent baseline: `1f763d896c6bf39111338264be61cd06b9d38c46`.
- Scope: added a presentation-only `LiveMatchShell` contract and component for match context, local navigation, canonical connection/command status, safety guidance, primary content, optional secondary rail, and explicit ready/degraded/offline/read-only presentation states. No production route adopted the shell.
- Ownership boundary: fetching, protected REST, socket creation, room subscription, polling, reconnect, resync, clock interpolation, command execution, authorization, and authoritative domain state remain outside the component. Public display composition and contracts are unchanged.
- Focused validation: `PASS`; six shell, primitive, authenticated-shell, public-shell, and auth-boundary files passed 91 tests, including 17 focused LiveMatchShell tests.
- Full validation: lint passed; 566 tests passed and 23 database-dependent tests skipped; `npm run build` and `npm run build:single` passed. `npm run test:db` exited successfully with 2 source-guard tests passed and 18 database-dependent tests skipped because a disposable database environment was unavailable.
- Browser and responsive evidence: Chromium passed 30 state/viewport combinations covering ready, degraded, offline, read-only, long English/Thai names, rail/no-rail, and 1920x1080, 1600x900, 1536x1024, 1366x768, 1280x720, and 1024x768. There was no horizontal overflow, console/page error, or failed request; one main landmark, named navigation, 44px targets, 3px focus, forced-colors, reduced-motion, and safe rail stacking passed.
- Guard evidence: source-only ownership scans found no fetch, API client, socket, room subscription, polling/timer, command sequencing, timer-tick event, public route, or public display adoption. Repository event-store guards found no mutable scoreboard/display-state table or historical `match_events` mutation pattern.
- Visual review: Gridgeist `PASS`; dense match context, stable hierarchy, bounded multilingual team names, explicit status hierarchy, responsive rail placement, and compact navigation containment meet the accepted RM-03-D1 presentation contract.
- Known limitation: DB-backed active-assignment authorization, revocation, cross-match denial, and denied-command no-event/no-projection-change evidence remains unavailable and mandatory before RM-03 integration or deployment closure. This presentation-only P1 is not deployed or production-proven.
- Roadmap transition: RM-03-P1 is `IMPLEMENTATION COMPLETE`; subsequent authorization-input audit evidence supersedes the earlier P2 authorization recorded at P1 closure. RM-03 remains `CURRENT`; RM-03-I and RM-04 through RM-18 remain unchanged.
- Next safe step at P1 closure was RM-03-P2; the governance reconciliation below records the blocking contract gap discovered before P2 implementation.

RM-03-P2-G1 governance reconciliation evidence:

- Decision: `GOVERNANCE_BLOCKER_RECORD_ALIGNED`; RM-03-P2 is blocked because existing protected responses do not expose server-calculated per-match effective navigation/access capabilities.
- Available inputs: `/api/v1/auth/me` returns global permissions and active match assignments; `/api/v1/operator/matches` returns match presentation data; protected projections return authoritative match, period, and finality data; backend `requireMatchPermission` remains the canonical match-scoped authorization authority.
- Missing contract: no existing protected response returns per-match `effectivePermissions`, `effectiveAccess`, `allowedCapabilities`, or an equivalent server-calculated capability decision.
- Security decision: client role, global permission arrays alone, frontend route visibility, and client-side assignment-role interpretation are not authorization authority and must not be used to reproduce backend match-scoped decisions.
- Corrective slice: RM-03-P2-F1 - `Server-Authoritative Effective Match Access Contract` is `PENDING (AUTHORIZED TO BEGIN)`. It may expose one protected, read-only, server-calculated per-match capability contract by reusing canonical backend authorization logic.
- Corrective boundaries: RM-03-P2-F1 introduces no client-authoritative permission calculation, public exposure, event/projection mutation, realtime provider or behavior change, mutable access cache, database migration, or schema change.
- Realtime ownership: existing route-owned socket, polling, reconnect, resync, clock interpolation, and command ownership remain unchanged; F1 addresses authorization contract sufficiency only.
- Closure gate: DB-backed authorization evidence remains mandatory before RM-03 integration/deployment, including canonical Admin policy, assigned Referee/Scorer, Viewer/unauthorized denial, revoked assignment, cross-match denial, TIMER and SHOT_CLOCK isolation, and proof that denial produces no event/projection mutation. This evidence is not yet claimed.
- Deferred policy: the recent-action multi-item feed remains `DEFERRED`; controlled historical rebuild remains `DEFERRED / NOT RUN`; branch cleanup remains an owner follow-up; timezone formatting and CSP remain `FOLLOW-UP`.
- Rule boundary: `[NEEDS SOURCE] Missing governing document: FIBA alternating-possession/possession-arrow operational semantics.` Possession and bonus semantics remain excluded.
- Roadmap transition: RM-03-P2 is `BLOCKED BY AUTHORITATIVE ACCESS CONTRACT GAP`; RM-03-P2-F1 is `PENDING (AUTHORIZED TO BEGIN)`; RM-03-P3 is `PENDING (NOT AUTHORIZED)`; RM-04 through RM-18 remain `PENDING`.
- Next safe step: `RM-03-P2-F1 - Server-Authoritative Effective Match Access Contract`.
