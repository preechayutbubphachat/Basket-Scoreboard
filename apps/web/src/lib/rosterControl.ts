import type {
  FoulType,
  MatchLineupResponse,
  MatchRosterPlayer,
  MatchRostersResponse,
  PlayerPosition,
  RosterReadiness,
  ScoreboardProjection
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
  if (readiness.confirmed && readiness.ready) return "CONFIRMED";
  if (readiness.starterCount !== 5) return "NEEDS STARTERS";
  if (!readiness.captainSet) return "NEEDS CAPTAIN";
  return "READY";
}

export function buildRosterSetupSummary(rosters: MatchRostersResponse | null) {
  const homeCount = rosters?.readiness?.home.playerCount ?? rosters?.rosters.HOME.length ?? 0;
  const awayCount = rosters?.readiness?.away.playerCount ?? rosters?.rosters.AWAY.length ?? 0;
  const state = homeCount > 0 && awayCount > 0 ? "READY" : homeCount > 0 || awayCount > 0 ? "INCOMPLETE" : "MISSING";
  return {
    state,
    homeCount,
    awayCount,
    nextAction:
      state === "READY"
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
  const state = home?.ready && away?.ready
    ? "READY"
    : homeStarters === 0 && awayStarters === 0
      ? "MISSING"
      : "INCOMPLETE";

  return {
    state,
    homeStarters,
    awayStarters,
    homeConfirmed,
    awayConfirmed,
    nextAction: buildLineupNextAction(homeStarters, awayStarters, homeConfirmed, awayConfirmed, state)
  };
}

function buildLineupNextAction(
  homeStarters: number,
  awayStarters: number,
  homeConfirmed: boolean,
  awayConfirmed: boolean,
  state: "READY" | "INCOMPLETE" | "MISSING"
) {
  if (state === "READY") {
    return "Lineup is ready for Alpha match operation.";
  }
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
