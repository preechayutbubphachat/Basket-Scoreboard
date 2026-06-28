import type { AuthenticatedUser, OperatorMatchSummary } from "@basket-scoreboard/api-contracts";

export function canAccessOperatorMatches(user: AuthenticatedUser | null) {
  return user?.role === "ADMIN" || user?.role === "SCORER" || user?.role === "REFEREE";
}

export function createEmptyOperatorMatchesMessage() {
  return "No active match assignments found for this account.";
}

export function buildAdminMatchLink(matchId: string) {
  return `/admin/matches/${encodeURIComponent(matchId)}/officials`;
}

export function getTeamLabel(match: Pick<OperatorMatchSummary, "homeTeamName" | "homeTeamId" | "awayTeamName" | "awayTeamId">) {
  const home = match.homeTeamName ?? match.homeTeamId ?? "Home team pending";
  const away = match.awayTeamName ?? match.awayTeamId ?? "Away team pending";
  return `${home} vs ${away}`;
}

export function buildOperatorMatchCard(match: OperatorMatchSummary) {
  return {
    title: getTeamLabel(match),
    statusLabel: match.status,
    scheduledLabel: match.scheduledAt ? new Date(match.scheduledAt).toLocaleString() : "Schedule pending",
    venueLabel: match.venueName ?? "Venue pending",
    assignedRolesLabel: match.assignedRoleCodes.length ? match.assignedRoleCodes.join(", ") : "No active role",
    currentSeqLabel: `Seq ${match.currentSeq}`,
    scoreControl: {
      enabled: false,
      label: "Score Control: coming next"
    },
    publicScoreboard: {
      enabled: false,
      label: "Public Scoreboard: coming later"
    }
  };
}
