import type { ScoreboardProjection } from "@basket-scoreboard/api-contracts";
import type { ScoreControlPoint, ScoreControlTeamSide } from "./scoreControl";

export type ScoreIntent = {
  commandId: string;
  correlationId: string;
  gameClockRemainingMs: number;
  localIntentId: string;
  note: null;
  periodNumber: number;
  playerId: string | null;
  points: ScoreControlPoint;
  teamSide: ScoreControlTeamSide;
};

export type ScoreQueuePauseReason = "SYNC_REQUIRED" | "REJECTED" | "NETWORK_AMBIGUOUS" | "ACCESS_LOST";

export type ScoreIntentQueueState = {
  activeIntent: ScoreIntent | null;
  pauseDetail: string | null;
  pauseReason: ScoreQueuePauseReason | null;
  queuedIntents: ScoreIntent[];
  retryNonce: number;
};

export type ScoreIntentQueueAction =
  | { type: "ENQUEUE"; intent: ScoreIntent }
  | { type: "START_NEXT" }
  | { type: "ACCEPT_ACTIVE" }
  | { type: "PAUSE"; reason: ScoreQueuePauseReason; detail: string }
  | { type: "RETRY_ACTIVE" }
  | { type: "RESUME_QUEUED" }
  | { type: "DISCARD_ALL" };

export const initialScoreIntentQueueState: ScoreIntentQueueState = {
  activeIntent: null,
  pauseDetail: null,
  pauseReason: null,
  queuedIntents: [],
  retryNonce: 0
};

export function createScoreIntent(options: {
  commandId: string;
  correlationId: string;
  localIntentId: string;
  playerId: string | null;
  points: ScoreControlPoint;
  projection: Pick<ScoreboardProjection, "gameClockRemainingMs" | "periodNumber">;
  teamSide: ScoreControlTeamSide;
}): ScoreIntent {
  return {
    commandId: options.commandId,
    correlationId: options.correlationId,
    gameClockRemainingMs: options.projection.gameClockRemainingMs,
    localIntentId: options.localIntentId,
    note: null,
    periodNumber: options.projection.periodNumber,
    playerId: options.playerId,
    points: options.points,
    teamSide: options.teamSide
  };
}

export function scoreIntentQueueReducer(state: ScoreIntentQueueState, action: ScoreIntentQueueAction): ScoreIntentQueueState {
  switch (action.type) {
    case "ENQUEUE":
      return { ...state, queuedIntents: [...state.queuedIntents, action.intent] };
    case "START_NEXT": {
      if (state.activeIntent || state.pauseReason || state.queuedIntents.length === 0) return state;
      const [activeIntent, ...queuedIntents] = state.queuedIntents;
      return { ...state, activeIntent: activeIntent ?? null, queuedIntents };
    }
    case "ACCEPT_ACTIVE":
      return { ...state, activeIntent: null, pauseDetail: null, pauseReason: null };
    case "PAUSE":
      return { ...state, pauseDetail: action.detail, pauseReason: action.reason };
    case "RETRY_ACTIVE":
      if (!state.activeIntent || state.pauseReason !== "NETWORK_AMBIGUOUS") return state;
      return { ...state, pauseDetail: null, pauseReason: null, retryNonce: state.retryNonce + 1 };
    case "RESUME_QUEUED":
      if (!state.pauseReason) return state;
      return { ...state, activeIntent: null, pauseDetail: null, pauseReason: null };
    case "DISCARD_ALL":
      return { ...initialScoreIntentQueueState, retryNonce: state.retryNonce };
  }
}

export function buildScoreQueuePresentation(state: ScoreIntentQueueState) {
  const queuedCount = state.queuedIntents.length;
  if (state.pauseReason) {
    return {
      detail: state.pauseDetail ?? "Score actions are paused for operator review.",
      label: state.pauseReason === "ACCESS_LOST"
        ? "Score access changed — queued actions paused"
        : state.pauseReason === "SYNC_REQUIRED"
        ? "Synchronization required — queued actions paused"
        : state.pauseReason === "NETWORK_AMBIGUOUS"
          ? "Delivery uncertain — retry with the same command identity"
          : "Score command rejected — queued actions paused",
      paused: true,
      queuedCount,
      retryAvailable: state.pauseReason === "NETWORK_AMBIGUOUS"
    };
  }
  if (state.activeIntent) {
    return {
      detail: queuedCount > 0 ? `${queuedCount} action${queuedCount === 1 ? "" : "s"} queued` : "No actions waiting",
      label: `Sending ${state.activeIntent.teamSide} +${state.activeIntent.points}`,
      paused: false,
      queuedCount,
      retryAvailable: false
    };
  }
  if (queuedCount > 0) {
    return {
      detail: `${queuedCount} action${queuedCount === 1 ? "" : "s"} queued`,
      label: "Preparing next score action",
      paused: false,
      queuedCount,
      retryAvailable: false
    };
  }
  return null;
}
