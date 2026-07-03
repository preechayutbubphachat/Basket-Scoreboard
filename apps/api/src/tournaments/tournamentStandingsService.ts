import type { Pool, RowDataPacket } from "mysql2/promise";
import type {
  TournamentStandingsResponse,
  TournamentStandingsRow
} from "@basket-scoreboard/api-contracts";
import { parseJsonField } from "../matchEventStore/json.js";
import { getTournamentSummary } from "./tournamentScheduleService.js";

const STANDINGS_RULES_NOTICE =
  "[NEEDS SOURCE] Missing governing document: official tournament standings and tiebreak rules.";

type StandingsMatchRow = RowDataPacket & {
  match_id: string;
  home_team_id: string | null;
  home_team_name: string | null;
  away_team_id: string | null;
  away_team_name: string | null;
  match_status: string | null;
  projection_data: unknown | null;
};

type ProjectionLike = {
  status?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
};

type MutableStandingsRow = TournamentStandingsRow & {
  unresolvedResult: boolean;
};

export async function getTournamentStandings(
  pool: Pool,
  tournamentId: string,
  options: { publicOnly?: boolean } = {}
): Promise<TournamentStandingsResponse | null> {
  const tournament = await getTournamentSummary(pool, tournamentId, options);
  if (!tournament) {
    return null;
  }

  const [rows] = await pool.query<StandingsMatchRow[]>(
    `
    SELECT
      m.match_id,
      m.home_team_id,
      home.name AS home_team_name,
      m.away_team_id,
      away.name AS away_team_name,
      m.status AS match_status,
      mp.projection_data
    FROM matches m
    LEFT JOIN teams home ON home.team_id = m.home_team_id
    LEFT JOIN teams away ON away.team_id = m.away_team_id
    LEFT JOIN match_projections mp ON mp.match_id = m.match_id
      AND mp.projection_type = 'scoreboard'
    WHERE m.tournament_id = ?
    ORDER BY m.scheduled_at IS NULL, m.scheduled_at ASC, m.created_at ASC
    `,
    [tournamentId]
  );

  const teams = new Map<string, MutableStandingsRow>();
  let finishedMatchCount = 0;
  let excludedMatchCount = 0;

  for (const row of rows) {
    const projection = row.projection_data ? parseJsonField<ProjectionLike>(row.projection_data) ?? {} : {};
    const status = stringOrNull(projection.status) ?? row.match_status ?? "SCHEDULED";
    const homeScore = numberOrDefault(projection.homeScore, 0);
    const awayScore = numberOrDefault(projection.awayScore, 0);
    const home = row.home_team_id ? getOrCreateRow(teams, row.home_team_id, row.home_team_name ?? "HOME") : null;
    const away = row.away_team_id ? getOrCreateRow(teams, row.away_team_id, row.away_team_name ?? "AWAY") : null;

    if (isFinishedStatus(status)) {
      finishedMatchCount += 1;
      applyFinishedResult(home, away, homeScore, awayScore);
      continue;
    }

    excludedMatchCount += 1;
    if (isLiveStatus(status)) {
      if (home) home.liveMatchesExcluded += 1;
      if (away) away.liveMatchesExcluded += 1;
    } else {
      if (home) home.scheduledMatchesExcluded += 1;
      if (away) away.scheduledMatchesExcluded += 1;
    }
  }

  const sortedRows = Array.from(teams.values()).sort((left, right) => {
    return (
      right.wins - left.wins ||
      right.pointDifferential - left.pointDifferential ||
      right.pointsFor - left.pointsFor ||
      left.teamName.localeCompare(right.teamName)
    );
  });

  markProvisionalTies(sortedRows);

  return {
    tournamentId: tournament.tournamentId,
    tournamentName: tournament.name,
    status: tournament.status,
    isOfficial: false,
    rulesNotice: STANDINGS_RULES_NOTICE,
    generatedAt: new Date().toISOString(),
    rows: sortedRows.map(({ unresolvedResult, ...row }) => row),
    summary: {
      teamCount: sortedRows.length,
      finishedMatchCount,
      excludedMatchCount
    }
  };
}

function getOrCreateRow(teams: Map<string, MutableStandingsRow>, teamId: string, teamName: string) {
  const existing = teams.get(teamId);
  if (existing) {
    if (existing.teamName === "HOME" || existing.teamName === "AWAY") {
      existing.teamName = teamName;
    }
    return existing;
  }

  const created: MutableStandingsRow = {
    teamId,
    teamName,
    played: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDifferential: 0,
    finishedMatchesCounted: 0,
    liveMatchesExcluded: 0,
    scheduledMatchesExcluded: 0,
    tieStatus: "CLEAR",
    unresolvedResult: false
  };
  teams.set(teamId, created);
  return created;
}

function applyFinishedResult(
  home: MutableStandingsRow | null,
  away: MutableStandingsRow | null,
  homeScore: number,
  awayScore: number
) {
  if (home) {
    home.played += 1;
    home.pointsFor += homeScore;
    home.pointsAgainst += awayScore;
    home.pointDifferential = home.pointsFor - home.pointsAgainst;
    home.finishedMatchesCounted += 1;
  }

  if (away) {
    away.played += 1;
    away.pointsFor += awayScore;
    away.pointsAgainst += homeScore;
    away.pointDifferential = away.pointsFor - away.pointsAgainst;
    away.finishedMatchesCounted += 1;
  }

  if (homeScore === awayScore) {
    if (home) home.unresolvedResult = true;
    if (away) away.unresolvedResult = true;
    return;
  }

  if (homeScore > awayScore) {
    if (home) home.wins += 1;
    if (away) away.losses += 1;
  } else {
    if (away) away.wins += 1;
    if (home) home.losses += 1;
  }
}

function markProvisionalTies(rows: MutableStandingsRow[]) {
  const buckets = new Map<string, MutableStandingsRow[]>();
  for (const row of rows) {
    const key = `${row.wins}:${row.pointDifferential}:${row.pointsFor}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  for (const row of rows) {
    const key = `${row.wins}:${row.pointDifferential}:${row.pointsFor}`;
    row.tieStatus = row.unresolvedResult || (buckets.get(key)?.length ?? 0) > 1 ? "TIE_UNRESOLVED" : "CLEAR";
  }
}

function isFinishedStatus(status: string) {
  const normalized = status.toUpperCase();
  return normalized === "FINISHED" || normalized === "FINAL";
}

function isLiveStatus(status: string) {
  const normalized = status.toUpperCase();
  return normalized === "LIVE" || normalized === "PERIOD_BREAK" || normalized === "TIMEOUT";
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
