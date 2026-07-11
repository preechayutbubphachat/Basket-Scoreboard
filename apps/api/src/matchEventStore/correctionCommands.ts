import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolConnection } from "mysql2/promise";
import type {
  AlphaCorrectionCommand,
  AlphaCorrectionKind,
  ApplyScoreCorrectionCommand,
  CommandResult,
  CorrectionEligibleEvent,
  CorrectionEligibleEventsResponse,
  AlphaCorrectionResponse,
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
  getScoreboardProjectionView,
  getScoreboardProjection,
  insertCommandResult,
  listMatchEvents,
  lockMatchStream,
  recoverMatchStreamReadConflict,
  updateScoreboardProjection,
  type MatchEventRecord
} from "./repositories.js";
import {
  advanceProjectionSeq,
  applyGameClockCorrected,
  applyPlayerFoulCorrected,
  applyScoreAdded,
  applyScoreCorrected,
  applyScoreRemovedByCorrection,
  applyShotClockCorrected,
  applyTeamFoulCorrected,
  applyTimeoutCorrected,
  type ScoreboardProjection
} from "./projection.js";

type CorrectionCommand =
  | CorrectionRequestCommand
  | ApplyScoreCorrectionCommand
  | RejectCorrectionCommand
  | AlphaCorrectionCommand;

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

async function runCorrectionTransaction<T extends CommandResult = CommandResult>(
  pool: Pool,
  command: CorrectionCommand,
  commandType: string,
  user: AuthenticatedUser,
  handler: (connection: PoolConnection, currentSeq: number) => Promise<T>
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
      } satisfies CommandResult;
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
    const conflict = await recoverMatchStreamReadConflict({ error, pool, command });
    if (conflict) return conflict as T;
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

export async function listEligibleCorrectionEvents(options: {
  pool: Pool;
  matchId: string;
  limit: number;
  eventTypes?: string[] | undefined;
}): Promise<CorrectionEligibleEventsResponse | null> {
  const connection = await options.pool.getConnection();

  try {
    const projection = await getScoreboardProjectionView(connection, options.matchId);
    if (!projection) {
      return null;
    }

    const events = await listMatchEvents(connection, options.matchId);
    const correctedKeys = new Set(
      events
        .map((event) => event.payload as { correctedEventSeq?: unknown; correctionKind?: unknown })
        .filter((payload) => Number.isInteger(payload.correctedEventSeq) && typeof payload.correctionKind === "string")
        .map((payload) => `${payload.correctedEventSeq}:${payload.correctionKind}`)
    );
    const eventTypeFilter = options.eventTypes && options.eventTypes.length > 0
      ? new Set(options.eventTypes)
      : null;
    const eligibleEvents = events
      .filter((event) => !eventTypeFilter || eventTypeFilter.has(event.eventType))
      .map((event) => toEligibleCorrectionEvent(event, correctedKeys))
      .filter((event) => event.eligible)
      .sort((left, right) => right.seqNo - left.seqNo)
      .slice(0, options.limit);

    return {
      matchId: options.matchId,
      currentSeq: projection.currentSeq,
      events: eligibleEvents
    };
  } finally {
    connection.release();
  }
}

export async function appendAlphaCorrection(options: {
  pool: Pool;
  command: AlphaCorrectionCommand;
  user: AuthenticatedUser;
}): Promise<(AlphaCorrectionResponse & CommandResult) | CommandResult> {
  return runCorrectionTransaction(
    options.pool,
    options.command,
    "corrections/alpha-undo",
    options.user,
    async (connection, currentSeq) => {
      const targetEvent = await getMatchEventBySeq(
        connection,
        options.command.matchId,
        options.command.correctedEventSeq
      );

      if (!targetEvent) {
        return rejected(
          options.command,
          reasonCodes.MATCH_NOT_FOUND,
          "Correction target event was not found",
          currentSeq
        );
      }

      const expectedKind = correctionKindForEvent(targetEvent);
      if (!expectedKind || expectedKind !== options.command.correctionKind) {
        return rejected(
          options.command,
          reasonCodes.VALIDATION_ERROR,
          "This event is not eligible for the requested correction",
          currentSeq
        );
      }

      const events = await listMatchEvents(connection, options.command.matchId);
      if (hasDuplicateCorrection(events, options.command.correctedEventSeq, options.command.correctionKind)) {
        return rejected(
          options.command,
          reasonCodes.DUPLICATE_COMMAND,
          "This event has already been corrected",
          currentSeq
        );
      }

      const projection = await getProjectionOrThrow(connection, options.command.matchId);
      const correction = buildCorrectionEventPayload({
        command: options.command,
        targetEvent,
        projection,
        user: options.user
      });

      if (!correction) {
        return rejected(
          options.command,
          reasonCodes.VALIDATION_ERROR,
          "Correction payload could not be derived safely",
          currentSeq
        );
      }

      const nextSeq = currentSeq + 1;
      const eventId = randomUUID();
      const appendedEvent = await appendMatchEvent(connection, {
        eventId,
        matchId: options.command.matchId,
        seqNo: nextSeq,
        eventType: correction.eventType,
        payload: correction.payload,
        user: options.user,
        occurredAt: new Date(options.command.clientTimestamp),
        commandId: options.command.commandId,
        expectedSeq: options.command.expectedSeq,
        correlationId: options.command.correlationId,
        causationId: targetEvent.eventId,
        reason: options.command.reason
      });
      const updatedProjection = applyAlphaCorrectionProjection(
        projection,
        correction.eventType,
        correction.payload,
        nextSeq
      );

      await updateStreamSeq(connection, options.command.matchId, nextSeq);
      await updateScoreboardProjection(connection, updatedProjection);
      await insertAuditLog(connection, {
        entityType: "match",
        entityId: options.command.matchId,
        action: correction.eventType,
        actorUserId: options.user.userId,
        actorRole: options.user.role,
        deviceId: options.user.deviceId,
        oldValue: correction.payload.oldValue,
        newValue: correction.payload.newValue,
        reason: options.command.reason,
        correlationId: options.command.correlationId,
        causationId: eventId,
        eventSeq: nextSeq
      });

      const result: AlphaCorrectionResponse & CommandResult = {
        ok: true,
        matchId: options.command.matchId,
        seqNo: nextSeq,
        eventType: correction.eventType,
        projection: updatedProjection,
        status: "ACCEPTED",
        commandId: options.command.commandId,
        currentSeq: nextSeq,
        appendedEvents: [appendedEvent],
        reasonCode: null,
        message: null
      };

      return result;
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

function toEligibleCorrectionEvent(
  event: MatchEventRecord,
  correctedKeys: Set<string>
): CorrectionEligibleEvent {
  const correctionKind = correctionKindForEvent(event) ?? "SCORE_UNDO";
  const alreadyCorrected = correctedKeys.has(`${event.seqNo}:${correctionKind}`);
  const eligible = Boolean(correctionKindForEvent(event)) && !alreadyCorrected;
  const payload = payloadRecord(event.payload);

  return {
    seqNo: event.seqNo,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    actorDisplayName: null,
    summary: summarizeCorrectionTarget(event),
    eligible,
    ineligibleReason: eligible
      ? null
      : alreadyCorrected
        ? "This event has already been corrected."
        : "This event is not eligible for Alpha correction.",
    correctionKind,
    currentValue: payload,
    proposedCompensation: buildProposedCompensation(event, correctionKind)
  };
}

function correctionKindForEvent(event: MatchEventRecord): AlphaCorrectionKind | null {
  switch (event.eventType) {
    case "SCORE_ADDED":
      return "SCORE_UNDO";
    case "TEAM_FOUL_ADDED":
      return "TEAM_FOUL_UNDO";
    case "PLAYER_FOUL_ADDED":
      return "PLAYER_FOUL_UNDO";
    case "TIMEOUT_GRANTED":
    case "TIMEOUT_ENDED":
      return "TIMEOUT_UNDO";
    case "GAME_CLOCK_SET":
      return "GAME_CLOCK_SET_CORRECTION";
    case "SHOT_CLOCK_SET":
    case "SHOT_CLOCK_RESET":
      return "SHOT_CLOCK_SET_CORRECTION";
    default:
      return null;
  }
}

function hasDuplicateCorrection(
  events: MatchEventRecord[],
  correctedEventSeq: number,
  correctionKind: AlphaCorrectionKind
) {
  return events.some((event) => {
    const payload = payloadRecord(event.payload);
    return payload.correctedEventSeq === correctedEventSeq && payload.correctionKind === correctionKind;
  });
}

function buildCorrectionEventPayload(options: {
  command: AlphaCorrectionCommand;
  targetEvent: MatchEventRecord;
  projection: ScoreboardProjection;
  user: AuthenticatedUser;
}): { eventType: MatchEventType; payload: Record<string, unknown> } | null {
  const targetPayload = payloadRecord(options.targetEvent.payload);
  const common = {
    correctedEventSeq: options.targetEvent.seqNo,
    correctedEventType: options.targetEvent.eventType,
    correctionKind: options.command.correctionKind,
    reason: options.command.reason,
    actorId: options.user.userId,
    actorRole: options.user.role,
    deviceId: options.user.deviceId,
    correlationId: options.command.correlationId,
    causationId: options.targetEvent.eventId,
    createdAt: options.command.clientTimestamp
  };

  switch (options.command.correctionKind) {
    case "SCORE_UNDO": {
      const teamSide = parseTeamSide(targetPayload.teamSide);
      const points = numberOrDefault(targetPayload.points, 0);
      if (!teamSide || points <= 0) return null;
      return {
        eventType: "SCORE_CORRECTED",
        payload: {
          ...common,
          oldValue: { teamSide, points },
          newValue: { teamSide, points: 0 },
          delta: { teamSide, points: -points }
        }
      };
    }
    case "TEAM_FOUL_UNDO": {
      const teamSide = parseTeamSide(targetPayload.teamSide);
      if (!teamSide) return null;
      return {
        eventType: "TEAM_FOUL_CORRECTED",
        payload: {
          ...common,
          oldValue: { teamSide, periodNumber: numberOrNull(targetPayload.periodNumber), fouls: 1 },
          newValue: { teamSide, fouls: 0 },
          delta: { teamSide, fouls: -1 }
        }
      };
    }
    case "PLAYER_FOUL_UNDO": {
      const teamSide = parseTeamSide(targetPayload.teamSide);
      const playerId = stringOrNull(targetPayload.playerId);
      if (!teamSide || !playerId) return null;
      return {
        eventType: "PLAYER_FOUL_CORRECTED",
        payload: {
          ...common,
          oldValue: {
            teamSide,
            playerId,
            playerName: stringOrNull(targetPayload.playerName),
            jerseyNumber: stringOrNull(targetPayload.jerseyNumber),
            periodNumber: numberOrNull(targetPayload.periodNumber),
            fouls: 1
          },
          newValue: { teamSide, playerId, fouls: 0 },
          delta: { teamSide, playerId, fouls: -1 }
        }
      };
    }
    case "TIMEOUT_UNDO": {
      const teamSide = parseTeamSide(targetPayload.teamSide);
      return {
        eventType: "TIMEOUT_CORRECTED",
        payload: {
          ...common,
          oldValue: {
            teamSide,
            activeTimeout: options.projection.activeTimeout,
            periodNumber: numberOrNull(targetPayload.periodNumber)
          },
          newValue: { teamSide, activeTimeout: null },
          delta: teamSide ? { teamSide, timeoutsUsed: -1 } : null
        }
      };
    }
    case "GAME_CLOCK_SET_CORRECTION": {
      const newValue = payloadRecord(options.command.payload.newValue);
      const remainingMs = numberOrDefault(newValue.remainingMs, options.projection.gameClock.remainingMs);
      return {
        eventType: "GAME_CLOCK_CORRECTED",
        payload: {
          ...common,
          oldValue: { ...options.projection.gameClock },
          newValue: {
            remainingMs,
            running: newValue.running === true
          },
          delta: null
        }
      };
    }
    case "SHOT_CLOCK_SET_CORRECTION": {
      const newValue = payloadRecord(options.command.payload.newValue);
      const remainingMs = numberOrDefault(newValue.remainingMs, options.projection.shotClock.remainingMs);
      return {
        eventType: "SHOT_CLOCK_CORRECTED",
        payload: {
          ...common,
          oldValue: { ...options.projection.shotClock },
          newValue: {
            remainingMs,
            running: newValue.running === true
          },
          delta: null
        }
      };
    }
  }
}

function applyAlphaCorrectionProjection(
  projection: ScoreboardProjection,
  eventType: MatchEventType,
  payload: Record<string, unknown>,
  seqNo: number
): ScoreboardProjection {
  const oldValue = payloadRecord(payload.oldValue);
  const newValue = payloadRecord(payload.newValue);

  switch (eventType) {
    case "SCORE_CORRECTED":
      return applyScoreCorrected(projection, {
        teamSide: parseTeamSide(oldValue.teamSide) ?? "HOME",
        points: numberOrDefault(oldValue.points, 0) as 1 | 2 | 3
      }, seqNo);
    case "TEAM_FOUL_CORRECTED":
      return applyTeamFoulCorrected(projection, {
        teamSide: parseTeamSide(oldValue.teamSide) ?? "HOME",
        periodNumber: numberOrNull(oldValue.periodNumber)
      }, seqNo);
    case "PLAYER_FOUL_CORRECTED":
      return applyPlayerFoulCorrected(projection, {
        teamSide: parseTeamSide(oldValue.teamSide) ?? "HOME",
        playerId: stringOrNull(oldValue.playerId) ?? "",
        periodNumber: numberOrNull(oldValue.periodNumber)
      }, seqNo);
    case "TIMEOUT_CORRECTED":
      return applyTimeoutCorrected(projection, {
        teamSide: parseTeamSide(oldValue.teamSide),
        periodNumber: numberOrNull(oldValue.periodNumber)
      }, seqNo);
    case "GAME_CLOCK_CORRECTED":
      return applyGameClockCorrected(projection, {
        remainingMs: numberOrDefault(newValue.remainingMs, projection.gameClock.remainingMs),
        running: newValue.running === true,
        correctedAt: stringOrNull(payload.createdAt) ?? new Date().toISOString()
      }, seqNo);
    case "SHOT_CLOCK_CORRECTED":
      return applyShotClockCorrected(projection, {
        remainingMs: numberOrDefault(newValue.remainingMs, projection.shotClock.remainingMs),
        running: newValue.running === true,
        correctedAt: stringOrNull(payload.createdAt) ?? new Date().toISOString()
      }, seqNo);
    default:
      return advanceProjectionSeq(projection, seqNo);
  }
}

function summarizeCorrectionTarget(event: MatchEventRecord) {
  const payload = payloadRecord(event.payload);
  const teamSide = stringOrNull(payload.teamSide) ?? "Team";

  switch (event.eventType) {
    case "SCORE_ADDED":
      return `${teamSide} +${numberOrDefault(payload.points, 0)}`;
    case "TEAM_FOUL_ADDED":
      return `${teamSide} team foul`;
    case "PLAYER_FOUL_ADDED":
      return `${teamSide} player foul`;
    case "TIMEOUT_GRANTED":
      return `${teamSide} timeout granted`;
    case "TIMEOUT_ENDED":
      return "Timeout ended";
    case "GAME_CLOCK_SET":
      return "Game clock set";
    case "SHOT_CLOCK_RESET":
      return "Shot clock reset";
    case "SHOT_CLOCK_SET":
      return "Shot clock set";
    default:
      return event.eventType;
  }
}

function buildProposedCompensation(event: MatchEventRecord, correctionKind: AlphaCorrectionKind) {
  const payload = payloadRecord(event.payload);
  switch (correctionKind) {
    case "SCORE_UNDO":
      return { teamSide: payload.teamSide, points: -numberOrDefault(payload.points, 0) };
    case "TEAM_FOUL_UNDO":
    case "PLAYER_FOUL_UNDO":
      return { teamSide: payload.teamSide, fouls: -1 };
    case "TIMEOUT_UNDO":
      return { teamSide: payload.teamSide ?? null, timeoutsUsed: payload.teamSide ? -1 : 0 };
    case "GAME_CLOCK_SET_CORRECTION":
    case "SHOT_CLOCK_SET_CORRECTION":
      return { requiresNewValue: true };
  }
}

function payloadRecord(payload: unknown) {
  return payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
}

function parseTeamSide(value: unknown): "HOME" | "AWAY" | null {
  return value === "HOME" || value === "AWAY" ? value : null;
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
