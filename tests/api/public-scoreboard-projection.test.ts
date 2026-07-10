import { describe, expect, it } from "vitest";
import type { ScoreboardProjection } from "@basket-scoreboard/api-contracts";
import { toPublicScoreboardProjection } from "../../apps/api/src/publicScoreboard/publicScoreboardProjection";

describe("public scoreboard projection boundary", () => {
  it("removes sequence aliases recursively without mutating protected projection state", () => {
    const protectedProjection = {
      matchId: "11111111-1111-4111-8111-111111111111",
      homeScore: 12,
      awayScore: 9,
      teamFouls: { home: 2, away: 1 },
      playerFouls: [],
      periodNumber: 2,
      gameClockRemainingMs: 430000,
      shotClockRemainingMs: 18000,
      status: "LIVE",
      currentSeq: 124,
      lastEventSeq: 124,
      projectionVersion: "scoreboard-v1",
      nestedDebug: {
        seq: 124,
        seq_no: 124,
        eventSequence: 124,
        rawEventSequence: 124,
        projectionSeq: 124,
        projectionSequence: 124,
        expectedSeq: 124,
        publicLabel: "Live"
      }
    } as ScoreboardProjection & { nestedDebug: Record<string, unknown> };

    const publicProjection = toPublicScoreboardProjection(protectedProjection);

    expect(publicProjection).toMatchObject({
      matchId: protectedProjection.matchId,
      homeScore: 12,
      awayScore: 9,
      nestedDebug: { publicLabel: "Live" }
    });
    expect(JSON.stringify(publicProjection)).not.toMatch(
      /"(?:seq|sequence)"|currentSeq|lastEventSeq|seqNo|seq_no|eventSeq|eventSequence|rawEventSeq|rawEventSequence|projectionSeq|projectionSequence|last_event_seq|expectedSeq/i
    );
    expect(protectedProjection).toMatchObject({ currentSeq: 124, lastEventSeq: 124 });
    expect(protectedProjection.nestedDebug).toMatchObject({ seq: 124, rawEventSequence: 124 });
  });
});
