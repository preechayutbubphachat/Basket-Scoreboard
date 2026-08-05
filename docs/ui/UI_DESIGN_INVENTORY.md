# UI Design Inventory

Source directory (local visual evidence; assets are not copied into Git):

```text
C:\2025\web-69\BasketBallScoreBoard2026\web_ScoreBoard\UI-design
```

Inspection date: 2026-07-15. The requested canonical set contains 15 files. The directory also contains `Main Live Scoreboard Dashboard.png`, so this inventory records all 16 discovered images rather than silently excluding the additional target.

Status meanings in this inventory:

- `IMPLEMENTED BASELINE`: the route/component exists and materially represents the target, but later roadmap closure may still be required.
- `PARTIAL`: related route/component/data exists, but the pictured dashboard is not complete.
- `NOT IMPLEMENTED`: no matching route/component was found.
- `NEEDS DISCOVERY`: repository evidence does not prove the required contract or target route.

## Visual Target Matrix

| ID | Visual file | Dimensions | Aspect ratio | Audience | Dashboard | Expected route | Current route | Current component | Current status | Domain projection | Commands | Role | Public/private | Rule/source dependencies | Major gaps | Target RM milestone |
|---|---|---:|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|
| UI-01 | `Admin Tournament Dashboard.png` | 1672×941 | 1.7768:1 | Tournament admin | Tournament overview and operations | `/admin`, `/admin/tournaments`, `/admin/tournaments/:id` | `/admin`, `/admin/tournaments`; detail dashboard `NOT IMPLEMENTED` | `AdminHome`, `AdminTournamentsPage` | PARTIAL | Tournament/schedule/standings/display data; unified overview `NEEDS DISCOVERY` | Existing module-specific admin actions; full dashboard actions `NEEDS DISCOVERY` | ADMIN | Private | Tournament advancement/tiebreak governing document | No unified overview, module grid, readiness metrics, guarded action rail, or global activity view | RM-13 |
| UI-02 | `Audit Log Dashboard.png` | 1672×941 | 1.7768:1 | Admin/auditor | Global forensic audit | `/admin/audit-logs` | Match-scoped `/admin/matches/:matchId/audit-log` and `/operator/matches/:matchId/audit-log`; global route `NOT IMPLEMENTED` | `MatchAuditLogPage`, `AuditLogRowView` | PARTIAL | Match audit/event projection; global audit projection `NEEDS DISCOVERY` | Read/filter/export contracts beyond match scope `NEEDS DISCOVERY` | ADMIN; scoped operator | Private | Retention/export policy | No global filters, severity dashboard, forensic detail rail, tamper summary, or permission-checked export UI | RM-15 |
| UI-03 | `Clock and Shot Clock Dashboard.png` | 1672×941 | 1.7768:1 | Timer/shot-clock operator | Clock and period control | `/operator/matches/:matchId/clock` | `/operator/matches/:matchId/clock` | `OperatorClockPage` | PARTIAL | Clock and shot-clock projections | Existing game/shot clock and lifecycle commands | TIMER, SHOT_CLOCK_OPERATOR, MATCH_OPERATOR, ADMIN | Private | Loaded FIBA clock/shot-clock sources; unsupported cases `NEEDS SOURCE` | Shared live shell, visual hierarchy, full shot-clock controls, warning/action rail, role-specific surface | RM-04 |
| UI-04 | `Court Dashboard.png` | 1536×1024 | 1.5:1 | Admin/venue operations | Venue and court operations | `/admin/venues-courts` shown in visual; repository target route `NEEDS DISCOVERY` | NOT IMPLEMENTED | NOT IMPLEMENTED | NOT IMPLEMENTED | Venue/court, schedule, readiness, display/device health projections `NEEDS DISCOVERY` | Assignment/readiness/pairing actions `NEEDS DISCOVERY` | ADMIN; venue manager `NEEDS PRODUCT DECISION` | Private | Venue operating policy | Entire dashboard, readiness model, device-health boundary, court timeline and conflict contracts | RM-10 |
| UI-05 | `Lineup Dashboard.png` | 1672×941 | 1.7768:1 | Admin/assigned scorer | Roster and lineup readiness | `/admin/matches/:matchId/rosters`, `/admin/matches/:matchId/lineup` | Same | `AdminRostersPage`, `AdminLineupPage` | PARTIAL | Roster/lineup read models | Existing roster/lineup actions; lock/correction closure pending | ADMIN; authorized assigned operator | Private | Tournament eligibility and roster policy | Target two-team composition, court lineup builder, readiness checklist, lock/correction workflow, responsive dense table | RM-08 |
| UI-06 | `Main Live Scoreboard Dashboard.png` | 1672×941 | 1.7768:1 | Public arena viewer | Rich public live scoreboard | `/public/scoreboard/:matchId/display` or LIVE scene at `/public/display/:screenSlug` | Both exist | `PublicScoreboardDisplayPage`, `PublicDisplayScenePage`, `PublicLiveScoreboard` | IMPLEMENTED BASELINE | Public allowlisted live scoreboard projection | None; read-only | PUBLIC_DISPLAY | Public | Possession indicator remains source-gated | Visual parity/zoom/rail/fixture/production closure; source image itself exposes sequence telemetry that public implementation must not copy | RM-02 |
| UI-07 | `Match Pairing Dashboard.png` | 1672×941 | 1.7768:1 | Public/operator/admin | Match pairing and readiness | `/public/schedule`, `/admin/tournaments/:id/matches`, `/operator/matches` per UI spec | `/public/schedule` alias, `/public/tournaments/:id/schedule`, `/admin/tournaments/:id/schedule`, `/operator/matches`; exact admin pairing route `NOT IMPLEMENTED` | `PublicTournamentsPage`, `PublicTournamentSchedulePage`, `AdminTournamentSchedulePage`, `OperatorMatchesPage` | PARTIAL | Tournament schedule and operator match list | Schedule/admin assignment/lifecycle actions are split; pairing edit/cancel contracts `NEEDS DISCOVERY` | PUBLIC, assigned operator, ADMIN | Mixed; separate surfaces required | Tournament scheduling/publication policy | No unified pairing timeline, selected-match rail, conflict/readiness states, guarded pairing actions | RM-09 |
| UI-08 | `Match Summary Dashboard.png` | 1672×941 | 1.7768:1 | Operator/admin; published subset public | Official match summary | `/operator/matches/:matchId/summary`, `/admin/matches/:matchId/summary`, public published summary | Admin/operator routes exist; public FINAL_SUMMARY is scene-based | `MatchSummaryPage`, `PublicFinalSummaryDisplayScene` | PARTIAL | Match summary and public final-summary projections | Existing protected summary/publication-related controls are incomplete | Assigned operator, ADMIN; PUBLIC allowlist | Mixed | Result publication/lock/reopen policy | Full target hierarchy, period/foul/timeout panels, guarded result actions, public publication route policy | RM-11 |
| UI-09 | `Public Schedule Dashboard.png` | 1672×941 | 1.7768:1 | Public viewer | Published tournament schedule | `/public/tournaments/:tournamentId/schedule` | Same; also SCHEDULE scene at `/public/display/:screenSlug` | `PublicTournamentSchedulePage`, `ScheduleTable`, `PublicScheduleDisplayScene` | PARTIAL | Public-safe schedule projection | None; read-only | PUBLIC | Public | Publication policy | Target filter/navigation/live-upcoming composition, visual density, complete public page parity | RM-16 |
| UI-10 | `Public Standings Dashboard.png` | 1672×941 | 1.7768:1 | Public viewer | Published standings | `/public/tournaments/:tournamentId/standings` | Same | `PublicTournamentStandingsPage`, `StandingsContent`, `StandingsTable` | PARTIAL | Tournament standings projection | None; read-only | PUBLIC | Public | `[NEEDS SOURCE]` tournament standings/tiebreak governing document | Publication proof, qualification/tiebreak language, visual parity, public contract audit | RM-17 |
| UI-11 | `PublicScoreBoard.png` | 1672×941 | 1.7768:1 | Public arena viewer | Primary public scoreboard target | `/public/scoreboard/:matchId/display` or LIVE scene at `/public/display/:screenSlug` | Both exist | `PublicScoreboardDisplayPage`, `PublicDisplayScenePage`, `PublicLiveScoreboard` | IMPLEMENTED BASELINE | Public allowlisted live scoreboard projection | None; read-only | PUBLIC_DISPLAY | Public | Possession arrow `[NEEDS SOURCE]` before automation | Accessible zoom fallback, final rail polish, local FINAL_SUMMARY fixture, production closure | RM-02 |
| UI-12 | `Replay Dashboard.png` | 1672×941 | 1.7768:1 | Admin/authorized operator | Historical event replay | `/replay/matches/:matchId` in UI spec | `/admin/matches/:matchId/replay`, `/operator/matches/:matchId/replay` | `MatchReplayPage`, `ReplayTimelineRow` | PARTIAL | Replay timeline/state reconstructed from events | None; replay is read-only | ADMIN; assigned authorized operator | Private | Event schema and public replay policy | Visual timeline/inspector/playback parity, large-stream performance, canonical route decision | RM-12 |
| UI-13 | `rule-profiles.png` | 1536×1024 | 1.5:1 | Admin/rule administrator | Rule profile management | `/admin/rule-profiles` shown in visual; repository route `NEEDS DISCOVERY` | NOT IMPLEMENTED | NOT IMPLEMENTED | NOT IMPLEMENTED | Rule profile/version/source validation projection `NEEDS DISCOVERY` | Create/clone/validate/publish/deprecate/assign `NEEDS DISCOVERY` | ADMIN | Private | Official source registry, foul matrix, tournament tiebreak document | Entire route, contracts, immutable-version policy, source validation and assignment safety | RM-14 |
| UI-14 | `Timeout Dashboard.png` | 1672×941 | 1.7768:1 | Match operator/admin | Timeout operation | `/operator/matches/:matchId/timeouts` | Same | `OperatorTimeoutPage` | PARTIAL | Timeout projection | Existing grant/end/correction-related commands | MATCH_OPERATOR, ADMIN; other roles per server policy | Private | Timeout eligibility interpretations may be `NEEDS SOURCE` | Shared shell, target active-timeout composition, quotas/warnings, complete confirmation/correction UX | RM-07 |
| UI-15 | `UI Foul Control Dashboard.png` | 1672×941 | 1.7768:1 | Scorer/assistant/admin | Foul operation | `/operator/matches/:matchId/fouls` | Same | `OperatorFoulPage` | PARTIAL | Foul projection and roster context | Existing foul add/correction workflow | SCORER, ASSISTANT_SCORER, MATCH_OPERATOR, ADMIN | Private | `[NEEDS SOURCE]` complex foul penalty matrix | Shared shell, two-team player grid, complete foul types/warnings, visual parity | RM-06 |
| UI-16 | `UI Score Control Dashboard.png` | 1672×941 | 1.7768:1 | Scorer/assistant/admin | Score operation | `/operator/matches/:matchId/score` | Same | `OperatorScorePage` | PARTIAL | Operator score projection | Existing score add and correction workflow | SCORER, ASSISTANT_SCORER, MATCH_OPERATOR, ADMIN | Private | Player-attribution policy | Shared shell, target two-team action composition, command response rail, keyboard/visual parity | RM-05 |

## Per-Visual Inspection Notes

### UI-01 Admin Tournament Dashboard

- Major regions: persistent admin navigation, tournament context header, security/publication strip, filters, overview metrics, match operations table, stages/groups, module launcher, users/roles, guarded action rail, recent audit table.
- Major actions: create/edit schedule, assign court/officials, manage rosters, publish schedule/results, lock/reopen/cancel with confirmation/audit.
- Visual hierarchy: tournament identity and publication state first; operational exceptions second; routine modules and audit evidence third.
- Accessibility concerns: very dense 16:9 layout, small text, color-heavy status coding, keyboard order across side rail/content/actions, confirmation semantics.

### UI-02 Audit Log Dashboard

- Major regions: audit/security rail, filters, severity metrics, records table, selected detail, before/after comparison, correction chain, forensic timeline.
- Major actions: filter, export, inspect record, open replay/summary/related events.
- Visual hierarchy: integrity/read-only warning, severity summary, selected record and correction provenance.
- Accessibility concerns: dense table, status color dependence, horizontal overflow, timeline reading order, sensitive-data redaction.

### UI-03 Clock And Shot Clock Dashboard

- Major regions: shared live header, sync/sequence strip, shot clock, game clock, period controls, safety/status panels, warnings, recent events.
- Major actions: start/stop/set clocks, reset 24/14, end/start period, open correction review.
- Visual hierarchy: clocks and primary controls dominate; safety/sequence and warnings remain visible but secondary.
- Accessibility concerns: large touch targets are good; keyboard shortcuts must not bypass confirmation; status cannot rely on color; rapid clock visuals need reduced-motion stability.

### UI-04 Court Dashboard

- Major regions: venue list/detail, court cards, assignment timeline, selected court/readiness, safe actions, system/security, activity audit.
- Major actions: open monitor, assign staff, pair display, mark readiness, view schedule/device health.
- Visual hierarchy: live/ready/problem courts first; selected court diagnosis second; audit and system health last.
- Accessibility concerns: 1.5:1 tablet layout, tiny readiness text, complex timeline navigation, color-coded court states, device data must remain private.

### UI-05 Lineup Dashboard

- Major regions: home/away roster tables, lineup court, readiness checklist, command safety, guarded correction, event history.
- Major actions: select starters/captain, confirm rosters/lineups, lock roster, open score/foul controls, correction review.
- Visual hierarchy: team eligibility and starters first; readiness/lock decision second; history and correction evidence third.
- Accessibility concerns: toggle naming/state, dense tables, court-position reading order, touch target size, lock confirmation and focus return.

### UI-06 Main Live Scoreboard Dashboard

- Major regions: event identity header, team score panels, center period/clock/shot clock/possession, recent-event ticker, telemetry footer.
- Major actions: none; public read-only.
- Visual hierarchy: scores and game clock dominate; shot clock/period next; metrics/ticker/telemetry secondary.
- Accessibility concerns: target image includes public `SEQ` telemetry and possession that must not be copied without approved public contract/source; keep score contrast, fixed numerals, reduced motion, zoom/focus fallback.

### UI-07 Match Pairing Dashboard

- Major regions: tournament filters, time-grouped pairings, selected-match detail, officials/readiness warnings, action rail, recent pairing events, sync status.
- Major actions: edit pairing, assign officials, confirm ready, open controls/public display/summary, cancel/change pairing.
- Visual hierarchy: today's match state and exceptions dominate; selected match and guarded actions follow.
- Accessibility concerns: card/table hybrid navigation, status color dependence, confirmation for destructive actions, dense small labels.

### UI-08 Match Summary Dashboard

- Major regions: match/official/sync context, final result, score by period, fouls/timeouts/player summaries, correction/publication state, key events, admin actions.
- Major actions: publish/lock/reopen/export/view audit where authorized.
- Visual hierarchy: authoritative final result first; official/publication status and period breakdown second; operational/audit detail third.
- Accessibility concerns: distinguish official/published/corrected without color alone; large tables; public version must omit private detail.

### UI-09 Public Schedule Dashboard

- Major regions: tournament header, publication/sync strip, filters, published schedule, live/upcoming sidebar, schedule updates.
- Major actions: public navigation/filter and opening public match details/scoreboard only.
- Visual hierarchy: tournament/day and schedule rows first; live/upcoming context second; notices/updates third.
- Accessibility concerns: filter controls, dense rows at smaller screens, status color, no fake or unpublished rows, safe TBD labels.

### UI-10 Public Standings Dashboard

- Major regions: tournament/publication header, filters/navigation, group tables, qualification/tiebreak panel, upcoming matches, updates.
- Major actions: public filters/navigation/refresh only.
- Visual hierarchy: rankings and qualification state dominate; tiebreak cautions and affected matches follow.
- Accessibility concerns: wide tables, abbreviations/legend, color-coded form/status, unsupported tiebreak claims must not appear.

### UI-11 PublicScoreBoard

- Major regions: tournament/match header, home/away score panels, center period/game clock/shot clock, team metrics, public event rail, telemetry.
- Major actions: none in kiosk; utility zoom/fullscreen/normal controls may appear accessibly outside kiosk.
- Visual hierarchy: off-white scores and cyan game clock dominate; red shot-clock warning follows; team accents remain decorative.
- Accessibility concerns: 16:9 fit at five viewports, long team names/three-digit scores, focus visibility, forced colors, reduced motion, no public private metadata.

### UI-12 Replay Dashboard

- Major regions: event timeline, selected state, event inspector, correction comparison, filters/jumps, playback timeline, read-only warning.
- Major actions: select/filter/jump/play/pause/step/export where authorized; no state mutation.
- Visual hierarchy: selected event/state/correction chain first; playback and forensic detail second.
- Accessibility concerns: timeline semantics, keyboard playback, dense metadata, focus persistence, private actor/device details require RBAC.

### UI-13 Rule Profile Dashboard

- Major regions: profile list, source/version metadata, rule tabs, validation, assignment/safety, actions, version audit.
- Major actions: create/clone/validate/publish/deprecate/assign/view source.
- Visual hierarchy: active profile and source validity first; missing-source warnings second; guarded actions/version history third.
- Accessibility concerns: 1.5:1 layout, dense tabs, validation not color-only, destructive confirmation, source provenance clarity.

### UI-14 Timeout Dashboard

- Major regions: shared live header, home/away quotas and grant controls, active timeout, rule context, command safety, events, correction/shortcut help.
- Major actions: grant/end/adjust timeout and open correction review where authorized.
- Visual hierarchy: remaining quota and active timeout first; server rule decision/safety next; history last.
- Accessibility concerns: large controls, shortcut collision, confirmation/reason, countdown motion, warning labels beyond color.

### UI-15 Foul Control Dashboard

- Major regions: shared live header, home/away player foul tables, foul-type selectors, selected command, safety/auth, recent foul events.
- Major actions: select player/type, add foul, open correction/review/force sync.
- Visual hierarchy: team/player state and primary foul command dominate; unsupported foul types and safety remain explicit.
- Accessibility concerns: dense selectable rows, disabled/fouled-out states, keyboard selection, complex types need source warnings, color-independent penalty state.

### UI-16 Score Control Dashboard

- Major regions: shared live header, home/away scores/actions/player selectors, live summary, command safety, correction, recent scores, response preview.
- Major actions: +1/+2/+3, optional player selection, correction review, force sync.
- Visual hierarchy: scores and point buttons dominate; current clock/status and command response follow.
- Accessibility concerns: keyboard shortcuts must be deterministic and permission-safe, pending state prevents duplicates, focus remains visible, scores do not wrap.

## Cross-Dashboard Visual Primitives

| Primitive | Visual language observed | RM-01 implication |
|---|---|---|
| background | Near-black arena/admin canvases with subtle tonal layers | Semantic surface tokens; public and authenticated themes remain separate |
| panel | Thin cool borders, compact radius, restrained elevation | Shared `Panel` variants with density and tone |
| header | Persistent context header containing tournament/match/court/role/connectivity | Separate `PublicDisplayHeader` and authenticated `LiveMatchHeader` compositions |
| navigation | Admin side navigation; operator contextual navigation; public minimal navigation | Shell-owned navigation with role and route policy |
| team accents | Red/blue rails, borders, badges, glows, and tints | Accent tokens only; never color public score digits |
| score typography | Large off-white condensed/tabular numerals | Fixed semantic score token, tabular numerals, no wrapping |
| clock typography | Large tabular game clock, cyan on public target | Semantic clock token and fixed-width behavior |
| status badges | READY/LIVE/FINAL/ONLINE/WARNING variants | Shared accessible status badge with text/icon, not color alone |
| tables | Dense bordered tables with compact headers and status/action columns | Shared table shell, overflow wrapper, row/action semantics |
| buttons | Strong action color, explicit primary/secondary/warning/danger/disabled states | Shared button primitives using native controls |
| warnings | Amber/red bordered strips and panels with icon and explicit text | Shared alert/warning primitive and live region policy |
| confirmation states | Guarded actions require title, consequence, target/current state, confirm/cancel | Shared confirmation dialog with focus trap/return and duplicate-submit protection |
| connection/sync indicators | ONLINE/SYNCING/STALE/OFFLINE and last-sync context | Shared status presentation; public version excludes private sequence internals |
| audit/correction indicators | Correction chains, reason-required, append-only evidence | Authenticated-only primitives; never reused into public output blindly |
| focus states | High-contrast outline, forced-colors fallback, focus recovery | Shared focus tokens preserving RM-00 baseline |
| responsive behavior | 16:9 public frames; dense operator/admin desktops; 1.5:1 tablet targets | Shell-level viewport contracts and component overflow rules |

## Inventory Constraints

- Visual files are evidence, not functional specifications or official rule sources.
- Example names, scores, schedules, venues, events, actors, devices, sequences, and audit data in the images are not fixture authorization.
- Missing routes, projections, and commands remain `NOT IMPLEMENTED` or `NEEDS DISCOVERY`; this inventory does not authorize new endpoints.
- Public implementations must retain explicit allowlists and must not copy private telemetry shown in some concept images.
