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
  targetSeq: number;
  targetEventId: string;
  correctionType: "SCORE_CORRECTION";
  reason: string;
  note: string | null;
};

export type CorrectionAppliedPayload = {
  correctionRequestSeq: number;
  correctionRequestEventId: string;
  targetSeq: number;
  reason: string;
  removedOriginalScore: boolean;
  replacementEventId: string | null;
};

export type CorrectionRejectedPayload = {
  correctionRequestSeq: number;
  correctionRequestEventId: string;
  reason: string;
};

export type ScoreRemovedByCorrectionPayload = {
  correctionRequestSeq: number;
  originalScoreEventId: string;
  originalScoreSeq: number;
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
