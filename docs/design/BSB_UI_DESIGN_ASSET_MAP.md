# BSB-2026 — UI Design Asset Map (Source of Truth: Local UI-design)

**Purpose:** Preserve a traceable design-to-working-API mapping, not a declaration of visual acceptance.

**Local source directory (Owner Windows):** `C:\2025\web-69\BasketBallScoreBoard2026\web_ScoreBoard\UI-design`

**Independent source receipt:** RIN V2's 2026-10-22 10:14 ICT response. Files are **not included or copied into this branch**, and GitHub reviewer cannot infer pixel-exact parity from their filenames/hash alone. Dimensions and hashes are provided by RIN's preflight.

| Original PNG | Dimensions | SHA-256 | Product route/components | PR |
|---|---|---|---|---|
| DisplayPublicFullHD.png | 1672×941 | `a85568620fe96f59aaabeb3b0c2665c4c96537ecf7cb92ac209e5df4c7e284b7` | Public display: `PublicLiveScoreboard`, `PublicDisplayShell`, theme/display library | #10 |
| DisplayPublicResponsive.png | 941×1672 | `5e03046e808953f681f32d33212a5f8dbef6f5833250a357b5e433eb42e8bf52` | Same Public Display route, portrait layout | #10 |
| Main Live Scoreboard Dashboard.png | 1672×941 | `21d37c98a5effd36fda7d9ba712f54ebaa1d11819c3711b0a8de8ef24113926e` | `TournamentLiveDashboardPage`, `LiveDashboardMatchCard`, `buildLiveDashboardCard` | #11 |
| UI Score Control Dashboard.png | 1672×941 | `cfb7273a9a34d75862e83c966bc4a2622188179e6de5c0ed52c6b1938b9144a4` | `OperatorScorePage`, `LiveMatchShell`, `ScoreWorkspace`; read-only match facts | #11 |
| Match Pairing Dashboard.png | 1672×941 | `1342f7b77a8dca84c38264caf60e739cb5cf768c36eb999c21bc41efd7594ee7` | `AdminTournamentSchedulePage`, `ScheduleTable`, `bsb-pairing-review` | #11 |

## Implementation status and bounded gaps

### Public Display — PR #10
- Existing projection-backed Home/Away scores, period, game and shot clocks, team fouls, timeouts, recent plays, network state. Do not copy sample numbers/team names from PNG.
- **NEEDS_BROWSER_EVIDENCE:** desktop and portrait screenshots against the two original PNGs, with exact viewport dimensions and actual screenshot/console receipts.
- **API_CONTRACT_MISSING:** bonus should not appear as live factual status unless supported by canonical projection.

### Main Live — PR #11
- **ALREADY_IMPLEMENTED:** multi-match tournament summary, score, clocks, sequence, warnings/readiness and authorized operations links.
- **SAFE_UI_GAP:** supplied image centers a featured match, metadata, possession, recent plays and sync; current real API feeds multi-match cards. Preserve truthful multi-match dashboard. A featured-match view is acceptable only with an appropriate authoritative per-match read model and true data; do not fabricate possession/recent events.
- **API_CONTRACT_MISSING:** `LiveDashboardMatchItem` does not include possession, recent event strip, team timeouts/fouls or connection telemetry.

### Score Control — PR #11
- **ALREADY_IMPLEMENTED:** optional player selection, guarded +1/+2/+3, queue reconciliation, separate correction, HOME/AWAY score and fouls.
- **IMPLEMENTED_AFTER_RIN_10_14_RECEIPT (UNTESTED):** `ScoreWorkspace` now receives a **read-only** game clock, shot clock, and Home/Away remaining timeout summary via `buildScoreWorkspaceFacts(ScoreboardProjection, nowMs)`. Data missing from the projection displays `—`, not invented quota or clock. Existing `buildClockControlState` derives running clock labels; no additional mutations/control buttons/API requests. Tests added under `tests/web/score-workspace-facts.test.ts`, **NOT RUN**.
- **NEEDS_BROWSER_EVIDENCE:** match presentation/contrast responsive comparison and one-score authoritative state transition. Never infer render success from code.

### Match Pairing — PR #11
- **ALREADY_IMPLEMENTED:** existing schedule/teams/venues API, matchup and court/time conflict warnings, creation form with validation and protected auth.
- **IMPLEMENTED_AFTER_RIN_PRIOR_RECEIPT (UNTESTED):** `bsb-pairing-review` selection panel uses existing schedule list and current operations link. No local pairing state mutation.
- **NEEDS_BROWSER_EVIDENCE:** schedule table + chosen detail geometry, phone reflow, semantics/access controls.

## Functional One-Match Acceptance (not yet executed)
1. Disposable demo, schedule two teams and court, confirm valid pairing and conflict warning behavior.
2. Open selected match via existing operations link, verify effective access, ensure unauthorized controls stay disabled.
3. In score control, verify projection-backed read-only clock/timeout labels match authoritative API and refresh (incl. missing optional fields).
4. Submit one actual permitted demo score action, verify same score/currentSeq in refreshed protected projection and public display; reconnect/offline states remain truthful.
5. Browser views at Desktop 1920×1080, Mobile 390×844, Narrow 320px. Compare screenshot against originals, record differences and meaningful follow-up fixes.
6. Run `npm ci`, `npm run lint`, `npm run build:api`, `npm run build:web`, `npm test -- tests/web/score-workspace-facts.test.ts tests/web/bsb-design-adoption.test.ts tests/web/operator-score-live-match-shell.test.ts` **only in actually authorized safe environment**. `NOT_RUN` until logs confirm real process exit code.

## Change/authority boundaries
- RIN governs; HERMES is the existing coding agent if its task-bound execution path is actually proven. No sixth agent. Neither RIN's read-only tools nor GPT connector scopes transfer to one another.
- Owner is the Windows administrator; this is not authorization to install a sandbox, adjust ACLs, patch shared Hermes launcher, or execute unconfined shell.
- Draft PRs #10/#11 remain unmerged. Original dirty checkout, BSB-G2-Test, preview port 3101, DB/production/staging, other project roots and credentials remain untouched.
- Claim `SOURCE_REVIEW_COMPLETE` and `IMPLEMENTED_UNTESTED`, **not** `TEST_PASS` or `VISUAL_ACCEPTED`, until real evidence exists.
