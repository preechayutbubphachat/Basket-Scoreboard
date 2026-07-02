import type { CommandResult, LifecycleCommandPayload, ScoreboardProjection } from "@basket-scoreboard/api-contracts";
import {
  buildOperatorMatchClockLink,
  buildOperatorMatchFoulsLink,
  buildOperatorMatchScoreLink,
  buildOperatorMatchTimeoutsLink,
  buildPublicScoreboardLink
} from "./operatorMatches";

export type LifecycleAction =
  | "startMatch"
  | "endPeriod"
  | "startNextPeriod"
  | "startOvertime"
  | "finishMatch";

export function buildLifecycleControlState(projection: ScoreboardProjection) {
  const homeName = projection.homeTeamName ?? "HOME";
  const awayName = projection.awayTeamName ?? "AWAY";
  const periodType = projection.periodType ?? "REGULATION";
  const finalScore = projection.finalScore ?? null;
  return {
    status: projection.status,
    periodNumber: projection.periodNumber ?? projection.period ?? 1,
    periodType,
    expectedSeq: projection.currentSeq,
    scoreLabel: `${homeName} ${projection.homeScore} - ${projection.awayScore} ${awayName}`,
    clockLabel: formatGameClock(projection.gameClock?.remainingMs ?? projection.gameClockRemainingMs ?? 600000),
    finalLabel:
      projection.status === "FINISHED" && finalScore
        ? `Final: ${homeName} ${finalScore.home} - ${finalScore.away} ${awayName} (${projection.winnerSide ?? "TIE"})`
        : null
  };
}

export function getLifecycleActionPlan(projection: ScoreboardProjection) {
  const status = projection.status;
  const periodNumber = projection.periodNumber ?? projection.period ?? 1;
  const regulationPeriods = projection.regulationPeriods ?? 4;
  const isBreak = status === "PERIOD_BREAK";
  const tied = projection.homeScore === projection.awayScore;
  const canFinish =
    (status === "PERIOD_BREAK" || status === "LIVE" || status === "OVERTIME") &&
    !tied;

  return {
    startMatch: {
      enabled: status === "SCHEDULED" || status === "READY",
      requiresConfirmation: false,
      label: "Start Match"
    },
    endPeriod: {
      enabled: status === "LIVE" || status === "OVERTIME",
      requiresConfirmation: (projection.gameClock?.remainingMs ?? projection.gameClockRemainingMs ?? 0) > 0,
      label: "End Period"
    },
    startNextPeriod: {
      enabled: isBreak && periodNumber < regulationPeriods,
      requiresConfirmation: false,
      label: "Start Next Period"
    },
    startOvertime: {
      enabled: isBreak && periodNumber >= regulationPeriods && tied,
      requiresConfirmation: true,
      label: "Start Overtime"
    },
    finishMatch: {
      enabled: canFinish,
      requiresConfirmation: true,
      label: "Finish Match"
    }
  };
}

export function buildLifecycleCommandPayload(
  projection: ScoreboardProjection,
  reason: string | null
): { expectedSeq: number; payload: LifecycleCommandPayload } {
  return {
    expectedSeq: projection.currentSeq,
    payload: { reason: normalizeReason(reason) }
  };
}

export function getLifecycleControlFeedback(result: CommandResult | null) {
  if (!result) {
    return null;
  }

  if (result.status === "SYNC_REQUIRED" || result.reasonCode === "INVALID_EXPECTED_SEQ") {
    return {
      tone: "error" as const,
      code: "INVALID_EXPECTED_SEQ",
      text: "Conflict: refreshed, please try again."
    };
  }

  if (result.status === "ACCEPTED" || result.status === "DUPLICATE_ACCEPTED") {
    const eventType = result.appendedEvents[0]?.eventType;
    return {
      tone: "success" as const,
      text: `${successLabel(eventType)}. Current seq ${result.currentSeq}.`
    };
  }

  return {
    tone: "error" as const,
    code: result.reasonCode ?? result.status,
    text: result.message ?? "Lifecycle command rejected."
  };
}

export function getLifecycleControlLinks(matchId: string) {
  return {
    score: { href: buildOperatorMatchScoreLink(matchId), label: "Score" },
    fouls: { href: buildOperatorMatchFoulsLink(matchId), label: "Fouls" },
    clock: { href: buildOperatorMatchClockLink(matchId), label: "Clock" },
    timeouts: { href: buildOperatorMatchTimeoutsLink(matchId), label: "Timeouts" },
    publicScoreboard: { href: buildPublicScoreboardLink(matchId), label: "Public scoreboard" }
  };
}

function successLabel(eventType: string | undefined) {
  switch (eventType) {
    case "MATCH_STARTED":
      return "Match started";
    case "PERIOD_ENDED":
      return "Period ended";
    case "PERIOD_STARTED":
      return "Next period started";
    case "OVERTIME_STARTED":
      return "Overtime started";
    case "MATCH_FINISHED":
      return "Match finished";
    default:
      return "Lifecycle updated";
  }
}

function formatGameClock(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function normalizeReason(reason: string | null) {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : null;
}
