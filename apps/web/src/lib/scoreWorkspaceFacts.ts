import type { ScoreboardProjection } from "@basket-scoreboard/api-contracts";
import { buildClockControlState } from "./clockControl";

/**
 * Read-only operator summary sourced from the same authoritative match projection
 * as the scoring buttons. Never infer timeout quota or shot clock when absent.
 */
export function buildScoreWorkspaceFacts(projection: ScoreboardProjection, nowMs: number) {
  const clock = buildClockControlState(projection, { nowMs });
  const shotAvailable = Boolean(projection.shotClock) || projection.shotClockRemainingMs !== null;

  return {
    gameClockLabel: clock.gameClockLabel,
    gameClockState: clock.gameClockRunning ? "Running" : "Stopped",
    shotClockLabel: shotAvailable ? clock.shotClockLabel : "—",
    shotClockState: !shotAvailable ? "Unavailable" : clock.shotClockRunning ? "Running" : "Stopped",
    homeTimeoutsRemaining: projection.timeouts?.home.remaining.toString() ?? "—",
    awayTimeoutsRemaining: projection.timeouts?.away.remaining.toString() ?? "—"
  };
}
