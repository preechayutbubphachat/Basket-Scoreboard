import {
  normalizeBrandAssetReference,
  type DisplayBackgroundStyle,
  type DisplayColors,
  type MatchDisplayOverrideInput,
  type MatchDisplayOverrideResponse,
  type TeamDisplayProfileInput,
  type TeamDisplayProfileResponse,
  type TournamentDisplayThemeInput,
  type TournamentDisplayThemeResponse
} from "@basket-scoreboard/api-contracts";

export type DisplayColorField =
  | "primaryColor"
  | "secondaryColor"
  | "accentColor"
  | "textColor";

export type TournamentDisplayThemeFormState = DisplayColors & {
  displayName: string;
  logoUrl: string;
  backgroundStyle: DisplayBackgroundStyle;
  showTournamentLogo: boolean;
  active: boolean;
};

export type TeamDisplayProfileFormState = DisplayColors & {
  displayName: string;
  logoUrl: string;
  showTeamLogo: boolean;
  active: boolean;
};

export type MatchDisplayOverrideFormState = {
  homePrimaryColor: string | null;
  homeSecondaryColor: string | null;
  homeAccentColor: string | null;
  homeTextColor: string | null;
  awayPrimaryColor: string | null;
  awaySecondaryColor: string | null;
  awayAccentColor: string | null;
  awayTextColor: string | null;
  showTeamLogos: boolean;
  textOnlyFallback: boolean;
  neutralHighContrast: boolean;
  emergencyOverrideEnabled: boolean;
  emergencyReason: string;
};

export type DisplayThemePreviewTeam = {
  label: string;
  logoUrl: string | null;
  showLogo: boolean;
  colors: DisplayColors;
};

export type DisplayThemePreviewModel = {
  title: string;
  backgroundStyle: DisplayBackgroundStyle;
  tournamentLogoUrl: string | null;
  showTournamentLogo: boolean;
  home: DisplayThemePreviewTeam;
  away: DisplayThemePreviewTeam;
  textOnlyFallback: boolean;
  neutralHighContrast: boolean;
};

export type DisplayThemeSaveState = {
  disabled: boolean;
  reason: "SAVING" | "MISSING_ROUTE_ID" | "VALIDATION_ERROR" | null;
};

export type LogoPreviewState = {
  showImage: boolean;
  showFallback: boolean;
};

const defaultColors: DisplayColors = {
  primaryColor: "#111827",
  secondaryColor: "#334155",
  accentColor: "#f59e0b",
  textColor: "#f8fafc"
};

const neutralHomeColors: DisplayColors = {
  primaryColor: "#020617",
  secondaryColor: "#1f2937",
  accentColor: "#f8fafc",
  textColor: "#ffffff"
};

const neutralAwayColors: DisplayColors = {
  primaryColor: "#111827",
  secondaryColor: "#374151",
  accentColor: "#e5e7eb",
  textColor: "#ffffff"
};

export const displayBackgroundStyleOptions: DisplayBackgroundStyle[] = [
  "DEFAULT_ARENA",
  "SOLID",
  "DARK_GRADIENT",
  "HIGH_CONTRAST"
];

export function buildAdminTournamentDisplayThemeLink(tournamentId: string) {
  return `/admin/tournaments/${encodeURIComponent(tournamentId)}/display-theme`;
}

export function buildAdminTeamDisplayProfileLink(teamId: string) {
  return `/admin/teams/${encodeURIComponent(teamId)}/display-profile`;
}

export function buildAdminMatchDisplayThemeLink(matchId: string) {
  return `/admin/matches/${encodeURIComponent(matchId)}/display-theme`;
}

export function createTournamentDisplayThemeFormState(
  theme?: TournamentDisplayThemeResponse | null
): TournamentDisplayThemeFormState {
  return {
    displayName: theme?.displayName ?? "",
    logoUrl: theme?.logoUrl ?? "",
    primaryColor: theme?.primaryColor ?? null,
    secondaryColor: theme?.secondaryColor ?? null,
    accentColor: theme?.accentColor ?? null,
    textColor: theme?.textColor ?? null,
    backgroundStyle: theme?.backgroundStyle ?? "DEFAULT_ARENA",
    showTournamentLogo: theme?.showTournamentLogo ?? true,
    active: theme?.active ?? true
  };
}

export function createTeamDisplayProfileFormState(
  profile?: TeamDisplayProfileResponse | null
): TeamDisplayProfileFormState {
  return {
    displayName: profile?.displayName ?? "",
    logoUrl: profile?.logoUrl ?? "",
    primaryColor: profile?.primaryColor ?? null,
    secondaryColor: profile?.secondaryColor ?? null,
    accentColor: profile?.accentColor ?? null,
    textColor: profile?.textColor ?? null,
    showTeamLogo: profile?.showTeamLogo ?? true,
    active: profile?.active ?? true
  };
}

export function createMatchDisplayOverrideFormState(
  override?: MatchDisplayOverrideResponse | null
): MatchDisplayOverrideFormState {
  return {
    homePrimaryColor: override?.home.primaryColor ?? null,
    homeSecondaryColor: override?.home.secondaryColor ?? null,
    homeAccentColor: override?.home.accentColor ?? null,
    homeTextColor: override?.home.textColor ?? null,
    awayPrimaryColor: override?.away.primaryColor ?? null,
    awaySecondaryColor: override?.away.secondaryColor ?? null,
    awayAccentColor: override?.away.accentColor ?? null,
    awayTextColor: override?.away.textColor ?? null,
    showTeamLogos: override?.showTeamLogos ?? true,
    textOnlyFallback: override?.textOnlyFallback ?? false,
    neutralHighContrast: override?.neutralHighContrast ?? false,
    emergencyOverrideEnabled: override?.emergencyOverrideEnabled ?? false,
    emergencyReason: override?.emergencyReason ?? ""
  };
}

export function createTournamentDisplayThemePayload(
  state: TournamentDisplayThemeFormState
): TournamentDisplayThemeInput {
  return {
    displayName: emptyToNull(state.displayName),
    logoUrl: emptyToNull(state.logoUrl),
    primaryColor: normalizeColor(state.primaryColor),
    secondaryColor: normalizeColor(state.secondaryColor),
    accentColor: normalizeColor(state.accentColor),
    textColor: normalizeColor(state.textColor),
    backgroundStyle: state.backgroundStyle,
    showTournamentLogo: state.showTournamentLogo,
    active: state.active
  };
}

export function createTeamDisplayProfilePayload(state: TeamDisplayProfileFormState): TeamDisplayProfileInput {
  return {
    displayName: emptyToNull(state.displayName),
    logoUrl: emptyToNull(state.logoUrl),
    primaryColor: normalizeColor(state.primaryColor),
    secondaryColor: normalizeColor(state.secondaryColor),
    accentColor: normalizeColor(state.accentColor),
    textColor: normalizeColor(state.textColor),
    showTeamLogo: state.showTeamLogo,
    active: state.active
  };
}

export function createMatchDisplayOverridePayload(state: MatchDisplayOverrideFormState): MatchDisplayOverrideInput {
  return {
    homePrimaryColor: normalizeColor(state.homePrimaryColor),
    homeSecondaryColor: normalizeColor(state.homeSecondaryColor),
    homeAccentColor: normalizeColor(state.homeAccentColor),
    homeTextColor: normalizeColor(state.homeTextColor),
    awayPrimaryColor: normalizeColor(state.awayPrimaryColor),
    awaySecondaryColor: normalizeColor(state.awaySecondaryColor),
    awayAccentColor: normalizeColor(state.awayAccentColor),
    awayTextColor: normalizeColor(state.awayTextColor),
    showTeamLogos: state.showTeamLogos,
    textOnlyFallback: state.textOnlyFallback,
    neutralHighContrast: state.neutralHighContrast,
    emergencyOverrideEnabled: state.emergencyOverrideEnabled,
    emergencyReason: emptyToNull(state.emergencyReason)
  };
}

export function validateTournamentDisplayThemeForm(state: TournamentDisplayThemeFormState) {
  return validateSharedDisplayFields({
    displayName: state.displayName,
    displayNameMax: 120,
    logoUrl: state.logoUrl,
    colors: pickDisplayColors(state)
  });
}

export function validateTeamDisplayProfileForm(state: TeamDisplayProfileFormState) {
  return validateSharedDisplayFields({
    displayName: state.displayName,
    displayNameMax: 80,
    logoUrl: state.logoUrl,
    colors: pickDisplayColors(state)
  });
}

export function validateMatchDisplayOverrideForm(state: MatchDisplayOverrideFormState) {
  const colors: Record<string, string | null> = {
    homePrimaryColor: state.homePrimaryColor,
    homeSecondaryColor: state.homeSecondaryColor,
    homeAccentColor: state.homeAccentColor,
    homeTextColor: state.homeTextColor,
    awayPrimaryColor: state.awayPrimaryColor,
    awaySecondaryColor: state.awaySecondaryColor,
    awayAccentColor: state.awayAccentColor,
    awayTextColor: state.awayTextColor
  };

  for (const [field, value] of Object.entries(colors)) {
    if (!isValidColor(value)) {
      return `${field} must be a #RRGGBB color.`;
    }
  }

  if (state.emergencyReason.trim().length > 255) {
    return "Emergency note must be 255 characters or fewer.";
  }

  return null;
}

export function buildDisplayThemePreviewModel(input: {
  tournament?: TournamentDisplayThemeFormState | null;
  home?: TeamDisplayProfileFormState | null;
  away?: TeamDisplayProfileFormState | null;
  match?: MatchDisplayOverrideFormState | null;
}): DisplayThemePreviewModel {
  const neutral = input.match?.neutralHighContrast ?? false;
  const textOnly = input.match?.textOnlyFallback ?? false;
  const showTeamLogos = input.match?.showTeamLogos ?? true;
  const tournament = input.tournament ?? createTournamentDisplayThemeFormState();
  const home = input.home ?? createTeamDisplayProfileFormState();
  const away = input.away ?? createTeamDisplayProfileFormState();

  return {
    title: tournament.displayName.trim() || "Display Preview",
    backgroundStyle: tournament.backgroundStyle,
    tournamentLogoUrl: normalizeBrandAssetReference(tournament.logoUrl),
    showTournamentLogo: tournament.showTournamentLogo,
    home: {
      label: home.displayName.trim() || "HOME",
      logoUrl: normalizeBrandAssetReference(home.logoUrl),
      showLogo: showTeamLogos && !textOnly && home.showTeamLogo,
      colors: neutral ? neutralHomeColors : mergeColors(defaultColors, home, {
        primaryColor: input.match?.homePrimaryColor ?? null,
        secondaryColor: input.match?.homeSecondaryColor ?? null,
        accentColor: input.match?.homeAccentColor ?? null,
        textColor: input.match?.homeTextColor ?? null
      })
    },
    away: {
      label: away.displayName.trim() || "AWAY",
      logoUrl: normalizeBrandAssetReference(away.logoUrl),
      showLogo: showTeamLogos && !textOnly && away.showTeamLogo,
      colors: neutral ? neutralAwayColors : mergeColors(defaultColors, away, {
        primaryColor: input.match?.awayPrimaryColor ?? null,
        secondaryColor: input.match?.awaySecondaryColor ?? null,
        accentColor: input.match?.awayAccentColor ?? null,
        textColor: input.match?.awayTextColor ?? null
      })
    },
    textOnlyFallback: textOnly,
    neutralHighContrast: neutral
  };
}

export function displayThemePreviewHasPrivateExposure(text: string) {
  return /commandId|correlationId|causationId|csrf|session|token|audit-log|correctionDetails|\/operator|\/admin/i.test(text);
}

export function getDisplayThemeSaveState(input: {
  saving: boolean;
  routeId: string | null | undefined;
  validationMessage: string | null;
}): DisplayThemeSaveState {
  if (input.saving) {
    return { disabled: true, reason: "SAVING" };
  }

  if (!input.routeId) {
    return { disabled: true, reason: "MISSING_ROUTE_ID" };
  }

  if (input.validationMessage) {
    return { disabled: true, reason: "VALIDATION_ERROR" };
  }

  return { disabled: false, reason: null };
}

export function getLogoPreviewState(src: string, failedSrc: string | null): LogoPreviewState {
  const failed = failedSrc === src;
  return {
    showImage: !failed,
    showFallback: failed
  };
}

function validateSharedDisplayFields(input: {
  displayName: string;
  displayNameMax: number;
  logoUrl: string;
  colors: Record<DisplayColorField, string | null>;
}) {
  if (input.displayName.trim().length > input.displayNameMax) {
    return `Display name must be ${input.displayNameMax} characters or fewer.`;
  }

  if (!isSafeLogoUrl(input.logoUrl)) {
    return "Logo must use /assets/branding/ and an approved image extension.";
  }

  for (const [field, value] of Object.entries(input.colors)) {
    if (!isValidColor(value)) {
      return `${field} must be a #RRGGBB color.`;
    }
  }

  return null;
}

function pickDisplayColors(input: DisplayColors): Record<DisplayColorField, string | null> {
  return {
    primaryColor: input.primaryColor,
    secondaryColor: input.secondaryColor,
    accentColor: input.accentColor,
    textColor: input.textColor
  };
}

function isValidColor(value: string | null | undefined) {
  if (!value || value.trim() === "") {
    return true;
  }
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function isSafeLogoUrl(value: string) {
  return value.trim() === "" || normalizeBrandAssetReference(value) !== null;
}

function emptyToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function normalizeColor(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function mergeColors(base: DisplayColors, team: DisplayColors, override: DisplayColors): DisplayColors {
  return {
    primaryColor: override.primaryColor ?? team.primaryColor ?? base.primaryColor,
    secondaryColor: override.secondaryColor ?? team.secondaryColor ?? base.secondaryColor,
    accentColor: override.accentColor ?? team.accentColor ?? base.accentColor,
    textColor: override.textColor ?? team.textColor ?? base.textColor
  };
}
