import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

const tournamentId = "22222222-2222-4222-8222-222222222222";
const matchId = "33333333-3333-4333-8333-333333333333";

type ScheduleFixtureRow = {
  match_id: string;
  tournament_id: string;
  tournament_name: string;
  stage_name: string | null;
  group_name: string | null;
  round_label: string | null;
  court_id: string | null;
  court_label: string | null;
  venue_label: string | null;
  scheduled_at: string | null;
  home_team_id: string | null;
  home_team_name: string | null;
  away_team_id: string | null;
  away_team_name: string | null;
  match_status: string | null;
  projection_data: string | null;
  last_event_seq: number | null;
};

function createTournamentSchedulePool(
  extraRows: ScheduleFixtureRow[] = [],
  setup: {
    officials?: Array<{ match_id: string; role_code: string; display_name: string | null }>;
    rosters?: Array<{ match_id: string; team_side: "HOME" | "AWAY"; player_count: number; starter_count: number }>;
    confirmations?: Array<{ match_id: string; team_side: "HOME" | "AWAY" }>;
  } = {}
) {
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
      court_id: "55555555-5555-4555-8555-555555555555",
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
      court_id: null,
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
    },
    ...extraRows
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

        if (sql.includes("FROM match_officials")) {
          return [setup.officials ?? [], []];
        }

        if (sql.includes("FROM match_roster_players")) {
          return [setup.rosters ?? [], []];
        }

        if (sql.includes("FROM match_roster_confirmations")) {
          return [setup.confirmations ?? [], []];
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
              courtId: "55555555-5555-4555-8555-555555555555",
              venueLabel: "Court A",
              operations: expect.objectContaining({
                operatorScoreUrl: `/operator/matches/${matchId}/score`,
                officialsUrl: `/admin/matches/${matchId}/officials`,
                rostersUrl: `/admin/matches/${matchId}/rosters`,
                lineupUrl: `/admin/matches/${matchId}/lineup`
              }),
              readiness: expect.objectContaining({
                officials: {
                  state: "MISSING",
                  label: "No active officials",
                  assignedCount: 0,
                  roles: []
                },
                roster: { state: "MISSING", homeCount: 0, awayCount: 0 },
                lineup: {
                  state: "MISSING",
                  homeStarters: 0,
                  awayStarters: 0,
                  homeConfirmed: false,
                  awayConfirmed: false
                },
                lifecycle: { state: "LIVE", label: "Live" }
              }),
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
              courtId: null,
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

  it("lets ADMIN read protected live dashboard rows without appending match events or exposing private metadata", async () => {
    const { pool, calls } = createTournamentSchedulePool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/tournaments/${tournamentId}/live-dashboard`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        data: {
          tournamentId,
          tournament: {
            tournamentId,
            name: "Alpha Cup"
          },
          matches: expect.arrayContaining([
            expect.objectContaining({
              matchId,
              homeTeamName: "Bangkok Home",
              awayTeamName: "Chiang Mai Away",
              homeScore: 18,
              awayScore: 14,
              status: "LIVE",
              period: 1,
              periodType: "REGULATION",
              gameClockRemainingMs: 600000,
              gameClockRunning: false,
              currentSeq: 8,
              warnings: expect.arrayContaining([
                expect.objectContaining({ code: "CLOCK_STOPPED_LIVE" }),
                expect.objectContaining({ code: "OFFICIALS_MISSING" })
              ]),
              links: expect.objectContaining({
                score: `/operator/matches/${matchId}/score`,
                fouls: `/operator/matches/${matchId}/fouls`,
                clock: `/operator/matches/${matchId}/clock`,
                corrections: `/operator/matches/${matchId}/corrections`,
                publicScoreboard: `/public/scoreboard/${matchId}`
              })
            })
          ])
        }
      });
      expect(JSON.stringify(response.json())).not.toMatch(/actor|device|session|token|csrf|password|authorization|commandId|correlationId|causationId|correctionDetails/i);
      const sqlText = calls.map((call) => call.sql).join("\n").toLowerCase();
      expect(sqlText).not.toContain("insert into match_events");
      expect(sqlText).not.toContain(`update ${"match_events"}`);
      expect(sqlText).not.toContain(`delete from ${"match_events"}`);
    } finally {
      await app.close();
    }
  });

  it("derives role-aware officials, roster, and lineup state from existing setup rows", async () => {
    const { pool } = createTournamentSchedulePool([], {
      officials: [
        { match_id: matchId, role_code: "TIMER", display_name: "Table Timer" },
        { match_id: matchId, role_code: "SCORER", display_name: "Lead Scorer" }
      ],
      rosters: [
        { match_id: matchId, team_side: "HOME", player_count: 5, starter_count: 5 },
        { match_id: matchId, team_side: "AWAY", player_count: 5, starter_count: 5 }
      ],
      confirmations: [
        { match_id: matchId, team_side: "HOME" },
        { match_id: matchId, team_side: "AWAY" }
      ]
    });
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/tournaments/${tournamentId}/schedule`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: {
          matches: [
            expect.objectContaining({
              matchId,
              readiness: {
                officials: {
                  state: "READY",
                  label: "2 active officials: SCORER, TIMER",
                  assignedCount: 2,
                  roles: [
                    { role: "SCORER", displayName: "Lead Scorer" },
                    { role: "TIMER", displayName: "Table Timer" }
                  ]
                },
                roster: { state: "READY", homeCount: 5, awayCount: 5 },
                lineup: {
                  state: "READY",
                  homeStarters: 5,
                  awayStarters: 5,
                  homeConfirmed: true,
                  awayConfirmed: true
                },
                lifecycle: { state: "LIVE", label: "Live" }
              }
            }),
            expect.any(Object)
          ]
        }
      });
    } finally {
      await app.close();
    }
  });

  it("marks timer-only official setup as partial operational readiness", async () => {
    const { pool } = createTournamentSchedulePool([], {
      officials: [{ match_id: matchId, role_code: "TIMER", display_name: "Table Timer" }]
    });
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/tournaments/${tournamentId}/schedule`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: {
          matches: [
            expect.objectContaining({
              matchId,
              readiness: expect.objectContaining({
                officials: {
                  state: "PARTIAL",
                  label: "1 active official: TIMER. Add scorer or referee for Alpha readiness.",
                  assignedCount: 1,
                  roles: [{ role: "TIMER", displayName: "Table Timer" }]
                }
              })
            }),
            expect.any(Object)
          ]
        }
      });
    } finally {
      await app.close();
    }
  });

  it("adds warning-only conflicts for admin schedule rows with the same court and time", async () => {
    const { pool } = createTournamentSchedulePool([
      {
        match_id: "55555555-5555-4555-8555-555555555555",
        tournament_id: tournamentId,
        tournament_name: "Alpha Cup",
        stage_name: null,
        group_name: null,
        round_label: "Round 1",
        court_id: "55555555-5555-4555-8555-555555555555",
        court_label: "Court A",
        venue_label: "Main Hall",
        scheduled_at: "2026-07-03T10:00:00.000Z",
        home_team_id: "home-team-2",
        home_team_name: "Phuket Home",
        away_team_id: "away-team-2",
        away_team_name: "Khon Kaen Away",
        match_status: "SCHEDULED",
        projection_data: null,
        last_event_seq: null
      },
      {
        match_id: "66666666-6666-4666-8666-666666666666",
        tournament_id: tournamentId,
        tournament_name: "Alpha Cup",
        stage_name: null,
        group_name: null,
        round_label: "Round 1",
        court_id: null,
        court_label: "Court B",
        venue_label: "Main Hall",
        scheduled_at: "2026-07-03T11:00:00.000Z",
        home_team_id: "home-team-3",
        home_team_name: "No Conflict Home",
        away_team_id: "away-team-3",
        away_team_name: "No Conflict Away",
        match_status: "SCHEDULED",
        projection_data: null,
        last_event_seq: null
      }
    ]);
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/tournaments/${tournamentId}/schedule`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      const matches = response.json<{ data: { matches: Array<{ matchId: string; conflicts?: unknown[] }> } }>().data.matches;
      expect(matches.find((match) => match.matchId === matchId)?.conflicts).toEqual([
        expect.objectContaining({
          severity: "WARNING",
          type: "SAME_COURT_SAME_TIME",
          matchId,
          conflictingMatchId: "55555555-5555-4555-8555-555555555555",
          courtId: "55555555-5555-4555-8555-555555555555",
          scheduledAt: "2026-07-03T10:00:00.000Z"
        })
      ]);
      expect(matches.find((match) => match.matchId === "66666666-6666-4666-8666-666666666666")?.conflicts).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("adds legacy same venue and court warnings without conflicting across venues", async () => {
    const { pool } = createTournamentSchedulePool([
      {
        match_id: "77777777-7777-4777-8777-777777777777",
        tournament_id: tournamentId,
        tournament_name: "Alpha Cup",
        stage_name: null,
        group_name: null,
        round_label: "Round 1",
        court_id: null,
        court_label: "Court Legacy",
        venue_label: "Legacy Hall",
        scheduled_at: "2026-07-03T12:00:00.000Z",
        home_team_id: "home-team-4",
        home_team_name: "Legacy Home",
        away_team_id: "away-team-4",
        away_team_name: "Legacy Away",
        match_status: "SCHEDULED",
        projection_data: null,
        last_event_seq: null
      },
      {
        match_id: "88888888-8888-4888-8888-888888888888",
        tournament_id: tournamentId,
        tournament_name: "Alpha Cup",
        stage_name: null,
        group_name: null,
        round_label: "Round 1",
        court_id: null,
        court_label: "Court Legacy",
        venue_label: "Legacy Hall",
        scheduled_at: "2026-07-03T12:00:00.000Z",
        home_team_id: "home-team-5",
        home_team_name: "Legacy Conflict Home",
        away_team_id: "away-team-5",
        away_team_name: "Legacy Conflict Away",
        match_status: "SCHEDULED",
        projection_data: null,
        last_event_seq: null
      },
      {
        match_id: "99999999-9999-4999-8999-999999999999",
        tournament_id: tournamentId,
        tournament_name: "Alpha Cup",
        stage_name: null,
        group_name: null,
        round_label: "Round 1",
        court_id: null,
        court_label: "Court Legacy",
        venue_label: "Different Hall",
        scheduled_at: "2026-07-03T12:00:00.000Z",
        home_team_id: "home-team-6",
        home_team_name: "Different Venue Home",
        away_team_id: "away-team-6",
        away_team_name: "Different Venue Away",
        match_status: "SCHEDULED",
        projection_data: null,
        last_event_seq: null
      }
    ]);
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/tournaments/${tournamentId}/schedule`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      const matches = response.json<{ data: { matches: Array<{ matchId: string; conflicts?: unknown[] }> } }>().data.matches;
      expect(matches.find((match) => match.matchId === "77777777-7777-4777-8777-777777777777")?.conflicts).toEqual([
        expect.objectContaining({
          type: "LEGACY_SAME_COURT_SAME_TIME",
          conflictingMatchId: "88888888-8888-4888-8888-888888888888"
        })
      ]);
      expect(matches.find((match) => match.matchId === "99999999-9999-4999-8999-999999999999")?.conflicts).toEqual([]);
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
      const dashboardViewer = await app.inject({
        method: "GET",
        url: `/api/v1/tournaments/${tournamentId}/live-dashboard`,
        headers: { "x-dev-user-role": "VIEWER" }
      });
      expect(viewer.statusCode).toBe(403);
      expect(viewer.json()).toMatchObject({ error: { reasonCode: "FORBIDDEN" } });
      expect(dashboardViewer.statusCode).toBe(403);
      expect(dashboardViewer.json()).toMatchObject({ error: { reasonCode: "FORBIDDEN" } });
    } finally {
      await app.close();
    }
  });

  it("lets public users read public-safe tournament schedule without private metadata", async () => {
    const { pool, calls } = createTournamentSchedulePool();
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
      expect(JSON.stringify(body)).not.toContain("conflicts");
      expect(JSON.stringify(body)).not.toContain("operations");
      expect(JSON.stringify(body)).not.toContain("readiness");
      expect(JSON.stringify(body)).not.toMatch(/SCORER|REFEREE|TIMER|SHOT_CLOCK_OPERATOR|officials/i);
      const scheduleQuery = calls.find((call) => call.sql.includes("FROM matches m"));
      expect(scheduleQuery?.sql).toContain("m.status IN ('SCHEDULED', 'LIVE', 'FINAL')");
    } finally {
      await app.close();
    }
  });

  it("returns controlled JSON 404 for unknown tournaments", async () => {
    const { pool } = createTournamentSchedulePool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const protectedDashboardResponse = await app.inject({
        method: "GET",
        url: "/api/v1/tournaments/unknown-tournament/live-dashboard",
        headers: { "x-dev-user-role": "ADMIN" }
      });
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/public/tournaments/unknown-tournament/schedule"
      });

      expect(protectedDashboardResponse.statusCode).toBe(404);
      expect(protectedDashboardResponse.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_FOUND" } });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_FOUND" } });
    } finally {
      await app.close();
    }
  });
});
