import {
  assignmentRoleAllowsPermission,
  type AuthenticatedUser,
  type OperatorMatchSummary,
  type PermissionCode
} from "@basket-scoreboard/api-contracts";

export function canAccessOperatorMatches(user: AuthenticatedUser | null) {
  return user?.role === "ADMIN" || user?.role === "SCORER" || user?.role === "REFEREE";
}

export function canOperateMatchPermission(
  user: AuthenticatedUser | null,
  matchId: string,
  permission: PermissionCode
) {
  if (!user?.permissions.includes(permission)) return false;
  if (user.role === "ADMIN") return true;

  if (user.matchAssignments) {
    return user.matchAssignments.some(
      (assignment) =>
        assignment.matchId === matchId &&
        assignment.assignmentStatus === "ACTIVE" &&
        assignmentRoleAllowsPermission(assignment.roleCode, permission)
    );
  }

  return user.assignedMatchIds.includes(matchId);
}

export function canOperateScore(user: AuthenticatedUser | null, matchId: string) {
  return canOperateMatchPermission(user, matchId, "match.score.operate");
}

export function canOperateFoul(user: AuthenticatedUser | null, matchId: string) {
  return canOperateMatchPermission(user, matchId, "match.foul.operate");
}

export function canOperateGameClock(user: AuthenticatedUser | null, matchId: string) {
  return canOperateMatchPermission(user, matchId, "match.clock.game.operate");
}

export function canOperateShotClock(user: AuthenticatedUser | null, matchId: string) {
  return canOperateMatchPermission(user, matchId, "match.clock.shot.operate");
}

export function canOperateTimeout(user: AuthenticatedUser | null, matchId: string) {
  return canOperateMatchPermission(user, matchId, "match.timeout.operate");
}

export function canOperateLifecycle(user: AuthenticatedUser | null, matchId: string) {
  return canOperateMatchPermission(user, matchId, "match.lifecycle.operate");
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
      label: "Setup Roster"
    },
    lineup: {
      href: `/admin/matches/${encodeURIComponent(matchId)}/lineup`,
      label: "Setup Lineup"
    },
    summary: {
      href: `/admin/matches/${encodeURIComponent(matchId)}/summary`,
      label: "Summary"
    },
    replay: {
      href: `/admin/matches/${encodeURIComponent(matchId)}/replay`,
      label: "Replay"
    },
    auditLog: {
      href: `/admin/matches/${encodeURIComponent(matchId)}/audit-log`,
      label: "Audit Log"
    },
    corrections: {
      href: buildOperatorMatchCorrectionsLink(matchId),
      label: "Corrections"
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
      label: "Start / Lifecycle"
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

export function buildOperatorMatchReplayLink(matchId: string) {
  return `/operator/matches/${encodeURIComponent(matchId)}/replay`;
}

export function buildOperatorMatchAuditLogLink(matchId: string) {
  return `/operator/matches/${encodeURIComponent(matchId)}/audit-log`;
}

export function buildOperatorMatchCorrectionsLink(matchId: string) {
  return `/operator/matches/${encodeURIComponent(matchId)}/corrections`;
}

export function canReadAuditLog(user: AuthenticatedUser | null) {
  return user?.permissions.includes("match.audit.read") ?? false;
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
  const venueParts = [match.venueLabel ?? match.venueName, match.courtLabel].filter(Boolean);
  const readiness = match.readiness;
  const officialRoles = readiness?.officials.roles?.map((official) => official.role).filter(Boolean) ?? [];
  const officialReadinessLabel = readiness
    ? `Officials ${readiness.officials.state}${officialRoles.length ? ` (${Array.from(new Set(officialRoles)).sort().join(", ")})` : ""}`
    : null;
  return {
    title: getTeamLabel(match),
    tournamentLabel: match.tournamentName ?? "Tournament pending",
    statusLabel: match.status,
    scheduledLabel: match.scheduledAt ? new Date(match.scheduledAt).toLocaleString() : "Schedule pending",
    venueLabel: venueParts.length ? venueParts.join(" / ") : "Venue pending",
    assignedRolesLabel: match.assignedRoleCodes.length ? `Your role: ${match.assignedRoleCodes.join(", ")}` : "No active role",
    currentSeqLabel: `Seq ${match.currentSeq}`,
    readinessLabel: readiness
      ? `${officialReadinessLabel} / Roster ${readiness.roster.state} / Lineup ${readiness.lineup.state} / ${readiness.lifecycle.label}`
      : "Readiness unknown",
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
    replay: {
      enabled: true,
      href: buildOperatorMatchReplayLink(match.matchId),
      label: "Open Replay"
    },
    publicScoreboard: {
      enabled: true,
      href: buildPublicScoreboardLink(match.matchId),
      label: "Public Scoreboard"
    }
  };
}
