import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { buildApiApp } from "../../apps/api/src/app";
import { createDatabasePool } from "../../apps/api/src/db";
import { hasDatabaseEnv } from "../../apps/api/src/config/env";
import {
  MariaDbMigrationConnection,
  getDefaultMigrationsDir,
  runMigrations
} from "../../apps/api/src/migrations";

const describeDb = hasDatabaseEnv() ? describe : describe.skip;

async function buildMigratedApp() {
  const pool = createDatabasePool();
  const connection = await pool.getConnection();

  try {
    await runMigrations({
      migrationsDir: getDefaultMigrationsDir(),
      connection: new MariaDbMigrationConnection(connection)
    });
  } finally {
    connection.release();
  }

  return { app: buildApiApp({ pool }), pool };
}

async function seedRolePermission(pool: Pool, roleKey: string, permissionKeys: string[]) {
  await pool.query(
    "INSERT IGNORE INTO roles (role_id, role_key, role_name) VALUES (?, ?, ?)",
    [randomUUID(), roleKey, roleKey]
  );
  const [roleRows] = await pool.query<RowDataPacket[]>(
    "SELECT role_id FROM roles WHERE role_key = ?",
    [roleKey]
  );

  for (const permissionKey of permissionKeys) {
    await pool.query(
      "INSERT IGNORE INTO permissions (permission_id, permission_key, description) VALUES (?, ?, ?)",
      [randomUUID(), permissionKey, permissionKey]
    );
    const [permissionRows] = await pool.query<RowDataPacket[]>(
      "SELECT permission_id FROM permissions WHERE permission_key = ?",
      [permissionKey]
    );
    await pool.query(
      "INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
      [roleRows[0]!.role_id, permissionRows[0]!.permission_id]
    );
  }
}

async function seedUser(pool: Pool, roleKey: "ADMIN" | "SCORER" | "REFEREE" | "VIEWER") {
  const userId = randomUUID();
  const email = `${userId}@example.com`;
  const password = "correct horse battery";
  const passwordHash = await bcrypt.hash(password, 10);
  const permissions =
    roleKey === "ADMIN"
      ? [
          "match.create",
          "match.read",
          "match.score.operate",
          "match.correction.request",
          "match.correction.apply",
          "match.correction.reject",
          "match.audit.read",
          "public.scoreboard.read"
        ]
      : roleKey === "VIEWER"
        ? ["match.read", "public.scoreboard.read"]
        : ["match.read", "match.score.operate", "match.correction.request", "public.scoreboard.read"];

  await seedRolePermission(pool, roleKey, permissions);
  const [roleRows] = await pool.query<RowDataPacket[]>(
    "SELECT role_id FROM roles WHERE role_key = ?",
    [roleKey]
  );
  await pool.query(
    "INSERT INTO users (user_id, email, display_name, password_hash, status) VALUES (?, ?, ?, ?, 'ACTIVE')",
    [userId, email, `${roleKey} User`, passwordHash]
  );
  await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [
    userId,
    roleRows[0]!.role_id
  ]);

  return { userId, email, password };
}

async function login(app: ReturnType<typeof buildApiApp>, email: string, password: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password }
  });

  return {
    cookie: String(response.headers["set-cookie"]).split(";")[0]!,
    csrfToken: response.json<{ data: { csrfToken: string } }>().data.csrfToken
  };
}

async function createMatch(app: ReturnType<typeof buildApiApp>, session: { cookie: string; csrfToken: string }) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/matches",
    headers: { cookie: session.cookie, "x-csrf-token": session.csrfToken },
    payload: { matchCode: `M-${randomUUID()}`, ruleProfileId: "FIBA_2024" }
  });

  expect(response.statusCode).toBe(201);
  return response.json<{ matchId: string }>().matchId;
}

function scoreCommand(matchId: string, expectedSeq: number) {
  return {
    commandId: randomUUID(),
    matchId,
    expectedSeq,
    correlationId: randomUUID(),
    clientTimestamp: new Date().toISOString(),
    payload: {
      teamSide: "HOME",
      points: 2,
      playerId: null,
      periodNumber: 1,
      gameClockRemainingMs: 590000,
      note: null,
      role: "ADMIN",
      assignedMatchIds: [matchId]
    }
  };
}

describeDb("match official assignment workflow", () => {
  it("lets admin assign, list, expose /me assignments, authorize assigned scorer, audit and revoke", async () => {
    process.env.AUTH_COOKIE_SECURE = "false";
    const { app, pool } = await buildMigratedApp();

    try {
      const admin = await seedUser(pool, "ADMIN");
      const scorer = await seedUser(pool, "SCORER");
      const viewer = await seedUser(pool, "VIEWER");
      const adminSession = await login(app, admin.email, admin.password);
      const scorerSession = await login(app, scorer.email, scorer.password);
      const viewerSession = await login(app, viewer.email, viewer.password);
      const matchA = await createMatch(app, adminSession);
      const matchB = await createMatch(app, adminSession);

      const unassignedScore = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchA}/commands/score/add`,
        headers: { cookie: scorerSession.cookie, "x-csrf-token": scorerSession.csrfToken },
        payload: scoreCommand(matchA, 0)
      });
      expect(unassignedScore.statusCode).toBe(403);
      expect(unassignedScore.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_ASSIGNED" } });

      const assignWithoutCsrf = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchA}/officials`,
        headers: { cookie: adminSession.cookie },
        payload: { userId: scorer.userId, roleCode: "SCORER" }
      });
      expect(assignWithoutCsrf.statusCode).toBe(403);
      expect(assignWithoutCsrf.json()).toMatchObject({ error: { reasonCode: "CSRF_REQUIRED" } });

      const assignResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchA}/officials`,
        headers: { cookie: adminSession.cookie, "x-csrf-token": adminSession.csrfToken },
        payload: { userId: scorer.userId, roleCode: "SCORER" }
      });
      expect(assignResponse.statusCode).toBe(201);
      expect(assignResponse.json()).toMatchObject({
        ok: true,
        data: {
          assignment: {
            matchId: matchA,
            userId: scorer.userId,
            roleCode: "SCORER",
            assignmentStatus: "ACTIVE"
          }
        }
      });
      const assignmentId = assignResponse.json<{ data: { assignment: { id: string } } }>().data.assignment.id;

      const duplicateAssign = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchA}/officials`,
        headers: { cookie: adminSession.cookie, "x-csrf-token": adminSession.csrfToken },
        payload: { userId: scorer.userId, roleCode: "SCORER" }
      });
      expect(duplicateAssign.statusCode).toBe(409);
      expect(duplicateAssign.json()).toMatchObject({ error: { reasonCode: "DUPLICATE_ASSIGNMENT" } });

      const listResponse = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchA}/officials`,
        headers: { cookie: adminSession.cookie }
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toMatchObject({
        ok: true,
        data: {
          officials: [
            expect.objectContaining({
              id: assignmentId,
              userId: scorer.userId,
              roleCode: "SCORER"
            })
          ]
        }
      });

      const scorerMe = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { cookie: scorerSession.cookie }
      });
      expect(scorerMe.json()).toMatchObject({
        data: {
          user: {
            matchAssignments: [
              expect.objectContaining({
                matchId: matchA,
                roleCode: "SCORER",
                assignmentStatus: "ACTIVE"
              })
            ]
          }
        }
      });

      const assignedScore = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchA}/commands/score/add`,
        headers: { cookie: scorerSession.cookie, "x-csrf-token": scorerSession.csrfToken },
        payload: scoreCommand(matchA, 0)
      });
      expect(assignedScore.statusCode).toBe(200);
      expect(assignedScore.json()).toMatchObject({ status: "ACCEPTED", currentSeq: 1 });

      const otherMatchScore = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchB}/commands/score/add`,
        headers: { cookie: scorerSession.cookie, "x-csrf-token": scorerSession.csrfToken },
        payload: scoreCommand(matchB, 0)
      });
      expect(otherMatchScore.statusCode).toBe(403);
      expect(otherMatchScore.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_ASSIGNED" } });

      await pool.query(
        "INSERT INTO match_officials (id, match_id, user_id, role_code, assignment_status, assigned_by_user_id, assigned_at, created_at) VALUES (?, ?, ?, 'SCORER', 'ACTIVE', ?, NOW(3), NOW(3))",
        [randomUUID(), matchA, viewer.userId, admin.userId]
      );
      const viewerScore = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchA}/commands/score/add`,
        headers: { cookie: viewerSession.cookie, "x-csrf-token": viewerSession.csrfToken },
        payload: scoreCommand(matchA, 1)
      });
      expect(viewerScore.statusCode).toBe(403);
      expect(viewerScore.json()).toMatchObject({ error: { reasonCode: "FORBIDDEN" } });

      const revokeWithoutReason = await app.inject({
        method: "DELETE",
        url: `/api/v1/matches/${matchA}/officials/${assignmentId}`,
        headers: { cookie: adminSession.cookie, "x-csrf-token": adminSession.csrfToken },
        payload: { reason: "" }
      });
      expect(revokeWithoutReason.statusCode).toBe(400);
      expect(revokeWithoutReason.json()).toMatchObject({ error: { reasonCode: "VALIDATION_ERROR" } });

      const revokeResponse = await app.inject({
        method: "DELETE",
        url: `/api/v1/matches/${matchA}/officials/${assignmentId}`,
        headers: { cookie: adminSession.cookie, "x-csrf-token": adminSession.csrfToken },
        payload: { reason: "assignment changed" }
      });
      expect(revokeResponse.statusCode).toBe(200);
      expect(revokeResponse.json()).toMatchObject({
        ok: true,
        data: {
          assignment: {
            id: assignmentId,
            assignmentStatus: "REVOKED"
          }
        }
      });

      const afterRevokeScore = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchA}/commands/score/add`,
        headers: { cookie: scorerSession.cookie, "x-csrf-token": scorerSession.csrfToken },
        payload: scoreCommand(matchA, 1)
      });
      expect(afterRevokeScore.statusCode).toBe(403);
      expect(afterRevokeScore.json()).toMatchObject({ error: { reasonCode: "MATCH_NOT_ASSIGNED" } });

      const [auditRows] = await pool.query<RowDataPacket[]>(
        "SELECT action, entity_id, reason FROM audit_logs WHERE entity_id = ? ORDER BY created_at ASC",
        [assignmentId]
      );
      expect(auditRows.map((row) => row.action)).toEqual([
        "MATCH_OFFICIAL_ASSIGNED",
        "MATCH_OFFICIAL_REVOKED"
      ]);
      expect(auditRows[1]!.reason).toBe("assignment changed");

      const publicResponse = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${matchA}/scoreboard`
      });
      expect(publicResponse.statusCode).toBe(200);
      expect(JSON.stringify(publicResponse.json())).not.toContain("matchAssignments");
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("denies non-admin assignment changes", async () => {
    process.env.AUTH_COOKIE_SECURE = "false";
    const { app, pool } = await buildMigratedApp();

    try {
      const admin = await seedUser(pool, "ADMIN");
      const scorer = await seedUser(pool, "SCORER");
      const adminSession = await login(app, admin.email, admin.password);
      const scorerSession = await login(app, scorer.email, scorer.password);
      const matchId = await createMatch(app, adminSession);

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/officials`,
        headers: { cookie: scorerSession.cookie, "x-csrf-token": scorerSession.csrfToken },
        payload: { userId: scorer.userId, roleCode: "SCORER" }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { reasonCode: "FORBIDDEN" } });
    } finally {
      await app.close();
      await pool.end();
    }
  });
});
