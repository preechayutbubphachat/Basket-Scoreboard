import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import Fastify from "fastify";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { buildApiApp } from "../../apps/api/src/app";
import { createAuthHandlers } from "../../apps/api/src/auth/sessionAuth";
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
  const roleId = randomUUID();
  await pool.query(
    "INSERT IGNORE INTO roles (role_id, role_key, role_name) VALUES (?, ?, ?)",
    [roleId, roleKey, roleKey]
  );
  const [roleRows] = await pool.query<RowDataPacket[]>(
    "SELECT role_id FROM roles WHERE role_key = ?",
    [roleKey]
  );
  const actualRoleId = roleRows[0]!.role_id as string;

  for (const permissionKey of permissionKeys) {
    const permissionId = randomUUID();
    await pool.query(
      "INSERT IGNORE INTO permissions (permission_id, permission_key, description) VALUES (?, ?, ?)",
      [permissionId, permissionKey, permissionKey]
    );
    const [permissionRows] = await pool.query<RowDataPacket[]>(
      "SELECT permission_id FROM permissions WHERE permission_key = ?",
      [permissionKey]
    );
    await pool.query(
      "INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
      [actualRoleId, permissionRows[0]!.permission_id]
    );
  }

  return actualRoleId;
}

async function seedUser(pool: Pool, options: { roleKey: string; status?: "ACTIVE" | "DISABLED" }) {
  const userId = randomUUID();
  const email = `${userId}@example.com`;
  const password = "correct horse battery";
  const passwordHash = await bcrypt.hash(password, 10);
  const roleId = await seedRolePermission(pool, options.roleKey, [
    "match.create",
    "match.read",
    "match.score.operate",
    "match.correction.request",
    "match.correction.apply",
    "match.correction.reject",
    "match.audit.read",
    "public.scoreboard.read"
  ]);

  await pool.query(
    "INSERT INTO users (user_id, email, display_name, password_hash, status) VALUES (?, ?, ?, ?, ?)",
    [userId, email, "Test User", passwordHash, options.status ?? "ACTIVE"]
  );
  await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userId, roleId]);

  return { userId, email, password };
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
      role: "ADMIN"
    }
  };
}

describe("production auth safety", () => {
  it("exempts routes from broad auth and csrf write guards through route metadata", async () => {
    const app = Fastify({ logger: false });
    const auth = createAuthHandlers({} as never);

    app.post(
      "/metadata-public-login-probe",
      {
        config: {
          authRequired: false,
          csrfRequired: false,
          publicRoute: true
        },
        preHandler: [auth.requireAuth, auth.requireCsrf]
      },
      async () => ({ reachedCredentialValidation: true })
    );

    try {
      const response = await app.inject({
        method: "POST",
        url: "/metadata-public-login-probe",
        payload: { email: "admin@example.com", password: "wrong-password" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ reachedCredentialValidation: true });
    } finally {
      await app.close();
    }
  });

  it("keeps exact login path as a defensive fallback for broad auth and csrf write guards", async () => {
    const app = Fastify({ logger: false });
    const auth = createAuthHandlers({} as never);

    app.post(
      "/api/v1/auth/login",
      {
        preHandler: [auth.requireAuth, auth.requireCsrf]
      },
      async () => ({ reachedCredentialValidation: true })
    );

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "admin@example.com", password: "wrong-password" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ reachedCredentialValidation: true });
    } finally {
      await app.close();
    }
  });

  it("rejects dev headers in production unless DEV_AUTH_ENABLED is true", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDevAuthEnabled = process.env.DEV_AUTH_ENABLED;
    process.env.NODE_ENV = "production";
    delete process.env.DEV_AUTH_ENABLED;
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: { reasonCode: "DEV_AUTH_DISABLED" }
      });
    } finally {
      await app.close();
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousDevAuthEnabled === undefined) delete process.env.DEV_AUTH_ENABLED;
      else process.env.DEV_AUTH_ENABLED = previousDevAuthEnabled;
    }
  });
});

describeDb("production session authentication", () => {
  it("logs in, returns /me roles and permissions, protects writes with CSRF, and logs out", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.AUTH_COOKIE_SECURE = "false";
    const { app, pool } = await buildMigratedApp();

    try {
      const admin = await seedUser(pool, { roleKey: "ADMIN" });
      const unauthenticatedMe = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me"
      });
      expect(unauthenticatedMe.statusCode).toBe(401);
      expect(unauthenticatedMe.json()).toMatchObject({
        error: { reasonCode: "UNAUTHENTICATED" }
      });

      const invalidPassword = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: admin.email, password: "wrong-password" }
      });
      expect(invalidPassword.statusCode).toBe(401);
      expect(invalidPassword.json()).toMatchObject({
        error: { reasonCode: "INVALID_CREDENTIALS" }
      });
      expect(JSON.stringify(invalidPassword.json())).not.toContain("CSRF_REQUIRED");

      const loginResponse = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: admin.email, password: admin.password }
      });

      expect(loginResponse.statusCode).toBe(200);
      expect(loginResponse.headers["set-cookie"]).toContain("HttpOnly");
      expect(loginResponse.json()).toMatchObject({
        ok: true,
        data: {
          user: {
            userId: admin.userId,
            roles: ["ADMIN"],
            permissions: expect.arrayContaining(["match.create", "match.score.operate"])
          },
          csrfToken: expect.any(String)
        }
      });
      expect(JSON.stringify(loginResponse.json())).not.toContain("password_hash");
      expect(JSON.stringify(loginResponse.json())).not.toContain("session_token_hash");
      expect(JSON.stringify(loginResponse.json())).not.toContain("csrf_token_hash");

      const cookie = String(loginResponse.headers["set-cookie"]).split(";")[0]!;
      const csrfToken = loginResponse.json<{ data: { csrfToken: string } }>().data.csrfToken;
      const meResponse = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { cookie }
      });
      expect(meResponse.statusCode).toBe(200);
      expect(meResponse.json()).toMatchObject({
        ok: true,
        data: {
          user: {
            userId: admin.userId,
            roles: ["ADMIN"],
            permissions: expect.arrayContaining(["match.read"])
          }
        }
      });

      const createWithoutCsrf = await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        headers: { cookie },
        payload: { matchCode: `M-${randomUUID()}`, ruleProfileId: "FIBA_2024" }
      });
      expect(createWithoutCsrf.statusCode).toBe(403);
      expect(createWithoutCsrf.json()).toMatchObject({ error: { reasonCode: "CSRF_REQUIRED" } });

      const createWithCsrf = await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: { matchCode: `M-${randomUUID()}`, ruleProfileId: "FIBA_2024" }
      });
      expect(createWithCsrf.statusCode).toBe(201);
      const created = createWithCsrf.json<{ matchId: string }>();

      const scoreWithoutCsrf = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/score/add`,
        headers: { cookie },
        payload: scoreCommand(created.matchId, 0)
      });
      expect(scoreWithoutCsrf.statusCode).toBe(403);
      expect(scoreWithoutCsrf.json()).toMatchObject({ error: { reasonCode: "CSRF_REQUIRED" } });

      const scoreResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/score/add`,
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: scoreCommand(created.matchId, 0)
      });
      expect(scoreResponse.statusCode).toBe(200);
      expect(scoreResponse.json()).toMatchObject({ status: "ACCEPTED", currentSeq: 1 });

      const [eventRows] = await pool.query<RowDataPacket[]>(
        "SELECT actor_user_id, actor_role FROM match_events WHERE match_id = ? AND seq_no = 1",
        [created.matchId]
      );
      expect(eventRows[0]!.actor_user_id).toBe(admin.userId);
      expect(eventRows[0]!.actor_role).toBe("ADMIN");

      const logoutWithoutCsrf = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: { cookie }
      });
      expect(logoutWithoutCsrf.statusCode).toBe(403);
      expect(logoutWithoutCsrf.json()).toMatchObject({ error: { reasonCode: "CSRF_REQUIRED" } });

      const logoutResponse = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: { cookie, "x-csrf-token": csrfToken }
      });
      expect(logoutResponse.statusCode).toBe(200);
      expect(logoutResponse.headers["set-cookie"]).toContain("Max-Age=0");

      const afterLogout = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { cookie }
      });
      expect(afterLogout.statusCode).toBe(401);
    } finally {
      await app.close();
      await pool.end();
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("rejects invalid passwords, inactive users, revoked sessions, and expired sessions", async () => {
    process.env.AUTH_COOKIE_SECURE = "false";
    const { app, pool } = await buildMigratedApp();

    try {
      const active = await seedUser(pool, { roleKey: "ADMIN" });
      const inactive = await seedUser(pool, { roleKey: "ADMIN", status: "DISABLED" });

      const invalidPassword = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: active.email, password: "wrong-password" }
      });
      expect(invalidPassword.statusCode).toBe(401);
      expect(invalidPassword.json()).toMatchObject({ error: { reasonCode: "INVALID_CREDENTIALS" } });

      const inactiveLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: inactive.email, password: inactive.password }
      });
      expect(inactiveLogin.statusCode).toBe(403);
      expect(inactiveLogin.json()).toMatchObject({ error: { reasonCode: "USER_INACTIVE" } });

      const loginResponse = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: active.email, password: active.password }
      });
      const cookie = String(loginResponse.headers["set-cookie"]).split(";")[0]!;
      const [sessionRows] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        [active.userId]
      );

      await pool.query("UPDATE user_sessions SET status = 'REVOKED', revoked_at = NOW(3) WHERE id = ?", [
        sessionRows[0]!.id
      ]);
      const revokedMe = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { cookie }
      });
      expect(revokedMe.statusCode).toBe(401);
      expect(revokedMe.json()).toMatchObject({ error: { reasonCode: "SESSION_REVOKED" } });

      const relogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: active.email, password: active.password }
      });
      const expiredCookie = String(relogin.headers["set-cookie"]).split(";")[0]!;
      const [newSessionRows] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        [active.userId]
      );
      await pool.query("UPDATE user_sessions SET expires_at = TIMESTAMPADD(MINUTE, -1, NOW(3)) WHERE id = ?", [
        newSessionRows[0]!.id
      ]);
      const expiredMe = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { cookie: expiredCookie }
      });
      expect(expiredMe.statusCode).toBe(401);
      expect(expiredMe.json()).toMatchObject({ error: { reasonCode: "SESSION_EXPIRED" } });
    } finally {
      await app.close();
      await pool.end();
    }
  });
});
