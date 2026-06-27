import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CommandResult, ScoreAddedPayload } from "@basket-scoreboard/api-contracts";
import type { ScoreboardProjection } from "./projection";
import { parseJsonField } from "./json";

type StreamRow = RowDataPacket & {
  last_seq_no: number;
};

type ProjectionRow = RowDataPacket & {
  projection_data: unknown;
  last_event_seq: number;
};

type EventRow = RowDataPacket & {
  event_id: string;
  match_id: string;
  seq_no: number;
  event_type: "SCORE_ADDED";
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
  eventType: "SCORE_ADDED";
  payload: ScoreAddedPayload;
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

export async function ensurePlaceholderUser(connection: PoolConnection) {
  await connection.query(
    "INSERT IGNORE INTO users (user_id, email, display_name, status) VALUES (?, ?, ?, 'ACTIVE')",
    [
      "00000000-0000-4000-8000-000000000001",
      "placeholder-scorer@example.local",
      "Placeholder Scorer"
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

function toEventRecord(row: EventRow): MatchEventRecord {
  return {
    eventId: row.event_id,
    matchId: row.match_id,
    seqNo: row.seq_no,
    eventType: row.event_type,
    payload: parseJsonField<ScoreAddedPayload>(row.payload),
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
