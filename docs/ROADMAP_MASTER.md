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
Repository main:
84c1b92f4a333f3a76636bc6bca84f5ce721395e

origin/main:
84c1b92f4a333f3a76636bc6bca84f5ce721395e

Last proven production:
50f9b5ae7e3b7ee86e12f71fa37a4e98f7338ee8

Production deployment status of 84c1b92f:
NOT DEPLOYED / NOT PROVEN
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
| RM-02 | Public Scoreboard Visual Parity Closure | `CURRENT` |
| RM-03 | Unified LiveMatchShell Foundation | `PENDING` |
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
RM-02 = CURRENT
RM-02-D1 = DISCOVERY COMPLETE
RM-02-P1 = IMPLEMENTATION COMPLETE
RM-02-P2 = PENDING
RM-02-P3 = PENDING
RM-02-P4 = PENDING
RM-02-P5 = PENDING
RM-02-I = PENDING
RM-03 through RM-18 = PENDING
Next safe step: RM-02-P2 - Broadcast Hierarchy and Rail Polish
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
- Current implementation state: `CURRENT`; RM-02-D1 is `DISCOVERY COMPLETE`, RM-02-P1 is `IMPLEMENTATION COMPLETE`, and RM-02-P2 through RM-02-P5 plus RM-02-I remain `PENDING`.
- Domain dependencies: existing public live scoreboard and final-summary projections only.
- API/socket dependencies: existing public HTTP/socket allowlist mappers; no private sequence or event payloads.
- Database dependencies: existing derived projections; no mutable source-of-truth table.
- Security: no auth bootstrap on public routes; read-only; sanitized DOM and payloads.
- Acceptance: accessible zoom fallback, broadcast rail polish, local FINAL_SUMMARY browser fixture, and production closure.
- Tests: public DOM/metadata/ticker/auth-boundary/final-summary tests plus five public broadcast viewports.
- Production gate: owner deployment and read-only route/DOM/console verification.
- Known blockers: remaining historical `24G.3D-P2/P3/P4` work.
- Source requirements: no new basketball automation.
- Next milestone: RM-03.

### RM-03 - Unified LiveMatchShell Foundation

- Objective: create one authenticated live-match shell shared by clock, score, foul, and timeout dashboards.
- Visual target: Clock, Score, Foul, Timeout, and shared header regions in operator targets.
- Intended roles: assigned scorer, assistant scorer, timer, shot-clock operator, match operator, and admin.
- Current implementation state: separate pages and duplicated shell/state regions exist; unified shell is not implemented.
- Domain dependencies: existing live projections and command-state models.
- API/socket dependencies: protected REST plus current reconnect/polling/socket notification behavior.
- Database dependencies: active `match_officials` assignment and existing projections/event stream.
- Security: server-derived permissions and active assignment checks on every protected request.
- Acceptance: shared hydration, stale/offline/permission states, navigation, and role-aware command surfaces without client-trusted permission.
- Tests: cross-role route, reconnect, assignment revocation, command denial, and shell rendering.
- Production gate: DB-backed authorization verification before deployment.
- Known blockers: historical `24H.2B` requirements and role-specific UX decisions.
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

Current roadmap state after RM-02-P1 implementation:

```text
RM-00 = INTEGRATED
RM-01 = INTEGRATED
RM-02 = CURRENT
RM-02-D1 = DISCOVERY COMPLETE
RM-02-P1 = IMPLEMENTATION COMPLETE
RM-02-P2 = PENDING
RM-02-P3 = PENDING
RM-02-P4 = PENDING
RM-02-P5 = PENDING
RM-02-I = PENDING
RM-03 through RM-18 = PENDING
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

Next safe step:

```text
RM-02-P2 - Broadcast Hierarchy and Rail Polish
```

Do not begin RM-02-P2 until it is separately approved.
