import type { ScoreboardProjection } from "@basket-scoreboard/api-contracts";
import { buildClockControlState, deriveDisplayClockMs } from "./clockControl";
import { buildPublicScoreboardLink } from "./operatorMatches";
import { getRealtimeConnectionLabel, type RealtimeConnectionState } from "./realtimeProjectionSync";
import { buildScoreControlPanels } from "./scoreControl";
import { buildTimeoutControlPanels, getActiveTimeoutLabel } from "./timeoutControl";

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
  projection: ScoreboardProjection,
  options: {
    nowMs: number;
    receivedAtMs: number | null;
    realtimeState: RealtimeConnectionState;
  }
) {
  const scorePanels = buildScoreControlPanels(projection);
  const [homeScorePanel, awayScorePanel] = scorePanels;
  const clock = buildClockControlState(projection, {
    nowMs: options.nowMs,
    receivedAtMs: options.receivedAtMs
  });
  const timeoutPanels = buildTimeoutControlPanels(projection);
  const [homeTimeoutPanel, awayTimeoutPanel] = timeoutPanels;
  const periodType = projection.periodType === "OVERTIME" ? "OT" : "REG";
  const seq = projection.lastEventSeq ?? projection.currentSeq;
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
    home: {
      label: homeScorePanel?.label ?? "HOME",
      teamName: homeScorePanel?.teamName ?? projection.homeTeamName ?? projection.homeTeamId ?? "HOME",
      score: homeScorePanel?.score ?? projection.homeScore,
      fouls: projection.teamFouls.home,
      timeouts: homeTimeoutPanel?.remaining ?? projection.timeouts?.home.remaining ?? 0,
      panelClassName: "public-display-team home-panel",
      scoreClassName: "public-display-score-value score-pulse"
    },
    away: {
      label: awayScorePanel?.label ?? "AWAY",
      teamName: awayScorePanel?.teamName ?? projection.awayTeamName ?? projection.awayTeamId ?? "AWAY",
      score: awayScorePanel?.score ?? projection.awayScore,
      fouls: projection.teamFouls.away,
      timeouts: awayTimeoutPanel?.remaining ?? projection.timeouts?.away.remaining ?? 0,
      panelClassName: "public-display-team away-panel",
      scoreClassName: "public-display-score-value score-pulse"
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
    activeTimeoutLabel: getActiveTimeoutLabel(projection),
    seqLabel: `Seq ${seq}`,
    syncLabel: getRealtimeConnectionLabel(options.realtimeState),
    systemStatus: [
      { icon: "DB", label: "Projection", value: "Public" },
      { icon: "SY", label: "Sync", value: syncShortLabel },
      { icon: "WF", label: "Connection", value: syncShortLabel },
      { icon: "SQ", label: "Seq", value: String(seq) },
      { icon: "LS", label: "Last sync", value: receivedAt }
    ],
    recentEventTicker: "Recent play updates appear here after the public projection changes.",
    finalLabel: projection.status === "FINISHED" || projection.status === "FINAL"
      ? `Final ${projection.finalScore?.home ?? projection.homeScore} - ${projection.finalScore?.away ?? projection.awayScore}`
      : null
  };
}

export function publicScoreboardDisplayHasPrivateExposure(serializedDisplay: string) {
  return /reason|actor|device|session|token|csrf|password|authorization|commandId|correlationId|causationId|audit|correctionDetails|\/operator|\/admin|audit-log|replay|corrections/i.test(serializedDisplay);
}

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
