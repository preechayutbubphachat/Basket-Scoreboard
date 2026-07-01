import type {
  PlayerFoulAddedPayload,
  ScoreAddedPayload,
  TeamFoulAddedPayload
} from "@basket-scoreboard/api-contracts";

type TeamFoulCount = { home: number; away: number };

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
    teamFouls: { home: 0, away: 0 },
    teamFoulsByPeriod: {},
    playerFouls: [],
    periodNumber: 1,
    gameClockRemainingMs: 600000,
    shotClockRemainingMs: 24000,
    status: "READY",
    currentSeq: 0,
    projectionVersion: "scoreboard-v1"
  };
}

export function normalizeScoreboardProjection(
  projection: Partial<ScoreboardProjection> & { matchId: string }
): ScoreboardProjection {
  const periodNumber = numberOrDefault(projection.periodNumber, 1);
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
    periodNumber,
    gameClockRemainingMs: numberOrDefault(projection.gameClockRemainingMs, 600000),
    shotClockRemainingMs: numberOrDefault(projection.shotClockRemainingMs, 24000),
    status:
      projection.status === "LIVE" || projection.status === "FINAL" || projection.status === "READY"
        ? projection.status
        : "READY",
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
    status: "LIVE",
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
