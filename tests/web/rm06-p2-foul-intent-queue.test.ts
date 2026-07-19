import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createApiClient, type FetchLike } from "../../apps/web/src/lib/apiClient";
import {
  blocksFoulCorrectionNavigation,
  canEnqueueFoulIntent,
  createFoulIntent,
  initialFoulIntentQueueState,
  prepareFoulIntentDispatch,
  foulIntentQueueReducer
} from "../../apps/web/src/lib/foulIntentQueue";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");
const foulRouteSource = appSource.slice(appSource.indexOf("function OperatorFoulPage"), appSource.indexOf("function OperatorClockPage"));

const player = {
  playerId: "player-home-1",
  playerName: "  Home Guard  ",
  jerseyNumber: "07" as string | null,
  status: "ACTIVE" as const,
  teamSide: "HOME" as const
};

function intent(id: string, overrides: Partial<Parameters<typeof createFoulIntent>[0]> = {}) {
  return createFoulIntent({
    commandId: `command-${id}`,
    correlationId: `correlation-${id}`,
    localIntentId: `local-${id}`,
    player,
    reason: "  hand check  ",
    teamLabel: "Home Team",
    periodNumber: 2,
    gameClockRemainingMs: 321_000,
    ...overrides
  });
}

function authoritative(overrides: Record<string, unknown> = {}) {
  return {
    matchId: "match-1",
    status: "IN_PROGRESS" as const,
    currentSeq: 40,
    access: {
      lifecycle: "ACCESS_READY" as const,
      canRead: true,
      canOperateFoul: true
    },
    players: [player],
    ...overrides
  };
}

describe("RM-06-P2 foul intent activation and FIFO dispatch", () => {
  it.each([
    ["active request", { canOperate: true, matchStatus: "IN_PROGRESS", pauseReason: null }, true],
    ["active envelope", { canOperate: true, matchStatus: "IN_PROGRESS", pauseReason: null }, true],
    ["pending transport", { canOperate: true, matchStatus: "IN_PROGRESS", pauseReason: null }, true],
    ["paused queue", { canOperate: true, matchStatus: "IN_PROGRESS", pauseReason: "NETWORK_AMBIGUOUS" }, false],
    ["denied access", { canOperate: false, matchStatus: "IN_PROGRESS", pauseReason: null }, false],
    ["finished match", { canOperate: true, matchStatus: "FINISHED", pauseReason: null }, false],
    ["final match case-safe", { canOperate: true, matchStatus: "final", pauseReason: null }, false]
  ])("allows selection and confirmation based on enqueue eligibility for %s", (_label, policy, expected) => {
    expect(canEnqueueFoulIntent(policy)).toBe(expected);
  });

  it("sends the exact caller-supplied player-foul envelope without changing the wire shape", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { csrfToken: "csrf-token" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ACCEPTED", currentSeq: 74 }), { status: 200 }));
    const api = createApiClient({ baseUrl: "/api/v1", fetchImpl });
    const envelope = {
      commandId: "command-retained",
      correlationId: "correlation-retained",
      expectedSeq: 73,
      clientTimestamp: "2026-07-19T03:00:00.000Z",
      payload: {
        teamSide: "HOME" as const,
        playerId: "player-home-1",
        foulType: "PERSONAL" as const,
        reason: "hand check"
      }
    };

    await api.addPlayerFoul("match-1", envelope);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "/api/v1/matches/match-1/commands/foul/player/add",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          commandId: envelope.commandId,
          matchId: "match-1",
          expectedSeq: envelope.expectedSeq,
          correlationId: envelope.correlationId,
          clientTimestamp: envelope.clientTimestamp,
          payload: envelope.payload
        })
      })
    );
  });

  it("captures immutable trimmed snapshots with distinct identities and no expectedSeq", () => {
    const first = intent("1");
    const repeated = intent("2");

    expect(first).toEqual({
      localIntentId: "local-1",
      commandId: "command-1",
      correlationId: "correlation-1",
      teamSide: "HOME",
      teamLabel: "Home Team",
      playerId: "player-home-1",
      playerName: "Home Guard",
      jerseyNumber: "07",
      foulType: "PERSONAL",
      reason: "hand check",
      periodNumber: 2,
      gameClockRemainingMs: 321_000,
      observedRosterStatus: "ACTIVE"
    });
    expect(first).not.toHaveProperty("expectedSeq");
    expect(repeated.localIntentId).not.toBe(first.localIntentId);

    player.playerName = "Changed after confirmation";
    expect(first.playerName).toBe("Home Guard");
  });

  it("keeps same-side and cross-side confirmations FIFO with at most one active intent", () => {
    const homeOne = intent("1");
    const homeTwo = intent("2");
    const away = intent("3", {
      player: { ...player, playerId: "player-away-1", playerName: "Away Guard", teamSide: "AWAY" },
      teamLabel: "Away Team"
    });
    let state = initialFoulIntentQueueState;
    for (const queued of [homeOne, homeTwo, away]) {
      state = foulIntentQueueReducer(state, { type: "ENQUEUE", intent: queued });
    }
    state = foulIntentQueueReducer(state, { type: "START_NEXT" });
    const unchanged = foulIntentQueueReducer(state, { type: "START_NEXT" });

    expect(state.activeIntent?.localIntentId).toBe("local-1");
    expect(state.queuedIntents.map((item) => item.localIntentId)).toEqual(["local-2", "local-3"]);
    expect(unchanged).toBe(state);
  });

  it("captures latest refreshed expectedSeq only in the first-attempt envelope", () => {
    const active = intent("1");
    let state = foulIntentQueueReducer(initialFoulIntentQueueState, { type: "ENQUEUE", intent: active });
    state = foulIntentQueueReducer(state, { type: "START_NEXT" });

    const prepared = prepareFoulIntentDispatch(state, authoritative({ currentSeq: 73 }), "2026-07-19T03:00:00.000Z");

    expect(prepared.pauseReason).toBeNull();
    expect(prepared.activeEnvelope).toEqual({
      commandId: "command-1",
      correlationId: "correlation-1",
      expectedSeq: 73,
      clientTimestamp: "2026-07-19T03:00:00.000Z",
      payload: {
        teamSide: "HOME",
        playerId: "player-home-1",
        foulType: "PERSONAL",
        reason: "hand check"
      }
    });
    expect(prepared.activeIntent).not.toHaveProperty("expectedSeq");
  });
});

describe("RM-06-P2 foul route review and confirmation", () => {
  it("uses pause, access, and status eligibility instead of pending transport to gate enqueue", () => {
    expect(foulRouteSource).toContain("canEnqueueFoulIntent({");
    expect(foulRouteSource).toContain("pauseReason: foulQueue.pauseReason");
    expect(foulRouteSource).toContain("matchStatus: projection.status");
    expect(foulRouteSource).toContain("canOperate: canSubmitFoul");
    expect(foulRouteSource).not.toContain("canUseLiveMatchControls(projection, canSubmitFoul, Boolean(pendingKey))");
  });

  it("requires explicit HOME or AWAY player selection and exposes the immutable preview before confirmation", () => {
    for (const signal of [
      "selectedFoulPlayer",
      "Review personal foul",
      "Confirm personal foul",
      "Activation period / clock",
      "Jersey",
      "Reason (optional)",
      "createFoulIntent({"
    ]) {
      expect(foulRouteSource).toContain(signal);
    }
    expect(foulRouteSource).not.toContain("onClick={() => void addPlayerFoul(player)}");
    expect(foulRouteSource).toContain('player.status !== "ACTIVE"');
  });

  it("owns FIFO dispatch, refreshes all authority before first attempt, and sends the retained envelope", () => {
    for (const signal of [
      "useReducer(foulIntentQueueReducer",
      "dispatchFoulQueue({ type: \"ENQUEUE\", intent })",
      "dispatchFoulQueue({ type: \"START_NEXT\" })",
      "type: \"PREPARE_DISPATCH\"",
      "api.getMatchProjection(matchId)",
      "api.getMatchRosters(matchId)",
      "api.getEffectiveMatchAccess(matchId)",
      "api.addPlayerFoul(matchId, activeEnvelope)",
      "ACCEPTED_PENDING_RECONCILIATION",
      "RECONCILED_ACCEPTED"
    ]) {
      expect(foulRouteSource).toContain(signal);
    }
  });

  it("pauses fail closed and exposes only explicit retry, discard, review/resume, and blocked correction controls", () => {
    for (const signal of [
      "blocksFoulCorrectionNavigation(foulQueue)",
      "RECONNECT_REQUIRED",
      "ACCESS_LOST",
      "RETRY_AMBIGUOUS",
      "DISCARD_ACTIVE",
      "DISCARD_ALL",
      "RESUME_WAITING",
      "Retry exact foul envelope",
      "Discard active foul",
      "Discard all foul intents",
      "Review and resume waiting fouls",
      "Corrections are blocked while foul intents are unresolved"
    ]) {
      expect(foulRouteSource).toContain(signal);
    }
    expect(foulRouteSource).not.toContain("aria-live=\"polite\">Queued");
  });

  it("distinguishes accepted reconciliation failure from an ambiguous transport outcome", () => {
    expect(foulRouteSource).toContain("let acceptedByServer = false");
    expect(foulRouteSource).toContain("acceptedByServer = true");
    expect(foulRouteSource).toContain('reason: acceptedByServer ? "REFRESH_FAILED" : "NETWORK_AMBIGUOUS"');
  });
});

describe("RM-06-P2 fail-closed authoritative revalidation", () => {
  function activeState() {
    let state = foulIntentQueueReducer(initialFoulIntentQueueState, { type: "ENQUEUE", intent: intent("1") });
    return foulIntentQueueReducer(state, { type: "START_NEXT" });
  }

  it.each([
    ["access loss", { access: { lifecycle: "ACCESS_READY", canRead: true, canOperateFoul: false } }, "ACCESS_LOST"],
    ["access mismatch", { access: { lifecycle: "ACCESS_MATCH_MISMATCH", canRead: false, canOperateFoul: false } }, "ACCESS_MISMATCH"],
    ["access error", { access: { lifecycle: "ACCESS_ERROR", canRead: false, canOperateFoul: false } }, "ACCESS_ERROR"],
    ["finished status", { status: "FINISHED" }, "MATCH_NOT_LIVE"],
    ["final status", { status: "FINAL" }, "MATCH_NOT_LIVE"],
    ["missing player", { players: [] }, "PLAYER_MISSING"],
    ["inactive player", { players: [{ ...player, status: "INACTIVE" }] }, "PLAYER_INACTIVE"],
    ["benched player", { players: [{ ...player, status: "BENCH" }] }, "PLAYER_INACTIVE"],
    ["wrong side", { players: [{ ...player, teamSide: "AWAY" }] }, "PLAYER_SIDE_DRIFT"],
    ["name drift", { players: [{ ...player, playerName: "Renamed Guard" }] }, "PLAYER_PREVIEW_DRIFT"],
    ["jersey drift", { players: [{ ...player, jerseyNumber: null }] }, "PLAYER_PREVIEW_DRIFT"]
  ])("pauses without envelope or mutation for %s", (_label, override, expectedReason) => {
    const state = activeState();
    const snapshot = state.activeIntent;
    const prepared = prepareFoulIntentDispatch(state, authoritative(override), "2026-07-19T03:00:00.000Z");

    expect(prepared.pauseReason).toBe(expectedReason);
    expect(prepared.activeEnvelope).toBeNull();
    expect(prepared.activeIntent).toEqual(snapshot);
    expect(prepared.activeIntent).toBe(snapshot);
  });

  it("pauses on refresh failure without replaying or draining", () => {
    const state = activeState();
    const paused = foulIntentQueueReducer(state, {
      type: "PAUSE",
      reason: "REFRESH_FAILED",
      detail: "Projection, roster, and access refresh failed."
    });

    expect(paused.pauseReason).toBe("REFRESH_FAILED");
    expect(paused.activeIntent).toBe(state.activeIntent);
    expect(paused.activeEnvelope).toBeNull();
    expect(foulIntentQueueReducer(paused, { type: "START_NEXT" })).toBe(paused);
  });
});

describe("RM-06-P2 dispatch outcomes and explicit recovery", () => {
  function preparedState(withWaiting = true) {
    let state = initialFoulIntentQueueState;
    state = foulIntentQueueReducer(state, { type: "ENQUEUE", intent: intent("1") });
    if (withWaiting) state = foulIntentQueueReducer(state, { type: "ENQUEUE", intent: intent("2") });
    state = foulIntentQueueReducer(state, { type: "START_NEXT" });
    return prepareFoulIntentDispatch(state, authoritative({ currentSeq: 91 }), "2026-07-19T03:00:00.000Z");
  }

  it("rejects enqueue with the exact same state while an ambiguous active intent is paused", () => {
    const prepared = preparedState();
    const paused = foulIntentQueueReducer(prepared, {
      type: "PAUSE",
      reason: "NETWORK_AMBIGUOUS",
      detail: "Delivery outcome is unknown."
    });

    const unchanged = foulIntentQueueReducer(paused, { type: "ENQUEUE", intent: intent("3") });

    expect(unchanged).toBe(paused);
    expect(unchanged.activeIntent).toBe(paused.activeIntent);
    expect(unchanged.activeEnvelope).toBe(paused.activeEnvelope);
    expect(unchanged.queuedIntents).toBe(paused.queuedIntents);
  });

  it("rejects enqueue with the exact same WAITING_REVIEW state while queued intents await review", () => {
    const prepared = preparedState();
    const paused = foulIntentQueueReducer(prepared, { type: "PAUSE", reason: "REJECTED", detail: "Rejected." });
    const waitingReview = foulIntentQueueReducer(paused, { type: "DISCARD_ACTIVE" });

    const unchanged = foulIntentQueueReducer(waitingReview, { type: "ENQUEUE", intent: intent("3") });

    expect(waitingReview.activeIntent).toBeNull();
    expect(waitingReview.pauseReason).toBe("WAITING_REVIEW");
    expect(unchanged).toBe(waitingReview);
    expect(unchanged.queuedIntents).toBe(waitingReview.queuedIntents);
    expect(unchanged.queuedIntents.map((item) => item.localIntentId)).toEqual(["local-2"]);
  });

  it("keeps accepted active until authoritative reconciliation before considering FIFO next", () => {
    const prepared = preparedState();
    const reconciling = foulIntentQueueReducer(prepared, { type: "ACCEPTED_PENDING_RECONCILIATION" });

    expect(reconciling.lifecycle).toBe("RECONCILING");
    expect(reconciling.activeIntent?.localIntentId).toBe("local-1");
    expect(foulIntentQueueReducer(reconciling, { type: "START_NEXT" })).toBe(reconciling);

    const reconciled = foulIntentQueueReducer(reconciling, { type: "RECONCILED_ACCEPTED" });
    expect(reconciled.activeIntent).toBeNull();
    expect(reconciled.queuedIntents[0]?.localIntentId).toBe("local-2");
  });

  it.each(["SYNC_REQUIRED", "REJECTED"] as const)("never retries or drains after %s", (reason) => {
    const prepared = preparedState();
    const paused = foulIntentQueueReducer(prepared, { type: "PAUSE", reason, detail: `${reason} review required.` });

    expect(paused.activeIntent).toBe(prepared.activeIntent);
    expect(paused.activeEnvelope).toBe(prepared.activeEnvelope);
    expect(foulIntentQueueReducer(paused, { type: "RETRY_AMBIGUOUS" })).toBe(paused);
    expect(foulIntentQueueReducer(paused, { type: "START_NEXT" })).toBe(paused);
  });

  it("allows ambiguous retry only with the exact retained first-attempt envelope", () => {
    const prepared = preparedState();
    const envelope = prepared.activeEnvelope;
    const paused = foulIntentQueueReducer(prepared, {
      type: "PAUSE",
      reason: "NETWORK_AMBIGUOUS",
      detail: "Delivery outcome is unknown."
    });
    const retry = foulIntentQueueReducer(paused, { type: "RETRY_AMBIGUOUS" });

    expect(retry.activeEnvelope).toBe(envelope);
    expect(retry.lifecycle).toBe("READY_TO_DISPATCH");
    expect(retry.pauseReason).toBeNull();
    expect(retry.queuedIntents).toEqual(prepared.queuedIntents);
  });

  it("pauses reconnect without replay and blocks correction in every unresolved state", () => {
    let queued = foulIntentQueueReducer(initialFoulIntentQueueState, { type: "ENQUEUE", intent: intent("1") });
    const revalidating = foulIntentQueueReducer(queued, { type: "START_NEXT" });
    const ready = prepareFoulIntentDispatch(revalidating, authoritative(), "2026-07-19T03:00:00.000Z");
    const reconnectPaused = foulIntentQueueReducer(ready, {
      type: "PAUSE",
      reason: "RECONNECT_REQUIRED",
      detail: "Connection changed; review is required."
    });

    for (const unresolved of [queued, revalidating, ready, reconnectPaused]) {
      expect(blocksFoulCorrectionNavigation(unresolved)).toBe(true);
    }
    expect(foulIntentQueueReducer(reconnectPaused, { type: "START_NEXT" })).toBe(reconnectPaused);
    expect(blocksFoulCorrectionNavigation(initialFoulIntentQueueState)).toBe(false);
  });

  it("discards the failed active deterministically and resumes only waiting intents after explicit review", () => {
    const prepared = preparedState();
    const paused = foulIntentQueueReducer(prepared, { type: "PAUSE", reason: "REJECTED", detail: "Rejected." });
    const waitingReview = foulIntentQueueReducer(paused, { type: "DISCARD_ACTIVE" });

    expect(waitingReview.activeIntent).toBeNull();
    expect(waitingReview.activeEnvelope).toBeNull();
    expect(waitingReview.pauseReason).toBe("WAITING_REVIEW");
    expect(waitingReview.queuedIntents.map((item) => item.localIntentId)).toEqual(["local-2"]);
    expect(foulIntentQueueReducer(waitingReview, { type: "START_NEXT" })).toBe(waitingReview);

    const resumed = foulIntentQueueReducer(waitingReview, { type: "RESUME_WAITING" });
    const next = foulIntentQueueReducer(resumed, { type: "START_NEXT" });
    expect(next.activeIntent?.localIntentId).toBe("local-2");
    expect(next.activeEnvelope).toBeNull();

    expect(foulIntentQueueReducer(prepared, { type: "DISCARD_ALL" })).toEqual(initialFoulIntentQueueState);
  });
});
