import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");
const liveMatchShellSource = readFileSync("apps/web/src/components/LiveMatchShell.tsx", "utf8");
const adapterSource = readFileSync("apps/web/src/lib/liveMatchPresentation.ts", "utf8");

function routeSource(startName: string, endName: string) {
  return appSource.slice(
    appSource.indexOf(`function ${startName}`),
    appSource.indexOf(`function ${endName}`)
  );
}

function count(source: string, pattern: RegExp) {
  return source.match(pattern)?.length ?? 0;
}

describe("RM-03-P5 ownership regression closure", () => {
  test.each([
    ["OperatorScorePage", "OperatorFoulPage"],
    ["OperatorFoulPage", "OperatorClockPage"],
    ["OperatorClockPage", "OperatorTimeoutPage"],
    ["OperatorTimeoutPage", "OperatorLifecyclePage"]
  ])("keeps one realtime and polling owner in %s", (startName, endName) => {
    const source = routeSource(startName, endName);

    expect(count(source, /usePublicProjectionRealtime\(/g)).toBe(1);
    expect(count(source, /window\.setInterval\(/g)).toBe(1);
    expect(source).toContain("const previousSeq = projection.currentSeq");
    expect(source).not.toContain("<dt>Seq</dt>");
    expect(source).not.toContain("<dt>Expected Seq</dt>");
  });

  test("keeps clock interpolation exclusively in the Clock route", () => {
    const clock = routeSource("OperatorClockPage", "OperatorTimeoutPage");
    const otherLiveRoutes = [
      routeSource("OperatorScorePage", "OperatorFoulPage"),
      routeSource("OperatorFoulPage", "OperatorClockPage"),
      routeSource("OperatorTimeoutPage", "OperatorLifecyclePage")
    ].join("\n");

    expect(clock).toContain("useLiveClockNow(");
    expect(clock).toContain("buildClockControlState(projection");
    expect(otherLiveRoutes).not.toContain("useLiveClockNow(");
    expect(liveMatchShellSource).not.toMatch(/useLiveClockNow|buildClockControlState|setInterval|setTimeout/);
    expect(adapterSource).not.toMatch(/useLiveClockNow|buildClockControlState|setInterval|setTimeout/);
  });

  test("keeps shell and adapters free of data, realtime, and command ownership", () => {
    for (const source of [liveMatchShellSource, adapterSource]) {
      expect(source).not.toMatch(/fetch\(|apiClient|createPublicProjectionSocket|socket\.on|match:join/);
      expect(source).not.toMatch(/addScore|addTeamFoul|addPlayerFoul|startGameClock|grantTimeout/);
      expect(source).not.toMatch(/expectedSeq|currentSeq|commandId|correlationId/);
    }
  });

  test("keeps public composition isolated from authenticated live-match presentation", () => {
    const publicStart = appSource.indexOf("function PublicScoreboardPage");
    const publicSource = appSource.slice(publicStart);

    expect(publicSource).not.toMatch(/LiveMatchShell|OperatorLiveMatchFrame|EffectiveMatchAccess/);
  });
});
