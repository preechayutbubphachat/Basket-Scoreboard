export type TeamSide = "HOME" | "AWAY";

export const correctionEventTypes = [
  "CORRECTION_REQUESTED",
  "CORRECTION_APPLIED",
  "CORRECTION_REJECTED",
  "SCORE_REMOVED_BY_CORRECTION"
] as const;

export type CorrectionEventType = (typeof correctionEventTypes)[number];

export type MatchEventType = "SCORE_ADDED" | CorrectionEventType;

export type CorrectionRequestedPayload = {
  targetEventId: string;
  reason: string;
};

export type CorrectionAppliedPayload = {
  correctionRequestEventId: string;
  reason: string;
};

export type CorrectionRejectedPayload = {
  correctionRequestEventId: string;
  reason: string;
};

export type ScoreRemovedByCorrectionPayload = {
  originalScoreEventId: string;
  teamSide: TeamSide;
  points: 1 | 2 | 3;
  reason: string;
};

export type ScoreAddedPayload = {
  teamSide: TeamSide;
  points: 1 | 2 | 3;
  playerId: string | null;
  periodNumber: number;
  gameClockRemainingMs: number;
  note: string | null;
};

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
