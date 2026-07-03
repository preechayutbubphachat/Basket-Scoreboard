import type { TournamentScheduleMatch } from "@basket-scoreboard/api-contracts";

export type ScheduleStatusFilter = "all" | "scheduled" | "live" | "finished";

export function buildAdminTournamentScheduleLink(tournamentId: string) {
  return `/admin/tournaments/${encodeURIComponent(tournamentId)}/schedule`;
}

export function buildPublicTournamentScheduleLink(tournamentId: string) {
  return `/public/tournaments/${encodeURIComponent(tournamentId)}/schedule`;
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
