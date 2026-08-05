import { describe, expect, it } from "vitest";
import {
  applyMatchCommandSequenceAction,
  createMatchCommandSequenceState,
  type MatchCommandSequenceAction
} from "../../apps/web/src/lib/matchCommandSequence";

describe("match command sequence state", () => {
  it("commits HOME accepted currentSeq before the next AWAY command reads it", () => {
    let state = createMatchCommandSequenceState("match-1");
    state = applyMatchCommandSequenceAction(state, { type: "ACCEPTED", currentSeq: 1, correlationId: "home" });
    expect(state.currentSeq).toBe(1);
    expect(state.lastAcceptedCorrelationId).toBe("home");
    expect(state.syncStatus).toBe("SYNCED");
  });

  it("never decreases for late accepted receipts or socket snapshots", () => {
    let state = createMatchCommandSequenceState("match-1");
    state = applyMatchCommandSequenceAction(state, { type: "ACCEPTED", currentSeq: 2, correlationId: "newer" });
    state = applyMatchCommandSequenceAction(state, { type: "ACCEPTED", currentSeq: 1, correlationId: "late" });
    state = applyMatchCommandSequenceAction(state, { type: "SOCKET_SNAPSHOT", currentSeq: 1 });
    expect(state.currentSeq).toBe(2);
    expect(state.lastAcceptedCorrelationId).toBe("newer");
  });

  it("requires authoritative reload without optimistic increment after INVALID_EXPECTED_SEQ", () => {
    let state = createMatchCommandSequenceState("match-1");
    state = applyMatchCommandSequenceAction(state, { type: "ACCEPTED", currentSeq: 1, correlationId: "home" });
    state = applyMatchCommandSequenceAction(state, { type: "SYNC_REQUIRED" });
    expect(state.currentSeq).toBe(1);
    expect(state.syncStatus).toBe("SYNC_REQUIRED");
    state = applyMatchCommandSequenceAction(state, { type: "SYNC_STARTED" });
    expect(state.syncStatus).toBe("SYNCING");
    state = applyMatchCommandSequenceAction(state, { type: "AUTHORITATIVE_HYDRATED", currentSeq: 2 });
    expect(state.currentSeq).toBe(2);
    expect(state.syncStatus).toBe("SYNCED");
  });

  it("does not reuse sequence state when the active match changes", () => {
    let state = createMatchCommandSequenceState("match-1");
    state = applyMatchCommandSequenceAction(state, { type: "ACCEPTED", currentSeq: 2, correlationId: "match-1" });
    state = applyMatchCommandSequenceAction(state, { type: "MATCH_CHANGED", matchId: "match-2" });
    expect(state).toEqual({ matchId: "match-2", currentSeq: 0, syncStatus: "SYNCED" });
  });

  it("keeps the action contract explicit for every sequence source", () => {
    const actions: MatchCommandSequenceAction[] = [
      { type: "ACCEPTED", currentSeq: 1, correlationId: "id" },
      { type: "SOCKET_SNAPSHOT", currentSeq: 1 },
      { type: "SYNC_REQUIRED" },
      { type: "SYNC_STARTED" },
      { type: "AUTHORITATIVE_HYDRATED", currentSeq: 1 },
      { type: "MATCH_CHANGED", matchId: "match-2" }
    ];
    expect(actions).toHaveLength(6);
  });
});
