import type { Pool, RowDataPacket } from "mysql2/promise";
import type {
  LiveDashboardMatchItem,
  LiveDashboardWarning,
  ScheduleConflictWarning,
  TournamentScheduleMatch,
  TournamentLiveDashboardResponse,
  TournamentScheduleResponse,
  TournamentSummary
} from "@basket-scoreboard/api-contracts";
import { parseJsonField } from "../matchEventStore/json.js";
import {
  buildMatchOperationLinks,
  getReadinessForMatches
} from "../matchReadiness/matchReadinessService.js";

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
  court_id: string | null;
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
  periodNumber?: unknown;
  period?: unknown;
  periodType?: unknown;
  gameClockRemainingMs?: unknown;
  shotClockRemainingMs?: unknown;
  gameClock?: {
    remainingMs?: unknown;
    running?: unknown;
  };
  shotClock?: {
    remainingMs?: unknown;
    running?: unknown;
  };
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

  const publicMatchFilter = options.publicOnly
    ? "AND m.status IN ('SCHEDULED', 'LIVE', 'FINAL')"
    : "";

  const [rows] = await pool.query<ScheduleRow[]>(
    `
    SELECT
      m.match_id,
      m.tournament_id,
      t.name AS tournament_name,
      NULL AS stage_name,
      NULL AS group_name,
      m.match_code AS round_label,
      JSON_UNQUOTE(JSON_EXTRACT(m.metadata, '$.courtId')) AS court_id,
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
      ${publicMatchFilter}
    ORDER BY m.scheduled_at IS NULL, m.scheduled_at ASC, m.created_at ASC
    `,
    [tournamentId]
  );

  const matches = rows.map(serializeScheduleRow);

  return {
    tournament,
    matches: options.publicOnly
      ? matches
      : await decorateProtectedScheduleRows(pool, matches),
    generatedAt: new Date().toISOString()
  };
}

export async function getTournamentLiveDashboard(
  pool: Pool,
  tournamentId: string
): Promise<TournamentLiveDashboardResponse | null> {
  const schedule = await getTournamentSchedule(pool, tournamentId);
  if (!schedule) {
    return null;
  }

  return {
    tournamentId: schedule.tournament.tournamentId,
    tournament: schedule.tournament,
    generatedAt: schedule.generatedAt,
    matches: schedule.matches.map(toLiveDashboardMatch)
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

async function decorateProtectedScheduleRows(
  pool: Pool,
  matches: TournamentScheduleMatch[]
): Promise<TournamentScheduleMatch[]> {
  const conflictsByMatchId = deriveScheduleConflicts(matches);
  const readinessByMatchId = await getReadinessForMatches(pool, matches.map((match) => ({
    matchId: match.matchId,
    status: match.status
  })));
  return matches.map((match) => {
    const decorated: TournamentScheduleMatch = {
      ...match,
      conflicts: conflictsByMatchId.get(match.matchId) ?? [],
      operations: buildMatchOperationLinks(match.matchId)
    };
    const readiness = readinessByMatchId.get(match.matchId);
    if (readiness) {
      decorated.readiness = readiness;
    }
    return decorated;
  });
}

function serializeScheduleRow(row: ScheduleRow): TournamentScheduleMatch {
  const projection = row.projection_data ? parseJsonField<ProjectionLike>(row.projection_data) ?? {} : {};
  const projectedStatus = stringOrNull(projection.status);
  const status = projectedStatus === "READY" && row.match_status
    ? row.match_status
    : projectedStatus ?? row.match_status ?? "SCHEDULED";
  const currentSeq = numberOrDefault(projection.currentSeq, numberOrDefault(row.last_event_seq, 0));
  const gameClockRemainingMs = numberOrDefault(
    projection.gameClock?.remainingMs,
    numberOrDefault(projection.gameClockRemainingMs, 600000)
  );
  const shotClockRemainingMs = numberOrDefault(
    projection.shotClock?.remainingMs,
    numberOrDefault(projection.shotClockRemainingMs, 24000)
  );

  return {
    matchId: row.match_id,
    tournamentId: row.tournament_id,
    stageName: labelOrNull(row.stage_name),
    groupName: labelOrNull(row.group_name),
    roundLabel: labelOrNull(row.round_label),
    courtId: labelOrNull(row.court_id),
    courtLabel: labelOrNull(row.court_label),
    venueLabel: labelOrNull(row.venue_label),
    scheduledAt: serializeDate(row.scheduled_at),
    homeTeamId: row.home_team_id,
    homeTeamName: labelOrNull(row.home_team_name) ?? "HOME",
    awayTeamId: row.away_team_id,
    awayTeamName: labelOrNull(row.away_team_name) ?? "AWAY",
    status,
    periodNumber: numberOrDefault(projection.periodNumber, numberOrDefault(projection.period, 1)),
    periodType: stringOrNull(projection.periodType) ?? "REGULATION",
    gameClockRemainingMs,
    gameClockRunning: booleanOrDefault(projection.gameClock?.running, false),
    shotClockRemainingMs,
    shotClockRunning: booleanOrDefault(projection.shotClock?.running, false),
    homeScore: numberOrDefault(projection.homeScore, 0),
    awayScore: numberOrDefault(projection.awayScore, 0),
    currentSeq,
    publicScoreboardPath: `/public/scoreboard/${encodeURIComponent(row.match_id)}`
  };
}

function toLiveDashboardMatch(match: TournamentScheduleMatch): LiveDashboardMatchItem {
  const links = match.operations ?? buildMatchOperationLinks(match.matchId);
  const warnings = deriveLiveDashboardWarnings(match);

  return {
    matchId: match.matchId,
    tournamentId: match.tournamentId ?? "",
    homeTeamName: match.homeTeamName,
    awayTeamName: match.awayTeamName,
    venueLabel: match.venueLabel,
    courtLabel: match.courtLabel,
    scheduledAt: match.scheduledAt,
    status: match.status,
    period: match.periodNumber ?? 1,
    periodType: match.periodType ?? "REGULATION",
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    gameClockRemainingMs: match.gameClockRemainingMs ?? 600000,
    gameClockRunning: match.gameClockRunning ?? false,
    shotClockRemainingMs: match.shotClockRemainingMs ?? 24000,
    shotClockRunning: match.shotClockRunning ?? false,
    currentSeq: match.currentSeq,
    readiness: match.readiness ?? null,
    warnings,
    links: {
      score: links.operatorScoreUrl,
      fouls: links.operatorFoulsUrl,
      clock: links.operatorClockUrl,
      timeouts: links.operatorTimeoutsUrl,
      corrections: `/operator/matches/${encodeURIComponent(match.matchId)}/corrections`,
      summary: links.summaryUrl,
      replay: links.replayUrl,
      auditLog: links.auditLogUrl,
      publicScoreboard: match.publicScoreboardPath
    }
  };
}

function deriveLiveDashboardWarnings(match: TournamentScheduleMatch): LiveDashboardWarning[] {
  const warnings: LiveDashboardWarning[] = [];
  const normalizedStatus = match.status.toUpperCase();

  if (normalizedStatus === "LIVE" && !match.gameClockRunning) {
    warnings.push({ code: "CLOCK_STOPPED_LIVE", label: "Live game clock stopped", severity: "WARNING" });
  }
  if (normalizedStatus === "LIVE" && !match.shotClockRunning) {
    warnings.push({ code: "SHOT_CLOCK_STOPPED_LIVE", label: "Live shot clock stopped", severity: "WARNING" });
  }
  if (!match.readiness) {
    warnings.push({ code: "PROJECTION_STALE", label: "Readiness unknown", severity: "INFO" });
  } else {
    if (match.readiness.officials.state === "MISSING") {
      warnings.push({ code: "OFFICIALS_MISSING", label: "Officials missing", severity: "WARNING" });
    }
    if (match.readiness.roster.state === "MISSING") {
      warnings.push({ code: "ROSTER_MISSING", label: "Roster missing", severity: "WARNING" });
    }
    if (match.readiness.lineup.state === "MISSING") {
      warnings.push({ code: "LINEUP_MISSING", label: "Lineup missing", severity: "WARNING" });
    }
    if (
      match.readiness.officials.state !== "READY"
      || match.readiness.roster.state !== "READY"
      || match.readiness.lineup.state !== "READY"
    ) {
      warnings.push({ code: "CHECKLIST_INCOMPLETE", label: "Checklist incomplete", severity: "INFO" });
    }
  }
  if ((match.conflicts?.length ?? 0) > 0) {
    warnings.push({ code: "SCHEDULE_CONFLICT", label: "Schedule conflict warning", severity: "WARNING" });
  }
  if (!Number.isFinite(match.currentSeq)) {
    warnings.push({ code: "PROJECTION_STALE", label: "Projection sequence unknown", severity: "INFO" });
  }

  return warnings;
}

function deriveScheduleConflicts(matches: TournamentScheduleMatch[]) {
  const conflictsByMatchId = new Map<string, ScheduleConflictWarning[]>();

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index]!;
    for (let compareIndex = index + 1; compareIndex < matches.length; compareIndex += 1) {
      const candidate = matches[compareIndex]!;
      const conflictType = getScheduleConflictType(current, candidate);
      if (!conflictType || !current.scheduledAt) {
        continue;
      }

      const currentWarning = buildConflictWarning(current, candidate, conflictType);
      const candidateWarning = buildConflictWarning(candidate, current, conflictType);
      conflictsByMatchId.set(current.matchId, [...(conflictsByMatchId.get(current.matchId) ?? []), currentWarning]);
      conflictsByMatchId.set(candidate.matchId, [...(conflictsByMatchId.get(candidate.matchId) ?? []), candidateWarning]);
    }
  }

  return conflictsByMatchId;
}

function getScheduleConflictType(
  first: TournamentScheduleMatch,
  second: TournamentScheduleMatch
): ScheduleConflictWarning["type"] | null {
  if (!first.scheduledAt || first.scheduledAt !== second.scheduledAt) {
    return null;
  }

  if (first.courtId && second.courtId && first.courtId === second.courtId) {
    return "SAME_COURT_SAME_TIME";
  }

  if (!first.courtId && !second.courtId) {
    const firstVenue = normalizeLabel(first.venueLabel);
    const secondVenue = normalizeLabel(second.venueLabel);
    const firstCourt = normalizeLabel(first.courtLabel);
    const secondCourt = normalizeLabel(second.courtLabel);
    if (firstVenue && firstVenue === secondVenue && firstCourt && firstCourt === secondCourt) {
      return "LEGACY_SAME_COURT_SAME_TIME";
    }
  }

  return null;
}

function buildConflictWarning(
  match: TournamentScheduleMatch,
  conflictingMatch: TournamentScheduleMatch,
  type: ScheduleConflictWarning["type"]
): ScheduleConflictWarning {
  const conflictingLabel = `${conflictingMatch.homeTeamName} vs ${conflictingMatch.awayTeamName}`;
  return {
    conflictId: `${match.matchId}:${conflictingMatch.matchId}:${match.scheduledAt}`,
    severity: "WARNING",
    type,
    message: `Same court and scheduled time as match ${conflictingLabel}.`,
    matchId: match.matchId,
    conflictingMatchId: conflictingMatch.matchId,
    scheduledAt: match.scheduledAt ?? "",
    courtId: match.courtId,
    venueLabel: match.venueLabel,
    courtLabel: match.courtLabel
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

function booleanOrDefault(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
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

function normalizeLabel(value: string | null) {
  return labelOrNull(value)?.toLowerCase() ?? null;
}
