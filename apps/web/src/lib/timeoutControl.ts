import type {
  CommandResult,
  ScoreboardProjection,
  TimeoutEndedPayload,
  TimeoutGrantedPayload,
  TimeoutRequestedBy
} from "@basket-scoreboard/api-contracts";
import {
  buildOperatorMatchClockLink,
  buildOperatorMatchCorrectionsLink,
  buildOperatorMatchFoulsLink,
  buildOperatorMatchScoreLink,
  buildPublicScoreboardLink
} from "./operatorMatches";

export type TimeoutControlTeamSide = "HOME" | "AWAY";

type TimeoutDisplayProjection = Pick<ScoreboardProjection, "activeTimeout"> &
  Partial<Pick<ScoreboardProjection, "timeouts" | "homeTeamName" | "awayTeamName">>;

export const timeoutRequestedByOptions: TimeoutRequestedBy[] = [
  "HEAD_COACH",
  "ASSISTANT_COACH",
  "BENCH",
  "OFFICIAL",
  "OTHER"
];

export function buildTimeoutControlPanels(projection: TimeoutDisplayProjection | null) {
  const timeouts = getTimeouts(projection);
  return [
    {
      teamSide: "HOME" as const,
      teamName: projection?.homeTeamName ?? "HOME",
      used: timeouts.home.used,
      remaining: timeouts.home.remaining,
      pendingKey: "grant-HOME"
    },
    {
      teamSide: "AWAY" as const,
      teamName: projection?.awayTeamName ?? "AWAY",
      used: timeouts.away.used,
      remaining: timeouts.away.remaining,
      pendingKey: "grant-AWAY"
    }
  ];
}

export function buildTimeoutGrantPayload(
  projection: ScoreboardProjection,
  teamSide: TimeoutControlTeamSide,
  requestedBy: TimeoutRequestedBy,
  durationMs: number,
  reason: string | null
): { expectedSeq: number; payload: TimeoutGrantedPayload } {
  return {
    expectedSeq: projection.currentSeq,
    payload: {
      teamSide,
      requestedBy,
      durationMs,
      reason: normalizeReason(reason)
    }
  };
}

export function buildTimeoutEndPayload(
  projection: ScoreboardProjection,
  reason: string | null
): { expectedSeq: number; payload: TimeoutEndedPayload } {
  return {
    expectedSeq: projection.currentSeq,
    payload: {
      reason: normalizeReason(reason)
    }
  };
}

export function getActiveTimeoutLabel(projection: TimeoutDisplayProjection | null) {
  if (!projection?.activeTimeout) {
    return "No active timeout";
  }

  const teamName = projection.activeTimeout.teamSide === "HOME"
    ? projection.homeTeamName ?? "HOME"
    : projection.awayTeamName ?? "AWAY";
  const seconds = Math.ceil(Math.max(0, projection.activeTimeout.remainingMs) / 1000);
  return `${teamName} timeout - ${seconds}s remaining`;
}

export function getTimeoutControlFeedback(result: CommandResult | null) {
  if (!result) {
    return null;
  }

  if (result.status === "ACCEPTED" || result.status === "DUPLICATE_ACCEPTED") {
    return {
      tone: "success" as const,
      text: `Timeout updated. Current seq ${result.currentSeq}.`
    };
  }

  if (result.status === "SYNC_REQUIRED" || result.reasonCode === "INVALID_EXPECTED_SEQ") {
    return {
      tone: "error" as const,
      code: "INVALID_EXPECTED_SEQ",
      text: "Conflict: refreshed, please try again."
    };
  }

  return {
    tone: "error" as const,
    code: result.reasonCode ?? result.status,
    text: result.message ?? "Timeout command rejected."
  };
}

export function getTimeoutControlLinks(matchId: string) {
  return {
    score: { href: buildOperatorMatchScoreLink(matchId), label: "Score" },
    fouls: { href: buildOperatorMatchFoulsLink(matchId), label: "Fouls" },
    clock: { href: buildOperatorMatchClockLink(matchId), label: "Clock" },
    corrections: { href: buildOperatorMatchCorrectionsLink(matchId), label: "Corrections" },
    publicScoreboard: { href: buildPublicScoreboardLink(matchId), label: "Public scoreboard" }
  };
}

function getTimeouts(projection: TimeoutDisplayProjection | null) {
  return projection?.timeouts ?? {
    home: { used: 0, remaining: 5 },
    away: { used: 0, remaining: 5 }
  };
}

function normalizeReason(reason: string | null) {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : null;
}
