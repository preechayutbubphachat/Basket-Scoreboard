import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");

describe("RM-08 P1A import-only roster UI", () => {
  it("mounts the bounded readiness page on both legacy setup routes", () => {
    const routeArea = appSource.slice(appSource.indexOf('case "admin-rosters"'), appSource.indexOf('case "admin-summary"'));
    expect(routeArea).toContain("RosterBaselineReadinessPage");
    expect(routeArea).not.toContain("AdminRostersPage");
    expect(routeArea).not.toContain("AdminLineupPage");
  });

  it("contains import-only controls and no member/starter/captain/lock/correction mutation action", () => {
    const page = appSource.slice(appSource.indexOf("function RosterBaselineReadinessPage"), appSource.indexOf("function AdminRostersPage"));
    expect(page).toContain("api.importRosterBaseline");
    expect(page).toContain("Import ${teamSide} baseline");
    expect(page).not.toContain("Select starter");
    expect(page).not.toContain("Set captain");
    expect(page).not.toContain("Confirm");
    expect(page).not.toContain("members.map");
  });
});
