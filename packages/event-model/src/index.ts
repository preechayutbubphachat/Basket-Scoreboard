export type TeamSide = "HOME" | "AWAY";

export const correctionEventTypes = [
  "CORRECTION_REQUESTED",
  "CORRECTION_APPLIED",
  "CORRECTION_REJECTED",
  "SCORE_REMOVED_BY_CORRECTION"
] as const;

export type CorrectionEventType = (typeof correctionEventTypes)[number];

export const foulEventTypes = ["TEAM_FOUL_ADDED", "PLAYER_FOUL_ADDED"] as const;

export type FoulEventType = (typeof foulEventTypes)[number];

export type MatchEventType = "SCORE_ADDED" | FoulEventType | CorrectionEventType;

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

export type FoulType = "PERSONAL" | "TECHNICAL" | "UNSPORTSMANLIKE" | "DISQUALIFYING" | "OTHER";

export type TeamFoulAddedPayload = {
  teamSide: TeamSide;
  periodNumber: number;
  foulType: FoulType;
  reason: string | null;
};

export type PlayerFoulAddedPayload = TeamFoulAddedPayload & {
  playerId: string;
};

export type ScoreboardProjection = {
  matchId: string;
  homeScore: number;
  awayScore: number;
  teamFouls: {
    home: number;
    away: number;
  };
  teamFoulsByPeriod: Record<string, { home: number; away: number }>;
  playerFouls: Array<{
    playerId: string;
    teamSide: TeamSide;
    playerName: string | null;
    jerseyNumber: string | null;
    fouls: number;
  }>;
  periodNumber: number;
  gameClockRemainingMs: number;
  shotClockRemainingMs: number;
  status: "READY" | "LIVE" | "FINAL";
  currentSeq: number;
  projectionVersion: "scoreboard-v1";
};
