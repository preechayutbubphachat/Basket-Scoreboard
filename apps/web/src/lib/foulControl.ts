import type {
  CommandResult,
  FoulType,
  ScoreboardProjection,
  TeamFoulAddedPayload
} from "@basket-scoreboard/api-contracts";
import {
  buildOperatorMatchScoreLink,
  buildOperatorMatchSummaryLink,
  buildPublicScoreboardLink
} from "./operatorMatches";

export const foulTypeOptions: FoulType[] = [
  "PERSONAL",
  "TECHNICAL",
  "UNSPORTSMANLIKE",
  "DISQUALIFYING",
  "OTHER"
];

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
    publicScoreboard: {
      href: buildPublicScoreboardLink(matchId),
      label: "Open Public Scoreboard"
    }
  };
}
