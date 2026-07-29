import type {
  CommandResult,
  EffectiveMatchAccess,
  FoulType,
  MatchRosterPlayer,
  MatchRostersResponse,
  ScoreboardProjection,
  TeamFoulAddedPayload
} from "@basket-scoreboard/api-contracts";
import { buildOperatorMatchCorrectionsLink, buildOperatorMatchScoreLink, buildOperatorMatchReplayLink, buildOperatorMatchSummaryLink, buildPublicScoreboardLink } from "./operatorMatches";

export const foulTypeOptions: FoulType[] = [
  "PERSONAL",
  "TECHNICAL"
];

export type FoulAccessLifecycle = "ACCESS_LOADING" | "ACCESS_READY" | "ACCESS_DENIED" | "ACCESS_ERROR" | "ACCESS_MATCH_MISMATCH";
export type FoulEffectiveAccessState = {
  lifecycle: FoulAccessLifecycle;
  access: EffectiveMatchAccess | null;
  canRead: boolean;
  canOperateFoul: boolean;
  canRequestCorrection: boolean;
};

function isEffectiveMatchAccess(value: unknown): value is EffectiveMatchAccess {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EffectiveMatchAccess>;
  const capabilities = candidate.capabilities as Partial<EffectiveMatchAccess["capabilities"]> | undefined;
  return typeof candidate.matchId === "string" && Boolean(capabilities) &&
    typeof capabilities?.matchRead === "boolean" &&
    typeof capabilities.foulOperate === "boolean" &&
    typeof capabilities.correctionRequest === "boolean";
}

export function resolveFoulEffectiveAccess(matchId: string, phase: "loading" | "ready" | "error", value: unknown): FoulEffectiveAccessState {
  const closed = (lifecycle: FoulAccessLifecycle): FoulEffectiveAccessState => ({
    lifecycle,
    access: null,
    canRead: false,
    canOperateFoul: false,
    canRequestCorrection: false
  });
  if (phase === "loading") return closed("ACCESS_LOADING");
  if (phase === "error" || !isEffectiveMatchAccess(value)) return closed("ACCESS_ERROR");
  if (value.matchId !== matchId) return closed("ACCESS_MATCH_MISMATCH");
  if (!value.capabilities.matchRead) return closed("ACCESS_DENIED");
  return {
    lifecycle: "ACCESS_READY",
    access: value,
    canRead: true,
    canOperateFoul: value.capabilities.foulOperate,
    canRequestCorrection: value.capabilities.correctionRequest
  };
}

export type FoulControlTeamSide = TeamFoulAddedPayload["teamSide"];

export function buildFoulPendingKey(teamSide: FoulControlTeamSide) {
  return `TEAM-${teamSide}`;
}

export function buildFoulControlPanels(projection: ScoreboardProjection) {
  return (["HOME", "AWAY"] as const).map((teamSide) => {
    const sideKey = teamSide === "HOME" ? "home" : "away";
    return {
      teamSide,
      label: teamSide,
      teamName:
        teamSide === "HOME"
          ? projection.homeTeamName ?? projection.homeTeamId ?? "Home"
          : projection.awayTeamName ?? projection.awayTeamId ?? "Away",
      fouls: projection.teamFouls?.[sideKey] ?? 0,
      pendingKey: buildFoulPendingKey(teamSide)
    };
  });
}

export type PlayerFoulPresentation = {
  player: MatchRosterPlayer;
  personalFouls: number;
  technicalFouls: number;
  totalTowardLimit: number;
  hasReachedPersonalFoulLimit: boolean;
};

export function getHeadCoachTechnicalPresentation(
  projection: ScoreboardProjection,
  teamSide: "HOME" | "AWAY"
) {
  return projection.headCoachTechnicals?.find((coach) => coach.teamSide === teamSide) ?? null;
}

export type PersonalFoulRosterPresentationExtended = {
  available: boolean;
  playersBySide: Record<
    "HOME" | "AWAY",
    Array<PlayerFoulPresentation>
  >;
};

export function buildPersonalFoulRosterPresentation(
  projection: ScoreboardProjection,
  rosters: MatchRostersResponse | null
): PersonalFoulRosterPresentationExtended {
  const unavailable = (): PersonalFoulRosterPresentationExtended => ({
    available: false,
    playersBySide: { HOME: [], AWAY: [] }
  });
  if (!rosters || !Array.isArray(projection.playerFouls)) return unavailable();

  const playersBySide = {
    HOME: rosters.rosters.HOME.filter((player) => player.status === "ACTIVE"),
    AWAY: rosters.rosters.AWAY.filter((player) => player.status === "ACTIVE")
  };
  const activePlayersById = new Map<string, MatchRosterPlayer>();
  for (const teamSide of ["HOME", "AWAY"] as const) {
    for (const player of playersBySide[teamSide]) {
      if (player.teamSide !== teamSide || activePlayersById.has(player.playerId)) {
        return unavailable();
      }
      activePlayersById.set(player.playerId, player);
    }
  }

  const personalFoulCounts = new Map<string, number>();
  const technicalFoulCounts = new Map<string, number>();
  const totalsTowardLimit = new Map<string, number>();
  for (const value of projection.playerFouls) {
    if (!value || typeof value !== "object" || typeof value.playerId !== "string") continue;
    const player = activePlayersById.get(value.playerId);
    if (!player) continue;
    const personalFouls = Number.isInteger(value.personalFouls) ? value.personalFouls : value.fouls;
    const technicalFouls = Number.isInteger(value.technicalFouls) ? value.technicalFouls : 0;
    const totalTowardLimit = Number.isInteger(value.totalTowardLimit) ? value.totalTowardLimit : value.fouls;
    if (
      personalFoulCounts.has(value.playerId) ||
      technicalFoulCounts.has(value.playerId) ||
      totalsTowardLimit.has(value.playerId) ||
      value.teamSide !== player.teamSide ||
      !Number.isInteger(personalFouls) ||
      personalFouls < 0 ||
      !Number.isInteger(technicalFouls) ||
      technicalFouls < 0 ||
      !Number.isInteger(totalTowardLimit) ||
      totalTowardLimit < 0 ||
      value.fouls !== totalTowardLimit
    ) {
      return unavailable();
    }
    personalFoulCounts.set(value.playerId, personalFouls);
    technicalFoulCounts.set(value.playerId, technicalFouls);
    totalsTowardLimit.set(value.playerId, totalTowardLimit);
  }

  const PERSONAL_FOUL_LIMIT = 5;

  return {
    available: true,
    playersBySide: {
      HOME: playersBySide.HOME.map((player) => {
        const personalFouls = personalFoulCounts.get(player.playerId) ?? 0;
        const technicalFouls = technicalFoulCounts.get(player.playerId) ?? 0;
        const totalTowardLimit = totalsTowardLimit.get(player.playerId) ?? 0;
        return {
          player,
          personalFouls,
          technicalFouls,
          totalTowardLimit,
          hasReachedPersonalFoulLimit: totalTowardLimit >= PERSONAL_FOUL_LIMIT
        };
      }),
      AWAY: playersBySide.AWAY.map((player) => {
        const personalFouls = personalFoulCounts.get(player.playerId) ?? 0;
        const technicalFouls = technicalFoulCounts.get(player.playerId) ?? 0;
        const totalTowardLimit = totalsTowardLimit.get(player.playerId) ?? 0;
        return {
          player,
          personalFouls,
          technicalFouls,
          totalTowardLimit,
          hasReachedPersonalFoulLimit: totalTowardLimit >= PERSONAL_FOUL_LIMIT
        };
      })
    }
  };
}

export function buildTeamFoulCommandPayload(
  projection: ScoreboardProjection,
  teamSide: FoulControlTeamSide,
  input: { foulType: FoulType; reason: string }
) {
  return {
    expectedSeq: projection.currentSeq,
    payload: {
      teamSide,
      foulType: input.foulType,
      reason: input.reason.trim() ? input.reason.trim() : null
    }
  };
}

export function getFoulControlFeedback(result: CommandResult) {
  if (result.status === "SYNC_REQUIRED" || result.reasonCode === "INVALID_EXPECTED_SEQ") {
    return {
      tone: "error" as const,
      code: "INVALID_EXPECTED_SEQ",
      text: "Conflict: refreshed, please try again."
    };
  }

  if (result.status === "ACCEPTED" || result.status === "DUPLICATE_ACCEPTED") {
    return {
      tone: "success" as const,
      text: `Foul added. Current seq ${result.currentSeq}.`
    };
  }

  return {
    tone: "error" as const,
    code: result.reasonCode ?? "INTERNAL_ERROR",
    text: result.message ?? "Foul command was rejected."
  };
}

export function getFoulControlLinks(matchId: string) {
  return {
    operatorMatches: { href: "/operator/matches", label: "Back to Operator Matches" },
    scoreControl: { href: buildOperatorMatchScoreLink(matchId), label: "Open Score Control" },
    summary: { href: buildOperatorMatchSummaryLink(matchId), label: "Open Match Summary" },
    replay: { href: buildOperatorMatchReplayLink(matchId), label: "Open Replay" },
    corrections: { href: buildOperatorMatchCorrectionsLink(matchId), label: "Corrections" },
    publicScoreboard: {
      href: buildPublicScoreboardLink(matchId),
      label: "Open Public Scoreboard"
    }
  };
}
