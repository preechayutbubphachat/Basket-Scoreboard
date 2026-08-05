import type {
  AlphaCorrectionResponse,
  CommandResult,
  CorrectionEligibleEvent,
  ScoreboardProjection
} from "@basket-scoreboard/api-contracts";
import {
  buildOperatorMatchAuditLogLink,
  buildOperatorMatchClockLink,
  buildOperatorMatchFoulsLink,
  buildOperatorMatchReplayLink,
  buildOperatorMatchScoreLink,
  buildOperatorMatchTimeoutsLink
} from "./operatorMatches";

export function buildCorrectionNavItems(matchId: string, currentLabel: string | null = null) {
  const items = [
    { href: buildOperatorMatchScoreLink(matchId), label: "Score" },
    { href: buildOperatorMatchFoulsLink(matchId), label: "Fouls" },
    { href: buildOperatorMatchClockLink(matchId), label: "Clock" },
    { href: buildOperatorMatchTimeoutsLink(matchId), label: "Timeouts" },
    { href: `/operator/matches/${encodeURIComponent(matchId)}/corrections`, label: "Corrections" },
    { href: buildOperatorMatchReplayLink(matchId), label: "Replay" },
    { href: buildOperatorMatchAuditLogLink(matchId), label: "Audit Log" }
  ];

  return items.map((item) => ({
    ...item,
    current: currentLabel === item.label,
    className: "button-link"
  }));
}

export function buildCorrectionEventMeta(event: CorrectionEligibleEvent) {
  return {
    seqLabel: `#${event.seqNo}`,
    typeLabel: event.eventType,
    statusLabel: event.eligible ? "Eligible" : event.ineligibleReason ?? "Not eligible",
    actionLabel: event.eligible ? "Correct" : "Unavailable",
    summary: event.summary
  };
}

export function canSubmitCorrectionReason(reason: string) {
  const trimmed = reason.trim();
  return trimmed.length >= 5 && trimmed.length <= 500;
}

export type ScoreCorrectionReview = {
  correctionKind: CorrectionEligibleEvent["correctionKind"];
  effectLabel: string;
  eventType: string;
  expectedSeq: number;
  matchContext: string;
  playerLabel: string;
  reason: string;
  seqNo: number;
  summary: string;
  teamLabel: string;
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildScoreCorrectionReview(
  projection: ScoreboardProjection,
  event: CorrectionEligibleEvent,
  reason: string
): ScoreCorrectionReview {
  const teamSide = stringValue(event.currentValue.teamSide);
  const points = numberValue(event.currentValue.points);
  const currentScore = teamSide === "HOME" ? projection.homeScore : teamSide === "AWAY" ? projection.awayScore : null;
  const teamName = teamSide === "HOME" ? projection.homeTeamName : teamSide === "AWAY" ? projection.awayTeamName : null;
  const playerName = stringValue(event.currentValue.playerName);
  const jerseyNumber = stringValue(event.currentValue.jerseyNumber);
  const playerId = stringValue(event.currentValue.playerId);

  return {
    correctionKind: event.correctionKind,
    effectLabel: currentScore !== null && points !== null
      ? `${currentScore} to ${Math.max(0, currentScore - points)} (preview only)`
      : "Authoritative effect will be derived by the server",
    eventType: event.eventType,
    expectedSeq: projection.currentSeq,
    matchContext: `${projection.homeTeamName ?? "HOME"} ${projection.homeScore} - ${projection.awayScore} ${projection.awayTeamName ?? "AWAY"}, period ${projection.periodNumber}`,
    playerLabel: playerName ? `${jerseyNumber ? `#${jerseyNumber} ` : ""}${playerName}` : playerId ?? "No player attribution",
    reason: reason.trim(),
    seqNo: event.seqNo,
    summary: event.summary,
    teamLabel: teamSide ? `${teamSide}${teamName ? ` - ${teamName}` : ""}` : "See target summary"
  };
}

export function isSameCorrectionTarget(event: CorrectionEligibleEvent, review: ScoreCorrectionReview) {
  return event.eligible
    && event.seqNo === review.seqNo
    && event.eventType === review.eventType
    && event.correctionKind === review.correctionKind;
}

export function buildCorrectionCommandPayload(
  projection: ScoreboardProjection,
  event: CorrectionEligibleEvent,
  reason: string
) {
  return {
    expectedSeq: projection.currentSeq,
    correctedEventSeq: event.seqNo,
    correctionKind: event.correctionKind,
    reason: reason.trim(),
    payload: {
      correctionKind: event.correctionKind,
      target: { seqNo: event.seqNo, eventType: event.eventType },
      delta: event.proposedCompensation,
      newValue: null
    }
  };
}

export function getCorrectionControlFeedback(result: AlphaCorrectionResponse | CommandResult) {
  if ("ok" in result && result.ok) {
    return {
      tone: "success" as const,
      text: `Correction appended at seq ${result.seqNo}.`
    };
  }

  const commandResult = result as CommandResult;

  if (commandResult.status === "SYNC_REQUIRED" || commandResult.reasonCode === "INVALID_EXPECTED_SEQ") {
    return {
      tone: "error" as const,
      code: "INVALID_EXPECTED_SEQ",
      text: "Match changed. Refresh and try again."
    };
  }

  return {
    tone: "error" as const,
    code: commandResult.reasonCode ?? "INTERNAL_ERROR",
    text: commandResult.message ?? "Correction was rejected."
  };
}

export function hasCorrectionPublicExposure(text: string) {
  return /reason|actor|device|session|token|csrf|password|authorization|commandId|correlationId|causationId/i.test(text);
}
