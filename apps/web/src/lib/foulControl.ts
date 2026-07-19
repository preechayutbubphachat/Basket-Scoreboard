import type {
  CommandResult,
  EffectiveMatchAccess,
  FoulType,
  ScoreboardProjection,
  TeamFoulAddedPayload
} from "@basket-scoreboard/api-contracts";
import {
  buildOperatorMatchCorrectionsLink,
  buildOperatorMatchScoreLink,
  buildOperatorMatchReplayLink,
  buildOperatorMatchSummaryLink,
  buildPublicScoreboardLink
} from "./operatorMatches";

export const foulTypeOptions: FoulType[] = [
  "PERSONAL"
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
