import type { Pool } from "mysql2/promise";
import {
  reasonCodes,
  normalizeBrandAssetReference,
  type DisplayColors,
  type MatchDisplayOverrideInput,
  type MatchDisplayOverrideResponse,
  type PublicDisplayTheme,
  type ReasonCode,
  type TeamDisplayProfileInput,
  type TeamDisplayProfileResponse,
  type TournamentDisplayThemeInput,
  type TournamentDisplayThemeResponse
} from "@basket-scoreboard/api-contracts";
import {
  defaultMatchDisplayOverride,
  defaultTeamDisplayProfile,
  defaultTournamentDisplayTheme,
  findMatchDisplayOverride,
  findTeamDisplayProfile,
  findTournamentDisplayTheme,
  getMatchThemeContext,
  ownerExists,
  upsertMatchDisplayOverride,
  upsertTeamDisplayProfile,
  upsertTournamentDisplayTheme
} from "./displayThemeRepository.js";

type ServiceResult<T> =
  | { ok: true; statusCode: number; value: T }
  | { ok: false; statusCode: number; reasonCode: ReasonCode; message: string };

const defaultColors: DisplayColors = {
  primaryColor: null,
  secondaryColor: null,
  accentColor: null,
  textColor: null
};

const highContrastHome: DisplayColors = {
  primaryColor: "#ffffff",
  secondaryColor: "#111111",
  accentColor: "#ffd60a",
  textColor: "#ffffff"
};

const highContrastAway: DisplayColors = {
  primaryColor: "#ffffff",
  secondaryColor: "#111111",
  accentColor: "#5ac8fa",
  textColor: "#ffffff"
};

export async function getTournamentDisplayTheme(
  pool: Pool,
  tournamentId: string
): Promise<ServiceResult<TournamentDisplayThemeResponse>> {
  if (!(await ownerExists(pool, "tournament", tournamentId))) {
    return notFound("Tournament was not found");
  }

  return {
    ok: true,
    statusCode: 200,
    value: (await findTournamentDisplayTheme(pool, tournamentId)) ?? defaultTournamentDisplayTheme(tournamentId)
  };
}

export async function saveTournamentDisplayTheme(
  pool: Pool,
  tournamentId: string,
  input: TournamentDisplayThemeInput,
  userId: string
): Promise<ServiceResult<TournamentDisplayThemeResponse>> {
  if (!(await ownerExists(pool, "tournament", tournamentId))) {
    return notFound("Tournament was not found");
  }

  return {
    ok: true,
    statusCode: 200,
    value: await upsertTournamentDisplayTheme(pool, tournamentId, input, userId)
  };
}

export async function getTeamDisplayProfile(
  pool: Pool,
  teamId: string
): Promise<ServiceResult<TeamDisplayProfileResponse>> {
  if (!(await ownerExists(pool, "team", teamId))) {
    return notFound("Team was not found");
  }

  return {
    ok: true,
    statusCode: 200,
    value: (await findTeamDisplayProfile(pool, teamId)) ?? defaultTeamDisplayProfile(teamId)
  };
}

export async function saveTeamDisplayProfile(
  pool: Pool,
  teamId: string,
  input: TeamDisplayProfileInput,
  userId: string
): Promise<ServiceResult<TeamDisplayProfileResponse>> {
  if (!(await ownerExists(pool, "team", teamId))) {
    return notFound("Team was not found");
  }

  return {
    ok: true,
    statusCode: 200,
    value: await upsertTeamDisplayProfile(pool, teamId, input, userId)
  };
}

export async function getMatchDisplayOverride(
  pool: Pool,
  matchId: string
): Promise<ServiceResult<MatchDisplayOverrideResponse>> {
  if (!(await ownerExists(pool, "match", matchId))) {
    return notFound("Match was not found");
  }

  return {
    ok: true,
    statusCode: 200,
    value: (await findMatchDisplayOverride(pool, matchId)) ?? defaultMatchDisplayOverride(matchId)
  };
}

export async function saveMatchDisplayOverride(
  pool: Pool,
  matchId: string,
  input: MatchDisplayOverrideInput,
  userId: string
): Promise<ServiceResult<MatchDisplayOverrideResponse>> {
  if (!(await ownerExists(pool, "match", matchId))) {
    return notFound("Match was not found");
  }

  return {
    ok: true,
    statusCode: 200,
    value: await upsertMatchDisplayOverride(pool, matchId, input, userId)
  };
}

export async function resolvePublicDisplayTheme(pool: Pool, matchId: string): Promise<PublicDisplayTheme | null> {
  const context = await getMatchThemeContext(pool, matchId);
  if (!context) {
    return null;
  }

  const tournamentTheme = context.tournament_id
    ? (await findTournamentDisplayTheme(pool, context.tournament_id)) ?? defaultTournamentDisplayTheme(context.tournament_id)
    : null;
  const homeProfile = context.home_team_id
    ? (await findTeamDisplayProfile(pool, context.home_team_id)) ?? defaultTeamDisplayProfile(context.home_team_id)
    : null;
  const awayProfile = context.away_team_id
    ? (await findTeamDisplayProfile(pool, context.away_team_id)) ?? defaultTeamDisplayProfile(context.away_team_id)
    : null;
  const override = (await findMatchDisplayOverride(pool, matchId)) ?? defaultMatchDisplayOverride(matchId);

  const textOnlyFallback = override.textOnlyFallback;
  const neutralHighContrast = override.neutralHighContrast;
  const tournamentLogoUrl = normalizeBrandAssetReference(tournamentTheme?.logoUrl);
  const homeLogoUrl = normalizeBrandAssetReference(homeProfile?.logoUrl);
  const awayLogoUrl = normalizeBrandAssetReference(awayProfile?.logoUrl);

  return {
    tournament: {
      displayName: tournamentTheme?.active ? tournamentTheme.displayName ?? context.tournament_name : context.tournament_name,
      logoUrl: tournamentTheme?.active && tournamentTheme.showTournamentLogo && !textOnlyFallback ? tournamentLogoUrl : null,
      showLogo: Boolean(tournamentTheme?.active && tournamentTheme.showTournamentLogo && !textOnlyFallback),
      backgroundStyle: tournamentTheme?.active ? tournamentTheme.backgroundStyle : "DEFAULT_ARENA",
      colors: neutralHighContrast ? defaultColors : pickColors(tournamentTheme ?? null)
    },
    home: {
      displayName: homeProfile?.active ? homeProfile.displayName ?? context.home_team_name ?? "HOME" : context.home_team_name ?? "HOME",
      logoUrl: homeProfile?.active && homeProfile.showTeamLogo && override.showTeamLogos && !textOnlyFallback ? homeLogoUrl : null,
      showLogo: Boolean(homeProfile?.active && homeProfile.showTeamLogo && override.showTeamLogos && !textOnlyFallback),
      colors: neutralHighContrast ? highContrastHome : mergeColors(pickColors(homeProfile), override.home)
    },
    away: {
      displayName: awayProfile?.active ? awayProfile.displayName ?? context.away_team_name ?? "AWAY" : context.away_team_name ?? "AWAY",
      logoUrl: awayProfile?.active && awayProfile.showTeamLogo && override.showTeamLogos && !textOnlyFallback ? awayLogoUrl : null,
      showLogo: Boolean(awayProfile?.active && awayProfile.showTeamLogo && override.showTeamLogos && !textOnlyFallback),
      colors: neutralHighContrast ? highContrastAway : mergeColors(pickColors(awayProfile), override.away)
    },
    flags: {
      textOnlyFallback,
      neutralHighContrast
    }
  };
}

function notFound(message: string): ServiceResult<never> {
  return {
    ok: false,
    statusCode: 404,
    reasonCode: reasonCodes.MATCH_NOT_FOUND,
    message
  };
}

function pickColors(value: DisplayColors | null): DisplayColors {
  return value
    ? {
        primaryColor: value.primaryColor,
        secondaryColor: value.secondaryColor,
        accentColor: value.accentColor,
        textColor: value.textColor
      }
    : defaultColors;
}

function mergeColors(base: DisplayColors, override: DisplayColors): DisplayColors {
  return {
    primaryColor: override.primaryColor ?? base.primaryColor,
    secondaryColor: override.secondaryColor ?? base.secondaryColor,
    accentColor: override.accentColor ?? base.accentColor,
    textColor: override.textColor ?? base.textColor
  };
}
