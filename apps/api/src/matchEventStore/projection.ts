import type { ScoreAddedPayload } from "@basket-scoreboard/api-contracts";

export type ScoreboardProjection = {
  matchId: string;
  homeScore: number;
  awayScore: number;
  periodNumber: number;
  gameClockRemainingMs: number;
  shotClockRemainingMs: number;
  status: "READY" | "LIVE" | "FINAL";
  currentSeq: number;
  projectionVersion: "scoreboard-v1";
};

export function createInitialScoreboardProjection(matchId: string): ScoreboardProjection {
  return {
    matchId,
    homeScore: 0,
    awayScore: 0,
    periodNumber: 1,
    gameClockRemainingMs: 600000,
    shotClockRemainingMs: 24000,
    status: "READY",
    currentSeq: 0,
    projectionVersion: "scoreboard-v1"
  };
}

export function applyScoreAdded(
  projection: ScoreboardProjection,
  payload: ScoreAddedPayload,
  seqNo: number
): ScoreboardProjection {
  return {
    ...projection,
    homeScore:
      payload.teamSide === "HOME" ? projection.homeScore + payload.points : projection.homeScore,
    awayScore:
      payload.teamSide === "AWAY" ? projection.awayScore + payload.points : projection.awayScore,
    periodNumber: payload.periodNumber,
    gameClockRemainingMs: payload.gameClockRemainingMs,
    status: "LIVE",
    currentSeq: seqNo
  };
}
