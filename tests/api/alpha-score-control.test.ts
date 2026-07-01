import { describe, expect, it, vi, afterEach } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

const matchId = "11111111-1111-4111-8111-111111111111";

function createProjectionFakePool(options: { found?: boolean } = {}) {
  const found = options.found ?? true;
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const connection = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });

      if (sql.includes("FROM match_projections mp")) {
        return [
          found
            ? [
                {
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
