import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
    expect(html).not.toMatch(/playerStats|boxScore|private-command|commandId|clock|sequence|event/i);
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

    expect(html).toContain("Final tie");
    expect(html).not.toContain(" wins");
  });

  it("renders only the safe unavailable state for a non-final match", () => {
    const html = render({
      matchId,
      status: "UNAVAILABLE",
      message: "Final summary is not available.",
      homeScore: 77,
      awayScore: 76
    });

    expect(html).toContain("Final result unavailable");
    expect(html).toContain("Final summary is not available.");
    expect(html).not.toContain("77");
    expect(html).not.toContain("76");
    expect(html).not.toContain("public-display-final-score");
  });
});
