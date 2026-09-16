import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");

describe("RM-08 source-backed roster/lineup UI", () => {
  it("mounts the existing roster and lineup dashboards on the setup routes", () => {
    const routeArea = appSource.slice(appSource.indexOf('case "admin-rosters"'), appSource.indexOf('case "admin-summary"'));
    expect(routeArea).toContain("AdminRostersPage");
    expect(routeArea).toContain("AdminLineupPage");
    expect(routeArea).not.toContain("<RosterBaselineReadinessPage matchId={route.matchId} />");
  });

  it("shows source binding, bounded policy values and privacy state", () => {
    const page = appSource.slice(appSource.indexOf("function AdminRostersPage"), appSource.indexOf("function AdminLineupPage"));
    expect(page).toContain("RM-08 Policy");
    expect(page).toContain("SOURCE_BINDING_UNAVAILABLE");
    expect(page).toContain("FIRST COMPETITION DATE UNRESOLVED");
    expect(page).toContain("PUBLIC ALLOWLIST ONLY");
    expect(page).toContain("Tournament roster");
  });
});
