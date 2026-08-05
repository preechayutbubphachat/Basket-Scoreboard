import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getCurrentSeq, getMatchEventBySeq, listMatchEvents, type MatchEventRecord } from "../matchEventStore/repositories.js";
import {
  canonicalRosterBaselineHash,
  assertEventRelationship,
  hasCanonicalRosterBaselineEventAnchor,
  hasCanonicalRosterBaselineIntegrity,
  parseBaselineMember,
  rebuildRosterBaselineFromEvents,
  rebuildRosterBaselineFromSnapshotAndEvents,
  type RosterBaselineProjection,
  type TeamSide
} from "./rosterBaselineProjection.js";

type SnapshotRow = RowDataPacket & {
  snapshot_id: string;
  match_id: string;
  team_side: TeamSide;
  event_seq: number | string;
  event_id: string;
  canonical_payload_hash: string;
  projection_data: unknown;
};

type MatchTeamRow = RowDataPacket & { home_team_id: string | null; away_team_id: string | null };

type SnapshotEnvelope = {
  snapshotSchemaVersion: 1;
  matchId: string;
  teamSide: TeamSide;
  eventSeq: number;
  eventId: string;
  canonicalPayloadHash: string;
  projection: RosterBaselineProjection;
};

export type RosterBaselineRecovery = {
  projection: RosterBaselineProjection;
  mode: "SNAPSHOT_TAIL" | "FULL_REPLAY";
  snapshotEventSeq: number | null;
  tailEventSeqs: number[];
};

export class RosterSnapshotRecoveryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RosterSnapshotRecoveryError";
    this.code = code;
  }
}

export async function recoverRosterBaselineForMatch(
  connection: PoolConnection,
  matchId: string,
  teamSide: TeamSide
): Promise<RosterBaselineRecovery | null> {
  const currentSeq = await getCurrentSeq(connection, matchId);
  if (currentSeq === null) return null;

  const [matchRows] = await connection.query<MatchTeamRow[]>(
    "SELECT home_team_id, away_team_id FROM matches WHERE match_id = ?",
    [matchId]
  );
  const match = matchRows[0];
  if (!match) return null;
  const expectedTeamId = teamSide === "HOME" ? match.home_team_id : match.away_team_id;
  const homeTeamId = match.home_team_id;
  const awayTeamId = match.away_team_id;
  if (!expectedTeamId || !homeTeamId || !awayTeamId) return null;

  const [snapshotRows] = await connection.query<SnapshotRow[]>(
    "SELECT snapshot_id, match_id, team_side, event_seq, event_id, canonical_payload_hash, projection_data FROM match_roster_baseline_snapshots WHERE match_id = ? AND team_side = ? ORDER BY event_seq DESC",
    [matchId, teamSide]
  );

  for (const row of snapshotRows) {
    const eventSeq = Number(row.event_seq);
    if (eventSeq > currentSeq) {
      throw new RosterSnapshotRecoveryError("ROSTER_SNAPSHOT_AHEAD_OF_STREAM", "Roster snapshot sequence is ahead of the match stream");
    }

    const envelope = parseSnapshotEnvelope(row.projection_data);
    if (!envelope || !isValidSnapshotEnvelope(envelope, row, matchId, teamSide, expectedTeamId, eventSeq)) continue;

    const anchorEvent = await getMatchEventBySeq(connection, matchId, eventSeq);
    if (!anchorEvent || anchorEvent.eventId !== row.event_id || anchorEvent.eventType !== "MATCH_ROSTER_BASELINE_IMPORTED") continue;
    if (!hasCanonicalRosterBaselineIntegrity(envelope.projection, matchId)) continue;
    if (!hasCanonicalRosterBaselineEventAnchor(envelope.projection, anchorEvent, teamSide)) continue;
    if (!isValidRosterBaselineEvent(anchorEvent, teamSide, eventSeq, row.canonical_payload_hash, matchId, expectedTeamId)) continue;

    const tail = await listMatchEvents(connection, matchId, eventSeq);
    assertContiguousTail(tail, eventSeq, currentSeq, matchId, homeTeamId, awayTeamId);
    return {
      projection: rebuildRosterBaselineFromSnapshotAndEvents(envelope.projection, filterRosterEventsForTeam(tail, teamSide), teamSide, matchId, expectedTeamId),
      mode: "SNAPSHOT_TAIL",
      snapshotEventSeq: eventSeq,
      tailEventSeqs: tail.map((event) => event.seqNo)
    };
  }

  const fullEventStream = await listMatchEvents(connection, matchId, 0);
  assertContiguousFullStream(fullEventStream, currentSeq, matchId, homeTeamId, awayTeamId);
  const projection = rebuildRosterBaselineFromEvents(filterRosterEventsForTeam(fullEventStream, teamSide), teamSide, matchId, expectedTeamId);
  if (projection && !isRelationshipBoundProjection(projection, matchId, teamSide, expectedTeamId)) {
    throw new RosterSnapshotRecoveryError("ROSTER_EVENT_INVALID_RELATIONSHIP", "Replayed roster baseline is not bound to the requested match team");
  }
  return projection
    ? { projection, mode: "FULL_REPLAY", snapshotEventSeq: null, tailEventSeqs: fullEventStream.map((event) => event.seqNo) }
    : null;
}

function parseSnapshotEnvelope(value: unknown): SnapshotEnvelope | null {
  let parsed: unknown = value;
  try {
    if (typeof value === "string") parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as Partial<SnapshotEnvelope>;
  return candidate.snapshotSchemaVersion === 1 && candidate.projection && typeof candidate.projection === "object"
    ? candidate as SnapshotEnvelope
    : null;
}

function isValidSnapshotEnvelope(
  envelope: SnapshotEnvelope,
  row: SnapshotRow,
  matchId: string,
  teamSide: TeamSide,
  expectedTeamId: string,
  eventSeq: number
) {
  const projection = envelope.projection;
  const version = projection.version;
  return envelope.matchId === matchId
    && envelope.teamSide === teamSide
    && envelope.eventSeq === eventSeq
    && envelope.eventId === row.event_id
    && envelope.canonicalPayloadHash === row.canonical_payload_hash
    && projection.teamSide === teamSide
    && projection.matchTeamId === expectedTeamId
    && Array.isArray(projection.members)
    && projection.members.length > 0
    && projection.members.every((member) => parseBaselineMember(member)?.teamId === expectedTeamId)
    && version?.eventSeq === eventSeq
    && version.eventId === row.event_id
    && version.canonicalPayloadHash === row.canonical_payload_hash;
}

function isValidRosterBaselineEvent(event: MatchEventRecord, teamSide: TeamSide, eventSeq: number, expectedHash: string, expectedMatchId: string, expectedTeamId: string) {
  if (!event.payload || typeof event.payload !== "object") return false;
  const payload = event.payload as Record<string, unknown>;
  const source = payload.source && typeof payload.source === "object" ? payload.source as Record<string, unknown> : null;
  const version = payload.rosterVersion && typeof payload.rosterVersion === "object" ? payload.rosterVersion as Record<string, unknown> : null;
  const members = Array.isArray(payload.members) ? payload.members : null;
  if (payload.schemaVersion !== 1 || payload.teamSide !== teamSide || payload.matchId !== expectedMatchId || payload.matchTeamId !== expectedTeamId || !source || typeof source.legacyRosterRevision !== "string" || !version || !members) return false;
  if (!members.every((member) => parseBaselineMember(member)?.teamId === expectedTeamId)) return false;
  if (Number(version.eventSeq) !== eventSeq || version.eventId !== event.eventId || version.canonicalPayloadHash !== expectedHash) return false;
  try {
    return canonicalRosterBaselineHash({ eventType: event.eventType, schemaVersion: 1, matchId: expectedMatchId, matchTeamId: expectedTeamId, teamSide, sourceRevision: source.legacyRosterRevision, members: members as never[], ruleProfile: typeof payload.rulesProfile === "string" ? payload.rulesProfile : null, rosterVersion: { eventSeq, eventId: event.eventId } }) === expectedHash;
  } catch {
    return false;
  }
}

function filterRosterEventsForTeam(events: MatchEventRecord[], teamSide: TeamSide) {
  return events.filter((event) => {
    if (event.eventType !== "MATCH_ROSTER_BASELINE_IMPORTED") return true;
    const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
    return payload.teamSide === teamSide;
  });
}

function rosterEventTeamSide(event: MatchEventRecord): TeamSide | null {
  if (event.eventType !== "MATCH_ROSTER_BASELINE_IMPORTED") return null;
  const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
  return payload.teamSide === "HOME" || payload.teamSide === "AWAY" ? payload.teamSide : null;
}

function assertContiguousTail(events: MatchEventRecord[], snapshotSeq: number, currentSeq: number, expectedMatchId: string, homeTeamId: string, awayTeamId: string) {
  if (events.length !== currentSeq - snapshotSeq) {
    throw new RosterSnapshotRecoveryError("ROSTER_SNAPSHOT_TAIL_GAP", "Roster snapshot tail does not cover every event after the snapshot");
  }
  for (let index = 0; index < events.length; index += 1) {
    if (events[index]?.seqNo !== snapshotSeq + index + 1) {
      throw new RosterSnapshotRecoveryError("ROSTER_SNAPSHOT_TAIL_GAP", "Roster snapshot tail contains a sequence gap");
    }
    const event = events[index];
    if (!event) throw new RosterSnapshotRecoveryError("ROSTER_SNAPSHOT_TAIL_GAP", "Roster snapshot tail contains a missing event");
    const eventTeamSide = rosterEventTeamSide(event);
    const eventTeamId = eventTeamSide === "HOME" ? homeTeamId : eventTeamSide === "AWAY" ? awayTeamId : undefined;
    try {
      assertEventRelationship(event, eventTeamSide ?? "HOME", expectedMatchId, eventTeamId);
    } catch {
      throw new RosterSnapshotRecoveryError("ROSTER_EVENT_INVALID_RELATIONSHIP", "Roster snapshot tail event is not bound to the requested match team");
    }
  }
}

function assertContiguousFullStream(events: MatchEventRecord[], currentSeq: number, expectedMatchId: string, homeTeamId: string, awayTeamId: string) {
  if (events.length !== currentSeq) throw new RosterSnapshotRecoveryError("ROSTER_EVENT_STREAM_GAP", "Match event stream contains a sequence gap");
  for (let index = 0; index < events.length; index += 1) {
    if (events[index]?.seqNo !== index + 1) throw new RosterSnapshotRecoveryError("ROSTER_EVENT_STREAM_GAP", "Match event stream contains a sequence gap");
    const event = events[index];
    if (!event) throw new RosterSnapshotRecoveryError("ROSTER_EVENT_STREAM_GAP", "Match event stream contains a missing event");
    const eventTeamSide = rosterEventTeamSide(event);
    const eventTeamId = eventTeamSide === "HOME" ? homeTeamId : eventTeamSide === "AWAY" ? awayTeamId : undefined;
    try {
      assertEventRelationship(event, eventTeamSide ?? "HOME", expectedMatchId, eventTeamId);
    } catch {
      throw new RosterSnapshotRecoveryError("ROSTER_EVENT_INVALID_RELATIONSHIP", eventTeamSide ? "Full replay roster event is not bound to the requested match team" : "Full replay event is not bound to the requested match stream");
    }
  }
}

function isRelationshipBoundProjection(projection: RosterBaselineProjection, expectedMatchId: string, teamSide: TeamSide, expectedTeamId: string) {
  return projection.matchId === expectedMatchId
    && projection.teamSide === teamSide
    && projection.matchTeamId === expectedTeamId
    && projection.ruleProfile === "FIBA_2024"
    && projection.members.every((member) => parseBaselineMember(member)?.teamId === expectedTeamId);
}

function isValidAnyRosterBaselineEvent(event: MatchEventRecord, expectedMatchId?: string, expectedTeamId?: string) {
  const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : null;
  const teamSide = payload?.teamSide === "HOME" || payload?.teamSide === "AWAY" ? payload.teamSide : null;
  const version = payload?.rosterVersion && typeof payload.rosterVersion === "object" ? payload.rosterVersion as Record<string, unknown> : null;
  const expectedHash = typeof version?.canonicalPayloadHash === "string" ? version.canonicalPayloadHash : null;
  return teamSide !== null && expectedHash !== null && isValidRosterBaselineEvent(event, teamSide, event.seqNo, expectedHash, expectedMatchId ?? (typeof payload?.matchId === "string" ? payload.matchId : ""), expectedTeamId ?? (typeof payload?.matchTeamId === "string" ? payload.matchTeamId : ""));
}
