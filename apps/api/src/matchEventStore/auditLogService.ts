import type { Pool, PoolConnection } from "mysql2/promise";
import type {
  AuditLogGroupFilter,
  AuditLogRow,
  AuditLogRowGroup,
  MatchAuditLogResponse
} from "@basket-scoreboard/api-contracts";
import { getScoreboardProjectionView, listMatchEvents, type MatchEventRecord } from "./repositories.js";

type AuditLogQuery = {
  group: AuditLogGroupFilter;
  limit: number;
  afterSeq?: number | undefined;
  beforeSeq?: number | undefined;
  actorId?: string | undefined;
  eventType?: string | undefined;
  hasReason?: boolean | undefined;
};

const eventGroups: Record<string, AuditLogRowGroup> = {
  SCORE_ADDED: "SCORE",
  TEAM_FOUL_ADDED: "FOUL",
  PLAYER_FOUL_ADDED: "FOUL",
  TIMEOUT_GRANTED: "TIMEOUT",
  TIMEOUT_ENDED: "TIMEOUT",
  GAME_CLOCK_STARTED: "CLOCK",
  GAME_CLOCK_STOPPED: "CLOCK",
  GAME_CLOCK_SET: "CLOCK",
  SHOT_CLOCK_RESET: "SHOT_CLOCK",
  SHOT_CLOCK_SET: "SHOT_CLOCK",
  MATCH_STARTED: "LIFECYCLE",
  PERIOD_ENDED: "LIFECYCLE",
  PERIOD_STARTED: "LIFECYCLE",
  OVERTIME_STARTED: "LIFECYCLE",
  MATCH_FINISHED: "LIFECYCLE",
  CORRECTION_REQUESTED: "CORRECTION",
  SCORE_REMOVED_BY_CORRECTION: "CORRECTION",
  CORRECTION_APPLIED: "CORRECTION",
  CORRECTION_REJECTED: "CORRECTION"
};

const filterToGroup: Partial<Record<Exclude<AuditLogGroupFilter, "all" | "rejected">, AuditLogRowGroup>> = {
  score: "SCORE",
  foul: "FOUL",
  clock: "CLOCK",
  shot_clock: "SHOT_CLOCK",
  timeout: "TIMEOUT",
  lifecycle: "LIFECYCLE",
  roster_lineup: "ROSTER_LINEUP",
  correction: "CORRECTION",
  other: "OTHER"
};

export async function getMatchAuditLog(options: {
  pool: Pool;
  matchId: string;
  query: AuditLogQuery;
}): Promise<MatchAuditLogResponse | null> {
  const connection = await options.pool.getConnection();

  try {
    return getMatchAuditLogWithConnection(connection, options.matchId, options.query);
  } finally {
    connection.release();
  }
}

export async function getMatchAuditLogWithConnection(
  connection: PoolConnection,
  matchId: string,
  query: AuditLogQuery
): Promise<MatchAuditLogResponse | null> {
  const projection = await getScoreboardProjectionView(connection, matchId);
  if (!projection) {
    return null;
  }

  const allRows = (await listMatchEvents(connection, matchId))
    .filter((event) => query.afterSeq === undefined || event.seqNo > query.afterSeq)
    .filter((event) => query.beforeSeq === undefined || event.seqNo < query.beforeSeq)
    .sort((left, right) => left.seqNo - right.seqNo)
    .map(toAuditRow)
    .filter((row) => !query.actorId || row.actor.userId === query.actorId)
    .filter((row) => !query.eventType || row.eventType === query.eventType)
    .filter((row) => query.hasReason === undefined || Boolean(row.reason) === query.hasReason);
  const filteredRows = filterRows(allRows, query.group);
  const rows = filteredRows.slice(0, query.limit);

  return {
    matchId,
    status: projection.status,
    currentSeq: projection.currentSeq,
    group: query.group,
    limit: query.limit,
    rows,
    summary: {
      totalRows: filteredRows.length,
      eventRows: filteredRows.filter((row) => row.source === "MATCH_EVENT").length,
      correctionRows: filteredRows.filter((row) => row.group === "CORRECTION").length,
      rejectedRows: filteredRows.filter((row) => row.status === "REJECTED").length,
      missingReasonRows: filteredRows.filter((row) => !row.reason).length
    },
    generatedAt: new Date().toISOString()
  };
}

function filterRows(rows: AuditLogRow[], group: AuditLogGroupFilter) {
  if (group === "all") {
    return rows;
  }

  if (group === "rejected") {
    return rows.filter((row) => row.status === "REJECTED");
  }

  const targetGroup = filterToGroup[group];
  return targetGroup ? rows.filter((row) => row.group === targetGroup) : rows;
}

function toAuditRow(event: MatchEventRecord): AuditLogRow {
  const payload = payloadRecord(event.payload);
  const eventType = String(event.eventType);
  const group = getEventGroup(eventType);
  const status = group === "CORRECTION" ? "CORRECTED" : "APPENDED";

  return {
    matchId: event.matchId,
    seq: event.seqNo,
    source: "MATCH_EVENT",
    group,
    eventType,
    status,
    title: buildTitle(eventType, group),
    description: buildDescription(eventType, payload, group),
    actor: {
      userId: stringOrNull(event.actorUserId),
      displayName: null,
      role: stringOrNull(event.actorRole)
    },
    device: {
      label: stringOrNull(event.deviceId),
      ipMasked: null,
      userAgentSummary: null
    },
    reason: stringOrNull(event.reason) ?? stringOrNull(payload.reason),
    commandId: stringOrNull(event.commandId),
    correlationId: stringOrNull(event.correlationId),
    causationId: stringOrNull(event.causationId),
    createdAt: event.recordedAt
  };
}

function getEventGroup(eventType: string): AuditLogRowGroup {
  if (eventGroups[eventType]) {
    return eventGroups[eventType];
  }

  if (/CORRECTION|CORRECTED|ADJUSTED|UNDONE|REVERTED|COMPENSATING/i.test(eventType)) {
    return "CORRECTION";
  }

  if (/ROSTER|LINEUP|STARTER|CAPTAIN/i.test(eventType)) {
    return "ROSTER_LINEUP";
  }

  return "OTHER";
}

function buildTitle(eventType: string, group: AuditLogRowGroup) {
  if (group === "CORRECTION") {
    return "Correction review item";
  }

  return eventType;
}

function buildDescription(eventType: string, payload: Record<string, unknown>, group: AuditLogRowGroup) {
  if (group === "SCORE") {
    const teamSide = stringOrNull(payload.teamSide) ?? "Team";
    const points = numberOrDefault(payload.points, 0);
    return `${teamSide} score event for ${points} point${points === 1 ? "" : "s"}.`;
  }

  if (group === "FOUL") {
    return "Foul event recorded.";
  }

  if (group === "CLOCK" || group === "SHOT_CLOCK") {
    return "Clock event recorded.";
  }

  if (group === "TIMEOUT") {
    return "Timeout event recorded.";
  }

  if (group === "LIFECYCLE") {
    return "Lifecycle event recorded.";
  }

  if (group === "CORRECTION") {
    return "Correction-related event recorded.";
  }

  return `${eventType} recorded.`;
}

function payloadRecord(payload: unknown) {
  return payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
}

function numberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
