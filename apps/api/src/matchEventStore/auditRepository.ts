import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { parseJsonField } from "./json";

export type AuditLogInput = {
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string;
  actorRole: string;
  deviceId: string;
  oldValue: unknown | null;
  newValue: unknown | null;
  reason: string | null;
  correlationId: string;
  causationId: string | null;
  eventSeq: number | null;
};

export type AuditLogRecord = AuditLogInput & {
  auditId: string;
  createdAt: string;
};

type AuditLogRow = RowDataPacket & {
  audit_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id: string;
  actor_role: string;
  device_id: string;
  old_value: unknown | null;
  new_value: unknown | null;
  reason: string | null;
  correlation_id: string;
  causation_id: string | null;
  event_seq: number | null;
  created_at: Date;
};

export async function insertAuditLog(connection: PoolConnection, input: AuditLogInput) {
  const auditId = randomUUID();

  await connection.query(
    "INSERT IGNORE INTO users (user_id, email, display_name, status) VALUES (?, ?, ?, 'ACTIVE')",
    [input.actorUserId, `${input.actorUserId}@audit.local`, "Audit Actor"]
  );
  await connection.query(
    "INSERT INTO audit_logs (audit_id, entity_type, entity_id, action, actor_user_id, actor_role, device_id, old_value, new_value, reason, correlation_id, causation_id, event_seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      auditId,
      input.entityType,
      input.entityId,
      input.action,
      input.actorUserId,
      input.actorRole,
      input.deviceId,
      input.oldValue === null ? null : JSON.stringify(input.oldValue),
      input.newValue === null ? null : JSON.stringify(input.newValue),
      input.reason,
      input.correlationId,
      input.causationId,
      input.eventSeq
    ]
  );

  return { auditId };
}

export async function listAuditLogsForMatch(connection: PoolConnection, matchId: string) {
  const [rows] = await connection.query<AuditLogRow[]>(
    "SELECT audit_id, entity_type, entity_id, action, actor_user_id, actor_role, device_id, old_value, new_value, reason, correlation_id, causation_id, event_seq, created_at FROM audit_logs WHERE entity_type = 'match' AND entity_id = ? ORDER BY created_at ASC",
    [matchId]
  );

  return rows.map(toAuditLogRecord);
}

function toAuditLogRecord(row: AuditLogRow): AuditLogRecord {
  return {
    auditId: row.audit_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    deviceId: row.device_id,
    oldValue: row.old_value === null ? null : parseJsonField(row.old_value),
    newValue: row.new_value === null ? null : parseJsonField(row.new_value),
    reason: row.reason,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    eventSeq: row.event_seq,
    createdAt: row.created_at.toISOString()
  };
}
