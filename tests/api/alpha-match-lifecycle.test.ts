import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";
import {
  createInitialScoreboardProjection,
  type ScoreboardProjection
} from "../../apps/api/src/matchEventStore/projection";
import type { CommandResult } from "../../packages/api-contracts/src";

const matchId = "11111111-1111-4111-8111-111111111111";

function lifecycleCommand(
  commandId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    commandId,
    matchId,
    expectedSeq: 0,
    correlationId: "33333333-3333-4333-8333-333333333333",
    clientTimestamp: "2026-07-02T10:00:00.000Z",
    payload: { reason: "Alpha lifecycle" },
    ...overrides
  };
}

function createLifecyclePool(options: {
  currentSeq?: number;
  projection?: ScoreboardProjection;
  duplicateResult?: CommandResult;
  matchExists?: boolean;
} = {}) {
  let currentSeq = options.currentSeq ?? 0;
  let projection = options.projection ?? createInitialScoreboardProjection(matchId);
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
        return [options.matchExists === false ? [] : [{ last_seq_no: currentSeq }], []];
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

describe("alpha match lifecycle routes", () => {
  it("allows ADMIN to start a match with append-only lifecycle event", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createLifecyclePool();
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/lifecycle/start-match`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: lifecycleCommand("22222222-2222-4222-8222-222222222221")
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 1,
        appendedEvents: [{ seqNo: 1, eventType: "MATCH_STARTED" }]
      });
      expect(fake.events).toHaveLength(1);
      expect(fake.events[0]).toMatchObject({ eventType: "MATCH_STARTED" });
      expect(fake.projection).toMatchObject({
        currentSeq: 1,
        status: "LIVE",
        periodNumber: 1,
        periodType: "REGULATION",
        gameClock: { remainingMs: 600000, running: false },
        shotClock: { remainingMs: 24000, running: false },
        activeTimeout: null
      });
      expect(fake.projection.matchStartedAt).toEqual(expect.any(String));
      expect(fake.projection.currentPeriodStartedAt).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });

  it("rejects starting a match that is already live without appending", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createLifecyclePool({
      projection: { ...createInitialScoreboardProjection(matchId), status: "LIVE" } as ScoreboardProjection
    });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/lifecycle/start-match`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: lifecycleCommand("22222222-2222-4222-8222-222222222222")
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: "REJECTED", reasonCode: "VALIDATION_ERROR" });
      expect(fake.events).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("ends a live period and stops clocks", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createLifecyclePool({
      projection: {
        ...createInitialScoreboardProjection(matchId),
        status: "LIVE",
        gameClock: { remainingMs: 5000, running: true, lastStartedAt: "2026-07-02T09:59:59.000Z" },
        shotClock: { remainingMs: 8000, running: true, lastStartedAt: "2026-07-02T09:59:59.000Z" }
      } as ScoreboardProjection
    });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/lifecycle/end-period`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: lifecycleCommand("22222222-2222-4222-8222-222222222223")
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: "ACCEPTED",
        appendedEvents: [{ eventType: "PERIOD_ENDED" }]
      });
      expect(fake.projection).toMatchObject({
        status: "PERIOD_BREAK",
        gameClock: { remainingMs: 0, running: false, lastStartedAt: null },
        shotClock: { running: false, lastStartedAt: null },
        activeTimeout: null
      });
    } finally {
      await app.close();
    }
  });

  it("starts the next regulation period after a period break", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createLifecyclePool({
      projection: {
        ...createInitialScoreboardProjection(matchId),
        status: "PERIOD_BREAK",
        periodNumber: 1,
        currentPeriodEndedAt: "2026-07-02T10:00:00.000Z"
      } as ScoreboardProjection
    });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/lifecycle/start-next-period`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: lifecycleCommand("22222222-2222-4222-8222-222222222224")
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: "ACCEPTED",
        appendedEvents: [{ eventType: "PERIOD_STARTED" }]
      });
      expect(fake.projection).toMatchObject({
        status: "LIVE",
        periodNumber: 2,
        periodType: "REGULATION",
        gameClockRemainingMs: 600000,
        shotClockRemainingMs: 24000
      });
    } finally {
      await app.close();
    }
  });

  it("starts overtime only after regulation break with tied score", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createLifecyclePool({
      projection: {
        ...createInitialScoreboardProjection(matchId),
        status: "PERIOD_BREAK",
        periodNumber: 4,
        homeScore: 80,
        awayScore: 80,
        currentPeriodEndedAt: "2026-07-02T10:00:00.000Z"
      } as ScoreboardProjection
    });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/lifecycle/start-overtime`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: lifecycleCommand("22222222-2222-4222-8222-222222222225")
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: "ACCEPTED",
        appendedEvents: [{ eventType: "OVERTIME_STARTED" }]
      });
      expect(fake.projection).toMatchObject({
        status: "OVERTIME",
        periodNumber: 5,
        periodType: "OVERTIME",
        gameClockRemainingMs: 300000
      });
    } finally {
      await app.close();
    }
  });

  it("finishes a non-tied match and computes winner server-side", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createLifecyclePool({
      projection: {
        ...createInitialScoreboardProjection(matchId),
        status: "PERIOD_BREAK",
        periodNumber: 4,
        homeScore: 91,
        awayScore: 88
      } as ScoreboardProjection
    });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/lifecycle/finish-match`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: lifecycleCommand("22222222-2222-4222-8222-222222222226")
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: "ACCEPTED",
        appendedEvents: [{ eventType: "MATCH_FINISHED" }]
      });
      expect(fake.projection).toMatchObject({
        status: "FINISHED",
        winnerSide: "HOME",
        finalScore: { home: 91, away: 88 },
        gameClock: { running: false, lastStartedAt: null },
        shotClock: { running: false, lastStartedAt: null },
        activeTimeout: null
      });
    } finally {
      await app.close();
    }
  });

  it("rejects stale expectedSeq and duplicate command without extra lifecycle events", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createLifecyclePool({ currentSeq: 3 });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const stale = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/lifecycle/start-match`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: lifecycleCommand("22222222-2222-4222-8222-222222222227", { expectedSeq: 0 })
      });

      expect(stale.statusCode).toBe(200);
      expect(stale.json()).toMatchObject({ status: "SYNC_REQUIRED", currentSeq: 3 });
      expect(fake.events).toHaveLength(0);
    } finally {
      await app.close();
    }

    const duplicateResult: CommandResult = {
      status: "ACCEPTED",
      commandId: "22222222-2222-4222-8222-222222222228",
      matchId,
      currentSeq: 1,
      appendedEvents: [{ eventId: "event-id", seqNo: 1, eventType: "MATCH_STARTED" }],
      reasonCode: null,
      message: null
    };
    const duplicateFake = createLifecyclePool({ duplicateResult });
    const duplicateApp = buildApiApp({ pool: duplicateFake.pool as never });

    try {
      const duplicate = await duplicateApp.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/lifecycle/start-match`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: lifecycleCommand("22222222-2222-4222-8222-222222222228")
      });

      expect(duplicate.statusCode).toBe(200);
      expect(duplicate.json()).toMatchObject({ status: "DUPLICATE_ACCEPTED", currentSeq: 1 });
      expect(duplicateFake.events).toHaveLength(0);
    } finally {
      await duplicateApp.close();
    }
  });

  it("requires CSRF for lifecycle writes and keeps public scoreboard read-only", async () => {
    const writeApp = buildApiApp({ pool: {} as never });

    try {
      const response = await writeApp.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/lifecycle/start-match`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: lifecycleCommand("22222222-2222-4222-8222-222222222229")
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { reasonCode: "CSRF_REQUIRED" } });
    } finally {
      await writeApp.close();
    }

    const readFake = createLifecyclePool({
      projection: {
        ...createInitialScoreboardProjection(matchId),
        status: "FINISHED",
        periodType: "REGULATION",
        winnerSide: "HOME",
        finalScore: { home: 90, away: 88 }
      } as ScoreboardProjection
    });
    const readApp = buildApiApp({ pool: readFake.pool as never });

    try {
      const response = await readApp.inject({
        method: "GET",
        url: `/api/v1/public/matches/${matchId}/scoreboard`
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: "FINISHED",
        periodType: "REGULATION",
        winnerSide: "HOME",
        finalScore: { home: 90, away: 88 }
      });
    } finally {
      await readApp.close();
    }
  });
});
