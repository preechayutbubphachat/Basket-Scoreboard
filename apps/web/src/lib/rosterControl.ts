import {
  RM08_SOURCE_AUTHORITY_BOUNDARY,
  type RosterSourceAuthorityBoundary,
  type FoulType,
  type MatchLineupResponse,
  type MatchRosterPlayer,
  type MatchRostersResponse,
  type PlayerPosition,
  type RosterLineupSideProjection,
  type RosterReadiness,
  type ScoreboardProjection
} from "@basket-scoreboard/api-contracts";

export type CreatePlayerFormState = {
  displayName: string;
  jerseyNumber: string;
  position: PlayerPosition;
};

export function createPlayerFormState(): CreatePlayerFormState {
  return {
    displayName: "",
    jerseyNumber: "",
    position: "UNKNOWN"
  };
}

export function buildAdminRosterLink(matchId: string) {
  return `/admin/matches/${encodeURIComponent(matchId)}/rosters`;
}

export function buildAdminLineupLink(matchId: string) {
  return `/admin/matches/${encodeURIComponent(matchId)}/lineup`;
}

export function buildSetupQuickLinks(matchId: string) {
  return {
    rosters: { href: buildAdminRosterLink(matchId), label: "Setup Roster" },
    lineup: { href: buildAdminLineupLink(matchId), label: "Setup Lineup" },
    lifecycle: { href: `/operator/matches/${encodeURIComponent(matchId)}/lifecycle`, label: "Start / Lifecycle" }
  };
}

export function buildCreatePlayerPayload(form: CreatePlayerFormState) {
  return {
    displayName: form.displayName.trim(),
    jerseyNumber: form.jerseyNumber.trim() ? form.jerseyNumber.trim() : null,
    position: form.position,
    active: true
  };
}

export function getRosterPlayersForSide(rosters: MatchRostersResponse | null, teamSide: "HOME" | "AWAY") {
  return rosters?.rosters[teamSide] ?? [];
}

export function getRosterTeamLabel(projection: ScoreboardProjection | null, teamSide: "HOME" | "AWAY") {
  if (teamSide === "HOME") {
    return projection?.homeTeamName ?? projection?.homeTeamId ?? "HOME";
  }
  return projection?.awayTeamName ?? projection?.awayTeamId ?? "AWAY";
}

export function buildRosterPlayerLabel(player: Pick<MatchRosterPlayer, "displayNameSnapshot" | "jerseyNumberSnapshot">) {
  return player.jerseyNumberSnapshot
    ? `#${player.jerseyNumberSnapshot} ${player.displayNameSnapshot}`
    : player.displayNameSnapshot;
}

export function getRosterPlayerRoleLabels(
  player: Pick<MatchRosterPlayer, "isStarter" | "isCaptain" | "status">
) {
  const labels: string[] = [];
  if (player.status === "INACTIVE") {
    labels.push("INACTIVE");
  } else if (player.isStarter) {
    labels.push("STARTER");
  } else if (player.status === "BENCH") {
    labels.push("BENCH");
  }
  if (player.isCaptain) {
    labels.push("CAPTAIN");
  }
  return labels;
}

export function buildRosterPlayerDisplayLabel(player: MatchRosterPlayer) {
  const labels = getRosterPlayerRoleLabels(player);
  const base = buildRosterPlayerLabel(player);
  return labels.length ? `${base} - ${labels.join(", ")}` : base;
}

export function buildRosterReadinessLabel(readiness: RosterReadiness | null | undefined) {
  if (!readiness) return "NEEDS STARTERS";
  if (readiness.starterCount !== 5) return "NEEDS STARTERS";
  if (readiness.confirmed && readiness.ready) return "NOT EVALUATED";
  if (!readiness.captainSet) return "NEEDS CAPTAIN";
  return "NOT EVALUATED";
}

export function buildRosterSetupSummary(rosters: MatchRostersResponse | null) {
  const homeCount = rosters?.readiness?.home.playerCount ?? rosters?.rosters.HOME.length ?? 0;
  const awayCount = rosters?.readiness?.away.playerCount ?? rosters?.rosters.AWAY.length ?? 0;
  const state = homeCount > 0 && awayCount > 0 ? "INCOMPLETE" : homeCount > 0 || awayCount > 0 ? "INCOMPLETE" : "MISSING";
  return {
    state,
    homeCount,
    awayCount,
    nextAction:
      homeCount > 0 && awayCount > 0
        ? "Open lineup setup to select starters, captain, and confirmations."
        : "Add players to both teams before lineup confirmation."
  };
}

export function buildLineupSetupSummary(lineup: MatchLineupResponse | null) {
  const home = lineup?.home.readiness;
  const away = lineup?.away.readiness;
  const homeStarters = home?.starterCount ?? 0;
  const awayStarters = away?.starterCount ?? 0;
  const homeConfirmed = Boolean(home?.confirmed);
  const awayConfirmed = Boolean(away?.confirmed);
  const state = homeStarters === 0 && awayStarters === 0
    ? "MISSING"
    : "INCOMPLETE";

  return {
    state,
    homeStarters,
    awayStarters,
    homeConfirmed,
    awayConfirmed,
    nextAction: buildLineupNextAction(homeStarters, awayStarters, homeConfirmed, awayConfirmed)
  };
}

function buildLineupNextAction(
  homeStarters: number,
  awayStarters: number,
  homeConfirmed: boolean,
  awayConfirmed: boolean
) {
  const starterSides = [
    homeStarters < 5 ? "HOME" : null,
    awayStarters < 5 ? "AWAY" : null
  ].filter(Boolean);
  if (starterSides.length) {
    return `Select 5 starters for ${starterSides.join(" and ")} before confirmation.`;
  }
  const confirmSides = [
    !homeConfirmed ? "HOME" : null,
    !awayConfirmed ? "AWAY" : null
  ].filter(Boolean);
  return confirmSides.length
    ? `Confirm ${confirmSides.join(" and ")} roster before lifecycle start.`
    : "Review lineup before lifecycle start.";
}

export function buildSourceNeutralLineupSetupSummary(lineup: MatchLineupResponse | null) {
  const homeStarters = lineup?.home.readiness.starterCount ?? 0;
  const awayStarters = lineup?.away.readiness.starterCount ?? 0;
  const homeConfirmed = Boolean(lineup?.home.readiness.confirmed);
  const awayConfirmed = Boolean(lineup?.away.readiness.confirmed);
  const missingMetadataSides = [
    homeStarters === 0 ? "HOME" : null,
    awayStarters === 0 ? "AWAY" : null
  ].filter(Boolean);
  const unconfirmedSides = [
    !homeConfirmed ? "HOME" : null,
    !awayConfirmed ? "AWAY" : null
  ].filter(Boolean);
  return {
    state: missingMetadataSides.length > 0 ? "INCOMPLETE" : homeConfirmed && awayConfirmed ? "RECORDED" : "INCOMPLETE",
    homeStarters,
    awayStarters,
    homeConfirmed,
    awayConfirmed,
    nextAction: missingMetadataSides.length > 0
      ? `Record starter metadata for ${missingMetadataSides.join(" and ")}. No official starter requirement is asserted.`
      : unconfirmedSides.length > 0
        ? `Confirm the recorded roster data for ${unconfirmedSides.join(" and ")}. Eligibility and registration remain not evaluated.`
        : "Roster data is confirmed. Eligibility and registration remain not evaluated."
  };
}

export function buildSourceNeutralRosterMetadataLabel(readiness: RosterReadiness | null | undefined) {
  if (!readiness || readiness.playerCount === 0) return "ROSTER DATA NOT INITIALIZED";
  if (readiness.starterCount === 0) return "STARTER METADATA NOT RECORDED";
  if (!readiness.captainSet) return "CAPTAIN METADATA NOT RECORDED";
  if (!readiness.confirmed) return "DATA READY — NOT CONFIRMED";
  return "ELIGIBILITY / REGISTRATION NOT EVALUATED";
}

export function buildPlayerFoulCommandPayload(
  projection: ScoreboardProjection,
  player: MatchRosterPlayer,
  input: { foulType: FoulType; reason: string }
){
  return {
    expectedSeq: projection.currentSeq,
    payload: {
      teamSide: player.teamSide,
      playerId: player.playerId,
      foulType: input.foulType,
      reason: input.reason.trim() ? input.reason.trim() : null
    }
  };
}

export function buildScorePlayerOptions(rosters: MatchRostersResponse | null, teamSide: "HOME" | "AWAY") {
  return getRosterPlayersForSide(rosters, teamSide)
    .filter((player) => player.status !== "INACTIVE")
    .sort((left, right) => Number(right.isStarter) - Number(left.isStarter))
    .map((player) => ({
      playerId: player.playerId,
      label: buildRosterPlayerDisplayLabel(player)
    }));
}

export type RosterEligibilityPresentation = {
  dataReady: boolean;
  eligibilityVerified: boolean;
  eligibilitySourceStatus: "APPROVED" | "PENDING" | "REJECTED";
  blockingReasons: string[];
};

export function getRosterReadinessStateLabel(input: RosterEligibilityPresentation) {
  if (!input.dataReady) return "DATA NOT READY";
  if (input.eligibilitySourceStatus !== "APPROVED") return "ELIGIBILITY SOURCE BLOCKED";
  if (!input.eligibilityVerified) return "ELIGIBILITY VERIFICATION PENDING";
  if (input.blockingReasons.length > 0) return "ELIGIBILITY BLOCKED";
  return "ELIGIBLE";
}

export function buildRosterPolicyStatusLabels(input: {
  registration: "OPEN" | "CLOSED" | "UNRESOLVED";
  lock: "LOCKED" | "UNLOCKED";
  lateChange: "OPEN" | "CLOSED" | "PENDING";
  correction: "OPEN" | "CLOSED" | "REQUIRES_APPROVAL";
}) {
  return {
    registration: input.registration === "UNRESOLVED" ? "FIRST COMPETITION DATE UNRESOLVED" : `REGISTRATION ${input.registration}`,
    lock: input.lock === "LOCKED" ? "MATCH ROSTER LOCKED" : "MATCH ROSTER UNLOCKED",
    lateChange: input.lateChange === "PENDING" ? "LATE CHANGE PENDING" : `LATE CHANGE ${input.lateChange}`,
    correction: input.correction === "REQUIRES_APPROVAL" ? "CORRECTION REQUIRES APPROVAL" : `CORRECTION ${input.correction}`
  };
}

export function getRosterPrivacyFieldState(field: string) {
  return ["displayName", "jerseyNumber", "team", "captain"].includes(field) ? "PUBLIC" as const : "PRIVATE" as const;
}

export type RosterReadinessUiState = "LOADING" | "EMPTY" | "READY_NOT_CONFIRMED" | "PENDING" | "ACCEPTED" | "DENIED" | "STALE" | "SYNC_REQUIRED" | "POLICY_NOT_CONFIGURED";

export type SourceNeutralRosterSidePresentation = {
  initialization: "INITIALIZED" | "NOT_INITIALIZED";
  projectionVersion: { status: "VERSIONED" | "UNVERSIONED"; eventSeq: number | null };
  integrity: "VERIFIED" | "INVALID" | "UNRESOLVED";
  confirmation: "NOT_CONFIRMED" | "CONFIRMED" | "STALE";
  rosterMetadata: { starterCount: number; captainRecorded: boolean };
  sourceAuthority: RosterSourceAuthorityBoundary;
  privacy: {
    protectedView: "AUTHENTICATED_AUTHORIZED_ONLY";
    publicView: "POSITIVE_ALLOWLIST_ONLY";
    adminAuditLeakage: "FORBIDDEN";
  };
};

export function buildSourceNeutralRosterSidePresentation(
  side: RosterLineupSideProjection | null
): SourceNeutralRosterSidePresentation {
  const integrity = side?.readiness.status === "MALFORMED_LEGACY_STATE"
    ? "INVALID"
    : side?.readiness.dataReady ? "VERIFIED" : "UNRESOLVED";
  return {
    initialization: side?.initialized ? "INITIALIZED" : "NOT_INITIALIZED",
    projectionVersion: {
      status: side?.rosterVersion ? "VERSIONED" : "UNVERSIONED",
      eventSeq: side?.rosterVersion?.eventSeq ?? null
    },
    integrity,
    confirmation: side?.confirmation.status ?? "NOT_CONFIRMED",
    rosterMetadata: {
      starterCount: side?.starterIds.length ?? 0,
      captainRecorded: Boolean(side?.captainId)
    },
    sourceAuthority: side?.readiness.sourceAuthority ?? RM08_SOURCE_AUTHORITY_BOUNDARY,
    privacy: {
      protectedView: "AUTHENTICATED_AUTHORIZED_ONLY",
      publicView: "POSITIVE_ALLOWLIST_ONLY",
      adminAuditLeakage: "FORBIDDEN"
    }
  };
}

export function getAuthoritativeRosterReadinessLabel(side: RosterLineupSideProjection | null, uiState?: RosterReadinessUiState) {
  if (uiState === "LOADING") return "LOADING AUTHORITATIVE STATE";
  if (uiState === "PENDING") return "CONFIRMATION PENDING";
  if (uiState === "ACCEPTED") return "CONFIRMATION ACCEPTED";
  if (uiState === "DENIED") return "ACCESS DENIED";
  if (uiState === "SYNC_REQUIRED") return "SYNC REQUIRED";
  if (uiState === "STALE" || side?.confirmation.status === "STALE") return "STALE — NOT READY";
  if (!side?.initialized) return "EMPTY — NOT READY";
  if (side.confirmation.status !== "CONFIRMED") return "DATA READY — NOT CONFIRMED";
  if (!side.readiness.eligibilityVerified) return "POLICY NOT CONFIGURED — ELIGIBILITY NOT EVALUATED";
  return side.readiness.status;
}

export function isRosterReadinessSubmitDisabled(input: {
  authorized: boolean;
  loading: boolean;
  pending: boolean;
  resyncing: boolean;
  syncStatus: string;
  side: RosterLineupSideProjection | null;
}) {
  return !input.authorized || input.loading || input.pending || input.resyncing || input.syncStatus !== "SYNCED"
    || !input.side?.initialized || !input.side.rosterVersion || !input.side.readiness.dataReady
    || input.side.readiness.status === "MALFORMED_LEGACY_STATE" || input.side.confirmation.status === "CONFIRMED";
}
