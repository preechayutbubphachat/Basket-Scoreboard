import { readFileSync } from "node:fs";
import { isCurrentAsyncOperation, createInitialRealtimeReadiness, createRealtimeDiagnosticState, isIntentionalRequestTeardown } from "../../apps/web/src/App";
import { describe, expect, test } from "vitest";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");

function routeSource(startName: string, endName: string) {
  return appSource.slice(
    appSource.indexOf(`function ${startName}`),
    appSource.indexOf(`function ${endName}`)
  );
}

describe("RM-03-P4 remaining live route adoption", () => {
  test("rejects a post-command completion from match A after match B owns the UI", () => {
    const stale = { matchId: "match-a", generation: 1, lifetime: 1 };
    const current = { matchId: "match-b", generation: 2, lifetime: 2 };

    expect(isCurrentAsyncOperation(stale, current)).toBe(false);
    expect(isCurrentAsyncOperation(current, current)).toBe(true);
  });

  test("resets realtime readiness and diagnostic identity for a new match", () => {
    const readiness = createInitialRealtimeReadiness();
    expect(readiness).toEqual({
      transport_connected: false,
      match_join_status: "NOT_REQUESTED",
      authoritative_sync_status: "UNKNOWN"
    });
    expect(createRealtimeDiagnosticState("match-b", readiness)).toMatchObject({
      matchId: "match-b",
      realtime_state: "POLLING_FALLBACK"
    });
    expect(createRealtimeDiagnosticState("match-b", readiness)).not.toMatchObject({ matchId: "match-a" });
  });

  test("distinguishes intentional abort teardown from an operational failure", () => {
    const controller = new AbortController();
    expect(isIntentionalRequestTeardown(new Error("network down"), controller.signal)).toBe(false);
    expect(isIntentionalRequestTeardown(new DOMException("aborted", "AbortError"), controller.signal)).toBe(true);
  });

  test.each([
    ["OperatorFoulPage", "OperatorClockPage", "fouls"],
    ["OperatorClockPage", "OperatorTimeoutPage", "clock"],
    ["OperatorTimeoutPage", "OperatorLifecyclePage", "timeouts"]
  ])("adopts %s without moving route ownership", (startName, endName, currentView) => {
    const source = routeSource(startName, endName);

    expect(source).toContain(currentView === "fouls" ? "<LiveMatchShell" : "<OperatorLiveMatchFrame");
    expect(source).toContain(currentView === "fouls" ? 'currentView: "fouls"' : `currentView=\"${currentView}\"`);
    expect(source).toMatch(currentView === "fouls"
      ? /api\.getEffectiveMatchAccess\(matchId,\s*signal\)/
      : /api\.getEffectiveMatchAccess\(matchId,\s*request\.controller\.signal\)/);
    if (currentView === "fouls") {
      expect(source).toContain("isCurrentFoulOwner");
      expect(source).toContain("signal?.aborted");
    } else {
      expect(source).toContain("request.controller.signal");
      expect(source).toContain("isCurrentProjectionRequest(request)");
      expect(source).toContain("isIntentionalRequestTeardown");
    }
    expect(source).toContain("usePublicProjectionRealtime(");
    expect(source).toContain("window.setInterval(");
    expect(source).toContain("const previousSeq = projection.currentSeq");
    expect(source).not.toContain("<dt>Seq</dt>");
    expect(source).not.toContain("<dt>Expected Seq</dt>");
  });

  test("keeps clock interpolation in the Clock route", () => {
    const source = routeSource("OperatorClockPage", "OperatorTimeoutPage");
    expect(source).toContain("useLiveClockNow(");
    expect(source).toContain("buildClockControlState(projection");
  });

  test("does not adopt Lifecycle or later routes", () => {
    const lifecycleAndLater = appSource.slice(appSource.indexOf("function OperatorLifecyclePage"));
    expect(lifecycleAndLater).not.toContain("<OperatorLiveMatchFrame");
  });

  test("excludes exactly the four RM-03 live routes from the legacy shell", () => {
    expect(appSource).toContain('route.name === "operator-score"');
    expect(appSource).toContain('route.name === "operator-fouls"');
    expect(appSource).toContain('route.name === "operator-clock"');
    expect(appSource).toContain('route.name === "operator-timeouts"');
    expect(appSource).not.toContain('route.name === "operator-lifecycle" || route.name === "public-scoreboard-display"');
  });
});
