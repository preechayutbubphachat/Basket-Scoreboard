import { existsSync, readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { AuthenticatedDashboardShell } from "../../apps/web/src/components/AuthenticatedDashboardShell";
import { LiveMatchShell, type LiveMatchShellProps } from "../../apps/web/src/components/LiveMatchShell";

const shellSource = readFileSync("apps/web/src/components/LiveMatchShell.tsx", "utf8");
const styles = readFileSync("apps/web/src/styles/live-match-shell.css", "utf8");
const styleEntry = readFileSync("apps/web/src/main.tsx", "utf8");
const appSource = readFileSync("apps/web/src/App.tsx", "utf8");
const publicShellSource = readFileSync("apps/web/src/components/PublicDisplayShell.tsx", "utf8");

const longEnglishHome = "Bangkok Metropolitan Youth Basketball Academy Championship Selection";
const longThaiAway = "สโมสรบาสเกตบอลเยาวชนเชียงใหม่ฟอลคอนส์นานาชาติชิงแชมป์ประเทศไทย";
const mixedTournament = "การแข่งขัน National Arena Invitational กรุงเทพมหานคร 2026";

function renderFixture(options: {
  commandStatus?: LiveMatchShellProps["commandStatus"];
  connection?: LiveMatchShellProps["connection"];
  match?: Partial<LiveMatchShellProps["match"]>;
  safetyGuidance?: ReactNode;
  secondaryRail?: ReactNode;
} = {}) {
  return renderToStaticMarkup(createElement(AuthenticatedDashboardShell, {
    brand: { href: "/", label: "Basketball Scoreboard" },
    contentMode: "wide",
    navigationItems: [{ current: true, href: "/operator/matches", label: "Matches" }],
    title: "Live match operations"
  }, createElement(LiveMatchShell, {
    actions: createElement("button", { type: "button" }, "Open match details"),
    commandStatus: options.commandStatus,
    connection: options.connection ?? { state: "connected" },
    match: {
      awayTeamName: "Chiang Mai Falcons",
      courtLabel: "Court 1",
      homeTeamName: "Bangkok Thunder",
      matchId: "match-1",
      periodLabel: "Q4",
      status: "LIVE",
      tournamentLabel: "National Invitational",
      ...options.match
    },
    navigation: [
      { current: true, href: "/operator/matches/match-1/score", id: "score", label: "Score" },
      { href: "/operator/matches/match-1/fouls", id: "fouls", label: "Fouls" },
      { href: "/operator/matches/match-1/clock", id: "clock", label: "Clock" }
    ],
    safetyGuidance: options.safetyGuidance,
    secondaryRail: options.secondaryRail
  }, createElement("section", { "aria-label": "Feature workspace" }, "Feature-owned controls"))));
}

describe("LiveMatchShell presentation foundation", () => {
  test("provides the approved authenticated live-match component", () => {
    expect(existsSync("apps/web/src/components/LiveMatchShell.tsx")).toBe(true);
  });

  test("provides scoped live-match shell styles", () => {
    expect(existsSync("apps/web/src/styles/live-match-shell.css")).toBe(true);
  });

  test("renders match context and optional metadata without deriving domain state", () => {
    const html = renderFixture({
      match: {
        awayTeamName: longThaiAway,
        homeTeamName: longEnglishHome,
        tournamentLabel: mixedTournament
      }
    });

    expect(html).toContain(longEnglishHome);
    expect(html).toContain(longThaiAway);
    expect(html).toContain(mixedTournament);
    expect(html).toContain("LIVE");
    expect(html).toContain("Court 1");
    expect(html).toContain("Q4");
    expect(html).not.toMatch(/possession|bonus|standings|tiebreak/i);
  });

  test("omits absent optional match metadata cleanly", () => {
    const html = renderFixture({ match: { courtLabel: null, periodLabel: null, tournamentLabel: null } });

    expect(html).not.toContain("live-match-shell__metadata-item--tournament");
    expect(html).not.toContain("live-match-shell__metadata-item--court");
    expect(html).not.toContain("live-match-shell__metadata-item--period");
  });

  test("renders native named live navigation with accessible current semantics", () => {
    const html = renderFixture();

    expect(html).toContain('<nav class="live-match-shell__navigation" aria-label="Live match controls">');
    expect(html).toContain('<a aria-current="page" href="/operator/matches/match-1/score">Score</a>');
    expect(html).toContain('<a href="/operator/matches/match-1/fouls">Fouls</a>');
    expect(html.indexOf(">Score</a>")).toBeLessThan(html.indexOf(">Fouls</a>"));
    expect(html).not.toMatch(/role="button"|tabindex="[1-9]/i);
  });

  test("reuses canonical connection and command-status presentation", () => {
    const html = renderFixture({
      commandStatus: { detail: "Waiting for server validation", label: "Submitting", state: "pending" },
      connection: { label: "Arena link degraded", lastSyncedAt: "2026-07-17T06:00:00.000Z", state: "reconnecting" }
    });

    expect(html).toContain("ui-connection-status--reconnecting");
    expect(html).toContain("Arena link degraded");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('dateTime="2026-07-17T06:00:00.000Z"');
    expect(html).toContain("ui-command-status--pending");
    expect(html).toContain("Waiting for server validation");
    expect(html).toContain('aria-busy="true"');
  });

  test("supports safety guidance and an optional secondary rail", () => {
    const withRail = renderFixture({
      safetyGuidance: "Refresh authoritative state before continuing.",
      secondaryRail: createElement("section", null, createElement("h2", null, "Match notes"))
    });
    const withoutRail = renderFixture();

    expect(withRail).toContain("ui-command-safety-panel");
    expect(withRail).toContain("Refresh authoritative state before continuing.");
    expect(withRail).toContain('<aside class="live-match-shell__secondary" aria-label="Live match supporting information">');
    expect(withRail).toContain("live-match-shell__workspace--with-secondary");
    expect(withoutRail).not.toContain("live-match-shell__secondary");
    expect(withoutRail).not.toContain("live-match-shell__workspace--with-secondary");
  });

  test.each([
    ["connected", "ready"],
    ["reconnecting", "degraded"],
    ["sync-required", "degraded"],
    ["offline", "offline"]
  ] as const)("maps canonical %s connection presentation to the %s shell state", (connectionState, shellState) => {
    expect(renderFixture({ connection: { state: connectionState } })).toContain(`live-match-shell--${shellState}`);
  });

  test("renders final/read-only state visibly without relying on color", () => {
    const html = renderFixture({ match: { readOnly: true, status: "FINAL" } });

    expect(html).toContain("live-match-shell--read-only");
    expect(html).toContain("FINAL");
    expect(html).toContain("Read only");
    expect(html).toContain("ui-command-safety-panel");
  });

  test("composes inside AuthenticatedDashboardShell with exactly one main landmark", () => {
    const html = renderFixture({ secondaryRail: createElement("p", null, "Supporting detail") });

    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toMatch(/<section[^>]*class="live-match-shell live-match-shell--ready"/);
    expect(html).not.toMatch(/<main[\s\S]*<main/);
  });

  test("provides focus, touch, forced-colors, reduced-motion, overflow and responsive safeguards", () => {
    expect(styleEntry).toContain('import "./styles/live-match-shell.css";');
    expect(styles).toMatch(/\.live-match-shell__navigation\s*\{[\s\S]*overflow-x:\s*auto/);
    expect(styles).toMatch(/\.live-match-shell__navigation a\s*\{[\s\S]*min-height:\s*(?:44px|var\(--control-height-large\))/);
    expect(styles).toMatch(/\.live-match-shell__navigation a:focus-visible[\s\S]*outline:\s*var\(--focus-outline-width\)/);
    expect(styles).toMatch(/overflow-wrap:\s*anywhere/);
    expect(styles).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(280px,\s*340px\)/);
    expect(styles).toMatch(/@media \(max-width:\s*1100px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(styles).toMatch(/@media \(forced-colors:\s*active\)[\s\S]*outline-color:\s*Highlight/);
    expect(styles).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*transition-duration:\s*1ms/);
  });

  test("owns no fetch, realtime, command, authorization, timer or domain behavior", () => {
    expect(shellSource).not.toMatch(/fetch\(|apiClient|socket\.io|socket\.emit|new WebSocket|\bio\(|match:join|setInterval|setTimeout/);
    expect(shellSource).not.toMatch(/expectedSeq|correlationId|causationId|commandId|lastEventSeq|currentSeq|projectionVersion|sourceEventSeq|initializedAtSeq/);
    expect(shellSource).not.toMatch(/AuthProvider|ProtectedRoute|user\.role|permissions?|assignments?|csrf|token|actor|device|audit|correctionReason/i);
    expect(shellSource).not.toMatch(/score\s*[+\-*/]=|foul\s*[+\-*/]=|timeout\s*[+\-*/]=|interpolat|retry\s*\(/i);
  });

  test("remains isolated from public shells and production routes", () => {
    expect(appSource).not.toMatch(/import\s+\{?\s*LiveMatchShell/);
    expect(publicShellSource).not.toMatch(/LiveMatchShell/);
    expect(shellSource).not.toMatch(/PublicDisplayShell|PublicLiveScoreboard|\/public\//);
  });

  test("keeps its authenticated browser harness test-only", () => {
    expect(existsSync("tests/browser/live-match-shell-fixture.html")).toBe(true);
    expect(existsSync("tests/browser/live-match-shell-fixture.tsx")).toBe(true);
    expect(appSource).not.toMatch(/live-match-shell-fixture|rm03-fixture|fixtureMode/i);
  });
});
