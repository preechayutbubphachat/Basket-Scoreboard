import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  timeoutOpportunityFactCommandSchema,
  timeoutOpportunityCorrectionCommandSchema
} from "@basket-scoreboard/api-contracts";
import {
  applyTimeoutOpportunityFact,
  applyTimeoutOpportunityCorrection,
  applyMatchStarted,
  applyGameClockStarted,
  applyScoreAdded,
  applyScoreRemovedByCorrection,
  createInitialScoreboardProjection,
  deriveScoreTimeoutOpportunity
} from "../../apps/api/src/matchEventStore/projection.js";
import { appendTimeoutOpportunityFactCommand, type TimeoutOpportunityFailureSeam } from "../../apps/api/src/matchEventStore/appendTimeoutOpportunityFactCommand.js";
import { appendTimeoutOpportunityCorrectionCommand } from "../../apps/api/src/matchEventStore/appendTimeoutOpportunityCorrectionCommand.js";
import { rebuildTimeoutOpportunityProjection } from "../../apps/api/src/matchEventStore/replayService.js";
import { toPublicScoreboardProjection } from "../../apps/api/src/publicScoreboard/publicScoreboardProjection.js";
import { buildApiApp } from "../../apps/api/src/app.js";

const envelope = {
  commandId: "10000000-0000-4000-8000-000000000001",
  matchId: "20000000-0000-4000-8000-000000000001",
  expectedSeq: 4,
  correlationId: "30000000-0000-4000-8000-000000000001",
  clientTimestamp: "2026-07-30T00:00:00.000Z"
};

const user = { userId: "40000000-0000-4000-8000-000000000001", role: "ADMIN" as const, deviceId: "test-device" };

function createTransactionalPool() {
  type State = { head: number; projection: ReturnType<typeof createInitialScoreboardProjection>; events: Array<Record<string, any>>; receipts: Array<Record<string, any>>; audits: Array<Record<string, any>> };
  const initial = createInitialScoreboardProjection(envelope.matchId);
  const playing = applyTimeoutOpportunityFact({ ...initial, status: "LIVE" }, { factType: "PLAYING_TIME_STARTED", sourceEventId: "start", sourceSeq: 0, occurredAt: envelope.clientTimestamp }, 0);
  let committed: State = { head: 0, projection: { ...playing, status: "LIVE", gameClock: { remainingMs: 600000, running: false, lastStartedAt: null } }, events: [], receipts: [], audits: [] };
  let working: State | null = null;
  const connection = {
    async beginTransaction() { working = structuredClone(committed); },
    async commit() { committed = working!; working = null; },
    async rollback() { working = null; },
    release() {},
    async query(sql: string, params: any[] = []) {
      const state = working ?? committed;
      if (sql.includes("SELECT request_hash, result FROM command_deduplication")) {
        const receipt = state.receipts.find((item) => item.matchId === params[0] && item.commandId === params[1]);
        return [receipt ? [{ request_hash: receipt.requestHash, result: JSON.stringify(receipt.result) }] : [], []];
      }
      if (sql.includes("SELECT last_seq_no FROM match_streams")) return [[{ last_seq_no: state.head }], []];
      if (sql.includes("SELECT projection_data, last_event_seq FROM match_projections")) return [[{ projection_data: JSON.stringify(state.projection), last_event_seq: state.head }], []];
      if (sql.includes("WHERE match_id = ? AND event_id = ? AND seq_no = ?")) {
        const event = state.events.find((item) => item.match_id === params[0] && item.event_id === params[1] && item.seq_no === params[2]);
        return [event ? [event] : [], []];
      }
      if (sql.includes("event_type = 'TIMEOUT_OPPORTUNITY_CORRECTED'") && sql.includes("JSON_EXTRACT")) return [state.events.filter((item) => item.event_type === "TIMEOUT_OPPORTUNITY_CORRECTED" && JSON.parse(item.payload).targetEventId === params[1]), []];
      if (sql.includes("INSERT INTO match_events")) {
        const correction = sql.includes("TIMEOUT_OPPORTUNITY_CORRECTED");
        state.events.push({ event_id: params[0], match_id: params[1], seq_no: params[2], event_type: correction ? "TIMEOUT_OPPORTUNITY_CORRECTED" : "TIMEOUT_OPPORTUNITY_FACT_RECORDED", payload: params[3] });
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes("UPDATE match_streams")) { state.head = params[0]; return [{ affectedRows: 1 }, []]; }
      if (sql.includes("UPDATE match_projections")) { state.projection = JSON.parse(params[0]); return [{ affectedRows: 1 }, []]; }
      if (sql.includes("INSERT INTO command_deduplication")) { state.receipts.push({ commandId: params[0], matchId: params[1], requestHash: params[3], result: JSON.parse(params[4]) }); return [{ affectedRows: 1 }, []]; }
      if (sql.includes("INSERT INTO audit_logs")) { state.audits.push({ sql, params }); return [{ affectedRows: 1 }, []]; }
      return [{ affectedRows: 1 }, []];
    }
  };
  return { pool: { getConnection: async () => connection } as never, state: () => structuredClone(committed) };
}

describe("Task015 canonical timeout opportunity", () => {
  it("passes the persisted replacement score event identity into the live projector", () => {
    const source = readFileSync(new URL("../../apps/api/src/matchEventStore/correctionCommands.ts", import.meta.url), "utf8");
    expect(source).toMatch(/applyScoreAdded\(\s*projection,\s*options\.command\.payload\.replacement,\s*replacementEvent\.seqNo,\s*replacementEvent\.eventId\s*\)/);
  });
  it("AC-015-001 accepts only precise operator facts and rejects authoritative conclusions", () => {
    expect(timeoutOpportunityFactCommandSchema.safeParse({ ...envelope, payload: { factType: "TABLE_COMMUNICATION_COMPLETED" } }).success).toBe(true);
    for (const forbidden of ["eventSeq", "periodNumber", "gameClockRemainingMs", "scoringTeam", "eligibleTeams", "status", "legal"]) {
      expect(timeoutOpportunityFactCommandSchema.safeParse({ ...envelope, payload: { factType: "TABLE_COMMUNICATION_COMPLETED", [forbidden]: forbidden === "legal" ? true : 1 } }).success).toBe(false);
    }
  });

  it("AC-015-003/004/008 derives canonical goal and final-free-throw effects", () => {
    const initial = { ...createInitialScoreboardProjection(envelope.matchId), status: "LIVE" as const, periodNumber: 4, gameClockRemainingMs: 90_000 };
    const base = applyTimeoutOpportunityFact(initial, { factType: "PLAYING_TIME_STARTED", sourceEventId: "period-start", sourceSeq: 1, occurredAt: "2026-07-30T00:00:00.000Z" }, 1);
    expect(deriveScoreTimeoutOpportunity(base, { teamSide: "HOME", points: 2 }, "goal", 5).eligibleTeams).toEqual(["AWAY"]);
    const finalFtReady = applyTimeoutOpportunityFact(base, { factType: "FINAL_FREE_THROW_DISPOSAL", sourceEventId: "final-ft-disposal", sourceSeq: 4, occurredAt: "2026-07-30T00:00:00.000Z" }, 4);
    expect(deriveScoreTimeoutOpportunity(finalFtReady, { teamSide: "HOME", points: 1 }, "ft", 5).eligibleTeams).toEqual(["HOME", "AWAY"]);
    expect(deriveScoreTimeoutOpportunity({ ...base, gameClockRemainingMs: 130_000 }, { teamSide: "HOME", points: 2 }, "goal", 5).eligibleTeams).toEqual(["AWAY"]);
  });

  it("fails closed outside playing time and does not reuse stale dead-ball evidence", () => {
    const liveWithoutPlayingTime = { ...createInitialScoreboardProjection(envelope.matchId), status: "LIVE" as const };
    expect(deriveScoreTimeoutOpportunity(liveWithoutPlayingTime, { teamSide: "HOME", points: 2 }, "goal", 1).status).toBe("CLOSED");
    const playing = applyTimeoutOpportunityFact(liveWithoutPlayingTime, { factType: "PLAYING_TIME_STARTED", sourceEventId: "start", sourceSeq: 1, occurredAt: "2026-07-30T00:00:00.000Z" }, 1);
    const stopped = { ...playing, gameClock: { ...playing.gameClock, running: false } };
    const dead = applyTimeoutOpportunityFact(stopped, { factType: "DEAD_BALL_CONFIRMED", sourceEventId: "dead", sourceSeq: 2, occurredAt: "2026-07-30T00:00:01.000Z" }, 2);
    const disposed = applyTimeoutOpportunityFact(dead, { factType: "THROW_IN_DISPOSAL", sourceEventId: "dispose", sourceSeq: 3, occurredAt: "2026-07-30T00:00:02.000Z" }, 3);
    const staleTable = applyTimeoutOpportunityFact(disposed, { factType: "TABLE_COMMUNICATION_COMPLETED", sourceEventId: "table", sourceSeq: 4, occurredAt: "2026-07-30T00:00:03.000Z" }, 4);
    expect(staleTable.timeoutOpportunity.status).toBe("CLOSED");
  });

  it("AC-015-005/006/007 precise facts fail closed and never grant or consume", () => {
    const initial = { ...createInitialScoreboardProjection(envelope.matchId), status: "LIVE" as const };
    const original = applyTimeoutOpportunityFact(initial, { factType: "PLAYING_TIME_STARTED", sourceEventId: "start", sourceSeq: 0, occurredAt: "2026-07-30T00:00:00.000Z" }, 0);
    const stopped = { ...original, gameClock: { ...original.gameClock, running: false } };
    const dead = applyTimeoutOpportunityFact(stopped, { factType: "DEAD_BALL_CONFIRMED", sourceEventId: "dead", sourceSeq: 1, occurredAt: "2026-07-30T00:00:00.000Z" }, 1);
    expect(dead.timeoutOpportunity.status).toBe("CLOSED");
    const opened = applyTimeoutOpportunityFact(dead, { factType: "TABLE_COMMUNICATION_COMPLETED", sourceEventId: "table", sourceSeq: 2, occurredAt: "2026-07-30T00:00:01.000Z" }, 2);
    expect(opened.timeoutOpportunity.status).toBe("OPEN");
    const closed = applyTimeoutOpportunityFact(opened, { factType: "THROW_IN_DISPOSAL", sourceEventId: "throw", sourceSeq: 3, occurredAt: "2026-07-30T00:00:02.000Z" }, 3);
    expect(closed.timeoutOpportunity.status).toBe("CLOSED");
    expect(closed.timeouts).toEqual(original.timeouts);
    expect(closed.activeTimeout).toBeNull();
  });

  it("AC-015-011/012 correction targets exact retained fact and recomputes", () => {
    const base = { ...createInitialScoreboardProjection(envelope.matchId), status: "LIVE" as const };
    const withFact = applyTimeoutOpportunityFact(base, { factType: "REFEREE_INTERRUPTION", referencedGoalEventId: "goal", referencedGoalSeq: 7, sourceEventId: "fact", sourceSeq: 8, occurredAt: "2026-07-30T00:00:00.000Z" }, 8);
    const corrected = applyTimeoutOpportunityCorrection(withFact, { targetEventId: "fact", targetSeq: 8, reason: "Incorrect interruption", correctionEventId: "correction", correctionSeq: 9, occurredAt: "2026-07-30T00:00:01.000Z" }, 9);
    expect(corrected.timeoutOpportunity.status).toBe("UNKNOWN");
    expect(corrected.timeoutOpportunityHistory).toHaveLength(2);
    expect(timeoutOpportunityCorrectionCommandSchema.safeParse({ ...envelope, payload: { targetEventId: "fact", targetSeq: 8, reason: " " } }).success).toBe(false);
  });

  it.each<TimeoutOpportunityFailureSeam>(["afterEvent", "afterHead", "afterProjection", "afterReceipt", "afterAudit", "beforeCommit"])("rolls back every production transaction boundary: %s", async (seam) => {
    const store = createTransactionalPool();
    const command = timeoutOpportunityFactCommandSchema.parse({ ...envelope, expectedSeq: 0, payload: { factType: "DEAD_BALL_CONFIRMED" } });
    await expect(appendTimeoutOpportunityFactCommand({ pool: store.pool, command, user, injectFailureAt: seam })).rejects.toThrow(`INJECTED_TIMEOUT_OPPORTUNITY_FAILURE:${seam}`);
    expect(store.state()).toMatchObject({ head: 0, events: [], receipts: [], audits: [] });
    const retry = await appendTimeoutOpportunityFactCommand({ pool: store.pool, command, user });
    expect(retry.status).toBe("ACCEPTED");
    expect(store.state()).toMatchObject({ head: 1 });
    expect(store.state().events).toHaveLength(1);
    expect(store.state().receipts).toHaveLength(1);
    expect(store.state().audits).toHaveLength(1);
  });

  it("persists exact retries once, rejects changed-payload collisions, and accepts one same-sequence command", async () => {
    const store = createTransactionalPool();
    const command = timeoutOpportunityFactCommandSchema.parse({ ...envelope, expectedSeq: 0, payload: { factType: "DEAD_BALL_CONFIRMED" } });
    expect((await appendTimeoutOpportunityFactCommand({ pool: store.pool, command, user })).status).toBe("ACCEPTED");
    expect((await appendTimeoutOpportunityFactCommand({ pool: store.pool, command, user })).status).toBe("DUPLICATE_ACCEPTED");
    const collision = timeoutOpportunityFactCommandSchema.parse({ ...command, payload: { factType: "THROW_IN_DISPOSAL" } });
    expect((await appendTimeoutOpportunityFactCommand({ pool: store.pool, command: collision, user })).status).toBe("REJECTED");
    const contender = timeoutOpportunityFactCommandSchema.parse({ ...command, commandId: "10000000-0000-4000-8000-000000000002", payload: { factType: "TABLE_COMMUNICATION_COMPLETED" } });
    expect((await appendTimeoutOpportunityFactCommand({ pool: store.pool, command: contender, user })).status).toBe("SYNC_REQUIRED");
    expect(store.state().events).toHaveLength(1);
    expect(store.state().receipts).toHaveLength(1);
    expect(store.state().audits).toHaveLength(1);
  });

  it("persists correction target, causation, receipt and audit and rejects a second correction", async () => {
    const store = createTransactionalPool();
    const fact = timeoutOpportunityFactCommandSchema.parse({ ...envelope, expectedSeq: 0, payload: { factType: "DEAD_BALL_CONFIRMED" } });
    await appendTimeoutOpportunityFactCommand({ pool: store.pool, command: fact, user });
    const target = store.state().events[0];
    const correction = timeoutOpportunityCorrectionCommandSchema.parse({ ...envelope, commandId: "10000000-0000-4000-8000-000000000003", expectedSeq: 1, payload: { targetEventId: target.event_id, targetSeq: 1, reason: "Incorrect dead-ball signal" } });
    expect((await appendTimeoutOpportunityCorrectionCommand({ pool: store.pool, command: correction, user })).status).toBe("ACCEPTED");
    expect(store.state().events).toHaveLength(2);
    expect(store.state().receipts).toHaveLength(2);
    expect(store.state().audits).toHaveLength(2);
    const second = timeoutOpportunityCorrectionCommandSchema.parse({ ...correction, commandId: "10000000-0000-4000-8000-000000000004", expectedSeq: 2 });
    expect((await appendTimeoutOpportunityCorrectionCommand({ pool: store.pool, command: second, user })).status).toBe("REJECTED");
  });

  it("uses canonical lifecycle markers and compensates corrected canonical goals", () => {
    const started = applyMatchStarted(createInitialScoreboardProjection(envelope.matchId), { startedAt: envelope.clientTimestamp, periodNumber: 1, periodType: "REGULATION", gameClockRemainingMs: 600000, shotClockRemainingMs: 24000, reason: null }, 1);
    const prePlayingScore = applyScoreAdded(started, { teamSide: "HOME", points: 2, playerId: null, periodNumber: 1, gameClockRemainingMs: 590000, note: null }, 2, "pre-playing-goal");
    expect(prePlayingScore.timeoutOpportunity.status).toBe("CLOSED");
    const playing = applyGameClockStarted(prePlayingScore, { startedAt: envelope.clientTimestamp, remainingMsBeforeStart: 590000 }, 3, "clock-start-event");
    expect(playing.timeoutOpportunityHistory.at(-1)).toMatchObject({ eventId: "clock-start-event", factType: "PLAYING_TIME_STARTED" });
    const scored = applyScoreAdded(playing, { teamSide: "HOME", points: 2, playerId: null, periodNumber: 1, gameClockRemainingMs: 580000, note: null }, 4, "goal-event");
    expect(scored.timeoutOpportunity).toMatchObject({ status: "OPEN", eligibleTeams: ["AWAY"] });
    const corrected = applyScoreRemovedByCorrection(scored, { teamSide: "HOME", points: 2, originalScoreSeq: 4, originalScoreEventId: "goal-event" }, 5, "score-correction-event");
    expect(corrected.timeoutOpportunity.status).not.toBe("OPEN");
    expect(corrected.timeoutOpportunityHistory.find((entry) => entry.eventId === "goal-event")?.corrected).toBe(true);
    expect(corrected.timeoutOpportunityHistory.at(-1)).toMatchObject({ eventId: "score-correction-event", factType: "CORRECTION" });
  });

  it("does not reopen a disposed goal through referee interruption", () => {
    let projection = applyMatchStarted(createInitialScoreboardProjection(envelope.matchId), { startedAt: envelope.clientTimestamp, periodNumber: 4, periodType: "REGULATION", gameClockRemainingMs: 120000, shotClockRemainingMs: 24000, reason: null }, 1);
    projection = applyGameClockStarted(projection, { startedAt: envelope.clientTimestamp, remainingMsBeforeStart: 120000 }, 2, "clock-start");
    projection = applyScoreAdded(projection, { teamSide: "HOME", points: 2, playerId: null, periodNumber: 4, gameClockRemainingMs: 119000, note: null }, 3, "goal");
    projection = applyTimeoutOpportunityFact(projection, { factType: "THROW_IN_DISPOSAL", sourceEventId: "disposal", sourceSeq: 4, occurredAt: envelope.clientTimestamp }, 4);
    projection = applyTimeoutOpportunityFact(projection, { factType: "REFEREE_INTERRUPTION", sourceEventId: "interruption", sourceSeq: 5, occurredAt: envelope.clientTimestamp, referencedGoalEventId: "goal", referencedGoalSeq: 3, scoringTeamSide: "HOME" }, 5);
    expect(projection.timeoutOpportunity).toMatchObject({ status: "CLOSED", sourceEventId: "interruption" });
  });

  it("does not reopen a goal after canonical playing time restarts", () => {
    let projection = applyMatchStarted(createInitialScoreboardProjection(envelope.matchId), { startedAt: envelope.clientTimestamp, periodNumber: 4, periodType: "REGULATION", gameClockRemainingMs: 120000, shotClockRemainingMs: 24000, reason: null }, 1);
    projection = applyGameClockStarted(projection, { startedAt: envelope.clientTimestamp, remainingMsBeforeStart: 120000 }, 2, "initial-clock-start");
    projection = applyScoreAdded(projection, { teamSide: "HOME", points: 2, playerId: null, periodNumber: 4, gameClockRemainingMs: 119000, note: null }, 3, "goal");
    projection = applyGameClockStarted(projection, { startedAt: envelope.clientTimestamp, remainingMsBeforeStart: 118000 }, 4, "resumed-playing-time");
    projection = applyTimeoutOpportunityFact(projection, { factType: "REFEREE_INTERRUPTION", sourceEventId: "interruption", sourceSeq: 5, occurredAt: envelope.clientTimestamp, referencedGoalEventId: "goal", referencedGoalSeq: 3, scoringTeamSide: "HOME" }, 5);
    expect(projection.timeoutOpportunity).toMatchObject({ status: "CLOSED", sourceEventId: "interruption" });
  });

  it("replays the canonical stream identically from zero and snapshot plus tail", () => {
    const event = (seqNo: number, eventId: string, eventType: string, payload: Record<string, unknown>) => ({ eventId, matchId: envelope.matchId, seqNo, eventType, payload, actorUserId: user.userId, actorRole: user.role, deviceId: user.deviceId, occurredAt: "2026-07-30T00:00:00.000Z", recordedAt: "2026-07-30T00:00:00.000Z", commandId: envelope.commandId, expectedSeq: seqNo - 1, correlationId: envelope.correlationId, causationId: null, reason: null, ruleProfileId: "FIBA_2024" });
    const events = [
      event(1, "start", "MATCH_STARTED", { startedAt: "2026-07-30T00:00:00.000Z", periodNumber: 1, periodType: "REGULATION", gameClockRemainingMs: 600000, shotClockRemainingMs: 24_000, reason: null }),
      event(2, "period", "PERIOD_STARTED", { periodNumber: 1, periodType: "REGULATION", gameClockRemainingMs: 600000, shotClockRemainingMs: 24_000, startedAt: "2026-07-30T00:00:00.000Z", reason: null }),
      event(3, "goal", "SCORE_ADDED", { teamSide: "HOME", points: 2, playerId: null, periodNumber: 1, gameClockRemainingMs: 590000, note: null })
    ] as never[];
    const full = rebuildTimeoutOpportunityProjection(envelope.matchId, events);
    const snapshot = rebuildTimeoutOpportunityProjection(envelope.matchId, events.slice(0, 2));
    const tail = rebuildTimeoutOpportunityProjection(envelope.matchId, events, snapshot);
    expect(tail.timeoutOpportunity).toEqual(full.timeoutOpportunity);
    expect(tail.timeoutOpportunityHistory).toEqual(full.timeoutOpportunityHistory);
  });

  it("replays canonical clock set and correction before referee-interruption eligibility", () => {
    const event = (seqNo: number, eventId: string, eventType: string, payload: Record<string, unknown>) => ({ eventId, matchId: envelope.matchId, seqNo, eventType, payload, actorUserId: user.userId, actorRole: user.role, deviceId: user.deviceId, occurredAt: envelope.clientTimestamp, recordedAt: envelope.clientTimestamp, commandId: `command-${seqNo}`, expectedSeq: seqNo - 1, correlationId: `correlation-${seqNo}`, causationId: null, reason: null, ruleProfileId: "FIBA_2024" });
    const base = [
      event(1, "start", "MATCH_STARTED", { startedAt: envelope.clientTimestamp, periodNumber: 4, periodType: "REGULATION", gameClockRemainingMs: 130000, shotClockRemainingMs: 24000, reason: null }),
      event(2, "clock-start", "GAME_CLOCK_STARTED", { startedAt: envelope.clientTimestamp, remainingMsBeforeStart: 130000 }),
      event(3, "goal", "SCORE_ADDED", { teamSide: "HOME", points: 2, playerId: null, periodNumber: 4, gameClockRemainingMs: 125000, note: null })
    ];
    const interruption = (seqNo: number) => event(seqNo, `interruption-${seqNo}`, "TIMEOUT_OPPORTUNITY_FACT_RECORDED", { factType: "REFEREE_INTERRUPTION", sourceEventId: `interruption-${seqNo}`, sourceSeq: seqNo, occurredAt: envelope.clientTimestamp, referencedGoalEventId: "goal", referencedGoalSeq: 3, scoringTeamSide: "HOME", periodNumber: 4, matchStatus: "LIVE" });
    const setIntoLateWindow = rebuildTimeoutOpportunityProjection(envelope.matchId, [...base, event(4, "clock-set", "GAME_CLOCK_SET", { remainingMs: 119000, setAt: envelope.clientTimestamp }), interruption(5)] as never[]);
    expect(setIntoLateWindow.timeoutOpportunity).toMatchObject({ status: "OPEN", eligibleTeams: ["HOME", "AWAY"] });
    const correctedOutOfLateWindow = rebuildTimeoutOpportunityProjection(envelope.matchId, [...base, event(4, "clock-corrected", "GAME_CLOCK_CORRECTED", { remainingMs: 121000, running: false, correctedAt: envelope.clientTimestamp }), interruption(5)] as never[]);
    expect(correctedOutOfLateWindow.timeoutOpportunity).toMatchObject({ status: "CLOSED", sourceEventId: "interruption-5" });
  });

  it("keeps public projection free of private opportunity and correction evidence", () => {
    const projection = createInitialScoreboardProjection(envelope.matchId);
    projection.timeoutOpportunityHistory.push({ eventId: "private", seq: 1, factType: "DEAD_BALL_CONFIRMED", occurredAt: "2026-07-30T00:00:00.000Z", corrected: false, targetEventId: null });
    const serialized = JSON.stringify(toPublicScoreboardProjection(projection as never));
    expect(serialized).not.toMatch(/timeoutOpportunity|sourceEvent|correction|actor|receipt|authorization/i);
  });

  it("mounts factual and correction routes behind authentication", async () => {
    const app = buildApiApp({ pool: { getConnection: async () => { throw new Error("database must not be reached before auth"); } } as never });
    try {
      for (const suffix of ["fact", "correct"]) {
        const response = await app.inject({ method: "POST", url: `/api/v1/matches/${envelope.matchId}/commands/timeout-opportunity/${suffix}`, payload: {} });
        expect(response.statusCode).toBe(401);
      }
    } finally { await app.close(); }
  });
});
