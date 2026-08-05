import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  PublicFinalSummary,
  PublicFinalSummaryProjection
} from "@basket-scoreboard/api-contracts";
import {
  deriveFinalOutcome,
  normalizeScoreboardProjection,
  type ScoreboardProjection
} from "../matchEventStore/projection.js";
import { parseJsonField } from "../matchEventStore/json.js";

const unavailableMessage = "Final summary is not available.";

type ProjectionRow = RowDataPacket & {
  projection_data: unknown;
};

export type PublicFinalSummaryLabels = {
  matchId: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  tournamentLabel: string | null;
  roundLabel: string | null;
  venueLabel: string | null;
  courtLabel: string | null;
};

type PublicFinalSummaryLabelRow = RowDataPacket & {
  match_id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  tournament_label: string | null;
  round_label: string | null;
  venue_label: string | null;
  court_label: string | null;
};

export async function resolvePublicFinalSummaryProjection(
  pool: Pool,
  matchId: string
): Promise<PublicFinalSummaryProjection> {
  const connection = await pool.getConnection();

  try {
    const projection = await getAuthoritativeScoreboardProjection(connection, matchId);
    const labels = await getPublicFinalSummaryLabels(connection, matchId);
    return buildPublicFinalSummaryProjection(matchId, projection, labels);
  } finally {
    connection.release();
  }
}

export function buildPublicFinalSummaryProjection(
  matchId: string,
  projection: ScoreboardProjection | null,
  labels: PublicFinalSummaryLabels | null
): PublicFinalSummaryProjection {
  if (
    !projection ||
    !labels ||
    projection.matchId !== matchId ||
    labels.matchId !== matchId ||
    !isFinishedStatus(projection.status) ||
    !isValidScore(projection.homeScore) ||
    !isValidScore(projection.awayScore) ||
    !labels.homeTeamId ||
    !labels.awayTeamId ||
    labels.homeTeamId === labels.awayTeamId
  ) {
    return unavailable(matchId);
  }

  const homeTeamName = requiredLabel(labels.homeTeamName);
  const awayTeamName = requiredLabel(labels.awayTeamName);
  if (!homeTeamName || !awayTeamName) {
    return unavailable(matchId);
  }

  const outcome = deriveFinalOutcome(projection.homeScore, projection.awayScore);
  const winnerDisplayName = outcome.winnerSide === "HOME"
    ? homeTeamName
    : outcome.winnerSide === "AWAY"
      ? awayTeamName
      : null;

  return {
    matchId,
    status: "FINAL",
    homeTeamName,
    awayTeamName,
    homeScore: outcome.finalScore.home,
    awayScore: outcome.finalScore.away,
    winnerSide: outcome.winnerSide,
    winnerDisplayName,
    tournamentLabel: optionalLabel(labels.tournamentLabel),
    roundLabel: optionalLabel(labels.roundLabel),
    venueLabel: optionalLabel(labels.venueLabel),
    courtLabel: optionalLabel(labels.courtLabel),
    completedAt: validIsoOrNull(projection.matchFinishedAt)
  } satisfies PublicFinalSummary;
}

async function getAuthoritativeScoreboardProjection(connection: PoolConnection, matchId: string) {
  const [rows] = await connection.query<ProjectionRow[]>(
    `SELECT projection_data
     FROM match_projections
     WHERE match_id = ? AND projection_type = 'scoreboard'
     LIMIT 1`,
    [matchId]
  );
  let raw: (Partial<ScoreboardProjection> & { matchId?: unknown }) | null = null;
  try {
    raw = rows[0]?.projection_data
      ? parseJsonField<Partial<ScoreboardProjection> & { matchId?: unknown }>(rows[0].projection_data)
      : null;
  } catch {
    return null;
  }

  if (!isStrictProjectionInput(raw, matchId)) {
    return null;
  }

  return normalizeScoreboardProjection(raw);
}

async function getPublicFinalSummaryLabels(connection: PoolConnection, matchId: string) {
  const [rows] = await connection.query<PublicFinalSummaryLabelRow[]>(
    `SELECT
       m.match_id,
       m.home_team_id,
       m.away_team_id,
       home.name AS home_team_name,
       away.name AS away_team_name,
       t.name AS tournament_label,
       m.match_code AS round_label,
       m.venue_name AS venue_label,
       JSON_UNQUOTE(JSON_EXTRACT(m.metadata, '$.courtLabel')) AS court_label
     FROM matches m
     LEFT JOIN teams home ON home.team_id = m.home_team_id
     LEFT JOIN teams away ON away.team_id = m.away_team_id
     LEFT JOIN tournaments t ON t.tournament_id = m.tournament_id
     WHERE m.match_id = ?
     LIMIT 1`,
    [matchId]
  );
  const row = rows[0];
  return row
    ? {
        matchId: row.match_id,
        homeTeamId: row.home_team_id,
        awayTeamId: row.away_team_id,
        homeTeamName: row.home_team_name,
        awayTeamName: row.away_team_name,
        tournamentLabel: row.tournament_label,
        roundLabel: row.round_label,
        venueLabel: row.venue_label,
        courtLabel: row.court_label
      }
    : null;
}

function unavailable(matchId: string): PublicFinalSummaryProjection {
  return { matchId, status: "UNAVAILABLE", message: unavailableMessage };
}

function isStrictProjectionInput(
  value: Partial<ScoreboardProjection> & { matchId?: unknown } | null,
  matchId: string
): value is Partial<ScoreboardProjection> & { matchId: string } {
  return Boolean(
    value &&
    value.matchId === matchId &&
    typeof value.status === "string" &&
    isValidScore(value.homeScore) &&
    isValidScore(value.awayScore)
  );
}

function isFinishedStatus(status: string) {
  return status === "FINISHED" || status === "FINAL";
}

function isValidScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function requiredLabel(value: string | null) {
  const label = optionalLabel(value);
  return label && label.toUpperCase() !== "HOME" && label.toUpperCase() !== "AWAY" ? label : null;
}

function optionalLabel(value: string | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validIsoOrNull(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}
