# RM-01-D1 Shared Design System Audit

Status: `DISCOVERY COMPLETE`

Top-level milestone: `RM-01 = CURRENT`

Next slice: `RM-01-P1 - Design Tokens and Primitive Components`

Evidence baseline: `4811444d11bfa2458dc2cd1c3266b716efe29a1a`

This audit is discovery only. It does not authorize component implementation, route changes, API changes, or production work.

## 1. Current Architecture Inventory

### Frontend composition

- `apps/web/src/main.tsx` mounts React and imports one global `styles.css` file.
- `apps/web/src/App.tsx` is a 6,413-line route parser, navigation helper, shell, and page-component monolith.
- Route parsing is custom and explicit. It currently recognizes public display/scoreboard/tournament routes, authenticated admin routes, and match-scoped operator routes.
- Only three domain display components are extracted under `apps/web/src/components/`: `PublicBrandAsset`, `PublicLiveScoreboard`, and `PublicFinalSummaryDisplayScene`.
- Feature behavior is more modular under `apps/web/src/lib/`, with dedicated control/model helpers for score, foul, clock, timeout, lifecycle, roster, schedule, replay, audit, corrections, display screens/themes, public scenes, and realtime sync.
- `packages/api-contracts/src/index.ts` is a 1,688-line shared contract module used by API and web.
- `tests/web/admin-auth-ui.test.ts` is a 4,652-line broad policy/regression suite; focused public tests are already split by concern.

### Route inventory

Public routes found:

```text
/public/display/:screenSlug
/public/scoreboard/:matchId
/public/scoreboard/:matchId/display
/public/tournaments
/public/schedule
/public/tournaments/:tournamentId/schedule
/public/tournaments/:tournamentId/standings
```

Authenticated route families found:

```text
/admin
/admin/matches
/admin/tournaments
/admin/tournaments/:tournamentId/schedule
/admin/tournaments/:tournamentId/live-dashboard
/admin/tournaments/:tournamentId/standings
/admin/tournaments/:tournamentId/display-theme
/admin/teams/:teamId/display-profile
/admin/matches/:matchId/display-theme
/admin/display-screens/**
/admin/matches/:matchId/{officials,rosters,lineup,summary,replay,audit-log}
/operator/matches
/operator/tournaments/:tournamentId/live-dashboard
/operator/matches/:matchId/{score,fouls,clock,timeouts,lifecycle,corrections,summary,replay,audit-log}
```

`shouldBootstrapAuthForPath` classifies `/public` paths before auth hydration. Public routes therefore remain structurally separate from protected auth bootstrap.

### Current page/shell model

- `Shell` is the primary authenticated/global application wrapper.
- `ProtectedRoute` performs UI route gating, but server authorization remains authoritative.
- Public scoreboard/display pages use dedicated frame classes and do not use the authenticated shell.
- Operator pages independently render repeated headings, state strips, links, notices, panels, tables, and action groups.
- Admin pages independently render similar forms, panels, tables, readiness/status badges, confirmations, and navigation.

## 2. Design-Token Inventory

`apps/web/src/styles.css` is 2,736 lines. It has 178 hexadecimal color occurrences and nine top-level media queries.

### Existing token-like values

Global `:root` defines base text/background/font settings but not a complete semantic token system. The public arena frame defines useful scoped custom properties:

```text
--arena-bg
--arena-bg-secondary
--arena-accent
--arena-text
--arena-score
--arena-clock
--arena-shot-warning
--arena-secondary-text
--arena-panel-radius
--arena-rail-width
--arena-safe-x
--arena-safe-y
--arena-scene-gap
--arena-header-height
--arena-footer-height
```

Later public scoreboard rules also use semantic sizing/color variables such as arena score, clock, team-column, and warning values.

### Gaps

- No repository-wide semantic surface, text, border, status, spacing, radius, typography, focus, control-height, or elevation scale.
- Similar colors are repeated as hard-coded values across general, admin/operator, preview, and public sections.
- Public arena tokens are scoped to one frame and cannot safely serve authenticated dashboards without an explicit semantic layer.
- Status colors are encoded by many selectors rather than a single accessible status vocabulary.
- Responsive values and component dimensions are distributed across page-specific rules.

## 3. Shared-Component Inventory

Extracted shared components:

- `PublicBrandAsset`: first-party public image/fallback handling.
- `PublicLiveScoreboard`: allowlisted public live scoreboard composition.
- `PublicFinalSummaryDisplayScene`: finalized/unavailable public summary composition.
- `Shell`: authenticated/global navigation wrapper, still embedded in `App.tsx`.
- Small embedded form primitives: `TextInput`, `ColorInput`, `CheckboxInput`.
- Embedded presentation helpers: `StatusPanel`, `ErrorMessage`, `Notice`, schedule/standings tables, summary/replay/audit row components.

Missing shared primitives:

- semantic `Panel`
- `StatusBadge`
- `ActionButton` state model
- `SystemNotice`/warning primitive
- `DataTable` shell and overflow policy
- accessible confirmation dialog
- connection/sync indicator
- command-state indicator
- authenticated live-match header/shell
- authenticated dashboard shell
- public display shell shared by BLANK/SCHEDULE/LIVE_SCOREBOARD/FINAL_SUMMARY

## 4. Duplication Findings

1. `App.tsx` duplicates page headers, back links, notices, status strips, panel wrappers, definitions lists, tables, form groups, and action rows.
2. Score, foul, clock, timeout, lifecycle, summary, replay, and audit pages repeat match context and synchronization concepts with different markup.
3. Admin screen/theme/schedule pages repeat form-control and save/error feedback structures.
4. Badge/status vocabulary is implemented through page-specific class names such as readiness, live, schedule, final-summary, command, and notice variants.
5. Table wrappers and compact row styles recur without a shared table contract.
6. Confirmation behavior exists in display-screen activation and other guarded flows, but no shared dialog primitive owns focus, target/current metadata, duplicate prevention, and cancel semantics.
7. Public scenes share arena grammar in CSS but do not share one extracted shell component.
8. Responsive breakpoints are global and screen-specific, increasing the risk that an unrelated page changes when a broad selector is edited.

## 5. Visual-Target Common Language

All inspected targets use a dark operational/broadcast grammar with:

- a persistent context header;
- compact cool-border panels;
- red/blue team accents;
- large tabular score/clock typography;
- explicit LIVE/READY/FINAL/ONLINE/WARNING badges;
- high-density tables and event history;
- amber/red warning and confirmation states;
- connection/sync indicators;
- role/RBAC context on authenticated screens;
- audit/correction provenance on private screens;
- clear read-only labeling on public/replay views.

The design system should share semantic grammar, not force identical shells. Public broadcast, operator live control, and admin operations have different information/security needs.

## 6. Public Versus Authenticated Shell Separation

### Public shell requirements

- Must not hydrate authentication or call `/api/v1/auth/me`.
- Must remain read-only and use only explicit public allowlist models.
- Must not render sequence, actor, role, device, session, token, CSRF, command, correlation, causation, audit, or correction-reason metadata.
- Must provide kiosk/fullscreen/zoom utility behavior without command authority.
- Must preserve fixed 16:9 composition, safe inset, reduced motion, forced colors, long-name and three-digit-score handling.

### Authenticated shell requirements

- May display role-authorized operational metadata, including expected/current sequence only where required by protected workflows.
- Must not trust client permission state; it reflects server-derived permissions and active assignment.
- Must support command pending/accepted/rejected/duplicate/sync-required states and stale/offline denial.
- Must provide protected navigation, CSRF-authenticated writes, confirmations, reasons, and correction/audit links.

### Reuse boundary

Safe to share: typography scales, spacing, radii, panel construction, focus rings, icons, buttons, generic badges, generic tables, and warning presentation.

Unsafe to share without an adapter: operator sync/sequence strips, audit/correction detail, role/assignment labels, command states, private IDs, and event rows. Public components must consume public-specific types, never a broad protected projection with CSS hiding.

## 7. Proposed RM-01 Component Architecture

```text
apps/web/src/components/ui/
  ActionButton.tsx
  DataTableFrame.tsx
  Panel.tsx
  StatusBadge.tsx
  SystemNotice.tsx
  ConfirmationDialog.tsx
  ConnectionStatus.tsx
  CommandState.tsx
  index.ts

apps/web/src/components/shells/
  PublicDisplayShell.tsx
  AuthenticatedDashboardShell.tsx
  LiveMatchShell.tsx
  LiveMatchHeader.tsx

apps/web/src/styles/
  tokens.css
  primitives.css
  public-display-shell.css
  authenticated-shell.css
```

Architecture rules:

- Primitive props use semantic variants, not arbitrary color props.
- Shells receive already-authorized, already-mapped view models.
- Public shell types must not import protected projection types.
- Command components submit callbacks but do not construct domain authority or bypass existing control helpers.
- Extraction is incremental; `App.tsx` remains route owner until a separately approved routing refactor.

## 8. Proposed CSS/Token Architecture

Layer tokens from general to context-specific:

```text
1. foundation: font families, numeric typography, spacing, radius, focus, motion
2. semantic: canvas, surface, border, text, muted, info, success, warning, danger
3. component: control heights, panel padding, badge/table/notice states
4. shell: public broadcast, authenticated operator, authenticated admin
5. feature: team accent, clock, shot-clock warning, scene-specific density
```

Recommended naming examples:

```css
--font-ui
--font-display
--font-numeric
--space-1 through --space-8
--radius-panel
--radius-control
--focus-color
--focus-width
--focus-offset
--surface-canvas
--surface-panel
--text-primary
--text-secondary
--status-success
--status-warning
--status-danger
--public-score
--public-game-clock
--public-shot-warning
```

Existing arena values should be aliased to semantic tokens before deletion or broad replacement. Do not convert every hard-coded value in one slice.

## 9. Exact Expected Files For RM-01-P1

Recommended first implementation scope:

```text
apps/web/src/styles/tokens.css
apps/web/src/styles/primitives.css
apps/web/src/components/ui/ActionButton.tsx
apps/web/src/components/ui/Panel.tsx
apps/web/src/components/ui/StatusBadge.tsx
apps/web/src/components/ui/SystemNotice.tsx
apps/web/src/components/ui/index.ts
apps/web/src/main.tsx
tests/web/design-system-primitives.test.ts
```

`main.tsx` should only add ordered stylesheet imports. RM-01-P1 should not migrate feature pages yet. If implementation proves a primitive cannot be meaningfully tested without one adoption point, stop and request a narrow allowlist update rather than editing `App.tsx` implicitly.

## 10. Files That Must Not Change In RM-01-P1

```text
apps/api/**
packages/**
migrations/**
apps/web/src/App.tsx
apps/web/src/auth/**
apps/web/src/lib/**
apps/web/src/components/PublicLiveScoreboard.tsx
apps/web/src/components/PublicFinalSummaryDisplayScene.tsx
apps/web/src/components/PublicBrandAsset.tsx
tests/api/**
tests/db/**
UI-design/**
package.json
package-lock.json
app.js
deployment configuration
```

No route, API contract, socket, RBAC, CSRF, event, projection, or production data change belongs in RM-01-P1.

## 11. Accessibility Requirements

- Preserve the RM-00 native anchor/button behavior and `:focus-visible` baseline.
- Define high-contrast focus tokens with forced-colors fallback.
- Keep minimum practical pointer targets for operator actions; target 44×44 CSS pixels where layout permits.
- Status, warning, pending, and disabled states must not rely on color alone.
- Dialogs require a labelled title, described consequence, initial focus, trapped tab order, Escape/cancel behavior where safe, and focus return.
- Live regions must be deliberate: command feedback assertive only when needed; public ticker remains polite/atomic.
- Tables need captions or accessible labels, valid headers, keyboard-reachable row actions, and controlled overflow.
- Reduced motion must remove decorative/pulse transitions without hiding state changes.
- Numeric score/clock content uses tabular numerals and does not wrap.
- Public long names and multilingual text must fit without viewport-width font scaling.

## 12. Responsive Requirements

Public shell evidence:

```text
1920×1080
1600×900
1366×768
1280×720
1024×576
```

Operator/admin shell evidence:

```text
1920×1080
1600×900
1536×1024
1366×768
```

Requirements:

- Public display keeps a stable 16:9 frame and safe insets.
- Operator live controls keep primary actions visible without overlapping status/history.
- Admin tables scroll within explicit wrappers rather than expanding the page unpredictably.
- 1.5:1 targets (`Court Dashboard`, `rule-profiles`) require tablet landscape validation.
- Hidden/condensed navigation must preserve labels, focus order, and current-route semantics.
- Stable grid tracks and min/max constraints prevent labels, loading states, and badges from shifting fixed-format controls.

## 13. Security And Public/Private Risks

| Risk | Evidence | Required control |
|---|---|---|
| Protected component reused publicly | Shared App monolith and broad contract imports | Public-specific view models and compile-time prop boundaries |
| Sequence/telemetry copied from concept images | Some visual targets show `SEQ` | Do not copy into public DOM; retain explicit mapper tests |
| CSS hiding mistaken for authorization | UI role visibility patterns | Server RBAC/assignment remains authoritative; denied command produces no event/projection change |
| Public auth hydration regression | Auth provider wraps application | Keep path classification before hydration and zero public `/auth/me` tests |
| Confirmation duplicate submission | Page-specific guarded flows | Shared pending lock and confirm-time revalidation |
| Sensitive error rendering | Generic notices may display server text | Sanitize public errors; protected errors still avoid secrets/tokens |
| Team accent applied to score | Visual red/blue team branding | Semantic score token stays fixed off-white |
| Broad CSS selectors regress public/private surfaces | One 2,736-line stylesheet | Layered styles and shell-scoped selectors |

## 14. Test Strategy

RM-01 testing should be additive and proportional:

1. Primitive contract tests: native element, variant classes, disabled/pending semantics, ARIA, focus hooks.
2. CSS contract tests: required semantic tokens, off-white score, cyan clock, red warning, forced colors, reduced motion.
3. Public boundary regressions: zero auth bootstrap, public allowlists, no sequence/private metadata.
4. Protected route regressions: authentication, server-derived permissions, revoked/cross-match denial.
5. Component rendering tests using React DOM/server rendering where practical.
6. Browser viewport matrix with screenshots outside Git, overflow/overlap checks, DOM text/metadata scan, and console capture.
7. Existing full `npm test` and `npm run build` gates before integration.

Visual snapshots alone are insufficient; they do not prove semantics, keyboard behavior, authorization, or public sanitization.

## 15. Implementation Slices

```text
RM-01-P1  Design tokens and primitive components
RM-01-P2  PublicDisplayShell extraction
RM-01-P3  AuthenticatedDashboardShell foundation
RM-01-P4  Shared status, command and table primitives
RM-01-P5  Visual regression and integration closure
```

Slice intent:

- P1 creates unused/tested foundations only, avoiding a broad migration.
- P2 extracts BLANK/SCHEDULE/LIVE_SCOREBOARD/FINAL_SUMMARY framing while preserving public contracts and auth isolation.
- P3 extracts authenticated navigation/context layout without changing RBAC or commands.
- P4 adopts shared command/status/table patterns feature by feature inside the current milestone.
- P5 removes proven duplication only after browser/test evidence, then updates roadmap and integrates.

## 16. Acceptance Criteria

RM-01-D1 is complete when:

- all discovered visual targets are inventoried;
- current routes/components are distinguished from missing targets;
- public/authenticated shell boundaries are explicit;
- token, primitive, shell, test, accessibility, responsive, and security plans are evidence-based;
- RM-01-P1 has an exact file allowlist and non-goals;
- no component, route, contract, or production state is changed.

RM-01 as a top-level milestone is complete only when P1-P5 are integrated, the required browser matrix passes, existing behavior is preserved, and roadmap evidence is updated. Production completion is not implied by RM-01 integration.

## 17. Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Broad `App.tsx` extraction changes behavior | High | High | Extract one shell boundary per slice; preserve page helpers and route parser |
| Global CSS token migration causes visual regressions | High | High | Alias existing values first; use scoped adoption and viewport evidence |
| Public/private model leakage | Medium | Critical | Separate prop types, public allowlist tests, DOM scans |
| Primitive abstraction is too generic | Medium | Medium | Implement only variants already repeated in three or more surfaces |
| Status semantics diverge | Medium | High | Define one status vocabulary and require text/icon alongside color |
| Dialog abstraction breaks existing safe flows | Medium | High | Preserve cancel/no-write tests and confirm-time revalidation |
| Dense operator UI loses speed | Medium | High | Measure target viewports and keyboard/touch workflows before adoption |
| Rule behavior inferred from visual examples | Low | Critical | Mark `NEEDS SOURCE`; keep primitives presentation-only |
| Test monolith becomes harder to maintain | High | Medium | Add focused design-system suites; avoid enlarging admin test unnecessarily |

## 18. Product Decisions Required

1. Confirm whether operator and admin dashboards share one dark theme or two density/theme variants.
2. Confirm whether compact operator controls target touch-first 44×44 minimum at every supported viewport or allow documented dense exceptions.
3. Confirm canonical public score display route priority: direct match display versus screen-slug scene orchestration.
4. Confirm public utility-control visibility policy in kiosk, normal, zoom, and fullscreen modes.
5. Confirm whether public standings show qualification/tiebreak labels before the tournament governing document is loaded; recommendation: safe unavailable/neutral status only.
6. Confirm global audit export scope, retention, and roles.
7. Confirm venue manager and rule administrator as separate roles or ADMIN-only MVP.
8. Confirm player attribution visibility and requirements on operator score/foul surfaces.
9. Confirm publication/lock/reopen authority for final results.

## 19. Explicit Non-Goals

- No component implementation in RM-01-D1.
- No new route or backend endpoint.
- No API/socket/public contract change.
- No migration or database change.
- No event type, command, projection, replay, correction, snapshot, or scoring semantic change.
- No mutable scoreboard/display-state source of truth.
- No timer tick events.
- No fake teams, scores, schedule rows, summary, ticker, audit, or live data.
- No basketball/tournament rule automation.
- No production build, deployment, restart, login, scene activation, command, or data write.
- No copying or committing `UI-design` images or generated screenshots.
- No general router/library migration.

## 20. Recommended First Implementation Slice

Proceed only with:

```text
RM-01-P1 - Design Tokens and Primitive Components
```

Recommended execution:

1. Add `tokens.css` with foundation and semantic tokens that alias current arena-safe values.
2. Add `primitives.css` for panel, status, action, notice, focus, forced-colors, and reduced-motion contracts.
3. Add native-element React primitives with narrow semantic variants.
4. Import the new style layers from `main.tsx` before existing `styles.css` so current feature CSS remains authoritative during P1.
5. Add focused rendering/CSS contract tests.
6. Do not adopt primitives into `App.tsx` until a separately approved follow-up slice.

Stop after P1 and report evidence plus the next safe step. Do not begin RM-01-P2 automatically.
