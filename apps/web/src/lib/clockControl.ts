import type { CommandResult, ScoreboardProjection } from "@basket-scoreboard/api-contracts";
import {
  buildOperatorMatchCorrectionsLink,
  buildOperatorMatchFoulsLink,
  buildOperatorMatchScoreLink,
  buildPublicScoreboardLink
} from "./operatorMatches";

export type ClockCommandKind = "game-start" | "game-stop" | "game-set" | "shot-reset-24" | "shot-reset-14" | "shot-set";
export const GAME_CLOCK_SET_REASON_MAX_LENGTH = 500;
type DisplayClock = {
  remainingMs: number;
  running: boolean;
  lastStartedAt: string | null;
};

export function formatClockMs(remainingMs: number) {
  const safeMs = Math.max(0, Math.floor(remainingMs));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatShotClockMs(remainingMs: number) {
  return String(Math.ceil(Math.max(0, remainingMs) / 1000));
}

export function deriveDisplayClockMs(input: {
  clock: DisplayClock | null | undefined;
  fallbackRemainingMs: number | null | undefined;
  nowMs: number;
  serverTime?: string | null | undefined;
  receivedAtMs?: number | null | undefined;
}) {
  const remainingMs = input.clock?.remainingMs ?? input.fallbackRemainingMs ?? 0;

  if (!input.clock?.running || !input.clock.lastStartedAt) {
    return Math.max(0, remainingMs);
  }

  const startedAtMs = Date.parse(input.clock.lastStartedAt);
  if (!Number.isFinite(startedAtMs)) {
    return Math.max(0, remainingMs);
  }

  const serverTimeMs = input.serverTime ? Date.parse(input.serverTime) : NaN;
  const effectiveServerNowMs =
    Number.isFinite(serverTimeMs) && typeof input.receivedAtMs === "number"
      ? serverTimeMs + Math.max(0, input.nowMs - input.receivedAtMs)
      : input.nowMs;

  return Math.max(0, remainingMs - Math.max(0, effectiveServerNowMs - startedAtMs));
}

export function buildClockControlState(
  projection: ScoreboardProjection,
  options: { nowMs?: number; receivedAtMs?: number | null } = {}
) {
  const nowMs = options.nowMs ?? Date.now();
  const gameClockRemainingMs = deriveDisplayClockMs({
    clock: projection.gameClock,
    fallbackRemainingMs: projection.gameClockRemainingMs,
    nowMs,
    serverTime: projection.serverTime,
    receivedAtMs: options.receivedAtMs
  });
  const shotClockRemainingMs = deriveDisplayClockMs({
    clock: projection.shotClock,
    fallbackRemainingMs: projection.shotClockRemainingMs ?? 24000,
    nowMs,
    serverTime: projection.serverTime,
    receivedAtMs: options.receivedAtMs
  });

  return {
    gameClockLabel: formatClockMs(gameClockRemainingMs),
    gameClockRunning: projection.gameClock?.running ?? false,
    shotClockLabel: formatShotClockMs(shotClockRemainingMs),
    shotClockRunning: projection.shotClock?.running ?? false,
    expectedSeq: projection.currentSeq
  };
}

export function buildGameClockSetPayload(
  projection: ScoreboardProjection,
  input: { minutes: number; seconds: number; reason: string }
  ) {
  const validation = validateGameClockSetInput(input);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  return {
    expectedSeq: projection.currentSeq,
    payload: {
      remainingMs: validation.remainingMs,
      reason: validation.reason
    }
  };
}

export function validateGameClockSetInput(input: { minutes: number; seconds: number; reason: string }) {
  if (!Number.isInteger(input.minutes) || input.minutes < 0 || input.minutes > 10) {
    return { valid: false as const, error: "Enter game-clock minutes from 0 to 10." };
  }
  if (!Number.isInteger(input.seconds) || input.seconds < 0 || input.seconds > 59) {
    return { valid: false as const, error: "Enter game-clock seconds from 0 to 59." };
  }

  const remainingMs = (input.minutes * 60 + input.seconds) * 1000;
  if (remainingMs > 600_000) {
    return { valid: false as const, error: "Game clock cannot exceed 10:00." };
  }

  const reason = input.reason.trim();
  if (!reason) {
    return { valid: false as const, error: "Enter a correction reason before continuing." };
  }
  if (reason.length > GAME_CLOCK_SET_REASON_MAX_LENGTH) {
    return { valid: false as const, error: "Correction reason must be 500 characters or fewer." };
  }

  return { valid: true as const, remainingMs, reason };
}

export function buildShotClockSetPayload(
  projection: ScoreboardProjection,
  input: { seconds: number; reason: string }
) {
  return {
    expectedSeq: projection.currentSeq,
    payload: {
      remainingMs: Math.max(0, input.seconds * 1000),
      reason: input.reason.trim() ? input.reason.trim() : null
    }
  };
}

export function buildShotClockResetPayload(
  projection: ScoreboardProjection,
  resetToMs: 24000 | 14000,
  reason: string
) {
  return {
    expectedSeq: projection.currentSeq,
    payload: {
      resetToMs,
      reason: reason.trim() ? reason.trim() : null
    }
  };
}

export function getClockControlFeedback(result: CommandResult) {
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
      text: `Clock updated. Current seq ${result.currentSeq}.`
    };
  }

  return {
    tone: "error" as const,
    code: result.reasonCode ?? "INTERNAL_ERROR",
    text: result.message ?? "Clock command was rejected."
  };
}

export function getClockControlLinks(matchId: string) {
  return {
    operatorMatches: { href: "/operator/matches", label: "Back to Operator Matches" },
    scoreControl: { href: buildOperatorMatchScoreLink(matchId), label: "Open Score Control" },
    foulControl: { href: buildOperatorMatchFoulsLink(matchId), label: "Open Foul Control" },
    corrections: { href: buildOperatorMatchCorrectionsLink(matchId), label: "Corrections" },
    publicScoreboard: { href: buildPublicScoreboardLink(matchId), label: "Open Public Scoreboard" }
  };
}
