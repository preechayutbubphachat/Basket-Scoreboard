export type TeamSide = "HOME" | "AWAY";

export const correctionEventTypes = [
  "CORRECTION_REQUESTED",
  "CORRECTION_APPLIED",
  "CORRECTION_REJECTED",
  "SCORE_REMOVED_BY_CORRECTION",
  "SCORE_CORRECTED",
  "TEAM_FOUL_CORRECTED",
  "PLAYER_FOUL_CORRECTED",
  "TIMEOUT_CORRECTED",
  "GAME_CLOCK_CORRECTED",
  "SHOT_CLOCK_CORRECTED"
] as const;

export type CorrectionEventType = (typeof correctionEventTypes)[number];

export const foulEventTypes = [
  "TEAM_FOUL_ADDED",
  "PLAYER_FOUL_ADDED",
  "HEAD_COACH_TECHNICAL_FOUL_RECORDED",
  "HEAD_COACH_TECHNICAL_FOUL_CORRECTED",
  "BENCH_TECHNICAL_FOUL_RECORDED",
  "BENCH_TECHNICAL_FOUL_CORRECTED",
  "FREE_THROW_ENTITLEMENT_CREATED",
  "PLAY_RESUMPTION_DECLARED"
] as const;

export type FoulEventType = (typeof foulEventTypes)[number];

export const clockEventTypes = [
  "GAME_CLOCK_STARTED",
  "GAME_CLOCK_STOPPED",
  "GAME_CLOCK_SET",
  "SHOT_CLOCK_RESET",
  "SHOT_CLOCK_SET"
] as const;

export type ClockEventType = (typeof clockEventTypes)[number];

export const timeoutOpportunityEventTypes = [
  "TIMEOUT_OPPORTUNITY_FACT_RECORDED",
  "TIMEOUT_OPPORTUNITY_CORRECTED"
] as const;

export type TimeoutOpportunityEventType = (typeof timeoutOpportunityEventTypes)[number];

export type MatchEventType = "SCORE_ADDED" | FoulEventType | ClockEventType | CorrectionEventType | TimeoutOpportunityEventType;

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

export type AlphaCorrectionPayload = {
  correctedEventSeq: number;
  correctedEventType: string;
  correctionKind:
    | "SCORE_UNDO"
    | "TEAM_FOUL_UNDO"
    | "PLAYER_FOUL_UNDO"
    | "TIMEOUT_UNDO"
    | "HEAD_COACH_TECHNICAL_UNDO"
    | "BENCH_TECHNICAL_UNDO"
    | "GAME_CLOCK_SET_CORRECTION"
    | "SHOT_CLOCK_SET_CORRECTION";
  reason: string;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  delta: Record<string, unknown> | null;
  actorId: string;
  actorRole: string;
  deviceId: string | null;
  correlationId: string;
  causationId: string;
  createdAt: string;
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

export type HeadCoachTechnicalFoulRecordedPayload = {
  teamSide: TeamSide;
  headCoachDesignationId: string;
  headCoachDisplayNameSnapshot: string;
  classification: "C";
  periodNumber: number;
  gameClockSnapshot: string;
  ruleProfileId: "FIBA_2024";
  ruleVersion: string;
};

export type BenchTechnicalFoulRecordedPayload = {
  teamSide: TeamSide;
  assistantCoachDesignationId: string;
  assistantCoachDisplayNameSnapshot: string;
  chargedHeadCoachDesignationId: string;
  chargedHeadCoachDisplayNameSnapshot: string;
  classification: "B";
  periodNumber: number;
  gameClockSnapshot: string;
  shotClockSnapshot: string | null;
  /** The bounded projection records an unknown control state as null. */
  teamControlSnapshot: TeamSide | null;
  ruleProfileId: "FIBA_2024";
  ruleVersion: string;
};

export type FreeThrowEntitlementCreatedPayload = {
  sourceFoulEventId: string;
  attempts: 1;
  awardedTo: TeamSide;
  ruleProfileId: "FIBA_2024";
};

export type PlayResumptionDeclaredPayload = {
  sourceEntitlementEventId: string;
  mode: "RESUME_INTERRUPTED_PLAY";
  resumptionLocation: "POINT_OF_INTERRUPTION";
  /** Null means this bounded projection does not track an authoritative team-control fact. */
  teamControlSnapshot: TeamSide | null;
  periodNumber: number;
  gameClockSnapshot: string;
  shotClockSnapshot: string;
  ruleProfileId: "FIBA_2024";
};

export type GameClockStartedPayload = {
  startedAt: string;
  remainingMsBeforeStart: number;
};

export type GameClockStoppedPayload = {
  stoppedAt: string;
  remainingMsAfterStop: number;
};

export type GameClockSetPayload = {
  remainingMs: number;
  reason: string | null;
};

export type ShotClockResetPayload = {
  resetToMs: 24000 | 14000;
  reason: string | null;
};

export type ShotClockSetPayload = {
  remainingMs: number;
  reason: string | null;
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
   personalFouls: number;
   technicalFouls: number;
   totalTowardLimit: number;
 }>;
  headCoachTechnicals: Array<{
   designationId: string;
   teamSide: TeamSide;
   displayNameSnapshot: string;
   coachTechnicalCount: number;
   benchTechnicalCount: number;
   disqualificationReviewRequired: boolean;
   disqualificationReviewReason: "TWO_COACH_TECHNICALS" | "THREE_BENCH_TECHNICALS" | "ONE_COACH_TWO_BENCH_TECHNICALS" | null;
  }>;
 periodNumber: number;
 gameClockRemainingMs: number;
 shotClockRemainingMs: number;
 gameClock: {
   remainingMs: number;
   running: boolean;
   lastStartedAt: string | null;
 };
 shotClock: {
   remainingMs: number;
   running: boolean;
   lastStartedAt: string | null;
 };
 clockUpdatedAt: string | null;
 status: "READY" | "LIVE" | "FINAL";
 currentSeq: number;
 projectionVersion: "scoreboard-v1";
};
