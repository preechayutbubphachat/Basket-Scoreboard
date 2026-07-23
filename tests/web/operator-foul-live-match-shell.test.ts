import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");
const foulStart = appSource.indexOf("function OperatorFoulPage");
const clockStart = appSource.indexOf("function OperatorClockPage");
const foulSource = appSource.slice(foulStart, clockStart);

describe("OperatorFoulPage LiveMatchShell presentation contract", () => {
  test("adopts the authenticated LiveMatchShell directly with foul presentation state", () => {
    expect(foulStart).toBeGreaterThan(-1);
    expect(clockStart).toBeGreaterThan(foulStart);
    expect(foulSource).toContain("<AuthenticatedDashboardShell");
    expect(foulSource).toContain("<LiveMatchShell");
    expect(foulSource).toContain('currentView: "fouls"');
    expect(foulSource).toContain("buildLiveMatchPresentationContext");
    expect(foulSource).toContain("buildOperatorLiveConnection");
    expect(foulSource).toContain("buildOperatorLiveCommandStatus");
  });

  test("keeps projection, roster, access, recovery, and foul intent ownership in the route", () => {
    expect(foulSource).toContain("api.getMatchProjection(matchId)");
    expect(foulSource).toContain("api.getMatchRosters(matchId");
    expect(foulSource).toContain("api.getEffectiveMatchAccess(matchId");
    expect(foulSource).toContain("usePublicProjectionRealtime(");
    expect(foulSource).toContain("persistFoulQueueSession(");
    expect(foulSource).toContain("foulLifecycleCoordinator");
    expect(foulSource).toContain("api.addPlayerFoul(matchId");
    expect(foulSource).toContain("Foul type: {foulTypeOptions[0]}");
    expect(foulSource).toContain("<dd>PERSONAL</dd>");
    expect(foulSource).toContain("blocksFoulCorrectionNavigation(foulQueue)");
  });

  test("guards dashboard brand navigation with the foul lifecycle coordinator", () => {
    const brandStart = foulSource.indexOf("brand={{");
    const brandEnd = foulSource.indexOf('contentMode="wide"', brandStart);
    const brandSource = foulSource.slice(brandStart, brandEnd);

    expect(brandStart).toBeGreaterThan(-1);
    expect(brandEnd).toBeGreaterThan(brandStart);
    expect(brandSource).toContain('foulLifecycleCoordinator.canNavigate("/")');
    expect(brandSource).toContain('navigate("/")');
    expect(brandSource.indexOf('foulLifecycleCoordinator.canNavigate("/")'))
      .toBeLessThan(brandSource.indexOf('navigate("/")'));
    expect(foulSource).toContain('foulLifecycleCoordinator.canNavigate("/login")');
    expect(foulSource).toContain("navigation={correctionBlocked ? [] : liveMatchNavigation}");
  });
});
