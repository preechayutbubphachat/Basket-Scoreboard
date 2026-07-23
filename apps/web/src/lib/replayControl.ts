import type { MatchReplayResponse, ReplayGroupFilter, ReplayItem } from "@basket-scoreboard/api-contracts";

export function buildReplayEventGroupOptions(): Array<{ value: ReplayGroupFilter; label: string }> {
  return [
    { value: "all", label: "All" },
    { value: "score", label: "Score" },
    { value: "foul", label: "Fouls" },
    { value: "timeout", label: "Timeouts" },
    { value: "clock", label: "Clock" },
    { value: "lifecycle", label: "Lifecycle" },
    { value: "correction", label: "Corrections" }
  ];
}

export function buildReplayEventMeta(item: ReplayItem) {
  return {
    badge: item.eventGroup,
    title: item.title,
    description: item.description,
    timestamp: formatTimestamp(item.createdAt)
  };
}

export function buildReplayRowClassName(item: ReplayItem) {
  return item.eventGroup === "CORRECTION" ? "correction-row" : "";
}

export function buildReplayCorrectionDetail(item: ReplayItem) {
  if (item.eventGroup !== "CORRECTION") {
    return [];
  }

  const details = item.correctionDetails ?? null;
  return [
    `Correction: ${details?.correctionKind ?? "Unknown"}`,
    `Corrected event seq: ${details?.correctedEventSeq?.toString() ?? "Not recorded"}`,
    `Reason: ${details?.reason ?? "Not recorded"}`,
    `Effect: ${formatCorrectionEffect(details?.delta)}`
  ];
}

export function getReplayScoreAfterLabel(item: ReplayItem, replay: Pick<MatchReplayResponse, "homeTeamName" | "awayTeamName">) {
  if (!item.scoreAfter) {
    return null;
  }
  return `Score after: ${replay.homeTeamName} ${item.scoreAfter.home} - ${item.scoreAfter.away} ${replay.awayTeamName}`;
}

export function hasReplayMutationControls() {
  return false;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatCorrectionEffect(value: Record<string, unknown> | null | undefined) {
  if (!value) {
    return "Not recorded";
  }

  const teamSide = typeof value.teamSide === "string" ? value.teamSide : null;
  const points = numberOrNull(value.points);
  if (teamSide && points !== null) {
    return `${teamSide} ${points >= 0 ? "+" : ""}${points} points`;
  }

  const fouls = numberOrNull(value.fouls);
  if (teamSide && fouls !== null) {
    return `${teamSide} ${fouls >= 0 ? "+" : ""}${fouls} fouls`;
  }

  const remainingMs = numberOrNull(value.remainingMs);
  if (remainingMs !== null) {
    return `${Math.round(remainingMs / 1000)}s remaining`;
  }

  return JSON.stringify(value);
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
