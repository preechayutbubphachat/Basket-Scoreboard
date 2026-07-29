import { createHash } from "node:crypto";
import type { Pool } from "mysql2/promise";
import type { CommandResult, SetMatchHeadCoachDesignationCommand, CreateMatchAssistantCoachDesignationCommand } from "@basket-scoreboard/api-contracts";
import { reasonCodes } from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { insertAuditLog } from "./auditRepository.js";
import {
  ensurePlaceholderUser,
  findDuplicateCommandIdentity,
  insertCommandResult,
  lockMatchStream,
  recoverMatchStreamReadConflict
} from "./repositories.js";
import { createAssistantCoachDesignationForMatch, setHeadCoachDesignationForMatch } from "../rosters/rosterRepository.js";

function requestHash(command: SetMatchHeadCoachDesignationCommand) {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

function rejected(
  command: SetMatchHeadCoachDesignationCommand,
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

/**
 * Persists the one bounded match-side head-coach designation.  It deliberately
 * does not append a basketball event: designation is setup/audit data, while
 * the later technical-foul command remains the append-only match fact.
 */
export async function setMatchHeadCoachDesignationCommand(options: {
  pool: Pool;
  command: SetMatchHeadCoachDesignationCommand;
  user: AuthenticatedUser;
}): Promise<CommandResult> {
  const connection = await options.pool.getConnection();

  try {
    await connection.beginTransaction();
    await ensurePlaceholderUser(connection, options.user);

    const duplicate = await findDuplicateCommandIdentity(
      connection,
      options.command.matchId,
      options.command.commandId
    );
    if (duplicate) {
      await connection.rollback();
      if (duplicate.requestHash !== requestHash(options.command)) {
        return rejected(
          options.command,
          reasonCodes.VALIDATION_ERROR,
          "Command identity was already used with a different request",
          duplicate.result.currentSeq
        );
      }
      return { ...duplicate.result, status: "DUPLICATE_ACCEPTED" };
    }

    const currentSeq = await lockMatchStream(connection, options.command.matchId);
    if (currentSeq === null) {
      await connection.rollback();
      return rejected(options.command, reasonCodes.MATCH_NOT_FOUND, "Match stream was not found", 0);
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

    const lockedDuplicate = await findDuplicateCommandIdentity(
      connection,
      options.command.matchId,
      options.command.commandId
    );
    if (lockedDuplicate) {
      await connection.rollback();
      if (lockedDuplicate.requestHash !== requestHash(options.command)) {
        return rejected(
          options.command,
          reasonCodes.VALIDATION_ERROR,
          "Command identity was already used with a different request",
          lockedDuplicate.result.currentSeq
        );
      }
      return { ...lockedDuplicate.result, status: "DUPLICATE_ACCEPTED" };
    }

    const previous = await setHeadCoachDesignationForMatch(
      connection,
      options.command.matchId,
      options.command.payload.teamSide,
      options.command.payload.displayName,
      options.command.payload.externalReference ?? null,
      options.user.userId
    );
    const result: CommandResult = {
      status: "ACCEPTED",
      commandId: options.command.commandId,
      matchId: options.command.matchId,
      currentSeq,
      appendedEvents: [],
      reasonCode: null,
      message: null
    };

    await insertAuditLog(connection, {
      entityType: "match_head_coach_designation",
      entityId: previous.designationId,
      action: "SET_MATCH_HEAD_COACH_DESIGNATION",
      actorUserId: options.user.userId,
      actorRole: options.user.role,
      deviceId: options.user.deviceId,
      oldValue: null,
      newValue: previous,
      reason: "Head coach designation set",
      correlationId: options.command.correlationId,
      causationId: null,
      eventSeq: currentSeq
    });
    await insertCommandResult(connection, {
      commandId: options.command.commandId,
      matchId: options.command.matchId,
      commandType: "setup/head-coach-designation",
      requestHash: requestHash(options.command),
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

export async function createMatchAssistantCoachDesignationCommand(options: {
  pool: Pool;
  command: CreateMatchAssistantCoachDesignationCommand;
  user: AuthenticatedUser;
}): Promise<CommandResult> {
  const connection = await options.pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensurePlaceholderUser(connection, options.user);
    const duplicate = await findDuplicateCommandIdentity(connection, options.command.matchId, options.command.commandId);
    if (duplicate) { await connection.rollback(); return duplicate.requestHash === requestHash(options.command as never) ? { ...duplicate.result, status: "DUPLICATE_ACCEPTED" } : rejected(options.command as never, reasonCodes.VALIDATION_ERROR, "Command identity was already used with a different request", duplicate.result.currentSeq); }
    const currentSeq = await lockMatchStream(connection, options.command.matchId);
    if (currentSeq === null) { await connection.rollback(); return rejected(options.command as never, reasonCodes.MATCH_NOT_FOUND, "Match stream was not found", 0); }
    if (currentSeq !== options.command.expectedSeq) { await connection.rollback(); return { status: "SYNC_REQUIRED", commandId: options.command.commandId, matchId: options.command.matchId, currentSeq, appendedEvents: [], reasonCode: reasonCodes.INVALID_EXPECTED_SEQ, message: `Expected seq ${options.command.expectedSeq}, current seq ${currentSeq}` }; }
    const lockedDuplicate = await findDuplicateCommandIdentity(connection, options.command.matchId, options.command.commandId);
    if (lockedDuplicate) { await connection.rollback(); return lockedDuplicate.requestHash === requestHash(options.command as never) ? { ...lockedDuplicate.result, status: "DUPLICATE_ACCEPTED" } : rejected(options.command as never, reasonCodes.VALIDATION_ERROR, "Command identity was already used with a different request", lockedDuplicate.result.currentSeq); }
    const created = await createAssistantCoachDesignationForMatch(connection, options.command.matchId, options.command.payload.teamSide, options.command.payload.displayName, options.command.payload.externalReference ?? null, options.user.userId);
    if (!created) { await connection.rollback(); return rejected(options.command as never, reasonCodes.VALIDATION_ERROR, "ASSISTANT_COACH_DESIGNATION_ALREADY_EXISTS", currentSeq); }
    const result: CommandResult = { status: "ACCEPTED", commandId: options.command.commandId, matchId: options.command.matchId, currentSeq, appendedEvents: [], reasonCode: null, message: null };
    await insertAuditLog(connection, { entityType: "match_assistant_coach_designation", entityId: created.designationId, action: "CREATE_MATCH_ASSISTANT_COACH_DESIGNATION", actorUserId: options.user.userId, actorRole: options.user.role, deviceId: options.user.deviceId, oldValue: null, newValue: created, reason: "Assistant coach designation created", correlationId: options.command.correlationId, causationId: null, eventSeq: currentSeq });
    await insertCommandResult(connection, { commandId: options.command.commandId, matchId: options.command.matchId, commandType: "setup/assistant-coach-designation", requestHash: requestHash(options.command as never), result });
    await connection.commit(); return result;
  } catch (error) { await connection.rollback(); const conflict = await recoverMatchStreamReadConflict({ error, pool: options.pool, command: options.command }); if (conflict) return conflict; throw error; } finally { connection.release(); }
}
