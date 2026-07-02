import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import type {
  CommandResult,
  MatchEventType,
  TimeoutEndCommand,
  TimeoutGrantCommand,
  TimeoutGrantedPayload
} from "@basket-scoreboard/api-contracts";
import { reasonCodes } from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { insertAuditLog } from "./auditRepository.js";
import {
  ensurePlaceholderUser,
  findDuplicateCommand,
  getScoreboardProjection,
  insertCommandResult,
  lockMatchStream,
  updateScoreboardProjection
} from "./repositories.js";
import { applyTimeoutEnded, applyTimeoutGranted, type ScoreboardProjection } from "./projection.js";

type TimeoutCommand = TimeoutGrantCommand | TimeoutEndCommand;
type TimeoutEventType = Extract<MatchEventType, "TIMEOUT_GRANTED" | "TIMEOUT_ENDED">;

function requestHash(command: TimeoutCommand) {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

export function appendTimeoutGrantCommand(options: {
  pool: Pool;
  command: TimeoutGrantCommand;
  user: AuthenticatedUser;
}) {
  return appendTimeoutCommand({
    ...options,
    eventType: "TIMEOUT_GRANTED",
    commandType: "timeout/grant"
  });
}

export function appendTimeoutEndCommand(options: {
  pool: Pool;
  command: TimeoutEndCommand;
  user: AuthenticatedUser;
}) {
  return appendTimeoutCommand({
    ...options,
    eventType: "TIMEOUT_ENDED",
    commandType: "timeout/end"
  });
}

async function appendTimeoutCommand(options: {
  pool: Pool;
  command: TimeoutCommand;
  user: AuthenticatedUser;
  eventType: TimeoutEventType;
  commandType: "timeout/grant" | "timeout/end";
}): Promise<CommandResult> {
  const connection = await options.pool.getConnection();

  try {
    await connection.beginTransaction();
    await ensurePlaceholderUser(connection, options.user);

    const duplicate = await findDuplicateCommand(
      connection,
      options.command.matchId,
      options.command.commandId
    );

    if (duplicate) {
      await connection.rollback();
      return {
        ...duplicate,
        status: "DUPLICATE_ACCEPTED",
        appendedEvents: []
      };
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

    const projection = await getScoreboardProjection(connection, options.command.matchId);

    if (!projection) {
      throw new Error(`Scoreboard projection not found for match ${options.command.matchId}`);
    }

    const validation = validateTimeoutCommand(options.eventType, projection);
    if (!validation.ok) {
      await connection.rollback();
      return rejected(options.command, reasonCodes.VALIDATION_ERROR, validation.message, currentSeq);
    }

    const nextSeq = currentSeq + 1;
    const eventId = randomUUID();
    const serverTime = new Date();
    const payload = buildPayload(options.eventType, options.command, projection, serverTime);

    await connection.query(
      "INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'FIBA_2024')",
      [
        eventId,
        options.command.matchId,
        nextSeq,
        options.eventType,
        JSON.stringify(payload),
        options.user.userId,
        options.user.role,
        options.user.deviceId,
        serverTime,
        options.command.commandId,
        options.command.expectedSeq,
        options.command.correlationId,
        getReason(options.command)
      ]
    );

    await connection.query("UPDATE match_streams SET last_seq_no = ? WHERE match_id = ?", [
      nextSeq,
      options.command.matchId
    ]);

    const updatedProjection =
      options.eventType === "TIMEOUT_GRANTED"
        ? applyTimeoutGranted(
            projection,
            payload as TimeoutGrantedPayload & {
              startedAt: string;
              periodNumber: number;
              gameClockRemainingMs: number | null;
              shotClockRemainingMs: number | null;
            },
            nextSeq
          )
        : applyTimeoutEnded(projection, payload as { reason: string | null; endedAt: string }, nextSeq);

    await updateScoreboardProjection(connection, updatedProjection);
    await insertAuditLog(connection, {
      entityType: "match",
      entityId: options.command.matchId,
      action: options.eventType,
      actorUserId: options.user.userId,
      actorRole: options.user.role,
      deviceId: options.user.deviceId,
      oldValue: projection,
      newValue: updatedProjection,
      reason: getReason(options.command),
      correlationId: options.command.correlationId,
      causationId: eventId,
      eventSeq: nextSeq
    });

    const result: CommandResult = {
      status: "ACCEPTED",
      commandId: options.command.commandId,
      matchId: options.command.matchId,
      currentSeq: nextSeq,
      appendedEvents: [{ eventId, seqNo: nextSeq, eventType: options.eventType }],
      reasonCode: null,
      message: null
    };

    await insertCommandResult(connection, {
      commandId: options.command.commandId,
      matchId: options.command.matchId,
      commandType: options.commandType,
      requestHash: requestHash(options.command),
      result
    });

    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function validateTimeoutCommand(eventType: TimeoutEventType, projection: ScoreboardProjection) {
  if (eventType === "TIMEOUT_GRANTED" && projection.activeTimeout) {
    return { ok: false as const, message: "A timeout is already active" };
  }

  if (eventType === "TIMEOUT_ENDED" && !projection.activeTimeout) {
    return { ok: false as const, message: "No active timeout exists" };
  }

  return { ok: true as const };
}

function buildPayload(
  eventType: TimeoutEventType,
  command: TimeoutCommand,
  projection: ScoreboardProjection,
  serverTime: Date
) {
  const serverTimestamp = serverTime.toISOString();

  if (eventType === "TIMEOUT_GRANTED") {
    const grantCommand = command as TimeoutGrantCommand;
    return {
      teamSide: grantCommand.payload.teamSide,
      requestedBy: grantCommand.payload.requestedBy,
      durationMs: grantCommand.payload.durationMs,
      reason: grantCommand.payload.reason,
      periodNumber: projection.periodNumber || 1,
      gameClockRemainingMs: deriveClockRemainingMs(projection.gameClock, serverTime),
      shotClockRemainingMs: deriveClockRemainingMs(projection.shotClock, serverTime),
      startedAt: serverTimestamp
    };
  }

  return {
    reason: (command as TimeoutEndCommand).payload.reason,
    endedAt: serverTimestamp
  };
}

function deriveClockRemainingMs(
  clock: { remainingMs: number; running: boolean; lastStartedAt: string | null },
  serverTime: Date
) {
  if (!clock.running || !clock.lastStartedAt) {
    return clock.remainingMs;
  }

  const startedAt = Date.parse(clock.lastStartedAt);
  if (!Number.isFinite(startedAt)) {
    return clock.remainingMs;
  }

  return Math.max(0, clock.remainingMs - Math.max(0, serverTime.getTime() - startedAt));
}

function getReason(command: TimeoutCommand) {
  return typeof command.payload.reason === "string" ? command.payload.reason : null;
}

function rejected(
  command: TimeoutCommand,
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
