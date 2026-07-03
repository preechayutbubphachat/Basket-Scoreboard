import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

const matchId = "11111111-1111-4111-8111-111111111111";
const homePlayerId = "22222222-2222-4222-8222-222222222222";
const awayPlayerId = "33333333-3333-4333-8333-333333333333";

function createSummaryPool(options: { matchExists?: boolean; includeRoster?: boolean } = {}) {
  const matchExists = options.matchExists ?? true;
  const includeRoster = options.includeRoster ?? true;
  const events = [
    {
      event_id: "event-score-home",
      match_id: matchId,
      seq_no: 1,
      event_type: "SCORE_ADDED",
      payload: JSON.stringify({
        teamSide: "HOME",
        points: 2,
        playerId: homePlayerId,
        playerNameSnapshot: "Narin Guard",
        jerseyNumberSnapshot: "7"
      }),
      occurred_at: new Date("2026-07-01T10:00:01.000Z"),
      recorded_at: new Date("2026-07-01T10:00:01.000Z")
    },
    {
      event_id: "event-score-team",
      match_id: matchId,
      seq_no: 2,
      event_type: "SCORE_ADDED",
      payload: JSON.stringify({ teamSide: "HOME", points: 3, playerId: null }),
      occurred_at: new Date("2026-07-01T10:00:02.000Z"),
      recorded_at: new Date("2026-07-01T10:00:02.000Z")
    },
    {
      event_id: "event-score-away-old",
      match_id: matchId,
      seq_no: 3,
      event_type: "SCORE_ADDED",
      payload: JSON.stringify({ teamSide: "AWAY", points: 1, playerId: awayPlayerId }),
      occurred_at: new Date("2026-07-01T10:00:03.000Z"),
      recorded_at: new Date("2026-07-01T10:00:03.000Z")
    },
    {
      event_id: "event-player-foul",
      match_id: matchId,
      seq_no: 4,
      event_type: "PLAYER_FOUL_ADDED",
      payload: JSON.stringify({
        teamSide: "HOME",
        playerId: homePlayerId,
        playerName: "Narin Guard",
        jerseyNumber: "7"
      }),
      occurred_at: new Date("2026-07-01T10:00:04.000Z"),
      recorded_at: new Date("2026-07-01T10:00:04.000Z")
    },
    {
      event_id: "event-team-foul",
      match_id: matchId,
      seq_no: 5,
      event_type: "TEAM_FOUL_ADDED",
      payload: JSON.stringify({ teamSide: "AWAY" }),
      occurred_at: new Date("2026-07-01T10:00:05.000Z"),
      recorded_at: new Date("2026-07-01T10:00:05.000Z")
    },
    {
      event_id: "event-timeout",
      match_id: matchId,
      seq_no: 6,
      event_type: "TIMEOUT_GRANTED",
      payload: JSON.stringify({ teamSide: "HOME" }),
      occurred_at: new Date("2026-07-01T10:00:06.000Z"),
      recorded_at: new Date("2026-07-01T10:00:06.000Z")
    },
    {
      event_id: "event-finished",
      match_id: matchId,
      seq_no: 7,
      event_type: "MATCH_FINISHED",
      payload: JSON.stringify({}),
      occurred_at: new Date("2026-07-01T10:00:07.000Z"),
      recorded_at: new Date("2026-07-01T10:00:07.000Z")
    }
  ];
  const roster = includeRoster
    ? [
        {
          roster_player_id: "roster-home",
          match_id: matchId,
          team_side: "HOME",
          team_id: "home-team",
          player_id: homePlayerId,
          display_name_snapshot: "Narin Guard",
          jersey_number_snapshot: "7",
          position: "GUARD",
          roster_status: "ACTIVE",
          is_starter: 1,
          is_captain: 1
        },
        {
          roster_player_id: "roster-away",
          match_id: matchId,
          team_side: "AWAY",
          team_id: "away-team",
          player_id: awayPlayerId,
          display_name_snapshot: "Away Forward",
          jersey_number_snapshot: "12",
          position: "FORWARD",
          roster_status: "BENCH",
          is_starter: 0,
          is_captain: 0
        }
      ]
    : [];

  const connection = {
    async query(sql: string) {
      if (sql.includes("FROM matches m")) {
        return [
          matchExists
            ? [
                {
                  match_id: matchId,
                  match_status: "FINISHED",
                  projection_data: JSON.stringify({
                    matchId,
                    homeScore: 5,
                    awayScore: 1,
                    teamFouls: { home: 1, away: 1 },
                    playerFouls: [],
                    timeouts: { home: { used: 1, remaining: 4 }, away: { used: 0, remaining: 5 } },
                    periodType: "REGULATION",
                    periodNumber: 4,
                    gameClockRemainingMs: 0,
                    shotClockRemainingMs: 0,
                    gameClock: { remainingMs: 0, running: false, lastStartedAt: null },
                    shotClock: { remainingMs: 0, running: false, lastStartedAt: null },
                    status: "FINISHED",
                    currentSeq: 7,
                    projectionVersion: "scoreboard-v1"
                  }),
                  last_event_seq: 7,
                  home_team_id: "home-team",
                  home_team_name: "Bangkok HOME",
                  away_team_id: "away-team",
                  away_team_name: "Chiang Mai AWAY",
                  updated_at: new Date("2026-07-01T10:00:07.000Z")
                }
              ]
            : [],
          []
        ];
      }

      if (sql.includes("FROM match_roster_players")) {
        return [roster, []];
      }

      if (sql.includes("FROM match_events")) {
        return [events, []];
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

describe("alpha match summary", () => {
  it("lets ADMIN read a box score summary derived from projection, roster, and events", async () => {
    const { pool } = createSummaryPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/summary`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        matchId,
        status: "FINISHED",
        periodNumber: 4,
        periodType: "REGULATION",
        currentSeq: 7,
        home: {
          teamName: "Bangkok HOME",
          score: 5,
          teamFouls: 1,
          timeoutsUsed: 1,
          timeoutsRemaining: 4,
          unattributedPoints: 3,
          players: [
            {
              playerId: homePlayerId,
              jerseyNumber: "7",
              displayName: "Narin Guard",
              isStarter: true,
              isCaptain: true,
              points: 2,
              personalFouls: 1
            }
          ]
        },
        away: {
          teamName: "Chiang Mai AWAY",
          score: 1,
          teamFouls: 1,
          timeoutsUsed: 0,
          timeoutsRemaining: 5,
          unattributedPoints: 0,
          players: [
            {
              playerId: awayPlayerId,
              displayName: "Away Forward",
              jerseyNumber: "12",
              points: 1,
              personalFouls: 0
            }
          ]
        },
        events: {
          total: 7,
          scoreEvents: 3,
          foulEvents: 2,
          timeoutEvents: 1,
          lifecycleEvents: 1,
          correctionEvents: 0
        }
      });
      expect(response.json().generatedAt).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });

  it("handles matches with no roster and team-only score safely", async () => {
    const { pool } = createSummaryPool({ includeRoster: false });
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/summary`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        home: {
          unattributedPoints: 3,
          players: [
            {
              playerId: homePlayerId,
              displayName: "Narin Guard",
              points: 2,
              personalFouls: 1
            }
          ]
        },
        away: {
          players: [
            {
              playerId: awayPlayerId,
              displayName: "Unknown player",
              points: 1
            }
          ]
        }
      });
    } finally {
      await app.close();
    }
  });

  it("returns JSON 404 for unknown match summary", async () => {
    const { pool } = createSummaryPool({ matchExists: false });
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/summary`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_FOUND" } });
    } finally {
      await app.close();
    }
  });

  it("requires authentication for protected match summary", async () => {
    const { pool } = createSummaryPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/summary`
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
