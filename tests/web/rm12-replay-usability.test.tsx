import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { ReplayItem } from "../../packages/api-contracts/src";
import {
  createReplayCursorState,
  getReplayStateAtCursor,
  hasReplayMutationControls,
  jumpReplayCursor,
  stepReplayCursor
} from "../../apps/web/src/lib/replayControl";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");

function item(seq: number, scoreAfter: ReplayItem["scoreAfter"] = null): ReplayItem {
  return {
    matchId: "match-1", seq, eventType: "SCORE_APPLIED", eventGroup: "SCORE",
    periodNumber: 1, periodType: "REGULATION", teamSide: "HOME", title: `Event ${seq}`,
    description: `Description ${seq}`, scoreAfter, player: null, actor: null,
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

const items = [item(10, { home: 2, away: 0 }), item(11), item(12, { home: 3, away: 1 })];

describe("RM12 read-only replay usability", () => {
  test("derives selected event and latest score only through the local cursor", () => {
    expect(createReplayCursorState(items)).toEqual({ cursor: 2, playing: false });
    expect(getReplayStateAtCursor(items, 1)).toMatchObject({ selected: items[1], scoreAfter: { home: 2, away: 0 } });
    expect(getReplayStateAtCursor(items, null)).toEqual({ selected: null, scoreAfter: null });
  });

  test("bounds deterministic step and auto-pauses at the final item", () => {
    const initial = { cursor: 0, playing: true } as const;
    expect(stepReplayCursor(initial, -1, items.length)).toEqual({ cursor: 0, playing: true });
    expect(stepReplayCursor(initial, 1, items.length)).toEqual({ cursor: 1, playing: true });
    expect(stepReplayCursor({ cursor: 1, playing: true }, 1, items.length)).toEqual({ cursor: 2, playing: false });
    expect(stepReplayCursor({ cursor: 2, playing: true }, 1, items.length)).toEqual({ cursor: 2, playing: false });
  });

  test("accepts exact current jumps and preserves cursor for invalid targets", () => {
    const state = { cursor: 1, playing: true };
    expect(jumpReplayCursor(items, state, 10)).toEqual({ state: { cursor: 0, playing: false }, error: null });
    expect(jumpReplayCursor(items, state, 99)).toEqual({ state, error: "Sequence 99 is not in the current replay." });
    expect(jumpReplayCursor(items, state, 10.5).state).toBe(state);
    expect(jumpReplayCursor([], state, 10).state).toBe(state);
  });

  test("keeps the UI read-only, safe for empty/loading/error/filter/refresh paths, and preserves RM08 markers", () => {
    expect(hasReplayMutationControls()).toBe(false);
    expect(appSource).toContain("Read-only replay. Controls change only this browser view.");
    expect(appSource).toContain("clearInterval(timer)");
    expect(appSource).toContain("Open Audit Log");
    expect(appSource).toContain("SOURCE_BINDING_UNAVAILABLE");
    expect(appSource).toContain("FIRST COMPETITION DATE UNRESOLVED");
    expect(appSource).toContain("PUBLIC ALLOWLIST ONLY");
    expect(appSource).toContain("Tournament roster");
    const replayBlock = appSource.slice(appSource.indexOf("function MatchReplayPage"), appSource.indexOf("function MatchAuditLogPage"));
    expect(replayBlock).not.toMatch(/api\.(post|put|patch|delete|create|update|save|send|dispatch)/i);
    expect(replayBlock).toContain("No replay events found for this filter.");
    expect(replayBlock).toContain("Loading replay timeline...");
  });
});
