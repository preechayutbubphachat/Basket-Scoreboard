import type { Pool, RowDataPacket } from "mysql2/promise";
import type {
  TournamentScheduleMatch,
  TournamentScheduleResponse,
  TournamentSummary
} from "@basket-scoreboard/api-contracts";
import { parseJsonField } from "../matchEventStore/json.js";

type TournamentRow = RowDataPacket & {
  tournament_id: string;
  name: string;
  status: string;
  match_count: number | string | null;
  live_match_count: number | string | null;
  finished_match_count: number | string | null;
};

type TournamentExistsRow = RowDataPacket & {
  tournament_exists: number | string;
};

type ScheduleRow = RowDataPacket & {
  match_id: string;
  tournament_id: string | null;
  tournament_name: string | null;
  stage_name: string | null;
  group_name: string | null;
  round_label: string | null;
  court_label: string | null;
  venue_label: string | null;
  scheduled_at: Date | string | null;
  home_team_id: string | null;
  home_team_name: string | null;
  away_team_id: string | null;
  away_team_name: string | null;
  match_status: string | null;
  projection_data: unknown | null;
  last_event_seq: number | string | null;
};

type ProjectionLike = {
  status?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
  currentSeq?: unknown;
};

export async function listTournamentSummaries(pool: Pool, options: { publicOnly?: boolean } = {}) {
  const statusFilter = options.publicOnly ? "WHERE t.status <> 'ARCHIVED'" : "";
  const [rows] = await pool.query<TournamentRow[]>(`
    SELECT
      t.tournament_id,
      t.name,
      t.status,
      COUNT(m.match_id) AS match_count,
      SUM(CASE WHEN COALESCE(JSON_UNQUOTE(JSON_EXTRACT(mp.projection_data, '$.status')), m.status) IN ('LIVE', 'PERIOD_BREAK', 'TIMEOUT') THEN 1 ELSE 0 END) AS live_match_count,
      SUM(CASE WHEN COALESCE(JSON_UNQUOTE(JSON_EXTRACT(mp.projection_data, '$.status')), m.status) IN ('FINISHED', 'FINAL') THEN 1 ELSE 0 END) AS finished_match_count
    FROM tournaments t
    LEFT JOIN matches m ON m.tournament_id = t.tournament_id
    LEFT JOIN match_projections mp ON mp.match_id = m.match_id
      AND mp.projection_type = 'scoreboard'
    ${statusFilter}
    GROUP BY t.tournament_id, t.name, t.status
    ORDER BY t.starts_at IS NULL, t.starts_at ASC, t.created_at DESC
  `);

  return rows.map(serializeTournamentSummary);
}

export async function getTournamentSchedule(
  pool: Pool,
  tournamentId: string,
  options: { publicOnly?: boolean } = {}
): Promise<TournamentScheduleResponse | null> {
  const tournament = await getTournamentSummary(pool, tournamentId, options);
  if (!tournament) {
    return null;
  }

  const [rows] = await pool.query<ScheduleRow[]>(
    `
    SELECT
      m.match_id,
      m.tournament_id,
      t.name AS tournament_name,
      NULL AS stage_name,
      NULL AS group_name,
      m.match_code AS round_label,
      JSON_UNQUOTE(JSON_EXTRACT(m.metadata, '$.courtLabel')) AS court_label,
      m.venue_name AS venue_label,
      m.scheduled_at,
      m.home_team_id,
      home.name AS home_team_name,
      m.away_team_id,
      away.name AS away_team_name,
      m.status AS match_status,
      mp.projection_data,
      mp.last_event_seq
    FROM matches m
    INNER JOIN tournaments t ON t.tournament_id = m.tournament_id
    LEFT JOIN teams home ON home.team_id = m.home_team_id
    LEFT JOIN teams away ON away.team_id = m.away_team_id
    LEFT JOIN match_projections mp ON mp.match_id = m.match_id
      AND mp.projection_type = 'scoreboard'
    WHERE m.tournament_id = ?
    ORDER BY m.scheduled_at IS NULL, m.scheduled_at ASC, m.created_at ASC
    `,
    [tournamentId]
  );

  return {
    tournament,
    matches: rows.map(serializeScheduleRow),
    generatedAt: new Date().toISOString()
  };
}

export async function getTournamentSummary(
  pool: Pool,
  tournamentId: string,
  options: { publicOnly?: boolean }
): Promise<TournamentSummary | null> {
  const [existsRows] = await pool.query<TournamentExistsRow[]>(
    `SELECT COUNT(*) AS tournament_exists
     FROM tournaments
     WHERE tournament_id = ?${options.publicOnly ? " AND status <> 'ARCHIVED'" : ""}`,
    [tournamentId]
  );

  if (numberOrDefault(existsRows[0]?.tournament_exists, 0) < 1) {
    return null;
  }

  const tournaments = await listTournamentSummaries(pool, options);
  return tournaments.find((tournament) => tournament.tournamentId === tournamentId) ?? null;
}

function serializeTournamentSummary(row: TournamentRow): TournamentSummary {
  return {
    tournamentId: row.tournament_id,
    name: row.name,
    status: row.status,
    matchCount: numberOrDefault(row.match_count, 0),
    liveMatchCount: numberOrDefault(row.live_match_count, 0),
    finishedMatchCount: numberOrDefault(row.finished_match_count, 0)
  };
}

function serializeScheduleRow(row: ScheduleRow): TournamentScheduleMatch {
  const projection = row.projection_data ? parseJsonField<ProjectionLike>(row.projection_data) ?? {} : {};
  const projectedStatus = stringOrNull(projection.status);
  const status = projectedStatus === "READY" && row.match_status
    ? row.match_status
    : projectedStatus ?? row.match_status ?? "SCHEDULED";
  const currentSeq = numberOrDefault(projection.currentSeq, numberOrDefault(row.last_event_seq, 0));

  return {
    matchId: row.match_id,
    tournamentId: row.tournament_id,
    stageName: labelOrNull(row.stage_name),
    groupName: labelOrNull(row.group_name),
    roundLabel: labelOrNull(row.round_label),
    courtLabel: labelOrNull(row.court_label),
    venueLabel: labelOrNull(row.venue_label),
    scheduledAt: serializeDate(row.scheduled_at),
    homeTeamId: row.home_team_id,
    homeTeamName: labelOrNull(row.home_team_name) ?? "HOME",
    awayTeamId: row.away_team_id,
    awayTeamName: labelOrNull(row.away_team_name) ?? "AWAY",
    status,
    homeScore: numberOrDefault(projection.homeScore, 0),
    awayScore: numberOrDefault(projection.awayScore, 0),
    currentSeq,
    publicScoreboardPath: `/public/scoreboard/${encodeURIComponent(row.match_id)}`
  };
}

function serializeDate(value: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function labelOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.toLowerCase() !== "null" ? trimmed : null;
}
