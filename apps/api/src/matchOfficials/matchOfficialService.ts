import { randomUUID } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  reasonCodes,
  type MatchOfficialRoleCode,
  type OfficialCandidate,
  type PermissionCode,
  type RoleCode
} from "@basket-scoreboard/api-contracts";
import type { AuthenticatedUser } from "../auth/sessionAuth.js";
import { insertAuditLog } from "../matchEventStore/auditRepository.js";

type Queryable = Pool | PoolConnection;

type AssignmentRow = RowDataPacket & {
  id: string;
  match_id: string;
  user_id: string;
  display_name: string | null;
  role_code: MatchOfficialRoleCode;
  assignment_status: string;
  assigned_by_user_id: string | null;
  assigned_at: Date;
  revoked_by_user_id: string | null;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date | null;
};

type CountRow = RowDataPacket & {
  count: number;
};

type OfficialCandidateRow = RowDataPacket & {
  user_id: string;
  display_name: string | null;
  role_key: RoleCode;
};

export type MatchOfficialAssignment = {
  id: string;
  matchId: string;
  userId: string;
  displayName: string | null;
  roleCode: MatchOfficialRoleCode;
  assignmentStatus: string;
  assignedByUserId: string | null;
  assignedAt: string;
  revokedByUserId: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type AssignmentResult =
  | { ok: true; assignment: MatchOfficialAssignment; statusCode: number }
  | { ok: false; reasonCode: string; message: string; statusCode: number };

const allowedRoleCodes = new Set<string>([
  "REFEREE",
  "SCORER",
  "ASSISTANT_SCORER",
  "TIMER",
  "SHOT_CLOCK_OPERATOR",
  "MATCH_OPERATOR"
]);

export function isMatchOfficialRoleCode(value: string): value is MatchOfficialRoleCode {
  return allowedRoleCodes.has(value);
}

export function assignmentRoleAllowsPermission(roleCode: string, permission: PermissionCode) {
  if (permission === "match.read") {
    return true;
  }

  if (permission === "match.score.operate") {
    return roleCode === "SCORER" || roleCode === "ASSISTANT_SCORER" || roleCode === "MATCH_OPERATOR";
  }

  if (permission === "match.correction.request") {
    return (
      roleCode === "SCORER" ||
      roleCode === "ASSISTANT_SCORER" ||
      roleCode === "MATCH_OPERATOR" ||
      roleCode === "REFEREE"
    );
  }

  if (permission === "match.correction.apply" || permission === "match.correction.reject") {
    return roleCode === "REFEREE";
  }

  return false;
}

async function exists(queryable: Queryable, sql: string, values: unknown[]) {
  const [rows] = await queryable.query<CountRow[]>(sql, values);

  return Number(rows[0]?.count ?? 0) > 0;
}

async function getAssignmentById(queryable: Queryable, assignmentId: string) {
  const [rows] = await queryable.query<AssignmentRow[]>(
    `SELECT
      mo.id,
      mo.match_id,
      mo.user_id,
      COALESCE(NULLIF(u.display_name, ''), u.email, mo.user_id) AS display_name,
      mo.role_code,
      mo.assignment_status,
      mo.assigned_by_user_id,
      mo.assigned_at,
      mo.revoked_by_user_id,
      mo.revoked_at,
      mo.created_at,
      mo.updated_at
    FROM match_officials mo
    LEFT JOIN users u ON u.user_id = mo.user_id
    WHERE mo.id = ?`,
    [assignmentId]
  );

  return rows[0] ? toAssignment(rows[0]) : null;
}

async function getAssignmentByMatchUserRole(
  queryable: Queryable,
  matchId: string,
  userId: string,
  roleCode: MatchOfficialRoleCode
) {
  const [rows] = await queryable.query<AssignmentRow[]>(
    `SELECT
      mo.id,
      mo.match_id,
      mo.user_id,
      COALESCE(NULLIF(u.display_name, ''), u.email, mo.user_id) AS display_name,
      mo.role_code,
      mo.assignment_status,
      mo.assigned_by_user_id,
      mo.assigned_at,
      mo.revoked_by_user_id,
      mo.revoked_at,
      mo.created_at,
      mo.updated_at
    FROM match_officials mo
    LEFT JOIN users u ON u.user_id = mo.user_id
    WHERE mo.match_id = ? AND mo.user_id = ? AND mo.role_code = ?`,
    [matchId, userId, roleCode]
  );

  return rows[0] ? toAssignment(rows[0]) : null;
}

export async function assignMatchOfficial(
  pool: Pool,
  actor: AuthenticatedUser,
  matchId: string,
  userId: string,
  roleCode: MatchOfficialRoleCode
): Promise<AssignmentResult> {
  if (actor.role !== "ADMIN") {
    return { ok: false, reasonCode: reasonCodes.FORBIDDEN, message: "Admin role is required", statusCode: 403 };
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (!(await exists(connection, "SELECT COUNT(*) AS count FROM matches WHERE match_id = ?", [matchId]))) {
      await connection.rollback();
      return { ok: false, reasonCode: reasonCodes.MATCH_NOT_FOUND, message: "Match not found", statusCode: 404 };
    }

    if (!(await exists(connection, "SELECT COUNT(*) AS count FROM users WHERE user_id = ?", [userId]))) {
      await connection.rollback();
      return {
        ok: false,
        reasonCode: reasonCodes.USER_NOT_FOUND,
        message: "Please select a valid official.",
        statusCode: 404
      };
    }

    const existing = await getAssignmentByMatchUserRole(connection, matchId, userId, roleCode);

    if (existing?.assignmentStatus === "ACTIVE") {
      await connection.rollback();
      return {
        ok: false,
        reasonCode: reasonCodes.DUPLICATE_ASSIGNMENT,
        message: "Assignment already exists",
        statusCode: 409
      };
    }

    let assignment: MatchOfficialAssignment;

    if (existing) {
      await connection.query(
        "UPDATE match_officials SET assignment_status = 'ACTIVE', assigned_by_user_id = ?, assigned_at = NOW(3), revoked_by_user_id = NULL, revoked_at = NULL, updated_at = NOW(3) WHERE id = ?",
        [actor.userId, existing.id]
      );
      assignment = (await getAssignmentById(connection, existing.id))!;
    } else {
      const assignmentId = randomUUID();
      await connection.query(
        "INSERT INTO match_officials (id, match_id, user_id, role_code, assignment_status, assigned_by_user_id, assigned_at, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, NOW(3), NOW(3))",
        [assignmentId, matchId, userId, roleCode, actor.userId]
      );
      assignment = (await getAssignmentById(connection, assignmentId))!;
    }

    await insertAuditLog(connection, {
      entityType: "match_official",
      entityId: assignment.id,
      action: "MATCH_OFFICIAL_ASSIGNED",
      actorUserId: actor.userId,
      actorRole: actor.role,
      deviceId: actor.deviceId,
      oldValue: existing,
      newValue: { ...assignment, targetUserId: userId, matchId },
      reason: null,
      correlationId: randomUUID(),
      causationId: null,
      eventSeq: null
    });
    await connection.commit();

    return { ok: true, assignment, statusCode: existing ? 200 : 201 };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listOfficialCandidates(queryable: Queryable): Promise<OfficialCandidate[]> {
  const [rows] = await queryable.query<OfficialCandidateRow[]>(
    `SELECT
      u.user_id,
      NULLIF(u.display_name, '') AS display_name,
      r.role_key
    FROM users u
    INNER JOIN user_roles ur ON ur.user_id = u.user_id
    INNER JOIN roles r ON r.role_id = ur.role_id
    WHERE u.status = 'ACTIVE'
      AND r.role_key IN ('ADMIN', 'SCORER', 'REFEREE')
    ORDER BY COALESCE(NULLIF(u.display_name, ''), u.user_id) ASC, r.role_key ASC`
  );

  const candidates = new Map<string, OfficialCandidate>();
  for (const row of rows) {
    const existing = candidates.get(row.user_id);
    if (existing) {
      if (!existing.roles.includes(row.role_key)) {
        existing.roles.push(row.role_key);
      }
      continue;
    }

    candidates.set(row.user_id, {
      userId: row.user_id,
      displayName: row.display_name,
      roles: [row.role_key]
    });
  }

  return [...candidates.values()].map((candidate) => ({
    ...candidate,
    roles: [...candidate.roles].sort()
  }));
}

export async function revokeMatchOfficial(
  pool: Pool,
  actor: AuthenticatedUser,
  assignmentId: string,
  reason: string
): Promise<AssignmentResult> {
  if (actor.role !== "ADMIN") {
    return { ok: false, reasonCode: reasonCodes.FORBIDDEN, message: "Admin role is required", statusCode: 403 };
  }

  if (!reason.trim()) {
    return {
      ok: false,
      reasonCode: reasonCodes.REASON_REQUIRED,
      message: "Reason is required",
      statusCode: 400
    };
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const existing = await getAssignmentById(connection, assignmentId);

    if (!existing) {
      await connection.rollback();
      return {
        ok: false,
        reasonCode: reasonCodes.ASSIGNMENT_NOT_FOUND,
        message: "Assignment not found",
        statusCode: 404
      };
    }

    if (existing.assignmentStatus !== "ACTIVE") {
      await connection.rollback();
      return {
        ok: false,
        reasonCode: reasonCodes.ASSIGNMENT_INACTIVE,
        message: "Assignment is not active",
        statusCode: 409
      };
    }

    await connection.query(
      "UPDATE match_officials SET assignment_status = 'REVOKED', revoked_by_user_id = ?, revoked_at = NOW(3), updated_at = NOW(3) WHERE id = ?",
      [actor.userId, assignmentId]
    );
    const assignment = (await getAssignmentById(connection, assignmentId))!;
    await insertAuditLog(connection, {
      entityType: "match_official",
      entityId: assignment.id,
      action: "MATCH_OFFICIAL_REVOKED",
      actorUserId: actor.userId,
      actorRole: actor.role,
      deviceId: actor.deviceId,
      oldValue: existing,
      newValue: assignment,
      reason,
      correlationId: randomUUID(),
      causationId: null,
      eventSeq: null
    });
    await connection.commit();

    return { ok: true, assignment, statusCode: 200 };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listMatchOfficials(queryable: Queryable, matchId: string) {
  const [rows] = await queryable.query<AssignmentRow[]>(
    `SELECT
      mo.id,
      mo.match_id,
      mo.user_id,
      COALESCE(NULLIF(u.display_name, ''), u.email, mo.user_id) AS display_name,
      mo.role_code,
      mo.assignment_status,
      mo.assigned_by_user_id,
      mo.assigned_at,
      mo.revoked_by_user_id,
      mo.revoked_at,
      mo.created_at,
      mo.updated_at
    FROM match_officials mo
    LEFT JOIN users u ON u.user_id = mo.user_id
    WHERE mo.match_id = ?
    ORDER BY mo.assigned_at ASC, mo.id ASC`,
    [matchId]
  );

  return rows.map(toAssignment);
}

export async function getUserMatchAssignments(queryable: Queryable, userId: string) {
  const [rows] = await queryable.query<AssignmentRow[]>(
    `SELECT
      mo.id,
      mo.match_id,
      mo.user_id,
      COALESCE(NULLIF(u.display_name, ''), u.email, mo.user_id) AS display_name,
      mo.role_code,
      mo.assignment_status,
      mo.assigned_by_user_id,
      mo.assigned_at,
      mo.revoked_by_user_id,
      mo.revoked_at,
      mo.created_at,
      mo.updated_at
    FROM match_officials mo
    LEFT JOIN users u ON u.user_id = mo.user_id
    WHERE mo.user_id = ? AND mo.assignment_status = 'ACTIVE'
    ORDER BY mo.assigned_at ASC, mo.id ASC`,
    [userId]
  );

  return rows.map(toAssignment);
}

export async function isUserAssignedToMatch(
  queryable: Queryable,
  userId: string,
  matchId: string,
  permission: PermissionCode
) {
  const assignments = await getUserMatchAssignments(queryable, userId);

  return assignments.some(
    (assignment) => assignment.matchId === matchId && assignmentRoleAllowsPermission(assignment.roleCode, permission)
  );
}

function toAssignment(row: AssignmentRow): MatchOfficialAssignment {
  return {
    id: row.id,
    matchId: row.match_id,
    userId: row.user_id,
    displayName: row.display_name,
    roleCode: row.role_code,
    assignmentStatus: row.assignment_status,
    assignedByUserId: row.assigned_by_user_id,
    assignedAt: row.assigned_at.toISOString(),
    revokedByUserId: row.revoked_by_user_id,
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null
  };
}
