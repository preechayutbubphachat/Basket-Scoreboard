import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import type {
  CommandResult,
  GameClockSetCommand,
  GameClockStartCommand,
  GameClockStopCommand,
  MatchEventType,
  ShotClockResetCommand,
  ShotClockSetCommand
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
import {
  applyGameClockSet,
  applyGameClockStarted,
  applyGameClockStopped,
  applyShotClockReset,
  applyShotClockSet,
  type ScoreboardProjection
} from "./projection.js";

type ClockCommand =
  | GameClockStartCommand
  | GameClockStopCommand
  | GameClockSetCommand
  | ShotClockResetCommand
  | ShotClockSetCommand;

type ClockEventType = Extract<
  MatchEventType,
  "GAME_CLOCK_STARTED" | "GAME_CLOCK_STOPPED" | "GAME_CLOCK_SET" | "SHOT_CLOCK_RESET" | "SHOT_CLOCK_SET"
>;

function requestHash(command: ClockCommand) {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

export function appendGameClockStartCommand(options: {
  pool: Pool;
  command: GameClockStartCommand;
  user: AuthenticatedUser;
}) {
  return appendClockCommand({ ...options, eventType: "GAME_CLOCK_STARTED", commandType: "clock/game/start" });
}

export function appendGameClockStopCommand(options: {
  pool: Pool;
  command: GameClockStopCommand;
  user: AuthenticatedUser;
}) {
  return appendClockCommand({ ...options, eventType: "GAME_CLOCK_STOPPED", commandType: "clock/game/stop" });
}

export function appendGameClockSetCommand(options: {
  pool: Pool;
  command: GameClockSetCommand;
  user: AuthenticatedUser;
}) {
  return appendClockCommand({ ...options, eventType: "GAME_CLOCK_SET", commandType: "clock/game/set" });
}

export function appendShotClockResetCommand(options: {
  pool: Pool;
  command: ShotClockResetCommand;
  user: AuthenticatedUser;
}) {
  return appendClockCommand({ ...options, eventType: "SHOT_CLOCK_RESET", commandType: "clock/shot/reset" });
}

export function appendShotClockSetCommand(options: {
  pool: Pool;
  command: ShotClockSetCommand;
  user: AuthenticatedUser;
}) {
  return appendClockCommand({ ...options, eventType: "SHOT_CLOCK_SET", commandType: "clock/shot/set" });
}

async function appendClockCommand(options: {
  pool: Pool;
  command: ClockCommand;
  user: AuthenticatedUser;
  eventType: ClockEventType;
  commandType:
    | "clock/game/start"
    | "clock/game/stop"
    | "clock/game/set"
    | "clock/shot/reset"
    | "clock/shot/set";
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

    const updatedProjection = applyClockProjection(projection, options.eventType, payload, nextSeq);
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

function buildPayload(
  eventType: ClockEventType,
  command: ClockCommand,
  projection: ScoreboardProjection,
  serverTime: Date
) {
  const serverTimestamp = serverTime.toISOString();

  switch (eventType) {
    case "GAME_CLOCK_STARTED":
      return {
        startedAt: serverTimestamp,
        remainingMsBeforeStart: deriveGameClockRemainingMs(projection, serverTime)
      };
    case "GAME_CLOCK_STOPPED":
      return {
        stoppedAt: serverTimestamp,
        remainingMsAfterStop: deriveGameClockRemainingMs(projection, serverTime)
      };
    case "GAME_CLOCK_SET":
      return {
        remainingMs: (command as GameClockSetCommand).payload.remainingMs,
        reason: (command as GameClockSetCommand).payload.reason,
        setAt: serverTimestamp
      };
    case "SHOT_CLOCK_RESET":
      return {
        resetToMs: (command as ShotClockResetCommand).payload.resetToMs,
        reason: (command as ShotClockResetCommand).payload.reason,
        resetAt: serverTimestamp
      };
    case "SHOT_CLOCK_SET":
      return {
        remainingMs: (command as ShotClockSetCommand).payload.remainingMs,
        reason: (command as ShotClockSetCommand).payload.reason,
        setAt: serverTimestamp
      };
  }
}

function applyClockProjection(
  projection: ScoreboardProjection,
  eventType: ClockEventType,
  payload: ReturnType<typeof buildPayload>,
  seqNo: number
) {
  switch (eventType) {
    case "GAME_CLOCK_STARTED":
      return applyGameClockStarted(
        projection,
        payload as { startedAt: string; remainingMsBeforeStart: number },
        seqNo
      );
    case "GAME_CLOCK_STOPPED":
      return applyGameClockStopped(
        projection,
        payload as { stoppedAt: string; remainingMsAfterStop: number },
        seqNo
      );
    case "GAME_CLOCK_SET":
      return applyGameClockSet(projection, payload as { remainingMs: number; setAt: string }, seqNo);
    case "SHOT_CLOCK_RESET":
      return applyShotClockReset(projection, payload as { resetToMs: 24000 | 14000; resetAt: string }, seqNo);
    case "SHOT_CLOCK_SET":
      return applyShotClockSet(projection, payload as { remainingMs: number; setAt: string }, seqNo);
  }
}

function deriveGameClockRemainingMs(projection: ScoreboardProjection, serverTime: Date) {
  if (!projection.gameClock.running || !projection.gameClock.lastStartedAt) {
    return projection.gameClock.remainingMs;
  }

  const startedAt = Date.parse(projection.gameClock.lastStartedAt);
  if (!Number.isFinite(startedAt)) {
    return projection.gameClock.remainingMs;
  }

  return Math.max(0, projection.gameClock.remainingMs - Math.max(0, serverTime.getTime() - startedAt));
}

function getReason(command: ClockCommand) {
  const payload = command.payload as Partial<{ reason: string | null }>;
  return typeof payload.reason === "string" ? payload.reason : null;
}

function rejected(
  command: ClockCommand,
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
