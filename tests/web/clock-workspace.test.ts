import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ClockWorkspace } from "../../apps/web/src/components/ClockWorkspace";

const workspaceSource = readFileSync("apps/web/src/components/ClockWorkspace.tsx", "utf8");
const workspaceStyles = readFileSync("apps/web/src/styles/clock-workspace.css", "utf8");
const appSource = readFileSync("apps/web/src/App.tsx", "utf8");

function renderWorkspace() {
  return renderToStaticMarkup(createElement(ClockWorkspace, {
    controls: {
      gameEnabled: true,
      onGameMinutesChange: () => {}, onGameSecondsChange: () => {}, onGameSet: () => {}, onGameStart: () => {}, onGameStop: () => {}, onReasonChange: () => {}, onShotReset14: () => {}, onShotReset24: () => {}, onShotSecondsChange: () => {}, onShotSet: () => {},
      pending: false, shotEnabled: true
    },
    gameClock: { label: "02:41", running: true },
    shotClock: { label: "14", running: false },
    status: { connection: "Connected", match: "Live", period: 4 },
    values: { gameMinutes: 2, gameSeconds: 41, reason: "", shotSeconds: 14 }
  }));
}

describe("RM-04 P1 ClockWorkspace", () => {
  test("renders exactly the D1-authorized command surface", () => {
    const html = renderWorkspace();
    for (const command of ["Start Game Clock", "Stop Game Clock", "Set Game Clock", "Reset Shot 14", "Reset Shot 24", "Set Shot Clock"]) {
      expect(html).toContain(command);
    }
    expect(html).not.toMatch(/Start Shot Clock|Stop Shot Clock|Start Period|End Period|Overtime/i);
    expect(html).toContain("Select 14 or 24 explicitly");
  });

  test("makes game time dominant while retaining a distinct shot-clock domain", () => {
    const html = renderWorkspace();
    expect(html).toContain("clock-workspace__timer--game");
    expect(html).toContain("clock-workspace__timer--shot");
    expect(html).toContain("Running");
    expect(html).toContain("Stopped");
    expect(workspaceStyles).toMatch(/grid-template-columns:\s*minmax\(0, 1\.55fr\) minmax\(280px, 0\.9fr\)/);
    expect(workspaceStyles).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(workspaceStyles).toMatch(/@media \(forced-colors:\s*active\)/);
    expect(workspaceStyles).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
  });

  test("remains presentation-only and does not change the P1 manual-set contract", () => {
    expect(workspaceSource).not.toMatch(/fetch\(|api\.|setInterval|setTimeout|socket|expectedSeq|useLiveClockNow/);
    expect(workspaceSource).toContain("Manual set behavior remains unchanged in this slice.");
    expect(workspaceSource).not.toMatch(/\brequired\s*(?:=|\})|onConfirm|ConfirmationDialog/);
  });

  test("keeps one route owner for hydration, realtime, polling, interpolation and commands", () => {
    const clockStart = appSource.indexOf("function OperatorClockPage");
    const nextRoute = appSource.indexOf("function OperatorTimeoutPage", clockStart);
    const route = appSource.slice(clockStart, nextRoute);
    for (const ownerSignal of ["getMatchProjection", "getEffectiveMatchAccess", "usePublicProjectionRealtime", "window.setInterval", "useLiveClockNow", "runClockCommand", "projection.currentSeq", "<ClockWorkspace"]) {
      expect(route).toContain(ownerSignal);
    }
  });
});
