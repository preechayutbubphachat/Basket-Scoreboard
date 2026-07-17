import type { EffectiveMatchAccess } from "@basket-scoreboard/api-contracts";
import type {
  LiveMatchNavigationItem,
  LiveMatchShellProps
} from "../components/LiveMatchShell";
import {
  buildOperatorMatchAuditLogLink,
  buildOperatorMatchClockLink,
  buildOperatorMatchCorrectionsLink,
  buildOperatorMatchFoulsLink,
  buildOperatorMatchLifecycleLink,
  buildOperatorMatchReplayLink,
  buildOperatorMatchScoreLink,
  buildOperatorMatchSummaryLink,
  buildOperatorMatchTimeoutsLink
} from "./operatorMatches";

export type LiveMatchPresentationInput = {
  matchId: string;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  status: string;
  tournamentLabel?: string | null;
  courtLabel?: string | null;
  periodLabel?: string | null;
};

export type LiveMatchView =
  | "score"
  | "fouls"
  | "clock"
  | "timeouts"
  | "lifecycle"
  | "corrections"
  | "summary"
  | "replay"
  | "audit-log";

function requiredLabel(value: string | null | undefined, fallback: string) {
  const label = value?.trim();
  return label || fallback;
}

function optionalLabel(value: string | null | undefined) {
  const label = value?.trim();
  return label || null;
}

export function buildLiveMatchPresentationContext(
  input: LiveMatchPresentationInput
): LiveMatchShellProps["match"] {
  return {
    matchId: input.matchId,
    homeTeamName: requiredLabel(input.homeTeamName, "Home team pending"),
    awayTeamName: requiredLabel(input.awayTeamName, "Away team pending"),
    status: input.status,
    tournamentLabel: optionalLabel(input.tournamentLabel),
    courtLabel: optionalLabel(input.courtLabel),
    periodLabel: optionalLabel(input.periodLabel),
    readOnly: input.status === "FINAL" || input.status === "FINISHED"
  };
}

type NavigationInput = {
  matchId: string;
  currentView?: string | null;
  effectiveAccess?: EffectiveMatchAccess | null;
};

export function buildLiveMatchNavigation({
  matchId,
  currentView,
  effectiveAccess
}: NavigationInput): LiveMatchNavigationItem[] {
  if (!effectiveAccess || effectiveAccess.matchId !== matchId) return [];

  const { capabilities } = effectiveAccess;
  const definitions: Array<{
    allowed: boolean;
    href: string;
    id: LiveMatchView;
    label: string;
  }> = [
    { allowed: capabilities.matchRead && capabilities.scoreOperate, href: buildOperatorMatchScoreLink(matchId), id: "score", label: "Score" },
    { allowed: capabilities.matchRead && capabilities.foulOperate, href: buildOperatorMatchFoulsLink(matchId), id: "fouls", label: "Fouls" },
    { allowed: capabilities.matchRead && (capabilities.gameClockOperate || capabilities.shotClockOperate), href: buildOperatorMatchClockLink(matchId), id: "clock", label: "Clock" },
    { allowed: capabilities.matchRead && capabilities.timeoutOperate, href: buildOperatorMatchTimeoutsLink(matchId), id: "timeouts", label: "Timeouts" },
    { allowed: capabilities.matchRead && capabilities.lifecycleOperate, href: buildOperatorMatchLifecycleLink(matchId), id: "lifecycle", label: "Lifecycle" },
    { allowed: capabilities.matchRead && capabilities.correctionRequest, href: buildOperatorMatchCorrectionsLink(matchId), id: "corrections", label: "Corrections" },
    { allowed: capabilities.matchRead, href: buildOperatorMatchSummaryLink(matchId), id: "summary", label: "Summary" },
    { allowed: capabilities.matchRead, href: buildOperatorMatchReplayLink(matchId), id: "replay", label: "Replay" },
    { allowed: capabilities.auditRead, href: buildOperatorMatchAuditLogLink(matchId), id: "audit-log", label: "Audit Log" }
  ];

  return definitions
    .filter((item) => item.allowed)
    .map(({ allowed: _allowed, ...item }) => ({
      ...item,
      current: item.id === currentView
    }));
}
