import type {
  AuthenticatedUser,
  CommandResult,
  EffectiveMatchAccess,
  ScoreAddedPayload,
  ScoreboardProjection
} from "@basket-scoreboard/api-contracts";
import {
  buildOperatorMatchAuditLogLink,
  buildOperatorMatchCorrectionsLink,
  buildOperatorMatchReplayLink,
  buildOperatorMatchSummaryLink,
  buildPublicScoreboardLink,
  canReadAuditLog
} from "./operatorMatches";

export const scorePointOptions = [1, 2, 3] as const;
export const finishedMatchLiveControlWarning = "Match is finished. Use correction workflow for post-game edits.";

export type ScoreControlTeamSide = ScoreAddedPayload["teamSide"];
export type ScoreControlPoint = ScoreAddedPayload["points"];
export type ScoreAccessLifecycle = "ACCESS_LOADING" | "ACCESS_READY" | "ACCESS_DENIED" | "ACCESS_ERROR" | "ACCESS_MATCH_MISMATCH";
export type ScoreEffectiveAccessState = {
  lifecycle: ScoreAccessLifecycle;
  access: EffectiveMatchAccess | null;
  canRead: boolean;
  canOperateScore: boolean;
  canRequestCorrection: boolean;
};

function isEffectiveMatchAccess(value: unknown): value is EffectiveMatchAccess {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EffectiveMatchAccess>;
  const capabilities = candidate.capabilities as Partial<EffectiveMatchAccess["capabilities"]> | undefined;
  return typeof candidate.matchId === "string" && Boolean(capabilities) &&
    typeof capabilities?.matchRead === "boolean" &&
    typeof capabilities.scoreOperate === "boolean" &&
    typeof capabilities.correctionRequest === "boolean";
}

export function resolveScoreEffectiveAccess(matchId: string, phase: "loading" | "ready" | "error", value: unknown): ScoreEffectiveAccessState {
  const closed = (lifecycle: ScoreAccessLifecycle): ScoreEffectiveAccessState => ({
    lifecycle,
    access: null,
    canRead: false,
    canOperateScore: false,
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
    canOperateScore: value.capabilities.scoreOperate,
    canRequestCorrection: value.capabilities.correctionRequest
  };
}

type ScorePanelProjection = Pick<ScoreboardProjection, "homeScore" | "awayScore"> &
  Partial<Pick<ScoreboardProjection, "homeTeamName" | "homeTeamId" | "awayTeamName" | "awayTeamId">>;

export function buildScorePendingKey(teamSide: ScoreControlTeamSide, points: ScoreControlPoint) {
  return `${teamSide}-${points}`;
}

export function buildScoreControlPanels(projection: ScorePanelProjection) {
  return (["HOME", "AWAY"] as const).map((teamSide) => ({
    teamSide,
    label: teamSide,
    teamName:
      teamSide === "HOME"
        ? projection.homeTeamName ?? projection.homeTeamId ?? "Home"
        : projection.awayTeamName ?? projection.awayTeamId ?? "Away",
    score: teamSide === "HOME" ? projection.homeScore : projection.awayScore,
    buttons: scorePointOptions.map((points) => ({
      points,
      label: `+${points}`,
      pendingKey: buildScorePendingKey(teamSide, points)
    }))
  }));
}

export function buildScoreCommandPayload(
  projection: ScoreboardProjection,
  teamSide: ScoreControlTeamSide,
  points: ScoreControlPoint
) {
  return {
    expectedSeq: projection.currentSeq,
    payload: {
      teamSide,
      points,
      playerId: null,
      periodNumber: projection.periodNumber,
      gameClockRemainingMs: projection.gameClockRemainingMs,
      note: null
    }
  };
}

export function getScoreControlPendingLabel(buttonKey: string, pendingKey: string | null) {
  return pendingKey === buttonKey ? "Saving..." : `+${buttonKey.split("-")[1]}`;
}

export function getScoreControlFeedback(result: CommandResult) {
  if (result.status === "SYNC_REQUIRED" || result.reasonCode === "INVALID_EXPECTED_SEQ") {
    return {
      tone: "error" as const,
      code: "INVALID_EXPECTED_SEQ",
      text: "Conflict: scoreboard refreshed, please try again."
    };
  }

  if (result.status === "ACCEPTED" || result.status === "DUPLICATE_ACCEPTED") {
    return {
      tone: "success" as const,
      text: `Score updated. Current seq ${result.currentSeq}.`
    };
  }

  return {
    tone: "error" as const,
    code: result.reasonCode ?? "INTERNAL_ERROR",
    text: result.message ?? "Score command was rejected."
  };
}

export function getAcceptedScoreProjection(result: CommandResult) {
  if (result.status !== "ACCEPTED" && result.status !== "DUPLICATE_ACCEPTED") {
    return null;
  }
  return result.projection ?? null;
}

export function isFinishedMatchStatus(status: string) {
  const normalized = status.toUpperCase();
  return normalized === "FINISHED" || normalized === "FINAL";
}

export function canUseLiveMatchControls(
  projection: Pick<ScoreboardProjection, "status"> | null,
  hasPermission: boolean,
  commandPending: boolean
) {
  if (!projection) return false;
  return hasPermission && !commandPending && !isFinishedMatchStatus(projection.status);
}

export function getScoreControlLinks(matchId: string, user: AuthenticatedUser | null) {
  return {
    operatorMatches: { href: "/operator/matches", label: "Back to Operator Matches" },
    summary: { href: buildOperatorMatchSummaryLink(matchId), label: "Open Match Summary" },
    replay: { href: buildOperatorMatchReplayLink(matchId), label: "Open Replay" },
    auditLog: canReadAuditLog(user) ? { href: buildOperatorMatchAuditLogLink(matchId), label: "Open Audit Log" } : null,
    publicScoreboard: {
      href: buildPublicScoreboardLink(matchId),
      label: "Open Public Scoreboard"
    },
    corrections: {
      href: buildOperatorMatchCorrectionsLink(matchId),
      label: "Open Corrections"
    },
    adminMatches: user?.role === "ADMIN" ? { href: "/admin/matches", label: "Admin Match List" } : null
  };
}
