import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const app = readFileSync("apps/web/src/App.tsx", "utf8");
const entry = readFileSync("apps/web/src/main.tsx", "utf8");
const css = readFileSync("apps/web/src/styles/bsb-design-adoption.css", "utf8");
const score = readFileSync("apps/web/src/components/ScoreWorkspace.tsx", "utf8");

function pageSource(start: string, end: string) {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from + 1);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return app.slice(from, to);
}

describe("BSB design adoption — existing working operator routes", () => {
  test("loads scope-specific CSS after the legacy bundle", () => {
    expect(entry).toContain('import "./styles/bsb-design-adoption.css";');
    expect(entry.indexOf('import "./styles.css";')).toBeLessThan(
      entry.indexOf('import "./styles/bsb-design-adoption.css";')
    );
    expect(css).toContain(".bsb-main-live-dashboard");
    expect(css).toContain(".bsb-match-pairing");
    expect(css).toContain(".score-workspace");
  });

  test("keeps real live tournament data, read links and polling intact", () => {
    const page = pageSource("function TournamentLiveDashboardPage", "function PublicTournamentsPage");
    expect(page).toContain('className="panel bsb-main-live-dashboard"');
    expect(page).toContain("api.getTournamentLiveDashboard(tournamentId)");
    expect(page).toContain("window.setInterval(");
    expect(page).toContain("<LiveDashboardMatchCard");
    expect(page).toContain("buildLiveDashboardSummary(matches)");
  });

  test("keeps canonical scheduled pairing create, conflict validation and court links", () => {
    const page = pageSource("function AdminTournamentSchedulePage", "function AdminTournamentDisplayThemePage");
    expect(page).toContain('className="panel bsb-match-pairing"');
    expect(page).toContain("getScheduledMatchConflictWarning(");
    expect(page).toContain("api.createTournamentMatch(tournamentId, createTournamentMatchPayload(matchForm))");
    expect(page).toContain("buildVenueCourtOptions(venues)");
    expect(page).toContain("<ScheduleTable matches={matches}");
  });

  test("keeps score controls server-guarded and correction separate", () => {
    expect(score).toContain("disabled={!controlsEnabled || commandPending}");
    expect(score).toContain("onScore(panel.teamSide, button.points)");
    expect(score).toContain("No player attribution");
    expect(score).toContain('aria-label="Score correction entry"');
    expect(css).toContain(".score-workspace .score-workspace__score-actions button:disabled");
    expect(css).toContain("opacity: .44");
  });

  test("has usable narrow layouts, focus treatments and reduced motion", () => {
    expect(css).toContain("@media (max-width: 700px)");
    expect(css).toContain("@media (max-width: 360px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("overflow-x: auto");
  });
});
