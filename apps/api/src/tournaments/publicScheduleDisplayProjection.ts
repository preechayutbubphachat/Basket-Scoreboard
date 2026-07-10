import type { Pool } from "mysql2/promise";
import type {
  PublicScheduleDisplayProjection,
  PublicScheduleDisplayRow,
  PublicScheduleDisplayStatus,
  TournamentScheduleResponse
} from "@basket-scoreboard/api-contracts";
import { getTournamentSchedule } from "./tournamentScheduleService.js";

type ProjectionOptions = {
  courtId: string | null;
  limit: number;
};

export async function resolvePublicScheduleDisplayProjection(
  pool: Pool,
  tournamentId: string,
  options: ProjectionOptions
): Promise<PublicScheduleDisplayProjection | null> {
  const schedule = await getTournamentSchedule(pool, tournamentId, { publicOnly: true });
  return schedule ? buildPublicScheduleDisplayProjection(schedule, options) : null;
}

export function buildPublicScheduleDisplayProjection(
  schedule: TournamentScheduleResponse,
  options: ProjectionOptions
): PublicScheduleDisplayProjection {
  const limit = Math.max(1, Math.min(20, Math.trunc(options.limit)));
  const rows = schedule.matches
    .filter((match) => !options.courtId || match.courtId === options.courtId)
    .flatMap((match): PublicScheduleDisplayRow[] => {
      const status = normalizePublicScheduleStatus(match.status);
      if (!status || !match.homeTeamId || !match.awayTeamId) {
        return [];
      }

      return [{
        matchId: match.matchId,
        scheduledAt: match.scheduledAt,
        homeTeamName: match.homeTeamName,
        awayTeamName: match.awayTeamName,
        status,
        courtLabel: match.courtLabel,
        venueLabel: match.venueLabel,
        tournamentLabel: schedule.tournament.name,
        stageLabel: match.stageName,
        roundLabel: match.roundLabel
      }];
    })
    .slice(0, limit);

  return {
    tournamentLabel: schedule.tournament.name,
    rows,
    emptyMessage: rows.length === 0 ? "No public schedule entries available." : null
  };
}

function normalizePublicScheduleStatus(status: string): PublicScheduleDisplayStatus | null {
  switch (status.trim().toUpperCase()) {
    case "SCHEDULED":
    case "READY":
      return "SCHEDULED";
    case "LIVE":
    case "PERIOD_BREAK":
    case "OVERTIME":
    case "TIMEOUT":
      return "LIVE";
    case "FINISHED":
    case "FINAL":
      return "FINAL";
    default:
      return null;
  }
}
