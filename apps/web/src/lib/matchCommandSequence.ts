export type MatchCommandSequenceState = {
  matchId: string;
  currentSeq: number;
  syncStatus: "SYNCED" | "SYNCING" | "SYNC_REQUIRED";
  lastAcceptedCorrelationId?: string;
};

export type MatchCommandSequenceAction =
  | { type: "ACCEPTED"; currentSeq: number; correlationId?: string }
  | { type: "SOCKET_SNAPSHOT"; currentSeq: number }
  | { type: "SYNC_REQUIRED" }
  | { type: "SYNC_STARTED" }
  | { type: "AUTHORITATIVE_HYDRATED"; currentSeq: number }
  | { type: "MATCH_CHANGED"; matchId: string };

export function createMatchCommandSequenceState(matchId: string, currentSeq = 0): MatchCommandSequenceState {
  return { matchId, currentSeq: Math.max(0, currentSeq), syncStatus: "SYNCED" };
}

function maxSequence(state: MatchCommandSequenceState, currentSeq: number) {
  return Number.isSafeInteger(currentSeq) && currentSeq >= 0
    ? Math.max(state.currentSeq, currentSeq)
    : state.currentSeq;
}

export function applyMatchCommandSequenceAction(
  state: MatchCommandSequenceState,
  action: MatchCommandSequenceAction
): MatchCommandSequenceState {
  switch (action.type) {
    case "ACCEPTED": {
      const acceptedSeq = maxSequence(state, action.currentSeq);
      return {
        ...state,
        currentSeq: acceptedSeq,
        syncStatus: "SYNCED",
        ...(action.correlationId && action.currentSeq >= state.currentSeq
          ? { lastAcceptedCorrelationId: action.correlationId }
          : {})
      };
    }
    case "SOCKET_SNAPSHOT":
      return { ...state, currentSeq: maxSequence(state, action.currentSeq) };
    case "SYNC_REQUIRED":
      return { ...state, syncStatus: "SYNC_REQUIRED" };
    case "SYNC_STARTED":
      return { ...state, syncStatus: "SYNCING" };
    case "AUTHORITATIVE_HYDRATED":
      return { ...state, currentSeq: maxSequence(state, action.currentSeq), syncStatus: "SYNCED" };
    case "MATCH_CHANGED":
      return createMatchCommandSequenceState(action.matchId);
  }
}
