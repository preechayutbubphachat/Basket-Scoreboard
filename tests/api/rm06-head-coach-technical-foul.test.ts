import { describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";
import { appendHeadCoachTechnicalFoulCommand } from "../../apps/api/src/matchEventStore/appendHeadCoachTechnicalFoulCommand";
import { createInitialScoreboardProjection } from "../../apps/api/src/matchEventStore/projection";
import { createHash } from "node:crypto";

const matchId = "11111111-1111-4111-8111-111111111111";
const user = { userId: "55555555-5555-4555-8555-555555555555", role: "ADMIN" as const, deviceId: "test-device" };

type FailurePoint = "FOUL_EVENT" | "ENTITLEMENT_EVENT" | "RESUMPTION_EVENT" | "STREAM" | "PROJECTION";

function headCoachCommand(commandId = "22222222-2222-4222-8222-222222222222") {
  return {
    commandId,
    matchId,
    expectedSeq: 4,
    correlationId: "33333333-3333-4333-8333-333333333333",
    clientTimestamp: "2026-07-29T00:00:00.000Z",
    payload: { teamSide: "HOME" as const }
  };
}

function createHeadCoachTransactionPool(options: { failure?: FailurePoint | null; serializeStreamLock?: boolean } = {}) {
  const initialProjection = {
    ...createInitialScoreboardProjection(matchId),
    status: "LIVE" as const,
    periodNumber: 2,
    gameClockRemainingMs: 314000,
    shotClockRemainingMs: 17000,
    gameClock: { remainingMs: 314000, running: false, lastStartedAt: null },
    shotClock: { remainingMs: 17000, running: false, lastStartedAt: null }
  };
  let state = { lastSeq: 4, projection: initialProjection, events: [] as Array<Record<string, unknown>>, receipts: [] as Array<Record<string, unknown>>, audits: 0 };
  let failure = options.failure ?? null;
  let streamLocked = false;
  const waiters: Array<() => void> = [];

  async function acquireStreamLock() {
    if (!options.serializeStreamLock || !streamLocked) {
      streamLocked = true;
      return;
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
    streamLocked = true;
  }

  function releaseStreamLock() {
    if (!options.serializeStreamLock) return;
    streamLocked = false;
    waiters.shift()?.();
  }

  function makeConnection() {
    let working = structuredClone(state);
    let holdsStreamLock = false;
    const maybeFail = (point: FailurePoint) => {
      if (failure === point) throw new Error(`injected ${point}`);
    };
    return {
      beginTransaction: vi.fn(async () => { working = structuredClone(state); }),
      commit: vi.fn(async () => { state = working; if (holdsStreamLock) releaseStreamLock(); holdsStreamLock = false; }),
      rollback: vi.fn(async () => { working = structuredClone(state); if (holdsStreamLock) releaseStreamLock(); holdsStreamLock = false; }),
      release: vi.fn(),
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes("FROM command_deduplication")) {
          const receipt = working.receipts.find((candidate) => candidate.command_id === params[1]);
          return [receipt ? [{ request_hash: receipt.request_hash, result: JSON.stringify(receipt.result) }] : [], []];
        }
        if (sql.includes("SELECT last_seq_no FROM match_streams")) {
          if (sql.includes("FOR UPDATE")) {
            await acquireStreamLock();
            holdsStreamLock = true;
            working = structuredClone(state);
          }
          return [[{ last_seq_no: working.lastSeq }], []];
        }
        if (sql.includes("SELECT projection_data, last_event_seq FROM match_projections")) {
          return [[{ projection_data: JSON.stringify(working.projection), last_event_seq: working.lastSeq }], []];
        }
        if (sql.includes("FROM match_head_coach_designations")) {
          return [[{ designation_id: "44444444-4444-4444-8444-444444444444", match_id: matchId, team_side: "HOME", display_name: "Coach Narin", external_reference: null, designated_at: new Date(), designated_by: user.userId }], []];
        }
        if (sql.includes("INSERT INTO match_events")) {
          const eventType = sql.includes("'FREE_THROW_ENTITLEMENT_CREATED'")
            ? "FREE_THROW_ENTITLEMENT_CREATED"
            : sql.includes("'PLAY_RESUMPTION_DECLARED'")
              ? "PLAY_RESUMPTION_DECLARED"
              : String(params[3]);
          maybeFail(eventType === "HEAD_COACH_TECHNICAL_FOUL_RECORDED" ? "FOUL_EVENT" : eventType === "FREE_THROW_ENTITLEMENT_CREATED" ? "ENTITLEMENT_EVENT" : "RESUMPTION_EVENT");
          const parameterOffset = eventType === "HEAD_COACH_TECHNICAL_FOUL_RECORDED" ? 0 : 0;
          const payloadIndex = eventType === "HEAD_COACH_TECHNICAL_FOUL_RECORDED" ? 4 : 3;
          working.events.push({ event_id: params[parameterOffset], match_id: params[1], seq_no: params[2], event_type: eventType, payload: params[payloadIndex], command_id: eventType === "HEAD_COACH_TECHNICAL_FOUL_RECORDED" ? params[9] : params[8] });
          return [{ affectedRows: 1 }, []];
        }
        if (sql.startsWith("UPDATE match_streams")) {
          maybeFail("STREAM");
          working.lastSeq = Number(params[0]);
          return [{ affectedRows: 1 }, []];
        }
        if (sql.startsWith("UPDATE match_projections")) {
          maybeFail("PROJECTION");
          working.projection = JSON.parse(String(params[0]));
          return [{ affectedRows: 1 }, []];
        }
        if (sql.includes("INSERT INTO audit_logs")) {
          working.audits += 1;
          return [{ affectedRows: 1 }, []];
        }
        if (sql.includes("INSERT INTO command_deduplication")) {
          working.receipts.push({ command_id: params[0], request_hash: params[3], result: JSON.parse(String(params[4])) });
          return [{ affectedRows: 1 }, []];
        }
        return [{ affectedRows: 1 }, []];
      }
    };
  }

  return {
    pool: { getConnection: vi.fn(async () => makeConnection()) } as never,
    get state() { return state; },
    clearFailure() { failure = null; }
  };
}

describe("RM-06 head-coach technical foul route", () => {
  it.each(["FOUL_EVENT", "ENTITLEMENT_EVENT", "RESUMPTION_EVENT", "STREAM", "PROJECTION"] as const)("rolls back every write and permits a clean retry when %s fails", async (failure) => {
    const database = createHeadCoachTransactionPool({ failure });
    const command = headCoachCommand();
    const before = structuredClone(database.state);

    await expect(appendHeadCoachTechnicalFoulCommand({ pool: database.pool, command, user })).rejects.toThrow(`injected ${failure}`);
    expect(database.state).toEqual(before);
    expect(database.state.events).toHaveLength(0);
    expect(database.state.lastSeq).toBe(4);
    expect(database.state.projection.currentSeq).toBe(0);
    expect(database.state.receipts).toHaveLength(0);

    database.clearFailure();
    await expect(appendHeadCoachTechnicalFoulCommand({ pool: database.pool, command, user })).resolves.toMatchObject({ status: "ACCEPTED", currentSeq: 7 });
    expect(database.state.events.map((event) => event.event_type)).toEqual(["HEAD_COACH_TECHNICAL_FOUL_RECORDED", "FREE_THROW_ENTITLEMENT_CREATED", "PLAY_RESUMPTION_DECLARED"]);
    expect(database.state.lastSeq).toBe(7);
    expect(database.state.projection.currentSeq).toBe(7);
    expect(database.state.receipts).toHaveLength(1);
  });

  it("serializes real same-expectedSeq contention so exactly one command commits", async () => {
    const database = createHeadCoachTransactionPool({ serializeStreamLock: true });
    const [first, second] = await Promise.all([
      appendHeadCoachTechnicalFoulCommand({ pool: database.pool, command: headCoachCommand("22222222-2222-4222-8222-222222222221"), user }),
      appendHeadCoachTechnicalFoulCommand({ pool: database.pool, command: headCoachCommand("22222222-2222-4222-8222-222222222222"), user })
    ]);

    expect([first.status, second.status].filter((status) => status === "ACCEPTED")).toHaveLength(1);
    expect([first.status, second.status].filter((status) => status === "SYNC_REQUIRED")).toHaveLength(1);
    expect(database.state.events).toHaveLength(3);
    expect(database.state.lastSeq).toBe(7);
    expect(database.state.projection.currentSeq).toBe(7);
    expect(database.state.receipts).toHaveLength(1);
  });

  it("exists as a protected route and rejects an anonymous command", async () => {
    const app = buildApiApp({
      pool: { getConnection: async () => { throw new Error("route auth should run before database access"); } } as never
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/foul/head-coach/technical`,
        payload: {
          commandId: "22222222-2222-4222-8222-222222222222",
          matchId,
          expectedSeq: 0,
          correlationId: "33333333-3333-4333-8333-333333333333",
          clientTimestamp: "2026-07-29T00:00:00.000Z",
          payload: { teamSide: "HOME" }
        }
      });

      expect(response.statusCode, response.body).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("fails closed after the second coach technical without appending another event", async () => {
    const projection = {
      ...createInitialScoreboardProjection(matchId),
      status: "LIVE" as const,
      headCoachTechnicals: [{
        designationId: "44444444-4444-4444-8444-444444444444",
        teamSide: "HOME" as const,
        displayNameSnapshot: "Head Coach",
        coachTechnicalCount: 2,
        disqualificationReviewRequired: true
      }]
    };
    const insertedEvents: unknown[] = [];
    const connection = {
      beginTransaction: vi.fn(async () => undefined),
      commit: vi.fn(async () => undefined),
      rollback: vi.fn(async () => undefined),
      release: vi.fn(),
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes("FROM command_deduplication")) return [[], []];
        if (sql.includes("SELECT last_seq_no FROM match_streams")) return [[{ last_seq_no: 0 }], []];
        if (sql.includes("SELECT projection_data, last_event_seq FROM match_projections")) {
          return [[{ projection_data: JSON.stringify(projection), last_event_seq: 0 }], []];
        }
        if (sql.includes("FROM match_head_coach_designations")) {
          return [[{
            designation_id: projection.headCoachTechnicals[0].designationId,
            match_id: matchId,
            team_side: "HOME",
            display_name: "Head Coach",
            external_reference: null,
            designated_at: new Date(),
            designated_by: "55555555-5555-4555-8555-555555555555"
          }], []];
        }
        if (sql.includes("INSERT INTO match_events")) insertedEvents.push(params);
        return [{ affectedRows: 1 }, []];
      }
    };

    const result = await appendHeadCoachTechnicalFoulCommand({
      pool: { getConnection: vi.fn().mockResolvedValue(connection) } as never,
      command: {
        commandId: "22222222-2222-4222-8222-222222222222",
        matchId,
        expectedSeq: 0,
        correlationId: "33333333-3333-4333-8333-333333333333",
        clientTimestamp: "2026-07-29T00:00:00.000Z",
        payload: { teamSide: "HOME" }
      },
      user: { userId: "55555555-5555-4555-8555-555555555555", role: "ADMIN", deviceId: "test-device" } as never
    });

    expect(result).toMatchObject({ status: "REJECTED", currentSeq: 0, appendedEvents: [] });
    expect(insertedEvents).toHaveLength(0);
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it("appends the three-event chain once, preserves deterministic resumption context, and rejects same-seq contention", async () => {
    const insertedEvents: unknown[][] = [];
    const projection = { ...createInitialScoreboardProjection(matchId), status: "LIVE" as const, periodNumber: 2, gameClockRemainingMs: 314000, shotClockRemainingMs: 17000, gameClock: { remainingMs: 314000, running: false, lastStartedAt: null }, shotClock: { remainingMs: 17000, running: false, lastStartedAt: null } };
    const connection = {
      beginTransaction: vi.fn(async () => undefined), commit: vi.fn(async () => undefined), rollback: vi.fn(async () => undefined), release: vi.fn(),
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes("FROM command_deduplication")) return [[], []];
        if (sql.includes("SELECT last_seq_no FROM match_streams")) return [[{ last_seq_no: 4 }], []];
        if (sql.includes("SELECT projection_data, last_event_seq FROM match_projections")) return [[{ projection_data: JSON.stringify(projection), last_event_seq: 4 }], []];
        if (sql.includes("FROM match_head_coach_designations")) return [[{ designation_id: "44444444-4444-4444-8444-444444444444", match_id: matchId, team_side: "HOME", display_name: "Coach Narin", external_reference: null, designated_at: new Date(), designated_by: "55555555-5555-4555-8555-555555555555" }], []];
        if (sql.includes("INSERT INTO match_events")) insertedEvents.push(params);
        return [{ affectedRows: 1 }, []];
      }
    };
    const command = { commandId: "22222222-2222-4222-8222-222222222222", matchId, expectedSeq: 4, correlationId: "33333333-3333-4333-8333-333333333333", clientTimestamp: "2026-07-29T00:00:00.000Z", payload: { teamSide: "HOME" as const } };
    const options = { pool: { getConnection: vi.fn().mockResolvedValue(connection) } as never, command, user: { userId: "55555555-5555-4555-8555-555555555555", role: "ADMIN", deviceId: "test-device" } as never };

    await expect(appendHeadCoachTechnicalFoulCommand(options)).resolves.toMatchObject({ status: "ACCEPTED", currentSeq: 7, appendedEvents: [{ seqNo: 5, eventType: "HEAD_COACH_TECHNICAL_FOUL_RECORDED" }, { seqNo: 6, eventType: "FREE_THROW_ENTITLEMENT_CREATED" }, { seqNo: 7, eventType: "PLAY_RESUMPTION_DECLARED" }] });
    expect(insertedEvents).toHaveLength(3);
    expect(JSON.parse(String(insertedEvents[0][4]))).toMatchObject({ classification: "C", headCoachDisplayNameSnapshot: "Coach Narin" });
    expect(JSON.parse(String(insertedEvents[2][3]))).toMatchObject({
      mode: "RESUME_INTERRUPTED_PLAY",
      resumptionLocation: "POINT_OF_INTERRUPTION",
      teamControlSnapshot: null,
      periodNumber: 2,
      gameClockSnapshot: "314000",
      shotClockSnapshot: "17000"
    });

    const stale = await appendHeadCoachTechnicalFoulCommand({ ...options, command: { ...command, commandId: "66666666-6666-4666-8666-666666666666", expectedSeq: 3 } });
    expect(stale).toMatchObject({ status: "SYNC_REQUIRED", currentSeq: 4, appendedEvents: [] });
    expect(insertedEvents).toHaveLength(3);
  });

  it("returns the original result for an exact retry and rejects a command-id collision", async () => {
    const command = { commandId: "22222222-2222-4222-8222-222222222222", matchId, expectedSeq: 4, correlationId: "33333333-3333-4333-8333-333333333333", clientTimestamp: "2026-07-29T00:00:00.000Z", payload: { teamSide: "HOME" as const } };
    const original = { status: "ACCEPTED", commandId: command.commandId, matchId, currentSeq: 7, appendedEvents: [], reasonCode: null, message: null };
    const connection = { beginTransaction: vi.fn(async () => undefined), rollback: vi.fn(async () => undefined), release: vi.fn(), async query() { return [[{ request_hash: createHash("sha256").update(JSON.stringify(command)).digest("hex"), result: JSON.stringify(original) }], []]; } };
    const options = { pool: { getConnection: vi.fn().mockResolvedValue(connection) } as never, command, user: { userId: "55555555-5555-4555-8555-555555555555", role: "ADMIN", deviceId: "test-device" } as never };
    await expect(appendHeadCoachTechnicalFoulCommand(options)).resolves.toMatchObject({ ...original, status: "DUPLICATE_ACCEPTED" });
    await expect(appendHeadCoachTechnicalFoulCommand({ ...options, command: { ...command, payload: { teamSide: "AWAY" } } })).resolves.toMatchObject({ status: "REJECTED", reasonCode: "VALIDATION_ERROR", appendedEvents: [] });
  });
});
