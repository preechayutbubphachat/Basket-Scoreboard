import type { TournamentScheduleMatch, TournamentStandingsRow } from "@basket-scoreboard/api-contracts";

export type ScheduleStatusFilter = "all" | "scheduled" | "live" | "finished";

export function buildAdminTournamentScheduleLink(tournamentId: string) {
  return `/admin/tournaments/${encodeURIComponent(tournamentId)}/schedule`;
}

export function buildAdminTournamentStandingsLink(tournamentId: string) {
  return `/admin/tournaments/${encodeURIComponent(tournamentId)}/standings`;
}

export function buildPublicTournamentScheduleLink(tournamentId: string) {
  return `/public/tournaments/${encodeURIComponent(tournamentId)}/schedule`;
}

export function buildPublicTournamentStandingsLink(tournamentId: string) {
  return `/public/tournaments/${encodeURIComponent(tournamentId)}/standings`;
}

export function buildScheduleStatusFilters(): Array<{ value: ScheduleStatusFilter; label: string }> {
  return [
    { value: "all", label: "All" },
    { value: "scheduled", label: "Scheduled" },
    { value: "live", label: "Live" },
    { value: "finished", label: "Finished" }
  ];
}

export function getScheduleStatusGroup(status: string): ScheduleStatusFilter {
  const normalized = status.toUpperCase();
  if (normalized === "LIVE" || normalized === "PERIOD_BREAK" || normalized === "TIMEOUT") {
    return "live";
  }
  if (normalized === "FINISHED" || normalized === "FINAL") {
    return "finished";
  }
  return "scheduled";
}

export function buildScheduleRowMeta(match: TournamentScheduleMatch) {
  return {
    matchupLabel: `${match.homeTeamName} vs ${match.awayTeamName}`,
    scoreLabel: `${match.homeScore} - ${match.awayScore}`,
    scheduleLabel: match.scheduledAt ? new Date(match.scheduledAt).toLocaleString() : "Schedule pending",
    locationLabel: match.courtLabel ?? match.venueLabel ?? "Court pending",
    statusGroup: getScheduleStatusGroup(match.status)
  };
}

export function getPublicScheduleLinks(match: TournamentScheduleMatch) {
  return {
    scoreboard: {
      href: match.publicScoreboardPath,
      label: "Open Scoreboard"
    },
    summary: null,
    auditLog: null,
    replay: null,
    operator: null
  };
}

export function hasPublicScheduleMutationControls() {
  return false;
}

export function buildStandingsRowMeta(row: TournamentStandingsRow, provisionalRank: number) {
  return {
    provisionalRank,
    recordLabel: `${row.wins}-${row.losses}`,
    pointDifferentialLabel: row.pointDifferential > 0 ? `+${row.pointDifferential}` : String(row.pointDifferential),
    tieLabel: row.tieStatus === "TIE_UNRESOLVED" ? "Tie unresolved" : "Clear"
  };
}

export function getPublicStandingsLinks(tournamentId: string) {
  return {
    schedule: {
      href: buildPublicTournamentScheduleLink(tournamentId),
      label: "Open Public Schedule"
    },
    auditLog: null,
    replay: null,
    operator: null
  };
}

export function hasPublicStandingsMutationControls() {
  return false;
}
