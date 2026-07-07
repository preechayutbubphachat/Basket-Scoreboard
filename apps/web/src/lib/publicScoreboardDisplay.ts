import type { ScoreboardProjection } from "@basket-scoreboard/api-contracts";
import { buildClockControlState } from "./clockControl";
import { buildPublicScoreboardLink } from "./operatorMatches";
import { getRealtimeConnectionLabel, type RealtimeConnectionState } from "./realtimeProjectionSync";
import { buildScoreControlPanels } from "./scoreControl";
import { buildTimeoutControlPanels, getActiveTimeoutLabel } from "./timeoutControl";

export function buildPublicScoreboardDisplayLink(matchId: string) {
  return `${buildPublicScoreboardLink(matchId)}/display`;
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

  return {
    matchId: projection.matchId,
    home: {
      label: homeScorePanel?.label ?? "HOME",
      teamName: homeScorePanel?.teamName ?? projection.homeTeamName ?? projection.homeTeamId ?? "HOME",
      score: homeScorePanel?.score ?? projection.homeScore,
      fouls: projection.teamFouls.home,
      timeouts: homeTimeoutPanel?.remaining ?? projection.timeouts?.home.remaining ?? 0
    },
    away: {
      label: awayScorePanel?.label ?? "AWAY",
      teamName: awayScorePanel?.teamName ?? projection.awayTeamName ?? projection.awayTeamId ?? "AWAY",
      score: awayScorePanel?.score ?? projection.awayScore,
      fouls: projection.teamFouls.away,
      timeouts: awayTimeoutPanel?.remaining ?? projection.timeouts?.away.remaining ?? 0
    },
    gameClock: {
      label: clock.gameClockLabel,
      running: clock.gameClockRunning,
      stateLabel: clock.gameClockRunning ? "Running" : "Stopped"
    },
    shotClock: {
      label: clock.shotClockLabel,
      running: clock.shotClockRunning,
      stateLabel: clock.shotClockRunning ? "Running" : "Stopped"
    },
    periodLabel: `${periodType} P${projection.periodNumber}`,
    statusLabel: projection.status,
    activeTimeoutLabel: getActiveTimeoutLabel(projection),
    seqLabel: `Seq ${seq}`,
    syncLabel: getRealtimeConnectionLabel(options.realtimeState),
    finalLabel: projection.status === "FINISHED" || projection.status === "FINAL"
      ? `Final ${projection.finalScore?.home ?? projection.homeScore} - ${projection.finalScore?.away ?? projection.awayScore}`
      : null
  };
}

export function publicScoreboardDisplayHasPrivateExposure(serializedDisplay: string) {
  return /reason|actor|device|session|token|csrf|password|authorization|commandId|correlationId|causationId|audit|correctionDetails|\/operator|\/admin|audit-log|replay|corrections/i.test(serializedDisplay);
}
