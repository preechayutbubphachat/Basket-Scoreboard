import type {
  AuthenticatedUser,
  CommandResult,
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

export function buildScorePendingKey(teamSide: ScoreControlTeamSide, points: ScoreControlPoint) {
  return `${teamSide}-${points}`;
}

export function buildScoreControlPanels(projection: ScoreboardProjection) {
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
