import type { Pool, PoolConnection } from "mysql2/promise";
import type {
  CorrectionDetail,
  MatchReplayResponse,
  ReplayEventGroup,
  ReplayGroupFilter,
  ReplayItem
} from "@basket-scoreboard/api-contracts";
import { getScoreboardProjectionView, listMatchEvents, type MatchEventRecord } from "./repositories.js";
import {
  applyGameClockCorrected,
  applyGameClockSet,
  applyGameClockStarted,
  applyGameClockStopped,
  applyMatchFinished,
  applyMatchStarted,
  applyOvertimeStarted,
  applyPeriodEnded,
  applyPeriodStarted,
  applyScoreAdded,
  applyScoreRemovedByCorrection,
  applyTimeoutOpportunityCorrection,
  applyTimeoutOpportunityFact,
  createInitialScoreboardProjection,
  normalizeScoreboardProjection,
  type ScoreboardProjection
} from "./projection.js";

type ReplayQuery = {
  group: ReplayGroupFilter;
  limit: number;
  afterSeq?: number | undefined;
  beforeSeq?: number | undefined;
};

const eventGroups: Record<string, ReplayEventGroup> = {
  SCORE_ADDED: "SCORE",
  TEAM_FOUL_ADDED: "FOUL",
  PLAYER_FOUL_ADDED: "FOUL",
  HEAD_COACH_TECHNICAL_FOUL_RECORDED: "FOUL",
  BENCH_TECHNICAL_FOUL_RECORDED: "FOUL",
  FREE_THROW_ENTITLEMENT_CREATED: "FOUL",
  PLAY_RESUMPTION_DECLARED: "FOUL",
  TIMEOUT_GRANTED: "TIMEOUT",
  TIMEOUT_ENDED: "TIMEOUT",
  GAME_CLOCK_STARTED: "CLOCK",
  GAME_CLOCK_STOPPED: "CLOCK",
  GAME_CLOCK_SET: "CLOCK",
  SHOT_CLOCK_RESET: "CLOCK",
  SHOT_CLOCK_SET: "CLOCK",
  MATCH_STARTED: "LIFECYCLE",
  PERIOD_ENDED: "LIFECYCLE",
  PERIOD_STARTED: "LIFECYCLE",
  OVERTIME_STARTED: "LIFECYCLE",
  MATCH_FINISHED: "LIFECYCLE",
  CORRECTION_REQUESTED: "CORRECTION",
  SCORE_REMOVED_BY_CORRECTION: "CORRECTION",
  CORRECTION_APPLIED: "CORRECTION",
  CORRECTION_REJECTED: "CORRECTION",
  SCORE_CORRECTED: "CORRECTION",
  TEAM_FOUL_CORRECTED: "CORRECTION",
  PLAYER_FOUL_CORRECTED: "CORRECTION",
  HEAD_COACH_TECHNICAL_FOUL_CORRECTED: "CORRECTION",
  BENCH_TECHNICAL_FOUL_CORRECTED: "CORRECTION",
  TIMEOUT_CORRECTED: "CORRECTION",
  GAME_CLOCK_CORRECTED: "CORRECTION",
  SHOT_CLOCK_CORRECTED: "CORRECTION"
};

const filterToGroup: Record<Exclude<ReplayGroupFilter, "all">, ReplayEventGroup> = {
  score: "SCORE",
  foul: "FOUL",
  timeout: "TIMEOUT",
  clock: "CLOCK",
  lifecycle: "LIFECYCLE",
  correction: "CORRECTION"
};

export async function getMatchReplay(options: {
  pool: Pool;
  matchId: string;
  query: ReplayQuery;
}): Promise<MatchReplayResponse | null> {
  const connection = await options.pool.getConnection();

  try {
    return getMatchReplayWithConnection(connection, options.matchId, options.query);
  } finally {
    connection.release();
  }
}

export async function getMatchReplayWithConnection(
  connection: PoolConnection,
  matchId: string,
  query: ReplayQuery
): Promise<MatchReplayResponse | null> {
  const projection = await getScoreboardProjectionView(connection, matchId);
  if (!projection) {
    return null;
  }

  const events = (await listMatchEvents(connection, matchId))
    .filter((event) => query.afterSeq === undefined || event.seqNo > query.afterSeq!)
    .filter((event) => query.beforeSeq === undefined || event.seqNo < query.beforeSeq!)
    .sort((left, right) => left.seqNo - right.seqNo);
  const score = { home: 0, away: 0 };
  const voidedConsequenceCorrections = collectVoidedConsequenceCorrections(events);
  const allItems = events.map((event) => toReplayItem(event, score, voidedConsequenceCorrections));
  const groupFilter = query.group === "all" ? null : filterToGroup[query.group];
  const filteredItems = groupFilter
    ? allItems.filter((item) => item.eventGroup === groupFilter)
    : allItems;

  return {
    matchId,
    status: projection.status,
    currentSeq: projection.currentSeq,
    homeTeamName: projection.homeTeamName ?? "HOME",
    awayTeamName: projection.awayTeamName ?? "AWAY",
    group: query.group,
    limit: query.limit,
    items: filteredItems.slice(0, query.limit),
    generatedAt: new Date().toISOString()
  };
}

function collectVoidedConsequenceCorrections(events: MatchEventRecord[]) {
  const corrections = new Map<string, string>();
  for (const event of events) {
    if (event.eventType !== "PLAYER_FOUL_CORRECTED" && event.eventType !== "HEAD_COACH_TECHNICAL_FOUL_CORRECTED" && event.eventType !== "BENCH_TECHNICAL_FOUL_CORRECTED") continue;
    const newValue = payloadRecord(payloadRecord(event.payload).newValue);
    if (newValue.consequenceDisposition !== "VOIDED_WITH_SOURCE_FOUL") continue;
    const rawIds = newValue.voidedConsequenceEventIds;
    if (!Array.isArray(rawIds)) continue;
    for (const id of rawIds) {
      if (typeof id === "string" && id.length > 0) corrections.set(id, event.eventType);
    }
  }
  return corrections;
}

function toReplayItem(
  event: MatchEventRecord,
  score: { home: number; away: number },
  voidedConsequenceCorrections: Map<string, string>
): ReplayItem {
  const payload = payloadRecord(event.payload);
  const teamSide = parseTeamSide(payload.teamSide);
  const eventType = String(event.eventType);
  const eventGroup = eventGroups[eventType] ?? "OTHER";
  const scoreAfter = eventType === "SCORE_ADDED" ? applyScore(payload, teamSide, score) : null;
  const player = buildPlayer(payload);
  const voidedByCorrection = voidedConsequenceCorrections.get(event.eventId) ?? null;
  const title = buildTitle(eventType, payload, teamSide);
  const description = buildDescription(eventType, payload, teamSide, player);

  return {
    matchId: event.matchId,
    seq: event.seqNo,
    eventType,
    eventGroup,
    periodNumber: numberOrNull(payload.periodNumber),
    periodType: stringOrNull(payload.periodType),
    teamSide,
    title: voidedByCorrection ? `${title} (voided)` : title,
    description: voidedByCorrection ? `Voided by ${voidedCorrectionLabel(voidedByCorrection)}. ${description}` : description,
    scoreAfter,
    player,
    actor: {
      userId: stringOrNull(event.actorUserId),
      displayName: null,
      role: stringOrNull(event.actorRole)
    },
    correctionDetails: eventGroup === "CORRECTION" ? buildCorrectionDetail(payload, event.reason) : null,
    createdAt: event.recordedAt
  };
}

function voidedCorrectionLabel(eventType: string) {
  return eventType === "HEAD_COACH_TECHNICAL_FOUL_CORRECTED"
    ? "head-coach technical correction"
    : eventType === "BENCH_TECHNICAL_FOUL_CORRECTED"
      ? "assistant-coach bench technical correction"
    : "player-foul correction";
}

function applyScore(
  payload: Record<string, unknown>,
  teamSide: "HOME" | "AWAY" | null,
  score: { home: number; away: number }
) {
  const points = numberOrDefault(payload.points, 0);
  if (teamSide === "HOME") {
    score.home += points;
  }
  if (teamSide === "AWAY") {
    score.away += points;
  }
  return { ...score };
}

function buildTitle(eventType: string, payload: Record<string, unknown>, teamSide: "HOME" | "AWAY" | null) {
  switch (eventType) {
    case "SCORE_ADDED":
      return `${teamSide ?? "Team"} +${numberOrDefault(payload.points, 0)}`;
    case "TEAM_FOUL_ADDED":
      return `${teamSide ?? "Team"} team foul`;
    case "PLAYER_FOUL_ADDED":
      return `${teamSide ?? "Team"} player foul`;
    case "HEAD_COACH_TECHNICAL_FOUL_RECORDED":
      return `${teamSide ?? "Team"} head coach technical foul`;
    case "BENCH_TECHNICAL_FOUL_RECORDED":
      return `${teamSide ?? "Team"} assistant coach bench technical foul`;
    case "FREE_THROW_ENTITLEMENT_CREATED":
      return "Technical-foul free throw entitlement";
    case "PLAY_RESUMPTION_DECLARED":
      return "Interrupted-play resumption";
    case "TIMEOUT_GRANTED":
      return `${teamSide ?? "Team"} timeout granted`;
    case "TIMEOUT_ENDED":
      return "Timeout ended";
    case "GAME_CLOCK_STARTED":
      return "Game clock started";
    case "GAME_CLOCK_STOPPED":
      return "Game clock stopped";
    case "GAME_CLOCK_SET":
      return "Game clock set";
    case "SHOT_CLOCK_RESET":
      return "Shot clock reset";
    case "SHOT_CLOCK_SET":
      return "Shot clock set";
    case "MATCH_STARTED":
      return "Match started";
    case "PERIOD_ENDED":
      return "Period ended";
    case "PERIOD_STARTED":
      return "Period started";
    case "OVERTIME_STARTED":
      return "Overtime started";
    case "MATCH_FINISHED":
      return "Match finished";
    case "CORRECTION_REQUESTED":
      return "Correction requested";
    case "SCORE_REMOVED_BY_CORRECTION":
      return "Score removed by correction";
    case "CORRECTION_APPLIED":
      return "Correction applied";
    case "CORRECTION_REJECTED":
      return "Correction rejected";
    case "SCORE_CORRECTED":
      return "Score corrected";
    case "TEAM_FOUL_CORRECTED":
      return "Team foul corrected";
    case "PLAYER_FOUL_CORRECTED":
      return "Player foul corrected";
    case "HEAD_COACH_TECHNICAL_FOUL_CORRECTED":
      return "Head coach technical foul corrected";
    case "BENCH_TECHNICAL_FOUL_CORRECTED":
      return "Assistant coach bench technical foul corrected";
    case "TIMEOUT_CORRECTED":
      return "Timeout corrected";
    case "GAME_CLOCK_CORRECTED":
      return "Game clock corrected";
    case "SHOT_CLOCK_CORRECTED":
      return "Shot clock corrected";
    default:
      return eventType;
  }
}

function buildDescription(
  eventType: string,
  payload: Record<string, unknown>,
  teamSide: "HOME" | "AWAY" | null,
  player: ReplayItem["player"]
) {
  switch (eventType) {
    case "SCORE_ADDED": {
      const points = numberOrDefault(payload.points, 0);
      return player
        ? `${player.displayName} scored ${points} point${points === 1 ? "" : "s"}.`
        : `${teamSide ?? "Team"} team-only score for ${points} point${points === 1 ? "" : "s"}.`;
    }
    case "PLAYER_FOUL_ADDED":
      return `${player?.displayName ?? "Unknown player"} ${stringOrNull(payload.foulType)?.toLowerCase() ?? "player"} foul.`;
    case "HEAD_COACH_TECHNICAL_FOUL_RECORDED":
      return `${stringOrNull(payload.headCoachDisplayNameSnapshot) ?? "Head coach"} technical foul.`;
    case "BENCH_TECHNICAL_FOUL_RECORDED":
      return `${stringOrNull(payload.assistantCoachDisplayNameSnapshot) ?? "Assistant coach"} bench technical foul charged to ${stringOrNull(payload.chargedHeadCoachDisplayNameSnapshot) ?? "the designated head coach"}.`;
    case "FREE_THROW_ENTITLEMENT_CREATED":
      return `${numberOrDefault(payload.attempts, 0)} free throw awarded to ${stringOrNull(payload.awardedTo) ?? "the entitled team"}.`;
    case "PLAY_RESUMPTION_DECLARED":
      return stringOrNull(payload.mode) === "RESUME_INTERRUPTED_PLAY"
        ? "Play resumes from the point of interruption after the technical-foul free throw."
        : "Play-resumption consequence recorded.";
    case "TEAM_FOUL_ADDED":
      return `${teamSide ?? "Team"} team foul recorded.`;
    case "TIMEOUT_GRANTED":
      return `${teamSide ?? "Team"} timeout granted${stringOrNull(payload.requestedBy) ? ` by ${stringOrNull(payload.requestedBy)}` : ""}.`;
    case "TIMEOUT_ENDED":
      return "Active timeout ended.";
    case "GAME_CLOCK_STARTED":
    case "GAME_CLOCK_STOPPED":
    case "GAME_CLOCK_SET":
    case "SHOT_CLOCK_RESET":
    case "SHOT_CLOCK_SET":
      return "Clock event recorded.";
    case "MATCH_STARTED":
    case "PERIOD_ENDED":
    case "PERIOD_STARTED":
    case "OVERTIME_STARTED":
    case "MATCH_FINISHED":
      return "Lifecycle event recorded.";
    case "CORRECTION_REQUESTED":
    case "SCORE_REMOVED_BY_CORRECTION":
    case "CORRECTION_APPLIED":
    case "CORRECTION_REJECTED":
    case "SCORE_CORRECTED":
    case "TEAM_FOUL_CORRECTED":
    case "PLAYER_FOUL_CORRECTED":
    case "TIMEOUT_CORRECTED":
    case "GAME_CLOCK_CORRECTED":
    case "SHOT_CLOCK_CORRECTED":
      return "Correction event recorded.";
    default:
      return "Legacy or unknown event recorded.";
  }
}

function buildPlayer(payload: Record<string, unknown>): ReplayItem["player"] {
  const playerId = stringOrNull(payload.playerId);
  const playerName = stringOrNull(payload.playerNameSnapshot) ?? stringOrNull(payload.playerName);
  const jerseyNumber = stringOrNull(payload.jerseyNumberSnapshot) ?? stringOrNull(payload.jerseyNumber);
  if (!playerId && !playerName && !jerseyNumber) {
    return null;
  }

  return {
    playerId,
    displayName: playerName ?? "Unknown player",
    jerseyNumber
  };
}

function payloadRecord(payload: unknown) {
  return payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
}

/** Deterministic private projector used by full replay and snapshot-plus-tail recovery. */
export function rebuildTimeoutOpportunityProjection(
  matchId: string,
  events: MatchEventRecord[],
  snapshot?: ScoreboardProjection
): ScoreboardProjection {
  let state = snapshot ? normalizeScoreboardProjection(snapshot) : createInitialScoreboardProjection(matchId);
  const after = snapshot?.currentSeq ?? 0;
  for (const event of [...events].filter((item) => item.seqNo > after).sort((a, b) => a.seqNo - b.seqNo)) {
    const p = payloadRecord(event.payload) as any;
    switch (event.eventType) {
      case "SCORE_ADDED": state = applyScoreAdded(state, p, event.seqNo, event.eventId); break;
      case "SCORE_REMOVED_BY_CORRECTION":
      case "SCORE_CORRECTED": state = applyScoreRemovedByCorrection(state, p, event.seqNo, event.eventId); break;
      case "GAME_CLOCK_STARTED": state = applyGameClockStarted(state, p, event.seqNo, event.eventId); break;
      case "GAME_CLOCK_STOPPED": state = applyGameClockStopped(state, p, event.seqNo); break;
      case "GAME_CLOCK_SET": state = applyGameClockSet(state, p, event.seqNo); break;
      case "GAME_CLOCK_CORRECTED": state = applyGameClockCorrected(state, p, event.seqNo); break;
      case "MATCH_STARTED": state = applyMatchStarted(state, p, event.seqNo, event.eventId); break;
      case "PERIOD_STARTED": state = applyPeriodStarted(state, p, event.seqNo, event.eventId); break;
      case "PERIOD_ENDED": state = applyPeriodEnded(state, p, event.seqNo, event.eventId); break;
      case "OVERTIME_STARTED": state = applyOvertimeStarted(state, p, event.seqNo, event.eventId); break;
      case "MATCH_FINISHED": state = applyMatchFinished(state, p, event.seqNo, event.eventId); break;
      case "TIMEOUT_OPPORTUNITY_FACT_RECORDED": state = applyTimeoutOpportunityFact(state, p, event.seqNo); break;
      case "TIMEOUT_OPPORTUNITY_CORRECTED": state = applyTimeoutOpportunityCorrection(state, p, event.seqNo); break;
      default: state = { ...state, currentSeq: event.seqNo };
    }
  }
  return state;
}

function recordOrNull(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function buildCorrectionDetail(payload: Record<string, unknown>, eventReason: string | null): CorrectionDetail {
  return {
    correctedEventSeq: numberOrNull(payload.correctedEventSeq),
    correctedEventType: stringOrNull(payload.correctedEventType),
    correctionKind: stringOrNull(payload.correctionKind),
    reason: stringOrNull(eventReason) ?? stringOrNull(payload.reason),
    oldValue: recordOrNull(payload.oldValue),
    newValue: recordOrNull(payload.newValue),
    delta: recordOrNull(payload.delta)
  };
}

function parseTeamSide(value: unknown) {
  return value === "HOME" || value === "AWAY" ? value : null;
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}
