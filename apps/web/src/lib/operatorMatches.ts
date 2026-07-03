import type { AuthenticatedUser, OperatorMatchSummary } from "@basket-scoreboard/api-contracts";

export function canAccessOperatorMatches(user: AuthenticatedUser | null) {
  return user?.role === "ADMIN" || user?.role === "SCORER" || user?.role === "REFEREE";
}

export function canOperateScore(user: AuthenticatedUser | null) {
  return user?.permissions.includes("match.score.operate") ?? false;
}

export function createEmptyOperatorMatchesMessage() {
  return "No assigned matches.";
}

export function buildAdminMatchLink(matchId: string) {
  return `/admin/matches/${encodeURIComponent(matchId)}/officials`;
}

export function buildAdminMatchActions(matchId: string) {
  return {
    officials: {
      href: buildAdminMatchLink(matchId),
      label: "Officials"
    },
    rosters: {
      href: `/admin/matches/${encodeURIComponent(matchId)}/rosters`,
      label: "Rosters"
    },
    lineup: {
      href: `/admin/matches/${encodeURIComponent(matchId)}/lineup`,
      label: "Lineup"
    },
    summary: {
      href: `/admin/matches/${encodeURIComponent(matchId)}/summary`,
      label: "Summary"
    },
    operator: {
      href: buildOperatorMatchScoreLink(matchId),
      label: "Operator Score"
    },
    fouls: {
      href: buildOperatorMatchFoulsLink(matchId),
      label: "Operator Fouls"
    },
    clock: {
      href: buildOperatorMatchClockLink(matchId),
      label: "Operator Clock"
    },
    timeouts: {
      href: buildOperatorMatchTimeoutsLink(matchId),
      label: "Operator Timeouts"
    },
    lifecycle: {
      href: buildOperatorMatchLifecycleLink(matchId),
      label: "Operator Lifecycle"
    },
    publicScoreboard: {
      href: buildPublicScoreboardLink(matchId),
      label: "Public scoreboard"
    }
  };
}

export function buildOperatorMatchScoreLink(matchId: string) {
  return `/operator/matches/${encodeURIComponent(matchId)}/score`;
}

export function buildOperatorMatchFoulsLink(matchId: string) {
  return `/operator/matches/${encodeURIComponent(matchId)}/fouls`;
}

export function buildOperatorMatchClockLink(matchId: string) {
  return `/operator/matches/${encodeURIComponent(matchId)}/clock`;
}

export function buildOperatorMatchTimeoutsLink(matchId: string) {
  return `/operator/matches/${encodeURIComponent(matchId)}/timeouts`;
}

export function buildOperatorMatchLifecycleLink(matchId: string) {
  return `/operator/matches/${encodeURIComponent(matchId)}/lifecycle`;
}

export function buildOperatorMatchSummaryLink(matchId: string) {
  return `/operator/matches/${encodeURIComponent(matchId)}/summary`;
}

export function buildPublicScoreboardLink(matchId: string) {
  return `/public/scoreboard/${encodeURIComponent(matchId)}`;
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
      enabled: true,
      href: buildOperatorMatchScoreLink(match.matchId),
      label: "Open Score Control"
    },
    foulControl: {
      enabled: true,
      href: buildOperatorMatchFoulsLink(match.matchId),
      label: "Open Foul Control"
    },
    clockControl: {
      enabled: true,
      href: buildOperatorMatchClockLink(match.matchId),
      label: "Open Clock Control"
    },
    timeoutControl: {
      enabled: true,
      href: buildOperatorMatchTimeoutsLink(match.matchId),
      label: "Open Timeout Control"
    },
    lifecycleControl: {
      enabled: true,
      href: buildOperatorMatchLifecycleLink(match.matchId),
      label: "Open Lifecycle Control"
    },
    summary: {
      enabled: true,
      href: buildOperatorMatchSummaryLink(match.matchId),
      label: "Open Match Summary"
    },
    publicScoreboard: {
      enabled: true,
      href: buildPublicScoreboardLink(match.matchId),
      label: "Public Scoreboard"
    }
  };
}
