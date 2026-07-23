import type { LiveDashboardMatchItem } from "@basket-scoreboard/api-contracts";
import { formatClockMs, formatShotClockMs } from "./clockControl";
import { buildAdminTournamentScheduleLink } from "./scheduleControl";

export type LiveDashboardFilter = "all" | "live" | "scheduled" | "finished" | "warnings";

export function buildAdminTournamentLiveDashboardLink(tournamentId: string) {
  return `/admin/tournaments/${encodeURIComponent(tournamentId)}/live-dashboard`;
}

export function buildOperatorTournamentLiveDashboardLink(tournamentId: string) {
  return `/operator/tournaments/${encodeURIComponent(tournamentId)}/live-dashboard`;
}

export function buildLiveDashboardFilters(): Array<{ value: LiveDashboardFilter; label: string }> {
  return [
    { value: "all", label: "All" },
    { value: "live", label: "Live" },
    { value: "scheduled", label: "Scheduled" },
    { value: "finished", label: "Finished" },
    { value: "warnings", label: "Warnings" }
  ];
}

export function filterLiveDashboardMatches(
  matches: LiveDashboardMatchItem[],
  filter: LiveDashboardFilter
) {
  if (filter === "all") return matches;
  if (filter === "warnings") return matches.filter((match) => match.warnings.length > 0);
  return matches.filter((match) => getLiveDashboardStatusGroup(match.status) === filter);
}

export function getLiveDashboardStatusGroup(status: string): Exclude<LiveDashboardFilter, "all" | "warnings"> {
  const normalized = status.toUpperCase();
  if (normalized === "LIVE" || normalized === "PERIOD_BREAK" || normalized === "TIMEOUT" || normalized === "OVERTIME") {
    return "live";
  }
  if (normalized === "FINISHED" || normalized === "FINAL") {
    return "finished";
  }
  return "scheduled";
}

export function buildLiveDashboardSummary(matches: LiveDashboardMatchItem[]) {
  return {
    total: matches.length,
    live: matches.filter((match) => getLiveDashboardStatusGroup(match.status) === "live").length,
    scheduled: matches.filter((match) => getLiveDashboardStatusGroup(match.status) === "scheduled").length,
    finished: matches.filter((match) => getLiveDashboardStatusGroup(match.status) === "finished").length,
    warnings: matches.filter((match) => match.warnings.length > 0).length
  };
}

export function buildLiveDashboardCard(match: LiveDashboardMatchItem) {
  const locationParts = [labelOrNull(match.venueLabel), labelOrNull(match.courtLabel)].filter(Boolean);
  return {
    matchupLabel: `${labelOrNull(match.homeTeamName) ?? "TBD"} vs ${labelOrNull(match.awayTeamName) ?? "TBD"}`,
    scoreLabel: `${match.homeScore} - ${match.awayScore}`,
    locationLabel: locationParts.length > 0 ? locationParts.join(" / ") : "Court TBD",
    scheduleLabel: match.scheduledAt ? formatDateTime(match.scheduledAt) : "Schedule pending",
    periodLabel: `${match.periodType} P${match.period}`,
    gameClockLabel: `${formatClockMs(match.gameClockRemainingMs)} ${match.gameClockRunning ? "running" : "stopped"}`,
    shotClockLabel: match.shotClockRemainingMs === null
      ? "Shot clock TBD"
      : `${formatShotClockMs(match.shotClockRemainingMs)} ${match.shotClockRunning ? "running" : "stopped"}`,
    seqLabel: `Seq ${match.currentSeq}`,
    scheduleHref: buildAdminTournamentScheduleLink(match.tournamentId)
  };
}

export function getLiveDashboardEmptyState(matchCount: number, filteredCount: number, filter: LiveDashboardFilter) {
  if (filteredCount > 0) return null;
  if (matchCount === 0) {
    return "No matches scheduled yet.";
  }
  if (filter === "live") {
    return "No live matches right now.";
  }
  return "No matches match the current filter.";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function labelOrNull(value: string | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.toLowerCase() !== "null" ? trimmed : null;
}
