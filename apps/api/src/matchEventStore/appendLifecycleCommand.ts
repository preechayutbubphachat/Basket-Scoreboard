import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import type { CommandResult, LifecycleCommand, MatchEventType } from "@basket-scoreboard/api-contracts";
import { reasonCodes } from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { insertAuditLog } from "./auditRepository.js";
import {
  ensurePlaceholderUser,
  findDuplicateCommand,
  getScoreboardProjection,
  insertCommandResult,
  lockMatchStream,
  recoverMatchStreamReadConflict,
  updateScoreboardProjection
} from "./repositories.js";
import {
  applyMatchFinished,
  applyMatchStarted,
  applyOvertimeStarted,
  applyPeriodEnded,
  applyPeriodStarted,
  type ScoreboardProjection
} from "./projection.js";

type LifecycleEventType = Extract<
  MatchEventType,
  "MATCH_STARTED" | "PERIOD_ENDED" | "PERIOD_STARTED" | "OVERTIME_STARTED" | "MATCH_FINISHED"
>;

type LifecycleCommandType =
  | "lifecycle/start-match"
  | "lifecycle/end-period"
  | "lifecycle/start-next-period"
  | "lifecycle/start-overtime"
  | "lifecycle/finish-match";

function requestHash(command: LifecycleCommand) {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

export function appendMatchStartedCommand(options: {
  pool: Pool;
  command: LifecycleCommand;
  user: AuthenticatedUser;
}) {
  return appendLifecycleCommand({
    ...options,
    eventType: "MATCH_STARTED",
    commandType: "lifecycle/start-match"
  });
}

export function appendPeriodEndedCommand(options: {
  pool: Pool;
  command: LifecycleCommand;
  user: AuthenticatedUser;
}) {
  return appendLifecycleCommand({
    ...options,
    eventType: "PERIOD_ENDED",
    commandType: "lifecycle/end-period"
  });
}

export function appendPeriodStartedCommand(options: {
  pool: Pool;
  command: LifecycleCommand;
  user: AuthenticatedUser;
}) {
  return appendLifecycleCommand({
    ...options,
    eventType: "PERIOD_STARTED",
    commandType: "lifecycle/start-next-period"
  });
}

export function appendOvertimeStartedCommand(options: {
  pool: Pool;
  command: LifecycleCommand;
  user: AuthenticatedUser;
}) {
  return appendLifecycleCommand({
    ...options,
    eventType: "OVERTIME_STARTED",
    commandType: "lifecycle/start-overtime"
  });
}

export function appendMatchFinishedCommand(options: {
  pool: Pool;
  command: LifecycleCommand;
  user: AuthenticatedUser;
}) {
  return appendLifecycleCommand({
    ...options,
    eventType: "MATCH_FINISHED",
    commandType: "lifecycle/finish-match"
  });
}

async function appendLifecycleCommand(options: {
  pool: Pool;
  command: LifecycleCommand;
  user: AuthenticatedUser;
  eventType: LifecycleEventType;
  commandType: LifecycleCommandType;
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

    const validation = validateLifecycleCommand(options.eventType, projection);
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

    const updatedProjection = applyLifecycleProjection(projection, options.eventType, payload, nextSeq);
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
    const conflict = await recoverMatchStreamReadConflict({ error, pool: options.pool, command: options.command });
    if (conflict) return conflict;
    throw error;
  } finally {
    connection.release();
  }
}

function validateLifecycleCommand(eventType: LifecycleEventType, projection: ScoreboardProjection) {
  if (projection.status === "FINISHED" || projection.status === "FINAL") {
    return { ok: false as const, message: "Match is already finished" };
  }

  switch (eventType) {
    case "MATCH_STARTED":
      return projection.status === "SCHEDULED" || projection.status === "READY"
        ? { ok: true as const }
        : { ok: false as const, message: "Match cannot be started from the current status" };
    case "PERIOD_ENDED":
      return projection.status === "LIVE" || projection.status === "OVERTIME"
        ? { ok: true as const }
        : { ok: false as const, message: "Period can only end while live" };
    case "PERIOD_STARTED":
      if (projection.status !== "PERIOD_BREAK") {
        return { ok: false as const, message: "Next period can only start from a period break" };
      }
      return projection.periodNumber < projection.regulationPeriods
        ? { ok: true as const }
        : { ok: false as const, message: "Regulation periods are complete; use overtime when tied" };
    case "OVERTIME_STARTED":
      if (projection.status !== "PERIOD_BREAK") {
        return { ok: false as const, message: "Overtime can only start from a period break" };
      }
      if (projection.periodNumber < projection.regulationPeriods) {
        return { ok: false as const, message: "Regulation periods are not complete" };
      }
      return projection.homeScore === projection.awayScore
        ? { ok: true as const }
        : { ok: false as const, message: "Overtime requires a tied score" };
    case "MATCH_FINISHED":
      return projection.homeScore !== projection.awayScore
        ? { ok: true as const }
        : { ok: false as const, message: "Tied matches require overtime before finishing" };
  }
}

function buildPayload(
  eventType: LifecycleEventType,
  command: LifecycleCommand,
  projection: ScoreboardProjection,
  serverTime: Date
) {
  const timestamp = serverTime.toISOString();
  const reason = getReason(command);

  switch (eventType) {
    case "MATCH_STARTED":
      return {
        startedAt: timestamp,
        periodNumber: 1,
        periodType: "REGULATION" as const,
        gameClockRemainingMs: projection.periodDurationMs,
        shotClockRemainingMs: 24000,
        reason
      };
    case "PERIOD_ENDED":
      return {
        periodNumber: projection.periodNumber,
        periodType: projection.periodType,
        endedAt: timestamp,
        gameClockRemainingMs: 0,
        shotClockRemainingMs: deriveClockRemainingMs(projection.shotClock, serverTime),
        reason
      };
    case "PERIOD_STARTED":
      return {
        periodNumber: projection.periodNumber + 1,
        periodType: "REGULATION" as const,
        startedAt: timestamp,
        gameClockRemainingMs: projection.periodDurationMs,
        shotClockRemainingMs: 24000,
        reason
      };
    case "OVERTIME_STARTED":
      return {
        periodNumber: projection.periodNumber + 1,
        periodType: "OVERTIME" as const,
        startedAt: timestamp,
        gameClockRemainingMs: projection.overtimeDurationMs,
        shotClockRemainingMs: 24000,
        reason
      };
    case "MATCH_FINISHED":
      return {
        finishedAt: timestamp,
        finalHomeScore: projection.homeScore,
        finalAwayScore: projection.awayScore,
        winnerSide: projection.homeScore > projection.awayScore ? "HOME" as const : "AWAY" as const,
        reason
      };
  }
}

function applyLifecycleProjection(
  projection: ScoreboardProjection,
  eventType: LifecycleEventType,
  payload: ReturnType<typeof buildPayload>,
  seqNo: number
) {
  switch (eventType) {
    case "MATCH_STARTED":
      return applyMatchStarted(projection, payload as Parameters<typeof applyMatchStarted>[1], seqNo);
    case "PERIOD_ENDED":
      return applyPeriodEnded(projection, payload as Parameters<typeof applyPeriodEnded>[1], seqNo);
    case "PERIOD_STARTED":
      return applyPeriodStarted(projection, payload as Parameters<typeof applyPeriodStarted>[1], seqNo);
    case "OVERTIME_STARTED":
      return applyOvertimeStarted(projection, payload as Parameters<typeof applyOvertimeStarted>[1], seqNo);
    case "MATCH_FINISHED":
      return applyMatchFinished(projection, payload as Parameters<typeof applyMatchFinished>[1], seqNo);
  }
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

function getReason(command: LifecycleCommand) {
  return typeof command.payload.reason === "string" ? command.payload.reason : null;
}

function rejected(
  command: LifecycleCommand,
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
