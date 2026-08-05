import { describe, expect, it, vi, afterEach } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

function createAlphaFakePool() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const connection = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });

      if (sql.includes("FROM matches WHERE match_code")) {
        return [[{ match_id: "smoke-match-1" }], []];
      }

      if (sql.includes("INSERT IGNORE INTO match_streams") || sql.includes("INSERT IGNORE INTO match_projections")) {
        return [[], []];
      }

      return [[], []];
    },
    release: vi.fn()
  };

  return {
    calls,
    pool: {
      async query(sql: string, params: unknown[] = []) {
        calls.push({ sql, params });
        return [
          [
            {
              match_id: "match-1",
              match_code: "Alpha-1",
              home_team_id: "home-1",
              home_team_name: "Home",
              away_team_id: "away-1",
              away_team_name: "Away",
              status: "SCHEDULED",
              scheduled_at: "2026-07-01T10:00:00.000Z",
              venue_name: "Court A",
              current_seq: 0,
              home_score: 0,
              away_score: 0,
              assigned_role_codes: params.length ? "SCORER" : null
            }
          ],
          []
        ];
      },
      getConnection: vi.fn().mockResolvedValue(connection)
    }
  };
}

afterEach(() => {
  delete process.env.AUTH_TEST_DISABLE_CSRF;
  delete process.env.SMOKE_TEST_ENABLED;
});

describe("alpha match operations routes", () => {
  it("requires authentication for GET /api/v1/matches", async () => {
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({ method: "GET", url: "/api/v1/matches" });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { reasonCode: "UNAUTHENTICATED" } });
    } finally {
      await app.close();
    }
  });

  it("lists all matches for ADMIN with score projection fields", async () => {
    const { pool } = createAlphaFakePool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/matches",
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        data: {
          matches: [
            expect.objectContaining({
              matchId: "match-1",
              homeTeamName: "Home",
              awayTeamName: "Away",
              status: "SCHEDULED",
              venueName: "Court A",
              currentSeq: 0,
              homeScore: 0,
              awayScore: 0
            })
          ]
        }
      });
    } finally {
      await app.close();
    }
  });

  it("lists only assigned matches for SCORER and denies VIEWER", async () => {
    const { pool } = createAlphaFakePool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const scorerResponse = await app.inject({
        method: "GET",
        url: "/api/v1/matches",
        headers: { "x-dev-user-role": "SCORER", "x-dev-user-id": "scorer-1" }
      });

      expect(scorerResponse.statusCode).toBe(200);
      expect(scorerResponse.json()).toMatchObject({
        data: {
          matches: [expect.objectContaining({ matchId: "match-1", assignedRoleCodes: ["SCORER"] })]
        }
      });

      const viewerResponse = await app.inject({
        method: "GET",
        url: "/api/v1/matches",
        headers: { "x-dev-user-role": "VIEWER" }
      });

      expect(viewerResponse.statusCode).toBe(403);
      expect(viewerResponse.json()).toMatchObject({ error: { reasonCode: "FORBIDDEN" } });
    } finally {
      await app.close();
    }
  });

  it("protects smoke match creation with ADMIN, CSRF, and SMOKE_TEST_ENABLED", async () => {
    const { pool, calls } = createAlphaFakePool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const noCsrfResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches/smoke",
        headers: { "x-dev-user-role": "ADMIN" }
      });
      expect(noCsrfResponse.statusCode).toBe(403);
      expect(noCsrfResponse.json()).toMatchObject({ error: { reasonCode: "CSRF_REQUIRED" } });

      process.env.AUTH_TEST_DISABLE_CSRF = "true";
      const viewerResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches/smoke",
        headers: { "x-dev-user-role": "VIEWER" }
      });
      expect(viewerResponse.statusCode).toBe(403);

      const disabledResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches/smoke",
        headers: { "x-dev-user-role": "ADMIN" }
      });
      expect(disabledResponse.statusCode).toBe(403);
      expect(disabledResponse.json()).toMatchObject({ error: { reasonCode: "FORBIDDEN" } });

      process.env.SMOKE_TEST_ENABLED = "true";
      const createdResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches/smoke",
        headers: { "x-dev-user-role": "ADMIN" }
      });
      expect(createdResponse.statusCode).toBe(200);
      expect(createdResponse.json()).toMatchObject({
        ok: true,
        data: {
          matchId: "smoke-match-1",
          created: false,
          publicScoreboardPath: "/public/scoreboard/smoke-match-1",
          operatorScorePath: "/operator/matches/smoke-match-1/score"
        }
      });
      expect(calls.filter((call) => call.sql.includes("FROM matches WHERE match_code"))).toHaveLength(1);
      expect(calls.some((call) => call.sql.includes("INSERT IGNORE INTO match_streams"))).toBe(true);
      expect(calls.some((call) => call.sql.includes("INSERT IGNORE INTO match_projections"))).toBe(true);
    } finally {
      await app.close();
    }
  });
});
