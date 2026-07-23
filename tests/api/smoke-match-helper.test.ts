import { describe, expect, test, vi } from "vitest";
import { createOrReuseSmokeMatch, printSmokeMatchResult } from "../../apps/api/src/smoke/smokeMatch";

function createFakePool(options: { existingMatchId?: string; streamExists?: boolean; projectionExists?: boolean } = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const teams = new Map<string, string>();
  const state = {
    existingMatchId: options.existingMatchId,
    streamExists: options.streamExists ?? false,
    projectionExists: options.projectionExists ?? false
  };
  const connection = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes("FROM matches WHERE match_code")) {
        return [[state.existingMatchId ? { match_id: state.existingMatchId } : undefined].filter(Boolean), []];
      }
      if (sql.includes("FROM teams WHERE name")) {
        const name = String(params[0]);
        return [[teams.has(name) ? { team_id: teams.get(name) } : undefined].filter(Boolean), []];
      }
      if (sql.includes("INSERT INTO teams")) {
        teams.set(String(params[1]), String(params[0]));
        return [[], []];
      }
      if (sql.includes("FROM match_streams")) {
        return [[state.streamExists ? { match_id: params[0] } : undefined].filter(Boolean), []];
      }
      if (sql.includes("FROM match_projections")) {
        return [[state.projectionExists ? { projection_id: "projection-1" } : undefined].filter(Boolean), []];
      }
      return [[], []];
    },
    release: vi.fn()
  };

  return {
    pool: {
      getConnection: vi.fn().mockResolvedValue(connection)
    },
    calls,
    connection
  };
}

describe("production smoke match helper", () => {
  test("refuses to run unless SMOKE_TEST_ENABLED is true", async () => {
    const { pool } = createFakePool();

    await expect(createOrReuseSmokeMatch({ pool, env: { SMOKE_TEST_ENABLED: "false" } })).rejects.toThrow(
      "SMOKE_TEST_ENABLED must be true"
    );
  });

  test("creates a smoke match idempotently by reusing an existing match code", async () => {
    const { pool } = createFakePool({ existingMatchId: "match-1", streamExists: true, projectionExists: true });
    const createMatch = vi.fn();

    const result = await createOrReuseSmokeMatch({
      pool,
      env: { SMOKE_TEST_ENABLED: "true" },
      createMatch
    });

    expect(createMatch).not.toHaveBeenCalled();
    expect(result).toEqual({
      matchId: "match-1",
      created: false,
      publicScoreboardPath: "/public/scoreboard/match-1",
      operatorScorePath: "/operator/matches/match-1/score"
    });
  });

  test("does not print secrets when reporting the smoke match", () => {
    const log = vi.fn();

    printSmokeMatchResult(
      {
        matchId: "match-1",
        created: true,
        publicScoreboardPath: "/public/scoreboard/match-1",
        operatorScorePath: "/operator/matches/match-1/score"
      },
      log
    );

    const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("matchId=match-1");
    expect(output).toContain("/public/scoreboard/match-1");
    expect(output).toContain("/operator/matches/match-1/score");
    expect(output).not.toContain("DATABASE_PASSWORD");
    expect(output).not.toContain("ADMIN_PASSWORD");
    expect(output).not.toContain("SCORER_PASSWORD");
    expect(output).not.toContain("password=");
  });

  test("creates required stream and scoreboard projection state for existing smoke matches", async () => {
    const { pool, calls } = createFakePool({ existingMatchId: "match-1" });

    await createOrReuseSmokeMatch({
      pool,
      env: { SMOKE_TEST_ENABLED: "true" },
      createMatch: vi.fn()
    });

    expect(calls.some((call) => call.sql.includes("INSERT IGNORE INTO match_streams"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("INSERT IGNORE INTO match_projections"))).toBe(true);
  });

  test("creates new smoke matches with safe demo team names", async () => {
    const { pool } = createFakePool();
    const createMatch = vi.fn().mockResolvedValue({ matchId: "match-2", currentSeq: 0 });

    await createOrReuseSmokeMatch({
      pool,
      env: {
        SMOKE_TEST_ENABLED: "true",
        SMOKE_TEST_HOME_NAME: "Blue",
        SMOKE_TEST_AWAY_NAME: "White"
      },
      createMatch
    });

    expect(createMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          matchCode: "Smoke Test Match",
          homeTeamId: expect.any(String),
          awayTeamId: expect.any(String),
          venueName: "Smoke Test Match"
        })
      })
    );
  });
});
