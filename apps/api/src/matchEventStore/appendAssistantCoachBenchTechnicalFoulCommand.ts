import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import type { CommandResult, RecordAssistantCoachBenchTechnicalFoulCommand } from "@basket-scoreboard/api-contracts";
import { reasonCodes } from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { insertAuditLog } from "./auditRepository.js";
import { ensurePlaceholderUser, findDuplicateCommandIdentity, getScoreboardProjection, insertCommandResult, lockMatchStream, recoverMatchStreamReadConflict, updateScoreboardProjection } from "./repositories.js";
import { getAssistantCoachDesignationForMatch, getHeadCoachDesignationForMatch } from "../rosters/rosterRepository.js";
import { applyAssistantCoachBenchTechnicalFoulAdded } from "./projection.js";

type AssistantCoachBenchTechnicalCommand = RecordAssistantCoachBenchTechnicalFoulCommand;
const finishedMatchLiveControlMessage = "Finished matches cannot be changed through live controls";
const requestHash = (command: AssistantCoachBenchTechnicalCommand) => createHash("sha256").update(JSON.stringify(command)).digest("hex");

export async function appendAssistantCoachBenchTechnicalFoulCommand(options: {
  pool: Pool;
  command: AssistantCoachBenchTechnicalCommand;
  user: AuthenticatedUser;
}): Promise<CommandResult> {
  const connection = await options.pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensurePlaceholderUser(connection, options.user);
    const existing = await findDuplicateCommandIdentity(connection, options.command.matchId, options.command.commandId);
    if (existing) {
      await connection.rollback();
      return existing.requestHash === requestHash(options.command)
        ? { ...existing.result, status: "DUPLICATE_ACCEPTED" }
        : rejected(options.command, reasonCodes.VALIDATION_ERROR, "Command identity was already used with a different request", existing.result.currentSeq);
    }
    const currentSeq = await lockMatchStream(connection, options.command.matchId);
    if (currentSeq === null) { await connection.rollback(); return rejected(options.command, reasonCodes.MATCH_NOT_FOUND, "Match stream was not found", 0); }
    const lockedExisting = await findDuplicateCommandIdentity(connection, options.command.matchId, options.command.commandId);
    if (lockedExisting) {
      await connection.rollback();
      return lockedExisting.requestHash === requestHash(options.command)
        ? { ...lockedExisting.result, status: "DUPLICATE_ACCEPTED" }
        : rejected(options.command, reasonCodes.VALIDATION_ERROR, "Command identity was already used with a different request", lockedExisting.result.currentSeq);
    }
    if (currentSeq !== options.command.expectedSeq) {
      await connection.rollback();
      return { status: "SYNC_REQUIRED", commandId: options.command.commandId, matchId: options.command.matchId, currentSeq, appendedEvents: [], reasonCode: reasonCodes.INVALID_EXPECTED_SEQ, message: `Expected seq ${options.command.expectedSeq}, current seq ${currentSeq}` };
    }
    const projection = await getScoreboardProjection(connection, options.command.matchId);
    if (!projection) { await connection.rollback(); return rejected(options.command, reasonCodes.MATCH_NOT_FOUND, "Scoreboard projection was not found", currentSeq); }
    if (isFinishedMatchStatus(projection.status)) { await connection.rollback(); return rejected(options.command, reasonCodes.VALIDATION_ERROR, finishedMatchLiveControlMessage, currentSeq); }
    if (projection.status !== "LIVE") { await connection.rollback(); return rejected(options.command, reasonCodes.VALIDATION_ERROR, "Assistant-coach bench technical fouls are supported only during live playing time", currentSeq); }
    const assistant = await getAssistantCoachDesignationForMatch(connection, options.command.matchId, options.command.payload.teamSide);
    const headCoach = await getHeadCoachDesignationForMatch(connection, options.command.matchId, options.command.payload.teamSide);
    if (!assistant || !headCoach) { await connection.rollback(); return rejected(options.command, reasonCodes.VALIDATION_ERROR, !assistant ? "ASSISTANT_COACH_DESIGNATION_REQUIRED" : "HEAD_COACH_DESIGNATION_REQUIRED", currentSeq); }

    const eventId = randomUUID();
    const entitlementEventId = randomUUID();
    const resumptionEventId = randomUUID();
    const occurredAt = new Date(options.command.clientTimestamp);
    const periodNumber = projection.periodNumber || 1;
    const shotClockSnapshot = projection.shotClockRemainingMs == null ? null : projection.shotClockRemainingMs.toString();
    const foulPayload = { teamSide: options.command.payload.teamSide, assistantCoachDesignationId: assistant.designationId, assistantCoachDisplayNameSnapshot: assistant.displayName, chargedHeadCoachDesignationId: headCoach.designationId, chargedHeadCoachDisplayNameSnapshot: headCoach.displayName, classification: "B" as const, periodNumber, gameClockSnapshot: projection.gameClockRemainingMs.toString(), shotClockSnapshot, teamControlSnapshot: null, ruleProfileId: "FIBA_2024" as const, ruleVersion: "2024.v1" };
    const nextSeq = currentSeq + 1;
    const finalSeq = currentSeq + 3;
    await connection.query("INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'FIBA_2024')", [eventId, options.command.matchId, nextSeq, "BENCH_TECHNICAL_FOUL_RECORDED", JSON.stringify(foulPayload), options.user.userId, options.user.role, options.user.deviceId, occurredAt, options.command.commandId, options.command.expectedSeq, options.command.correlationId, "Assistant coach bench technical foul recorded"]);
    const awardedTo = options.command.payload.teamSide === "HOME" ? "AWAY" : "HOME";
    await connection.query("INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, 'FREE_THROW_ENTITLEMENT_CREATED', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'FIBA_2024')", [entitlementEventId, options.command.matchId, currentSeq + 2, JSON.stringify({ sourceFoulEventId: eventId, attempts: 1, awardedTo, ruleProfileId: "FIBA_2024" }), options.user.userId, options.user.role, options.user.deviceId, occurredAt, options.command.commandId, options.command.expectedSeq, options.command.correlationId, eventId]);
    await connection.query("INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, 'PLAY_RESUMPTION_DECLARED', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'FIBA_2024')", [resumptionEventId, options.command.matchId, finalSeq, JSON.stringify({ sourceEntitlementEventId: entitlementEventId, mode: "RESUME_INTERRUPTED_PLAY", resumptionLocation: "POINT_OF_INTERRUPTION", teamControlSnapshot: null, periodNumber, gameClockSnapshot: projection.gameClockRemainingMs.toString(), shotClockSnapshot, ruleProfileId: "FIBA_2024" }), options.user.userId, options.user.role, options.user.deviceId, occurredAt, options.command.commandId, options.command.expectedSeq, options.command.correlationId, entitlementEventId]);
    await connection.query("UPDATE match_streams SET last_seq_no = ? WHERE match_id = ?", [finalSeq, options.command.matchId]);
    const finalProjection = { ...applyAssistantCoachBenchTechnicalFoulAdded(projection, foulPayload, nextSeq), currentSeq: finalSeq };
    await updateScoreboardProjection(connection, finalProjection);
    await insertAuditLog(connection, { entityType: "match", entityId: options.command.matchId, action: "BENCH_TECHNICAL_FOUL_RECORDED", actorUserId: options.user.userId, actorRole: options.user.role, deviceId: options.user.deviceId, oldValue: projection, newValue: finalProjection, reason: "Assistant coach bench technical foul recorded", correlationId: options.command.correlationId, causationId: eventId, eventSeq: finalSeq });
    const result: CommandResult = { status: "ACCEPTED", commandId: options.command.commandId, matchId: options.command.matchId, currentSeq: finalSeq, appendedEvents: [{ eventId, seqNo: nextSeq, eventType: "BENCH_TECHNICAL_FOUL_RECORDED" }, { eventId: entitlementEventId, seqNo: currentSeq + 2, eventType: "FREE_THROW_ENTITLEMENT_CREATED" }, { eventId: resumptionEventId, seqNo: finalSeq, eventType: "PLAY_RESUMPTION_DECLARED" }], reasonCode: null, message: null };
    await insertCommandResult(connection, { commandId: options.command.commandId, matchId: options.command.matchId, commandType: "foul/assistant-coach/bench-technical", requestHash: requestHash(options.command), result });
    await connection.commit();
    return result;
  } catch (error) { await connection.rollback(); const conflict = await recoverMatchStreamReadConflict({ error, pool: options.pool, command: options.command }); if (conflict) return conflict; throw error; } finally { connection.release(); }
}
function rejected(command: AssistantCoachBenchTechnicalCommand, reasonCode: string, message: string, currentSeq: number): CommandResult { return { status: "REJECTED", commandId: command.commandId, matchId: command.matchId, currentSeq, appendedEvents: [], reasonCode, message }; }
function isFinishedMatchStatus(status: string) { const normalized = status.toUpperCase(); return normalized === "FINISHED" || normalized === "FINAL"; }
