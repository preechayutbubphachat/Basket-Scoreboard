import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ClockWorkspace } from "../../apps/web/src/components/ClockWorkspace";
import { buildGameClockSetPayload, buildShotClockSetPayload, validateGameClockSetInput, validateShotClockSetInput } from "../../apps/web/src/lib/clockControl";

const workspaceSource = readFileSync("apps/web/src/components/ClockWorkspace.tsx", "utf8");
const workspaceStyles = readFileSync("apps/web/src/styles/clock-workspace.css", "utf8");
const appSource = readFileSync("apps/web/src/App.tsx", "utf8");

function renderWorkspace(stage: "closed" | "edit" | "confirm" = "closed", shotStage: "closed" | "edit" | "confirm" = "closed") {
  return renderToStaticMarkup(createElement(ClockWorkspace, {
    controls: {
      gameEnabled: true,
      onGameMinutesChange: () => {}, onGameSecondsChange: () => {}, onGameSet: () => {}, onGameStart: () => {}, onGameStop: () => {}, onReasonChange: () => {}, onShotReset14: () => {}, onShotReset24: () => {}, onShotSecondsChange: () => {}, onShotSet: () => {},
      pending: false, shotEnabled: true
    },
    gameClock: { label: "02:41", running: true },
    gameSetFlow: { error: null, onCancel: () => {}, onOpen: () => {}, onRequestConfirmation: () => {}, stage },
    shotClock: { label: "14", running: false },
    shotSetFlow: { error: null, onCancel: () => {}, onOpen: () => {}, onRequestConfirmation: () => {}, stage: shotStage },
    status: { connection: "Connected", match: "Live", period: 4 },
    values: { gameMinutes: 2, gameSeconds: 41, reason: "", shotSeconds: 14 }
  }));
}

describe("RM-04 P2 ClockWorkspace", () => {
  test("renders exactly the D1-authorized command surface", () => {
    const html = renderWorkspace();
    for (const command of ["Start Game Clock", "Stop Game Clock", "Set / Adjust Game Clock", "Reset Shot 14", "Reset Shot 24", "Set / Adjust Shot Clock"]) {
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

  test("keeps the guarded correction dialog presentation-only", () => {
    expect(workspaceSource).not.toMatch(/fetch\(|api\.|setInterval|setTimeout|socket|expectedSeq|useLiveClockNow/);
    expect(renderWorkspace("edit")).toContain("Review correction");
    expect(renderWorkspace("confirm")).toContain("Confirm clock correction");
    expect(renderWorkspace("confirm")).toContain("Match context");
    expect(workspaceSource).toContain("showModal");
    expect(workspaceSource).toContain("gameSetTriggerRef.current?.focus()");
  });

  test("requires and canonicalizes the game-clock correction reason only", () => {
    expect(validateGameClockSetInput({ minutes: 2, seconds: 30, reason: "   " }).valid).toBe(false);
    expect(validateGameClockSetInput({ minutes: 2, seconds: 30, reason: "x".repeat(501) }).valid).toBe(false);
    expect(validateGameClockSetInput({ minutes: 10, seconds: 1, reason: "valid" }).valid).toBe(false);
    expect(validateGameClockSetInput({ minutes: 10, seconds: 0, reason: "x".repeat(500) })).toMatchObject({ valid: true, remainingMs: 600000 });

    const projection = { currentSeq: 7 } as Parameters<typeof buildGameClockSetPayload>[0];
    expect(buildGameClockSetPayload(projection, { minutes: 2, seconds: 30, reason: "  table correction  " })).toEqual({
      expectedSeq: 7,
      payload: { remainingMs: 150000, reason: "table correction" }
    });
    expect(() => buildShotClockSetPayload(projection, { seconds: 14, reason: "   " })).toThrow();
  });

  test("guards shot-set correction while keeping explicit resets separate", () => {
    expect(renderWorkspace("closed", "edit")).toContain("Set / Adjust Shot Clock");
    expect(renderWorkspace("closed", "edit")).toContain("Correction reason");
    expect(renderWorkspace("closed", "confirm")).toContain("Confirm Shot Clock Correction");
    expect(renderWorkspace("closed", "confirm")).toContain("14 seconds");
    expect(validateShotClockSetInput({ seconds: 14, reason: "   " }).valid).toBe(false);
    expect(validateShotClockSetInput({ seconds: 25, reason: "valid" }).valid).toBe(false);
    expect(validateShotClockSetInput({ seconds: 14, reason: "x".repeat(501) }).valid).toBe(false);
    expect(validateShotClockSetInput({ seconds: 24, reason: "  operator correction  " })).toEqual({ valid: true, remainingMs: 24000, reason: "operator correction" });
    expect(workspaceSource).toContain("Reset Shot 14");
    expect(workspaceSource).toContain("Reset Shot 24");
    expect(workspaceSource).not.toMatch(/Start Shot Clock|Stop Shot Clock/);
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
