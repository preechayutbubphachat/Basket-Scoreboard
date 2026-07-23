import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  foulTypeOptions,
  resolveFoulEffectiveAccess
} from "../../apps/web/src/lib/foulControl";

function access(matchId: string, matchRead: boolean, foulOperate: boolean, correctionRequest: boolean) {
  return {
    matchId,
    capabilities: { matchRead, foulOperate, correctionRequest }
  };
}

describe("RM-06-P1 foul effective access", () => {
  it("exposes only the supported player PERSONAL action", () => {
    expect(foulTypeOptions).toEqual(["PERSONAL"]);
  });

  it("fails closed for loading, error, malformed, denied, and match mismatch", () => {
    expect(resolveFoulEffectiveAccess("match-1", "loading", null)).toMatchObject({ lifecycle: "ACCESS_LOADING", canRead: false, canOperateFoul: false });
    expect(resolveFoulEffectiveAccess("match-1", "error", null)).toMatchObject({ lifecycle: "ACCESS_ERROR", canOperateFoul: false });
    expect(resolveFoulEffectiveAccess("match-1", "ready", { malformed: true })).toMatchObject({ lifecycle: "ACCESS_ERROR", canOperateFoul: false });
    expect(resolveFoulEffectiveAccess("match-1", "ready", access("match-2", true, true, true))).toMatchObject({ lifecycle: "ACCESS_MATCH_MISMATCH", canOperateFoul: false });
    expect(resolveFoulEffectiveAccess("match-1", "ready", access("match-1", false, true, true))).toMatchObject({ lifecycle: "ACCESS_DENIED", canRead: false, canOperateFoul: false });
  });

  it("requires matchRead and foulOperate while keeping correction independent", () => {
    expect(resolveFoulEffectiveAccess("match-1", "ready", access("match-1", true, true, false))).toMatchObject({ canRead: true, canOperateFoul: true, canRequestCorrection: false });
    expect(resolveFoulEffectiveAccess("match-1", "ready", access("match-1", true, false, true))).toMatchObject({ canRead: true, canOperateFoul: false, canRequestCorrection: true });
  });

  it("keeps the route fail closed and refreshes projection, roster, and access together", () => {
    const app = readFileSync("apps/web/src/App.tsx", "utf8");
    const route = app.slice(app.indexOf("function OperatorFoulPage"), app.indexOf("function OperatorClockPage"));

    expect(route).toContain('useState<"loading" | "ready" | "error">("loading")');
    expect(route).toContain("resolveFoulEffectiveAccess(matchId, accessPhase, effectiveAccess)");
    expect(route).toMatch(/Promise\.all\(\[\s*api\.getMatchProjection\(matchId\),\s*api\.getMatchRosters\(matchId\),\s*api\.getEffectiveMatchAccess\(matchId\)/);
    expect(route).not.toContain("canOperateFoul(currentUser, matchId)");
    expect(route).not.toContain("addTeamFoul");
    expect(route).not.toContain("Add Team Foul");
  });
});
