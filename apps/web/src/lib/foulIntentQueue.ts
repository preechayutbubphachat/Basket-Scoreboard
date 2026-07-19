export type FoulIntentTeamSide = "HOME" | "AWAY";
export type FoulIntentRosterStatus = "ACTIVE" | "INACTIVE" | "BENCH";

export type FoulIntentPlayerSnapshot = {
  playerId: string;
  playerName: string;
  jerseyNumber: string | null;
  status: FoulIntentRosterStatus;
  teamSide: FoulIntentTeamSide;
};

export type FoulIntent = {
  commandId: string;
  correlationId: string;
  foulType: "PERSONAL";
  gameClockRemainingMs: number;
  localIntentId: string;
  observedRosterStatus: FoulIntentRosterStatus;
  periodNumber: number;
  playerId: string;
  playerName: string;
  jerseyNumber: string | null;
  reason: string | null;
  teamLabel: string;
  teamSide: FoulIntentTeamSide;
};

export type FoulDispatchEnvelope = {
  commandId: string;
  correlationId: string;
  expectedSeq: number;
  clientTimestamp: string;
  payload: {
    teamSide: FoulIntentTeamSide;
    playerId: string;
    foulType: "PERSONAL";
    reason: string | null;
  };
};

export type FoulQueuePauseReason =
  | "ACCESS_ERROR"
  | "ACCESS_LOST"
  | "ACCESS_MISMATCH"
  | "MATCH_NOT_LIVE"
  | "PLAYER_INACTIVE"
  | "PLAYER_MISSING"
  | "PLAYER_PREVIEW_DRIFT"
  | "PLAYER_SIDE_DRIFT"
  | "REFRESH_FAILED"
  | "RECONNECT_REQUIRED"
  | "NETWORK_AMBIGUOUS"
  | "REJECTED"
  | "SYNC_REQUIRED"
  | "WAITING_REVIEW";

export type FoulQueueLifecycle = "IDLE" | "QUEUED" | "REVALIDATING" | "READY_TO_DISPATCH" | "RECONCILING" | "PAUSED";

export type FoulIntentQueueState = {
  activeEnvelope: FoulDispatchEnvelope | null;
  activeIntent: FoulIntent | null;
  lifecycle: FoulQueueLifecycle;
  pauseDetail: string | null;
  pauseReason: FoulQueuePauseReason | null;
  queuedIntents: FoulIntent[];
};

export type FoulIntentQueueAction =
  | { type: "ENQUEUE"; intent: FoulIntent }
  | { type: "START_NEXT" }
  | {
      type: "PREPARE_DISPATCH";
      authoritative: Parameters<typeof prepareFoulIntentDispatch>[1];
      clientTimestamp: string;
    }
  | { type: "PAUSE"; reason: FoulQueuePauseReason; detail: string }
  | { type: "ACCEPTED_PENDING_RECONCILIATION" }
  | { type: "RECONCILED_ACCEPTED" }
  | { type: "RETRY_AMBIGUOUS" }
  | { type: "DISCARD_ACTIVE" }
  | { type: "RESUME_WAITING" }
  | { type: "DISCARD_ALL" };

export const initialFoulIntentQueueState: FoulIntentQueueState = {
  activeEnvelope: null,
  activeIntent: null,
  lifecycle: "IDLE",
  pauseDetail: null,
  pauseReason: null,
  queuedIntents: []
};

export function canEnqueueFoulIntent(options: {
  canOperate: boolean;
  matchStatus: string;
  pauseReason: FoulQueuePauseReason | string | null;
}) {
  const status = options.matchStatus.toUpperCase();
  return options.canOperate && !options.pauseReason && status !== "FINISHED" && status !== "FINAL";
}

export function createFoulIntent(options: {
  commandId: string;
  correlationId: string;
  gameClockRemainingMs: number;
  localIntentId: string;
  periodNumber: number;
  player: FoulIntentPlayerSnapshot;
  reason: string;
  teamLabel: string;
}): FoulIntent {
  return {
    commandId: options.commandId,
    correlationId: options.correlationId,
    foulType: "PERSONAL",
    gameClockRemainingMs: options.gameClockRemainingMs,
    localIntentId: options.localIntentId,
    observedRosterStatus: options.player.status,
    periodNumber: options.periodNumber,
    playerId: options.player.playerId,
    playerName: options.player.playerName.trim(),
    jerseyNumber: options.player.jerseyNumber,
    reason: options.reason.trim() || null,
    teamLabel: options.teamLabel,
    teamSide: options.player.teamSide
  };
}

export function foulIntentQueueReducer(state: FoulIntentQueueState, action: FoulIntentQueueAction): FoulIntentQueueState {
  switch (action.type) {
    case "ENQUEUE":
      return { ...state, lifecycle: state.lifecycle === "IDLE" ? "QUEUED" : state.lifecycle, queuedIntents: [...state.queuedIntents, action.intent] };
    case "START_NEXT": {
      if (state.activeIntent || state.pauseReason || state.queuedIntents.length === 0) return state;
      const [activeIntent, ...queuedIntents] = state.queuedIntents;
      return { ...state, activeIntent: activeIntent ?? null, lifecycle: "REVALIDATING", queuedIntents };
    }
    case "PREPARE_DISPATCH":
      return prepareFoulIntentDispatch(state, action.authoritative, action.clientTimestamp);
    case "PAUSE":
      return { ...state, lifecycle: "PAUSED", pauseDetail: action.detail, pauseReason: action.reason };
    case "ACCEPTED_PENDING_RECONCILIATION":
      if (!state.activeIntent || !state.activeEnvelope || state.pauseReason) return state;
      return { ...state, lifecycle: "RECONCILING" };
    case "RECONCILED_ACCEPTED":
      if (state.lifecycle !== "RECONCILING") return state;
      return {
        ...state,
        activeEnvelope: null,
        activeIntent: null,
        lifecycle: state.queuedIntents.length > 0 ? "QUEUED" : "IDLE"
      };
    case "RETRY_AMBIGUOUS":
      if (state.pauseReason !== "NETWORK_AMBIGUOUS" || !state.activeEnvelope || !state.activeIntent) return state;
      return { ...state, lifecycle: "READY_TO_DISPATCH", pauseDetail: null, pauseReason: null };
    case "DISCARD_ACTIVE":
      if (!state.activeIntent) return state;
      return {
        ...state,
        activeEnvelope: null,
        activeIntent: null,
        lifecycle: state.queuedIntents.length > 0 ? "PAUSED" : "IDLE",
        pauseDetail: state.queuedIntents.length > 0 ? "Waiting foul intents require explicit review." : null,
        pauseReason: state.queuedIntents.length > 0 ? "WAITING_REVIEW" : null
      };
    case "RESUME_WAITING":
      if (state.pauseReason !== "WAITING_REVIEW" || state.activeIntent) return state;
      return { ...state, lifecycle: state.queuedIntents.length > 0 ? "QUEUED" : "IDLE", pauseDetail: null, pauseReason: null };
    case "DISCARD_ALL":
      return initialFoulIntentQueueState;
  }
}

function pauseRevalidation(state: FoulIntentQueueState, reason: FoulQueuePauseReason, detail: string) {
  return { ...state, activeEnvelope: null, lifecycle: "PAUSED" as const, pauseDetail: detail, pauseReason: reason };
}

export function prepareFoulIntentDispatch(
  state: FoulIntentQueueState,
  authoritative: {
    access: {
      lifecycle: string;
      canRead: boolean;
      canOperateFoul: boolean;
    };
    currentSeq: number;
    players: FoulIntentPlayerSnapshot[];
    status: string;
  },
  clientTimestamp: string
): FoulIntentQueueState {
  if (!state.activeIntent || state.activeEnvelope) return state;
  const intent = state.activeIntent;
  if (authoritative.access.lifecycle === "ACCESS_MATCH_MISMATCH") {
    return pauseRevalidation(state, "ACCESS_MISMATCH", "Effective match access does not match this route.");
  }
  if (authoritative.access.lifecycle !== "ACCESS_READY") {
    return pauseRevalidation(state, "ACCESS_ERROR", "Effective match access could not be verified.");
  }
  if (!authoritative.access.canRead || !authoritative.access.canOperateFoul) {
    return pauseRevalidation(state, "ACCESS_LOST", "Foul access is no longer available.");
  }
  if (authoritative.status === "FINISHED" || authoritative.status === "FINAL") {
    return pauseRevalidation(state, "MATCH_NOT_LIVE", "The match no longer permits live foul control.");
  }
  const player = authoritative.players.find((candidate) => candidate.playerId === intent.playerId);
  if (!player) return pauseRevalidation(state, "PLAYER_MISSING", "The selected player is no longer on the roster.");
  if (player.status !== "ACTIVE") return pauseRevalidation(state, "PLAYER_INACTIVE", "The selected player is no longer active.");
  if (player.teamSide !== intent.teamSide) return pauseRevalidation(state, "PLAYER_SIDE_DRIFT", "The selected player's side changed.");
  if (player.playerName.trim() !== intent.playerName || player.jerseyNumber !== intent.jerseyNumber) {
    return pauseRevalidation(state, "PLAYER_PREVIEW_DRIFT", "The selected player's name or jersey changed.");
  }
  return {
    ...state,
    activeEnvelope: {
      commandId: intent.commandId,
      correlationId: intent.correlationId,
      expectedSeq: authoritative.currentSeq,
      clientTimestamp,
      payload: {
        teamSide: intent.teamSide,
        playerId: intent.playerId,
        foulType: "PERSONAL",
        reason: intent.reason
      }
    },
    lifecycle: "READY_TO_DISPATCH"
  };
}

export function blocksFoulCorrectionNavigation(state: FoulIntentQueueState) {
  return Boolean(state.activeIntent || state.queuedIntents.length > 0 || state.pauseReason || state.lifecycle !== "IDLE");
}
