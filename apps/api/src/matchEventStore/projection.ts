import type {
  PlayerFoulAddedPayload,
  ScoreAddedPayload,
  TeamFoulAddedPayload,
  TimeoutEndedPayload,
  TimeoutGrantedPayload,
  TimeoutRequestedBy
} from "@basket-scoreboard/api-contracts";
import {
  applyInternalRecentActionEvent,
  createInternalRecentActionState,
  normalizeInternalRecentActionState,
  type InternalRecentActionState
} from "./recentActionProjection.js";

type TeamFoulCount = { home: number; away: number };
type TimeoutCount = { used: number; remaining: number };
type TimeoutBySide = { home: number; away: number };
type ClockState = {
  remainingMs: number;
  running: boolean;
  lastStartedAt: string | null;
};
type MatchLifecycleStatus = "SCHEDULED" | "READY" | "LIVE" | "PERIOD_BREAK" | "OVERTIME" | "FINISHED" | "FINAL";
type PeriodType = "REGULATION" | "OVERTIME";
export type TimeoutOpportunityFactType = "DEAD_BALL_CONFIRMED" | "TABLE_COMMUNICATION_COMPLETED" | "THROW_IN_DISPOSAL" | "FIRST_FREE_THROW_DISPOSAL" | "FINAL_FREE_THROW_DISPOSAL" | "REFEREE_INTERRUPTION" | "VALID_GOAL" | "FINAL_FREE_THROW_SUCCESS" | "PLAYING_TIME_STARTED" | "PLAYING_TIME_ENDED";
export type TimeoutOpportunityHistoryEntry = { eventId: string; seq: number; factType: TimeoutOpportunityFactType | "CORRECTION"; occurredAt: string; corrected: boolean; targetEventId: string | null; referencedGoalEventId?: string; referencedGoalSeq?: number; scoringTeamSide?: "HOME" | "AWAY"; periodNumber?: number; periodType?: PeriodType; gameClockRemainingMs?: number; gameClockRunning?: boolean; matchStatus?: MatchLifecycleStatus };
export type TimeoutOpportunityProjection = { status: "UNKNOWN" | "CLOSED" | "OPEN"; eligibleTeams: Array<"HOME" | "AWAY">; sourceEventId: string | null; sourceSeq: number | null; sourceFactType: TimeoutOpportunityFactType | null; ruleProfileId: "FIBA_2024" };

export type PlayerFoulProjection = {
  playerId: string;
  teamSide: "HOME" | "AWAY";
  playerName: string | null;
  jerseyNumber: string | null;
  fouls: number;
  personalFouls: number;
  technicalFouls: number;
  totalTowardLimit: number;
};

export type ScoreboardProjection = {
  matchId: string;
  homeScore: number;
  awayScore: number;
  teamFouls: TeamFoulCount;
  teamFoulsByPeriod: Record<string, TeamFoulCount>;
  playerFouls: PlayerFoulProjection[];
  timeouts: {
    home: TimeoutCount;
    away: TimeoutCount;
  };
  timeoutsByHalf: {
    firstHalf: TimeoutBySide;
    secondHalf: TimeoutBySide;
    overtime: TimeoutBySide;
  };
  activeTimeout: {
    teamSide: "HOME" | "AWAY";
    startedAt: string;
    durationMs: number;
    remainingMs: number;
    requestedBy: TimeoutRequestedBy;
  } | null;
  periodType: PeriodType;
  regulationPeriods: number;
  periodDurationMs: number;
  overtimeDurationMs: number;
  winnerSide: "HOME" | "AWAY" | null;
  finalScore: { home: number; away: number } | null;
  matchStartedAt: string | null;
  matchFinishedAt: string | null;
  currentPeriodStartedAt: string | null;
  currentPeriodEndedAt: string | null;
  periodNumber: number;
  gameClockRemainingMs: number;
  shotClockRemainingMs: number;
  gameClock: ClockState;
  shotClock: ClockState;
  clockUpdatedAt: string | null;
  status: MatchLifecycleStatus;
  currentSeq: number;
  projectionVersion: "scoreboard-v1";
  recentActionState: InternalRecentActionState;
  headCoachTechnicals: Array<{
  designationId: string;
  teamSide: "HOME" | "AWAY";
  displayNameSnapshot: string;
  coachTechnicalCount: number;
  benchTechnicalCount: number;
  disqualificationReviewRequired: boolean;
  disqualificationReviewReason: "TWO_COACH_TECHNICALS" | "THREE_BENCH_TECHNICALS" | "ONE_COACH_TWO_BENCH_TECHNICALS" | null;
}>;
  /** Protected operator-only evidence. */
  timeoutOpportunity: TimeoutOpportunityProjection;
  timeoutOpportunityHistory: TimeoutOpportunityHistoryEntry[];
};

export type DerivedFinalOutcome = {
  finalScore: { home: number; away: number };
  winnerSide: "HOME" | "AWAY" | null;
};

export function deriveFinalOutcome(homeScore: number, awayScore: number): DerivedFinalOutcome {
  return {
    finalScore: { home: homeScore, away: awayScore },
    winnerSide: homeScore === awayScore ? null : homeScore > awayScore ? "HOME" : "AWAY"
  };
}

export function createInitialScoreboardProjection(matchId: string): ScoreboardProjection {
  return {
    matchId,
    homeScore: 0,
    awayScore: 0,
    teamFouls: { home: 0, away: 0 },
    teamFoulsByPeriod: {},
    playerFouls: [],
    timeouts: createDefaultTimeouts(),
    timeoutsByHalf: createDefaultTimeoutsByHalf(),
    activeTimeout: null,
    periodType: "REGULATION",
    regulationPeriods: 4,
    periodDurationMs: 600000,
    overtimeDurationMs: 300000,
    winnerSide: null,
    finalScore: null,
    matchStartedAt: null,
    matchFinishedAt: null,
    currentPeriodStartedAt: null,
    currentPeriodEndedAt: null,
    periodNumber: 1,
    gameClockRemainingMs: 600000,
    shotClockRemainingMs: 24000,
    gameClock: { remainingMs: 600000, running: false, lastStartedAt: null },
    shotClock: { remainingMs: 24000, running: false, lastStartedAt: null },
    clockUpdatedAt: null,
    status: "READY",
    currentSeq: 0,
    projectionVersion: "scoreboard-v1",
    recentActionState: createInternalRecentActionState(0),
    headCoachTechnicals: [],
    timeoutOpportunity: unknownTimeoutOpportunity(),
    timeoutOpportunityHistory: []
  };
}

export function normalizeScoreboardProjection(
  projection: Partial<ScoreboardProjection> & { matchId: string }
): ScoreboardProjection {
  const periodNumber = numberOrDefault(projection.periodNumber, 1);
  const gameClock = normalizeClockState(projection.gameClock, numberOrDefault(projection.gameClockRemainingMs, 600000));
  const shotClock = normalizeClockState(projection.shotClock, numberOrDefault(projection.shotClockRemainingMs, 24000));
  const normalized: ScoreboardProjection = {
    matchId: projection.matchId,
    homeScore: numberOrDefault(projection.homeScore, 0),
    awayScore: numberOrDefault(projection.awayScore, 0),
    teamFouls: normalizeTeamFoulCount(projection.teamFouls),
    teamFoulsByPeriod: normalizeTeamFoulsByPeriod(projection.teamFoulsByPeriod),
    playerFouls: Array.isArray(projection.playerFouls)
      ? projection.playerFouls
          .filter((player): player is PlayerFoulProjection =>
            Boolean(player && typeof player.playerId === "string" && (player.teamSide === "HOME" || player.teamSide === "AWAY"))
          )
          .map((player) => ({
            playerId: player.playerId,
            teamSide: player.teamSide,
            playerName: typeof player.playerName === "string" ? player.playerName : null,
            jerseyNumber: typeof player.jerseyNumber === "string" ? player.jerseyNumber : null,
            fouls: numberOrDefault(player.fouls, 0),
            personalFouls: numberOrDefault(player.personalFouls, numberOrDefault(player.fouls, 0)),
            technicalFouls: numberOrDefault(player.technicalFouls, 0),
            totalTowardLimit: numberOrDefault(player.totalTowardLimit, numberOrDefault(player.fouls, 0))
          }))
      : [],
    timeouts: normalizeTimeouts(projection.timeouts),
    timeoutsByHalf: normalizeTimeoutsByHalf(projection.timeoutsByHalf),
    activeTimeout: normalizeActiveTimeout(projection.activeTimeout),
    periodType: projection.periodType === "OVERTIME" ? "OVERTIME" : "REGULATION",
    regulationPeriods: numberOrDefault(projection.regulationPeriods, 4),
    periodDurationMs: numberOrDefault(projection.periodDurationMs, 600000),
    overtimeDurationMs: numberOrDefault(projection.overtimeDurationMs, 300000),
    winnerSide: projection.winnerSide === "HOME" || projection.winnerSide === "AWAY" ? projection.winnerSide : null,
    finalScore: normalizeFinalScore(projection.finalScore),
    matchStartedAt: stringOrNull(projection.matchStartedAt),
    matchFinishedAt: stringOrNull(projection.matchFinishedAt),
    currentPeriodStartedAt: stringOrNull(projection.currentPeriodStartedAt),
    currentPeriodEndedAt: stringOrNull(projection.currentPeriodEndedAt),
    periodNumber,
    gameClockRemainingMs: gameClock.remainingMs,
    shotClockRemainingMs: shotClock.remainingMs,
    gameClock,
    shotClock,
    clockUpdatedAt: typeof projection.clockUpdatedAt === "string" ? projection.clockUpdatedAt : null,
    status: normalizeLifecycleStatus(projection.status),
    currentSeq: numberOrDefault(projection.currentSeq, 0),
    projectionVersion: "scoreboard-v1",
    headCoachTechnicals: Array.isArray(projection.headCoachTechnicals)
      ? projection.headCoachTechnicals.map((hc) => ({
        designationId: typeof hc.designationId === "string" ? hc.designationId : "",
        teamSide: hc.teamSide === "HOME" || hc.teamSide === "AWAY" ? hc.teamSide : "HOME",
        displayNameSnapshot: typeof hc.displayNameSnapshot === "string" ? hc.displayNameSnapshot : "",
        coachTechnicalCount: numberOrDefault(hc.coachTechnicalCount, 0),
        benchTechnicalCount: numberOrDefault(hc.benchTechnicalCount, 0),
        disqualificationReviewRequired: Boolean(hc.disqualificationReviewRequired),
        disqualificationReviewReason: hc.disqualificationReviewReason === "TWO_COACH_TECHNICALS" || hc.disqualificationReviewReason === "THREE_BENCH_TECHNICALS" || hc.disqualificationReviewReason === "ONE_COACH_TWO_BENCH_TECHNICALS" ? hc.disqualificationReviewReason : null
      }))
      : [],
    timeoutOpportunity: normalizeTimeoutOpportunity(projection.timeoutOpportunity),
    timeoutOpportunityHistory: Array.isArray(projection.timeoutOpportunityHistory) ? projection.timeoutOpportunityHistory : [],
    recentActionState: normalizeInternalRecentActionState(
      projection.recentActionState,
      numberOrDefault(projection.currentSeq, 0)
    )
  };

  return recomputeFinalOutcomeIfFinished(normalized);
}

export function applyScoreAdded(
  projection: ScoreboardProjection,
  payload: ScoreAddedPayload,
  seqNo: number,
  sourceEventId?: string
): ScoreboardProjection {
  const wasFinished = isFinishedStatus(projection.status);
  const updatedProjection: ScoreboardProjection = {
    ...projection,
    homeScore:
      payload.teamSide === "HOME" ? projection.homeScore + payload.points : projection.homeScore,
    awayScore:
      payload.teamSide === "AWAY" ? projection.awayScore + payload.points : projection.awayScore,
    periodNumber: payload.periodNumber,
    gameClockRemainingMs: payload.gameClockRemainingMs,
    gameClock: {
      ...projection.gameClock,
      remainingMs: payload.gameClockRemainingMs
    },
    status: wasFinished ? projection.status : "LIVE",
    currentSeq: seqNo
  };

  const withScore = recomputeFinalOutcomeIfFinished(withRecentAction(updatedProjection, "SCORE_ADDED", payload, seqNo));
  if (!sourceEventId) return withScore;
  const opportunity = deriveScoreTimeoutOpportunity(projection, payload, sourceEventId, seqNo);
  const factType = opportunity.sourceFactType!;
  return {
    ...withScore,
    timeoutOpportunity: opportunity,
    timeoutOpportunityHistory: [...withScore.timeoutOpportunityHistory, { eventId: sourceEventId, seq: seqNo, factType, occurredAt: projection.clockUpdatedAt ?? new Date(0).toISOString(), corrected: false, targetEventId: null, scoringTeamSide: payload.teamSide, periodNumber: projection.periodNumber, periodType: projection.periodType, gameClockRemainingMs: projection.gameClockRemainingMs, gameClockRunning: projection.gameClock.running, matchStatus: projection.status }]
  };
}

export function applyGameClockStarted(
  projection: ScoreboardProjection,
  payload: { startedAt: string; remainingMsBeforeStart: number },
  seqNo: number,
  eventId?: string
): ScoreboardProjection {
  const shotClockRemainingMs = Math.max(0, projection.shotClock.remainingMs);
  const shotClockRunning = shotClockRemainingMs > 0;

  return {
    ...projection,
    ...(eventId ? {
      timeoutOpportunity: closedOpportunity(eventId, seqNo, "PLAYING_TIME_STARTED"),
      timeoutOpportunityHistory: [
        ...projection.timeoutOpportunityHistory,
        lifecycleOpportunityEntry(eventId, seqNo, "PLAYING_TIME_STARTED", payload.startedAt, projection, projection.periodNumber, projection.periodType, payload.remainingMsBeforeStart, true)
      ]
    } : {}),
    gameClockRemainingMs: payload.remainingMsBeforeStart,
    shotClockRemainingMs,
    gameClock: {
      remainingMs: payload.remainingMsBeforeStart,
      running: true,
      lastStartedAt: payload.startedAt
    },
    shotClock: {
      remainingMs: shotClockRemainingMs,
      running: shotClockRunning,
      lastStartedAt: shotClockRunning ? payload.startedAt : null
    },
    clockUpdatedAt: payload.startedAt,
    status: "LIVE",
    currentSeq: seqNo
  };
}

export function applyGameClockStopped(
  projection: ScoreboardProjection,
  payload: { stoppedAt: string; remainingMsAfterStop: number },
  seqNo: number
): ScoreboardProjection {
  const shotClockRemainingMs = deriveStoppedClockRemainingMs(projection.shotClock, payload.stoppedAt);

  return {
    ...projection,
    gameClockRemainingMs: payload.remainingMsAfterStop,
    shotClockRemainingMs,
    gameClock: {
      remainingMs: payload.remainingMsAfterStop,
      running: false,
      lastStartedAt: null
    },
    shotClock: {
      remainingMs: shotClockRemainingMs,
      running: false,
      lastStartedAt: null
    },
    clockUpdatedAt: payload.stoppedAt,
    currentSeq: seqNo
  };
}

export function applyGameClockSet(
  projection: ScoreboardProjection,
  payload: { remainingMs: number; setAt: string },
  seqNo: number
): ScoreboardProjection {
  return {
    ...projection,
    gameClockRemainingMs: payload.remainingMs,
    gameClock: {
      remainingMs: payload.remainingMs,
      running: false,
      lastStartedAt: null
    },
    clockUpdatedAt: payload.setAt,
    currentSeq: seqNo
  };
}

export function applyShotClockReset(
  projection: ScoreboardProjection,
  payload: { resetToMs: 24000 | 14000; resetAt: string },
  seqNo: number
): ScoreboardProjection {
  const running = projection.gameClock.running && payload.resetToMs > 0;

  return {
    ...projection,
    shotClockRemainingMs: payload.resetToMs,
    shotClock: {
      remainingMs: payload.resetToMs,
      running,
      lastStartedAt: running ? payload.resetAt : null
    },
    clockUpdatedAt: payload.resetAt,
    currentSeq: seqNo
  };
}

export function applyShotClockSet(
  projection: ScoreboardProjection,
  payload: { remainingMs: number; setAt: string },
  seqNo: number
): ScoreboardProjection {
  const remainingMs = Math.max(0, payload.remainingMs);
  const running = projection.gameClock.running && remainingMs > 0;

  return {
    ...projection,
    shotClockRemainingMs: remainingMs,
    shotClock: {
      remainingMs,
      running,
      lastStartedAt: running ? payload.setAt : null
    },
    clockUpdatedAt: payload.setAt,
    currentSeq: seqNo
  };
}

export function applyTeamFoulAdded(
  projection: ScoreboardProjection,
  payload: TeamFoulAddedPayload & { periodNumber: number },
  seqNo: number
): ScoreboardProjection {
  const periodKey = String(payload.periodNumber);
  const currentPeriodFouls = projection.teamFoulsByPeriod[periodKey] ?? { home: 0, away: 0 };
  const sideKey = payload.teamSide === "HOME" ? "home" : "away";
  const nextPeriodFouls = {
    ...currentPeriodFouls,
    [sideKey]: currentPeriodFouls[sideKey] + 1
  };

  return withRecentAction({
    ...projection,
    teamFouls: nextPeriodFouls,
    teamFoulsByPeriod: {
      ...projection.teamFoulsByPeriod,
      [periodKey]: nextPeriodFouls
    },
    periodNumber: payload.periodNumber,
    status: "LIVE",
    currentSeq: seqNo
  }, "TEAM_FOUL_ADDED", payload, seqNo);
}

export function applyPlayerFoulAdded(
  projection: ScoreboardProjection,
  payload: PlayerFoulAddedPayload & {
    periodNumber: number;
    playerName: string | null;
    jerseyNumber: string | null;
  },
  seqNo: number
): ScoreboardProjection {
  const nextProjection = applyTeamFoulAdded(projection, payload, seqNo);
  const existing = nextProjection.playerFouls.find((player) => player.playerId === payload.playerId);
  const isTechnical = payload.foulType === "TECHNICAL";
  const playerFouls = existing
    ? nextProjection.playerFouls.map((player) =>
        player.playerId === payload.playerId
          ? {
              ...player,
              fouls: player.fouls + 1,
              personalFouls: isTechnical ? player.personalFouls : player.personalFouls + 1,
              technicalFouls: isTechnical ? player.technicalFouls + 1 : player.technicalFouls,
              totalTowardLimit: player.totalTowardLimit + 1
            }
          : player
      )
    : [
        ...nextProjection.playerFouls,
        {
          playerId: payload.playerId,
          teamSide: payload.teamSide,
          playerName: payload.playerName,
          jerseyNumber: payload.jerseyNumber,
          fouls: 1,
          personalFouls: isTechnical ? 0 : 1,
          technicalFouls: isTechnical ? 1 : 0,
          totalTowardLimit: 1
        }
      ];

  return withRecentAction(
    {
      ...nextProjection,
      playerFouls
    },
    "PLAYER_FOUL_ADDED",
    payload,
    seqNo
  );
}

export function applyHeadCoachTechnicalFoulAdded(
  projection: ScoreboardProjection,
  payload: {
    teamSide: "HOME" | "AWAY";
    headCoachDesignationId: string;
    headCoachDisplayNameSnapshot: string;
    periodNumber: number;
    gameClockSnapshot: string;
    ruleProfileId: string;
    ruleVersion: string;
  } & { periodNumber: number },
  seqNo: number
): ScoreboardProjection {
  const teamSide = payload.teamSide;

  const existing = projection.headCoachTechnicals?.find(
    (hc) => hc.designationId === payload.headCoachDesignationId
  );
  const nextCount = (existing?.coachTechnicalCount ?? 0) + 1;

  const headCoachTechnicals = existing
    ? projection.headCoachTechnicals!.map((hc) =>
        hc.designationId === payload.headCoachDesignationId
          ? { ...hc, coachTechnicalCount: nextCount }
          : hc
      )
    : [
        ...(projection.headCoachTechnicals ?? []),
        {
          designationId: payload.headCoachDesignationId,
          teamSide: payload.teamSide,
          displayNameSnapshot: payload.headCoachDisplayNameSnapshot,
          coachTechnicalCount: 1,
          benchTechnicalCount: 0,
          disqualificationReviewRequired: false,
          disqualificationReviewReason: null
        }
      ];

  return withBenchTechnicalReviews({
    ...projection,
    headCoachTechnicals,
    currentSeq: seqNo
  });
}

export function applyHeadCoachTechnicalFoulCorrected(
  projection: ScoreboardProjection,
  payload: { designationId: string },
  seqNo: number
): ScoreboardProjection {
  return withBenchTechnicalReviews({
    ...projection,
    headCoachTechnicals: projection.headCoachTechnicals.map((coach) => {
      if (coach.designationId !== payload.designationId) return coach;
      const coachTechnicalCount = Math.max(0, coach.coachTechnicalCount - 1);
      return {
        ...coach,
        coachTechnicalCount,
        disqualificationReviewRequired: false,
        disqualificationReviewReason: null
      };
    }),
    currentSeq: seqNo
  });
}

export function applyAssistantCoachBenchTechnicalFoulAdded(
  projection: ScoreboardProjection,
  payload: {
    teamSide: "HOME" | "AWAY";
    assistantCoachDesignationId: string;
    assistantCoachDisplayNameSnapshot: string;
    chargedHeadCoachDesignationId: string;
    chargedHeadCoachDisplayNameSnapshot: string;
  },
  seqNo: number
): ScoreboardProjection {
  const existing = projection.headCoachTechnicals.find((coach) => coach.designationId === payload.chargedHeadCoachDesignationId);
  const headCoachTechnicals = existing
    ? projection.headCoachTechnicals.map((coach) => coach.designationId === payload.chargedHeadCoachDesignationId ? { ...coach, benchTechnicalCount: coach.benchTechnicalCount + 1 } : coach)
    : [...projection.headCoachTechnicals, { designationId: payload.chargedHeadCoachDesignationId, teamSide: payload.teamSide, displayNameSnapshot: payload.chargedHeadCoachDisplayNameSnapshot, coachTechnicalCount: 0, benchTechnicalCount: 1, disqualificationReviewRequired: false, disqualificationReviewReason: null }];
  return withBenchTechnicalReviews({ ...projection, headCoachTechnicals, currentSeq: seqNo });
}

export function applyAssistantCoachBenchTechnicalFoulCorrected(
  projection: ScoreboardProjection,
  payload: { chargedHeadCoachDesignationId: string },
  seqNo: number
): ScoreboardProjection {
  return withBenchTechnicalReviews({
    ...projection,
    headCoachTechnicals: projection.headCoachTechnicals.map((coach) => coach.designationId === payload.chargedHeadCoachDesignationId ? { ...coach, benchTechnicalCount: Math.max(0, coach.benchTechnicalCount - 1) } : coach),
    currentSeq: seqNo
  });
}

function withBenchTechnicalReviews(projection: ScoreboardProjection): ScoreboardProjection {
  return {
    ...projection,
    headCoachTechnicals: projection.headCoachTechnicals.map((coach) => {
      const disqualificationReviewReason = coach.coachTechnicalCount >= 2 ? "TWO_COACH_TECHNICALS" as const : coach.benchTechnicalCount >= 3 ? "THREE_BENCH_TECHNICALS" as const : coach.coachTechnicalCount >= 1 && coach.benchTechnicalCount >= 2 ? "ONE_COACH_TWO_BENCH_TECHNICALS" as const : null;
      return { ...coach, disqualificationReviewRequired: disqualificationReviewReason !== null, disqualificationReviewReason };
    })
  };
}

export function applyTimeoutGranted(
  projection: ScoreboardProjection,
  payload: TimeoutGrantedPayload & {
    startedAt: string;
    periodNumber: number;
    gameClockRemainingMs: number | null;
    shotClockRemainingMs: number | null;
  },
  seqNo: number
): ScoreboardProjection {
  const sideKey = payload.teamSide === "HOME" ? "home" : "away";
  const halfKey = getHalfKey(payload.periodNumber);
  const timeouts = normalizeTimeouts(projection.timeouts);
  const timeoutsByHalf = normalizeTimeoutsByHalf(projection.timeoutsByHalf);
  const nextUsed = timeouts[sideKey].used + 1;
  const nextHalf = {
    ...timeoutsByHalf[halfKey],
    [sideKey]: timeoutsByHalf[halfKey][sideKey] + 1
  };

  return withRecentAction({
    ...projection,
    timeouts: {
      ...timeouts,
      [sideKey]: {
        used: nextUsed,
        remaining: Math.max(0, 5 - nextUsed)
      }
    },
    timeoutsByHalf: {
      ...timeoutsByHalf,
      [halfKey]: nextHalf
    },
    activeTimeout: {
      teamSide: payload.teamSide,
      startedAt: payload.startedAt,
      durationMs: payload.durationMs,
      remainingMs: payload.durationMs,
      requestedBy: payload.requestedBy
    },
    gameClockRemainingMs: payload.gameClockRemainingMs ?? projection.gameClockRemainingMs,
    shotClockRemainingMs: payload.shotClockRemainingMs ?? projection.shotClockRemainingMs,
    gameClock: {
      ...projection.gameClock,
      remainingMs: payload.gameClockRemainingMs ?? projection.gameClock.remainingMs,
      running: false,
      lastStartedAt: null
    },
    shotClock: {
      ...projection.shotClock,
      remainingMs: payload.shotClockRemainingMs ?? projection.shotClock.remainingMs,
      running: false,
      lastStartedAt: null
    },
    clockUpdatedAt: payload.startedAt,
    status: "LIVE",
    currentSeq: seqNo
  }, "TIMEOUT_GRANTED", payload, seqNo);
}

export function applyTimeoutEnded(
  projection: ScoreboardProjection,
  payload: TimeoutEndedPayload & { endedAt: string },
  seqNo: number
): ScoreboardProjection {
  return {
    ...projection,
    activeTimeout: null,
    clockUpdatedAt: payload.endedAt,
    currentSeq: seqNo
  };
}

export function applyMatchStarted(
  projection: ScoreboardProjection,
  payload: {
    startedAt: string;
    periodNumber: number;
    periodType: PeriodType;
    gameClockRemainingMs: number;
    shotClockRemainingMs: number;
    reason: string | null;
  },
  seqNo: number,
  eventId?: string
): ScoreboardProjection {
  return withRecentAction({
    ...projection,
    status: "LIVE",
    ...(eventId ? { timeoutOpportunity: closedOpportunity(eventId, seqNo, "PLAYING_TIME_ENDED") } : {}),
    periodNumber: payload.periodNumber,
    periodType: payload.periodType,
    timeoutOpportunityHistory: projection.timeoutOpportunityHistory,
    matchStartedAt: projection.matchStartedAt ?? payload.startedAt,
    currentPeriodStartedAt: payload.startedAt,
    currentPeriodEndedAt: null,
    matchFinishedAt: null,
    winnerSide: null,
    finalScore: null,
    gameClockRemainingMs: payload.gameClockRemainingMs,
    shotClockRemainingMs: payload.shotClockRemainingMs,
    gameClock: { remainingMs: payload.gameClockRemainingMs, running: false, lastStartedAt: null },
    shotClock: { remainingMs: payload.shotClockRemainingMs, running: false, lastStartedAt: null },
    clockUpdatedAt: payload.startedAt,
    activeTimeout: null,
    currentSeq: seqNo
  }, "MATCH_STARTED", payload, seqNo);
}

export function applyPeriodEnded(
  projection: ScoreboardProjection,
  payload: {
    periodNumber: number;
    periodType: PeriodType;
    endedAt: string;
    gameClockRemainingMs: number;
    shotClockRemainingMs: number;
    reason: string | null;
  },
  seqNo: number,
  eventId?: string
): ScoreboardProjection {
  return withRecentAction({
    ...projection,
    status: "PERIOD_BREAK",
    ...(eventId ? { timeoutOpportunity: closedOpportunity(eventId, seqNo, "PLAYING_TIME_ENDED") } : {}),
    periodNumber: payload.periodNumber,
    periodType: payload.periodType,
    timeoutOpportunityHistory: eventId ? [...projection.timeoutOpportunityHistory, lifecycleOpportunityEntry(eventId, seqNo, "PLAYING_TIME_ENDED", payload.endedAt, projection, payload.periodNumber, payload.periodType, payload.gameClockRemainingMs, false)] : projection.timeoutOpportunityHistory,
    currentPeriodEndedAt: payload.endedAt,
    gameClockRemainingMs: payload.gameClockRemainingMs,
    shotClockRemainingMs: payload.shotClockRemainingMs,
    gameClock: { remainingMs: payload.gameClockRemainingMs, running: false, lastStartedAt: null },
    shotClock: { remainingMs: payload.shotClockRemainingMs, running: false, lastStartedAt: null },
    clockUpdatedAt: payload.endedAt,
    activeTimeout: null,
    currentSeq: seqNo
  }, "PERIOD_ENDED", payload, seqNo);
}

export function applyPeriodStarted(
  projection: ScoreboardProjection,
  payload: {
    periodNumber: number;
    periodType: "REGULATION";
    startedAt: string;
    gameClockRemainingMs: number;
    shotClockRemainingMs: number;
    reason: string | null;
  },
  seqNo: number,
  eventId?: string
): ScoreboardProjection {
  return withRecentAction({
    ...projection,
    status: "LIVE",
    ...(eventId ? { timeoutOpportunity: closedOpportunity(eventId, seqNo, "PLAYING_TIME_ENDED") } : {}),
    periodNumber: payload.periodNumber,
    periodType: payload.periodType,
    timeoutOpportunityHistory: projection.timeoutOpportunityHistory,
    currentPeriodStartedAt: payload.startedAt,
    currentPeriodEndedAt: null,
    gameClockRemainingMs: payload.gameClockRemainingMs,
    shotClockRemainingMs: payload.shotClockRemainingMs,
    gameClock: { remainingMs: payload.gameClockRemainingMs, running: false, lastStartedAt: null },
    shotClock: { remainingMs: payload.shotClockRemainingMs, running: false, lastStartedAt: null },
    clockUpdatedAt: payload.startedAt,
    activeTimeout: null,
    currentSeq: seqNo
  }, "PERIOD_STARTED", payload, seqNo);
}

export function applyOvertimeStarted(
  projection: ScoreboardProjection,
  payload: {
    periodNumber: number;
    periodType: "OVERTIME";
    startedAt: string;
    gameClockRemainingMs: number;
    shotClockRemainingMs: number;
    reason: string | null;
  },
  seqNo: number,
  eventId?: string
): ScoreboardProjection {
  return withRecentAction({
    ...projection,
    status: "OVERTIME",
    ...(eventId ? { timeoutOpportunity: closedOpportunity(eventId, seqNo, "PLAYING_TIME_ENDED") } : {}),
    periodNumber: payload.periodNumber,
    periodType: payload.periodType,
    timeoutOpportunityHistory: projection.timeoutOpportunityHistory,
    currentPeriodStartedAt: payload.startedAt,
    currentPeriodEndedAt: null,
    gameClockRemainingMs: payload.gameClockRemainingMs,
    shotClockRemainingMs: payload.shotClockRemainingMs,
    gameClock: { remainingMs: payload.gameClockRemainingMs, running: false, lastStartedAt: null },
    shotClock: { remainingMs: payload.shotClockRemainingMs, running: false, lastStartedAt: null },
    clockUpdatedAt: payload.startedAt,
    activeTimeout: null,
    currentSeq: seqNo
  }, "OVERTIME_STARTED", payload, seqNo);
}

export function applyMatchFinished(
  projection: ScoreboardProjection,
  payload: {
    finishedAt: string;
    finalHomeScore: number;
    finalAwayScore: number;
    winnerSide: "HOME" | "AWAY" | null;
    reason: string | null;
  },
  seqNo: number,
  eventId?: string
): ScoreboardProjection {
  const finalOutcome = deriveFinalOutcome(projection.homeScore, projection.awayScore);

  return withRecentAction({
    ...projection,
    status: "FINISHED",
    ...(eventId ? { timeoutOpportunity: closedOpportunity(eventId, seqNo, "PLAYING_TIME_ENDED") } : {}),
    timeoutOpportunityHistory: eventId ? [...projection.timeoutOpportunityHistory, lifecycleOpportunityEntry(eventId, seqNo, "PLAYING_TIME_ENDED", payload.finishedAt, projection, projection.periodNumber, projection.periodType, projection.gameClock.remainingMs, false)] : projection.timeoutOpportunityHistory,
    matchFinishedAt: payload.finishedAt,
    ...finalOutcome,
    gameClockRemainingMs: projection.gameClock.remainingMs,
    shotClockRemainingMs: projection.shotClock.remainingMs,
    gameClock: { ...projection.gameClock, running: false, lastStartedAt: null },
    shotClock: { ...projection.shotClock, running: false, lastStartedAt: null },
    clockUpdatedAt: payload.finishedAt,
    activeTimeout: null,
    currentSeq: seqNo
  }, "MATCH_FINISHED", payload, seqNo);
}

export function applyScoreRemovedByCorrection(
  projection: ScoreboardProjection,
  payload: Pick<ScoreAddedPayload, "teamSide" | "points"> & { originalScoreSeq?: number; originalScoreEventId?: string; correctedEventSeq?: number },
  seqNo: number,
  correctionEventId?: string
): ScoreboardProjection {
  const scoreTarget = projection.timeoutOpportunityHistory.find((entry) =>
    (payload.originalScoreEventId ? entry.eventId === payload.originalScoreEventId : entry.seq === (payload.originalScoreSeq ?? payload.correctedEventSeq))
    && (entry.factType === "VALID_GOAL" || entry.factType === "FINAL_FREE_THROW_SUCCESS")
    && !entry.corrected
  );
  const opportunityProjection = scoreTarget && correctionEventId
    ? applyTimeoutOpportunityCorrection(projection, { targetEventId: scoreTarget.eventId, targetSeq: scoreTarget.seq, reason: "Canonical score correction", correctionEventId, correctionSeq: seqNo, occurredAt: projection.clockUpdatedAt ?? new Date(0).toISOString() }, seqNo)
    : projection;
  const updatedProjection: ScoreboardProjection = {
    ...opportunityProjection,
    homeScore:
      payload.teamSide === "HOME" ? Math.max(0, projection.homeScore - payload.points) : projection.homeScore,
    awayScore:
      payload.teamSide === "AWAY" ? Math.max(0, projection.awayScore - payload.points) : projection.awayScore,
    currentSeq: seqNo
  };

  return recomputeFinalOutcomeIfFinished(withRecentAction(
    updatedProjection,
    payload.correctedEventSeq === undefined ? "SCORE_REMOVED_BY_CORRECTION" : "SCORE_CORRECTED",
    payload,
    seqNo
  ));
}

export function applyScoreCorrected(
  projection: ScoreboardProjection,
  payload: Pick<ScoreAddedPayload, "teamSide" | "points"> & { correctedEventSeq?: number },
  seqNo: number
): ScoreboardProjection {
  return applyScoreRemovedByCorrection(projection, payload, seqNo);
}

export function applyTeamFoulCorrected(
  projection: ScoreboardProjection,
  payload: { teamSide: "HOME" | "AWAY"; periodNumber?: number | null; correctedEventSeq?: number },
  seqNo: number
): ScoreboardProjection {
  const periodKey = String(payload.periodNumber ?? projection.periodNumber);
  const currentPeriodFouls = projection.teamFoulsByPeriod[periodKey] ?? projection.teamFouls;
  const sideKey = payload.teamSide === "HOME" ? "home" : "away";
  const nextPeriodFouls = {
    ...currentPeriodFouls,
    [sideKey]: Math.max(0, currentPeriodFouls[sideKey] - 1)
  };

  return withRecentAction({
    ...projection,
    teamFouls: nextPeriodFouls,
    teamFoulsByPeriod: {
      ...projection.teamFoulsByPeriod,
      [periodKey]: nextPeriodFouls
    },
    currentSeq: seqNo
  }, "TEAM_FOUL_CORRECTED", payload, seqNo);
}

export function applyPlayerFoulCorrected(
  projection: ScoreboardProjection,
  payload: { teamSide: "HOME" | "AWAY"; playerId: string; foulType?: "PERSONAL" | "TECHNICAL"; periodNumber?: number | null; correctedEventSeq?: number },
  seqNo: number
): ScoreboardProjection {
  const nextProjection = applyTeamFoulCorrected(projection, payload, seqNo);

  return {
    ...nextProjection,
    playerFouls: nextProjection.playerFouls.map((player) =>
      player.playerId === payload.playerId
        ? {
            ...player,
            fouls: Math.max(0, player.fouls - 1),
            personalFouls: payload.foulType === "TECHNICAL"
              ? player.personalFouls
              : Math.max(0, player.personalFouls - 1),
            technicalFouls: payload.foulType === "TECHNICAL"
              ? Math.max(0, player.technicalFouls - 1)
              : player.technicalFouls,
            totalTowardLimit: Math.max(0, player.totalTowardLimit - 1)
          }
        : player
    )
  };
}

export function applyTimeoutCorrected(
  projection: ScoreboardProjection,
  payload: { teamSide?: "HOME" | "AWAY" | null; periodNumber?: number | null; correctedEventSeq?: number },
  seqNo: number
): ScoreboardProjection {
  if (!payload.teamSide) {
    return withRecentAction(
      advanceProjectionSeq({ ...projection, activeTimeout: null }, seqNo),
      "TIMEOUT_CORRECTED",
      payload,
      seqNo
    );
  }

  const sideKey = payload.teamSide === "HOME" ? "home" : "away";
  const halfKey = getHalfKey(payload.periodNumber ?? projection.periodNumber);
  const timeouts = normalizeTimeouts(projection.timeouts);
  const timeoutsByHalf = normalizeTimeoutsByHalf(projection.timeoutsByHalf);
  const nextUsed = Math.max(0, timeouts[sideKey].used - 1);
  const nextHalf = {
    ...timeoutsByHalf[halfKey],
    [sideKey]: Math.max(0, timeoutsByHalf[halfKey][sideKey] - 1)
  };

  return withRecentAction({
    ...projection,
    timeouts: {
      ...timeouts,
      [sideKey]: {
        used: nextUsed,
        remaining: Math.max(0, 5 - nextUsed)
      }
    },
    timeoutsByHalf: {
      ...timeoutsByHalf,
      [halfKey]: nextHalf
    },
    activeTimeout: projection.activeTimeout?.teamSide === payload.teamSide ? null : projection.activeTimeout,
    currentSeq: seqNo
  }, "TIMEOUT_CORRECTED", payload, seqNo);
}

export function applyGameClockCorrected(
  projection: ScoreboardProjection,
  payload: { remainingMs: number; running?: boolean; correctedAt: string },
  seqNo: number
): ScoreboardProjection {
  const remainingMs = Math.max(0, payload.remainingMs);

  return {
    ...projection,
    gameClockRemainingMs: remainingMs,
    gameClock: {
      remainingMs,
      running: payload.running === true,
      lastStartedAt: payload.running === true ? payload.correctedAt : null
    },
    clockUpdatedAt: payload.correctedAt,
    currentSeq: seqNo
  };
}

export function applyShotClockCorrected(
  projection: ScoreboardProjection,
  payload: { remainingMs: number; running?: boolean; correctedAt: string },
  seqNo: number
): ScoreboardProjection {
  const remainingMs = Math.max(0, payload.remainingMs);

  return {
    ...projection,
    shotClockRemainingMs: remainingMs,
    shotClock: {
      remainingMs,
      running: payload.running === true,
      lastStartedAt: payload.running === true ? payload.correctedAt : null
    },
    clockUpdatedAt: payload.correctedAt,
    currentSeq: seqNo
  };
}

export function advanceProjectionSeq(
  projection: ScoreboardProjection,
  seqNo: number
): ScoreboardProjection {
  return {
    ...projection,
    currentSeq: seqNo
  };
}

function lifecycleOpportunityEntry(eventId: string, seq: number, factType: "PLAYING_TIME_STARTED" | "PLAYING_TIME_ENDED", occurredAt: string, projection: ScoreboardProjection, periodNumber: number, periodType: PeriodType, gameClockRemainingMs: number, gameClockRunning: boolean): TimeoutOpportunityHistoryEntry {
  return { eventId, seq, factType, occurredAt, corrected: false, targetEventId: null, periodNumber, periodType, gameClockRemainingMs, gameClockRunning, matchStatus: factType === "PLAYING_TIME_STARTED" ? (periodType === "OVERTIME" ? "OVERTIME" : "LIVE") : projection.status };
}

export function deriveScoreTimeoutOpportunity(projection: ScoreboardProjection, payload: { teamSide: "HOME" | "AWAY"; points: number }, sourceEventId: string, sourceSeq: number): TimeoutOpportunityProjection {
  const playingMarker = [...projection.timeoutOpportunityHistory]
    .reverse()
    .find((entry) => !entry.corrected && (entry.factType === "PLAYING_TIME_STARTED" || entry.factType === "PLAYING_TIME_ENDED"));
  if ((projection.status !== "LIVE" && projection.status !== "OVERTIME") || playingMarker?.factType !== "PLAYING_TIME_STARTED") return closedOpportunity(sourceEventId, sourceSeq, "VALID_GOAL");
  const latestActiveFact = [...projection.timeoutOpportunityHistory]
    .reverse()
    .find((entry) => !entry.corrected && entry.factType !== "CORRECTION");
  if (payload.points === 1 && latestActiveFact?.factType === "FINAL_FREE_THROW_DISPOSAL") {
    return openOpportunity(sourceEventId, sourceSeq, "FINAL_FREE_THROW_SUCCESS", ["HOME", "AWAY"]);
  }
  return openOpportunity(sourceEventId, sourceSeq, "VALID_GOAL", [opposite(payload.teamSide)]);
}

export function applyTimeoutOpportunityFact(projection: ScoreboardProjection, fact: { factType: TimeoutOpportunityFactType; sourceEventId: string; sourceSeq: number; occurredAt: string; referencedGoalEventId?: string; referencedGoalSeq?: number; scoringTeamSide?: "HOME" | "AWAY"; periodNumber?: number; periodType?: PeriodType; gameClockRemainingMs?: number; gameClockRunning?: boolean; matchStatus?: MatchLifecycleStatus }, seqNo: number): ScoreboardProjection {
  const entry: TimeoutOpportunityHistoryEntry = { eventId: fact.sourceEventId, seq: fact.sourceSeq, factType: fact.factType, occurredAt: fact.occurredAt, corrected: false, targetEventId: null, ...(fact.referencedGoalEventId ? { referencedGoalEventId: fact.referencedGoalEventId, referencedGoalSeq: fact.referencedGoalSeq } : {}), ...(fact.scoringTeamSide ? { scoringTeamSide: fact.scoringTeamSide } : {}), periodNumber: fact.periodNumber ?? projection.periodNumber, periodType: fact.periodType ?? projection.periodType, gameClockRemainingMs: fact.gameClockRemainingMs ?? projection.gameClockRemainingMs, gameClockRunning: fact.gameClockRunning ?? projection.gameClock.running, matchStatus: fact.matchStatus ?? projection.status };
  const history = [...projection.timeoutOpportunityHistory, entry];
  const playingMarker = [...history].reverse().find((item) => !item.corrected && item.eventId !== fact.sourceEventId && (item.factType === "PLAYING_TIME_STARTED" || item.factType === "PLAYING_TIME_ENDED"));
  let opportunity: TimeoutOpportunityProjection;
  if (fact.factType === "THROW_IN_DISPOSAL" || fact.factType === "FIRST_FREE_THROW_DISPOSAL" || fact.factType === "FINAL_FREE_THROW_DISPOSAL" || fact.factType === "PLAYING_TIME_ENDED" || fact.factType === "PLAYING_TIME_STARTED") opportunity = closedOpportunity(fact.sourceEventId, fact.sourceSeq, fact.factType);
  else if (fact.factType === "TABLE_COMMUNICATION_COMPLETED") {
    const previous = [...history].reverse().find((item) => !item.corrected && item.eventId !== fact.sourceEventId && item.factType !== "CORRECTION");
    opportunity = playingMarker?.factType === "PLAYING_TIME_STARTED" && previous?.factType === "DEAD_BALL_CONFIRMED" && !projection.gameClock.running ? openOpportunity(fact.sourceEventId, fact.sourceSeq, fact.factType, ["HOME", "AWAY"]) : closedOpportunity(fact.sourceEventId, fact.sourceSeq, fact.factType);
  } else if (fact.factType === "REFEREE_INTERRUPTION") {
    const late = (projection.periodNumber >= 4 || projection.periodType === "OVERTIME") && projection.gameClockRemainingMs <= 120000;
    const referencedGoal = [...history].reverse().find((item) => !item.corrected && item.eventId === fact.referencedGoalEventId && item.factType === "VALID_GOAL");
    const latestUnsupersededSource = [...history].reverse().find((item) => !item.corrected && item.eventId !== fact.sourceEventId && item.factType !== "CORRECTION");
    opportunity = late && referencedGoal?.scoringTeamSide && referencedGoal.scoringTeamSide === fact.scoringTeamSide && latestUnsupersededSource?.eventId === referencedGoal.eventId
      ? openOpportunity(fact.sourceEventId, fact.sourceSeq, fact.factType, ["HOME", "AWAY"])
      : closedOpportunity(fact.sourceEventId, fact.sourceSeq, fact.factType);
  } else if (fact.factType === "VALID_GOAL" && fact.scoringTeamSide) opportunity = openOpportunity(fact.sourceEventId, fact.sourceSeq, fact.factType, [opposite(fact.scoringTeamSide)]);
  else if (fact.factType === "FINAL_FREE_THROW_SUCCESS") opportunity = openOpportunity(fact.sourceEventId, fact.sourceSeq, fact.factType, ["HOME", "AWAY"]);
  else opportunity = closedOpportunity(fact.sourceEventId, fact.sourceSeq, fact.factType);
  return { ...projection, timeoutOpportunity: opportunity, timeoutOpportunityHistory: history, currentSeq: seqNo };
}

export function applyTimeoutOpportunityCorrection(projection: ScoreboardProjection, correction: { targetEventId: string; targetSeq: number; reason: string; correctionEventId: string; correctionSeq: number; occurredAt: string }, seqNo: number): ScoreboardProjection {
  const target = projection.timeoutOpportunityHistory.find((item) => item.eventId === correction.targetEventId && item.seq === correction.targetSeq && item.factType !== "CORRECTION");
  if (!target) throw new Error("TIMEOUT_OPPORTUNITY_TARGET_MISMATCH");
  const retained: TimeoutOpportunityHistoryEntry[] = projection.timeoutOpportunityHistory.map((item) => item.eventId === target.eventId ? { ...item, corrected: true } : item);
  retained.push({ eventId: correction.correctionEventId, seq: correction.correctionSeq, factType: "CORRECTION", occurredAt: correction.occurredAt, corrected: false, targetEventId: target.eventId });
  const active = retained.filter((item) => !item.corrected && item.factType !== "CORRECTION");
  let state = { ...projection, timeoutOpportunity: unknownTimeoutOpportunity(), timeoutOpportunityHistory: [] as TimeoutOpportunityHistoryEntry[] };
  for (const item of active) {
    state = {
      ...state,
      periodNumber: item.periodNumber ?? state.periodNumber,
      periodType: item.periodType ?? state.periodType,
      gameClockRemainingMs: item.gameClockRemainingMs ?? state.gameClockRemainingMs,
      gameClock: { ...state.gameClock, remainingMs: item.gameClockRemainingMs ?? state.gameClock.remainingMs, running: item.gameClockRunning ?? state.gameClock.running },
      status: item.matchStatus ?? state.status
    };
    state = applyTimeoutOpportunityFact(state, { factType: item.factType as TimeoutOpportunityFactType, sourceEventId: item.eventId, sourceSeq: item.seq, occurredAt: item.occurredAt, ...(item.referencedGoalEventId ? { referencedGoalEventId: item.referencedGoalEventId, referencedGoalSeq: item.referencedGoalSeq } : {}), ...(item.scoringTeamSide ? { scoringTeamSide: item.scoringTeamSide } : {}), ...(item.periodNumber !== undefined ? { periodNumber: item.periodNumber } : {}), ...(item.periodType !== undefined ? { periodType: item.periodType } : {}), ...(item.gameClockRemainingMs !== undefined ? { gameClockRemainingMs: item.gameClockRemainingMs } : {}), ...(item.gameClockRunning !== undefined ? { gameClockRunning: item.gameClockRunning } : {}), ...(item.matchStatus !== undefined ? { matchStatus: item.matchStatus } : {}) }, item.seq);
  }
  return { ...projection, timeoutOpportunity: state.timeoutOpportunity, timeoutOpportunityHistory: retained, currentSeq: seqNo };
}

function unknownTimeoutOpportunity(): TimeoutOpportunityProjection { return { status: "UNKNOWN", eligibleTeams: [], sourceEventId: null, sourceSeq: null, sourceFactType: null, ruleProfileId: "FIBA_2024" }; }
function closedOpportunity(eventId: string, seq: number, factType: TimeoutOpportunityFactType): TimeoutOpportunityProjection { return { status: "CLOSED", eligibleTeams: [], sourceEventId: eventId, sourceSeq: seq, sourceFactType: factType, ruleProfileId: "FIBA_2024" }; }
function openOpportunity(eventId: string, seq: number, factType: TimeoutOpportunityFactType, eligibleTeams: Array<"HOME" | "AWAY">): TimeoutOpportunityProjection { return { status: "OPEN", eligibleTeams, sourceEventId: eventId, sourceSeq: seq, sourceFactType: factType, ruleProfileId: "FIBA_2024" }; }
function opposite(side: "HOME" | "AWAY") { return side === "HOME" ? "AWAY" as const : "HOME" as const; }
function normalizeTimeoutOpportunity(value: unknown): TimeoutOpportunityProjection {
  if (!value || typeof value !== "object") return unknownTimeoutOpportunity();
  const candidate = value as Partial<TimeoutOpportunityProjection>;
  if (candidate.status !== "OPEN" && candidate.status !== "CLOSED" && candidate.status !== "UNKNOWN") return unknownTimeoutOpportunity();
  return { status: candidate.status, eligibleTeams: candidate.status === "OPEN" && Array.isArray(candidate.eligibleTeams) ? candidate.eligibleTeams.filter((side): side is "HOME" | "AWAY" => side === "HOME" || side === "AWAY") : [], sourceEventId: typeof candidate.sourceEventId === "string" ? candidate.sourceEventId : null, sourceSeq: typeof candidate.sourceSeq === "number" ? candidate.sourceSeq : null, sourceFactType: candidate.sourceFactType ?? null, ruleProfileId: "FIBA_2024" };
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTeamFoulCount(value: unknown): TeamFoulCount {
  if (!value || typeof value !== "object") {
    return { home: 0, away: 0 };
  }

  const candidate = value as Partial<Record<keyof TeamFoulCount, unknown>>;
  return {
    home: numberOrDefault(candidate.home, 0),
    away: numberOrDefault(candidate.away, 0)
  };
}

function normalizeLifecycleStatus(value: unknown): MatchLifecycleStatus {
  return value === "SCHEDULED" ||
    value === "READY" ||
    value === "LIVE" ||
    value === "PERIOD_BREAK" ||
    value === "OVERTIME" ||
    value === "FINISHED" ||
    value === "FINAL"
    ? value
    : "SCHEDULED";
}

function isFinishedStatus(status: MatchLifecycleStatus) {
  return status === "FINISHED" || status === "FINAL";
}

function recomputeFinalOutcomeIfFinished(projection: ScoreboardProjection): ScoreboardProjection {
  return isFinishedStatus(projection.status)
    ? { ...projection, ...deriveFinalOutcome(projection.homeScore, projection.awayScore) }
    : projection;
}

function withRecentAction(
  projection: ScoreboardProjection,
  eventType: Parameters<typeof applyInternalRecentActionEvent>[1],
  payload: unknown,
  seqNo: number
): ScoreboardProjection {
  return {
    ...projection,
    recentActionState: applyInternalRecentActionEvent(projection.recentActionState, eventType, payload, seqNo)
  };
}

function normalizeFinalScore(value: unknown): ScoreboardProjection["finalScore"] {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { home?: unknown; away?: unknown };
  return {
    home: numberOrDefault(candidate.home, 0),
    away: numberOrDefault(candidate.away, 0)
  };
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function normalizeTeamFoulsByPeriod(value: unknown): Record<string, TeamFoulCount> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([period, fouls]) => [
      period,
      normalizeTeamFoulCount(fouls)
    ])
  );
}

function createDefaultTimeouts() {
  return {
    home: { used: 0, remaining: 5 },
    away: { used: 0, remaining: 5 }
  };
}

function normalizeTimeouts(value: unknown): { home: TimeoutCount; away: TimeoutCount } {
  if (!value || typeof value !== "object") {
    return createDefaultTimeouts();
  }

  const candidate = value as { home?: Partial<TimeoutCount>; away?: Partial<TimeoutCount> };
  const homeUsed = numberOrDefault(candidate.home?.used, 0);
  const awayUsed = numberOrDefault(candidate.away?.used, 0);
  return {
    home: {
      used: homeUsed,
      remaining: numberOrDefault(candidate.home?.remaining, Math.max(0, 5 - homeUsed))
    },
    away: {
      used: awayUsed,
      remaining: numberOrDefault(candidate.away?.remaining, Math.max(0, 5 - awayUsed))
    }
  };
}

function createDefaultTimeoutsByHalf() {
  return {
    firstHalf: { home: 0, away: 0 },
    secondHalf: { home: 0, away: 0 },
    overtime: { home: 0, away: 0 }
  };
}

function normalizeTimeoutsByHalf(value: unknown) {
  if (!value || typeof value !== "object") {
    return createDefaultTimeoutsByHalf();
  }

  const candidate = value as Record<string, unknown>;
  return {
    firstHalf: normalizeTimeoutBySide(candidate.firstHalf),
    secondHalf: normalizeTimeoutBySide(candidate.secondHalf),
    overtime: normalizeTimeoutBySide(candidate.overtime)
  };
}

function normalizeTimeoutBySide(value: unknown): TimeoutBySide {
  if (!value || typeof value !== "object") {
    return { home: 0, away: 0 };
  }
  const candidate = value as Partial<Record<keyof TimeoutBySide, unknown>>;
  return {
    home: numberOrDefault(candidate.home, 0),
    away: numberOrDefault(candidate.away, 0)
  };
}

function normalizeActiveTimeout(value: unknown): ScoreboardProjection["activeTimeout"] {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<NonNullable<ScoreboardProjection["activeTimeout"]>>;
  if (candidate.teamSide !== "HOME" && candidate.teamSide !== "AWAY") {
    return null;
  }

  return {
    teamSide: candidate.teamSide,
    startedAt: typeof candidate.startedAt === "string" ? candidate.startedAt : new Date(0).toISOString(),
    durationMs: numberOrDefault(candidate.durationMs, 60000),
    remainingMs: numberOrDefault(candidate.remainingMs, 60000),
    requestedBy: normalizeRequestedBy(candidate.requestedBy)
  };
}

function normalizeRequestedBy(value: unknown): TimeoutRequestedBy {
  return value === "HEAD_COACH" ||
    value === "ASSISTANT_COACH" ||
    value === "BENCH" ||
    value === "OFFICIAL" ||
    value === "OTHER"
    ? value
    : "OTHER";
}

function getHalfKey(periodNumber: number): keyof ReturnType<typeof createDefaultTimeoutsByHalf> {
  if (periodNumber <= 2) return "firstHalf";
  if (periodNumber <= 4) return "secondHalf";
  return "overtime";
}

function normalizeClockState(value: unknown, fallbackRemainingMs: number): ClockState {
  if (!value || typeof value !== "object") {
    return {
      remainingMs: fallbackRemainingMs,
      running: false,
      lastStartedAt: null
    };
  }

  const candidate = value as { remainingMs?: unknown; running?: unknown; lastStartedAt?: unknown };
  return {
    remainingMs: numberOrDefault(candidate.remainingMs, fallbackRemainingMs),
    running: candidate.running === true,
    lastStartedAt: typeof candidate.lastStartedAt === "string" ? candidate.lastStartedAt : null
  };
}

function deriveStoppedClockRemainingMs(clock: ClockState, stoppedAt: string) {
  if (!clock.running || !clock.lastStartedAt) {
    return Math.max(0, clock.remainingMs);
  }

  const startedAtMs = Date.parse(clock.lastStartedAt);
  const stoppedAtMs = Date.parse(stoppedAt);

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(stoppedAtMs)) {
    return Math.max(0, clock.remainingMs);
  }

  return Math.max(0, clock.remainingMs - Math.max(0, stoppedAtMs - startedAtMs));
}
