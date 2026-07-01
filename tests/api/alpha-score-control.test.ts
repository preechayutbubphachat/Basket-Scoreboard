import { describe, expect, it, vi, afterEach } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

const matchId = "11111111-1111-4111-8111-111111111111";

function createProjectionFakePool(options: { found?: boolean } = {}) {
  const found = options.found ?? true;
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const connection = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });

      if (sql.includes("FROM match_projections mp") || sql.includes("FROM matches m")) {
        return [
          found
            ? [
                {
                  match_id: matchId,
                  match_status: "LIVE",
                  projection_data: JSON.stringify({
                    matchId,
                    homeScore: 12,
                    awayScore: 9,
                    periodNumber: 2,
                    gameClockRemainingMs: 430000,
                    shotClockRemainingMs: 18000,
                    status: "LIVE",
                    currentSeq: 7,
                    projectionVersion: "scoreboard-v1"
                  }),
                  last_event_seq: 7,
                  home_team_id: "home-team-id",
                  home_team_name: "Bangkok HOME",
                  away_team_id: "away-team-id",
                  away_team_name: "Chiang Mai AWAY",
                  updated_at: new Date("2026-07-01T10:00:00.000Z")
                }
              ]
            : [],
          []
        ];
      }

      return [[], []];
    },
    release: vi.fn()
  };

  return {
    calls,
    pool: {
      getConnection: vi.fn().mockResolvedValue(connection)
    }
  };
}

function createLegacySmokeProjectionPool(options: { projectionExists?: boolean; matchExists?: boolean } = {}) {
  const projectionExists = options.projectionExists ?? true;
  const matchExists = options.matchExists ?? true;
  const connection = {
    async query(sql: string) {
      if (sql.includes("home.team_name") || sql.includes("away.team_name")) {
        throw new Error("Unknown column 'home.team_name' in 'field list'");
      }

      if (sql.includes("FROM matches m")) {
        return [
          matchExists
            ? [
                {
                  match_id: matchId,
                  match_status: "SCHEDULED",
                  projection_data: projectionExists
                    ? JSON.stringify({
                        matchId
                      })
                    : null,
                  last_event_seq: null,
                  home_team_id: null,
                  home_team_name: null,
                  away_team_id: null,
                  away_team_name: null,
                  updated_at: null
                }
              ]
            : [],
          []
        ];
      }

      return [[], []];
    },
    release: vi.fn()
  };

  return {
    pool: {
      getConnection: vi.fn().mockResolvedValue(connection)
    }
  };
}

afterEach(() => {
  delete process.env.AUTH_TEST_DISABLE_CSRF;
});

describe("alpha score control routes", () => {
  it("returns an operator projection with team names and last event sequence", async () => {
    const { pool } = createProjectionFakePool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/projection`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        matchId,
        homeTeamName: "Bangkok HOME",
        awayTeamName: "Chiang Mai AWAY",
        homeScore: 12,
        awayScore: 9,
        periodNumber: 2,
        status: "LIVE",
        currentSeq: 7,
        lastEventSeq: 7,
        projectionVersion: "scoreboard-v1"
      });
    } finally {
      await app.close();
    }
  });

  it("keeps public scoreboard read-only while returning public-safe team names", async () => {
    const { pool } = createProjectionFakePool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${matchId}/scoreboard`
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({
        matchId,
        homeTeamName: "Bangkok HOME",
        awayTeamName: "Chiang Mai AWAY",
        homeScore: 12,
        awayScore: 9,
        lastEventSeq: 7
      });
      expect(JSON.stringify(body)).not.toContain("actor");
      expect(JSON.stringify(body)).not.toContain("device");
      expect(JSON.stringify(body)).not.toContain("audit");

      const writeResponse = await app.inject({
        method: "POST",
        url: `/api/v1/public/matches/${matchId}/scoreboard`,
        payload: { points: 2 }
      });
      expect(writeResponse.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("returns JSON 404 for unknown operator projection", async () => {
    const { pool } = createProjectionFakePool({ found: false });
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/projection`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_FOUND" } });
    } finally {
      await app.close();
    }
  });

  it("returns public fallback data for legacy smoke projections without throwing on team names", async () => {
    const { pool } = createLegacySmokeProjectionPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${matchId}/scoreboard`
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        matchId,
        homeTeamName: "HOME",
        awayTeamName: "AWAY",
        homeScore: 0,
        awayScore: 0,
        periodNumber: 1,
        status: "SCHEDULED",
        currentSeq: 0,
        lastEventSeq: 0,
        projectionVersion: "scoreboard-v1"
      });
    } finally {
      await app.close();
    }
  });

  it("returns public fallback data when match exists but projection is missing", async () => {
    const { pool } = createLegacySmokeProjectionPool({ projectionExists: false });
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${matchId}/scoreboard`
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        matchId,
        homeTeamName: "HOME",
        awayTeamName: "AWAY",
        homeScore: 0,
        awayScore: 0,
        status: "SCHEDULED",
        lastEventSeq: 0
      });
    } finally {
      await app.close();
    }
  });

  it("returns JSON 404 when the public scoreboard match does not exist", async () => {
    const { pool } = createLegacySmokeProjectionPool({ matchExists: false });
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${matchId}/scoreboard`
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_FOUND" } });
    } finally {
      await app.close();
    }
  });

  it("rejects invalid score points before appending an event", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/score/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          commandId: "22222222-2222-4222-8222-222222222222",
          matchId,
          expectedSeq: 0,
          correlationId: "33333333-3333-4333-8333-333333333333",
          clientTimestamp: "2026-07-01T10:00:00.000Z",
          payload: {
            teamSide: "HOME",
            points: 4,
            playerId: null,
            periodNumber: 1,
            gameClockRemainingMs: 600000,
            note: null
          }
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { reasonCode: "VALIDATION_ERROR" } });
    } finally {
      await app.close();
    }
  });

  it("denies unassigned scorers for score writes", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/score/add`,
        headers: {
          "x-dev-user-role": "SCORER",
          "x-dev-user-id": "00000000-0000-4000-8000-0000000000bb",
          "x-dev-match-ids": "99999999-9999-4999-8999-999999999999"
        },
        payload: {
          commandId: "22222222-2222-4222-8222-222222222222",
          matchId,
          expectedSeq: 0,
          correlationId: "33333333-3333-4333-8333-333333333333",
          clientTimestamp: "2026-07-01T10:00:00.000Z",
          payload: {
            teamSide: "HOME",
            points: 2,
            playerId: null,
            periodNumber: 1,
            gameClockRemainingMs: 600000,
            note: null
          }
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_ASSIGNED" } });
    } finally {
      await app.close();
    }
  });
});
