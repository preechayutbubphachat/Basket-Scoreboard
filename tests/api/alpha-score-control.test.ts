import { describe, expect, it, vi, afterEach } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

const matchId = "11111111-1111-4111-8111-111111111111";

function createProjectionFakePool(options: { found?: boolean; shotClockRunning?: boolean } = {}) {
  const found = options.found ?? true;
  const shotClockRunning = options.shotClockRunning ?? false;
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
                    teamFouls: { home: 2, away: 1 },
                    teamFoulsByPeriod: { "2": { home: 2, away: 1 } },
                    playerFouls: [],
                    gameClock: {
                      remainingMs: 430000,
                      running: true,
                      lastStartedAt: "2026-07-01T09:59:00.000Z"
                    },
                    shotClock: {
                      remainingMs: 18000,
                      running: shotClockRunning,
                      lastStartedAt: shotClockRunning ? "2026-07-01T09:59:30.000Z" : null
                    },
                    clockUpdatedAt: "2026-07-01T10:00:00.000Z",
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

function createFinishedMatchCommandPool() {
  const events: string[] = [];
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    async query(sql: string) {
      if (sql.includes("FROM command_deduplication")) {
        return [[], []];
      }

      if (sql.includes("SELECT last_seq_no FROM match_streams")) {
        return [[{ last_seq_no: 3 }], []];
      }

      if (sql.includes("SELECT projection_data, last_event_seq FROM match_projections")) {
        return [[{
          projection_data: JSON.stringify({
            matchId,
            homeScore: 12,
            awayScore: 9,
            teamFouls: { home: 2, away: 1 },
            teamFoulsByPeriod: { "1": { home: 2, away: 1 } },
            playerFouls: [],
            periodNumber: 4,
            gameClockRemainingMs: 0,
            shotClockRemainingMs: 0,
            gameClock: { remainingMs: 0, running: false, lastStartedAt: null },
            shotClock: { remainingMs: 0, running: false, lastStartedAt: null },
            clockUpdatedAt: null,
            status: "FINISHED",
            currentSeq: 3,
            projectionVersion: "scoreboard-v1"
          }),
          last_event_seq: 3
        }], []];
      }

      if (sql.includes("INSERT INTO match_events")) {
        events.push(sql);
      }

      return [{ affectedRows: 1 }, []];
    }
  };

  return {
    events,
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
        teamFouls: { home: 2, away: 1 },
        playerFouls: [],
        gameClock: {
          remainingMs: 430000,
          running: true,
          lastStartedAt: "2026-07-01T09:59:00.000Z"
        },
        shotClock: {
          remainingMs: 18000,
          running: false,
          lastStartedAt: null
        },
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
    const { pool } = createProjectionFakePool({ shotClockRunning: true });
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
        teamFouls: { home: 2, away: 1 },
        gameClockRemainingMs: 430000,
        shotClockRemainingMs: 18000,
        shotClock: {
          remainingMs: 18000,
          running: true,
          lastStartedAt: "2026-07-01T09:59:30.000Z"
        },
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
        teamFouls: { home: 0, away: 0 },
        playerFouls: [],
        gameClock: { remainingMs: 600000, running: false, lastStartedAt: null },
        shotClock: { remainingMs: 24000, running: false, lastStartedAt: null },
        gameClockRemainingMs: 600000,
        shotClockRemainingMs: 24000,
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
        teamFouls: { home: 0, away: 0 },
        playerFouls: [],
        gameClock: { remainingMs: 600000, running: false, lastStartedAt: null },
        shotClock: { remainingMs: 24000, running: false, lastStartedAt: null },
        gameClockRemainingMs: 600000,
        shotClockRemainingMs: 24000,
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

  it("rejects invalid team foul payloads before appending an event", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/foul/team/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          commandId: "22222222-2222-4222-8222-222222222222",
          matchId,
          expectedSeq: 0,
          correlationId: "33333333-3333-4333-8333-333333333333",
          clientTimestamp: "2026-07-01T10:00:00.000Z",
          payload: {
            teamSide: "CENTER",
            foulType: "PERSONAL",
            reason: null
          }
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { reasonCode: "VALIDATION_ERROR" } });
    } finally {
      await app.close();
    }
  });

  it("denies unassigned scorers for team foul writes", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/foul/team/add`,
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
            foulType: "PERSONAL",
            reason: null
          }
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_ASSIGNED" } });
    } finally {
      await app.close();
    }
  });

  it("rejects score commands after a match is finished without appending an event", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createFinishedMatchCommandPool();
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/score/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          commandId: "22222222-2222-4222-8222-222222222231",
          matchId,
          expectedSeq: 3,
          correlationId: "33333333-3333-4333-8333-333333333333",
          clientTimestamp: "2026-07-01T10:00:00.000Z",
          payload: {
            teamSide: "HOME",
            points: 2,
            playerId: null,
            periodNumber: 4,
            gameClockRemainingMs: 0,
            note: null
          }
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: "REJECTED",
        currentSeq: 3,
        appendedEvents: [],
        reasonCode: "VALIDATION_ERROR",
        message: "Finished matches cannot be changed through live controls"
      });
      expect(fake.events).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("rejects team foul commands after a match is finished without appending an event", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createFinishedMatchCommandPool();
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/foul/team/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          commandId: "22222222-2222-4222-8222-222222222232",
          matchId,
          expectedSeq: 3,
          correlationId: "33333333-3333-4333-8333-333333333333",
          clientTimestamp: "2026-07-01T10:00:00.000Z",
          payload: {
            teamSide: "HOME",
            foulType: "PERSONAL",
            reason: null
          }
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: "REJECTED",
        currentSeq: 3,
        appendedEvents: [],
        reasonCode: "VALIDATION_ERROR",
        message: "Finished matches cannot be changed through live controls"
      });
      expect(fake.events).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("rejects player foul commands after a match is finished without appending an event", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createFinishedMatchCommandPool();
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/foul/player/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          commandId: "22222222-2222-4222-8222-222222222233",
          matchId,
          expectedSeq: 3,
          correlationId: "33333333-3333-4333-8333-333333333333",
          clientTimestamp: "2026-07-01T10:00:00.000Z",
          payload: {
            teamSide: "HOME",
            playerId: "11111111-2222-4333-8444-555555555555",
            foulType: "PERSONAL",
            reason: null
          }
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: "REJECTED",
        currentSeq: 3,
        appendedEvents: [],
        reasonCode: "VALIDATION_ERROR",
        message: "Finished matches cannot be changed through live controls"
      });
      expect(fake.events).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("rejects invalid game clock set payloads before appending an event", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/clock/game/set`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          commandId: "22222222-2222-4222-8222-222222222222",
          matchId,
          expectedSeq: 0,
          correlationId: "33333333-3333-4333-8333-333333333333",
          clientTimestamp: "2026-07-01T10:00:00.000Z",
          payload: {
            remainingMs: 700000,
            reason: null
          }
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { reasonCode: "VALIDATION_ERROR" } });
    } finally {
      await app.close();
    }
  });

  it("denies unassigned scorers for clock writes", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/clock/game/start`,
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
          payload: {}
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_ASSIGNED" } });
    } finally {
      await app.close();
    }
  });
});
