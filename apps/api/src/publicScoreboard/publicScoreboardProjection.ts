import type {
  PublicScoreboardProjection,
  ScoreboardProjection
} from "@basket-scoreboard/api-contracts";

export function toPublicScoreboardProjection(
  projection: ScoreboardProjection
): PublicScoreboardProjection {
  return {
    matchId: projection.matchId,
    ...(projection.homeTeamName !== undefined ? { homeTeamName: projection.homeTeamName } : {}),
    ...(projection.awayTeamName !== undefined ? { awayTeamName: projection.awayTeamName } : {}),
    homeScore: projection.homeScore,
    awayScore: projection.awayScore,
    teamFouls: {
      home: projection.teamFouls.home,
      away: projection.teamFouls.away
    },
    ...(projection.timeouts !== undefined
      ? {
          timeouts: {
            home: {
              used: projection.timeouts.home.used,
              remaining: projection.timeouts.home.remaining
            },
            away: {
              used: projection.timeouts.away.used,
              remaining: projection.timeouts.away.remaining
            }
          }
        }
      : {}),
    ...(projection.activeTimeout !== undefined
      ? {
          activeTimeout: projection.activeTimeout
            ? {
                teamSide: projection.activeTimeout.teamSide,
                remainingMs: projection.activeTimeout.remainingMs
              }
            : null
        }
      : {}),
    ...(projection.periodType !== undefined ? { periodType: projection.periodType } : {}),
    periodNumber: projection.periodNumber,
    gameClockRemainingMs: projection.gameClockRemainingMs,
    shotClockRemainingMs: projection.shotClockRemainingMs,
    ...(projection.gameClock !== undefined
      ? {
          gameClock: {
            remainingMs: projection.gameClock.remainingMs,
            running: projection.gameClock.running,
            lastStartedAt: projection.gameClock.lastStartedAt
          }
        }
      : {}),
    ...(projection.shotClock !== undefined
      ? {
          shotClock: {
            remainingMs: projection.shotClock.remainingMs,
            running: projection.shotClock.running,
            lastStartedAt: projection.shotClock.lastStartedAt
          }
        }
      : {}),
    ...(projection.serverTime !== undefined ? { serverTime: projection.serverTime } : {}),
    status: projection.status,
    ...(projection.finalScore !== undefined
      ? {
          finalScore: projection.finalScore
            ? { home: projection.finalScore.home, away: projection.finalScore.away }
            : null
        }
      : {}),
    ...(projection.displayTheme !== undefined ? { displayTheme: projection.displayTheme } : {})
  };
}
