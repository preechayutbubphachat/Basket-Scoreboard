import type { MatchEventType } from "@basket-scoreboard/api-contracts";

export type InternalRecentAction =
  | { sourceEventSeq: number; kind: "SCORE"; teamSide: "HOME" | "AWAY"; points: 1 | 2 | 3 }
  | { sourceEventSeq: number; kind: "TEAM_FOUL"; teamSide: "HOME" | "AWAY" }
  | { sourceEventSeq: number; kind: "TIMEOUT"; teamSide: "HOME" | "AWAY" }
  | {
      sourceEventSeq: number;
      kind: "PERIOD";
      phase: "STARTED" | "ENDED";
      periodType: "REGULATION" | "OVERTIME";
      periodNumber: number;
    }
  | { sourceEventSeq: number; kind: "GAME_STATUS"; status: "STARTED" | "FINAL" };

export type InternalRecentActionState = {
  version: 1;
  initializedAtSeq: number;
  items: InternalRecentAction[];
};

const MAX_RECENT_ACTIONS = 3;

export function createInternalRecentActionState(initializedAtSeq: number): InternalRecentActionState {
  return {
    version: 1,
    initializedAtSeq: validSequence(initializedAtSeq) ? initializedAtSeq : 0,
    items: []
  };
}

export function normalizeInternalRecentActionState(
  value: unknown,
  bootstrapSeq: number
): InternalRecentActionState {
  if (!value || typeof value !== "object") {
    return createInternalRecentActionState(bootstrapSeq);
  }

  const candidate = value as Partial<InternalRecentActionState>;
  if (candidate.version !== 1 || !validSequence(candidate.initializedAtSeq) || !Array.isArray(candidate.items)) {
    return createInternalRecentActionState(bootstrapSeq);
  }

  const seen = new Set<number>();
  const items = candidate.items
    .map(normalizeRecentAction)
    .filter((item): item is InternalRecentAction => item !== null)
    .filter((item) => {
      if (item.sourceEventSeq <= candidate.initializedAtSeq! || seen.has(item.sourceEventSeq)) return false;
      seen.add(item.sourceEventSeq);
      return true;
    })
    .sort((left, right) => right.sourceEventSeq - left.sourceEventSeq)
    .slice(0, MAX_RECENT_ACTIONS);

  return { version: 1, initializedAtSeq: candidate.initializedAtSeq, items };
}

export function applyInternalRecentActionEvent(
  state: InternalRecentActionState,
  eventType: MatchEventType,
  payload: unknown,
  sourceEventSeq: number
): InternalRecentActionState {
  const normalized = normalizeInternalRecentActionState(state, state.initializedAtSeq);
  const record = payloadRecord(payload);
  const correctionTarget = correctionTargetSeq(eventType, record);

  if (correctionTarget !== null) {
    return {
      ...normalized,
      items: normalized.items.filter((item) => item.sourceEventSeq !== correctionTarget)
    };
  }

  if (sourceEventSeq <= normalized.initializedAtSeq || normalized.items.some((item) => item.sourceEventSeq === sourceEventSeq)) {
    return normalized;
  }

  const action = toRecentAction(eventType, record, sourceEventSeq);
  if (!action) return normalized;

  return { ...normalized, items: [action, ...normalized.items].slice(0, MAX_RECENT_ACTIONS) };
}

function toRecentAction(
  eventType: MatchEventType,
  payload: Record<string, unknown>,
  sourceEventSeq: number
): InternalRecentAction | null {
  const teamSide = parseTeamSide(payload.teamSide);

  switch (eventType) {
    case "SCORE_ADDED": {
      const points = Number(payload.points);
      return teamSide && (points === 1 || points === 2 || points === 3)
        ? { sourceEventSeq, kind: "SCORE", teamSide, points }
        : null;
    }
    case "TEAM_FOUL_ADDED":
    case "PLAYER_FOUL_ADDED":
      return teamSide ? { sourceEventSeq, kind: "TEAM_FOUL", teamSide } : null;
    case "TIMEOUT_GRANTED":
      return teamSide ? { sourceEventSeq, kind: "TIMEOUT", teamSide } : null;
    case "MATCH_STARTED":
      return { sourceEventSeq, kind: "GAME_STATUS", status: "STARTED" };
    case "MATCH_FINISHED":
      return { sourceEventSeq, kind: "GAME_STATUS", status: "FINAL" };
    case "PERIOD_STARTED":
    case "PERIOD_ENDED":
    case "OVERTIME_STARTED": {
      const periodNumber = Number(payload.periodNumber);
      const periodType = payload.periodType;
      if (!Number.isInteger(periodNumber) || periodNumber <= 0 || (periodType !== "REGULATION" && periodType !== "OVERTIME")) {
        return null;
      }
      return {
        sourceEventSeq,
        kind: "PERIOD",
        phase: eventType === "PERIOD_ENDED" ? "ENDED" : "STARTED",
        periodType,
        periodNumber
      };
    }
    default:
      return null;
  }
}

function correctionTargetSeq(eventType: MatchEventType, payload: Record<string, unknown>) {
  switch (eventType) {
    case "SCORE_REMOVED_BY_CORRECTION":
      return parseSequence(payload.originalScoreSeq);
    case "SCORE_CORRECTED":
    case "TEAM_FOUL_CORRECTED":
    case "PLAYER_FOUL_CORRECTED":
    case "TIMEOUT_CORRECTED":
      return parseSequence(payload.correctedEventSeq);
    default:
      return null;
  }
}

function normalizeRecentAction(value: unknown): InternalRecentAction | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const sourceEventSeq = parseSequence(candidate.sourceEventSeq);
  if (sourceEventSeq === null) return null;
  const teamSide = parseTeamSide(candidate.teamSide);

  switch (candidate.kind) {
    case "SCORE": {
      const points = Number(candidate.points);
      return teamSide && (points === 1 || points === 2 || points === 3)
        ? { sourceEventSeq, kind: "SCORE", teamSide, points }
        : null;
    }
    case "TEAM_FOUL":
      return teamSide ? { sourceEventSeq, kind: "TEAM_FOUL", teamSide } : null;
    case "TIMEOUT":
      return teamSide ? { sourceEventSeq, kind: "TIMEOUT", teamSide } : null;
    case "PERIOD": {
      const periodNumber = Number(candidate.periodNumber);
      if (
        (candidate.phase !== "STARTED" && candidate.phase !== "ENDED") ||
        (candidate.periodType !== "REGULATION" && candidate.periodType !== "OVERTIME") ||
        !Number.isInteger(periodNumber) ||
        periodNumber <= 0
      ) return null;
      return {
        sourceEventSeq,
        kind: "PERIOD",
        phase: candidate.phase,
        periodType: candidate.periodType,
        periodNumber
      };
    }
    case "GAME_STATUS":
      return candidate.status === "STARTED" || candidate.status === "FINAL"
        ? { sourceEventSeq, kind: "GAME_STATUS", status: candidate.status }
        : null;
    default:
      return null;
  }
}

function parseTeamSide(value: unknown): "HOME" | "AWAY" | null {
  return value === "HOME" || value === "AWAY" ? value : null;
}

function parseSequence(value: unknown) {
  const parsed = Number(value);
  return validSequence(parsed) ? parsed : null;
}

function validSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function payloadRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
