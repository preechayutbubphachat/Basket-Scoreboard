import { describe, expect, it } from "vitest";
import {
  applyMatchFinished,
  applyScoreAdded,
  applyScoreCorrected,
  applyScoreRemovedByCorrection,
  createInitialScoreboardProjection,
  deriveFinalOutcome,
  normalizeScoreboardProjection,
  type ScoreboardProjection
} from "../../apps/api/src/matchEventStore/projection";

const matchId = "11111111-1111-4111-8111-111111111111";
const finishedAt = "2026-07-10T10:00:00.000Z";

function projectionWithScore(home: number, away: number): ScoreboardProjection {
  return {
    ...createInitialScoreboardProjection(matchId),
    status: "PERIOD_BREAK",
    homeScore: home,
    awayScore: away
  };
}

function finish(projection: ScoreboardProjection, seqNo = 1): ScoreboardProjection {
  return applyMatchFinished(projection, {
    finishedAt,
    finalHomeScore: 999,
    finalAwayScore: 998,
    winnerSide: "HOME",
    reason: null
  }, seqNo);
}

function scoreAdded(teamSide: "HOME" | "AWAY", points: 1 | 2 | 3) {
  return {
    teamSide,
    points,
    playerId: null,
    periodNumber: 4,
    gameClockRemainingMs: 0,
    note: null
  };
}

describe("final outcome projection consistency", () => {
  it.each([
    [91, 88, "HOME"],
    [84, 89, "AWAY"],
    [77, 77, null]
  ] as const)("derives final outcome for %i-%i", (home, away, winnerSide) => {
    expect(deriveFinalOutcome(home, away)).toEqual({
      finalScore: { home, away },
      winnerSide
    });

    expect(finish(projectionWithScore(home, away))).toMatchObject({
      status: "FINISHED",
      homeScore: home,
      awayScore: away,
      finalScore: { home, away },
      winnerSide,
      matchFinishedAt: finishedAt
    });
  });

  it("recomputes a post-final home correction that changes the winner", () => {
    const corrected = applyScoreCorrected(finish(projectionWithScore(90, 89)), {
      teamSide: "HOME",
      points: 2
    }, 2);

    expect(corrected).toMatchObject({
      status: "FINISHED",
      homeScore: 88,
      awayScore: 89,
      finalScore: { home: 88, away: 89 },
      winnerSide: "AWAY",
      matchFinishedAt: finishedAt
    });
  });

  it("recomputes post-final away corrections across winner, tie, and latest-score states", () => {
    const homeWinner = finish(projectionWithScore(90, 87));
    const tie = applyScoreRemovedByCorrection(homeWinner, { teamSide: "HOME", points: 3 }, 2);
    const awayWinner = applyScoreAdded(tie, scoreAdded("AWAY", 2), 3);
    const latestHomeWinner = applyScoreRemovedByCorrection(awayWinner, { teamSide: "AWAY", points: 3 }, 4);

    expect(tie).toMatchObject({ finalScore: { home: 87, away: 87 }, winnerSide: null });
    expect(awayWinner).toMatchObject({
      status: "FINISHED",
      finalScore: { home: 87, away: 89 },
      winnerSide: "AWAY",
      matchFinishedAt: finishedAt
    });
    expect(latestHomeWinner).toMatchObject({
      status: "FINISHED",
      finalScore: { home: 87, away: 86 },
      winnerSide: "HOME",
      matchFinishedAt: finishedAt
    });
  });

  it("produces the same final projection from full replay and snapshot catch-up", () => {
    const initial = projectionWithScore(88, 86);
    const fullReplay = applyScoreAdded(
      applyScoreCorrected(finish(initial, 1), { teamSide: "HOME", points: 3 }, 2),
      scoreAdded("AWAY", 2),
      3
    );

    const staleSnapshot = {
      ...finish(initial, 1),
      finalScore: { home: 999, away: 1 },
      winnerSide: "HOME" as const
    };
    const rehydrated = normalizeScoreboardProjection(staleSnapshot);
    const snapshotCatchUp = applyScoreAdded(
      applyScoreCorrected(rehydrated, { teamSide: "HOME", points: 3 }, 2),
      scoreAdded("AWAY", 2),
      3
    );

    expect(snapshotCatchUp).toEqual(fullReplay);
    expect(fullReplay).toMatchObject({
      status: "FINISHED",
      finalScore: { home: 85, away: 88 },
      winnerSide: "AWAY",
      matchFinishedAt: finishedAt
    });
  });
});
