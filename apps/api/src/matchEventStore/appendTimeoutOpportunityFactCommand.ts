import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CommandResult, TimeoutOpportunityFactCommand } from "@basket-scoreboard/api-contracts";
import { reasonCodes } from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { insertAuditLog } from "./auditRepository.js";
import {
  ensurePlaceholderUser,
  findDuplicateCommandIdentity,
  getScoreboardProjection,
  insertCommandResult,
  lockMatchStream,
  recoverMatchStreamReadConflict,
  updateScoreboardProjection
} from "./repositories.js";
import { applyTimeoutOpportunityFact } from "./projection.js";

export type TimeoutOpportunityFailureSeam =
  | "afterEvent"
  | "afterHead"
  | "afterProjection"
  | "afterReceipt"
  | "afterAudit"
  | "beforeCommit";

type EventRow = RowDataPacket & { event_id: string; seq_no: number; event_type: string; payload: unknown; occurred_at: Date | string };

function hash(command: TimeoutOpportunityFactCommand) {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

async function failAt(
  actual: TimeoutOpportunityFailureSeam,
  requested?: TimeoutOpportunityFailureSeam,
  onFailureSeam?: (seam: TimeoutOpportunityFailureSeam, transactionalConnection: PoolConnection) => Promise<void>,
  connection?: PoolConnection
) {
  if (actual !== requested) return;
  if (connection) await onFailureSeam?.(actual, connection);
  throw new Error(`INJECTED_TIMEOUT_OPPORTUNITY_FAILURE:${actual}`);
}

export async function appendTimeoutOpportunityFactCommand(options: {
  pool: Pool;
  command: TimeoutOpportunityFactCommand;
  user: AuthenticatedUser;
  injectFailureAt?: TimeoutOpportunityFailureSeam;
  onFailureSeam?: (seam: TimeoutOpportunityFailureSeam, transactionalConnection: PoolConnection) => Promise<void>;
  beforeStreamLockBarrier?: (connection: PoolConnection) => Promise<void>;
}): Promise<CommandResult> {
  const connection = await options.pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensurePlaceholderUser(connection, options.user);
    const requestHash = hash(options.command);
    const duplicate = await findDuplicateCommandIdentity(connection, options.command.matchId, options.command.commandId);
    if (duplicate) {
      await connection.rollback();
      if (duplicate.requestHash !== requestHash) return rejected(options.command, duplicate.result.currentSeq, "Command identity was already used with a different request");
      return { ...duplicate.result, status: "DUPLICATE_ACCEPTED", appendedEvents: [] };
    }
    await options.beforeStreamLockBarrier?.(connection);
    const currentSeq = await lockMatchStream(connection, options.command.matchId);
    if (currentSeq === null) { await connection.rollback(); return rejected(options.command, 0, "Match stream was not found", reasonCodes.MATCH_NOT_FOUND); }
    const lockedDuplicate = await findDuplicateCommandIdentity(connection, options.command.matchId, options.command.commandId);
    if (lockedDuplicate) {
      await connection.rollback();
      if (lockedDuplicate.requestHash !== requestHash) return rejected(options.command, lockedDuplicate.result.currentSeq, "Command identity was already used with a different request");
      return { ...lockedDuplicate.result, status: "DUPLICATE_ACCEPTED", appendedEvents: [] };
    }
    if (currentSeq !== options.command.expectedSeq) { await connection.rollback(); return syncRequired(options.command, currentSeq); }
    const projection = await getScoreboardProjection(connection, options.command.matchId);
    if (!projection) { await connection.rollback(); return rejected(options.command, currentSeq, "Match projection was not found", reasonCodes.MATCH_NOT_FOUND); }
    if (projection.status !== "LIVE" && projection.status !== "OVERTIME") { await connection.rollback(); return rejected(options.command, currentSeq, "Timeout-opportunity facts require active playing lifecycle"); }
    const playingMarker = [...projection.timeoutOpportunityHistory].reverse().find((entry) => !entry.corrected && (entry.factType === "PLAYING_TIME_STARTED" || entry.factType === "PLAYING_TIME_ENDED"));
    if (playingMarker?.factType !== "PLAYING_TIME_STARTED") { await connection.rollback(); return rejected(options.command, currentSeq, "Timeout-opportunity facts require playing time to have started"); }

    const source = await validateSource(connection, options.command);
    if (!source.ok) { await connection.rollback(); return rejected(options.command, currentSeq, source.message); }
    const eventId = randomUUID();
    const nextSeq = currentSeq + 1;
    const occurredAt = new Date(options.command.clientTimestamp);
    const payload = {
      ...options.command.payload,
      sourceEventId: eventId,
      sourceSeq: nextSeq,
      occurredAt: occurredAt.toISOString(),
      periodNumber: projection.periodNumber,
      gameClockRemainingMs: projection.gameClockRemainingMs,
      gameClockRunning: projection.gameClock.running,
      matchStatus: projection.status,
      ruleProfileId: "FIBA_2024" as const,
      ...(source.scoringTeamSide ? { scoringTeamSide: source.scoringTeamSide } : {})
    };
    await connection.query("INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, 'TIMEOUT_OPPORTUNITY_FACT_RECORDED', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'FIBA_2024')", [eventId, options.command.matchId, nextSeq, JSON.stringify(payload), options.user.userId, options.user.role, options.user.deviceId, occurredAt, options.command.commandId, currentSeq, options.command.correlationId]);
    await failAt("afterEvent", options.injectFailureAt, options.onFailureSeam, connection);
    await connection.query("UPDATE match_streams SET last_seq_no = ? WHERE match_id = ?", [nextSeq, options.command.matchId]);
    await failAt("afterHead", options.injectFailureAt, options.onFailureSeam, connection);
    const updated = applyTimeoutOpportunityFact(projection, payload, nextSeq);
    await updateScoreboardProjection(connection, updated);
    await failAt("afterProjection", options.injectFailureAt, options.onFailureSeam, connection);
    const result: CommandResult = { status: "ACCEPTED", commandId: options.command.commandId, matchId: options.command.matchId, currentSeq: nextSeq, appendedEvents: [{ eventId, seqNo: nextSeq, eventType: "TIMEOUT_OPPORTUNITY_FACT_RECORDED" }], reasonCode: null, message: null, projection: updated };
    await insertCommandResult(connection, { commandId: options.command.commandId, matchId: options.command.matchId, commandType: "timeout-opportunity/fact", requestHash, result });
    await failAt("afterReceipt", options.injectFailureAt, options.onFailureSeam, connection);
    await insertAuditLog(connection, { entityType: "match", entityId: options.command.matchId, action: "TIMEOUT_OPPORTUNITY_FACT_RECORDED", actorUserId: options.user.userId, actorRole: options.user.role, deviceId: options.user.deviceId, oldValue: projection.timeoutOpportunity, newValue: updated.timeoutOpportunity, reason: null, correlationId: options.command.correlationId, causationId: eventId, eventSeq: nextSeq });
    await failAt("afterAudit", options.injectFailureAt, options.onFailureSeam, connection);
    await failAt("beforeCommit", options.injectFailureAt, options.onFailureSeam, connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    const conflict = await recoverMatchStreamReadConflict({ error, pool: options.pool, command: options.command });
    if (conflict) return conflict;
    throw error;
  } finally { connection.release(); }
}

async function validateSource(connection: PoolConnection, command: TimeoutOpportunityFactCommand): Promise<{ ok: true; scoringTeamSide?: "HOME" | "AWAY" } | { ok: false; message: string }> {
  if (command.payload.factType !== "REFEREE_INTERRUPTION") return { ok: true };
  const [rows] = await connection.query<EventRow[]>("SELECT event_id, seq_no, event_type, payload, occurred_at FROM match_events WHERE match_id = ? AND event_id = ? FOR UPDATE", [command.matchId, command.payload.referencedGoalEventId]);
  const goal = rows[0];
  if (!goal || goal.event_type !== "SCORE_ADDED") return { ok: false, message: "Referenced canonical goal was not found in this match stream" };

  const [corrections] = await connection.query<EventRow[]>("SELECT event_id, seq_no, event_type, payload, occurred_at FROM match_events WHERE match_id = ? AND event_type IN ('SCORE_REMOVED_BY_CORRECTION', 'SCORE_CORRECTED') AND (JSON_UNQUOTE(JSON_EXTRACT(payload, '$.originalScoreEventId')) = ? OR JSON_EXTRACT(payload, '$.originalScoreSeq') = ? OR JSON_EXTRACT(payload, '$.correctedEventSeq') = ?) LIMIT 1 FOR UPDATE", [command.matchId, goal.event_id, goal.seq_no, goal.seq_no]);
  if (corrections.length > 0) return { ok: false, message: "Referenced canonical goal was corrected and is no longer valid" };
  const [superseding] = await connection.query<EventRow[]>(
    "SELECT event_id, seq_no, event_type, payload, occurred_at FROM match_events WHERE match_id = ? AND seq_no > ? AND seq_no <= ? AND (event_type IN ('SCORE_ADDED', 'GAME_CLOCK_STARTED', 'PERIOD_ENDED', 'MATCH_FINISHED', 'SCORE_REMOVED_BY_CORRECTION', 'SCORE_CORRECTED') OR event_type = 'TIMEOUT_OPPORTUNITY_FACT_RECORDED') ORDER BY seq_no ASC LIMIT 1 FOR UPDATE",
    [command.matchId, goal.seq_no, command.expectedSeq]
  );
  if (superseding.length > 0) return { ok: false, message: "Referenced canonical goal was superseded by a later authoritative boundary" };
  const payload = typeof goal.payload === "string" ? JSON.parse(goal.payload) as { teamSide?: unknown } : goal.payload as { teamSide?: unknown };
  if (payload.teamSide !== "HOME" && payload.teamSide !== "AWAY") return { ok: false, message: "Referenced canonical goal has no authoritative scoring side" };
  return { ok: true, scoringTeamSide: payload.teamSide };
}

function rejected(command: TimeoutOpportunityFactCommand, currentSeq: number, message: string, reasonCode: string = reasonCodes.VALIDATION_ERROR): CommandResult {
  return { status: "REJECTED", commandId: command.commandId, matchId: command.matchId, currentSeq, appendedEvents: [], reasonCode, message };
}
function syncRequired(command: TimeoutOpportunityFactCommand, currentSeq: number): CommandResult {
  return { status: "SYNC_REQUIRED", commandId: command.commandId, matchId: command.matchId, currentSeq, appendedEvents: [], reasonCode: reasonCodes.INVALID_EXPECTED_SEQ, message: `Expected seq ${command.expectedSeq}, current seq ${currentSeq}` };
}
