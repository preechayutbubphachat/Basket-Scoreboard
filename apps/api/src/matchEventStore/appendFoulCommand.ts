import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import type {
  AddPlayerFoulCommand,
  AddTeamFoulCommand,
  CommandResult,
  MatchEventType,
  PlayerFoulAddedPayload,
  RecordPlayerTechnicalFoulCommand,
  TeamFoulAddedPayload
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
import { getOnCourtRosterPlayerForMatch, getActiveRosterPlayerForMatchSide } from "../rosters/rosterRepository.js";
import { applyPlayerFoulAdded, applyTeamFoulAdded } from "./projection.js";

type FoulCommand = AddTeamFoulCommand | AddPlayerFoulCommand | RecordPlayerTechnicalFoulCommand;

function requestHash(command: FoulCommand) {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

const finishedMatchLiveControlMessage = "Finished matches cannot be changed through live controls";

export async function appendTeamFoulAddedCommand(options: {
  pool: Pool;
  command: AddTeamFoulCommand;
  user: AuthenticatedUser;
}): Promise<CommandResult> {
  return rejected(
    options.command,
    reasonCodes.VALIDATION_ERROR,
    "Direct team foul commands are not supported",
    options.command.expectedSeq
  );
}

export async function appendPlayerFoulAddedCommand(options: {
  pool: Pool;
  command: AddPlayerFoulCommand;
  user: AuthenticatedUser;
}): Promise<CommandResult> {
  if (options.command.payload.foulType !== "PERSONAL") {
    return rejected(
      options.command,
      reasonCodes.VALIDATION_ERROR,
      "Only player-attributed PERSONAL fouls are supported",
      options.command.expectedSeq
    );
  }

  return appendFoulCommand({
    ...options,
    eventType: "PLAYER_FOUL_ADDED",
    commandType: "foul/player/add"
  });
}

export async function appendPlayerTechnicalFoulCommand(options: {
  pool: Pool;
  command: RecordPlayerTechnicalFoulCommand;
  user: AuthenticatedUser;
}): Promise<CommandResult> {
  return appendFoulCommand({
    ...options,
    eventType: "PLAYER_FOUL_ADDED",
    commandType: "foul/player/technical"
  });
}

async function appendFoulCommand(options: {
  pool: Pool;
  command: FoulCommand;
  user: AuthenticatedUser;
  eventType: Extract<MatchEventType, "TEAM_FOUL_ADDED" | "PLAYER_FOUL_ADDED">;
  commandType: "foul/team/add" | "foul/player/add" | "foul/player/technical";
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
      if (duplicateIdentity.requestHash !== requestHash(options.command)) {
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

    // A concurrent request may have committed while this transaction waited for
    // the stream lock. Re-check deduplication under that lock before comparing
    // expectedSeq so an exact retry returns the original accepted range rather
    // than an incorrect SYNC_REQUIRED response.
    const lockedDuplicateIdentity = await findDuplicateCommandIdentity(
      connection,
      options.command.matchId,
      options.command.commandId
    );
    if (lockedDuplicateIdentity) {
      await connection.rollback();
      if (lockedDuplicateIdentity.requestHash !== requestHash(options.command)) {
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
      throw new Error(`Scoreboard projection not found for match ${options.command.matchId}`);
    }

    const isTechnicalCommand = options.commandType === "foul/player/technical";
    if (isFinishedMatchStatus(projection.status)) {
      await connection.rollback();
      return rejected(options.command, reasonCodes.VALIDATION_ERROR, finishedMatchLiveControlMessage, currentSeq);
    }

    if (isTechnicalCommand && projection.status !== "LIVE") {
      await connection.rollback();
      return rejected(
        options.command,
        reasonCodes.VALIDATION_ERROR,
        "Player technical fouls are supported only during live playing time",
        currentSeq
      );
    }

    if (isTechnicalCommand) {
      const playerId = (options.command as RecordPlayerTechnicalFoulCommand).payload.playerId;
      const existing = projection.playerFouls.find((player) => player.playerId === playerId);
      if ((existing?.technicalFouls ?? 0) >= 1) {
        await connection.rollback();
        return rejected(
          options.command,
          reasonCodes.VALIDATION_ERROR,
          "A repeated player technical foul requires unsupported disqualification handling",
          currentSeq
        );
      }
    }

    const nextSeq = currentSeq + 1;
    const eventId = randomUUID();
    const entitlementEventId = isTechnicalCommand ? randomUUID() : null;
    const resumptionEventId = isTechnicalCommand ? randomUUID() : null;
    const finalSeq = isTechnicalCommand ? currentSeq + 3 : nextSeq;
    const occurredAt = new Date(options.command.clientTimestamp);
    const periodNumber = projection.periodNumber || 1;
    const payload = await buildEventPayload({
      connection,
      command: options.command,
      eventType: options.eventType,
      periodNumber
    });

    if (!payload.ok) {
      await connection.rollback();
      return rejected(options.command, reasonCodes.VALIDATION_ERROR, payload.message, currentSeq);
    }

    await connection.query(
      "INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'FIBA_2024')",
      [
        eventId,
        options.command.matchId,
        nextSeq,
        options.eventType,
        JSON.stringify(payload.value),
        options.user.userId,
        options.user.role,
        options.user.deviceId,
        occurredAt,
        options.command.commandId,
        options.command.expectedSeq,
        options.command.correlationId,
        commandReason(options.command)
      ]
    );

    if (isTechnicalCommand && entitlementEventId && resumptionEventId) {
      const playerPayload = payload.value as PlayerFoulAddedPayload;
      const awardedTo = playerPayload.teamSide === "HOME" ? "AWAY" : "HOME";
      await connection.query(
        "INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, 'FREE_THROW_ENTITLEMENT_CREATED', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'FIBA_2024')",
        [entitlementEventId, options.command.matchId, currentSeq + 2, JSON.stringify({ sourceFoulEventId: eventId, attempts: 1, awardedTo, ruleProfileId: "FIBA_2024" }), options.user.userId, options.user.role, options.user.deviceId, occurredAt, options.command.commandId, options.command.expectedSeq, options.command.correlationId, eventId]
      );
      await connection.query(
        "INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, 'PLAY_RESUMPTION_DECLARED', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'FIBA_2024')",
        [resumptionEventId, options.command.matchId, finalSeq, JSON.stringify({ sourceEntitlementEventId: entitlementEventId, mode: "RESUME_INTERRUPTED_PLAY", ruleProfileId: "FIBA_2024" }), options.user.userId, options.user.role, options.user.deviceId, occurredAt, options.command.commandId, options.command.expectedSeq, options.command.correlationId, entitlementEventId]
      );
    }

    await connection.query("UPDATE match_streams SET last_seq_no = ? WHERE match_id = ?", [
      finalSeq,
      options.command.matchId
    ]);

    const foulProjection =
      options.eventType === "PLAYER_FOUL_ADDED"
        ? applyPlayerFoulAdded(projection, payload.value as PlayerFoulAddedPayload & {
            periodNumber: number;
            playerName: string | null;
            jerseyNumber: string | null;
          }, nextSeq)
        : applyTeamFoulAdded(projection, payload.value as TeamFoulAddedPayload & { periodNumber: number }, nextSeq);
    const updatedProjection = finalSeq === nextSeq
      ? foulProjection
      : { ...foulProjection, currentSeq: finalSeq };

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
      reason: commandReason(options.command),
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
        { eventId, seqNo: nextSeq, eventType: options.eventType },
        ...(isTechnicalCommand && entitlementEventId && resumptionEventId
          ? [
              { eventId: entitlementEventId, seqNo: currentSeq + 2, eventType: "FREE_THROW_ENTITLEMENT_CREATED" as const },
              { eventId: resumptionEventId, seqNo: finalSeq, eventType: "PLAY_RESUMPTION_DECLARED" as const }
            ]
          : [])
      ],
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

async function buildEventPayload(options: {
  connection: Awaited<ReturnType<Pool["getConnection"]>>;
  command: FoulCommand;
  eventType: "TEAM_FOUL_ADDED" | "PLAYER_FOUL_ADDED";
  periodNumber: number;
}): Promise<
  | { ok: true; value: TeamFoulAddedPayload & { periodNumber: number } }
  | {
      ok: true;
      value: PlayerFoulAddedPayload & {
        periodNumber: number;
        playerName: string | null;
        jerseyNumber: string | null;
      };
    }
  | { ok: false; message: string }
> {
  if (options.eventType === "TEAM_FOUL_ADDED") {
    const teamCommand = options.command as AddTeamFoulCommand;
    const base = {
      teamSide: teamCommand.payload.teamSide,
      foulType: teamCommand.payload.foulType,
      reason: teamCommand.payload.reason,
      periodNumber: options.periodNumber
    };
    return { ok: true, value: base };
  }

  const isTechnical = !("teamSide" in options.command.payload);
  const playerCommand = options.command as AddPlayerFoulCommand | RecordPlayerTechnicalFoulCommand;
  const player = isTechnical
    ? await getOnCourtRosterPlayerForMatch(options.connection, playerCommand.matchId, playerCommand.payload.playerId)
    : await getActiveRosterPlayerForMatchSide(
        options.connection,
        playerCommand.matchId,
        playerCommand.payload.playerId,
        (playerCommand as AddPlayerFoulCommand).payload.teamSide
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
      teamSide: player.teamSide,
      foulType: isTechnical ? "TECHNICAL" : "PERSONAL",
      reason: isTechnical ? null : (playerCommand as AddPlayerFoulCommand).payload.reason,
      periodNumber: options.periodNumber,
      playerId: player.playerId,
      playerName: player.playerName,
      jerseyNumber: player.jerseyNumber
    }
  };
}

function rejected(
  command: FoulCommand,
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

function commandReason(command: FoulCommand) {
  return "reason" in command.payload ? command.payload.reason : null;
}
