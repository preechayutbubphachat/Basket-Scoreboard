import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import type {
  AddPlayerFoulCommand,
  AddTeamFoulCommand,
  CommandResult,
  MatchEventType,
  PlayerFoulAddedPayload,
  TeamFoulAddedPayload
} from "@basket-scoreboard/api-contracts";
import { reasonCodes } from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { insertAuditLog } from "./auditRepository.js";
import {
  ensurePlaceholderUser,
  findDuplicateCommand,
  getActivePlayerForMatchSide,
  getScoreboardProjection,
  insertCommandResult,
  lockMatchStream,
  updateScoreboardProjection
} from "./repositories.js";
import { applyPlayerFoulAdded, applyTeamFoulAdded } from "./projection.js";

type FoulCommand = AddTeamFoulCommand | AddPlayerFoulCommand;

function requestHash(command: FoulCommand) {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

export async function appendTeamFoulAddedCommand(options: {
  pool: Pool;
  command: AddTeamFoulCommand;
  user: AuthenticatedUser;
}): Promise<CommandResult> {
  return appendFoulCommand({
    ...options,
    eventType: "TEAM_FOUL_ADDED",
    commandType: "foul/team/add"
  });
}

export async function appendPlayerFoulAddedCommand(options: {
  pool: Pool;
  command: AddPlayerFoulCommand;
  user: AuthenticatedUser;
}): Promise<CommandResult> {
  return appendFoulCommand({
    ...options,
    eventType: "PLAYER_FOUL_ADDED",
    commandType: "foul/player/add"
  });
}

async function appendFoulCommand(options: {
  pool: Pool;
  command: FoulCommand;
  user: AuthenticatedUser;
  eventType: Extract<MatchEventType, "TEAM_FOUL_ADDED" | "PLAYER_FOUL_ADDED">;
  commandType: "foul/team/add" | "foul/player/add";
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
        options.command.payload.reason
      ]
    );

    await connection.query("UPDATE match_streams SET last_seq_no = ? WHERE match_id = ?", [
      nextSeq,
      options.command.matchId
    ]);

    const updatedProjection =
      options.eventType === "PLAYER_FOUL_ADDED"
        ? applyPlayerFoulAdded(projection, payload.value as PlayerFoulAddedPayload & {
            periodNumber: number;
            playerName: string | null;
            jerseyNumber: string | null;
          }, nextSeq)
        : applyTeamFoulAdded(projection, payload.value as TeamFoulAddedPayload & { periodNumber: number }, nextSeq);

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
      reason: options.command.payload.reason,
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
  const base = {
    teamSide: options.command.payload.teamSide,
    foulType: options.command.payload.foulType,
    reason: options.command.payload.reason,
    periodNumber: options.periodNumber
  };

  if (options.eventType === "TEAM_FOUL_ADDED") {
    return { ok: true, value: base };
  }

  const playerCommand = options.command as AddPlayerFoulCommand;
  const player = await getActivePlayerForMatchSide(
    options.connection,
    playerCommand.matchId,
    playerCommand.payload.playerId,
    playerCommand.payload.teamSide
  );

  if (!player) {
    return {
      ok: false,
      message: "Player was not found on the selected match side"
    };
  }

  return {
    ok: true,
    value: {
      ...base,
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
