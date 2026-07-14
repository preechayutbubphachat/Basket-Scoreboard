import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  PublicScoreboardProjection,
  ScoreboardProjection
} from "@basket-scoreboard/api-contracts";
import { toPublicScoreboardProjection } from "../../apps/api/src/publicScoreboard/publicScoreboardProjection";

const publicScoreboardKeys = [
  "activeTimeout",
  "awayScore",
  "awayTeamName",
  "displayTheme",
  "finalScore",
  "gameClock",
  "gameClockRemainingMs",
  "homeScore",
  "homeTeamName",
  "matchId",
  "periodNumber",
  "periodType",
  "recentActions",
  "serverTime",
  "shotClock",
  "shotClockRemainingMs",
  "status",
  "teamFouls",
  "timeouts"
] as const;

describe("public scoreboard projection boundary", () => {
  it("defines a public contract without internal team, player, sequence, or projection fields", () => {
    expectTypeOf<PublicScoreboardProjection>().not.toHaveProperty("homeTeamId");
    expectTypeOf<PublicScoreboardProjection>().not.toHaveProperty("awayTeamId");
    expectTypeOf<PublicScoreboardProjection>().not.toHaveProperty("playerFouls");
    expectTypeOf<PublicScoreboardProjection>().not.toHaveProperty("currentSeq");
    expectTypeOf<PublicScoreboardProjection>().not.toHaveProperty("lastEventSeq");
    expectTypeOf<PublicScoreboardProjection>().not.toHaveProperty("projectionVersion");
  });

  it("maps only explicitly allowlisted fields without mutating protected projection state", () => {
    const protectedProjection = {
      matchId: "11111111-1111-4111-8111-111111111111",
      homeTeamId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      homeTeamName: "HOME",
      awayTeamId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      awayTeamName: "AWAY",
      homeScore: 12,
      awayScore: 9,
      teamFouls: { home: 2, away: 1 },
      teamFoulsByPeriod: { "2": { home: 2, away: 1 } },
      playerFouls: [{
        playerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        teamSide: "HOME",
        playerName: "Private Player",
        jerseyNumber: "7",
        fouls: 2
      }],
      timeouts: {
        home: { used: 1, remaining: 4 },
        away: { used: 0, remaining: 5 }
      },
      activeTimeout: {
        teamSide: "HOME",
        startedAt: "2026-07-10T10:00:00.000Z",
        durationMs: 60000,
        remainingMs: 42000,
        requestedBy: "HEAD_COACH"
      },
      periodType: "REGULATION",
      periodNumber: 2,
      gameClockRemainingMs: 430000,
      shotClockRemainingMs: 18000,
      gameClock: { remainingMs: 430000, running: true, lastStartedAt: "2026-07-10T09:59:00.000Z" },
      shotClock: { remainingMs: 18000, running: false, lastStartedAt: null },
      serverTime: "2026-07-10T10:00:00.000Z",
      status: "LIVE",
      finalScore: null,
      displayTheme: null,
      currentSeq: 124,
      lastEventSeq: 124,
      projectionVersion: "scoreboard-v1",
      recentActionState: {
        version: 1,
        initializedAtSeq: 120,
        items: [{
          sourceEventSeq: 124,
          kind: "SCORE",
          teamSide: "HOME",
          points: 2,
          playerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          actor: "private"
        }]
      },
      nestedDebug: { publicLabel: "must not leak" }
    } as ScoreboardProjection & {
      recentActionState: unknown;
      nestedDebug: Record<string, unknown>;
    };

    const publicProjection = toPublicScoreboardProjection(protectedProjection);

    expect(Object.keys(publicProjection).sort()).toEqual([...publicScoreboardKeys].sort());
    expect(publicProjection).toMatchObject({
      matchId: protectedProjection.matchId,
      homeTeamName: "HOME",
      awayTeamName: "AWAY",
      homeScore: 12,
      awayScore: 9,
      teamFouls: { home: 2, away: 1 },
      recentActions: [{ kind: "SCORE", teamSide: "HOME", points: 2 }],
      activeTimeout: { teamSide: "HOME", remainingMs: 42000 }
    });
    expect(publicProjection.activeTimeout).toEqual({ teamSide: "HOME", remainingMs: 42000 });
    expect(JSON.stringify(publicProjection)).not.toMatch(
      /homeTeamId|awayTeamId|playerId|playerFouls|roster|teamFoulsByPeriod|recentActionState|sourceEventSeq|initializedAtSeq|currentSeq|lastEventSeq|seqNo|eventSeq|projectionSeq|expectedSeq|projectionVersion|nestedDebug|requestedBy|durationMs|actor/i
    );
    expect(protectedProjection).toMatchObject({ currentSeq: 124, lastEventSeq: 124 });
    expect(protectedProjection.playerFouls).toHaveLength(1);
  });

  it("does not expose newly-added internal projection fields unless the mapper explicitly allows them", () => {
    const projection = {
      matchId: "11111111-1111-4111-8111-111111111111",
      homeScore: 0,
      awayScore: 0,
      teamFouls: { home: 0, away: 0, internalBreakdown: "private" },
      playerFouls: [],
      timeouts: {
        home: { used: 0, remaining: 5, privateAllocation: 5 },
        away: { used: 0, remaining: 5 }
      },
      periodNumber: 1,
      gameClockRemainingMs: 600000,
      shotClockRemainingMs: 24000,
      gameClock: {
        remainingMs: 600000,
        running: false,
        lastStartedAt: null,
        clockAudit: "private"
      },
      status: "LIVE",
      currentSeq: 1,
      projectionVersion: "scoreboard-v1",
      futureInternalProjectionField: "private"
    } as ScoreboardProjection & { futureInternalProjectionField: string };

    const publicProjection = toPublicScoreboardProjection(projection);
    expect(publicProjection.recentActions).toEqual([]);
    expect(publicProjection).not.toHaveProperty("futureInternalProjectionField");
    expect(JSON.stringify(publicProjection)).not.toMatch(/internalBreakdown|privateAllocation|clockAudit/);
  });
});
