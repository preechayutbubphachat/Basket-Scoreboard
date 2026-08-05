import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { ScoreWorkspace, type ScoreWorkspaceProps } from "../../apps/web/src/components/ScoreWorkspace";
import { buildScoreControlPanels } from "../../apps/web/src/lib/scoreControl";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");
const componentSource = readFileSync("apps/web/src/components/ScoreWorkspace.tsx", "utf8");
const cssSource = readFileSync("apps/web/src/styles/score-workspace.css", "utf8");

function props(overrides: Partial<ScoreWorkspaceProps> = {}): ScoreWorkspaceProps {
  const panels = buildScoreControlPanels({
    awayScore: 84,
    awayTeamName: "Phuket Sharks",
    homeScore: 88,
    homeTeamName: "Bangkok Tigers"
  }).map((panel) => ({
    ...panel,
    fouls: panel.teamSide === "HOME" ? 4 : 3,
    playerOptions: panel.teamSide === "HOME"
      ? [{ label: "#12 Kittipong", playerId: "home-player" }]
      : [{ label: "#9 Thanawat", playerId: "away-player" }],
    selectedPlayerId: ""
  }));

  return {
    commandPending: false,
    connectionLabel: "Realtime connected",
    controlsEnabled: true,
    scoreControlsVisible: true,
    correctionEntry: { href: "/operator/matches/match-1/corrections", onNavigate: vi.fn() },
    currentSeq: 1284,
    matchStatus: "LIVE",
    onPlayerChange: vi.fn(),
    onScore: vi.fn(),
    panels,
    pendingKey: null,
    periodLabel: "P4",
    ...overrides
  };
}

describe("RM-05-P1 Score workspace", () => {
  test("renders dominant HOME and AWAY domains with only supported score values", () => {
    const html = renderToStaticMarkup(createElement(ScoreWorkspace, props()));

    expect(html).toContain("Bangkok Tigers");
    expect(html).toContain("Phuket Sharks");
    expect(html).toContain('aria-label="HOME score 88"');
    expect(html).toContain('aria-label="AWAY score 84"');
    for (const side of ["HOME", "AWAY"]) {
      for (const points of [1, 2, 3]) expect(html).toContain(`${side} add ${points} point`);
    }
    expect(html).not.toMatch(/subtract|direct score|set score|[-+]4/i);
    expect((html.match(/<button/g) ?? [])).toHaveLength(6);
  });

  test("keeps optional player attribution and correction entry separate", () => {
    const html = renderToStaticMarkup(createElement(ScoreWorkspace, props()));

    expect(html).toContain("Optional scoring player");
    expect(html).toContain("No player attribution");
    expect(html).toContain("#12 Kittipong");
    expect(html).toContain("#9 Thanawat");
    expect(html).toContain('aria-label="Score correction entry"');
    expect(html).toContain("Corrections target a prior event. They are not negative scoring controls.");
  });

  test("binds every action to its panel team side and exact supported point value", () => {
    expect(componentSource).toContain("onScore(panel.teamSide, button.points)");
    expect(componentSource).toContain("onPlayerChange(panel.teamSide, event.target.value)");
    expect(buildScoreControlPanels({ homeScore: 0, awayScore: 0 }).flatMap((panel) =>
      panel.buttons.map((button) => `${panel.teamSide}:${button.points}`)
    )).toEqual(["HOME:1", "HOME:2", "HOME:3", "AWAY:1", "AWAY:2", "AWAY:3"]);
  });

  test("preserves route ownership and uses effective access as the score authority", () => {
    const scoreSource = appSource.slice(
      appSource.indexOf("function OperatorScorePage"),
      appSource.indexOf("function OperatorFoulPage")
    );

    for (const ownerSignal of [
      "api.getMatchProjection(matchId)",
      "api.getMatchRosters(matchId)",
      "api.getEffectiveMatchAccess(matchId)",
      "usePublicProjectionRealtime(",
      "window.setInterval(",
      "api.syncMatch(matchId",
      "api.addScore(matchId",
      "projection.currentSeq",
      "resolveScoreEffectiveAccess(matchId, accessPhase, effectiveAccess)",
      "const canSubmitScore = accessState.canOperateScore",
      "<ScoreWorkspace"
    ]) expect(scoreSource).toContain(ownerSignal);
    expect(scoreSource).not.toContain("canOperateScore(currentUser, matchId)");

    expect(componentSource).not.toMatch(/api\.|fetch\(|usePublicProjectionRealtime|setInterval|canOperateScore|EffectiveMatchAccess/);
    expect(scoreSource).not.toContain("effectiveAccess.capabilities.scoreOperate");
  });

  test("provides P1 touch, focus, responsive, and short-height contracts", () => {
    expect(cssSource).toMatch(/min-height:\s*64px/);
    expect(cssSource).toMatch(/min-height:\s*44px/);
    expect(cssSource).toContain(":focus-visible");
    expect(cssSource).toContain("@media (max-height: 620px)");
    expect(cssSource).toContain("@media (forced-colors: active)");
    expect(cssSource).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
