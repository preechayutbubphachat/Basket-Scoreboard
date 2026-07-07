import type {
  CreateCourtRequest,
  CreateTeamRequest,
  CreateTournamentMatchRequest,
  CreateTournamentRequest,
  CreateVenueRequest,
  TournamentScheduleMatch,
  TournamentStandingsRow,
  VenueSummary
} from "@basket-scoreboard/api-contracts";

export type ScheduleStatusFilter = "all" | "scheduled" | "live" | "finished";

export type TournamentFormState = {
  name: string;
  status: "ACTIVE" | "DRAFT";
  startsAt: string;
  endsAt: string;
};

export type TeamFormState = {
  tournamentId: string;
  name: string;
  shortName: string;
};

export type ScheduledMatchFormState = {
  homeTeamId: string;
  awayTeamId: string;
  courtId: string;
  scheduledAt: string;
  roundLabel: string;
  courtLabel: string;
  venueLabel: string;
};

export type VenueFormState = {
  name: string;
  shortName: string;
  address: string;
};

export type CourtFormState = {
  venueId: string;
  label: string;
  displayName: string;
};

export type VenueCourtOption = {
  value: string;
  label: string;
  venueName: string;
  courtLabel: string;
};

export type TournamentQuickLink = {
  href: string;
  label: string;
  private: boolean;
};

export type EmptyStateCopy = {
  title: string;
  description: string;
  helperText?: string;
  primaryActionLabel?: string;
};

export type ScheduledMatchFormFeedback = {
  disabled: boolean;
  warning: string | null;
};

export function buildAdminTournamentScheduleLink(tournamentId: string) {
  return `/admin/tournaments/${encodeURIComponent(tournamentId)}/schedule`;
}

export function buildAdminTournamentStandingsLink(tournamentId: string) {
  return `/admin/tournaments/${encodeURIComponent(tournamentId)}/standings`;
}

export function buildAdminTournamentLiveDashboardLink(tournamentId: string) {
  return `/admin/tournaments/${encodeURIComponent(tournamentId)}/live-dashboard`;
}

export function buildPublicTournamentScheduleLink(tournamentId: string) {
  return `/public/tournaments/${encodeURIComponent(tournamentId)}/schedule`;
}

export function buildPublicTournamentStandingsLink(tournamentId: string) {
  return `/public/tournaments/${encodeURIComponent(tournamentId)}/standings`;
}

export function buildTournamentQuickLinks(tournamentId: string): TournamentQuickLink[] {
  return [
    { href: buildAdminTournamentScheduleLink(tournamentId), label: "Schedule", private: true },
    { href: buildAdminTournamentLiveDashboardLink(tournamentId), label: "Live Dashboard", private: true },
    { href: buildAdminTournamentStandingsLink(tournamentId), label: "Standings", private: true },
    { href: buildPublicTournamentScheduleLink(tournamentId), label: "Public Schedule", private: false },
    { href: buildPublicTournamentStandingsLink(tournamentId), label: "Public Standings", private: false }
  ];
}

export function getTournamentEmptyState(): EmptyStateCopy {
  return {
    title: "No tournaments yet",
    description: "Create a tournament to start scheduling matches.",
    helperText: "After creating a tournament, add teams and scheduled matches.",
    primaryActionLabel: "Create Tournament"
  };
}

export function createTournamentFormState(): TournamentFormState {
  return { name: "", status: "ACTIVE", startsAt: "", endsAt: "" };
}

export function createTeamFormState(tournamentId: string): TeamFormState {
  return { tournamentId, name: "", shortName: "" };
}

export function createScheduledMatchFormState(): ScheduledMatchFormState {
  return {
    homeTeamId: "",
    awayTeamId: "",
    courtId: "",
    scheduledAt: "",
    roundLabel: "",
    courtLabel: "",
    venueLabel: ""
  };
}

export function createVenueFormState(): VenueFormState {
  return { name: "", shortName: "", address: "" };
}

export function createCourtFormState(): CourtFormState {
  return { venueId: "", label: "", displayName: "" };
}

export function createTournamentPayload(state: TournamentFormState): CreateTournamentRequest {
  return {
    name: state.name.trim(),
    status: state.status,
    startsAt: toIsoDateTimeOrNull(state.startsAt),
    endsAt: toIsoDateTimeOrNull(state.endsAt)
  };
}

export function createTeamPayload(state: TeamFormState): CreateTeamRequest {
  return {
    tournamentId: emptyToNull(state.tournamentId),
    name: state.name.trim(),
    shortName: emptyToNull(state.shortName)
  };
}

export function createTournamentMatchPayload(state: ScheduledMatchFormState): CreateTournamentMatchRequest {
  const courtId = emptyToNull(state.courtId);
  return {
    homeTeamId: state.homeTeamId,
    awayTeamId: state.awayTeamId,
    courtId,
    scheduledAt: toIsoDateTimeOrNull(state.scheduledAt),
    roundLabel: emptyToNull(state.roundLabel),
    courtLabel: courtId ? null : emptyToNull(state.courtLabel),
    venueLabel: courtId ? null : emptyToNull(state.venueLabel)
  };
}

export function createVenuePayload(state: VenueFormState): CreateVenueRequest {
  return {
    name: state.name.trim(),
    shortName: emptyToNull(state.shortName),
    address: emptyToNull(state.address)
  };
}

export function createCourtPayload(state: CourtFormState): CreateCourtRequest {
  return {
    label: state.label.trim(),
    displayName: emptyToNull(state.displayName)
  };
}

export function getScheduledMatchFormFeedback(
  state: ScheduledMatchFormState,
  teamCount: number,
  saving = false
): ScheduledMatchFormFeedback {
  if (saving) {
    return { disabled: true, warning: "Saving scheduled match..." };
  }
  if (teamCount < 2) {
    return { disabled: true, warning: "Create at least two teams before scheduling a match." };
  }
  if (!state.homeTeamId || !state.awayTeamId) {
    return { disabled: true, warning: "Select both Home and Away teams." };
  }
  if (state.homeTeamId === state.awayTeamId) {
    return { disabled: true, warning: "Home and Away teams must be different." };
  }
  return { disabled: false, warning: null };
}

export function getScheduledMatchConflictWarning(
  state: ScheduledMatchFormState,
  matches: TournamentScheduleMatch[],
  venues: VenueSummary[]
) {
  const scheduledAt = toIsoDateTimeOrNull(state.scheduledAt);
  if (!scheduledAt) {
    return null;
  }

  const selectedCourt = state.courtId
    ? buildVenueCourtOptions(venues).find((option) => option.value === state.courtId)
    : null;
  const selectedVenueLabel = selectedCourt?.venueName ?? emptyToNull(state.venueLabel);
  const selectedCourtLabel = selectedCourt?.courtLabel ?? emptyToNull(state.courtLabel);

  if (!state.courtId && (!selectedVenueLabel || !selectedCourtLabel)) {
    return null;
  }

  const conflictingMatch = matches.find((match) => {
    if (match.scheduledAt !== scheduledAt) {
      return false;
    }
    if (state.courtId && match.courtId === state.courtId) {
      return true;
    }
    if (!state.courtId && !match.courtId) {
      return normalizeLabel(match.venueLabel) === normalizeLabel(selectedVenueLabel)
        && normalizeLabel(match.courtLabel) === normalizeLabel(selectedCourtLabel);
    }
    return false;
  });

  if (!conflictingMatch) {
    return null;
  }

  const meta = buildScheduleRowMeta(conflictingMatch);
  return `Court conflict warning: same court and scheduled time as ${meta.matchupLabel}. Warnings are advisory. No official buffer/turnover rule is implemented yet.`;
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
  const homeTeamName = labelOrFallback(match.homeTeamName, "TBD");
  const awayTeamName = labelOrFallback(match.awayTeamName, "TBD");
  const courtLabel = labelOrNull(match.courtLabel);
  const venueLabel = labelOrNull(match.venueLabel);

  return {
    matchupLabel: `${homeTeamName} vs ${awayTeamName}`,
    scoreLabel: `${match.homeScore} - ${match.awayScore}`,
    scheduleLabel: match.scheduledAt ? new Date(match.scheduledAt).toLocaleString() : "Schedule pending",
    locationLabel: venueLabel && courtLabel ? `${venueLabel} / ${courtLabel}` : courtLabel ?? venueLabel ?? "Court TBD",
    statusGroup: getScheduleStatusGroup(match.status),
    conflictCount: match.conflicts?.length ?? 0,
    conflictBadgeLabel: match.conflicts?.length ? "Court conflict warning" : null,
    conflictDetail: match.conflicts?.[0]?.message ?? null
  };
}

export function getScheduleConflictSummary(matches: TournamentScheduleMatch[]) {
  const conflictCount = matches.reduce((total, match) => total + (match.conflicts?.length ?? 0), 0);
  return conflictCount > 0
    ? `Schedule warnings found: ${conflictCount} court conflict warning${conflictCount === 1 ? "" : "s"}.`
    : null;
}

export function buildReadinessBadges(match: TournamentScheduleMatch) {
  if (!match.readiness) {
    return [];
  }

  return [
    { label: `Officials: ${match.readiness.officials.state}`, title: match.readiness.officials.label },
    {
      label: `Roster: ${match.readiness.roster.state}`,
      title: `HOME ${match.readiness.roster.homeCount} / AWAY ${match.readiness.roster.awayCount}`
    },
    {
      label: `Lineup: ${match.readiness.lineup.state}`,
      title: `HOME ${match.readiness.lineup.homeStarters} starters, ${confirmationLabel(match.readiness.lineup.homeConfirmed)} / AWAY ${match.readiness.lineup.awayStarters} starters, ${confirmationLabel(match.readiness.lineup.awayConfirmed)}`
    },
    { label: `Lifecycle: ${match.readiness.lifecycle.state.replace("_", " ")}`, title: match.readiness.lifecycle.label }
  ];
}

export function buildScheduleChecklistBadge(match: TournamentScheduleMatch) {
  if (!match.readiness) {
    return null;
  }

  const statuses = [
    readinessStatus(match.readiness.officials.state),
    readinessStatus(match.readiness.roster.state),
    readinessStatus(match.readiness.lineup.state),
    match.publicScoreboardPath ? "READY" : "WARNING"
  ];
  const readyCount = statuses.filter((status) => status === "READY").length;
  const warningCount = statuses.filter((status) => status === "WARNING").length;
  const missingCount = statuses.filter((status) => status === "MISSING").length;
  const state = missingCount > 0 ? "INCOMPLETE" : warningCount > 0 ? "WARNINGS" : "READY";

  return {
    label: `Checklist: ${state}`,
    title: `Ready ${readyCount} / Warnings ${warningCount} / Missing ${missingCount}`
  };
}

function readinessStatus(state: string): "READY" | "WARNING" | "MISSING" {
  if (state === "READY") {
    return "READY";
  }
  if (state === "MISSING" || state === "UNKNOWN") {
    return "MISSING";
  }
  return "WARNING";
}

function confirmationLabel(confirmed: boolean) {
  return confirmed ? "confirmed" : "not confirmed";
}

export function buildVenueCourtOptions(venues: VenueSummary[]): VenueCourtOption[] {
  return venues.flatMap((venue) =>
    venue.courts
      .filter((court) => court.active)
      .map((court) => ({
        value: court.courtId,
        label: `${venue.name} / ${court.label}`,
        venueName: venue.name,
        courtLabel: court.label
      }))
  );
}

export function buildSelectedCourtPreview(venues: VenueSummary[], courtId: string) {
  const selected = buildVenueCourtOptions(venues).find((option) => option.value === courtId);
  return selected ? `Selected court: ${selected.label}` : null;
}

export function getPublicScheduleLinks(match: TournamentScheduleMatch) {
  return {
    scoreboard: {
      href: match.publicScoreboardPath,
      label: "Open Scoreboard"
    },
    display: {
      href: `${match.publicScoreboardPath}/display`,
      label: "Display Mode"
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

export function getPublicScheduleEmptyState(matchCount: number): EmptyStateCopy | null {
  if (matchCount > 0) {
    return null;
  }
  return {
    title: "No scheduled matches",
    description: "This tournament does not have scheduled matches yet."
  };
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

export function getPublicStandingsEmptyState(finishedMatchCount: number, rowCount: number): EmptyStateCopy | null {
  if (finishedMatchCount > 0 || rowCount > 0) {
    return null;
  }
  return {
    title: "No finished matches",
    description: "Standings are provisional and will update after finished matches are available."
  };
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoDateTimeOrNull(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? trimmed : date.toISOString();
}

function labelOrNull(value: string | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.toLowerCase() !== "null" ? trimmed : null;
}

function labelOrFallback(value: string | null, fallback: string) {
  return labelOrNull(value) ?? fallback;
}

function normalizeLabel(value: string | null) {
  return labelOrNull(value)?.toLowerCase() ?? null;
}
