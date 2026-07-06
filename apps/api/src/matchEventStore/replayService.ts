import type { Pool, PoolConnection } from "mysql2/promise";
import type {
  MatchReplayResponse,
  ReplayEventGroup,
  ReplayGroupFilter,
  ReplayItem
} from "@basket-scoreboard/api-contracts";
import { getScoreboardProjectionView, listMatchEvents, type MatchEventRecord } from "./repositories.js";

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
  const allItems = events.map((event) => toReplayItem(event, score));
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

function toReplayItem(event: MatchEventRecord, score: { home: number; away: number }): ReplayItem {
  const payload = payloadRecord(event.payload);
  const teamSide = parseTeamSide(payload.teamSide);
  const eventType = String(event.eventType);
  const eventGroup = eventGroups[eventType] ?? "OTHER";
  const scoreAfter = eventType === "SCORE_ADDED" ? applyScore(payload, teamSide, score) : null;
  const player = buildPlayer(payload);

  return {
    matchId: event.matchId,
    seq: event.seqNo,
    eventType,
    eventGroup,
    periodNumber: numberOrNull(payload.periodNumber),
    periodType: stringOrNull(payload.periodType),
    teamSide,
    title: buildTitle(eventType, payload, teamSide),
    description: buildDescription(eventType, payload, teamSide, player),
    scoreAfter,
    player,
    actor: {
      userId: stringOrNull(event.actorUserId),
      displayName: null,
      role: stringOrNull(event.actorRole)
    },
    createdAt: event.recordedAt
  };
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
