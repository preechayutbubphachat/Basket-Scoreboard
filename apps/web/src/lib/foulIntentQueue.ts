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

export type FoulQueueLifecycle = "IDLE" | "QUEUED" | "REVALIDATING" | "REVALIDATING_RETRY" | "READY_TO_DISPATCH" | "RECONCILING" | "PAUSED";

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
  | { type: "OWNER_LOST"; hasActiveTransport: boolean }
  | { type: "DISCARD_ALL" };

export type FoulTransportLeaseIdentity = {
  attemptId: string;
  matchId: string;
  ownerId: string;
};

export type FoulTransportLease = FoulTransportLeaseIdentity & {
  token: string;
};

export type FoulNavigationLock = {
  matchId: string;
  ownerId: string;
  pathname: string;
};

export function createFoulLifecycleCoordinator() {
  let transportLease: Readonly<FoulTransportLease> | null = null;
  let navigationLock: Readonly<FoulNavigationLock> | null = null;
  let nextToken = 0;
  const subscribers = new Set<(available: boolean) => void>();

  const sameLease = (candidate: FoulTransportLease) => Boolean(
    transportLease &&
    transportLease.attemptId === candidate.attemptId &&
    transportLease.matchId === candidate.matchId &&
    transportLease.ownerId === candidate.ownerId &&
    transportLease.token === candidate.token
  );
  const sameNavigationLock = (candidate: FoulNavigationLock) => Boolean(
    navigationLock &&
    navigationLock.matchId === candidate.matchId &&
    navigationLock.ownerId === candidate.ownerId &&
    navigationLock.pathname === candidate.pathname
  );
  const notifyAvailability = () => {
    const available = transportLease === null;
    for (const subscriber of [...subscribers]) subscriber(available);
  };

  return {
    acquireNavigationLock(lock: FoulNavigationLock) {
      if (navigationLock) {
        if (sameNavigationLock(lock)) return true;
        if (navigationLock.matchId !== lock.matchId || navigationLock.pathname !== lock.pathname) return false;
      }
      navigationLock = Object.freeze({ ...lock });
      return true;
    },
    acquireTransportLease(identity: FoulTransportLeaseIdentity) {
      if (transportLease) return null;
      const token = `foul-lease-${++nextToken}`;
      transportLease = Object.freeze({ ...identity, token });
      notifyAvailability();
      return token;
    },
    canNavigate(pathname: string) {
      return !navigationLock || pathname === navigationLock.pathname;
    },
    clearNavigationLock() {
      navigationLock = null;
    },
    getLockedPathname() {
      return navigationLock?.pathname ?? null;
    },
    isTransportAvailable() {
      return transportLease === null;
    },
    ownsNavigationLock(lock: FoulNavigationLock) {
      return sameNavigationLock(lock);
    },
    ownsTransportLease(lease: FoulTransportLease) {
      return sameLease(lease);
    },
    releaseNavigationLock(lock: FoulNavigationLock) {
      if (!sameNavigationLock(lock)) return false;
      navigationLock = null;
      return true;
    },
    releaseTransportLease(lease: FoulTransportLease) {
      if (!sameLease(lease)) return false;
      transportLease = null;
      notifyAvailability();
      return true;
    },
    subscribe(subscriber: (available: boolean) => void) {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    }
  };
}

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
      if (state.pauseReason) return state;
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
      return { ...state, lifecycle: "REVALIDATING_RETRY", pauseDetail: null, pauseReason: null };
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
    case "OWNER_LOST":
      return pauseFoulIntentQueueForOwnerLoss(state, action.hasActiveTransport);
    case "DISCARD_ALL":
      return initialFoulIntentQueueState;
  }
}

export function pauseFoulIntentQueueForOwnerLoss(
  state: FoulIntentQueueState,
  hasActiveTransport: boolean
): FoulIntentQueueState {
  if (!hasActiveTransport || !blocksFoulCorrectionNavigation(state)) return state;
  const acceptedOutcomeUnknown = state.lifecycle === "RECONCILING";
  return {
    ...state,
    lifecycle: "PAUSED",
    pauseDetail: acceptedOutcomeUnknown
      ? "The foul was accepted, but owner loss interrupted authoritative reconciliation. Explicit review is required."
      : "The foul page closed during transport. Delivery outcome is unknown; use explicit exact-envelope retry or discard.",
    pauseReason: acceptedOutcomeUnknown ? "REFRESH_FAILED" : "NETWORK_AMBIGUOUS"
  };
}

export type PersistedFoulQueueSession = {
  matchId: string;
  pathname: string;
  principalId: string;
  state: FoulIntentQueueState;
  version: 1;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isStoredIntent(value: unknown): value is FoulIntent {
  if (!isRecord(value) || !hasExactKeys(value, [
    "commandId", "correlationId", "foulType", "gameClockRemainingMs", "jerseyNumber",
    "localIntentId", "observedRosterStatus", "periodNumber", "playerId", "playerName",
    "reason", "teamLabel", "teamSide"
  ])) return false;
  return ["commandId", "correlationId", "localIntentId", "playerId", "playerName", "teamLabel"]
    .every((key) => typeof value[key] === "string" && value[key].length > 0) &&
    value.foulType === "PERSONAL" &&
    (value.teamSide === "HOME" || value.teamSide === "AWAY") &&
    ["ACTIVE", "INACTIVE", "BENCH"].includes(value.observedRosterStatus as string) &&
    Number.isSafeInteger(value.gameClockRemainingMs) && Number(value.gameClockRemainingMs) >= 0 &&
    Number.isSafeInteger(value.periodNumber) && Number(value.periodNumber) > 0 &&
    (value.jerseyNumber === null || typeof value.jerseyNumber === "string") &&
    (value.reason === null || typeof value.reason === "string");
}

function isStoredEnvelope(value: unknown): value is FoulDispatchEnvelope {
  if (!isRecord(value) || !hasExactKeys(value, ["clientTimestamp", "commandId", "correlationId", "expectedSeq", "payload"]) ||
    !isRecord(value.payload) || !hasExactKeys(value.payload, ["foulType", "playerId", "reason", "teamSide"])) return false;
  return typeof value.commandId === "string" && value.commandId.length > 0 &&
    typeof value.correlationId === "string" && value.correlationId.length > 0 &&
    typeof value.clientTimestamp === "string" && value.clientTimestamp.length > 0 &&
    Number.isSafeInteger(value.expectedSeq) && Number(value.expectedSeq) >= 0 &&
    typeof value.payload.playerId === "string" && value.payload.playerId.length > 0 &&
    (value.payload.teamSide === "HOME" || value.payload.teamSide === "AWAY") &&
    value.payload.foulType === "PERSONAL" &&
    (value.payload.reason === null || typeof value.payload.reason === "string");
}

function isStoredQueueState(value: unknown): value is FoulIntentQueueState {
  if (!isRecord(value) || !hasExactKeys(value, [
    "activeEnvelope", "activeIntent", "lifecycle", "pauseDetail", "pauseReason", "queuedIntents"
  ]) || !Array.isArray(value.queuedIntents)) return false;
  const pauseReasons: FoulQueuePauseReason[] = [
    "ACCESS_ERROR", "ACCESS_LOST", "ACCESS_MISMATCH", "MATCH_NOT_LIVE", "PLAYER_INACTIVE",
    "PLAYER_MISSING", "PLAYER_PREVIEW_DRIFT", "PLAYER_SIDE_DRIFT", "REFRESH_FAILED",
    "RECONNECT_REQUIRED", "NETWORK_AMBIGUOUS", "REJECTED", "SYNC_REQUIRED", "WAITING_REVIEW"
  ];
  if (value.lifecycle !== "PAUSED" || !pauseReasons.includes(value.pauseReason as FoulQueuePauseReason) ||
    typeof value.pauseDetail !== "string" || !value.queuedIntents.every(isStoredIntent) ||
    (value.activeIntent !== null && !isStoredIntent(value.activeIntent)) ||
    (value.activeEnvelope !== null && !isStoredEnvelope(value.activeEnvelope))) return false;
  if (!value.activeIntent && value.activeEnvelope) return false;
  if (!value.activeIntent && value.queuedIntents.length === 0) return false;
  const activeIntent = value.activeIntent as FoulIntent | null;
  const activeEnvelope = value.activeEnvelope as FoulDispatchEnvelope | null;
  if (value.pauseReason === "NETWORK_AMBIGUOUS" && (!activeIntent || !activeEnvelope)) return false;
  if (value.pauseReason === "WAITING_REVIEW" && (activeIntent || activeEnvelope || value.queuedIntents.length === 0)) return false;
  if (activeIntent && activeEnvelope) {
    return activeEnvelope.commandId === activeIntent.commandId &&
      activeEnvelope.correlationId === activeIntent.correlationId &&
      activeEnvelope.payload.playerId === activeIntent.playerId &&
      activeEnvelope.payload.teamSide === activeIntent.teamSide &&
      activeEnvelope.payload.reason === activeIntent.reason;
  }
  return true;
}

function pauseFoulIntentQueueForReload(state: FoulIntentQueueState): FoulIntentQueueState {
  if (state.pauseReason) return state;
  if (state.lifecycle === "RECONCILING") {
    return {
      ...state,
      lifecycle: "PAUSED",
      pauseDetail: "The foul was accepted before reload, but reconciliation is incomplete. Explicit review is required.",
      pauseReason: "REFRESH_FAILED"
    };
  }
  if (state.activeEnvelope) return pauseFoulIntentQueueForOwnerLoss(state, true);
  return {
    ...state,
    lifecycle: "PAUSED",
    pauseDetail: state.activeIntent
      ? "Reload interrupted authoritative foul validation. Explicit discard and review are required."
      : "Reload interrupted waiting foul intents. Explicit review is required.",
    pauseReason: state.activeIntent ? "REFRESH_FAILED" : "WAITING_REVIEW"
  };
}

export function serializeFoulQueueSession(matchId: string, pathname: string, principalId: string, state: FoulIntentQueueState) {
  if (!matchId || !pathname || !principalId || !blocksFoulCorrectionNavigation(state)) return null;
  return JSON.stringify({ matchId, pathname, principalId, state: pauseFoulIntentQueueForReload(state), version: 1 });
}

export function restoreFoulQueueSession(raw: string | null): PersistedFoulQueueSession | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !hasExactKeys(parsed, ["matchId", "pathname", "principalId", "state", "version"]) ||
      parsed.version !== 1 || typeof parsed.matchId !== "string" || !parsed.matchId ||
      parsed.pathname !== `/operator/matches/${encodeURIComponent(parsed.matchId)}/fouls` ||
      typeof parsed.principalId !== "string" || !parsed.principalId || !isStoredQueueState(parsed.state) ||
      !blocksFoulCorrectionNavigation(parsed.state)) return null;
    return parsed as PersistedFoulQueueSession;
  } catch {
    return null;
  }
}

function pauseRevalidation(state: FoulIntentQueueState, reason: FoulQueuePauseReason, detail: string, preserveEnvelope = false) {
  return {
    ...state,
    activeEnvelope: preserveEnvelope ? state.activeEnvelope : null,
    lifecycle: "PAUSED" as const,
    pauseDetail: detail,
    pauseReason: reason
  };
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
  const retryingRetainedEnvelope = state.lifecycle === "REVALIDATING_RETRY" && Boolean(state.activeEnvelope);
  if (!state.activeIntent || (state.activeEnvelope && !retryingRetainedEnvelope)) return state;
  const intent = state.activeIntent;
  const pause = (reason: FoulQueuePauseReason, detail: string) =>
    pauseRevalidation(state, reason, detail, retryingRetainedEnvelope);
  if (authoritative.access.lifecycle === "ACCESS_MATCH_MISMATCH") {
    return pause("ACCESS_MISMATCH", "Effective match access does not match this route.");
  }
  if (authoritative.access.lifecycle !== "ACCESS_READY") {
    return pause("ACCESS_ERROR", "Effective match access could not be verified.");
  }
  if (!authoritative.access.canRead || !authoritative.access.canOperateFoul) {
    return pause("ACCESS_LOST", "Foul access is no longer available.");
  }
  const status = authoritative.status.toUpperCase();
  if (status === "FINISHED" || status === "FINAL") {
    return pause("MATCH_NOT_LIVE", "The match no longer permits live foul control.");
  }
  const player = authoritative.players.find((candidate) => candidate.playerId === intent.playerId);
  if (!player) return pause("PLAYER_MISSING", "The selected player is no longer on the roster.");
  if (player.status !== "ACTIVE") return pause("PLAYER_INACTIVE", "The selected player is no longer active.");
  if (player.teamSide !== intent.teamSide) return pause("PLAYER_SIDE_DRIFT", "The selected player's side changed.");
  if (player.playerName.trim() !== intent.playerName || player.jerseyNumber !== intent.jerseyNumber) {
    return pause("PLAYER_PREVIEW_DRIFT", "The selected player's name or jersey changed.");
  }
  if (retryingRetainedEnvelope) {
    return { ...state, lifecycle: "READY_TO_DISPATCH" };
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
