import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  reasonCodes,
  type CreateTeamRequest,
  type CreateTournamentMatchRequest,
  type CreateTournamentRequest,
  type ReasonCode,
  type TournamentScheduleMatch,
  type TournamentSetupTeam,
  type TournamentSummary
} from "@basket-scoreboard/api-contracts";
import { createMatch } from "../matchEventStore/createMatch.js";
import { getTournamentSchedule } from "./tournamentScheduleService.js";

type TeamRow = RowDataPacket & {
  team_id: string;
  tournament_id: string | null;
  name: string;
  short_name: string | null;
  status: string;
};

type TournamentRow = RowDataPacket & {
  tournament_id: string;
  name: string;
  status: string;
};

type SetupResult<T> =
  | { ok: true; statusCode: number; value: T }
  | { ok: false; statusCode: number; reasonCode: ReasonCode; message: string };

export async function createTournamentSetup(
  pool: Pool,
  input: CreateTournamentRequest
): Promise<TournamentSummary> {
  const tournamentId = randomUUID();
  await pool.query(
    "INSERT INTO tournaments (tournament_id, name, status, starts_at, ends_at, metadata) VALUES (?, ?, ?, ?, ?, ?)",
    [
      tournamentId,
      input.name,
      input.status,
      input.startsAt ? new Date(input.startsAt) : null,
      input.endsAt ? new Date(input.endsAt) : null,
      JSON.stringify({})
    ]
  );

  return {
    tournamentId,
    name: input.name,
    status: input.status,
    matchCount: 0,
    liveMatchCount: 0,
    finishedMatchCount: 0
  };
}

export async function listTournamentSetupTeams(pool: Pool): Promise<TournamentSetupTeam[]> {
  const [rows] = await pool.query<TeamRow[]>(
    "SELECT team_id, tournament_id, name, short_name, status FROM teams ORDER BY name ASC, created_at ASC"
  );
  return rows.map(serializeTeam);
}

export async function createTournamentSetupTeam(
  pool: Pool,
  input: CreateTeamRequest
): Promise<TournamentSetupTeam> {
  const teamId = randomUUID();
  await pool.query(
    "INSERT INTO teams (team_id, tournament_id, name, short_name, status, metadata) VALUES (?, ?, ?, ?, 'ACTIVE', ?)",
    [
      teamId,
      input.tournamentId ?? null,
      input.name,
      input.shortName ?? null,
      JSON.stringify({})
    ]
  );

  return {
    teamId,
    tournamentId: input.tournamentId ?? null,
    name: input.name,
    shortName: input.shortName ?? null,
    status: "ACTIVE"
  };
}

export async function createScheduledTournamentMatch(
  pool: Pool,
  tournamentId: string,
  input: CreateTournamentMatchRequest
): Promise<SetupResult<{ matchId: string; currentSeq: number; scheduleMatch: TournamentScheduleMatch }>> {
  if (!(await findTournament(pool, tournamentId))) {
    return { ok: false, statusCode: 404, reasonCode: reasonCodes.MATCH_NOT_FOUND, message: "Tournament was not found" };
  }

  const teams = await findTeams(pool, [input.homeTeamId, input.awayTeamId]);
  const home = teams.get(input.homeTeamId);
  const away = teams.get(input.awayTeamId);
  if (!home || !away) {
    return { ok: false, statusCode: 404, reasonCode: reasonCodes.MATCH_NOT_FOUND, message: "Team was not found" };
  }

  const teamMismatch = [home, away].some((team) => team.tournament_id !== null && team.tournament_id !== tournamentId);
  if (teamMismatch) {
    return {
      ok: false,
      statusCode: 422,
      reasonCode: reasonCodes.VALIDATION_ERROR,
      message: "Team does not belong to the selected tournament"
    };
  }

  const match = await createMatch({
    pool,
    input: {
      tournamentId,
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      scheduledAt: input.scheduledAt ?? null,
      matchCode: input.roundLabel ?? null,
      venueName: input.venueLabel ?? null,
      ruleProfileId: "FIBA_2024",
      metadata: { courtLabel: input.courtLabel ?? null }
    }
  });

  const schedule = await getTournamentSchedule(pool, tournamentId);
  const scheduleMatch = schedule?.matches.find((item) => item.matchId === match.matchId);
  if (!scheduleMatch) {
    return {
      ok: false,
      statusCode: 500,
      reasonCode: reasonCodes.INTERNAL_ERROR,
      message: "Created match could not be loaded from schedule projection"
    };
  }

  return {
    ok: true,
    statusCode: 201,
    value: {
      matchId: match.matchId,
      currentSeq: match.currentSeq,
      scheduleMatch
    }
  };
}

async function findTournament(pool: Pool, tournamentId: string) {
  const [rows] = await pool.query<TournamentRow[]>(
    "SELECT tournament_id, name, status FROM tournaments WHERE tournament_id = ? LIMIT 1",
    [tournamentId]
  );
  return rows[0] ?? null;
}

async function findTeams(pool: Pool, teamIds: [string, string]) {
  const [rows] = await pool.query<TeamRow[]>(
    "SELECT team_id, tournament_id, name, status FROM teams WHERE team_id IN (?, ?) AND status = 'ACTIVE'",
    teamIds
  );
  return new Map(rows.map((row) => [row.team_id, row]));
}

function serializeTeam(row: TeamRow): TournamentSetupTeam {
  return {
    teamId: row.team_id,
    tournamentId: row.tournament_id,
    name: row.name,
    shortName: row.short_name,
    status: row.status
  };
}
