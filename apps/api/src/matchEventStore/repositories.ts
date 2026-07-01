import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  CommandResult,
  MatchEventType,
  ScoreboardProjection as ApiScoreboardProjection
} from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import type { ScoreboardProjection } from "./projection.js";
import { parseJsonField } from "./json.js";

type StreamRow = RowDataPacket & {
  last_seq_no: number;
};

type ProjectionRow = RowDataPacket & {
  projection_data: unknown;
  last_event_seq: number;
};

type ProjectionViewRow = RowDataPacket & {
  match_id: string;
  match_status: string | null;
  projection_data: unknown | null;
  last_event_seq: number | string | null;
  home_team_id: string | null;
  home_team_name: string | null;
  away_team_id: string | null;
  away_team_name: string | null;
  updated_at: Date | string | null;
};

type EventRow = RowDataPacket & {
  event_id: string;
  match_id: string;
  seq_no: number;
  event_type: MatchEventType;
  payload: unknown;
  actor_user_id: string;
  actor_role: string;
  device_id: string;
  occurred_at: Date;
  recorded_at: Date;
  command_id: string;
  expected_seq: number;
  correlation_id: string;
  causation_id: string | null;
  reason: string | null;
  rule_profile_id: string;
};

type DedupRow = RowDataPacket & {
  result: unknown;
};

export type MatchEventRecord = {
  eventId: string;
  matchId: string;
  seqNo: number;
  eventType: MatchEventType;
  payload: unknown;
  actorUserId: string;
  actorRole: string;
  deviceId: string;
  occurredAt: string;
  recordedAt: string;
  commandId: string;
  expectedSeq: number;
  correlationId: string;
  causationId: string | null;
  reason: string | null;
  ruleProfileId: string;
};

export async function ensurePlaceholderUser(connection: PoolConnection, user?: AuthenticatedUser) {
  const actor = user ?? {
    userId: "00000000-0000-4000-8000-000000000001",
    role: "SCORER"
  };

  await connection.query(
    "INSERT IGNORE INTO users (user_id, email, display_name, status) VALUES (?, ?, ?, 'ACTIVE')",
    [
      actor.userId,
      `${actor.userId}@dev-auth.local`,
      `${actor.role} Dev User`
    ]
  );
}

export async function getCurrentSeq(connection: PoolConnection, matchId: string) {
  const [rows] = await connection.query<StreamRow[]>(
    "SELECT last_seq_no FROM match_streams WHERE match_id = ?",
    [matchId]
  );

  return rows[0]?.last_seq_no ?? null;
}

export async function lockMatchStream(connection: PoolConnection, matchId: string) {
  const [rows] = await connection.query<StreamRow[]>(
    "SELECT last_seq_no FROM match_streams WHERE match_id = ? FOR UPDATE",
    [matchId]
  );

  return rows[0]?.last_seq_no ?? null;
}

export async function findDuplicateCommand(
  connection: PoolConnection,
  matchId: string,
  commandId: string
) {
  const [rows] = await connection.query<DedupRow[]>(
    "SELECT result FROM command_deduplication WHERE match_id = ? AND command_id = ?",
    [matchId, commandId]
  );

  return rows[0] ? parseJsonField<CommandResult>(rows[0].result) : null;
}

export async function insertCommandResult(
  connection: PoolConnection,
  options: {
    commandId: string;
    matchId: string;
    commandType: string;
    requestHash: string;
    result: CommandResult;
  }
) {
  await connection.query(
    "INSERT INTO command_deduplication (command_id, match_id, command_type, request_hash, status, result) VALUES (?, ?, ?, ?, 'ACCEPTED', ?)",
    [
      options.commandId,
      options.matchId,
      options.commandType,
      options.requestHash,
      JSON.stringify(options.result)
    ]
  );
}

export async function getScoreboardProjection(connection: PoolConnection, matchId: string) {
  const [rows] = await connection.query<ProjectionRow[]>(
    "SELECT projection_data, last_event_seq FROM match_projections WHERE match_id = ? AND projection_type = 'scoreboard'",
    [matchId]
  );

  return rows[0] ? parseJsonField<ScoreboardProjection>(rows[0].projection_data) : null;
}

export async function getScoreboardProjectionView(connection: PoolConnection, matchId: string) {
  const [rows] = await connection.query<ProjectionViewRow[]>(
    `SELECT
      m.match_id,
      m.status AS match_status,
      mp.projection_data,
      mp.last_event_seq,
      mp.updated_at,
      m.home_team_id,
      home.name AS home_team_name,
      m.away_team_id,
      away.name AS away_team_name
    FROM matches m
    LEFT JOIN match_projections mp ON mp.match_id = m.match_id
      AND mp.projection_type = 'scoreboard'
    LEFT JOIN teams home ON home.team_id = m.home_team_id
    LEFT JOIN teams away ON away.team_id = m.away_team_id
    WHERE m.match_id = ?`,
    [matchId]
  );
  const row = rows[0];

  if (!row) {
    return null;
  }

  const projection = row.projection_data ? parseProjectionJson(row.projection_data) : {};
  const currentSeq = numberOrDefault(projection.currentSeq, numberOrDefault(row.last_event_seq, 0));
  const periodNumber = numberOrDefault(projection.periodNumber, 1);
  const updatedAt =
    row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : row.updated_at
        ? String(row.updated_at)
        : null;

  return {
    ...projection,
    matchId: typeof projection.matchId === "string" ? projection.matchId : row.match_id,
    homeScore: numberOrDefault(projection.homeScore, 0),
    awayScore: numberOrDefault(projection.awayScore, 0),
    period: periodNumber,
    periodNumber,
    gameClockRemainingMs: numberOrDefault(projection.gameClockRemainingMs, 600000),
    shotClockRemainingMs:
      projection.shotClockRemainingMs === null
        ? null
        : numberOrDefault(projection.shotClockRemainingMs, 24000),
    status:
      typeof projection.status === "string"
        ? projection.status
        : row.match_status ?? "SCHEDULED",
    currentSeq,
    projectionVersion: "scoreboard-v1",
    homeTeamId: row.home_team_id,
    homeTeamName: row.home_team_name ?? "HOME",
    awayTeamId: row.away_team_id,
    awayTeamName: row.away_team_name ?? "AWAY",
    lastEventSeq: numberOrDefault(row.last_event_seq, currentSeq),
    updatedAt
  } satisfies ApiScoreboardProjection;
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseProjectionJson(value: unknown): Partial<ScoreboardProjection> {
  try {
    return parseJsonField<Partial<ScoreboardProjection>>(value) ?? {};
  } catch {
    return {};
  }
}

export async function updateScoreboardProjection(
  connection: PoolConnection,
  projection: ScoreboardProjection
) {
  await connection.query(
    "UPDATE match_projections SET projection_data = ?, last_event_seq = ?, projection_version = projection_version + 1 WHERE match_id = ? AND projection_type = 'scoreboard'",
    [JSON.stringify(projection), projection.currentSeq, projection.matchId]
  );
}

export async function listMatchEvents(
  connection: PoolConnection,
  matchId: string,
  afterSeq = 0
) {
  const [rows] = await connection.query<EventRow[]>(
    "SELECT event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, recorded_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id FROM match_events WHERE match_id = ? AND seq_no > ? ORDER BY seq_no ASC",
    [matchId, afterSeq]
  );

  return rows.map(toEventRecord);
}

export async function getMatchEventBySeq(
  connection: PoolConnection,
  matchId: string,
  seqNo: number
) {
  const [rows] = await connection.query<EventRow[]>(
    "SELECT event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, recorded_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id FROM match_events WHERE match_id = ? AND seq_no = ?",
    [matchId, seqNo]
  );

  return rows[0] ? toEventRecord(rows[0]) : null;
}

function toEventRecord(row: EventRow): MatchEventRecord {
  return {
    eventId: row.event_id,
    matchId: row.match_id,
    seqNo: row.seq_no,
    eventType: row.event_type,
    payload: parseJsonField<unknown>(row.payload),
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    deviceId: row.device_id,
    occurredAt: row.occurred_at.toISOString(),
    recordedAt: row.recorded_at.toISOString(),
    commandId: row.command_id,
    expectedSeq: row.expected_seq,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    reason: row.reason,
    ruleProfileId: row.rule_profile_id
  };
}
