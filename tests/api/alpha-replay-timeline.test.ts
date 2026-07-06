import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

const matchId = "11111111-1111-4111-8111-111111111111";
const homePlayerId = "22222222-2222-4222-8222-222222222222";

function createReplayPool(options: { matchExists?: boolean; events?: Array<Record<string, unknown>> } = {}) {
  const matchExists = options.matchExists ?? true;
  const events = options.events ?? [
    eventRow(3, "SCORE_ADDED", {
      teamSide: "AWAY",
      points: 1,
      periodNumber: 1
    }),
    eventRow(1, "SCORE_ADDED", {
      teamSide: "HOME",
      points: 2,
      playerId: homePlayerId,
      playerNameSnapshot: "Narin Guard",
      jerseyNumberSnapshot: "7",
      periodNumber: 1
    }),
    eventRow(2, "PLAYER_FOUL_ADDED", {
      teamSide: "HOME",
      playerId: homePlayerId,
      playerName: "Narin Guard",
      jerseyNumber: "7",
      foulType: "PERSONAL",
      periodNumber: 1
    }),
    eventRow(4, "TIMEOUT_GRANTED", {
      teamSide: "HOME",
      requestedBy: "HEAD_COACH",
      durationMs: 60000,
      periodNumber: 1
    }),
    eventRow(5, "GAME_CLOCK_STOPPED", {
      periodNumber: 1,
      gameClockRemainingMs: 512000
    }),
    eventRow(6, "MATCH_FINISHED", {
      periodNumber: 4,
      periodType: "REGULATION"
    }),
    eventRow(7, "SCORE_CORRECTED", {
      correctedEventSeq: 1,
      correctedEventType: "SCORE_ADDED",
      correctionKind: "SCORE_UNDO",
      reason: "wrong team",
      oldValue: { teamSide: "HOME", points: 2 },
      newValue: { teamSide: "HOME", points: 0 },
      delta: { teamSide: "HOME", points: -2 }
    }),
    eventRow(8, "LEGACY_CUSTOM_EVENT", {})
  ];

  const queries: string[] = [];
  const connection = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes("FROM matches m")) {
        return [
          matchExists
            ? [
                {
                  match_id: matchId,
                  match_status: "FINISHED",
                  projection_data: JSON.stringify({
                    matchId,
                    homeScore: 2,
                    awayScore: 1,
                    teamFouls: { home: 1, away: 0 },
                    timeouts: { home: { used: 1, remaining: 4 }, away: { used: 0, remaining: 5 } },
                    playerFouls: [],
                    periodType: "REGULATION",
                    periodNumber: 4,
                    gameClockRemainingMs: 0,
                    shotClockRemainingMs: 0,
                    gameClock: { remainingMs: 0, running: false, lastStartedAt: null },
                    shotClock: { remainingMs: 0, running: false, lastStartedAt: null },
                    status: "FINISHED",
                    currentSeq: 8,
                    projectionVersion: "scoreboard-v1"
                  }),
                  last_event_seq: 8,
                  home_team_id: "home-team",
                  home_team_name: "Bangkok HOME",
                  away_team_id: "away-team",
                  away_team_name: "Chiang Mai AWAY",
                   updated_at: new Date("2026-07-01T10:00:08.000Z")
                }
              ]
            : [],
          []
        ];
      }

      if (sql.includes("FROM match_events")) {
        return [[...events].sort((left, right) => Number(left.seq_no) - Number(right.seq_no)), []];
      }

      return [[], []];
    },
    release: vi.fn()
  };

  return {
    queries,
    pool: {
      getConnection: vi.fn().mockResolvedValue(connection)
    }
  };
}

function eventRow(seqNo: number, eventType: string, payload: Record<string, unknown>) {
  return {
    event_id: `event-${seqNo}`,
    match_id: matchId,
    seq_no: seqNo,
    event_type: eventType,
    payload: JSON.stringify(payload),
    actor_user_id: `actor-${seqNo}`,
    actor_role: "SCORER",
    device_id: "browser",
    occurred_at: new Date(`2026-07-01T10:00:0${seqNo}.000Z`),
    recorded_at: new Date(`2026-07-01T10:00:0${seqNo}.000Z`),
    command_id: `command-${seqNo}`,
    expected_seq: seqNo - 1,
    correlation_id: `correlation-${seqNo}`,
    causation_id: null,
    reason: null,
    rule_profile_id: "FIBA_2024"
  };
}

afterEach(() => {
  delete process.env.AUTH_TEST_DISABLE_CSRF;
});

describe("alpha replay timeline", () => {
  it("lets ADMIN read an ordered replay timeline derived from match_events", async () => {
    const { pool, queries } = createReplayPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/replay`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({
        matchId,
        status: "FINISHED",
        currentSeq: 8,
        homeTeamName: "Bangkok HOME",
        awayTeamName: "Chiang Mai AWAY"
      });
      expect(body.items.slice(0, 3)).toMatchObject([
        {
          seq: 1,
          eventType: "SCORE_ADDED",
          eventGroup: "SCORE",
          teamSide: "HOME",
          periodNumber: 1,
          title: "HOME +2",
          player: {
            playerId: homePlayerId,
            displayName: "Narin Guard",
            jerseyNumber: "7"
          },
          scoreAfter: { home: 2, away: 0 },
          actor: { userId: "actor-1", role: "SCORER" }
        },
        {
          seq: 2,
          eventType: "PLAYER_FOUL_ADDED",
          eventGroup: "FOUL",
          title: "HOME player foul",
          player: { displayName: "Narin Guard" },
          scoreAfter: null
        },
        {
          seq: 3,
          eventType: "SCORE_ADDED",
          eventGroup: "SCORE",
          scoreAfter: { home: 2, away: 1 }
        }
      ]);
      expect(body.items.at(-1)).toMatchObject({
        eventType: "LEGACY_CUSTOM_EVENT",
        eventGroup: "OTHER",
        title: "LEGACY_CUSTOM_EVENT"
      });
      expect(body.items.find((item: { eventType: string }) => item.eventType === "SCORE_CORRECTED")).toMatchObject({
        seq: 7,
        eventGroup: "CORRECTION",
        correctionDetails: {
          correctedEventSeq: 1,
          correctedEventType: "SCORE_ADDED",
          correctionKind: "SCORE_UNDO",
          reason: "wrong team",
          oldValue: { teamSide: "HOME", points: 2 },
          newValue: { teamSide: "HOME", points: 0 },
          delta: { teamSide: "HOME", points: -2 }
        }
      });
      expect(body.generatedAt).toEqual(expect.any(String));
      expect(queries.some((sql) => /^(INSERT|UPDATE|DELETE)\b/i.test(sql.trim()))).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("filters replay items by event group and caps the requested limit", async () => {
    const { pool } = createReplayPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/replay?group=score&limit=999`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().limit).toBe(500);
      expect(response.json().items).toHaveLength(2);
      expect(response.json().items.every((item: { eventGroup: string }) => item.eventGroup === "SCORE")).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("returns JSON 404 for unknown match replay", async () => {
    const { pool } = createReplayPool({ matchExists: false });
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/replay`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_FOUND" } });
    } finally {
      await app.close();
    }
  });

  it("requires authentication for protected replay timeline", async () => {
    const { pool } = createReplayPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/replay`
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
