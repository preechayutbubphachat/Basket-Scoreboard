import { normalizeBrandAssetReference, type DisplayBackgroundStyle, type DisplayColors, type PublicDisplayTheme, type PublicScoreboardProjection } from "@basket-scoreboard/api-contracts";
import { deriveDisplayClockMs, formatClockMs, formatShotClockMs } from "./clockControl";
import { buildPublicScoreboardLink } from "./operatorMatches";
import { getRealtimeConnectionLabel, type RealtimeConnectionState } from "./realtimeProjectionSync";
import { buildScoreControlPanels } from "./scoreControl";
import { buildTimeoutControlPanels, getActiveTimeoutLabel } from "./timeoutControl";

type ResolvedDisplayColors = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
};

export function buildPublicScoreboardDisplayLink(matchId: string) {
  return `${buildPublicScoreboardLink(matchId)}/display`;
}

export function isPublicDisplayKioskMode(search: string) {
  return new URLSearchParams(search).get("kiosk") === "1";
}

export function getPublicDisplayControlsClassName(input: { kioskMode: boolean; controlsVisible: boolean }) {
  return [
    "public-display-shell",
    input.kioskMode ? "kiosk-mode" : "",
    input.controlsVisible ? "controls-visible" : "controls-hidden"
  ].filter(Boolean).join(" ");
}

export function buildPublicScoreboardDisplayModel(
  projection: PublicScoreboardProjection,
  options: {
    nowMs: number;
    receivedAtMs: number | null;
    realtimeState: RealtimeConnectionState;
  }
) {
  const theme = buildPublicDisplayThemeView(projection.displayTheme);
  const scorePanels = buildScoreControlPanels(projection);
  const [homeScorePanel, awayScorePanel] = scorePanels;
  const clock = buildPublicScoreboardClockState(projection, {
    nowMs: options.nowMs,
    receivedAtMs: options.receivedAtMs
  });
  const timeoutPanels = buildTimeoutControlPanels(projection);
  const [homeTimeoutPanel, awayTimeoutPanel] = timeoutPanels;
  const periodType = projection.periodType === "OVERTIME" ? "OT" : "REG";
  const shotClockRemainingMs = deriveDisplayClockMs({
    clock: projection.shotClock,
    fallbackRemainingMs: projection.shotClockRemainingMs ?? 24000,
    nowMs: options.nowMs,
    serverTime: projection.serverTime,
    receivedAtMs: options.receivedAtMs
  });
  const shotClockSeconds = Math.ceil(Math.max(0, shotClockRemainingMs) / 1000);
  const shotClockClassName = [
    "public-display-shot-clock",
    shotClockSeconds <= 5 ? "shot-clock-low" : "",
    shotClockSeconds <= 3 ? "shot-clock-critical" : ""
  ].filter(Boolean).join(" ");
  const receivedAt = typeof options.receivedAtMs === "number"
    ? new Date(options.receivedAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "Pending";
  const syncShortLabel = getCompactSyncLabel(options.realtimeState);

  return {
    matchId: projection.matchId,
    matchCodeLabel: null,
    arenaFrameClassName: [
      "public-display-frame",
      "arena-layout",
      `arena-background-${theme.backgroundStyle.toLowerCase().replace(/_/g, "-")}`,
      theme.flags.textOnlyFallback ? "theme-text-only" : "",
      theme.flags.neutralHighContrast ? "theme-neutral-contrast" : ""
    ].filter(Boolean).join(" "),
    arenaFrameStyle: theme.frameStyle,
    tournament: theme.tournament,
    home: {
      label: homeScorePanel?.label ?? "HOME",
      teamName: theme.home.displayName ?? homeScorePanel?.teamName ?? projection.homeTeamName ?? "HOME",
      score: homeScorePanel?.score ?? projection.homeScore,
      fouls: projection.teamFouls.home,
      timeouts: homeTimeoutPanel?.remaining ?? projection.timeouts?.home.remaining ?? 0,
      panelClassName: "public-display-team home-panel",
      scoreClassName: "public-display-score-value score-pulse",
      style: theme.home.style,
      logoUrl: theme.home.logoUrl,
      showLogo: theme.home.showLogo,
      monogram: buildTeamMonogram(theme.home.displayName ?? projection.homeTeamName ?? "HOME")
    },
    away: {
      label: awayScorePanel?.label ?? "AWAY",
      teamName: theme.away.displayName ?? awayScorePanel?.teamName ?? projection.awayTeamName ?? "AWAY",
      score: awayScorePanel?.score ?? projection.awayScore,
      fouls: projection.teamFouls.away,
      timeouts: awayTimeoutPanel?.remaining ?? projection.timeouts?.away.remaining ?? 0,
      panelClassName: "public-display-team away-panel",
      scoreClassName: "public-display-score-value score-pulse",
      style: theme.away.style,
      logoUrl: theme.away.logoUrl,
      showLogo: theme.away.showLogo,
      monogram: buildTeamMonogram(theme.away.displayName ?? projection.awayTeamName ?? "AWAY")
    },
    gameClock: {
      label: clock.gameClockLabel,
      running: clock.gameClockRunning,
      stateLabel: clock.gameClockRunning ? "Running" : "Stopped"
    },
    shotClock: {
      label: clock.shotClockLabel,
      running: clock.shotClockRunning,
      stateLabel: clock.shotClockRunning ? "Running" : "Stopped",
      seconds: shotClockSeconds,
      className: shotClockClassName
    },
    periodLabel: `${periodType} P${projection.periodNumber}`,
    statusLabel: projection.status,
    statusClassName: projection.status === "LIVE" ? "arena-live-badge is-live" : "arena-live-badge",
    activeTimeoutLabel: getActiveTimeoutLabel(projection),
    syncLabel: getRealtimeConnectionLabel(options.realtimeState),
    systemStatus: [
      { icon: "DB", label: "Projection", value: "Public" },
      { icon: "SY", label: "Sync", value: syncShortLabel },
      { icon: "WF", label: "Connection", value: syncShortLabel },
      { icon: "LS", label: "Last sync", value: receivedAt }
    ],
    recentEventTicker: "No public play updates available.",
    finalLabel: projection.status === "FINISHED" || projection.status === "FINAL"
      ? `Final ${projection.finalScore?.home ?? projection.homeScore} - ${projection.finalScore?.away ?? projection.awayScore}`
      : null
  };
}

export type PublicScoreboardDisplayModel = ReturnType<typeof buildPublicScoreboardDisplayModel>;

export function buildPublicScoreboardClockState(
  projection: PublicScoreboardProjection,
  options: { nowMs: number; receivedAtMs: number | null }
) {
  const gameClockRemainingMs = deriveDisplayClockMs({
    clock: projection.gameClock,
    fallbackRemainingMs: projection.gameClockRemainingMs,
    nowMs: options.nowMs,
    serverTime: projection.serverTime,
    receivedAtMs: options.receivedAtMs
  });
  const shotClockRemainingMs = deriveDisplayClockMs({
    clock: projection.shotClock,
    fallbackRemainingMs: projection.shotClockRemainingMs ?? 24000,
    nowMs: options.nowMs,
    serverTime: projection.serverTime,
    receivedAtMs: options.receivedAtMs
  });

  return {
    gameClockLabel: formatClockMs(gameClockRemainingMs),
    gameClockRunning: projection.gameClock?.running ?? false,
    shotClockLabel: formatShotClockMs(shotClockRemainingMs),
    shotClockRunning: projection.shotClock?.running ?? false
  };
}

export function publicScoreboardDisplayHasPrivateExposure(serializedDisplay: string) {
  return /homeTeamId|awayTeamId|playerId|playerFouls|roster|"(?:seq|sequence)"|currentSeq|lastEventSeq|seqNo|seq_no|eventSeq|eventSequence|projectionSeq|projectionSequence|last_event_seq|expectedSeq|projectionVersion|reason|actor|device|session|token|csrf|password|authorization|commandId|correlationId|causationId|audit|correctionDetails|\/operator|\/admin|audit-log|replay|corrections/i.test(serializedDisplay);
}

export function buildPublicDisplayThemeView(theme: PublicDisplayTheme | null | undefined) {
  const flags = {
    textOnlyFallback: Boolean(theme?.flags.textOnlyFallback),
    neutralHighContrast: Boolean(theme?.flags.neutralHighContrast)
  };
  const tournamentColors = flags.neutralHighContrast ? defaultTournamentColors : theme?.tournament.colors;
  const backgroundStyle = theme?.tournament.backgroundStyle ?? "DEFAULT_ARENA";

  return {
    backgroundStyle,
    frameStyle: {
      "--arena-bg": getSafeColor(tournamentColors?.primaryColor, "#080d17"),
      "--arena-bg-secondary": getSafeColor(tournamentColors?.secondaryColor, "#101827"),
      "--arena-accent": getSafeColor(tournamentColors?.accentColor, "#facc15"),
      "--arena-text": getSafeColor(tournamentColors?.textColor, "#f8fafc")
    },
    tournament: {
      displayName: cleanDisplayName(theme?.tournament.displayName),
      logoUrl: flags.textOnlyFallback ? null : cleanLogoUrl(theme?.tournament.logoUrl),
      showLogo: Boolean(!flags.textOnlyFallback && theme?.tournament.showLogo && theme.tournament.logoUrl)
    },
    home: buildTeamTheme(theme?.home, defaultHomeColors, flags),
    away: buildTeamTheme(theme?.away, defaultAwayColors, flags),
    flags
  };
}

function buildTeamTheme(
  team: PublicDisplayTheme["home"] | PublicDisplayTheme["away"] | null | undefined,
  defaultColors: ResolvedDisplayColors,
  flags: { textOnlyFallback: boolean; neutralHighContrast: boolean }
) {
  const colors = flags.neutralHighContrast ? defaultColors : mergeDisplayColors(defaultColors, team?.colors);

  return {
    displayName: cleanDisplayName(team?.displayName),
    logoUrl: flags.textOnlyFallback ? null : cleanLogoUrl(team?.logoUrl),
    showLogo: Boolean(!flags.textOnlyFallback && team?.showLogo && team.logoUrl),
    style: {
      "--team-primary": colors.primaryColor,
      "--team-secondary": colors.secondaryColor,
      "--team-accent": colors.accentColor,
      "--team-text": colors.textColor,
      "--score-color": fixedScoreColor
    }
  };
}

function mergeDisplayColors(defaults: ResolvedDisplayColors, colors: DisplayColors | null | undefined): ResolvedDisplayColors {
  return {
    primaryColor: getSafeColor(colors?.primaryColor, defaults.primaryColor),
    secondaryColor: getSafeColor(colors?.secondaryColor, defaults.secondaryColor),
    accentColor: getSafeColor(colors?.accentColor, defaults.accentColor),
    textColor: getSafeColor(colors?.textColor, defaults.textColor)
  };
}

function getSafeColor(value: string | null | undefined, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function cleanDisplayName(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function cleanLogoUrl(value: string | null | undefined) {
  return normalizeBrandAssetReference(value);
}

function buildTeamMonogram(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1
    ? `${words[0]?.[0] ?? ""}${words[words.length - 1]?.[0] ?? ""}`
    : value.trim().slice(0, 2);
  return letters.toLocaleUpperCase().slice(0, 2) || "--";
}

const defaultTournamentColors: ResolvedDisplayColors = {
  primaryColor: "#080d17",
  secondaryColor: "#101827",
  accentColor: "#facc15",
  textColor: "#f8fafc"
};

const defaultHomeColors: ResolvedDisplayColors = {
  primaryColor: "#38bdf8",
  secondaryColor: "#101827",
  accentColor: "#38bdf8",
  textColor: "#f8fafc"
};

const defaultAwayColors: ResolvedDisplayColors = {
  primaryColor: "#f97316",
  secondaryColor: "#101827",
  accentColor: "#f97316",
  textColor: "#f8fafc"
};

const fixedScoreColor = "#f8fafc";

function getCompactSyncLabel(state: RealtimeConnectionState) {
  switch (state) {
    case "CONNECTED":
      return "Live";
    case "RECONNECTING":
      return "Rejoin";
    case "UNAVAILABLE":
      return "Offline";
    case "POLLING_FALLBACK":
      return "Poll";
  }
}
