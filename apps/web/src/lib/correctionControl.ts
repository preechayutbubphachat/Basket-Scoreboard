import type {
  AlphaCorrectionResponse,
  CommandResult,
  CorrectionEligibleEvent,
  ScoreboardProjection
} from "@basket-scoreboard/api-contracts";

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
