import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PublicFinalSummaryDisplayScene } from "../../apps/web/src/components/PublicFinalSummaryDisplayScene";
import { buildPublicDisplaySceneModel } from "../../apps/web/src/lib/publicDisplayScene";

const matchId = "11111111-1111-4111-8111-111111111111";

function modelFor(publicData: Record<string, unknown>) {
  const model = buildPublicDisplaySceneModel({
    screen: { screenSlug: "final-test", displayName: "Arena Final" },
    activeScene: { sceneType: "FINAL_SUMMARY", publicData, refreshAfterMs: 30000 },
    serverTime: "2026-07-10T10:01:00.000Z"
  });
  if (model.status !== "READY" || model.sceneType !== "FINAL_SUMMARY") {
    throw new Error("Expected final summary scene model");
  }
  return model;
}

function render(publicData: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(PublicFinalSummaryDisplayScene, { model: modelFor(publicData) }));
}

describe("public final summary DOM", () => {
  it("renders the approved finalized 88-84 browser fixture contract", () => {
    const html = render({
      matchId: "final-summary-fixture",
      status: "FINAL",
      homeTeamName: "Bangkok Thunder",
      awayTeamName: "Chiang Mai Falcons",
      homeScore: 88,
      awayScore: 84,
      winnerSide: "HOME",
      winnerDisplayName: "Bangkok Thunder",
      tournamentLabel: "National Invitational",
      roundLabel: "Semi Final",
      venueLabel: "Main Arena",
      courtLabel: "Court 1",
      completedAt: "2026-07-16T12:00:00.000Z"
    });

    expect(html).toContain("Bangkok Thunder");
    expect(html).toContain("Chiang Mai Falcons");
    expect(html).toContain('class="public-display-final-score">88');
    expect(html).toContain('class="public-display-final-score">84');
    expect(html).toContain("Bangkok Thunder wins");
    expect(html).toContain("National Invitational / Semi Final");
    expect(html).toContain("Main Arena / Court 1");
    expect(html).toContain('<time dateTime="2026-07-16T12:00:00.000Z">');
    expect(html).not.toContain("2026-07-16T12:00:00.000Z</time>");
  });

  it("renders real final data without private or fabricated detail", () => {
    const html = render({
      matchId,
      status: "FINAL",
      homeTeamName: "Bangkok Home",
      awayTeamName: "Chiang Mai Away",
      homeScore: 91,
      awayScore: 88,
      winnerSide: "HOME",
      winnerDisplayName: "Bangkok Home",
      tournamentLabel: "Alpha Cup",
      roundLabel: "Final",
      venueLabel: "Main Hall",
      courtLabel: "Court A",
      completedAt: "2026-07-10T10:00:00.000Z",
      playerStats: [{ name: "Private" }],
      commandId: "private-command"
    });

    expect(html).toContain('aria-label="Final score"');
    expect(html).toContain("Bangkok Home");
    expect(html).toContain("Chiang Mai Away");
    expect(html).toContain('class="public-display-final-score">91');
    expect(html).toContain('class="public-display-final-score">88');
    expect(html).toContain("Bangkok Home wins");
    expect(html).toContain("winner-home");
    expect(html).toContain("home-final-team final-winner");
    expect(html).not.toContain("away-final-team final-winner");
    expect(html).not.toMatch(/playerStats|boxScore|private-command|commandId|clock|sequence|currentSeq|lastEventSeq|seqNo|eventSeq|projectionSeq|expectedSeq|event/i);
  });

  it("renders an away winner from the public projection without calculating one", () => {
    const html = render({
      matchId,
      status: "FINAL",
      homeTeamName: "Bangkok Home",
      awayTeamName: "Chiang Mai Away",
      homeScore: 98,
      awayScore: 105,
      winnerSide: "AWAY",
      winnerDisplayName: "Chiang Mai Away"
    });

    expect(html).toContain("Chiang Mai Away wins");
    expect(html).toContain("winner-away");
    expect(html).toContain("away-final-team final-winner");
    expect(html).not.toContain("home-final-team final-winner");
  });

  it("renders a neutral tie without inventing a winner", () => {
    const html = render({
      matchId,
      status: "FINAL",
      homeTeamName: "Bangkok Home",
      awayTeamName: "Chiang Mai Away",
      homeScore: 88,
      awayScore: 88,
      winnerSide: null,
      winnerDisplayName: null
    });

    expect(html).toContain("Tied game");
    expect(html).toContain("final-tie");
    expect(html).not.toContain(" wins");
    expect(html).not.toContain("final-winner");
  });

  it("keeps long names and three-digit scores in the fixed public score structure", () => {
    const html = render({
      matchId,
      status: "FINAL",
      homeTeamName: "Bangkok Metropolitan Championship Basketball Club",
      awayTeamName: "Chiang Mai International Arena Selection",
      homeScore: 123,
      awayScore: 119,
      winnerSide: "HOME",
      winnerDisplayName: "Bangkok Metropolitan Championship Basketball Club",
      tournamentLabel: null,
      roundLabel: null,
      venueLabel: null,
      courtLabel: null,
      completedAt: null
    });

    expect(html).toContain('class="public-display-final-score">123');
    expect(html).toContain('class="public-display-final-score">119');
    expect(html).not.toContain("public-display-final-meta");
    expect(html).not.toContain("<time");
    expect(html).not.toMatch(/Unknown|Venue TBD|Time TBD/);
  });

  it("handles nullable winner, metadata, and completion time without fabrication", () => {
    const html = render({
      matchId,
      status: "FINAL",
      homeTeamName: "Bangkok Home",
      awayTeamName: "Chiang Mai Away",
      homeScore: 88,
      awayScore: 88,
      winnerSide: null,
      winnerDisplayName: null,
      tournamentLabel: null,
      roundLabel: null,
      venueLabel: null,
      courtLabel: null,
      completedAt: null
    });

    expect(html).toContain("Tied game");
    expect(html).not.toMatch(/null|undefined| wins|Venue TBD|Time TBD/);
    expect(html).not.toContain("public-display-final-meta");
    expect(html).not.toContain("<time");
  });

  it("renders only the safe unavailable state for a non-final match", () => {
    const html = render({
      matchId,
      status: "UNAVAILABLE",
      message: "Final summary is not available.",
      homeScore: 77,
      awayScore: 76
    });

    expect(html).toContain("Final Result");
    expect(html).toContain("Result not available");
    expect(html).toContain("Final summary is not available.");
    expect(html).not.toContain("77");
    expect(html).not.toContain("76");
    expect(html).not.toContain("public-display-final-score");
    expect(html).not.toMatch(/winner| wins|Tied game/i);
  });

  it("keeps browser fixtures test-only with no production fixture route or lifecycle owner", () => {
    const appSource = readFileSync(resolve("apps/web/src/App.tsx"), "utf8");
    const apiSource = readFileSync(resolve("apps/web/src/lib/apiClient.ts"), "utf8");
    const rendererSource = readFileSync(resolve("apps/web/src/components/PublicFinalSummaryDisplayScene.tsx"), "utf8");
    const browserFixtureSource = readFileSync(resolve("tests/browser/public-final-summary-browser.cjs"), "utf8");

    expect(`${appSource}\n${apiSource}`).not.toMatch(/final-summary-fixture|\/test-final|\/debug-final|fixture(?:Mode|Query|Flag)/i);
    expect(browserFixtureSource).toContain('context.route("**/api/v1/public/display/**"');
    expect(browserFixtureSource).toContain("route.fulfill");
    expect(rendererSource).not.toMatch(/fetch\(|socket\.emit|io\(|new Socket|setInterval|setTimeout|localStorage|sessionStorage/);
  });
});
