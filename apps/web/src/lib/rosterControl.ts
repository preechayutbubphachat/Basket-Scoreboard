import type {
  FoulType,
  MatchRosterPlayer,
  MatchRostersResponse,
  PlayerPosition,
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
    .map((player) => ({
      playerId: player.playerId,
      label: buildRosterPlayerLabel(player)
    }));
}
