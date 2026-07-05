import type { CommandResult, LifecycleCommandPayload, MatchReadiness, ScoreboardProjection } from "@basket-scoreboard/api-contracts";
import {
  buildOperatorMatchClockLink,
  buildOperatorMatchFoulsLink,
  buildOperatorMatchScoreLink,
  buildOperatorMatchTimeoutsLink,
  buildPublicScoreboardLink
} from "./operatorMatches";

export type LifecycleAction =
  | "startMatch"
  | "endPeriod"
  | "startNextPeriod"
  | "startOvertime"
  | "finishMatch";

export type MatchStartChecklistStatus = "READY" | "WARNING" | "MISSING" | "NOT_APPLICABLE";

export type MatchStartChecklistItem = {
  key: "officials" | "roster" | "lineup" | "clock_config" | "public_scoreboard";
  label: string;
  status: MatchStartChecklistStatus;
  message: string;
  actionLabel: string | null;
  actionUrl: string | null;
};

export function buildLifecycleControlState(projection: ScoreboardProjection) {
  const homeName = projection.homeTeamName ?? "HOME";
  const awayName = projection.awayTeamName ?? "AWAY";
  const periodType = projection.periodType ?? "REGULATION";
  const finalScore = projection.finalScore ?? null;
  return {
    status: projection.status,
    periodNumber: projection.periodNumber ?? projection.period ?? 1,
    periodType,
    expectedSeq: projection.currentSeq,
    scoreLabel: `${homeName} ${projection.homeScore} - ${projection.awayScore} ${awayName}`,
    clockLabel: formatGameClock(projection.gameClock?.remainingMs ?? projection.gameClockRemainingMs ?? 600000),
    finalLabel:
      projection.status === "FINISHED" && finalScore
        ? `Final: ${homeName} ${finalScore.home} - ${finalScore.away} ${awayName} (${projection.winnerSide ?? "TIE"})`
        : null
  };
}

export function getLifecycleActionPlan(projection: ScoreboardProjection) {
  const status = projection.status;
  const periodNumber = projection.periodNumber ?? projection.period ?? 1;
  const regulationPeriods = projection.regulationPeriods ?? 4;
  const isBreak = status === "PERIOD_BREAK";
  const tied = projection.homeScore === projection.awayScore;
  const canFinish =
    (status === "PERIOD_BREAK" || status === "LIVE" || status === "OVERTIME") &&
    !tied;

  return {
    startMatch: {
      enabled: status === "SCHEDULED" || status === "READY",
      requiresConfirmation: false,
      label: "Start Match"
    },
    endPeriod: {
      enabled: status === "LIVE" || status === "OVERTIME",
      requiresConfirmation: (projection.gameClock?.remainingMs ?? projection.gameClockRemainingMs ?? 0) > 0,
      label: "End Period"
    },
    startNextPeriod: {
      enabled: isBreak && periodNumber < regulationPeriods,
      requiresConfirmation: false,
      label: "Start Next Period"
    },
    startOvertime: {
      enabled: isBreak && periodNumber >= regulationPeriods && tied,
      requiresConfirmation: true,
      label: "Start Overtime"
    },
    finishMatch: {
      enabled: canFinish,
      requiresConfirmation: true,
      label: "Finish Match"
    }
  };
}

export function buildLifecycleCommandPayload(
  projection: ScoreboardProjection,
  reason: string | null
): { expectedSeq: number; payload: LifecycleCommandPayload } {
  return {
    expectedSeq: projection.currentSeq,
    payload: { reason: normalizeReason(reason) }
  };
}

export function getLifecycleControlFeedback(result: CommandResult | null) {
  if (!result) {
    return null;
  }

  if (result.status === "SYNC_REQUIRED" || result.reasonCode === "INVALID_EXPECTED_SEQ") {
    return {
      tone: "error" as const,
      code: "INVALID_EXPECTED_SEQ",
      text: "Conflict: refreshed, please try again."
    };
  }

  if (result.status === "ACCEPTED" || result.status === "DUPLICATE_ACCEPTED") {
    const eventType = result.appendedEvents[0]?.eventType;
    return {
      tone: "success" as const,
      text: `${successLabel(eventType)}. Current seq ${result.currentSeq}.`
    };
  }

  return {
    tone: "error" as const,
    code: result.reasonCode ?? result.status,
    text: result.message ?? "Lifecycle command rejected."
  };
}

export function getLifecycleControlLinks(matchId: string) {
  return {
    score: { href: buildOperatorMatchScoreLink(matchId), label: "Score" },
    fouls: { href: buildOperatorMatchFoulsLink(matchId), label: "Fouls" },
    clock: { href: buildOperatorMatchClockLink(matchId), label: "Clock" },
    timeouts: { href: buildOperatorMatchTimeoutsLink(matchId), label: "Timeouts" },
    publicScoreboard: { href: buildPublicScoreboardLink(matchId), label: "Public scoreboard" }
  };
}

export function buildLifecycleReadinessContext(readiness: MatchReadiness | null | undefined) {
  if (!readiness) {
    return null;
  }

  const incomplete = readiness.officials.state !== "READY"
    || readiness.roster.state !== "READY"
    || readiness.lineup.state !== "READY";

  return {
    warning: incomplete
      ? "Setup readiness is incomplete. Review roster, lineup, and official assignments before starting."
      : null,
    hardBlock: false,
    items: [
      { label: "Officials", state: readiness.officials.state, detail: readiness.officials.label },
      {
        label: "Roster",
        state: readiness.roster.state,
        detail: `HOME ${readiness.roster.homeCount} / AWAY ${readiness.roster.awayCount}`
      },
      {
        label: "Lineup",
        state: readiness.lineup.state,
        detail: `HOME ${readiness.lineup.homeStarters} ${readiness.lineup.homeConfirmed ? "confirmed" : "not confirmed"} / AWAY ${readiness.lineup.awayStarters} ${readiness.lineup.awayConfirmed ? "confirmed" : "not confirmed"}`
      },
      {
        label: "Lifecycle",
        state: readiness.lifecycle.state.replace("_", " "),
        detail: readiness.lifecycle.label
      }
    ]
  };
}

export function buildMatchStartChecklist(
  projection: ScoreboardProjection | null,
  readiness: MatchReadiness | null | undefined
) {
  const matchId = projection?.matchId ?? "";
  const items: MatchStartChecklistItem[] = [
    buildOfficialsChecklistItem(matchId, readiness),
    buildRosterChecklistItem(matchId, readiness),
    buildLineupChecklistItem(matchId, readiness),
    buildClockConfigChecklistItem(matchId, projection),
    buildPublicScoreboardChecklistItem(matchId)
  ];
  const readyCount = items.filter((item) => item.status === "READY").length;
  const warningCount = items.filter((item) => item.status === "WARNING").length;
  const missingCount = items.filter((item) => item.status === "MISSING").length;
  const state = missingCount > 0 ? "INCOMPLETE" : warningCount > 0 ? "WARNING" : "READY";

  return {
    state,
    readyCount,
    warningCount,
    missingCount,
    advisoryWarning:
      state === "READY"
        ? null
        : "Setup checklist has warnings. This Alpha checklist is advisory and does not enforce official start rules.",
    hardBlock: false,
    items
  };
}

function buildOfficialsChecklistItem(matchId: string, readiness: MatchReadiness | null | undefined): MatchStartChecklistItem {
  const state = readiness?.officials.state ?? "MISSING";
  return {
    key: "officials",
    label: "Officials",
    status: state === "READY" ? "READY" : state === "PARTIAL" ? "WARNING" : "MISSING",
    message: readiness?.officials.label ?? "No active officials assigned.",
    actionLabel: "Assign Officials",
    actionUrl: matchId ? `/admin/matches/${encodeURIComponent(matchId)}/officials` : null
  };
}

function buildRosterChecklistItem(matchId: string, readiness: MatchReadiness | null | undefined): MatchStartChecklistItem {
  const roster = readiness?.roster;
  const state = roster?.state ?? "MISSING";
  return {
    key: "roster",
    label: "Roster",
    status: state === "READY" ? "READY" : state === "INCOMPLETE" ? "WARNING" : "MISSING",
    message: roster ? `HOME ${roster.homeCount} / AWAY ${roster.awayCount}` : "Roster setup is missing.",
    actionLabel: "Setup Roster",
    actionUrl: matchId ? `/admin/matches/${encodeURIComponent(matchId)}/rosters` : null
  };
}

function buildLineupChecklistItem(matchId: string, readiness: MatchReadiness | null | undefined): MatchStartChecklistItem {
  const lineup = readiness?.lineup;
  const state = lineup?.state ?? "MISSING";
  return {
    key: "lineup",
    label: "Lineup",
    status: state === "READY" ? "READY" : state === "INCOMPLETE" ? "WARNING" : "MISSING",
    message: lineup
      ? `HOME ${lineup.homeStarters} ${lineup.homeConfirmed ? "confirmed" : "not confirmed"} / AWAY ${lineup.awayStarters} ${lineup.awayConfirmed ? "confirmed" : "not confirmed"}`
      : "Lineup setup is missing.",
    actionLabel: "Setup Lineup",
    actionUrl: matchId ? `/admin/matches/${encodeURIComponent(matchId)}/lineup` : null
  };
}

function buildClockConfigChecklistItem(matchId: string, projection: ScoreboardProjection | null): MatchStartChecklistItem {
  const periodNumber = projection?.periodNumber ?? projection?.period ?? null;
  const periodType = projection?.periodType ?? "REGULATION";
  const gameClockMs = projection?.gameClock?.remainingMs ?? projection?.gameClockRemainingMs ?? null;
  const shotClockMs = projection?.shotClock?.remainingMs ?? projection?.shotClockRemainingMs ?? null;
  const ready = periodNumber !== null && gameClockMs !== null && shotClockMs !== null;
  return {
    key: "clock_config",
    label: "Clock / Period Config",
    status: ready ? "READY" : "WARNING",
    message: ready
      ? `Period ${periodNumber} ${periodType}, game clock ${formatGameClock(gameClockMs)}, shot clock ${formatShotClock(shotClockMs)}`
      : "Clock or period values are using defaults or are incomplete.",
    actionLabel: "Open Clock",
    actionUrl: matchId ? buildOperatorMatchClockLink(matchId) : null
  };
}

function buildPublicScoreboardChecklistItem(matchId: string): MatchStartChecklistItem {
  return {
    key: "public_scoreboard",
    label: "Public Scoreboard",
    status: matchId ? "READY" : "WARNING",
    message: matchId ? "Public scoreboard link is available." : "Public scoreboard link is unavailable.",
    actionLabel: matchId ? "Open Public Scoreboard" : null,
    actionUrl: matchId ? buildPublicScoreboardLink(matchId) : null
  };
}

function successLabel(eventType: string | undefined) {
  switch (eventType) {
    case "MATCH_STARTED":
      return "Match started";
    case "PERIOD_ENDED":
      return "Period ended";
    case "PERIOD_STARTED":
      return "Next period started";
    case "OVERTIME_STARTED":
      return "Overtime started";
    case "MATCH_FINISHED":
      return "Match finished";
    default:
      return "Lifecycle updated";
  }
}

function formatGameClock(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatShotClock(remainingMs: number) {
  return String(Math.max(0, Math.ceil(remainingMs / 1000)));
}

function normalizeReason(reason: string | null) {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : null;
}
