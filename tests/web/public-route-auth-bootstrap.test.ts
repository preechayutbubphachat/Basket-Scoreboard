import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { shouldBootstrapAuthForPath } from "../../apps/web/src/lib/authRoutePolicy";

describe("public route auth bootstrap isolation", () => {
  test.each([
    "/public/display/court-1-main",
    "/public/display/court-02",
    "/public/display/schedule-test",
    "/public/display/final-summary-fixture",
    "/public/scoreboard/smoke-test-match",
    "/public/scoreboard/smoke-test-match/display",
    "/public/tournaments",
    "/public/tournaments/tournament-1/schedule",
    "/public/tournaments/tournament-1/standings"
  ])("does not bootstrap authentication for %s", (pathname) => {
    expect(shouldBootstrapAuthForPath(pathname)).toBe(false);
  });

  test.each([
    "/",
    "/login",
    "/admin",
    "/admin/display-screens/screen-1/scenes",
    "/operator/matches",
    "/operator/matches/match-1/score",
    "/unauthorized"
  ])("keeps authentication bootstrap enabled for %s", (pathname) => {
    expect(shouldBootstrapAuthForPath(pathname)).toBe(true);
  });

  test("classifies route transitions without treating failed auth as public access", () => {
    expect(shouldBootstrapAuthForPath("/public/display/court-1-main")).toBe(false);
    expect(shouldBootstrapAuthForPath("/admin")).toBe(true);
    expect(shouldBootstrapAuthForPath("/public/display/court-02")).toBe(false);
  });
});

describe("application favicon", () => {
  test("declares a repository-owned SVG favicon that exists", () => {
    const html = readFileSync(resolve("apps/web/index.html"), "utf8");
    const iconHref = html.match(/<link\s+rel="icon"\s+href="([^"]+)"/)?.[1];

    expect(iconHref).toBe("/src/assets/scoreboard-favicon.svg");
    expect(readFileSync(resolve("apps/web/src/assets/scoreboard-favicon.svg"), "utf8")).toContain("<svg");
  });
});
