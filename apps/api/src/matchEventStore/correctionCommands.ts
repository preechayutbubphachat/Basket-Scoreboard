import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolConnection } from "mysql2/promise";
import type {
  ApplyScoreCorrectionCommand,
  CommandResult,
  CorrectionRequestCommand,
  MatchEventType,
  RejectCorrectionCommand,
  ScoreAddedPayload
} from "@basket-scoreboard/api-contracts";
import { reasonCodes } from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { insertAuditLog } from "./auditRepository.js";
import {
  ensurePlaceholderUser,
  findDuplicateCommand,
  getMatchEventBySeq,
  getScoreboardProjection,
  insertCommandResult,
  listMatchEvents,
  lockMatchStream,
  updateScoreboardProjection
} from "./repositories.js";
import {
  advanceProjectionSeq,
  applyScoreAdded,
  applyScoreRemovedByCorrection,
  type ScoreboardProjection
} from "./projection.js";

type CorrectionCommand =
  | CorrectionRequestCommand
  | ApplyScoreCorrectionCommand
  | RejectCorrectionCommand;

type AppendedEvent = CommandResult["appendedEvents"][number];

function requestHash(command: CorrectionCommand) {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

function rejected(
  command: CorrectionCommand,
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

function syncRequired(command: CorrectionCommand, currentSeq: number): CommandResult {
  return {
    status: "SYNC_REQUIRED",
    commandId: command.commandId,
    matchId: command.matchId,
    currentSeq,
    appendedEvents: [],
    reasonCode: reasonCodes.INVALID_EXPECTED_SEQ,
    message: `Expected seq ${command.expectedSeq}, current seq ${currentSeq}`
  };
}

function isScorePayload(payload: unknown): payload is ScoreAddedPayload {
  const candidate = payload as ScoreAddedPayload;

  return (
    (candidate?.teamSide === "HOME" || candidate?.teamSide === "AWAY") &&
    (candidate.points === 1 || candidate.points === 2 || candidate.points === 3)
  );
}

async function appendMatchEvent(
  connection: PoolConnection,
  options: {
    eventId: string;
    matchId: string;
    seqNo: number;
    eventType: MatchEventType;
    payload: unknown;
    user: AuthenticatedUser;
    occurredAt: Date;
    commandId: string;
    expectedSeq: number;
    correlationId: string;
    causationId: string | null;
    reason: string | null;
  }
): Promise<AppendedEvent> {
  await connection.query(
    "INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FIBA_2024')",
    [
      options.eventId,
      options.matchId,
      options.seqNo,
      options.eventType,
      JSON.stringify(options.payload),
      options.user.userId,
      options.user.role,
      options.user.deviceId,
      options.occurredAt,
      options.commandId,
      options.expectedSeq,
      options.correlationId,
      options.causationId,
      options.reason
    ]
  );

  return {
    eventId: options.eventId,
    seqNo: options.seqNo,
    eventType: options.eventType
  };
}

async function updateStreamSeq(connection: PoolConnection, matchId: string, seqNo: number) {
  await connection.query("UPDATE match_streams SET last_seq_no = ? WHERE match_id = ?", [
    seqNo,
    matchId
  ]);
}

async function getProjectionOrThrow(connection: PoolConnection, matchId: string) {
  const projection = await getScoreboardProjection(connection, matchId);

  if (!projection) {
    throw new Error(`Scoreboard projection not found for match ${matchId}`);
  }

  return projection;
}

async function findCorrectionFinalEvent(
  connection: PoolConnection,
  matchId: string,
  correctionRequestSeq: number
) {
  const events = await listMatchEvents(connection, matchId);

  return events.find((event) => {
    if (event.eventType !== "CORRECTION_APPLIED" && event.eventType !== "CORRECTION_REJECTED") {
      return false;
    }

    return (event.payload as { correctionRequestSeq?: number }).correctionRequestSeq === correctionRequestSeq;
  });
}

async function runCorrectionTransaction(
  pool: Pool,
  command: CorrectionCommand,
  commandType: string,
  user: AuthenticatedUser,
  handler: (connection: PoolConnection, currentSeq: number) => Promise<CommandResult>
) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await ensurePlaceholderUser(connection, user);

    const duplicate = await findDuplicateCommand(connection, command.matchId, command.commandId);

    if (duplicate) {
      await connection.rollback();
      return {
        ...duplicate,
        status: "DUPLICATE_ACCEPTED",
        appendedEvents: []
      };
    }

    const currentSeq = await lockMatchStream(connection, command.matchId);

    if (currentSeq === null) {
      await connection.rollback();
      return rejected(command, reasonCodes.MATCH_NOT_FOUND, "Match stream was not found", 0);
    }

    if (currentSeq !== command.expectedSeq) {
      await connection.rollback();
      return syncRequired(command, currentSeq);
    }

    const result = await handler(connection, currentSeq);

    if (result.status === "ACCEPTED") {
      await insertCommandResult(connection, {
        commandId: command.commandId,
        matchId: command.matchId,
        commandType,
        requestHash: requestHash(command),
        result
      });
    }

    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function requestScoreCorrection(options: {
  pool: Pool;
  command: CorrectionRequestCommand;
  user: AuthenticatedUser;
}) {
  return runCorrectionTransaction(
    options.pool,
    options.command,
    "corrections/request",
    options.user,
    async (connection, currentSeq) => {
      const targetEvent = await getMatchEventBySeq(
        connection,
        options.command.matchId,
        options.command.payload.targetSeq
      );

      if (!targetEvent) {
        return rejected(
          options.command,
          reasonCodes.MATCH_NOT_FOUND,
          "Correction target event was not found",
          currentSeq
        );
      }

      if (targetEvent.eventType !== "SCORE_ADDED") {
        return rejected(
          options.command,
          reasonCodes.FORBIDDEN,
          "Only SCORE_ADDED events are correctable in this workflow",
          currentSeq
        );
      }

      const nextSeq = currentSeq + 1;
      const eventId = randomUUID();
      const payload = {
        targetSeq: targetEvent.seqNo,
        targetEventId: targetEvent.eventId,
        correctionType: options.command.payload.correctionType,
        reason: options.command.payload.reason,
        note: options.command.payload.note
      };
      const appendedEvent = await appendMatchEvent(connection, {
        eventId,
        matchId: options.command.matchId,
        seqNo: nextSeq,
        eventType: "CORRECTION_REQUESTED",
        payload,
        user: options.user,
        occurredAt: new Date(options.command.clientTimestamp),
        commandId: options.command.commandId,
        expectedSeq: options.command.expectedSeq,
        correlationId: options.command.correlationId,
        causationId: targetEvent.eventId,
        reason: options.command.payload.reason
      });

      await updateStreamSeq(connection, options.command.matchId, nextSeq);
      const projection = await getProjectionOrThrow(connection, options.command.matchId);
      const updatedProjection = advanceProjectionSeq(projection, nextSeq);
      await updateScoreboardProjection(connection, updatedProjection);
      await insertAuditLog(connection, {
        entityType: "match",
        entityId: options.command.matchId,
        action: "CORRECTION_REQUESTED",
        actorUserId: options.user.userId,
        actorRole: options.user.role,
        deviceId: options.user.deviceId,
        oldValue: { targetEvent },
        newValue: payload,
        reason: options.command.payload.reason,
        correlationId: options.command.correlationId,
        causationId: eventId,
        eventSeq: nextSeq
      });

      return {
        status: "ACCEPTED",
        commandId: options.command.commandId,
        matchId: options.command.matchId,
        currentSeq: nextSeq,
        appendedEvents: [appendedEvent],
        reasonCode: null,
        message: null
      };
    }
  );
}

export async function applyScoreCorrection(options: {
  pool: Pool;
  command: ApplyScoreCorrectionCommand;
  user: AuthenticatedUser;
}) {
  return runCorrectionTransaction(
    options.pool,
    options.command,
    "corrections/apply-score",
    options.user,
    async (connection, currentSeq) => {
      const correctionRequest = await getMatchEventBySeq(
        connection,
        options.command.matchId,
        options.command.payload.correctionRequestSeq
      );

      if (!correctionRequest || correctionRequest.eventType !== "CORRECTION_REQUESTED") {
        return rejected(
          options.command,
          reasonCodes.MATCH_NOT_FOUND,
          "Correction request event was not found",
          currentSeq
        );
      }

      const requestPayload = correctionRequest.payload as { targetSeq?: number };

      if (requestPayload.targetSeq !== options.command.payload.targetSeq) {
        return rejected(
          options.command,
          reasonCodes.VALIDATION_ERROR,
          "Correction request target does not match apply command target",
          currentSeq
        );
      }

      const originalEvent = await getMatchEventBySeq(
        connection,
        options.command.matchId,
        options.command.payload.targetSeq
      );

      if (!originalEvent || originalEvent.eventType !== "SCORE_ADDED" || !isScorePayload(originalEvent.payload)) {
        return rejected(
          options.command,
          reasonCodes.MATCH_NOT_FOUND,
          "Original SCORE_ADDED event was not found",
          currentSeq
        );
      }

      const finalEvent = await findCorrectionFinalEvent(
        connection,
        options.command.matchId,
        options.command.payload.correctionRequestSeq
      );

      if (finalEvent) {
        return rejected(
          options.command,
          reasonCodes.DUPLICATE_COMMAND,
          "Correction request was already finalized",
          currentSeq
        );
      }

      let seqNo = currentSeq;
      const appendedEvents: AppendedEvent[] = [];
      const oldProjection = await getProjectionOrThrow(connection, options.command.matchId);
      let projection: ScoreboardProjection = oldProjection;
      let removalEventId: string | null = null;
      let replacementEventId: string | null = null;

      if (options.command.payload.removeOriginalScore) {
        seqNo += 1;
        removalEventId = randomUUID();
        const removalPayload = {
          correctionRequestSeq: correctionRequest.seqNo,
          originalScoreEventId: originalEvent.eventId,
          originalScoreSeq: originalEvent.seqNo,
          teamSide: originalEvent.payload.teamSide,
          points: originalEvent.payload.points,
          reason: options.command.payload.reason
        };
        appendedEvents.push(
          await appendMatchEvent(connection, {
            eventId: removalEventId,
            matchId: options.command.matchId,
            seqNo,
            eventType: "SCORE_REMOVED_BY_CORRECTION",
            payload: removalPayload,
            user: options.user,
            occurredAt: new Date(options.command.clientTimestamp),
            commandId: randomUUID(),
            expectedSeq: options.command.expectedSeq,
            correlationId: options.command.correlationId,
            causationId: originalEvent.eventId,
            reason: options.command.payload.reason
          })
        );
        projection = applyScoreRemovedByCorrection(projection, originalEvent.payload, seqNo);
      }

      if (options.command.payload.replacement) {
        seqNo += 1;
        replacementEventId = randomUUID();
        appendedEvents.push(
          await appendMatchEvent(connection, {
            eventId: replacementEventId,
            matchId: options.command.matchId,
            seqNo,
            eventType: "SCORE_ADDED",
            payload: options.command.payload.replacement,
            user: options.user,
            occurredAt: new Date(options.command.clientTimestamp),
            commandId: randomUUID(),
            expectedSeq: options.command.expectedSeq,
            correlationId: options.command.correlationId,
            causationId: removalEventId ?? originalEvent.eventId,
            reason: options.command.payload.replacement.note
          })
        );
        projection = applyScoreAdded(projection, options.command.payload.replacement, seqNo);
      }

      seqNo += 1;
      const appliedEventId = randomUUID();
      const appliedPayload = {
        correctionRequestSeq: correctionRequest.seqNo,
        correctionRequestEventId: correctionRequest.eventId,
        targetSeq: originalEvent.seqNo,
        reason: options.command.payload.reason,
        removedOriginalScore: options.command.payload.removeOriginalScore,
        replacementEventId
      };
      appendedEvents.push(
        await appendMatchEvent(connection, {
          eventId: appliedEventId,
          matchId: options.command.matchId,
          seqNo,
          eventType: "CORRECTION_APPLIED",
          payload: appliedPayload,
          user: options.user,
          occurredAt: new Date(options.command.clientTimestamp),
          commandId: options.command.commandId,
          expectedSeq: options.command.expectedSeq,
          correlationId: options.command.correlationId,
          causationId: correctionRequest.eventId,
          reason: options.command.payload.reason
        })
      );
      projection = advanceProjectionSeq(projection, seqNo);

      await updateStreamSeq(connection, options.command.matchId, seqNo);
      await updateScoreboardProjection(connection, projection);
      await insertAuditLog(connection, {
        entityType: "match",
        entityId: options.command.matchId,
        action: "CORRECTION_APPLIED",
        actorUserId: options.user.userId,
        actorRole: options.user.role,
        deviceId: options.user.deviceId,
        oldValue: { projection: oldProjection, originalEvent, correctionRequest },
        newValue: { projection, appendedEvents },
        reason: options.command.payload.reason,
        correlationId: options.command.correlationId,
        causationId: appliedEventId,
        eventSeq: seqNo
      });

      return {
        status: "ACCEPTED",
        commandId: options.command.commandId,
        matchId: options.command.matchId,
        currentSeq: seqNo,
        appendedEvents,
        reasonCode: null,
        message: null
      };
    }
  );
}

export async function rejectScoreCorrection(options: {
  pool: Pool;
  command: RejectCorrectionCommand;
  user: AuthenticatedUser;
}) {
  return runCorrectionTransaction(
    options.pool,
    options.command,
    "corrections/reject",
    options.user,
    async (connection, currentSeq) => {
      const correctionRequest = await getMatchEventBySeq(
        connection,
        options.command.matchId,
        options.command.payload.correctionRequestSeq
      );

      if (!correctionRequest || correctionRequest.eventType !== "CORRECTION_REQUESTED") {
        return rejected(
          options.command,
          reasonCodes.MATCH_NOT_FOUND,
          "Correction request event was not found",
          currentSeq
        );
      }

      const finalEvent = await findCorrectionFinalEvent(
        connection,
        options.command.matchId,
        options.command.payload.correctionRequestSeq
      );

      if (finalEvent) {
        return rejected(
          options.command,
          reasonCodes.DUPLICATE_COMMAND,
          "Correction request was already finalized",
          currentSeq
        );
      }

      const nextSeq = currentSeq + 1;
      const eventId = randomUUID();
      const payload = {
        correctionRequestSeq: correctionRequest.seqNo,
        correctionRequestEventId: correctionRequest.eventId,
        reason: options.command.payload.reason
      };
      const appendedEvent = await appendMatchEvent(connection, {
        eventId,
        matchId: options.command.matchId,
        seqNo: nextSeq,
        eventType: "CORRECTION_REJECTED",
        payload,
        user: options.user,
        occurredAt: new Date(options.command.clientTimestamp),
        commandId: options.command.commandId,
        expectedSeq: options.command.expectedSeq,
        correlationId: options.command.correlationId,
        causationId: correctionRequest.eventId,
        reason: options.command.payload.reason
      });

      const projection = await getProjectionOrThrow(connection, options.command.matchId);
      const updatedProjection = advanceProjectionSeq(projection, nextSeq);
      await updateStreamSeq(connection, options.command.matchId, nextSeq);
      await updateScoreboardProjection(connection, updatedProjection);
      await insertAuditLog(connection, {
        entityType: "match",
        entityId: options.command.matchId,
        action: "CORRECTION_REJECTED",
        actorUserId: options.user.userId,
        actorRole: options.user.role,
        deviceId: options.user.deviceId,
        oldValue: { correctionRequest },
        newValue: payload,
        reason: options.command.payload.reason,
        correlationId: options.command.correlationId,
        causationId: eventId,
        eventSeq: nextSeq
      });

      return {
        status: "ACCEPTED",
        commandId: options.command.commandId,
        matchId: options.command.matchId,
        currentSeq: nextSeq,
        appendedEvents: [appendedEvent],
        reasonCode: null,
        message: null
      };
    }
  );
}

export async function listCorrectionsForMatch(pool: Pool, matchId: string) {
  const connection = await pool.getConnection();

  try {
    const events = await listMatchEvents(connection, matchId);
    const requests = events.filter((event) => event.eventType === "CORRECTION_REQUESTED");

    return requests.map((request) => {
      const finalEvent = events.find((event) => {
        if (event.eventType !== "CORRECTION_APPLIED" && event.eventType !== "CORRECTION_REJECTED") {
          return false;
        }

        return (event.payload as { correctionRequestSeq?: number }).correctionRequestSeq === request.seqNo;
      });
      const requestPayload = request.payload as {
        targetSeq: number;
        correctionType: string;
        reason: string;
        note: string | null;
      };

      return {
        correctionRequestSeq: request.seqNo,
        correctionRequestEventId: request.eventId,
        targetSeq: requestPayload.targetSeq,
        correctionType: requestPayload.correctionType,
        status:
          finalEvent?.eventType === "CORRECTION_APPLIED"
            ? "APPLIED"
            : finalEvent?.eventType === "CORRECTION_REJECTED"
              ? "REJECTED"
              : "PENDING",
        reason: requestPayload.reason,
        note: requestPayload.note,
        finalizedSeq: finalEvent?.seqNo ?? null
      };
    });
  } finally {
    connection.release();
  }
}
