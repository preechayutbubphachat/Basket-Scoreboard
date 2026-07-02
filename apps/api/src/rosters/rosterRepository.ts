import { randomUUID } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  CreatePlayerRequest,
  MatchRosterPlayer,
  MatchRostersResponse,
  PlayerPosition,
  PlayerRecord,
  RosterStatus,
  UpdatePlayerRequest,
  UpdateRosterPlayerRequest
} from "@basket-scoreboard/api-contracts";
import { parseJsonField } from "../matchEventStore/json.js";

type TeamRow = RowDataPacket & { team_id: string };
type PlayerRow = RowDataPacket & {
  player_id: string;
  team_id: string;
  display_name: string;
  jersey_number: string | null;
  status: "ACTIVE" | "INACTIVE";
  metadata: unknown;
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
};
type MatchRow = RowDataPacket & {
  match_id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  status: string;
};
type RosterRow = RowDataPacket & {
  roster_player_id: string;
  match_id: string;
  team_side: "HOME" | "AWAY";
  team_id: string;
  player_id: string;
  display_name_snapshot: string;
  jersey_number_snapshot: string | null;
  position: PlayerPosition;
  roster_status: RosterStatus;
  is_starter: number | boolean;
  is_captain: number | boolean;
};

export async function teamExists(connection: PoolConnection, teamId: string) {
  const [rows] = await connection.query<TeamRow[]>("SELECT team_id FROM teams WHERE team_id = ?", [teamId]);
  return Boolean(rows[0]);
}

export async function listPlayersForTeam(pool: Pool, teamId: string) {
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.query<PlayerRow[]>(
      "SELECT player_id, team_id, display_name, jersey_number, status, metadata, created_at, updated_at FROM players WHERE team_id = ? ORDER BY jersey_number IS NULL, jersey_number, display_name",
      [teamId]
    );
    return rows.map(toPlayerRecord);
  } finally {
    connection.release();
  }
}

export async function createPlayer(pool: Pool, teamId: string, input: CreatePlayerRequest) {
  const connection = await pool.getConnection();

  try {
    if (!(await teamExists(connection, teamId))) {
      return { ok: false as const, statusCode: 404, reasonCode: "MATCH_NOT_FOUND", message: "Team was not found" };
    }

    if (input.jerseyNumber && (await jerseyNumberExists(connection, teamId, input.jerseyNumber))) {
      return {
        ok: false as const,
        statusCode: 409,
        reasonCode: "DB_CONSTRAINT_ERROR",
        message: "Jersey number is already used by this team"
      };
    }

    const playerId = input.playerId ?? randomUUID();
    await connection.query(
      "INSERT INTO players (player_id, team_id, display_name, jersey_number, status, metadata) VALUES (?, ?, ?, ?, ?, ?)",
      [
        playerId,
        teamId,
        input.displayName,
        input.jerseyNumber ?? null,
        input.active ? "ACTIVE" : "INACTIVE",
        JSON.stringify({ position: input.position })
      ]
    );

    const player = await getPlayerById(connection, playerId);
    return { ok: true as const, statusCode: 201, player: player! };
  } finally {
    connection.release();
  }
}

export async function updatePlayer(pool: Pool, teamId: string, playerId: string, input: UpdatePlayerRequest) {
  const connection = await pool.getConnection();

  try {
    const current = await getPlayerById(connection, playerId);
    if (!current || current.teamId !== teamId) {
      return { ok: false as const, statusCode: 404, reasonCode: "MATCH_NOT_FOUND", message: "Player was not found" };
    }
    const nextJerseyNumber = input.jerseyNumber === undefined ? current.jerseyNumber : input.jerseyNumber;
    if (
      nextJerseyNumber &&
      nextJerseyNumber !== current.jerseyNumber &&
      (await jerseyNumberExists(connection, teamId, nextJerseyNumber))
    ) {
      return {
        ok: false as const,
        statusCode: 409,
        reasonCode: "DB_CONSTRAINT_ERROR",
        message: "Jersey number is already used by this team"
      };
    }

    await connection.query(
      "UPDATE players SET display_name = ?, jersey_number = ?, status = ?, metadata = ? WHERE player_id = ? AND team_id = ?",
      [
        input.displayName ?? current.displayName,
        nextJerseyNumber,
        input.active === undefined ? (current.active ? "ACTIVE" : "INACTIVE") : input.active ? "ACTIVE" : "INACTIVE",
        JSON.stringify({ position: input.position ?? current.position }),
        playerId,
        teamId
      ]
    );

    const player = await getPlayerById(connection, playerId);
    return { ok: true as const, statusCode: 200, player: player! };
  } finally {
    connection.release();
  }
}

async function jerseyNumberExists(connection: PoolConnection, teamId: string, jerseyNumber: string) {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT player_id FROM players WHERE team_id = ? AND jersey_number = ? LIMIT 1",
    [teamId, jerseyNumber]
  );
  return Boolean(rows[0]);
}

export async function listMatchRoster(pool: Pool, matchId: string): Promise<MatchRostersResponse | null> {
  const connection = await pool.getConnection();

  try {
    const match = await getMatchTeams(connection, matchId);
    if (!match) {
      return null;
    }

    const entries = await listMatchRosterEntries(connection, matchId);
    return groupRoster(matchId, entries);
  } finally {
    connection.release();
  }
}

export async function assignPlayerToMatchRoster(
  pool: Pool,
  options: { matchId: string; teamSide: "HOME" | "AWAY"; playerId: string }
) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const match = await getMatchTeams(connection, options.matchId);
    if (!match) {
      await connection.rollback();
      return { ok: false as const, statusCode: 404, reasonCode: "MATCH_NOT_FOUND", message: "Match was not found" };
    }

    const teamId = options.teamSide === "HOME" ? match.home_team_id : match.away_team_id;
    if (!teamId) {
      await connection.rollback();
      return { ok: false as const, statusCode: 422, reasonCode: "VALIDATION_ERROR", message: "Match team side is not assigned" };
    }

    const player = await getPlayerById(connection, options.playerId);
    if (!player) {
      await connection.rollback();
      return { ok: false as const, statusCode: 404, reasonCode: "MATCH_NOT_FOUND", message: "Player was not found" };
    }

    if (player.teamId !== teamId) {
      await connection.rollback();
      return { ok: false as const, statusCode: 422, reasonCode: "VALIDATION_ERROR", message: "Player does not belong to the selected team side" };
    }

    const existing = await getRosterEntryForPlayer(connection, options.matchId, options.playerId);
    if (!existing) {
      await connection.query(
        "INSERT INTO match_roster_players (roster_player_id, match_id, team_side, team_id, player_id, display_name_snapshot, jersey_number_snapshot, position, roster_status, is_starter, is_captain) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0, 0)",
        [
          randomUUID(),
          options.matchId,
          options.teamSide,
          teamId,
          options.playerId,
          player.displayName,
          player.jerseyNumber,
          player.position
        ]
      );
    }

    const entry = await getRosterEntryForPlayer(connection, options.matchId, options.playerId);
    await connection.commit();
    return { ok: true as const, statusCode: existing ? 200 : 201, entry: entry! };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateMatchRosterPlayer(
  pool: Pool,
  options: { matchId: string; teamSide: "HOME" | "AWAY"; playerId: string; input: UpdateRosterPlayerRequest }
) {
  const connection = await pool.getConnection();

  try {
    const entry = await getRosterEntryForPlayer(connection, options.matchId, options.playerId);
    if (!entry || entry.teamSide !== options.teamSide) {
      return { ok: false as const, statusCode: 404, reasonCode: "MATCH_NOT_FOUND", message: "Roster player was not found" };
    }

    await connection.query(
      "UPDATE match_roster_players SET roster_status = ?, is_starter = ?, is_captain = ? WHERE match_id = ? AND player_id = ?",
      [
        options.input.status,
        options.input.isStarter ? 1 : 0,
        options.input.isCaptain ? 1 : 0,
        options.matchId,
        options.playerId
      ]
    );

    const updated = await getRosterEntryForPlayer(connection, options.matchId, options.playerId);
    return { ok: true as const, statusCode: 200, entry: updated! };
  } finally {
    connection.release();
  }
}

export async function getActiveRosterPlayerForMatchSide(
  connection: PoolConnection,
  matchId: string,
  playerId: string,
  teamSide: "HOME" | "AWAY"
) {
  const [rows] = await connection.query<RosterRow[]>(
    "SELECT roster_player_id, match_id, team_side, team_id, player_id, display_name_snapshot, jersey_number_snapshot, position, roster_status, is_starter, is_captain FROM match_roster_players mrp WHERE mrp.match_id = ? AND mrp.team_side = ? AND mrp.player_id = ? AND mrp.roster_status <> 'INACTIVE' LIMIT 1",
    [matchId, teamSide, playerId]
  );
  const entry = rows[0] ? toRosterPlayer(rows[0]) : null;

  if (!entry) {
    return null;
  }

  return {
    playerId: entry.playerId,
    playerName: entry.displayNameSnapshot,
    jerseyNumber: entry.jerseyNumberSnapshot,
    teamSide: entry.teamSide
  };
}

async function getPlayerById(connection: PoolConnection, playerId: string): Promise<PlayerRecord | null> {
  const [rows] = await connection.query<PlayerRow[]>(
    "SELECT player_id, team_id, display_name, jersey_number, status, metadata, created_at, updated_at FROM players WHERE player_id = ?",
    [playerId]
  );
  return rows[0] ? toPlayerRecord(rows[0]) : null;
}

async function getMatchTeams(connection: PoolConnection, matchId: string) {
  const [rows] = await connection.query<MatchRow[]>(
    "SELECT match_id, home_team_id, away_team_id, status FROM matches WHERE match_id = ?",
    [matchId]
  );
  return rows[0] ?? null;
}

async function listMatchRosterEntries(connection: PoolConnection, matchId: string) {
  const [rows] = await connection.query<RosterRow[]>(
    "SELECT roster_player_id, match_id, team_side, team_id, player_id, display_name_snapshot, jersey_number_snapshot, position, roster_status, is_starter, is_captain FROM match_roster_players mrp WHERE mrp.match_id = ? ORDER BY mrp.team_side, mrp.jersey_number_snapshot IS NULL, mrp.jersey_number_snapshot, mrp.display_name_snapshot",
    [matchId]
  );
  return rows.map(toRosterPlayer);
}

async function getRosterEntryForPlayer(connection: PoolConnection, matchId: string, playerId: string) {
  const [rows] = await connection.query<RosterRow[]>(
    "SELECT roster_player_id, match_id, team_side, team_id, player_id, display_name_snapshot, jersey_number_snapshot, position, roster_status, is_starter, is_captain FROM match_roster_players mrp WHERE mrp.match_id = ? AND mrp.player_id = ?",
    [matchId, playerId]
  );
  return rows[0] ? toRosterPlayer(rows[0]) : null;
}

function toPlayerRecord(row: PlayerRow): PlayerRecord {
  const metadata = parseJsonField<{ position?: unknown }>(row.metadata) ?? {};
  const player: PlayerRecord = {
    playerId: row.player_id,
    teamId: row.team_id,
    displayName: row.display_name,
    jerseyNumber: row.jersey_number,
    position: normalizePosition(metadata.position),
    active: row.status === "ACTIVE"
  };
  const createdAt = toIsoString(row.created_at);
  const updatedAt = toIsoString(row.updated_at);
  if (createdAt) player.createdAt = createdAt;
  if (updatedAt) player.updatedAt = updatedAt;
  return player;
}

function toRosterPlayer(row: RosterRow): MatchRosterPlayer {
  return {
    rosterPlayerId: row.roster_player_id,
    matchId: row.match_id,
    teamSide: row.team_side,
    teamId: row.team_id,
    playerId: row.player_id,
    displayNameSnapshot: row.display_name_snapshot,
    jerseyNumberSnapshot: row.jersey_number_snapshot,
    position: normalizePosition(row.position),
    status: normalizeRosterStatus(row.roster_status),
    isStarter: row.is_starter === true || row.is_starter === 1,
    isCaptain: row.is_captain === true || row.is_captain === 1
  };
}

function groupRoster(matchId: string, entries: MatchRosterPlayer[]): MatchRostersResponse {
  return {
    matchId,
    rosters: {
      HOME: entries.filter((entry) => entry.teamSide === "HOME"),
      AWAY: entries.filter((entry) => entry.teamSide === "AWAY")
    }
  };
}

function normalizePosition(value: unknown): PlayerPosition {
  return value === "GUARD" || value === "FORWARD" || value === "CENTER" || value === "UNKNOWN" ? value : "UNKNOWN";
}

function normalizeRosterStatus(value: unknown): RosterStatus {
  return value === "ACTIVE" || value === "BENCH" || value === "INACTIVE" ? value : "ACTIVE";
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}
