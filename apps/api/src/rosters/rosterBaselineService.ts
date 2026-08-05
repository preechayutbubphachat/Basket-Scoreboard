import { randomUUID } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { insertAuditLog } from "../matchEventStore/auditRepository.js";
import { ensurePlaceholderUser, getCurrentSeq, getMatchEventBySeq, isMatchStreamReadConflict, lockMatchStream } from "../matchEventStore/repositories.js";
import {
  buildRosterBaselineProjection,
  canonicalRosterBaselineHash,
  hasCanonicalRosterBaselineEventAnchor,
  hasCanonicalRosterBaselineIntegrity,
  isEligibilityStatus,
  type BaselineMember,
  type TeamSide
} from "./rosterBaselineProjection.js";
import { serializePublicRosterBaseline } from "./rosterBaselinePublicSerializer.js";
import { recoverRosterBaselineForMatch, type RosterBaselineRecovery } from "./rosterBaselineRepository.js";

type MatchRow = RowDataPacket & { match_id: string; home_team_id: string | null; away_team_id: string | null; status: string; rule_profile_id: string | null };
type RosterRow = RowDataPacket & { player_id: string; team_id: string; player_team_id: string | null; display_name_snapshot: string; jersey_number_snapshot: string | null; is_starter: number | boolean; is_captain: number | boolean; roster_status: string };
type ReceiptRow = RowDataPacket & { request_hash: string; result: unknown };

export type RosterBaselineCommand = { matchId: string; teamSide: TeamSide; commandId: string; expectedSeq: number; correlationId: string };
export type RosterBaselineResult = { status: "ACCEPTED" | "DUPLICATE_ACCEPTED" | "REJECTED" | "SYNC_REQUIRED"; matchId: string; teamSide: TeamSide; currentSeq: number; eventId?: string; eventSeq?: number; reasonCode: string | null; message: string | null; projection?: unknown };
export type RosterBaselineFailureSeam = "afterEvent" | "afterHead" | "afterProtectedProjection" | "afterPublicProjection" | "afterSnapshot" | "afterReceipt" | "afterAudit" | "beforeCommit";
export type AuthoritativeRosterBaselineRecovery = Omit<RosterBaselineRecovery, "mode"> & { mode: RosterBaselineRecovery["mode"] | "CURRENT_PROJECTION" };
type FailureControls = {
  injectFailureAt?: RosterBaselineFailureSeam;
  onFailureSeam?: (seam: RosterBaselineFailureSeam, connection: PoolConnection) => Promise<void>;
  beforeStreamLockBarrier?: (connection: PoolConnection) => Promise<void>;
};

async function failAt(actual: RosterBaselineFailureSeam, controls: FailureControls, connection: PoolConnection) {
  if (actual !== controls.injectFailureAt) return;
  await controls.onFailureSeam?.(actual, connection);
  throw new Error(`INJECTED_ROSTER_BASELINE_FAILURE:${actual}`);
}

export async function importRosterBaseline(options: { pool: Pool; command: RosterBaselineCommand; user: AuthenticatedUser } & FailureControls): Promise<RosterBaselineResult> {
  const connection = await options.pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensurePlaceholderUser(connection, options.user);
    const requestHash = baselineRequestHash(options.command);
    const duplicate = await findReceipt(connection, options.command.matchId, options.command.commandId);
    if (duplicate) {
      await connection.rollback();
      if (duplicate.request_hash !== requestHash) return rejected(options.command, 0, "IDEMPOTENCY_COLLISION", "Idempotency key was already used with a different request");
      return { ...(parseJson(duplicate.result) as RosterBaselineResult), status: "DUPLICATE_ACCEPTED" };
    }

    await options.beforeStreamLockBarrier?.(connection);
    const currentSeq = await lockMatchStream(connection, options.command.matchId);
    if (currentSeq === null) { await connection.rollback(); return rejected(options.command, 0, "MATCH_NOT_FOUND", "Match stream was not found"); }
    const lockedDuplicate = await findReceipt(connection, options.command.matchId, options.command.commandId);
    if (lockedDuplicate) {
      await connection.rollback();
      if (lockedDuplicate.request_hash !== requestHash) return rejected(options.command, currentSeq, "IDEMPOTENCY_COLLISION", "Idempotency key was already used with a different request");
      return { ...(parseJson(lockedDuplicate.result) as RosterBaselineResult), status: "DUPLICATE_ACCEPTED" };
    }
    if (currentSeq !== options.command.expectedSeq) { await connection.rollback(); return { status: "SYNC_REQUIRED", matchId: options.command.matchId, teamSide: options.command.teamSide, currentSeq, reasonCode: "INVALID_EXPECTED_SEQ", message: `Expected seq ${options.command.expectedSeq}, current seq ${currentSeq}` }; }

    const match = await readMatchForUpdate(connection, options.command.matchId);
    if (!match) { await connection.rollback(); return rejected(options.command, currentSeq, "MATCH_NOT_FOUND", "Match was not found"); }
    if (match.status === "FINAL" || match.status === "CANCELLED") { await connection.rollback(); return rejected(options.command, currentSeq, "VALIDATION_ERROR", "Immutable matches cannot import a roster baseline"); }
    if (match.rule_profile_id !== "FIBA_2024") { await connection.rollback(); return rejected(options.command, currentSeq, "NOT_EVALUATED", "Only the closed-D1 FIBA_2024 profile is authorized for baseline readiness"); }

    const teamId = options.command.teamSide === "HOME" ? match.home_team_id : match.away_team_id;
    if (!teamId) { await connection.rollback(); return rejected(options.command, currentSeq, "INVALID_ROSTER_RELATIONSHIP", "Match side has no assigned team"); }
    const sourceRows = await readSourceRoster(connection, options.command.matchId, options.command.teamSide);
    const validation = validateSourceRoster(sourceRows, teamId);
    if ("message" in validation) {
      const message = validation.message;
      await connection.rollback();
      return rejected(options.command, currentSeq, "INVALID_ROSTER_RELATIONSHIP", message);
    }

    const members = validation.members;
    const sourceRevision = canonicalRosterBaselineHash({ matchId: options.command.matchId, matchTeamId: teamId, teamSide: options.command.teamSide, sourceRevision: "server-derived", members, ruleProfile: match.rule_profile_id });
    const existingRevision = await findSourceRevision(connection, options.command.matchId, options.command.teamSide, sourceRevision);
    if (existingRevision) { await connection.rollback(); return rejected(options.command, currentSeq, "DUPLICATE_SOURCE_REVISION", "This server-derived roster revision is already imported"); }

    const eventSeq = currentSeq + 1;
    const eventId = randomUUID();
    const version = { eventSeq, eventId, canonicalPayloadHash: canonicalRosterBaselineHash({ eventType: "MATCH_ROSTER_BASELINE_IMPORTED", schemaVersion: 1, matchId: options.command.matchId, matchTeamId: teamId, teamSide: options.command.teamSide, sourceRevision, members, ruleProfile: match.rule_profile_id, rosterVersion: { eventSeq, eventId } }) };
    const protectedProjection = buildRosterBaselineProjection({ matchId: options.command.matchId, teamSide: options.command.teamSide, matchTeamId: teamId, members, sourceRevision, version, ruleProfile: match.rule_profile_id, confirmation: null });
    const publicProjection = serializePublicRosterBaseline(protectedProjection);
    const eventPayload = {
      schemaVersion: 1,
      matchId: options.command.matchId,
      teamSide: options.command.teamSide,
      matchTeamId: teamId,
      members,
      source: { legacyRosterRevision: sourceRevision, importedAt: new Date().toISOString() },
      rulesProfile: match.rule_profile_id,
      rosterVersion: version,
      integrity: { issues: [] },
      confirmation: { status: "UNCONFIRMED" }
    };

    await connection.query("INSERT INTO match_events (event_id, match_id, seq_no, event_type, payload, actor_user_id, actor_role, device_id, occurred_at, command_id, expected_seq, correlation_id, causation_id, reason, rule_profile_id) VALUES (?, ?, ?, 'MATCH_ROSTER_BASELINE_IMPORTED', ?, ?, ?, ?, NOW(3), ?, ?, ?, NULL, NULL, ?)", [eventId, options.command.matchId, eventSeq, JSON.stringify(eventPayload), options.user.userId, options.user.role, options.user.deviceId, options.command.commandId, options.command.expectedSeq, options.command.correlationId, match.rule_profile_id]);
    await failAt("afterEvent", options, connection);
    await connection.query("UPDATE match_streams SET last_seq_no = ? WHERE match_id = ?", [eventSeq, options.command.matchId]);
    await failAt("afterHead", options, connection);
    await upsertProjection(connection, options.command.matchId, `roster-baseline-protected-${options.command.teamSide.toLowerCase()}`, eventSeq, protectedProjection);
    await failAt("afterProtectedProjection", options, connection);
    await upsertProjection(connection, options.command.matchId, `roster-baseline-public-${options.command.teamSide.toLowerCase()}`, eventSeq, publicProjection);
    await failAt("afterPublicProjection", options, connection);
    await connection.query("INSERT INTO match_roster_baseline_snapshots (snapshot_id, match_id, team_side, event_seq, event_id, canonical_payload_hash, projection_data) VALUES (?, ?, ?, ?, ?, ?, ?)", [randomUUID(), options.command.matchId, options.command.teamSide, eventSeq, eventId, version.canonicalPayloadHash, JSON.stringify({ snapshotSchemaVersion: 1, matchId: options.command.matchId, teamSide: options.command.teamSide, eventSeq, eventId, canonicalPayloadHash: version.canonicalPayloadHash, projection: protectedProjection })]);
    await failAt("afterSnapshot", options, connection);
    const result: RosterBaselineResult = { status: "ACCEPTED", matchId: options.command.matchId, teamSide: options.command.teamSide, currentSeq: eventSeq, eventId, eventSeq, reasonCode: null, message: null, projection: protectedProjection };
    await connection.query("INSERT INTO command_deduplication (command_id, match_id, command_type, request_hash, status, result) VALUES (?, ?, 'roster-baseline/import', ?, 'ACCEPTED', ?)", [options.command.commandId, options.command.matchId, requestHash, JSON.stringify(result)]);
    await failAt("afterReceipt", options, connection);
    await insertAuditLog(connection, { entityType: "match", entityId: options.command.matchId, action: "MATCH_ROSTER_BASELINE_IMPORTED", actorUserId: options.user.userId, actorRole: options.user.role, deviceId: options.user.deviceId, oldValue: null, newValue: { teamSide: options.command.teamSide, version }, reason: null, correlationId: options.command.correlationId, causationId: eventId, eventSeq });
    await failAt("afterAudit", options, connection);
    await failAt("beforeCommit", options, connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    const recovered = await recoverStreamConflict(options, error);
    if (recovered) return recovered;
    throw error;
  } finally { connection.release(); }
}

export async function getRosterBaselineProjection(pool: Pool, matchId: string, teamSide: TeamSide, view: "protected" | "public") {
  const connection = await pool.getConnection();
  try {
    const loaded = await loadAuthoritativeRosterBaseline(connection, matchId, teamSide);
    if (!loaded) return null;
    return view === "public" ? serializePublicRosterBaseline(loaded.projection) : loaded.projection;
  } finally { connection.release(); }
}

export async function loadAuthoritativeRosterBaseline(
  connection: PoolConnection,
  matchId: string,
  teamSide: TeamSide
): Promise<AuthoritativeRosterBaselineRecovery | null> {
  const currentSeq = await getCurrentSeq(connection, matchId);
  if (currentSeq === null) return null;
  const match = await readMatchIdentity(connection, matchId);
  if (!match) return null;
  const expectedMatchTeamId = teamSide === "HOME" ? match.home_team_id : match.away_team_id;
  if (!expectedMatchTeamId) return null;

  const [rows] = await connection.query<Array<RowDataPacket & { projection_data: unknown; last_event_seq: number | string }>>(
    "SELECT projection_data, last_event_seq FROM match_projections WHERE match_id = ? AND projection_type = ?",
    [matchId, `roster-baseline-protected-${teamSide.toLowerCase()}`]
  );
  const current = rows[0] ? parseJson(rows[0].projection_data) : null;
  if (rows[0] && Number(rows[0].last_event_seq) === currentSeq && isUsableRosterBaselineProjection(current, matchId, teamSide, currentSeq, expectedMatchTeamId)) {
    const anchor = current?.version?.eventSeq ? await getMatchEventBySeq(connection, matchId, current.version.eventSeq) : null;
    if (anchor && hasCanonicalRosterBaselineEventAnchor(current, anchor, teamSide, expectedMatchTeamId)) {
      return { projection: current, mode: "CURRENT_PROJECTION", snapshotEventSeq: null, tailEventSeqs: [] };
    }
  }

  return recoverRosterBaselineForMatch(connection, matchId, teamSide);
}

function isUsableRosterBaselineProjection(value: unknown, matchId: string, teamSide: TeamSide, currentSeq: number, expectedMatchTeamId: string): value is Awaited<ReturnType<typeof buildRosterBaselineProjection>> {
  if (!value || typeof value !== "object") return false;
  const projection = value as { matchId?: unknown; teamSide?: unknown; matchTeamId?: unknown; members?: unknown; projectionIntegrityHash?: unknown; version?: { eventSeq?: unknown; eventId?: unknown; canonicalPayloadHash?: unknown }; readiness?: { state?: unknown } };
  const versionValid = Number(projection.version?.eventSeq) === currentSeq && typeof projection.version?.eventId === "string" && typeof projection.version?.canonicalPayloadHash === "string";
  const readinessValid = projection.readiness?.state !== "ROSTER_NOT_CONFIRMED" && projection.readiness?.state !== "MALFORMED_LEGACY_STATE";
  return projection.matchId === matchId
    && projection.teamSide === teamSide
    && typeof projection.matchTeamId === "string"
    && projection.matchTeamId === expectedMatchTeamId
    && Array.isArray(projection.members)
    && projection.members.every((member) => isEligibilityStatus((member as { eligibilityState?: unknown }).eligibilityState))
    && projection.members.length > 0
    && versionValid
    && readinessValid
    && hasCanonicalRosterBaselineIntegrity(value as Awaited<ReturnType<typeof buildRosterBaselineProjection>>, matchId, expectedMatchTeamId);
}

function baselineRequestHash(command: RosterBaselineCommand) { return canonicalRosterBaselineHash({ teamSide: command.teamSide, sourceRevision: `${command.commandId}:${command.expectedSeq}:${command.correlationId}`, members: [] }); }
async function findReceipt(connection: PoolConnection, matchId: string, commandId: string) { const [rows] = await connection.query<ReceiptRow[]>("SELECT request_hash, result FROM command_deduplication WHERE match_id = ? AND command_id = ?", [matchId, commandId]); return rows[0] ?? null; }
async function readMatchIdentity(connection: PoolConnection, matchId: string) {
  const [rows] = await connection.query<MatchRow[]>("SELECT match_id, home_team_id, away_team_id, status, rule_profile_id FROM matches WHERE match_id = ?", [matchId]);
  return rows[0] ?? null;
}
async function readMatchForUpdate(connection: PoolConnection, matchId: string) { const [rows] = await connection.query<MatchRow[]>("SELECT match_id, home_team_id, away_team_id, status, rule_profile_id FROM matches WHERE match_id = ? FOR UPDATE", [matchId]); return rows[0] ?? null; }
async function readSourceRoster(connection: PoolConnection, matchId: string, teamSide: TeamSide) {
  const [rows] = await connection.query<RosterRow[]>(
    "SELECT mrp.player_id, mrp.team_id, p.team_id AS player_team_id, mrp.display_name_snapshot, mrp.jersey_number_snapshot, mrp.is_starter, mrp.is_captain, mrp.roster_status FROM match_roster_players mrp LEFT JOIN players p ON p.player_id = mrp.player_id WHERE mrp.match_id = ? AND mrp.team_side = ? ORDER BY mrp.player_id FOR UPDATE",
    [matchId, teamSide]
  );
  return rows;
}
async function findSourceRevision(connection: PoolConnection, matchId: string, teamSide: TeamSide, sourceRevision: string) {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT event_id FROM match_events WHERE match_id = ? AND event_type = 'MATCH_ROSTER_BASELINE_IMPORTED' AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.teamSide')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.source.legacyRosterRevision')) = ? LIMIT 1",
    [matchId, teamSide, sourceRevision]
  );
  return Boolean(rows[0]);
}
async function upsertProjection(connection: PoolConnection, matchId: string, projectionType: string, eventSeq: number, projection: unknown) { await connection.query("INSERT INTO match_projections (projection_id, match_id, projection_type, projection_version, last_event_seq, projection_data) VALUES (?, ?, ?, 1, ?, ?) ON DUPLICATE KEY UPDATE projection_data = VALUES(projection_data), last_event_seq = VALUES(last_event_seq), projection_version = projection_version + 1", [randomUUID(), matchId, projectionType, eventSeq, JSON.stringify(projection)]); }
function validateSourceRoster(rows: RosterRow[], teamId: string): { ok: true; members: BaselineMember[] } | { ok: false; message: string } {
  if (rows.length === 0) return { ok: false, message: "Roster source is empty or contains an unknown player/team membership" };
  const seen = new Set<string>();
  const members: BaselineMember[] = [];
  for (const row of rows) {
    if (!row.player_id || !row.team_id || !row.player_team_id || !row.display_name_snapshot?.trim()) return { ok: false, message: "Roster source contains a malformed player row" };
    if (row.team_id !== teamId || row.player_team_id !== teamId || seen.has(row.player_id)) return { ok: false, message: "Roster source contains an invalid team relationship or duplicate player" };
    if (row.roster_status !== "ACTIVE" && row.roster_status !== "BENCH" && row.roster_status !== "INACTIVE") return { ok: false, message: "Roster source contains an unsupported roster status" };
    seen.add(row.player_id);
    if (row.roster_status === "INACTIVE" && (Boolean(row.is_starter) || Boolean(row.is_captain))) return { ok: false, message: "Inactive player cannot be starter or captain" };
    members.push({ playerId: row.player_id, teamId: row.team_id, displayName: row.display_name_snapshot, jerseyNumber: row.jersey_number_snapshot, rosterStatus: row.roster_status as BaselineMember["rosterStatus"], isStarter: Boolean(row.is_starter), isCaptain: Boolean(row.is_captain), eligibilityState: "NOT_EVALUATED" });
  }
  return { ok: true, members };
}
function rejected(command: RosterBaselineCommand, currentSeq: number, reasonCode: string, message: string): RosterBaselineResult { return { status: "REJECTED", matchId: command.matchId, teamSide: command.teamSide, currentSeq, reasonCode, message }; }
function parseJson(value: unknown) { return typeof value === "string" ? JSON.parse(value) : value; }
async function recoverStreamConflict(options: { pool: Pool; command: RosterBaselineCommand }, error: unknown): Promise<RosterBaselineResult | null> {
  if (!isMatchStreamReadConflict(error)) return null;
  const connection = await options.pool.getConnection();
  try {
    const duplicate = await findReceipt(connection, options.command.matchId, options.command.commandId);
    if (duplicate) {
      if (duplicate.request_hash !== baselineRequestHash(options.command)) return rejected(options.command, 0, "IDEMPOTENCY_COLLISION", "Idempotency key was already used with a different request");
      return { ...(parseJson(duplicate.result) as RosterBaselineResult), status: "DUPLICATE_ACCEPTED" };
    }
    const currentSeq = await getCurrentSeq(connection, options.command.matchId);
    return currentSeq === null ? null : { status: "SYNC_REQUIRED", matchId: options.command.matchId, teamSide: options.command.teamSide, currentSeq, reasonCode: "INVALID_EXPECTED_SEQ", message: `Expected seq ${options.command.expectedSeq}, current seq ${currentSeq}` };
  } finally { connection.release(); }
}
