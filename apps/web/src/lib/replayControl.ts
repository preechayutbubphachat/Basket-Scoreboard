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
