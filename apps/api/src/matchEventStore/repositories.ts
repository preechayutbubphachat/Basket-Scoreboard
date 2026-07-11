import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  CommandResult,
  MatchEventType,
  ScoreboardProjection as ApiScoreboardProjection
} from "@basket-scoreboard/api-contracts";
import { reasonCodes } from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { normalizeScoreboardProjection, type ScoreboardProjection } from "./projection.js";
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

type PlayerMatchRow = RowDataPacket & {
  player_id: string;
  display_name: string;
  jersey_number: string | null;
  team_side: "HOME" | "AWAY";
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

type MatchStreamCommand = {
  commandId: string;
  matchId: string;
  expectedSeq: number;
};

export function isMatchStreamReadConflict(error: unknown) {
  const candidate = error as { code?: string; errno?: number; sqlState?: string; sqlMessage?: string };
  return candidate?.code === "ER_CHECKREAD" &&
    candidate.errno === 1020 &&
    candidate.sqlState === "HY000" &&
    typeof candidate.sqlMessage === "string" &&
    candidate.sqlMessage.includes("table 'match_streams'");
}

export async function recoverMatchStreamReadConflict(options: {
  error: unknown;
  pool: Pool;
  command: MatchStreamCommand;
}): Promise<CommandResult | null> {
  if (!isMatchStreamReadConflict(options.error)) {
    return null;
  }

  const connection = await options.pool.getConnection();
  try {
    const duplicate = await findDuplicateCommand(connection, options.command.matchId, options.command.commandId);
    if (duplicate) {
      return { ...duplicate, status: "DUPLICATE_ACCEPTED", appendedEvents: [] };
    }
    const currentSeq = await getCurrentSeq(connection, options.command.matchId);
    if (currentSeq === null) {
      return null;
    }
    return {
      status: "SYNC_REQUIRED",
      commandId: options.command.commandId,
      matchId: options.command.matchId,
      currentSeq,
      appendedEvents: [],
      reasonCode: reasonCodes.INVALID_EXPECTED_SEQ,
      message: `Expected seq ${options.command.expectedSeq}, current seq ${currentSeq}`
    };
  } finally {
    connection.release();
  }
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

  if (!rows[0]) {
    return null;
  }

  const projection = parseJsonField<Partial<ScoreboardProjection> & { matchId: string }>(rows[0].projection_data);
  return projection ? normalizeScoreboardProjection(projection) : null;
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
  const gameClock = normalizeClockState(projection.gameClock, numberOrDefault(projection.gameClockRemainingMs, 600000));
  const shotClock = normalizeClockState(projection.shotClock, numberOrDefault(projection.shotClockRemainingMs, 24000));
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
    teamFouls: normalizeTeamFoulCount(projection.teamFouls),
    teamFoulsByPeriod: normalizeTeamFoulsByPeriod(projection.teamFoulsByPeriod),
    playerFouls: Array.isArray(projection.playerFouls) ? projection.playerFouls : [],
    timeouts: normalizeTimeouts(projection.timeouts),
    timeoutsByHalf: normalizeTimeoutsByHalf(projection.timeoutsByHalf),
    activeTimeout: normalizeActiveTimeout(projection.activeTimeout),
    periodType: projection.periodType === "OVERTIME" ? "OVERTIME" : "REGULATION",
    regulationPeriods: numberOrDefault(projection.regulationPeriods, 4),
    periodDurationMs: numberOrDefault(projection.periodDurationMs, 600000),
    overtimeDurationMs: numberOrDefault(projection.overtimeDurationMs, 300000),
    winnerSide: projection.winnerSide === "HOME" || projection.winnerSide === "AWAY" ? projection.winnerSide : null,
    finalScore: normalizeFinalScore(projection.finalScore),
    matchStartedAt: stringOrNull(projection.matchStartedAt),
    matchFinishedAt: stringOrNull(projection.matchFinishedAt),
    currentPeriodStartedAt: stringOrNull(projection.currentPeriodStartedAt),
    currentPeriodEndedAt: stringOrNull(projection.currentPeriodEndedAt),
    period: periodNumber,
    periodNumber,
    gameClockRemainingMs: gameClock.remainingMs,
    shotClockRemainingMs: shotClock.remainingMs,
    gameClock,
    shotClock,
    clockUpdatedAt: typeof projection.clockUpdatedAt === "string" ? projection.clockUpdatedAt : updatedAt,
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
    updatedAt,
    serverTime: new Date().toISOString()
  } satisfies ApiScoreboardProjection;
}

export async function getActivePlayerForMatchSide(
  connection: PoolConnection,
  matchId: string,
  playerId: string,
  teamSide: "HOME" | "AWAY"
) {
  const [rows] = await connection.query<PlayerMatchRow[]>(
    `SELECT
      p.player_id,
      p.display_name,
      p.jersey_number,
      CASE
        WHEN p.team_id = m.home_team_id THEN 'HOME'
        WHEN p.team_id = m.away_team_id THEN 'AWAY'
      END AS team_side
    FROM players p
    INNER JOIN matches m ON p.team_id IN (m.home_team_id, m.away_team_id)
    WHERE m.match_id = ?
      AND p.player_id = ?
      AND p.status = 'ACTIVE'`,
    [matchId, playerId]
  );

  const player = rows[0];

  if (!player || player.team_side !== teamSide) {
    return null;
  }

  return {
    playerId: player.player_id,
    playerName: player.display_name,
    jerseyNumber: player.jersey_number,
    teamSide: player.team_side
  };
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTeamFoulCount(value: unknown) {
  if (!value || typeof value !== "object") {
    return { home: 0, away: 0 };
  }

  const candidate = value as { home?: unknown; away?: unknown };
  return {
    home: numberOrDefault(candidate.home, 0),
    away: numberOrDefault(candidate.away, 0)
  };
}

function normalizeTeamFoulsByPeriod(value: unknown) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([period, fouls]) => [
      period,
      normalizeTeamFoulCount(fouls)
    ])
  );
}

function normalizeClockState(value: unknown, fallbackRemainingMs: number) {
  if (!value || typeof value !== "object") {
    return {
      remainingMs: fallbackRemainingMs,
      running: false,
      lastStartedAt: null
    };
  }

  const candidate = value as { remainingMs?: unknown; running?: unknown; lastStartedAt?: unknown };
  return {
    remainingMs: numberOrDefault(candidate.remainingMs, fallbackRemainingMs),
    running: candidate.running === true,
    lastStartedAt: typeof candidate.lastStartedAt === "string" ? candidate.lastStartedAt : null
  };
}

function normalizeTimeouts(value: unknown) {
  if (!value || typeof value !== "object") {
    return createDefaultTimeouts();
  }

  const candidate = value as {
    home?: { used?: unknown; remaining?: unknown };
    away?: { used?: unknown; remaining?: unknown };
  };
  const homeUsed = numberOrDefault(candidate.home?.used, 0);
  const awayUsed = numberOrDefault(candidate.away?.used, 0);
  return {
    home: {
      used: homeUsed,
      remaining: numberOrDefault(candidate.home?.remaining, Math.max(0, 5 - homeUsed))
    },
    away: {
      used: awayUsed,
      remaining: numberOrDefault(candidate.away?.remaining, Math.max(0, 5 - awayUsed))
    }
  };
}

function createDefaultTimeouts() {
  return {
    home: { used: 0, remaining: 5 },
    away: { used: 0, remaining: 5 }
  };
}

function normalizeTimeoutsByHalf(value: unknown) {
  if (!value || typeof value !== "object") {
    return createDefaultTimeoutsByHalf();
  }

  const candidate = value as Record<string, unknown>;
  return {
    firstHalf: normalizeTimeoutSide(candidate.firstHalf),
    secondHalf: normalizeTimeoutSide(candidate.secondHalf),
    overtime: normalizeTimeoutSide(candidate.overtime)
  };
}

function createDefaultTimeoutsByHalf() {
  return {
    firstHalf: { home: 0, away: 0 },
    secondHalf: { home: 0, away: 0 },
    overtime: { home: 0, away: 0 }
  };
}

function normalizeTimeoutSide(value: unknown) {
  if (!value || typeof value !== "object") {
    return { home: 0, away: 0 };
  }

  const candidate = value as { home?: unknown; away?: unknown };
  return {
    home: numberOrDefault(candidate.home, 0),
    away: numberOrDefault(candidate.away, 0)
  };
}

function normalizeActiveTimeout(value: unknown): NonNullable<ApiScoreboardProjection["activeTimeout"]> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as NonNullable<ApiScoreboardProjection["activeTimeout"]>;
  if (candidate.teamSide !== "HOME" && candidate.teamSide !== "AWAY") {
    return null;
  }

  return {
    teamSide: candidate.teamSide,
    startedAt: typeof candidate.startedAt === "string" ? candidate.startedAt : new Date(0).toISOString(),
    durationMs: numberOrDefault(candidate.durationMs, 60000),
    remainingMs: numberOrDefault(candidate.remainingMs, 60000),
    requestedBy:
      candidate.requestedBy === "HEAD_COACH" ||
      candidate.requestedBy === "ASSISTANT_COACH" ||
      candidate.requestedBy === "BENCH" ||
      candidate.requestedBy === "OFFICIAL" ||
      candidate.requestedBy === "OTHER"
        ? candidate.requestedBy
        : "OTHER"
  };
}

function normalizeFinalScore(value: unknown): NonNullable<ApiScoreboardProjection["finalScore"]> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { home?: unknown; away?: unknown };
  return {
    home: numberOrDefault(candidate.home, 0),
    away: numberOrDefault(candidate.away, 0)
  };
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
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
