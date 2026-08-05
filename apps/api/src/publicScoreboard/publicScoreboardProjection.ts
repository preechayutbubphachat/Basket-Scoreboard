import {
  normalizeBrandAssetReference,
  type PublicDisplayTheme,
  type PublicMatchMetadata,
  type PublicRecentAction,
  type PublicScoreboardProjection,
  type ScoreboardProjection
} from "@basket-scoreboard/api-contracts";

type PublicProjectionSource = ScoreboardProjection & {
  recentActionState?: unknown;
};

export function toPublicScoreboardProjection(
  projection: PublicProjectionSource,
  matchMetadata?: PublicMatchMetadata
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
    recentActions: toPublicRecentActions(projection.recentActionState),
    ...(projection.finalScore !== undefined
      ? {
          finalScore: projection.finalScore
            ? { home: projection.finalScore.home, away: projection.finalScore.away }
            : null
        }
      : {}),
    ...(projection.displayTheme !== undefined ? { displayTheme: sanitizePublicDisplayTheme(projection.displayTheme) } : {}),
    ...(matchMetadata && Object.keys(matchMetadata).length > 0 ? { matchMetadata: { ...matchMetadata } } : {})
  };
}

export function toPublicRecentActions(value: unknown): PublicRecentAction[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const state = value as Record<string, unknown>;
  if (
    state.version !== 1 ||
    !isSequence(state.initializedAtSeq) ||
    !Array.isArray(state.items)
  ) {
    return [];
  }

  const initializedAtSeq = state.initializedAtSeq;

  return state.items
    .slice(0, 3)
    .map((item) => toPublicRecentAction(item, initializedAtSeq))
    .filter((item): item is PublicRecentAction => item !== null);
}

function toPublicRecentAction(value: unknown, initializedAtSeq: number): PublicRecentAction | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;
  if (!isSequence(item.sourceEventSeq) || item.sourceEventSeq <= initializedAtSeq) {
    return null;
  }

  const teamSide = item.teamSide === "HOME" || item.teamSide === "AWAY"
    ? item.teamSide
    : null;

  switch (item.kind) {
    case "SCORE":
      return teamSide && (item.points === 1 || item.points === 2 || item.points === 3)
        ? { kind: "SCORE", teamSide, points: item.points }
        : null;
    case "TEAM_FOUL":
      return teamSide ? { kind: "TEAM_FOUL", teamSide } : null;
    case "TIMEOUT":
      return teamSide ? { kind: "TIMEOUT", teamSide } : null;
    case "PERIOD":
      return (
        (item.phase === "STARTED" || item.phase === "ENDED") &&
        (item.periodType === "REGULATION" || item.periodType === "OVERTIME") &&
        Number.isSafeInteger(item.periodNumber) &&
        Number(item.periodNumber) > 0
      )
        ? {
            kind: "PERIOD",
            phase: item.phase,
            periodType: item.periodType,
            periodNumber: Number(item.periodNumber)
          }
        : null;
    case "GAME_STATUS":
      return item.status === "STARTED" || item.status === "FINAL"
        ? { kind: "GAME_STATUS", status: item.status }
        : null;
    default:
      return null;
  }
}

function isSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function sanitizePublicDisplayTheme(theme: PublicDisplayTheme | null): PublicDisplayTheme | null {
  if (!theme) {
    return null;
  }

  return {
    tournament: {
      displayName: theme.tournament.displayName,
      logoUrl: normalizeBrandAssetReference(theme.tournament.logoUrl),
      showLogo: theme.tournament.showLogo,
      backgroundStyle: theme.tournament.backgroundStyle,
      colors: { ...theme.tournament.colors }
    },
    home: {
      displayName: theme.home.displayName,
      logoUrl: normalizeBrandAssetReference(theme.home.logoUrl),
      showLogo: theme.home.showLogo,
      colors: { ...theme.home.colors }
    },
    away: {
      displayName: theme.away.displayName,
      logoUrl: normalizeBrandAssetReference(theme.away.logoUrl),
      showLogo: theme.away.showLogo,
      colors: { ...theme.away.colors }
    },
    flags: {
      textOnlyFallback: theme.flags.textOnlyFallback,
      neutralHighContrast: theme.flags.neutralHighContrast
    }
  };
}
