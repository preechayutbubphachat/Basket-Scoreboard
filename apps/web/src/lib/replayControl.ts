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

export type ReplayCursorState = {
  cursor: number | null;
  playing: boolean;
};

export function createReplayCursorState(items: ReplayItem[]): ReplayCursorState {
  return { cursor: items.length > 0 ? items.length - 1 : null, playing: false };
}

export function getReplayStateAtCursor(items: ReplayItem[], cursor: number | null) {
  if (cursor === null || cursor < 0 || cursor >= items.length) {
    return { selected: null, scoreAfter: null };
  }
  let scoreAfter: ReplayItem["scoreAfter"] = null;
  for (let index = 0; index <= cursor; index += 1) {
    const item = items[index];
    if (item?.scoreAfter) scoreAfter = item.scoreAfter;
  }
  const selected = items[cursor];
  return { selected: selected ?? null, scoreAfter };
}

export function stepReplayCursor(state: ReplayCursorState, direction: -1 | 1, itemCount: number): ReplayCursorState {
  if (itemCount === 0 || state.cursor === null) return { ...state, playing: false };
  const cursor = Math.max(0, Math.min(itemCount - 1, state.cursor + direction));
  return { cursor, playing: cursor === itemCount - 1 ? false : state.playing };
}

export function jumpReplayCursor(items: ReplayItem[], state: ReplayCursorState, target: unknown) {
  if (typeof target !== "number" || !Number.isSafeInteger(target) || target < 0) {
    return { state, error: "Enter a non-negative integer sequence." };
  }
  const cursor = items.findIndex((item) => item.seq === target);
  if (cursor < 0) return { state, error: `Sequence ${target} is not in the current replay.` };
  return { state: { cursor, playing: false }, error: null };
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
