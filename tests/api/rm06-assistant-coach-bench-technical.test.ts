import { describe, expect, it, vi } from "vitest";
import { appendAssistantCoachBenchTechnicalFoulCommand } from "../../apps/api/src/matchEventStore/appendAssistantCoachBenchTechnicalFoulCommand";
import { createInitialScoreboardProjection } from "../../apps/api/src/matchEventStore/projection";

const matchId = "11111111-1111-4111-8111-111111111111";
const assistantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const headCoachId = "44444444-4444-4444-8444-444444444444";
const user = { userId: "55555555-5555-4555-8555-555555555555", role: "ADMIN" as const, deviceId: "test-device" };
type FailurePoint = "FOUL" | "FT" | "RESUMPTION" | "SNAPSHOT" | "RECEIPT";

function command(commandId = "22222222-2222-4222-8222-222222222222") {
  return { commandId, matchId, expectedSeq: 4, correlationId: "33333333-3333-4333-8333-333333333333", clientTimestamp: "2026-07-30T00:00:00.000Z", payload: { teamSide: "HOME" as const } };
}

function createTransactionPool(options: { failure?: FailurePoint | null; serialize?: boolean } = {}) {
  const initialProjection = { ...createInitialScoreboardProjection(matchId), status: "LIVE" as const, periodNumber: 2, gameClockRemainingMs: 314000, shotClockRemainingMs: 17000, gameClock: { remainingMs: 314000, running: false, lastStartedAt: null }, shotClock: { remainingMs: 17000, running: false, lastStartedAt: null } };
  let state = { lastSeq: 4, projection: initialProjection, events: [] as Array<Record<string, unknown>>, receipts: [] as Array<Record<string, unknown>>, audits: 0 };
  let failure = options.failure ?? null;
  let locked = false;
  const waiters: Array<() => void> = [];
  async function acquire() { if (!options.serialize || !locked) { locked = true; return; } await new Promise<void>((resolve) => waiters.push(resolve)); locked = true; }
  function releaseLock() { if (!options.serialize) return; locked = false; waiters.shift()?.(); }

  function makeConnection() {
    let working = structuredClone(state);
    let holdsLock = false;
    const fail = (point: FailurePoint) => { if (failure === point) throw new Error(`injected ${point}`); };
    return {
      beginTransaction: vi.fn(async () => { working = structuredClone(state); }),
      commit: vi.fn(async () => { state = working; if (holdsLock) releaseLock(); holdsLock = false; }),
      rollback: vi.fn(async () => { working = structuredClone(state); if (holdsLock) releaseLock(); holdsLock = false; }),
      release: vi.fn(),
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes("FROM command_deduplication")) {
          const receipt = working.receipts.find((item) => item.command_id === params[1]);
          return [receipt ? [{ request_hash: receipt.request_hash, result: JSON.stringify(receipt.result) }] : [], []];
        }
        if (sql.includes("SELECT last_seq_no FROM match_streams")) {
          if (sql.includes("FOR UPDATE")) { await acquire(); holdsLock = true; working = structuredClone(state); }
          return [[{ last_seq_no: working.lastSeq }], []];
        }
        if (sql.includes("SELECT projection_data, last_event_seq FROM match_projections")) return [[{ projection_data: JSON.stringify(working.projection), last_event_seq: working.lastSeq }], []];
        if (sql.includes("FROM match_assistant_coach_designations")) return [[{ designation_id: assistantId, match_id: matchId, team_side: "HOME", display_name: "Assistant Mira", external_reference: null, designated_at: new Date(), designated_by: user.userId }], []];
        if (sql.includes("FROM match_head_coach_designations")) return [[{ designation_id: headCoachId, match_id: matchId, team_side: "HOME", display_name: "Coach Narin", external_reference: null, designated_at: new Date(), designated_by: user.userId }], []];
        if (sql.includes("INSERT INTO match_events")) {
          const eventType = sql.includes("'FREE_THROW_ENTITLEMENT_CREATED'") ? "FREE_THROW_ENTITLEMENT_CREATED" : sql.includes("'PLAY_RESUMPTION_DECLARED'") ? "PLAY_RESUMPTION_DECLARED" : String(params[3]);
          fail(eventType === "BENCH_TECHNICAL_FOUL_RECORDED" ? "FOUL" : eventType === "FREE_THROW_ENTITLEMENT_CREATED" ? "FT" : "RESUMPTION");
          const payloadIndex = eventType === "BENCH_TECHNICAL_FOUL_RECORDED" ? 4 : 3;
          const causationIndex = eventType === "BENCH_TECHNICAL_FOUL_RECORDED" ? null : 11;
          working.events.push({ event_id: params[0], seq_no: params[2], event_type: eventType, payload: JSON.parse(String(params[payloadIndex])), causation_id: causationIndex === null ? null : params[causationIndex] });
          return [{ affectedRows: 1 }, []];
        }
        if (sql.startsWith("UPDATE match_streams")) { working.lastSeq = Number(params[0]); return [{ affectedRows: 1 }, []]; }
        if (sql.startsWith("UPDATE match_projections")) { fail("SNAPSHOT"); working.projection = JSON.parse(String(params[0])); return [{ affectedRows: 1 }, []]; }
        if (sql.includes("INSERT INTO audit_logs")) { working.audits += 1; return [{ affectedRows: 1 }, []]; }
        if (sql.includes("INSERT INTO command_deduplication")) { fail("RECEIPT"); working.receipts.push({ command_id: params[0], request_hash: params[3], result: JSON.parse(String(params[4])) }); return [{ affectedRows: 1 }, []]; }
        return [{ affectedRows: 1 }, []];
      }
    };
  }
  return { pool: { getConnection: vi.fn(async () => makeConnection()) } as never, get state() { return state; }, clearFailure() { failure = null; } };
}

describe("RM-06 assistant-coach bench technical handler proof", () => {
  it("atomically appends the exact three-event chain in order with causation and immutable snapshots", async () => {
    const database = createTransactionPool();
    const result = await appendAssistantCoachBenchTechnicalFoulCommand({ pool: database.pool, command: command(), user });
    expect(result).toMatchObject({ status: "ACCEPTED", currentSeq: 7, appendedEvents: [{ seqNo: 5, eventType: "BENCH_TECHNICAL_FOUL_RECORDED" }, { seqNo: 6, eventType: "FREE_THROW_ENTITLEMENT_CREATED" }, { seqNo: 7, eventType: "PLAY_RESUMPTION_DECLARED" }] });
    const [foul, ft, resumption] = database.state.events;
    expect(database.state.events.map((event) => event.event_type)).toEqual(["BENCH_TECHNICAL_FOUL_RECORDED", "FREE_THROW_ENTITLEMENT_CREATED", "PLAY_RESUMPTION_DECLARED"]);
    expect(foul.payload).toMatchObject({ teamSide: "HOME", assistantCoachDesignationId: assistantId, assistantCoachDisplayNameSnapshot: "Assistant Mira", chargedHeadCoachDesignationId: headCoachId, chargedHeadCoachDisplayNameSnapshot: "Coach Narin", classification: "B", periodNumber: 2, gameClockSnapshot: "314000", shotClockSnapshot: "17000", teamControlSnapshot: null, ruleProfileId: "FIBA_2024", ruleVersion: "2024.v1" });
    expect(ft).toMatchObject({ causation_id: foul.event_id, payload: { sourceFoulEventId: foul.event_id, attempts: 1, awardedTo: "AWAY" } });
    expect(resumption).toMatchObject({ causation_id: ft.event_id, payload: { sourceEntitlementEventId: ft.event_id, mode: "RESUME_INTERRUPTED_PLAY", resumptionLocation: "POINT_OF_INTERRUPTION", periodNumber: 2, gameClockSnapshot: "314000", shotClockSnapshot: "17000", teamControlSnapshot: null } });
    expect(database.state).toMatchObject({ lastSeq: 7, audits: 1 });
    expect(database.state.projection).toMatchObject({ currentSeq: 7, headCoachTechnicals: [{ designationId: headCoachId, coachTechnicalCount: 0, benchTechnicalCount: 1 }] });
    expect(database.state.receipts).toHaveLength(1);
  });

  it.each(["FOUL", "FT", "RESUMPTION", "SNAPSHOT", "RECEIPT"] as const)("rolls back with zero effects and permits a clean retry when %s fails", async (failure) => {
    const database = createTransactionPool({ failure });
    const before = structuredClone(database.state);
    await expect(appendAssistantCoachBenchTechnicalFoulCommand({ pool: database.pool, command: command(), user })).rejects.toThrow(`injected ${failure}`);
    expect(database.state).toEqual(before);
    database.clearFailure();
    await expect(appendAssistantCoachBenchTechnicalFoulCommand({ pool: database.pool, command: command(), user })).resolves.toMatchObject({ status: "ACCEPTED", currentSeq: 7 });
    expect(database.state.events.map((event) => event.seq_no)).toEqual([5, 6, 7]);
    expect(database.state.receipts).toHaveLength(1);
  });

  it("returns the exact committed result on retry and rejects a same-id payload collision without effects", async () => {
    const database = createTransactionPool();
    const original = await appendAssistantCoachBenchTechnicalFoulCommand({ pool: database.pool, command: command(), user });
    const afterOriginal = structuredClone(database.state);
    await expect(appendAssistantCoachBenchTechnicalFoulCommand({ pool: database.pool, command: command(), user })).resolves.toEqual({ ...original, status: "DUPLICATE_ACCEPTED" });
    const collision = await appendAssistantCoachBenchTechnicalFoulCommand({ pool: database.pool, command: { ...command(), payload: { teamSide: "AWAY" } }, user });
    expect(collision).toMatchObject({ status: "REJECTED", currentSeq: 7, appendedEvents: [] });
    expect(collision.message).toContain("different request");
    expect(database.state).toEqual(afterOriginal);
  });

  it("serializes two same-expectedSeq commands with one accepted, one conflict, and no sequence gap", async () => {
    const database = createTransactionPool({ serialize: true });
    const results = await Promise.all([
      appendAssistantCoachBenchTechnicalFoulCommand({ pool: database.pool, command: command("22222222-2222-4222-8222-222222222221"), user }),
      appendAssistantCoachBenchTechnicalFoulCommand({ pool: database.pool, command: command("22222222-2222-4222-8222-222222222222"), user })
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["ACCEPTED", "SYNC_REQUIRED"]);
    expect(database.state.events.map((event) => event.seq_no)).toEqual([5, 6, 7]);
    expect(database.state.lastSeq).toBe(7);
    expect(database.state.receipts).toHaveLength(1);
  });
});
