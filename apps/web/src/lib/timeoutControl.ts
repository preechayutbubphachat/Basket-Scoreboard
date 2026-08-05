import type {
  CommandResult,
  ScoreboardProjection,
  TimeoutEndedPayload
} from "@basket-scoreboard/api-contracts";
import {
  buildOperatorMatchClockLink,
  buildOperatorMatchCorrectionsLink,
  buildOperatorMatchFoulsLink,
  buildOperatorMatchScoreLink,
  buildPublicScoreboardLink
} from "./operatorMatches";

export type TimeoutControlTeamSide = "HOME" | "AWAY";

type TimeoutDisplayProjection = Partial<Pick<ScoreboardProjection, "timeouts" | "homeTeamName" | "awayTeamName">> & {
  activeTimeout?: {
    teamSide: "HOME" | "AWAY";
    remainingMs: number;
  } | null;
  timeoutOpportunity?: {
    status: "UNKNOWN" | "OPEN" | "CLOSED";
    eligibleTeams: Array<"HOME" | "AWAY">;
  } | null;
};


export function buildTimeoutControlPanels(projection: TimeoutDisplayProjection | null) {
  const timeouts = getTimeouts(projection);
  return [
    {
      teamSide: "HOME" as const,
      teamName: projection?.homeTeamName ?? "HOME",
      used: timeouts.home.used,
      remaining: timeouts.home.remaining,
      pendingKey: "grant-HOME"
    },
    {
      teamSide: "AWAY" as const,
      teamName: projection?.awayTeamName ?? "AWAY",
      used: timeouts.away.used,
      remaining: timeouts.away.remaining,
      pendingKey: "grant-AWAY"
    }
  ];
}

export function buildTimeoutOpportunityPresentation(projection: TimeoutDisplayProjection | null) {
  const timeouts = getTimeouts(projection);
  const eligibleTeams = projection?.timeoutOpportunity?.eligibleTeams ?? [];
  const restrictedTeams = (["HOME", "AWAY"] as const).filter((teamSide) => !eligibleTeams.includes(teamSide));

  return {
    status: projection?.timeoutOpportunity?.status ?? "CLOSED",
    eligibleTeams: eligibleTeams.length > 0 ? eligibleTeams.join(", ") : "None",
    lateQ4Restriction: restrictedTeams.length > 0 ? `${restrictedTeams.join(", ")} restricted` : "None",
    quotas: {
      home: { ...timeouts.home },
      away: { ...timeouts.away }
    }
  };
}

export function buildTimeoutControlState(
  projection: TimeoutDisplayProjection,
  options: { canOperate: boolean; pending: boolean }
) {
  const panels = buildTimeoutControlPanels(projection);
  const opportunity = projection.timeoutOpportunity;
  const canGrant = options.canOperate && !options.pending && opportunity?.status === "OPEN";
  const toState = (panel: (typeof panels)[number]) => ({
    ...panel,
    enabled: Boolean(canGrant && opportunity.eligibleTeams.includes(panel.teamSide) && panel.remaining > 0)
  });

  return {
    home: toState(panels[0]!),
    away: toState(panels[1]!)
  };
}

export function buildTimeoutGrantPayload(
  projection: ScoreboardProjection,
  teamSide: TimeoutControlTeamSide
): { expectedSeq: number; payload: { teamSide: TimeoutControlTeamSide } } {
  return {
    expectedSeq: projection.currentSeq,
    payload: { teamSide }
  };
}

export function buildTimeoutEndPayload(
  projection: ScoreboardProjection,
  reason: string | null
): { expectedSeq: number; payload: TimeoutEndedPayload } {
  return {
    expectedSeq: projection.currentSeq,
    payload: {
      reason: normalizeReason(reason)
    }
  };
}

export function getActiveTimeoutLabel(projection: TimeoutDisplayProjection | null) {
  if (!projection?.activeTimeout) {
    return "No active timeout";
  }

  const teamName = projection.activeTimeout.teamSide === "HOME"
    ? projection.homeTeamName ?? "HOME"
    : projection.awayTeamName ?? "AWAY";
  const seconds = Math.ceil(Math.max(0, projection.activeTimeout.remainingMs) / 1000);
  return `${teamName} timeout - ${seconds}s remaining`;
}

export function getTimeoutControlFeedback(result: CommandResult | null) {
  if (!result) {
    return null;
  }

  if (result.status === "ACCEPTED" || result.status === "DUPLICATE_ACCEPTED") {
    return {
      tone: "success" as const,
      text: `Timeout updated. Current seq ${result.currentSeq}.`
    };
  }

  if (result.status === "SYNC_REQUIRED" || result.reasonCode === "INVALID_EXPECTED_SEQ") {
    return {
      tone: "error" as const,
      code: "INVALID_EXPECTED_SEQ",
      text: "Conflict: refreshed, please try again."
    };
  }

  return {
    tone: "error" as const,
    code: result.reasonCode ?? result.status,
    text: result.message ?? "Timeout command rejected."
  };
}

export function getTimeoutControlLinks(matchId: string) {
  return {
    score: { href: buildOperatorMatchScoreLink(matchId), label: "Score" },
    fouls: { href: buildOperatorMatchFoulsLink(matchId), label: "Fouls" },
    clock: { href: buildOperatorMatchClockLink(matchId), label: "Clock" },
    corrections: { href: buildOperatorMatchCorrectionsLink(matchId), label: "Corrections" },
    publicScoreboard: { href: buildPublicScoreboardLink(matchId), label: "Public scoreboard" }
  };
}

function getTimeouts(projection: TimeoutDisplayProjection | null) {
  return projection?.timeouts ?? {
    home: { used: 0, remaining: 5 },
    away: { used: 0, remaining: 5 }
  };
}

function normalizeReason(reason: string | null) {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : null;
}
