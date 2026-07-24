import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  foulTypeOptions,
  resolveFoulEffectiveAccess
} from "../../apps/web/src/lib/foulControl";
import {
  blocksFoulCorrectionNavigation,
  createFoulIntent,
  foulIntentQueueReducer,
  initialFoulIntentQueueState,
  prepareFoulIntentDispatch
} from "../../apps/web/src/lib/foulIntentQueue";

const fixtureSource = readFileSync("tests/browser/foul-control-fixture.tsx", "utf8");
const browserSource = readFileSync("tests/browser/foul-control-browser.cjs", "utf8");

function activeIntent(localIntentId = "local-1") {
  return createFoulIntent({
    commandId: `command-${localIntentId}`,
    correlationId: `correlation-${localIntentId}`,
    gameClockRemainingMs: 123_000,
    localIntentId,
    periodNumber: 4,
    player: {
      jerseyNumber: "12",
      playerId: "home-player-1",
      playerName: "กิตติพงศ์ Example",
      status: "ACTIVE",
      teamSide: "HOME"
    },
    reason: "  operator review  ",
    teamLabel: "HOME — Bangkok Metropolitan Academy"
  });
}

describe("RM-06 foul browser regression closure", () => {
  it("mounts the authoritative routed App and mocks only its existing HTTP boundary", () => {
    expect(fixtureSource).toContain('import App from "../../apps/web/src/App"');
    expect(fixtureSource).toContain("createRoot(root).render");
    expect(fixtureSource).toContain("<App />");
    expect(fixtureSource).toContain("/api/v1/auth/me");
    expect(fixtureSource).toContain("/effective-access");
    expect(fixtureSource).toContain("/projection");
    expect(fixtureSource).toContain("/rosters");
    expect(fixtureSource).toContain("/commands/foul/player/add");
    expect(fixtureSource).not.toContain("function OperatorFoulPage");
    expect(fixtureSource).not.toContain("TEAM_FOUL_ADDED");
    expect(fixtureSource).not.toContain("PLAYER_FOULED_OUT");
  });

  it("declares the exact responsive, zoom, accessibility, fail-closed, and runtime evidence matrix", () => {
    for (const dimensions of [
      "{ width: 1920, height: 1080 }",
      "{ width: 1600, height: 900 }",
      "{ width: 1536, height: 1024 }",
      "{ width: 1366, height: 768 }",
      "{ width: 1280, height: 720 }",
      "{ width: 1024, height: 576 }"
    ]) {
      expect(browserSource).toContain(dimensions);
    }
    expect(browserSource).toContain("const zoomPercents = [125, 150, 200]");
    for (const state of [
      "loading", "error", "denied", "malformed", "mismatch", "finished", "final",
      "home-empty", "away-empty", "both-empty", "large-roster", "long-names"
    ]) {
      expect(browserSource).toContain(`"${state}"`);
    }
    expect(browserSource).toContain('page.on("console"');
    expect(browserSource).toContain('page.on("pageerror"');
    expect(browserSource).toContain('page.on("requestfailed"');
    expect(browserSource).toContain('page.on("response"');
    expect(browserSource).toContain('forcedColors: "active"');
    expect(browserSource).toContain('reducedMotion: "reduce"');
  });

  it("keeps EffectiveMatchAccess fail closed and exposes only fixed PERSONAL operation", () => {
    expect(foulTypeOptions).toEqual(["PERSONAL"]);
    for (const [phase, value, lifecycle] of [
      ["loading", null, "ACCESS_LOADING"],
      ["error", null, "ACCESS_ERROR"],
      ["ready", { malformed: true }, "ACCESS_ERROR"],
      ["ready", {
        matchId: "other-match",
        capabilities: { matchRead: true, foulOperate: true, correctionRequest: true }
      }, "ACCESS_MATCH_MISMATCH"],
      ["ready", {
        matchId: "fixture-match",
        capabilities: { matchRead: false, foulOperate: true, correctionRequest: true }
      }, "ACCESS_DENIED"]
    ] as const) {
      expect(resolveFoulEffectiveAccess("fixture-match", phase, value)).toMatchObject({
        lifecycle,
        canRead: false,
        canOperateFoul: false
      });
    }
  });

  it("preserves FIFO, one active intent, correction lock, and explicit recovery", () => {
    const first = activeIntent("first");
    const second = activeIntent("second");
    let state = foulIntentQueueReducer(initialFoulIntentQueueState, { type: "ENQUEUE", intent: first });
    state = foulIntentQueueReducer(state, { type: "ENQUEUE", intent: second });
    state = foulIntentQueueReducer(state, { type: "START_NEXT" });

    expect(state.activeIntent?.localIntentId).toBe("first");
    expect(state.queuedIntents.map((intent) => intent.localIntentId)).toEqual(["second"]);
    expect(blocksFoulCorrectionNavigation(state)).toBe(true);

    state = prepareFoulIntentDispatch(state, {
      access: { lifecycle: "ACCESS_READY", canRead: true, canOperateFoul: true },
      currentSeq: 41,
      players: [{
        jerseyNumber: "12",
        playerId: "home-player-1",
        playerName: "กิตติพงศ์ Example",
        status: "ACTIVE",
        teamSide: "HOME"
      }],
      status: "LIVE"
    }, "2026-07-24T00:00:00.000Z");
    const retainedEnvelope = state.activeEnvelope;
    state = foulIntentQueueReducer(state, {
      type: "PAUSE",
      reason: "NETWORK_AMBIGUOUS",
      detail: "Explicit exact-envelope retry or discard is required."
    });

    expect(foulIntentQueueReducer(state, { type: "ENQUEUE", intent: activeIntent("third") })).toBe(state);
    const retrying = foulIntentQueueReducer(state, { type: "RETRY_AMBIGUOUS" });
    expect(retrying.activeEnvelope).toEqual(retainedEnvelope);
    expect(retrying.lifecycle).toBe("REVALIDATING_RETRY");

    const discarded = foulIntentQueueReducer(state, { type: "DISCARD_ACTIVE" });
    expect(discarded.pauseReason).toBe("WAITING_REVIEW");
    expect(foulIntentQueueReducer(discarded, { type: "RESUME_WAITING" })).toMatchObject({
      lifecycle: "QUEUED",
      pauseReason: null
    });
  });

  it("requires mounted evidence for queue/recovery, reconnect, projection authority, and correction safety", () => {
    for (const verifier of [
      "verifyMountedFailClosedStates",
      "verifyMountedRosterVariants",
      "verifyMountedQueueLifecycle",
      "verifyMountedAmbiguousRetry",
      "verifyMountedReconnectSafety",
      "verifyMountedCorrectionNavigation",
      "verifyMountedProjectionAuthority",
      "verifyKeyboardAndMedia"
    ]) {
      expect(browserSource).toContain(`async function ${verifier}`);
      expect(browserSource).toContain(`await ${verifier}(`);
    }
    expect(browserSource).toContain("unexpectedConsoleMessages");
    expect(browserSource).toContain("unexpectedFailedRequests");
    expect(browserSource).toContain("unexpectedHttpFailures");
  });
});
