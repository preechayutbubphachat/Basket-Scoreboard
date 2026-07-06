import type {
  PlayerFoulAddedPayload,
  ScoreAddedPayload,
  TeamFoulAddedPayload,
  TimeoutEndedPayload,
  TimeoutGrantedPayload,
  TimeoutRequestedBy
} from "@basket-scoreboard/api-contracts";

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

export type PlayerFoulProjection = {
  playerId: string;
  teamSide: "HOME" | "AWAY";
  playerName: string | null;
  jerseyNumber: string | null;
  fouls: number;
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
};

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
    projectionVersion: "scoreboard-v1"
  };
}

export function normalizeScoreboardProjection(
  projection: Partial<ScoreboardProjection> & { matchId: string }
): ScoreboardProjection {
  const periodNumber = numberOrDefault(projection.periodNumber, 1);
  const gameClock = normalizeClockState(projection.gameClock, numberOrDefault(projection.gameClockRemainingMs, 600000));
  const shotClock = normalizeClockState(projection.shotClock, numberOrDefault(projection.shotClockRemainingMs, 24000));
  return {
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
            fouls: numberOrDefault(player.fouls, 0)
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
    gameClock: {
      ...projection.gameClock,
      remainingMs: payload.gameClockRemainingMs
    },
    status: "LIVE",
    currentSeq: seqNo
  };
}

export function applyGameClockStarted(
  projection: ScoreboardProjection,
  payload: { startedAt: string; remainingMsBeforeStart: number },
  seqNo: number
): ScoreboardProjection {
  const shotClockRemainingMs = Math.max(0, projection.shotClock.remainingMs);
  const shotClockRunning = shotClockRemainingMs > 0;

  return {
    ...projection,
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

  return {
    ...projection,
    teamFouls: nextPeriodFouls,
    teamFoulsByPeriod: {
      ...projection.teamFoulsByPeriod,
      [periodKey]: nextPeriodFouls
    },
    periodNumber: payload.periodNumber,
    status: "LIVE",
    currentSeq: seqNo
  };
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
  const playerFouls = existing
    ? nextProjection.playerFouls.map((player) =>
        player.playerId === payload.playerId
          ? { ...player, fouls: player.fouls + 1 }
          : player
      )
    : [
        ...nextProjection.playerFouls,
        {
          playerId: payload.playerId,
          teamSide: payload.teamSide,
          playerName: payload.playerName,
          jerseyNumber: payload.jerseyNumber,
          fouls: 1
        }
      ];

  return {
    ...nextProjection,
    playerFouls
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

  return {
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
  };
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
  seqNo: number
): ScoreboardProjection {
  return {
    ...projection,
    status: "LIVE",
    periodNumber: payload.periodNumber,
    periodType: payload.periodType,
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
  };
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
  seqNo: number
): ScoreboardProjection {
  return {
    ...projection,
    status: "PERIOD_BREAK",
    periodNumber: payload.periodNumber,
    periodType: payload.periodType,
    currentPeriodEndedAt: payload.endedAt,
    gameClockRemainingMs: payload.gameClockRemainingMs,
    shotClockRemainingMs: payload.shotClockRemainingMs,
    gameClock: { remainingMs: payload.gameClockRemainingMs, running: false, lastStartedAt: null },
    shotClock: { remainingMs: payload.shotClockRemainingMs, running: false, lastStartedAt: null },
    clockUpdatedAt: payload.endedAt,
    activeTimeout: null,
    currentSeq: seqNo
  };
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
  seqNo: number
): ScoreboardProjection {
  return {
    ...projection,
    status: "LIVE",
    periodNumber: payload.periodNumber,
    periodType: payload.periodType,
    currentPeriodStartedAt: payload.startedAt,
    currentPeriodEndedAt: null,
    gameClockRemainingMs: payload.gameClockRemainingMs,
    shotClockRemainingMs: payload.shotClockRemainingMs,
    gameClock: { remainingMs: payload.gameClockRemainingMs, running: false, lastStartedAt: null },
    shotClock: { remainingMs: payload.shotClockRemainingMs, running: false, lastStartedAt: null },
    clockUpdatedAt: payload.startedAt,
    activeTimeout: null,
    currentSeq: seqNo
  };
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
  seqNo: number
): ScoreboardProjection {
  return {
    ...projection,
    status: "OVERTIME",
    periodNumber: payload.periodNumber,
    periodType: payload.periodType,
    currentPeriodStartedAt: payload.startedAt,
    currentPeriodEndedAt: null,
    gameClockRemainingMs: payload.gameClockRemainingMs,
    shotClockRemainingMs: payload.shotClockRemainingMs,
    gameClock: { remainingMs: payload.gameClockRemainingMs, running: false, lastStartedAt: null },
    shotClock: { remainingMs: payload.shotClockRemainingMs, running: false, lastStartedAt: null },
    clockUpdatedAt: payload.startedAt,
    activeTimeout: null,
    currentSeq: seqNo
  };
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
  seqNo: number
): ScoreboardProjection {
  return {
    ...projection,
    status: "FINISHED",
    matchFinishedAt: payload.finishedAt,
    finalScore: { home: payload.finalHomeScore, away: payload.finalAwayScore },
    winnerSide: payload.winnerSide,
    gameClockRemainingMs: projection.gameClock.remainingMs,
    shotClockRemainingMs: projection.shotClock.remainingMs,
    gameClock: { ...projection.gameClock, running: false, lastStartedAt: null },
    shotClock: { ...projection.shotClock, running: false, lastStartedAt: null },
    clockUpdatedAt: payload.finishedAt,
    activeTimeout: null,
    currentSeq: seqNo
  };
}

export function applyScoreRemovedByCorrection(
  projection: ScoreboardProjection,
  payload: Pick<ScoreAddedPayload, "teamSide" | "points">,
  seqNo: number
): ScoreboardProjection {
  return {
    ...projection,
    homeScore:
      payload.teamSide === "HOME" ? Math.max(0, projection.homeScore - payload.points) : projection.homeScore,
    awayScore:
      payload.teamSide === "AWAY" ? Math.max(0, projection.awayScore - payload.points) : projection.awayScore,
    currentSeq: seqNo
  };
}

export function applyScoreCorrected(
  projection: ScoreboardProjection,
  payload: Pick<ScoreAddedPayload, "teamSide" | "points">,
  seqNo: number
): ScoreboardProjection {
  return applyScoreRemovedByCorrection(projection, payload, seqNo);
}

export function applyTeamFoulCorrected(
  projection: ScoreboardProjection,
  payload: { teamSide: "HOME" | "AWAY"; periodNumber?: number | null },
  seqNo: number
): ScoreboardProjection {
  const periodKey = String(payload.periodNumber ?? projection.periodNumber);
  const currentPeriodFouls = projection.teamFoulsByPeriod[periodKey] ?? projection.teamFouls;
  const sideKey = payload.teamSide === "HOME" ? "home" : "away";
  const nextPeriodFouls = {
    ...currentPeriodFouls,
    [sideKey]: Math.max(0, currentPeriodFouls[sideKey] - 1)
  };

  return {
    ...projection,
    teamFouls: nextPeriodFouls,
    teamFoulsByPeriod: {
      ...projection.teamFoulsByPeriod,
      [periodKey]: nextPeriodFouls
    },
    currentSeq: seqNo
  };
}

export function applyPlayerFoulCorrected(
  projection: ScoreboardProjection,
  payload: { teamSide: "HOME" | "AWAY"; playerId: string; periodNumber?: number | null },
  seqNo: number
): ScoreboardProjection {
  const nextProjection = applyTeamFoulCorrected(projection, payload, seqNo);

  return {
    ...nextProjection,
    playerFouls: nextProjection.playerFouls.map((player) =>
      player.playerId === payload.playerId
        ? { ...player, fouls: Math.max(0, player.fouls - 1) }
        : player
    )
  };
}

export function applyTimeoutCorrected(
  projection: ScoreboardProjection,
  payload: { teamSide?: "HOME" | "AWAY" | null; periodNumber?: number | null },
  seqNo: number
): ScoreboardProjection {
  if (!payload.teamSide) {
    return advanceProjectionSeq({ ...projection, activeTimeout: null }, seqNo);
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

  return {
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
  };
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
