import { describe, expect, it } from "vitest";
import {
  applyGameClockStarted,
  applyGameClockStopped,
  applyShotClockReset,
  createInitialScoreboardProjection
} from "../../apps/api/src/matchEventStore/projection";

const startedAt = "2026-07-01T10:00:00.000Z";
const stoppedAt = "2026-07-01T10:00:05.000Z";

describe("clock projection reducer", () => {
  it("starts the shot clock when the game clock starts and shot clock time remains", () => {
    const projection = createInitialScoreboardProjection("match-1");

    const next = applyGameClockStarted(
      projection,
      { startedAt, remainingMsBeforeStart: 600000 },
      1
    );

    expect(next.gameClock).toEqual({
      remainingMs: 600000,
      running: true,
      lastStartedAt: startedAt
    });
    expect(next.shotClock).toEqual({
      remainingMs: 24000,
      running: true,
      lastStartedAt: startedAt
    });
    expect(next.shotClockRemainingMs).toBe(24000);
  });

  it("stops and reduces the shot clock when the game clock stops", () => {
    const running = applyGameClockStarted(
      createInitialScoreboardProjection("match-1"),
      { startedAt, remainingMsBeforeStart: 600000 },
      1
    );

    const next = applyGameClockStopped(
      running,
      { stoppedAt, remainingMsAfterStop: 595000 },
      2
    );

    expect(next.gameClock.running).toBe(false);
    expect(next.shotClock).toEqual({
      remainingMs: 19000,
      running: false,
      lastStartedAt: null
    });
    expect(next.shotClockRemainingMs).toBe(19000);
  });

  it("never lets shot clock remaining time go below zero on stop", () => {
    const running = {
      ...createInitialScoreboardProjection("match-1"),
      shotClockRemainingMs: 3000,
      shotClock: {
        remainingMs: 3000,
        running: true,
        lastStartedAt: startedAt
      }
    };

    const next = applyGameClockStopped(
      running,
      { stoppedAt: "2026-07-01T10:00:05.500Z", remainingMsAfterStop: 594500 },
      2
    );

    expect(next.shotClock.remainingMs).toBe(0);
    expect(next.shotClockRemainingMs).toBe(0);
    expect(next.shotClock.running).toBe(false);
  });

  it("keeps reset shot clock running while the game clock is running", () => {
    const running = applyGameClockStarted(
      createInitialScoreboardProjection("match-1"),
      { startedAt, remainingMsBeforeStart: 600000 },
      1
    );

    const next = applyShotClockReset(
      running,
      { resetToMs: 14000, resetAt: "2026-07-01T10:00:10.000Z" },
      2
    );

    expect(next.shotClock).toEqual({
      remainingMs: 14000,
      running: true,
      lastStartedAt: "2026-07-01T10:00:10.000Z"
    });
    expect(next.shotClockRemainingMs).toBe(14000);
  });

  it("keeps reset shot clock stopped while the game clock is stopped", () => {
    const projection = createInitialScoreboardProjection("match-1");

    const next = applyShotClockReset(
      projection,
      { resetToMs: 24000, resetAt: "2026-07-01T10:00:10.000Z" },
      1
    );

    expect(next.shotClock).toEqual({
      remainingMs: 24000,
      running: false,
      lastStartedAt: null
    });
  });
});
