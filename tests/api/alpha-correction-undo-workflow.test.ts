import { buildApiApp } from "../../apps/api/src/app";
import { createInitialScoreboardProjection, type ScoreboardProjection } from "../../apps/api/src/matchEventStore/projection";
import { afterEach, describe, expect, it, vi } from "vitest";

const matchId = "11111111-1111-4111-8111-111111111111";
const scoreCommandId = "22222222-2222-4222-8222-222222222222";

function correctionCommand(overrides: Record<string, unknown> = {}) {
  return {
    commandId: "33333333-3333-4333-8333-333333333333",
    matchId,
    expectedSeq: 1,
    correlationId: "44444444-4444-4444-8444-444444444444",
    clientTimestamp: "2026-07-06T10:00:00.000Z",
    correctedEventSeq: 1,
    correctionKind: "SCORE_UNDO",
    reason: "Wrong team score",
    payload: {
      correctionKind: "SCORE_UNDO",
      target: { seqNo: 1 },
      delta: null,
      newValue: null
    },
    ...overrides
  };
}

function eventRow(seqNo: number, eventType: string, payload: Record<string, unknown>, reason: string | null = null) {
  return {
    event_id: `event-${seqNo}`,
    match_id: matchId,
    seq_no: seqNo,
    event_type: eventType,
    payload: JSON.stringify(payload),
    actor_user_id: `actor-${seqNo}`,
    actor_role: "SCORER",
    device_id: "browser",
    occurred_at: new Date(`2026-07-06T09:00:0${seqNo}.000Z`),
    recorded_at: new Date(`2026-07-06T09:00:0${seqNo}.000Z`),
    command_id: seqNo === 1 ? scoreCommandId : `command-${seqNo}`,
    expected_seq: seqNo - 1,
    correlation_id: `55555555-5555-4555-8555-55555555555${seqNo}`,
    causation_id: null,
    reason,
    rule_profile_id: "FIBA_2024"
  };
}

function createCorrectionPool(options: {
  currentSeq?: number;
  projection?: ScoreboardProjection;
  matchExists?: boolean;
  events?: Array<Record<string, unknown>>;
  duplicateResult?: unknown;
} = {}) {
  let currentSeq = options.currentSeq ?? 1;
  let projection = options.projection ?? {
    ...createInitialScoreboardProjection(matchId),
    status: "LIVE" as const,
    homeScore: 2,
    currentSeq
  };
  const matchExists = options.matchExists ?? true;
  const events = options.events ?? [
    eventRow(1, "SCORE_ADDED", {
      teamSide: "HOME",
      points: 2,
      periodNumber: 1,
      gameClockRemainingMs: 580000
    })
  ];
  const appendedEvents: Array<{ eventType: string; payload: Record<string, unknown>; reason: string | null }> = [];
  const queries: string[] = [];

  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    async query(sql: string, params: unknown[] = []) {
      queries.push(sql);

      if (sql.includes("FROM command_deduplication")) {
        return [options.duplicateResult ? [{ result: JSON.stringify(options.duplicateResult) }] : [], []];
      }

      if (sql.includes("SELECT last_seq_no FROM match_streams")) {
        return [matchExists ? [{ last_seq_no: currentSeq }] : [], []];
      }

      if (sql.includes("FROM match_projections mp") || sql.includes("FROM matches m")) {
        return [
          matchExists
            ? [
                {
                  match_id: matchId,
                  match_status: projection.status,
                  projection_data: JSON.stringify(projection),
                  last_event_seq: currentSeq,
                  home_team_id: null,
                  home_team_name: "HOME",
                  away_team_id: null,
                  away_team_name: "AWAY",
                  updated_at: new Date("2026-07-06T09:00:00.000Z")
                }
              ]
            : [],
          []
        ];
      }

      if (sql.includes("SELECT projection_data, last_event_seq FROM match_projections")) {
        return [matchExists ? [{ projection_data: JSON.stringify(projection), last_event_seq: currentSeq }] : [], []];
      }

      if (sql.includes("FROM match_events WHERE match_id = ? AND seq_no = ?")) {
        const seqNo = Number(params[1]);
        return [[events.find((event) => Number(event.seq_no) === seqNo)].filter(Boolean), []];
      }

      if (sql.includes("FROM match_events")) {
        return [[...events, ...appendedEvents.map((event, index) => eventRow(currentSeq + index + 1, event.eventType, event.payload, event.reason))], []];
      }

      if (sql.includes("INSERT INTO match_events")) {
        appendedEvents.push({
          eventType: String(params[3]),
          payload: JSON.parse(String(params[4])) as Record<string, unknown>,
          reason: params[13] === null ? null : String(params[13])
        });
        return [{ affectedRows: 1 }, []];
      }

      if (sql.includes("UPDATE match_streams SET last_seq_no")) {
        currentSeq = Number(params[0]);
        return [{ affectedRows: 1 }, []];
      }

      if (sql.includes("UPDATE match_projections SET projection_data")) {
        projection = JSON.parse(String(params[0])) as ScoreboardProjection;
        return [{ affectedRows: 1 }, []];
      }

      return [{ affectedRows: 1 }, []];
    }
  };

  return {
    get projection() {
      return projection;
    },
    appendedEvents,
    queries,
    pool: {
      getConnection: vi.fn().mockResolvedValue(connection)
    }
  };
}

afterEach(() => {
  delete process.env.AUTH_TEST_DISABLE_CSRF;
});

describe("alpha correction undo workflow", () => {
  it("lets ADMIN list recent eligible correction events without mutating state", async () => {
    const fake = createCorrectionPool();
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/corrections/eligible-events`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        matchId,
        currentSeq: 1,
        events: [
          {
            seqNo: 1,
            eventType: "SCORE_ADDED",
            eligible: true,
            correctionKind: "SCORE_UNDO",
            summary: "HOME +2"
          }
        ]
      });
      expect(fake.queries.some((sql) => /^(INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i.test(sql.trim()))).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("rejects missing, null, empty and whitespace-only reasons before appending", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createCorrectionPool();
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      for (const reason of [undefined, null, "", "   "]) {
        const response = await app.inject({
          method: "POST",
          url: `/api/v1/matches/${matchId}/corrections`,
          headers: { "x-dev-user-role": "ADMIN" },
          payload: correctionCommand({ reason })
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ error: { reasonCode: "VALIDATION_ERROR" } });
      }
      expect(fake.appendedEvents).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("appends SCORE_CORRECTED and updates projection without changing the original event", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createCorrectionPool();
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/corrections`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: correctionCommand()
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        matchId,
        seqNo: 2,
        eventType: "SCORE_CORRECTED",
        projection: {
          homeScore: 0,
          awayScore: 0,
          currentSeq: 2
        }
      });
      expect(fake.appendedEvents).toHaveLength(1);
      expect(fake.appendedEvents[0]).toMatchObject({
        eventType: "SCORE_CORRECTED",
        reason: "Wrong team score",
        payload: {
          correctedEventSeq: 1,
          correctedEventType: "SCORE_ADDED",
          correctionKind: "SCORE_UNDO",
          oldValue: { teamSide: "HOME", points: 2 },
          newValue: { teamSide: "HOME", points: 0 }
        }
      });
      expect(fake.projection.homeScore).toBe(0);
      expect(fake.queries.some((sql) => /UPDATE\s+match_events|DELETE\s+FROM\s+match_events/i.test(sql))).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("rejects duplicate correction for the same target event and kind", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createCorrectionPool({
      events: [
        eventRow(1, "SCORE_ADDED", { teamSide: "HOME", points: 2, periodNumber: 1 }),
        eventRow(2, "SCORE_CORRECTED", {
          correctedEventSeq: 1,
          correctedEventType: "SCORE_ADDED",
          correctionKind: "SCORE_UNDO"
        }, "Wrong team score")
      ],
      currentSeq: 2,
      projection: {
        ...createInitialScoreboardProjection(matchId),
        status: "LIVE" as const,
        currentSeq: 2
      }
    });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/corrections`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: correctionCommand({ expectedSeq: 2 })
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: "REJECTED",
        reasonCode: "DUPLICATE_COMMAND"
      });
      expect(fake.appendedEvents).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});
