import { describe, expect, it, vi, afterEach } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";
import { createInitialScoreboardProjection, type ScoreboardProjection } from "../../apps/api/src/matchEventStore/projection";
import type { CommandResult } from "../../packages/api-contracts/src";

const matchId = "11111111-1111-4111-8111-111111111111";
const grantCommandId = "22222222-2222-4222-8222-222222222222";

function timeoutCommand(overrides: Record<string, unknown> = {}) {
  return {
    commandId: grantCommandId,
    matchId,
    expectedSeq: 0,
    correlationId: "33333333-3333-4333-8333-333333333333",
    clientTimestamp: "2026-07-02T10:00:00.000Z",
    payload: {
      teamSide: "HOME",
      requestedBy: "HEAD_COACH",
      durationMs: 60000,
      reason: "Alpha timeout"
    },
    ...overrides
  };
}

function createTimeoutPool(options: {
  currentSeq?: number;
  projection?: ScoreboardProjection;
  duplicateResult?: CommandResult;
} = {}) {
  let currentSeq = options.currentSeq ?? 0;
  let projection = options.projection ?? {
    ...createInitialScoreboardProjection(matchId),
    status: "LIVE" as const
  };
  const events: Array<{ eventType: string; payload: unknown }> = [];

  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes("FROM command_deduplication")) {
        return [options.duplicateResult ? [{ result: JSON.stringify(options.duplicateResult) }] : [], []];
      }

      if (sql.includes("SELECT last_seq_no FROM match_streams")) {
        return [[{ last_seq_no: currentSeq }], []];
      }

      if (sql.includes("SELECT projection_data, last_event_seq FROM match_projections")) {
        return [[{ projection_data: JSON.stringify(projection), last_event_seq: currentSeq }], []];
      }

      if (sql.includes("INSERT INTO match_events")) {
        events.push({ eventType: String(params[3]), payload: JSON.parse(String(params[4])) });
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

      if (sql.includes("FROM matches m")) {
        return [[{
          match_id: matchId,
          match_status: projection.status,
          projection_data: JSON.stringify(projection),
          last_event_seq: currentSeq,
          home_team_id: null,
          home_team_name: "HOME",
          away_team_id: null,
          away_team_name: "AWAY",
          updated_at: new Date("2026-07-02T10:00:00.000Z")
        }], []];
      }

      return [{ affectedRows: 1 }, []];
    }
  };

  return {
    get projection() {
      return projection;
    },
    events,
    pool: {
      getConnection: vi.fn().mockResolvedValue(connection)
    }
  };
}

afterEach(() => {
  delete process.env.AUTH_TEST_DISABLE_CSRF;
});

describe("alpha timeout control routes", () => {
  it("allows ADMIN to grant a HOME timeout using append-only timeout event", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createTimeoutPool();
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/timeout/grant`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: timeoutCommand()
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 1,
        appendedEvents: [{ seqNo: 1, eventType: "TIMEOUT_GRANTED" }]
      });
      expect(fake.events).toHaveLength(1);
      expect(fake.events[0]).toMatchObject({ eventType: "TIMEOUT_GRANTED" });
      expect(fake.projection).toMatchObject({
        currentSeq: 1,
        timeouts: { home: { used: 1, remaining: 4 }, away: { used: 0, remaining: 5 } },
        activeTimeout: { teamSide: "HOME", requestedBy: "HEAD_COACH", durationMs: 60000 }
      });
    } finally {
      await app.close();
    }
  });

  it("rejects a stale expectedSeq without appending timeout events", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createTimeoutPool({ currentSeq: 3 });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/timeout/grant`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: timeoutCommand({ expectedSeq: 0 })
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: "SYNC_REQUIRED", currentSeq: 3 });
      expect(fake.events).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("keeps duplicate timeout command idempotent", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const duplicateResult: CommandResult = {
      status: "ACCEPTED",
      commandId: grantCommandId,
      matchId,
      currentSeq: 1,
      appendedEvents: [{ eventId: "event-id", seqNo: 1, eventType: "TIMEOUT_GRANTED" }],
      reasonCode: null,
      message: null
    };
    const fake = createTimeoutPool({ duplicateResult });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/timeout/grant`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: timeoutCommand()
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: "DUPLICATE_ACCEPTED", currentSeq: 1 });
      expect(fake.events).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("rejects a second timeout while one is active", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createTimeoutPool({
      projection: {
        ...createInitialScoreboardProjection(matchId),
        activeTimeout: {
          teamSide: "AWAY",
          startedAt: "2026-07-02T09:59:00.000Z",
          durationMs: 60000,
          remainingMs: 45000,
          requestedBy: "BENCH"
        }
      } as ScoreboardProjection
    });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/timeout/grant`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: timeoutCommand()
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: "REJECTED", reasonCode: "VALIDATION_ERROR" });
      expect(fake.events).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("ends an active timeout", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createTimeoutPool({
      projection: {
        ...createInitialScoreboardProjection(matchId),
        activeTimeout: {
          teamSide: "HOME",
          startedAt: "2026-07-02T09:59:00.000Z",
          durationMs: 60000,
          remainingMs: 45000,
          requestedBy: "HEAD_COACH"
        }
      } as ScoreboardProjection
    });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/timeout/end`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          commandId: "22222222-2222-4222-8222-222222222223",
          matchId,
          expectedSeq: 0,
          correlationId: "33333333-3333-4333-8333-333333333334",
          clientTimestamp: "2026-07-02T10:00:00.000Z",
          payload: { reason: "Resume play" }
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: "ACCEPTED",
        appendedEvents: [{ eventType: "TIMEOUT_ENDED" }]
      });
      expect(fake.projection.activeTimeout).toBeNull();
    } finally {
      await app.close();
    }
  });

  it("rejects invalid requestedBy before appending an event", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/timeout/grant`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: timeoutCommand({
          payload: {
            teamSide: "HOME",
            requestedBy: "UNKNOWN",
            durationMs: 60000,
            reason: null
          }
        })
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { reasonCode: "VALIDATION_ERROR" } });
    } finally {
      await app.close();
    }
  });

  it("requires CSRF for timeout writes", async () => {
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/timeout/grant`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: timeoutCommand()
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { reasonCode: "CSRF_REQUIRED" } });
    } finally {
      await app.close();
    }
  });
});
