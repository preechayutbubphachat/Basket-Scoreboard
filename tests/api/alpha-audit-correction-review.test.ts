import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

const matchId = "11111111-1111-4111-8111-111111111111";

function createAuditPool(options: { matchExists?: boolean; events?: Array<Record<string, unknown>> } = {}) {
  const matchExists = options.matchExists ?? true;
  const events = options.events ?? [
    eventRow(3, "SCORE_REMOVED_BY_CORRECTION", { targetSeq: 1, reason: "wrong team" }, "wrong team"),
    eventRow(1, "SCORE_ADDED", { teamSide: "HOME", points: 2, periodNumber: 1 }),
    eventRow(2, "PLAYER_FOUL_ADDED", { teamSide: "HOME", playerId: "player-1", foulType: "PERSONAL" }),
    eventRow(4, "GAME_CLOCK_SET", { remainingMs: 512000, reason: "table correction" }, "table correction"),
    eventRow(5, "SHOT_CLOCK_RESET", { resetToMs: 14000 }),
    eventRow(6, "MATCH_FINISHED", { reason: "final buzzer" }, "final buzzer"),
    eventRow(7, "LEGACY_CUSTOM_EVENT", {})
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
                    status: "FINISHED",
                    currentSeq: 7,
                    periodNumber: 4,
                    homeScore: 2,
                    awayScore: 0,
                    teamFouls: { home: 1, away: 0 },
                    playerFouls: [],
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

function eventRow(seqNo: number, eventType: string, payload: Record<string, unknown>, reason: string | null = null) {
  return {
    event_id: `event-${seqNo}`,
    match_id: matchId,
    seq_no: seqNo,
    event_type: eventType,
    payload: JSON.stringify(payload),
    actor_user_id: seqNo === 7 ? null : `actor-${seqNo}`,
    actor_role: seqNo === 7 ? null : "SCORER",
    device_id: seqNo === 7 ? null : "browser-terminal-1",
    occurred_at: new Date(`2026-07-01T10:00:0${seqNo}.000Z`),
    recorded_at: new Date(`2026-07-01T10:00:0${seqNo}.000Z`),
    command_id: `command-${seqNo}`,
    expected_seq: seqNo - 1,
    correlation_id: `correlation-${seqNo}`,
    causation_id: seqNo === 3 ? "event-1" : null,
    reason,
    rule_profile_id: "FIBA_2024"
  };
}

afterEach(() => {
  delete process.env.AUTH_TEST_DISABLE_CSRF;
});

describe("alpha audit correction review", () => {
  it("lets ADMIN read ordered audit rows derived from match_events without mutating state", async () => {
    const { pool, queries } = createAuditPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/audit-log`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({
        matchId,
        status: "FINISHED",
        currentSeq: 7,
        summary: {
          totalRows: 7,
          eventRows: 7,
          correctionRows: 1,
          rejectedRows: 0,
          missingReasonRows: 4
        }
      });
      expect(body.rows.slice(0, 3)).toMatchObject([
        {
          seq: 1,
          source: "MATCH_EVENT",
          group: "SCORE",
          eventType: "SCORE_ADDED",
          status: "APPENDED",
          actor: { userId: "actor-1", role: "SCORER" },
          device: { label: "browser-terminal-1" },
          commandId: "command-1",
          correlationId: "correlation-1"
        },
        {
          seq: 2,
          group: "FOUL",
          eventType: "PLAYER_FOUL_ADDED"
        },
        {
          seq: 3,
          group: "CORRECTION",
          status: "CORRECTED",
          reason: "wrong team",
          causationId: "event-1"
        }
      ]);
      expect(body.rows.at(-1)).toMatchObject({
        seq: 7,
        group: "OTHER",
        actor: { userId: null, role: null },
        reason: null
      });
      expect(JSON.stringify(body)).not.toMatch(/cookie|csrf|password|authorization/i);
      expect(queries.some((sql) => /^(INSERT|UPDATE|DELETE)\b/i.test(sql.trim()))).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("filters audit rows by group and caps the requested limit", async () => {
    const { pool } = createAuditPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/audit-log?group=correction&limit=999`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().limit).toBe(500);
      expect(response.json().rows).toHaveLength(1);
      expect(response.json().rows[0]).toMatchObject({ group: "CORRECTION" });
    } finally {
      await app.close();
    }
  });

  it("returns JSON 404 for unknown match audit log", async () => {
    const { pool } = createAuditPool({ matchExists: false });
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/audit-log`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_FOUND" } });
    } finally {
      await app.close();
    }
  });

  it("denies unauthenticated users and VIEWER users", async () => {
    const { pool } = createAuditPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const anonymous = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/audit-log`
      });
      const viewer = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/audit-log`,
        headers: { "x-dev-user-role": "VIEWER" }
      });

      expect(anonymous.statusCode).toBe(401);
      expect(viewer.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});
