import type { Pool, RowDataPacket } from "mysql2/promise";
import type {
  DisplayBackgroundStyle,
  MatchDisplayOverrideInput,
  MatchDisplayOverrideResponse,
  TeamDisplayProfileInput,
  TeamDisplayProfileResponse,
  TournamentDisplayThemeInput,
  TournamentDisplayThemeResponse
} from "@basket-scoreboard/api-contracts";

export type ThemeOwnerKind = "tournament" | "team" | "match";

type TournamentThemeRow = RowDataPacket & {
  tournament_id: string;
  display_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  text_color: string | null;
  background_style: DisplayBackgroundStyle;
  show_tournament_logo: number | boolean;
  active: number | boolean;
};

type TeamProfileRow = RowDataPacket & {
  team_id: string;
  display_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  text_color: string | null;
  show_team_logo: number | boolean;
  active: number | boolean;
};

type MatchOverrideRow = RowDataPacket & {
  match_id: string;
  home_primary_color: string | null;
  home_secondary_color: string | null;
  home_accent_color: string | null;
  home_text_color: string | null;
  away_primary_color: string | null;
  away_secondary_color: string | null;
  away_accent_color: string | null;
  away_text_color: string | null;
  show_team_logos: number | boolean;
  text_only_fallback: number | boolean;
  neutral_high_contrast: number | boolean;
  emergency_override_enabled: number | boolean;
  emergency_reason: string | null;
};

type MatchThemeContextRow = RowDataPacket & {
  match_id: string;
  tournament_id: string | null;
  tournament_name: string | null;
  home_team_id: string | null;
  home_team_name: string | null;
  away_team_id: string | null;
  away_team_name: string | null;
};

export async function ownerExists(pool: Pool, kind: ThemeOwnerKind, ownerId: string) {
  const tableByKind = {
    tournament: { tableName: "tournaments", idColumn: "tournament_id" },
    team: { tableName: "teams", idColumn: "team_id" },
    match: { tableName: "matches", idColumn: "match_id" }
  } satisfies Record<ThemeOwnerKind, { tableName: string; idColumn: string }>;
  const owner = tableByKind[kind];
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${owner.idColumn} FROM ${owner.tableName} WHERE ${owner.idColumn} = ? LIMIT 1`,
    [ownerId]
  );

  return rows.length > 0;
}

export async function findTournamentDisplayTheme(pool: Pool, tournamentId: string) {
  const [rows] = await pool.query<TournamentThemeRow[]>(
    `SELECT
       tournament_id,
       display_name,
       logo_url,
       primary_color,
       secondary_color,
       accent_color,
       text_color,
       background_style,
       show_tournament_logo,
       active
     FROM tournament_display_themes
     WHERE tournament_id = ?
     LIMIT 1`,
    [tournamentId]
  );

  return rows[0] ? serializeTournamentTheme(rows[0]) : null;
}

export async function upsertTournamentDisplayTheme(
  pool: Pool,
  tournamentId: string,
  input: TournamentDisplayThemeInput,
  userId: string
) {
  await pool.query(
    `INSERT INTO tournament_display_themes (
       tournament_id,
       display_name,
       logo_url,
       primary_color,
       secondary_color,
       accent_color,
       text_color,
       background_style,
       show_tournament_logo,
       active,
       created_by_user_id,
       updated_by_user_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       display_name = VALUES(display_name),
       logo_url = VALUES(logo_url),
       primary_color = VALUES(primary_color),
       secondary_color = VALUES(secondary_color),
       accent_color = VALUES(accent_color),
       text_color = VALUES(text_color),
       background_style = VALUES(background_style),
       show_tournament_logo = VALUES(show_tournament_logo),
       active = VALUES(active),
       updated_by_user_id = VALUES(updated_by_user_id)`,
    [
      tournamentId,
      input.displayName ?? null,
      input.logoUrl ?? null,
      input.primaryColor ?? null,
      input.secondaryColor ?? null,
      input.accentColor ?? null,
      input.textColor ?? null,
      input.backgroundStyle,
      input.showTournamentLogo ? 1 : 0,
      input.active ? 1 : 0,
      userId,
      userId
    ]
  );

  return (await findTournamentDisplayTheme(pool, tournamentId))!;
}

export async function findTeamDisplayProfile(pool: Pool, teamId: string) {
  const [rows] = await pool.query<TeamProfileRow[]>(
    `SELECT
       team_id,
       display_name,
       logo_url,
       primary_color,
       secondary_color,
       accent_color,
       text_color,
       show_team_logo,
       active
     FROM team_display_profiles
     WHERE team_id = ?
     LIMIT 1`,
    [teamId]
  );

  return rows[0] ? serializeTeamProfile(rows[0]) : null;
}

export async function upsertTeamDisplayProfile(
  pool: Pool,
  teamId: string,
  input: TeamDisplayProfileInput,
  userId: string
) {
  await pool.query(
    `INSERT INTO team_display_profiles (
       team_id,
       display_name,
       logo_url,
       primary_color,
       secondary_color,
       accent_color,
       text_color,
       show_team_logo,
       active,
       created_by_user_id,
       updated_by_user_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       display_name = VALUES(display_name),
       logo_url = VALUES(logo_url),
       primary_color = VALUES(primary_color),
       secondary_color = VALUES(secondary_color),
       accent_color = VALUES(accent_color),
       text_color = VALUES(text_color),
       show_team_logo = VALUES(show_team_logo),
       active = VALUES(active),
       updated_by_user_id = VALUES(updated_by_user_id)`,
    [
      teamId,
      input.displayName ?? null,
      input.logoUrl ?? null,
      input.primaryColor ?? null,
      input.secondaryColor ?? null,
      input.accentColor ?? null,
      input.textColor ?? null,
      input.showTeamLogo ? 1 : 0,
      input.active ? 1 : 0,
      userId,
      userId
    ]
  );

  return (await findTeamDisplayProfile(pool, teamId))!;
}

export async function findMatchDisplayOverride(pool: Pool, matchId: string) {
  const [rows] = await pool.query<MatchOverrideRow[]>(
    `SELECT
       match_id,
       home_primary_color,
       home_secondary_color,
       home_accent_color,
       home_text_color,
       away_primary_color,
       away_secondary_color,
       away_accent_color,
       away_text_color,
       show_team_logos,
       text_only_fallback,
       neutral_high_contrast,
       emergency_override_enabled,
       emergency_reason
     FROM match_display_overrides
     WHERE match_id = ?
     LIMIT 1`,
    [matchId]
  );

  return rows[0] ? serializeMatchOverride(rows[0]) : null;
}

export async function upsertMatchDisplayOverride(
  pool: Pool,
  matchId: string,
  input: MatchDisplayOverrideInput,
  userId: string
) {
  await pool.query(
    `INSERT INTO match_display_overrides (
       match_id,
       home_primary_color,
       home_secondary_color,
       home_accent_color,
       home_text_color,
       away_primary_color,
       away_secondary_color,
       away_accent_color,
       away_text_color,
       show_team_logos,
       text_only_fallback,
       neutral_high_contrast,
       emergency_override_enabled,
       emergency_reason,
       created_by_user_id,
       updated_by_user_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       home_primary_color = VALUES(home_primary_color),
       home_secondary_color = VALUES(home_secondary_color),
       home_accent_color = VALUES(home_accent_color),
       home_text_color = VALUES(home_text_color),
       away_primary_color = VALUES(away_primary_color),
       away_secondary_color = VALUES(away_secondary_color),
       away_accent_color = VALUES(away_accent_color),
       away_text_color = VALUES(away_text_color),
       show_team_logos = VALUES(show_team_logos),
       text_only_fallback = VALUES(text_only_fallback),
       neutral_high_contrast = VALUES(neutral_high_contrast),
       emergency_override_enabled = VALUES(emergency_override_enabled),
       emergency_reason = VALUES(emergency_reason),
       updated_by_user_id = VALUES(updated_by_user_id)`,
    [
      matchId,
      input.homePrimaryColor ?? null,
      input.homeSecondaryColor ?? null,
      input.homeAccentColor ?? null,
      input.homeTextColor ?? null,
      input.awayPrimaryColor ?? null,
      input.awaySecondaryColor ?? null,
      input.awayAccentColor ?? null,
      input.awayTextColor ?? null,
      input.showTeamLogos ? 1 : 0,
      input.textOnlyFallback ? 1 : 0,
      input.neutralHighContrast ? 1 : 0,
      input.emergencyOverrideEnabled ? 1 : 0,
      input.emergencyReason ?? null,
      userId,
      userId
    ]
  );

  return (await findMatchDisplayOverride(pool, matchId))!;
}

export async function getMatchThemeContext(pool: Pool, matchId: string) {
  const [rows] = await pool.query<MatchThemeContextRow[]>(
    `SELECT
       m.match_id,
       m.tournament_id,
       t.name AS tournament_name,
       m.home_team_id,
       home.name AS home_team_name,
       m.away_team_id,
       away.name AS away_team_name
     FROM matches m
     LEFT JOIN tournaments t ON t.tournament_id = m.tournament_id
     LEFT JOIN teams home ON home.team_id = m.home_team_id
     LEFT JOIN teams away ON away.team_id = m.away_team_id
     WHERE m.match_id = ?
     LIMIT 1`,
    [matchId]
  );

  return rows[0] ?? null;
}

export function defaultTournamentDisplayTheme(tournamentId: string): TournamentDisplayThemeResponse {
  return {
    tournamentId,
    displayName: null,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    accentColor: null,
    textColor: null,
    backgroundStyle: "DEFAULT_ARENA",
    showTournamentLogo: true,
    active: true
  };
}

export function defaultTeamDisplayProfile(teamId: string): TeamDisplayProfileResponse {
  return {
    teamId,
    displayName: null,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    accentColor: null,
    textColor: null,
    showTeamLogo: true,
    active: true
  };
}

export function defaultMatchDisplayOverride(matchId: string): MatchDisplayOverrideResponse {
  return {
    matchId,
    home: nullColors(),
    away: nullColors(),
    showTeamLogos: true,
    textOnlyFallback: false,
    neutralHighContrast: false,
    emergencyOverrideEnabled: false,
    emergencyReason: null
  };
}

function serializeTournamentTheme(row: TournamentThemeRow): TournamentDisplayThemeResponse {
  return {
    tournamentId: row.tournament_id,
    displayName: row.display_name,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    accentColor: row.accent_color,
    textColor: row.text_color,
    backgroundStyle: row.background_style,
    showTournamentLogo: Boolean(row.show_tournament_logo),
    active: Boolean(row.active)
  };
}

function serializeTeamProfile(row: TeamProfileRow): TeamDisplayProfileResponse {
  return {
    teamId: row.team_id,
    displayName: row.display_name,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    accentColor: row.accent_color,
    textColor: row.text_color,
    showTeamLogo: Boolean(row.show_team_logo),
    active: Boolean(row.active)
  };
}

function serializeMatchOverride(row: MatchOverrideRow): MatchDisplayOverrideResponse {
  return {
    matchId: row.match_id,
    home: {
      primaryColor: row.home_primary_color,
      secondaryColor: row.home_secondary_color,
      accentColor: row.home_accent_color,
      textColor: row.home_text_color
    },
    away: {
      primaryColor: row.away_primary_color,
      secondaryColor: row.away_secondary_color,
      accentColor: row.away_accent_color,
      textColor: row.away_text_color
    },
    showTeamLogos: Boolean(row.show_team_logos),
    textOnlyFallback: Boolean(row.text_only_fallback),
    neutralHighContrast: Boolean(row.neutral_high_contrast),
    emergencyOverrideEnabled: Boolean(row.emergency_override_enabled),
    emergencyReason: row.emergency_reason
  };
}

function nullColors() {
  return {
    primaryColor: null,
    secondaryColor: null,
    accentColor: null,
    textColor: null
  };
}
