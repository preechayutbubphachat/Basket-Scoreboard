import { describe, expect, it } from "vitest";
import {
  applyMatchFinished,
  applyScoreAdded,
  applyScoreCorrected,
  createInitialScoreboardProjection,
  normalizeScoreboardProjection,
  type ScoreboardProjection
} from "../../apps/api/src/matchEventStore/projection";
import {
  buildPublicFinalSummaryProjection,
  type PublicFinalSummaryLabels
} from "../../apps/api/src/displayScreens/publicFinalSummaryProjection";

const matchId = "11111111-1111-4111-8111-111111111111";
const finishedAt = "2026-07-10T10:00:00.000Z";

const labels: PublicFinalSummaryLabels = {
  matchId,
  homeTeamId: "home-team-id",
  awayTeamId: "away-team-id",
  homeTeamName: "Bangkok Home",
  awayTeamName: "Chiang Mai Away",
  tournamentLabel: "Alpha Cup",
  roundLabel: "Final",
  venueLabel: "Main Hall",
  courtLabel: "Court A"
};

function finished(homeScore: number, awayScore: number) {
  return applyMatchFinished({
    ...createInitialScoreboardProjection(matchId),
    status: "PERIOD_BREAK",
    homeScore,
    awayScore
  }, {
    finishedAt,
    finalHomeScore: 999,
    finalAwayScore: 998,
    winnerSide: "HOME",
    reason: null
  }, 1);
}

function publicSummary(projection: ScoreboardProjection | null, labelInput = labels) {
  return buildPublicFinalSummaryProjection(matchId, projection, labelInput);
}

describe("public final summary projection", () => {
  it.each([
    [91, 88, "HOME", "Bangkok Home"],
    [84, 89, "AWAY", "Chiang Mai Away"],
    [77, 77, null, null]
  ] as const)("derives the public winner for %i-%i", (home, away, winnerSide, winnerDisplayName) => {
    expect(publicSummary(finished(home, away))).toEqual({
      matchId,
      status: "FINAL",
      homeTeamName: "Bangkok Home",
      awayTeamName: "Chiang Mai Away",
      homeScore: home,
      awayScore: away,
      winnerSide,
      winnerDisplayName,
      tournamentLabel: "Alpha Cup",
      roundLabel: "Final",
      venueLabel: "Main Hall",
      courtLabel: "Court A",
      completedAt: finishedAt
    });
  });

  it("uses current scores instead of stale cached final outcome", () => {
    const projection = {
      ...finished(91, 88),
      finalScore: { home: 1, away: 999 },
      winnerSide: "AWAY" as const
    };

    expect(publicSummary(projection)).toMatchObject({
      homeScore: 91,
      awayScore: 88,
      winnerSide: "HOME",
      winnerDisplayName: "Bangkok Home"
    });
  });

  it("returns one sanitized unavailable shape for missing, unfinished, incomplete, or inconsistent input", () => {
    const unavailable = { matchId, status: "UNAVAILABLE", message: "Final summary is not available." };
    expect(publicSummary(null)).toEqual(unavailable);
    expect(publicSummary(createInitialScoreboardProjection(matchId))).toEqual(unavailable);
    expect(publicSummary(finished(80, 79), { ...labels, awayTeamId: null })).toEqual(unavailable);
    expect(publicSummary(finished(80, 79), { ...labels, homeTeamName: "" })).toEqual(unavailable);
    expect(buildPublicFinalSummaryProjection(matchId, { ...finished(80, 79), matchId: "other" }, labels)).toEqual(unavailable);
  });

  it("keeps optional labels nullable without fabricating display text", () => {
    expect(publicSummary(finished(80, 79), {
      ...labels,
      tournamentLabel: null,
      roundLabel: " ",
      venueLabel: null,
      courtLabel: null
    })).toMatchObject({
      tournamentLabel: null,
      roundLabel: null,
      venueLabel: null,
      courtLabel: null
    });
  });

  it("tracks post-final winner-to-tie and tie-to-winner corrections", () => {
    const homeWinner = finished(90, 87);
    const tie = applyScoreCorrected(homeWinner, { teamSide: "HOME", points: 3 }, 2);
    const awayWinner = applyScoreAdded(tie, {
      teamSide: "AWAY",
      points: 2,
      playerId: null,
      periodNumber: 4,
      gameClockRemainingMs: 0,
      note: null
    }, 3);

    expect(publicSummary(tie)).toMatchObject({ homeScore: 87, awayScore: 87, winnerSide: null, winnerDisplayName: null });
    expect(publicSummary(awayWinner)).toMatchObject({ homeScore: 87, awayScore: 89, winnerSide: "AWAY", winnerDisplayName: "Chiang Mai Away" });
  });

  it("produces the same public result from replay and snapshot catch-up", () => {
    const fullReplay = applyScoreCorrected(finished(90, 89), { teamSide: "HOME", points: 2 }, 2);
    const staleSnapshot = {
      ...finished(90, 89),
      finalScore: { home: 999, away: 1 },
      winnerSide: "HOME" as const
    };
    const snapshotCatchUp = applyScoreCorrected(
      normalizeScoreboardProjection(staleSnapshot),
      { teamSide: "HOME", points: 2 },
      2
    );

    expect(publicSummary(snapshotCatchUp)).toEqual(publicSummary(fullReplay));
    expect(publicSummary(fullReplay)).toMatchObject({ homeScore: 88, awayScore: 89, winnerSide: "AWAY" });
  });

  it("exposes only the approved public keys", () => {
    const summary = publicSummary(finished(91, 88));
    expect(Object.keys(summary).sort()).toEqual([
      "awayScore",
      "awayTeamName",
      "completedAt",
      "courtLabel",
      "homeScore",
      "homeTeamName",
      "matchId",
      "roundLabel",
      "status",
      "tournamentLabel",
      "venueLabel",
      "winnerDisplayName",
      "winnerSide"
    ]);
    expect(JSON.stringify(summary)).not.toMatch(/teamId|player|boxScore|clock|seq|event|actor|device|session|token|csrf|commandId|correlationId|causationId|audit|correction|reason|metadata/i);
  });
});
