import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Pool } from "mysql2/promise";
import type { AddScoreCommand, CommandResult, ScoreAddedPayload } from "@basket-scoreboard/api-contracts";
import { reasonCodes } from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { insertAuditLog } from "./auditRepository.js";
import { getActiveRosterPlayerForMatchSide } from "../rosters/rosterRepository.js";
import {
  ensurePlaceholderUser,
  findDuplicateCommand,
  getScoreboardProjection,
  insertCommandResult,
  lockMatchStream,
  updateScoreboardProjection
} from "./repositories.js";
import { applyScoreAdded } from "./projection.js";

function requestHash(command: AddScoreCommand) {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

const finishedMatchLiveControlMessage = "Finished matches cannot be changed through live controls";

export async function appendScoreAddedCommand(options: {
  pool: Pool;
  command: AddScoreCommand;
  user: AuthenticatedUser;
  logger?: {
    info: (payload: Record<string, unknown>, message?: string) => void;
  };
  authRbacMs?: number;
}): Promise<CommandResult> {
  const connection = await options.pool.getConnection();
  const startedAt = performance.now();
  let rosterValidationMs = 0;
  let appendEventMs = 0;
  let projectionUpdateMs = 0;
  let responseSerializationMs = 0;

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

    const nextSeq = currentSeq + 1;
    const eventId = randomUUID();
    const occurredAt = new Date(options.command.clientTimestamp);
    const projection = await getScoreboardProjection(connection, options.command.matchId);

    if (!projection) {
      throw new Error(`Scoreboard projection not found for match ${options.command.matchId}`);
    }

    if (isFinishedMatchStatus(projection.status)) {
      await connection.rollback();
      return rejected(options.command, reasonCodes.VALIDATION_ERROR, finishedMatchLiveControlMessage, currentSeq);
    }

    const rosterValidationStartedAt = performance.now();
    const payload = await buildScoreEventPayload({
      connection,
      command: options.command
    });
    rosterValidationMs = performance.now() - rosterValidationStartedAt;

    if (!payload.ok) {
      await connection.rollback();
      return rejected(options.command, reasonCodes.VALIDATION_ERROR, payload.message, currentSeq);
    }

    const appendEventStartedAt = performance.now();
    await connection.query(
      "INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, 'SCORE_ADDED', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'FIBA_2024')",
      [
        eventId,
        options.command.matchId,
        nextSeq,
        JSON.stringify(payload.value),
        options.user.userId,
        options.user.role,
        options.user.deviceId,
        occurredAt,
        options.command.commandId,
        options.command.expectedSeq,
        options.command.correlationId,
        options.command.payload.note
      ]
    );

    await connection.query("UPDATE match_streams SET last_seq_no = ? WHERE match_id = ?", [
      nextSeq,
      options.command.matchId
    ]);
    appendEventMs = performance.now() - appendEventStartedAt;

    const projectionUpdateStartedAt = performance.now();
    const updatedProjection = applyScoreAdded(projection, payload.value, nextSeq);
    await updateScoreboardProjection(connection, updatedProjection);
    await insertAuditLog(connection, {
      entityType: "match",
      entityId: options.command.matchId,
      action: "SCORE_ADDED",
      actorUserId: options.user.userId,
      actorRole: options.user.role,
      deviceId: options.user.deviceId,
      oldValue: projection,
      newValue: updatedProjection,
      reason: options.command.payload.note,
      correlationId: options.command.correlationId,
      causationId: eventId,
      eventSeq: nextSeq
    });
    projectionUpdateMs = performance.now() - projectionUpdateStartedAt;

    const responseSerializationStartedAt = performance.now();
    const result: CommandResult = {
      status: "ACCEPTED",
      commandId: options.command.commandId,
      matchId: options.command.matchId,
      currentSeq: nextSeq,
      appendedEvents: [{ eventId, seqNo: nextSeq, eventType: "SCORE_ADDED" }],
      reasonCode: null,
      message: null,
      projection: updatedProjection
    };
    responseSerializationMs = performance.now() - responseSerializationStartedAt;

    await insertCommandResult(connection, {
      commandId: options.command.commandId,
      matchId: options.command.matchId,
      commandType: "score/add",
      requestHash: requestHash(options.command),
      result
    });

    await connection.commit();
    logScoreCommandTiming(options, {
      totalMs: performance.now() - startedAt,
      authRbacMs: options.authRbacMs ?? null,
      rosterValidationMs,
      appendEventMs,
      projectionUpdateMs,
      responseSerializationMs
    });
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function logScoreCommandTiming(
  options: {
    command: AddScoreCommand;
    logger?: {
      info: (payload: Record<string, unknown>, message?: string) => void;
    };
  },
  timing: {
    totalMs: number;
    authRbacMs: number | null;
    rosterValidationMs: number;
    appendEventMs: number;
    projectionUpdateMs: number;
    responseSerializationMs: number;
  }
) {
  options.logger?.info(
    {
      route: "POST /api/v1/matches/:matchId/commands/score/add",
      matchId: options.command.matchId,
      commandId: options.command.commandId,
      hasPlayerAttribution: Boolean(options.command.payload.playerId),
      timingMs: {
        total: roundMs(timing.totalMs),
        authRbac: timing.authRbacMs === null ? null : roundMs(timing.authRbacMs),
        rosterValidation: roundMs(timing.rosterValidationMs),
        appendEvent: roundMs(timing.appendEventMs),
        projectionUpdate: roundMs(timing.projectionUpdateMs),
        responseSerialization: roundMs(timing.responseSerializationMs)
      }
    },
    "Score command timing"
  );
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function isFinishedMatchStatus(status: string) {
  const normalized = status.toUpperCase();
  return normalized === "FINISHED" || normalized === "FINAL";
}

async function buildScoreEventPayload(options: {
  connection: Awaited<ReturnType<Pool["getConnection"]>>;
  command: AddScoreCommand;
}): Promise<
  | { ok: true; value: ScoreAddedPayload }
  | { ok: false; message: string }
> {
  if (!options.command.payload.playerId) {
    return { ok: true, value: options.command.payload };
  }

  const player = await getActiveRosterPlayerForMatchSide(
    options.connection,
    options.command.matchId,
    options.command.payload.playerId,
    options.command.payload.teamSide
  );

  if (!player) {
    return {
      ok: false,
      message: "Player was not found on the selected match roster side"
    };
  }

  return {
    ok: true,
    value: {
      ...options.command.payload,
      playerNameSnapshot: player.playerName,
      jerseyNumberSnapshot: player.jerseyNumber
    }
  };
}

function rejected(
  command: AddScoreCommand,
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
