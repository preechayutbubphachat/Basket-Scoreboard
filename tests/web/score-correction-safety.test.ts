import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { CorrectionEligibleEvent, ScoreboardProjection } from "@basket-scoreboard/api-contracts";
import { ScoreCorrectionWorkspace } from "../../apps/web/src/components/ScoreCorrectionWorkspace";
import { buildScoreCorrectionReview, isSameCorrectionTarget } from "../../apps/web/src/lib/correctionControl";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");
const workspaceSource = readFileSync("apps/web/src/components/ScoreCorrectionWorkspace.tsx", "utf8");
const scoreWorkspaceSource = readFileSync("apps/web/src/components/ScoreWorkspace.tsx", "utf8");

const projection = {
  homeScore: 72,
  awayScore: 68,
  homeTeamName: "Bangkok Tigers",
  awayTeamName: "Phuket Sharks",
  currentSeq: 44,
  periodNumber: 4
} as ScoreboardProjection;

const target: CorrectionEligibleEvent = {
  seqNo: 41,
  eventType: "SCORE_ADDED",
  occurredAt: "2026-07-18T12:00:00.000Z",
  actorDisplayName: null,
  summary: "HOME +2 · #12 Kittipong",
  eligible: true,
  ineligibleReason: null,
  correctionKind: "SCORE_UNDO",
  currentValue: { teamSide: "HOME", points: 2, playerName: "Kittipong", jerseyNumber: "12", playerId: "player-12" },
  proposedCompensation: { teamSide: "HOME", points: -2 }
};

function render(stage: "closed" | "edit" | "confirm") {
  const review = buildScoreCorrectionReview(projection, target, "  scorer table entry  ");
  return renderToStaticMarkup(createElement(ScoreCorrectionWorkspace, {
    error: null,
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    onFocusReturn: vi.fn(),
    onReasonChange: vi.fn(),
    onReview: vi.fn(),
    pending: false,
    reason: "scorer table entry",
    review,
    selectedSummary: target.summary,
    stage
  }));
}

describe("RM-05-P3 score correction safety", () => {
  test("builds an exact non-authoritative review from the selected score event", () => {
    const review = buildScoreCorrectionReview(projection, target, "  scorer table entry  ");
    expect(review).toMatchObject({
      seqNo: 41,
      eventType: "SCORE_ADDED",
      correctionKind: "SCORE_UNDO",
      reason: "scorer table entry",
      teamLabel: "HOME - Bangkok Tigers",
      playerLabel: "#12 Kittipong",
      effectLabel: "72 to 70 (preview only)",
      expectedSeq: 44
    });
    expect(isSameCorrectionTarget(target, review)).toBe(true);
    expect(isSameCorrectionTarget({ ...target, seqNo: 42 }, review)).toBe(false);
    expect(isSameCorrectionTarget({ ...target, eligible: false }, review)).toBe(false);
  });

  test("requires edit then explicit confirmation and exposes exact target context", () => {
    expect(render("edit")).toContain("Prepare score correction");
    const confirmation = render("confirm");
    expect(confirmation).toContain("Confirm score correction");
    expect(confirmation).toContain("#41 · SCORE_ADDED");
    expect(confirmation).toContain("HOME - Bangkok Tigers");
    expect(confirmation).toContain("#12 Kittipong");
    expect(confirmation).toContain("72 to 70 (preview only)");
    expect(confirmation).toContain("scorer table entry");
    expect(confirmation).toContain("server remains authoritative");
  });

  test("uses native dialog cancellation, focus return and pending-safe controls", () => {
    expect(workspaceSource).toContain("dialog.showModal()");
    expect(workspaceSource).toContain("onCancel={(event)");
    expect(workspaceSource).toContain("props.onFocusReturn()");
    expect(workspaceSource).toContain("disabled={props.pending}");
    expect(workspaceSource).not.toMatch(/api\.|fetch\(|expectedSeq/);
  });

  test("revalidates authoritative sequence and exact target before one route-owned dispatch", () => {
    const correctionRoute = appSource.slice(appSource.indexOf("function OperatorCorrectionsPage"), appSource.indexOf("function MatchSummaryPage"));
    expect(correctionRoute).toContain("correctionDispatchRef.current");
    expect(correctionRoute).toContain("api.getMatchProjection(matchId)");
    expect(correctionRoute).toContain("api.getEligibleCorrectionEvents(matchId");
    expect(correctionRoute).toContain("latestProjection.currentSeq !== review.expectedSeq");
    expect(correctionRoute).toContain("isSameCorrectionTarget(authoritativeTarget, review)");
    expect(correctionRoute).toContain("api.applyAlphaCorrection(");
    expect(correctionRoute).not.toMatch(/subtract|setScore|homeScore\s*=|awayScore\s*=/i);
  });

  test("blocks correction navigation while P2 owns active, queued or paused score work", () => {
    const scoreRoute = appSource.slice(appSource.indexOf("function OperatorScorePage"), appSource.indexOf("function OperatorFoulPage"));
    expect(scoreRoute).toContain("scoreQueue.activeIntent || scoreQueue.queuedIntents.length > 0 || scoreQueue.pauseReason");
    expect(scoreWorkspaceSource).toContain("if (!correctionEntry.blocked) correctionEntry.onNavigate()");
    expect(scoreWorkspaceSource).toContain('aria-disabled={correctionEntry.blocked || undefined}');
  });
});
