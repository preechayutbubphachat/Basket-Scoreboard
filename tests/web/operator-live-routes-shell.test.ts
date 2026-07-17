import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");

function routeSource(startName: string, endName: string) {
  return appSource.slice(
    appSource.indexOf(`function ${startName}`),
    appSource.indexOf(`function ${endName}`)
  );
}

describe("RM-03-P4 remaining live route adoption", () => {
  test.each([
    ["OperatorFoulPage", "OperatorClockPage", "fouls"],
    ["OperatorClockPage", "OperatorTimeoutPage", "clock"],
    ["OperatorTimeoutPage", "OperatorLifecyclePage", "timeouts"]
  ])("adopts %s without moving route ownership", (startName, endName, currentView) => {
    const source = routeSource(startName, endName);

    expect(source).toContain("<OperatorLiveMatchFrame");
    expect(source).toContain(`currentView=\"${currentView}\"`);
    expect(source).toContain("api.getEffectiveMatchAccess(matchId)");
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
