import { createHash, randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { CommandResult, TimeoutOpportunityCorrectionCommand } from "@basket-scoreboard/api-contracts";
import { reasonCodes } from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { insertAuditLog } from "./auditRepository.js";
import { ensurePlaceholderUser, findDuplicateCommandIdentity, getScoreboardProjection, insertCommandResult, lockMatchStream, recoverMatchStreamReadConflict, updateScoreboardProjection } from "./repositories.js";
import { applyTimeoutOpportunityCorrection } from "./projection.js";
import type { TimeoutOpportunityFailureSeam } from "./appendTimeoutOpportunityFactCommand.js";

type EventRow = RowDataPacket & { event_id: string; seq_no: number; event_type: string; payload: unknown };
const hash = (command: TimeoutOpportunityCorrectionCommand) => createHash("sha256").update(JSON.stringify(command)).digest("hex");
const failAt = (actual: TimeoutOpportunityFailureSeam, requested?: TimeoutOpportunityFailureSeam) => { if (actual === requested) throw new Error(`INJECTED_TIMEOUT_OPPORTUNITY_FAILURE:${actual}`); };

export async function appendTimeoutOpportunityCorrectionCommand(options: { pool: Pool; command: TimeoutOpportunityCorrectionCommand; user: AuthenticatedUser; injectFailureAt?: TimeoutOpportunityFailureSeam }): Promise<CommandResult> {
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
    const currentSeq = await lockMatchStream(connection, options.command.matchId);
    if (currentSeq === null) { await connection.rollback(); return rejected(options.command, 0, "Match stream was not found", reasonCodes.MATCH_NOT_FOUND); }
    const lockedDuplicate = await findDuplicateCommandIdentity(connection, options.command.matchId, options.command.commandId);
    if (lockedDuplicate) {
      await connection.rollback();
      if (lockedDuplicate.requestHash !== requestHash) return rejected(options.command, lockedDuplicate.result.currentSeq, "Command identity was already used with a different request");
      return { ...lockedDuplicate.result, status: "DUPLICATE_ACCEPTED", appendedEvents: [] };
    }
    if (currentSeq !== options.command.expectedSeq) { await connection.rollback(); return { status: "SYNC_REQUIRED", commandId: options.command.commandId, matchId: options.command.matchId, currentSeq, appendedEvents: [], reasonCode: reasonCodes.INVALID_EXPECTED_SEQ, message: `Expected seq ${options.command.expectedSeq}, current seq ${currentSeq}` }; }
    const projection = await getScoreboardProjection(connection, options.command.matchId);
    if (!projection) throw new Error(`Scoreboard projection not found for match ${options.command.matchId}`);
    const [rows] = await connection.query<EventRow[]>("SELECT event_id, seq_no, event_type, payload FROM match_events WHERE match_id = ? AND event_id = ? AND seq_no = ? FOR UPDATE", [options.command.matchId, options.command.payload.targetEventId, options.command.payload.targetSeq]);
    const target = rows[0];
    if (!target || target.event_type !== "TIMEOUT_OPPORTUNITY_FACT_RECORDED") { await connection.rollback(); return rejected(options.command, currentSeq, "Correction target event ID and sequence did not identify a retained timeout-opportunity fact"); }
    const [priorCorrections] = await connection.query<EventRow[]>("SELECT event_id, seq_no, event_type, payload FROM match_events WHERE match_id = ? AND event_type = 'TIMEOUT_OPPORTUNITY_CORRECTED' AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.targetEventId')) = ? FOR UPDATE", [options.command.matchId, target.event_id]);
    if (priorCorrections.length > 0) { await connection.rollback(); return rejected(options.command, currentSeq, "Timeout-opportunity fact was already corrected"); }
    const eventId = randomUUID();
    const nextSeq = currentSeq + 1;
    const occurredAt = new Date(options.command.clientTimestamp);
    const oldValue = projection.timeoutOpportunity;
    const payload = { targetEventId: target.event_id, targetSeq: target.seq_no, reason: options.command.payload.reason, oldEffect: oldValue, correctionEventId: eventId, correctionSeq: nextSeq, occurredAt: occurredAt.toISOString(), ruleProfileId: "FIBA_2024" as const };
    const updated = applyTimeoutOpportunityCorrection(projection, payload, nextSeq);
    const persistedPayload = { ...payload, newEffect: updated.timeoutOpportunity, actorUserId: options.user.userId, actorRole: options.user.role, deviceId: options.user.deviceId, correlationId: options.command.correlationId };
    await connection.query("INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, 'TIMEOUT_OPPORTUNITY_CORRECTED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FIBA_2024')", [eventId, options.command.matchId, nextSeq, JSON.stringify(persistedPayload), options.user.userId, options.user.role, options.user.deviceId, occurredAt, options.command.commandId, currentSeq, options.command.correlationId, target.event_id, options.command.payload.reason]);
    failAt("afterEvent", options.injectFailureAt);
    await connection.query("UPDATE match_streams SET last_seq_no = ? WHERE match_id = ?", [nextSeq, options.command.matchId]);
    failAt("afterHead", options.injectFailureAt);
    await updateScoreboardProjection(connection, updated);
    failAt("afterProjection", options.injectFailureAt);
    const result: CommandResult = { status: "ACCEPTED", commandId: options.command.commandId, matchId: options.command.matchId, currentSeq: nextSeq, appendedEvents: [{ eventId, seqNo: nextSeq, eventType: "TIMEOUT_OPPORTUNITY_CORRECTED" }], reasonCode: null, message: null, projection: updated };
    await insertCommandResult(connection, { commandId: options.command.commandId, matchId: options.command.matchId, commandType: "timeout-opportunity/correction", requestHash, result });
    failAt("afterReceipt", options.injectFailureAt);
    await insertAuditLog(connection, { entityType: "match", entityId: options.command.matchId, action: "TIMEOUT_OPPORTUNITY_CORRECTED", actorUserId: options.user.userId, actorRole: options.user.role, deviceId: options.user.deviceId, oldValue, newValue: updated.timeoutOpportunity, reason: options.command.payload.reason, correlationId: options.command.correlationId, causationId: eventId, eventSeq: nextSeq });
    failAt("afterAudit", options.injectFailureAt);
    failAt("beforeCommit", options.injectFailureAt);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    const conflict = await recoverMatchStreamReadConflict({ error, pool: options.pool, command: options.command });
    if (conflict) return conflict;
    throw error;
  } finally { connection.release(); }
}

function rejected(command: TimeoutOpportunityCorrectionCommand, currentSeq: number, message: string, reasonCode: string = reasonCodes.VALIDATION_ERROR): CommandResult {
  return { status: "REJECTED", commandId: command.commandId, matchId: command.matchId, currentSeq, appendedEvents: [], reasonCode, message };
}
