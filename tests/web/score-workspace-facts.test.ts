import { describe, expect, test } from "vitest";
import type { ScoreboardProjection } from "@basket-scoreboard/api-contracts";
import { buildScoreWorkspaceFacts } from "../../apps/web/src/lib/scoreWorkspaceFacts";

const nowMs = Date.parse("2026-10-22T03:00:10Z");

function projection(): ScoreboardProjection {
  return {
    matchId: "demo-match",
    homeScore: 2,
    awayScore: 0,
    teamFouls: { home: 0, away: 0 },
    playerFouls: [],
    timeouts: {
      home: { used: 2, remaining: 3 },
      away: { used: 0, remaining: 5 }
    },
    periodNumber: 1,
    gameClockRemainingMs: 589_000,
    shotClockRemainingMs: 24_000,
    status: "LIVE",
    currentSeq: 11
  };
}

describe("score control read-only match facts", () => {
  test("uses authoritative stopped clock and remaining timeout quota", () => {
    expect(buildScoreWorkspaceFacts(projection(), nowMs)).toEqual({
      gameClockLabel: "9:49",
      gameClockState: "Stopped",
      shotClockLabel: "24",
      shotClockState: "Stopped",
      homeTimeoutsRemaining: "3",
      awayTimeoutsRemaining: "5"
    });
  });

  test("uses existing clock model to derive running countdowns", () => {
    const item: ScoreboardProjection = {
      ...projection(),
      gameClockRemainingMs: 600_000,
      gameClock: {
        remainingMs: 600_000,
        running: true,
        lastStartedAt: "2026-10-22T03:00:00Z"
      },
      shotClock: {
        remainingMs: 24_000,
        running: true,
        lastStartedAt: "2026-10-22T03:00:00Z"
      }
    };
    const display = buildScoreWorkspaceFacts(item, nowMs);
    expect(display.gameClockLabel).toBe("9:50");
    expect(display.shotClockLabel).toBe("14");
    expect(display.gameClockState).toBe("Running");
    expect(display.shotClockState).toBe("Running");
  });

  test("never fabricates a missing shot clock or timeout quota", () => {
    const { timeouts: _timeouts, ...withoutTimeouts } = projection();
    const missing: ScoreboardProjection = {
      ...withoutTimeouts,
      shotClockRemainingMs: null
    };
    const display = buildScoreWorkspaceFacts(missing, nowMs);
    expect(display.shotClockLabel).toBe("—");
    expect(display.shotClockState).toBe("Unavailable");
    expect(display.homeTimeoutsRemaining).toBe("—");
    expect(display.awayTimeoutsRemaining).toBe("—");
  });

  test("facts are unchanged by score command availability; this helper is read-only", () => {
    const source = buildScoreWorkspaceFacts(projection(), nowMs);
    expect(Object.keys(source)).not.toContain("onScore");
    expect(Object.keys(source)).not.toContain("canSubmit");
    expect(source.gameClockLabel).toBe("9:49");
  });
});
