import { describe, expect, it } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

const tournamentId = "22222222-2222-4222-8222-222222222222";

function createTournamentStandingsPool() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const tournamentRows = [
    {
      tournament_id: tournamentId,
      name: "Alpha Cup",
      status: "ACTIVE",
      match_count: 4,
      live_match_count: 1,
      finished_match_count: 2
    }
  ];
  const standingsRows = [
    {
      match_id: "33333333-3333-4333-8333-333333333333",
      home_team_id: "home-team",
      home_team_name: "Bangkok Home",
      away_team_id: "away-team",
      away_team_name: "Chiang Mai Away",
      match_status: "FINISHED",
      projection_data: JSON.stringify({
        status: "FINISHED",
        homeScore: 70,
        awayScore: 60
      })
    },
    {
      match_id: "44444444-4444-4444-8444-444444444444",
      home_team_id: "away-team",
      home_team_name: "Chiang Mai Away",
      away_team_id: "third-team",
      away_team_name: "Phuket Third",
      match_status: "FINAL",
      projection_data: JSON.stringify({
        status: "FINAL",
        homeScore: 55,
        awayScore: 55
      })
    },
    {
      match_id: "55555555-5555-4555-8555-555555555555",
      home_team_id: "home-team",
      home_team_name: null,
      away_team_id: "third-team",
      away_team_name: null,
      match_status: "LIVE",
      projection_data: JSON.stringify({
        status: "LIVE",
        homeScore: 20,
        awayScore: 18
      })
    },
    {
      match_id: "66666666-6666-4666-8666-666666666666",
      home_team_id: "away-team",
      home_team_name: "Chiang Mai Away",
      away_team_id: null,
      away_team_name: null,
      match_status: "SCHEDULED",
      projection_data: null
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
          return [params[0] === tournamentId ? standingsRows : [], []];
        }

        return [[], []];
      }
    }
  };
}

function createEmptyTournamentStandingsPool() {
  return {
    pool: {
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes("COUNT(*) AS tournament_exists")) {
          return [[{ tournament_exists: params[0] === tournamentId ? 1 : 0 }], []];
        }

        if (sql.includes("FROM tournaments t") && sql.includes("match_count")) {
          return [[{
            tournament_id: tournamentId,
            name: "Empty Cup",
            status: "ACTIVE",
            match_count: 0,
            live_match_count: 0,
            finished_match_count: 0
          }], []];
        }

        if (sql.includes("FROM matches m") && sql.includes("projection_data")) {
          return [[], []];
        }

        return [[], []];
      }
    }
  };
}

describe("alpha public standings foundation", () => {
  it("lets ADMIN read provisional standings derived from finished projections", async () => {
    const { pool } = createTournamentStandingsPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/tournaments/${tournamentId}/standings`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        data: {
          tournamentId,
          tournamentName: "Alpha Cup",
          status: "ACTIVE",
          isOfficial: false,
          rulesNotice: expect.stringContaining("[NEEDS SOURCE]"),
          summary: {
            teamCount: 3,
            finishedMatchCount: 2,
            excludedMatchCount: 2
          },
          rows: [
            {
              teamId: "home-team",
              teamName: "Bangkok Home",
              played: 1,
              wins: 1,
              losses: 0,
              pointsFor: 70,
              pointsAgainst: 60,
              pointDifferential: 10,
              finishedMatchesCounted: 1,
              liveMatchesExcluded: 1,
              scheduledMatchesExcluded: 0,
              tieStatus: "CLEAR"
            },
            expect.objectContaining({
              teamId: "third-team",
              played: 1,
              wins: 0,
              losses: 0,
              pointsFor: 55,
              pointsAgainst: 55,
              tieStatus: "TIE_UNRESOLVED"
            }),
            {
              teamId: "away-team",
              teamName: "Chiang Mai Away",
              played: 2,
              wins: 0,
              losses: 1,
              pointsFor: 115,
              pointsAgainst: 125,
              pointDifferential: -10,
              finishedMatchesCounted: 2,
              liveMatchesExcluded: 0,
              scheduledMatchesExcluded: 1,
              tieStatus: "TIE_UNRESOLVED"
            }
          ]
        }
      });
    } finally {
      await app.close();
    }
  });

  it("denies protected standings to unauthenticated users and VIEWER", async () => {
    const { pool } = createTournamentStandingsPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const unauthenticated = await app.inject({
        method: "GET",
        url: `/api/v1/tournaments/${tournamentId}/standings`
      });
      expect(unauthenticated.statusCode).toBe(401);

      const viewer = await app.inject({
        method: "GET",
        url: `/api/v1/tournaments/${tournamentId}/standings`,
        headers: { "x-dev-user-role": "VIEWER" }
      });
      expect(viewer.statusCode).toBe(403);
      expect(viewer.json()).toMatchObject({ error: { reasonCode: "FORBIDDEN" } });
    } finally {
      await app.close();
    }
  });

  it("lets public users read public-safe provisional standings", async () => {
    const { pool } = createTournamentStandingsPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/public/tournaments/${tournamentId}/standings`
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({
        ok: true,
        data: {
          tournamentId,
          isOfficial: false,
          rows: expect.arrayContaining([
            expect.objectContaining({
              teamName: "Bangkok Home",
              wins: 1,
              losses: 0
            })
          ])
        }
      });
      expect(JSON.stringify(body)).not.toMatch(
        /actor|commandId|correlationId|causationId|session|cookie|csrf|password|authorization|token|audit/i
      );
    } finally {
      await app.close();
    }
  });

  it("returns controlled 404 JSON for unknown public tournament standings", async () => {
    const { pool } = createTournamentStandingsPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/public/tournaments/unknown-tournament/standings"
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_FOUND" } });
    } finally {
      await app.close();
    }
  });

  it("returns safe empty standings for a tournament with no matches", async () => {
    const { pool } = createEmptyTournamentStandingsPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/public/tournaments/${tournamentId}/standings`
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        data: {
          tournamentName: "Empty Cup",
          rows: [],
          summary: {
            teamCount: 0,
            finishedMatchCount: 0,
            excludedMatchCount: 0
          }
        }
      });
    } finally {
      await app.close();
    }
  });
});
