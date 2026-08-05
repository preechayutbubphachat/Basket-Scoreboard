import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import type {
  CommandResult,
  RecordHeadCoachTechnicalFoulCommand
} from "@basket-scoreboard/api-contracts";
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
import { getHeadCoachDesignationForMatch } from "../rosters/rosterRepository.js";
import { applyHeadCoachTechnicalFoulAdded } from "./projection.js";

type HeadCoachTechnicalCommand = RecordHeadCoachTechnicalFoulCommand;

function requestHashHeadCoach(command: HeadCoachTechnicalCommand) {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

const finishedMatchLiveControlMessage = "Finished matches cannot be changed through live controls";

export async function appendHeadCoachTechnicalFoulCommand(options: {
  pool: Pool;
  command: RecordHeadCoachTechnicalFoulCommand;
  user: AuthenticatedUser;
}): Promise<CommandResult> {
  const connection = await options.pool.getConnection();

  try {
    await connection.beginTransaction();
    await ensurePlaceholderUser(connection, options.user);

    const duplicateIdentity = await findDuplicateCommandIdentity(
      connection,
      options.command.matchId,
      options.command.commandId
    );
    if (duplicateIdentity) {
      await connection.rollback();
      if (duplicateIdentity.requestHash !== requestHashHeadCoach(options.command)) {
        return rejected(
          options.command,
          reasonCodes.VALIDATION_ERROR,
          "Command identity was already used with a different request",
          duplicateIdentity.result.currentSeq
        );
      }
      return {
        ...duplicateIdentity.result,
        status: "DUPLICATE_ACCEPTED"
      };
    }

    const currentSeq = await lockMatchStream(connection, options.command.matchId);
    if (currentSeq === null) {
      await connection.rollback();
      return rejected(options.command, reasonCodes.MATCH_NOT_FOUND, "Match stream was not found", 0);
    }

    const lockedDuplicateIdentity = await findDuplicateCommandIdentity(
      connection,
      options.command.matchId,
      options.command.commandId
    );
    if (lockedDuplicateIdentity) {
      await connection.rollback();
      if (lockedDuplicateIdentity.requestHash !== requestHashHeadCoach(options.command)) {
        return rejected(
          options.command,
          reasonCodes.VALIDATION_ERROR,
          "Command identity was already used with a different request",
          lockedDuplicateIdentity.result.currentSeq
        );
      }
      return {
        ...lockedDuplicateIdentity.result,
        status: "DUPLICATE_ACCEPTED"
      };
    }

    if (currentSeq !== options.command.expectedSeq) {
      await connection.rollback();
      return {
        status: "SYNC_REQUIRED",
        commandId: options.command.commandId,
        matchId: options.command.matchId,
        currentSeq,
        appendedEvents: [],
        reasonCode: reasonCodes.INVALID_EXPECTED_SEQ,
        message: `Expected seq ${options.command.expectedSeq}, current seq ${currentSeq}`
      };
    }

    const projection = await getScoreboardProjection(connection, options.command.matchId);

    if (!projection) {
      await connection.rollback();
      return rejected(options.command, reasonCodes.MATCH_NOT_FOUND, `Scoreboard projection not found for match ${options.command.matchId}`, currentSeq);
    }

    if (isFinishedMatchStatus(projection.status)) {
      await connection.rollback();
      return rejected(options.command, reasonCodes.VALIDATION_ERROR, finishedMatchLiveControlMessage, currentSeq);
    }

    if (projection.status !== "LIVE") {
      await connection.rollback();
      return rejected(
        options.command,
        reasonCodes.VALIDATION_ERROR,
        "Head coach technical fouls are supported only during live playing time",
        currentSeq
      );
    }

    // Validate designation exists
    const designation = await getHeadCoachDesignationForMatch(connection, options.command.matchId, options.command.payload.teamSide);
    if (!designation) {
      await connection.rollback();
      return rejected(
        options.command,
        reasonCodes.VALIDATION_ERROR,
        "HEAD_COACH_DESIGNATION_REQUIRED",
        currentSeq
      );
    }

    const currentCoachTechnicalCount = projection.headCoachTechnicals.find(
      (coach) => coach.designationId === designation.designationId
    )?.coachTechnicalCount ?? 0;
    if (currentCoachTechnicalCount >= 2) {
      await connection.rollback();
      return rejected(
        options.command,
        reasonCodes.VALIDATION_ERROR,
        "A further head coach technical foul requires unsupported disqualification handling",
        currentSeq
      );
    }

    const nextSeq = currentSeq + 1;
    const eventId = randomUUID();
    const entitlementEventId = randomUUID();
    const resumptionEventId = randomUUID();
    const finalSeq = currentSeq + 3;
    const occurredAt = new Date(options.command.clientTimestamp);
    const periodNumber = projection.periodNumber || 1;
    const ruleVersion = "2024.v1";

    const foulPayload = {
      teamSide: options.command.payload.teamSide,
      headCoachDesignationId: designation.designationId,
      headCoachDisplayNameSnapshot: designation.displayName,
      classification: "C" as const,
      periodNumber,
      gameClockSnapshot: projection.gameClockRemainingMs.toString(),
      ruleProfileId: "FIBA_2024" as const,
      ruleVersion
    };

    await connection.query(
      "INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'FIBA_2024')",
      [
        eventId,
        options.command.matchId,
        nextSeq,
        "HEAD_COACH_TECHNICAL_FOUL_RECORDED",
        JSON.stringify(foulPayload),
        options.user.userId,
        options.user.role,
        options.user.deviceId,
        occurredAt,
        options.command.commandId,
        options.command.expectedSeq,
        options.command.correlationId,
        "Head coach technical foul recorded"
      ]
    );

    const awardedTo = options.command.payload.teamSide === "HOME" ? "AWAY" : "HOME";
    await connection.query(
      "INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, 'FREE_THROW_ENTITLEMENT_CREATED', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'FIBA_2024')",
      [entitlementEventId, options.command.matchId, currentSeq + 2, JSON.stringify({ sourceFoulEventId: eventId, attempts: 1, awardedTo, ruleProfileId: "FIBA_2024" }), options.user.userId, options.user.role, options.user.deviceId, occurredAt, options.command.commandId, options.command.expectedSeq, options.command.correlationId, eventId]
    );
    await connection.query(
      "INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, 'PLAY_RESUMPTION_DECLARED', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'FIBA_2024')",
      [resumptionEventId, options.command.matchId, finalSeq, JSON.stringify({ sourceEntitlementEventId: entitlementEventId, mode: "RESUME_INTERRUPTED_PLAY", resumptionLocation: "POINT_OF_INTERRUPTION", teamControlSnapshot: null, periodNumber, gameClockSnapshot: projection.gameClockRemainingMs.toString(), shotClockSnapshot: projection.shotClockRemainingMs.toString(), ruleProfileId: "FIBA_2024" }), options.user.userId, options.user.role, options.user.deviceId, occurredAt, options.command.commandId, options.command.expectedSeq, options.command.correlationId, entitlementEventId]
    );

    await connection.query("UPDATE match_streams SET last_seq_no = ? WHERE match_id = ?", [
      finalSeq,
      options.command.matchId
    ]);

    const updatedProjection = applyHeadCoachTechnicalFoulAdded(projection, {
      teamSide: options.command.payload.teamSide,
      headCoachDesignationId: designation.designationId,
      headCoachDisplayNameSnapshot: designation.displayName,
      periodNumber,
      gameClockSnapshot: projection.gameClockRemainingMs.toString(),
      ruleProfileId: "FIBA_2024",
      ruleVersion
    }, nextSeq);

    const finalProjection = { ...updatedProjection, currentSeq: finalSeq };

    await updateScoreboardProjection(connection, finalProjection);
    await insertAuditLog(connection, {
      entityType: "match",
      entityId: options.command.matchId,
      action: "HEAD_COACH_TECHNICAL_FOUL_RECORDED",
      actorUserId: options.user.userId,
      actorRole: options.user.role,
      deviceId: options.user.deviceId,
      oldValue: projection,
      newValue: finalProjection,
      reason: "Head coach technical foul recorded",
      correlationId: options.command.correlationId,
      causationId: eventId,
      eventSeq: finalSeq
    });

    const result: CommandResult = {
      status: "ACCEPTED",
      commandId: options.command.commandId,
      matchId: options.command.matchId,
      currentSeq: finalSeq,
      appendedEvents: [
        { eventId, seqNo: nextSeq, eventType: "HEAD_COACH_TECHNICAL_FOUL_RECORDED" as const },
        { eventId: entitlementEventId, seqNo: currentSeq + 2, eventType: "FREE_THROW_ENTITLEMENT_CREATED" as const },
        { eventId: resumptionEventId, seqNo: finalSeq, eventType: "PLAY_RESUMPTION_DECLARED" as const }
      ],
      reasonCode: null,
      message: null
    };

    await insertCommandResult(connection, {
      commandId: options.command.commandId,
      matchId: options.command.matchId,
      commandType: "foul/head-coach/technical",
      requestHash: requestHashHeadCoach(options.command),
      result
    });

    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    const conflict = await recoverMatchStreamReadConflict({ error, pool: options.pool, command: options.command });
    if (conflict) return conflict;
    throw error;
  } finally {
    connection.release();
  }
}

function rejected(
  command: HeadCoachTechnicalCommand,
  reasonCode: string,
  message: string,
  currentSeq: number
): CommandResult {
  return {
    status: "REJECTED",
    commandId: command.commandId,
    matchId: command.matchId,
    currentSeq,
    appendedEvents: [],
    reasonCode,
    message
  };
}

function isFinishedMatchStatus(status: string) {
  const normalized = status.toUpperCase();
  return normalized === "FINISHED" || normalized === "FINAL";
}
