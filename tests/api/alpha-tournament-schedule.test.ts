import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

const tournamentId = "22222222-2222-4222-8222-222222222222";
const matchId = "33333333-3333-4333-8333-333333333333";

function createTournamentSchedulePool() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const tournamentRows = [
    {
      tournament_id: tournamentId,
      name: "Alpha Cup",
      status: "ACTIVE",
      match_count: 2,
      live_match_count: 1,
      finished_match_count: 1
    }
  ];
  const scheduleRows = [
    {
      match_id: matchId,
      tournament_id: tournamentId,
      tournament_name: "Alpha Cup",
      stage_name: null,
      group_name: null,
      round_label: "Round 1",
      court_label: null,
      venue_label: "Court A",
      scheduled_at: "2026-07-03T10:00:00.000Z",
      home_team_id: "home-team",
      home_team_name: "Bangkok Home",
      away_team_id: "away-team",
      away_team_name: "Chiang Mai Away",
      match_status: "SCHEDULED",
      projection_data: JSON.stringify({
        matchId,
        status: "LIVE",
        homeScore: 18,
        awayScore: 14,
        currentSeq: 8
      }),
      last_event_seq: 8
    },
    {
      match_id: "44444444-4444-4444-8444-444444444444",
      tournament_id: tournamentId,
      tournament_name: "Alpha Cup",
      stage_name: null,
      group_name: null,
      round_label: "null",
      court_label: "null",
      venue_label: "null",
      scheduled_at: null,
      home_team_id: null,
      home_team_name: null,
      away_team_id: null,
      away_team_name: null,
      match_status: "SCHEDULED",
      projection_data: null,
      last_event_seq: null
    }
  ];

  return {
    calls,
    pool: {
      async query(sql: string, params: unknown[] = []) {
        calls.push({ sql, params });

        if (sql.includes("COUNT(*) AS tournament_exists")) {
          return [[{ tournament_exists: params[0] === tournamentId ? 1 : 0 }], []];
        }

        if (sql.includes("FROM tournaments t") && sql.includes("match_count")) {
          return [tournamentRows, []];
        }

        if (sql.includes("FROM matches m") && sql.includes("projection_data")) {
          return [params[0] === tournamentId ? scheduleRows : [], []];
        }

        return [[], []];
      }
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("alpha tournament public schedule", () => {
  it("lets ADMIN list tournaments and read projection-backed schedule rows", async () => {
    const { pool } = createTournamentSchedulePool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const tournamentsResponse = await app.inject({
        method: "GET",
        url: "/api/v1/tournaments",
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(tournamentsResponse.statusCode).toBe(200);
      expect(tournamentsResponse.json()).toMatchObject({
        ok: true,
        data: {
          tournaments: [
            {
              tournamentId,
              name: "Alpha Cup",
              status: "ACTIVE",
              matchCount: 2,
              liveMatchCount: 1,
              finishedMatchCount: 1
            }
          ]
        }
      });

      const scheduleResponse = await app.inject({
        method: "GET",
        url: `/api/v1/tournaments/${tournamentId}/schedule`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(scheduleResponse.statusCode).toBe(200);
      expect(scheduleResponse.json()).toMatchObject({
        ok: true,
        data: {
          tournament: { tournamentId, name: "Alpha Cup", status: "ACTIVE" },
          matches: [
            expect.objectContaining({
              matchId,
              tournamentId,
              venueLabel: "Court A",
              homeTeamName: "Bangkok Home",
              awayTeamName: "Chiang Mai Away",
              status: "LIVE",
              homeScore: 18,
              awayScore: 14,
              currentSeq: 8,
              publicScoreboardPath: `/public/scoreboard/${matchId}`
            }),
            expect.objectContaining({
              roundLabel: null,
              courtLabel: null,
              venueLabel: null,
              scheduledAt: null,
              homeTeamName: "HOME",
              awayTeamName: "AWAY",
              status: "SCHEDULED",
              homeScore: 0,
              awayScore: 0,
              currentSeq: 0
            })
          ]
        }
      });
    } finally {
      await app.close();
    }
  });

  it("denies protected schedule APIs to unauthenticated users and VIEWER", async () => {
    const { pool } = createTournamentSchedulePool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const unauthenticated = await app.inject({ method: "GET", url: "/api/v1/tournaments" });
      expect(unauthenticated.statusCode).toBe(401);

      const viewer = await app.inject({
        method: "GET",
        url: `/api/v1/tournaments/${tournamentId}/schedule`,
        headers: { "x-dev-user-role": "VIEWER" }
      });
      expect(viewer.statusCode).toBe(403);
      expect(viewer.json()).toMatchObject({ error: { reasonCode: "FORBIDDEN" } });
    } finally {
      await app.close();
    }
  });

  it("lets public users read public-safe tournament schedule without private metadata", async () => {
    const { pool } = createTournamentSchedulePool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/public/tournaments/${tournamentId}/schedule`
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({
        ok: true,
        data: {
          matches: expect.arrayContaining([
            expect.objectContaining({
              matchId,
              homeTeamName: "Bangkok Home",
              awayTeamName: "Chiang Mai Away",
              status: "LIVE",
              homeScore: 18,
              awayScore: 14,
              publicScoreboardPath: `/public/scoreboard/${matchId}`
            })
          ])
        }
      });
      expect(JSON.stringify(body)).not.toMatch(/actor|commandId|correlationId|session|cookie|csrf|password/i);
    } finally {
      await app.close();
    }
  });

  it("returns controlled JSON 404 for unknown tournaments", async () => {
    const { pool } = createTournamentSchedulePool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/public/tournaments/unknown-tournament/schedule"
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_FOUND" } });
    } finally {
      await app.close();
    }
  });
});
