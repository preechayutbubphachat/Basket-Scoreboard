import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { buildApiApp } from "../../apps/api/src/app";
import { createDatabasePool } from "../../apps/api/src/db";
import { hasDatabaseEnv } from "../../apps/api/src/config/env";
import { listAdminMatches } from "../../apps/api/src/operator/operatorMatchService";
import {
  MariaDbMigrationConnection,
  getDefaultMigrationsDir,
  runMigrations
} from "../../apps/api/src/migrations";
import { DB_INTEGRATION_TEST_TIMEOUT_MS } from "../helpers/dbIntegrationTimeout";

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
  await pool.query("INSERT IGNORE INTO roles (role_id, role_key, role_name) VALUES (?, ?, ?)", [
    randomUUID(),
    roleKey,
    roleKey
  ]);
  const [roleRows] = await pool.query<RowDataPacket[]>("SELECT role_id FROM roles WHERE role_key = ?", [roleKey]);

  for (const permissionKey of permissionKeys) {
    await pool.query("INSERT IGNORE INTO permissions (permission_id, permission_key, description) VALUES (?, ?, ?)", [
      randomUUID(),
      permissionKey,
      permissionKey
    ]);
    const [permissionRows] = await pool.query<RowDataPacket[]>(
      "SELECT permission_id FROM permissions WHERE permission_key = ?",
      [permissionKey]
    );
    await pool.query("INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)", [
      roleRows[0]!.role_id,
      permissionRows[0]!.permission_id
    ]);
  }
}

async function seedUser(pool: Pool, roleKey: "ADMIN" | "SCORER" | "VIEWER") {
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
  const [roleRows] = await pool.query<RowDataPacket[]>("SELECT role_id FROM roles WHERE role_key = ?", [roleKey]);
  await pool.query("INSERT INTO users (user_id, email, display_name, password_hash, status) VALUES (?, ?, ?, ?, 'ACTIVE')", [
    userId,
    email,
    `${roleKey} User`,
    passwordHash
  ]);
  await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userId, roleRows[0]!.role_id]);

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

async function createMatch(
  app: ReturnType<typeof buildApiApp>,
  session: { cookie: string; csrfToken: string },
  input: { matchCode: string; venueName?: string; scheduledAt?: string }
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/matches",
    headers: { cookie: session.cookie, "x-csrf-token": session.csrfToken },
    payload: { ...input, ruleProfileId: "FIBA_2024" }
  });

  expect(response.statusCode).toBe(201);
  return response.json<{ matchId: string }>().matchId;
}

describe("operator match list route auth", () => {
  it("rejects operator/matches without auth", async () => {
    const app = buildApiApp({ pool: {} as never });

    try {
      const response = await app.inject({ method: "GET", url: "/api/v1/operator/matches" });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { reasonCode: "UNAUTHENTICATED" } });
    } finally {
      await app.close();
    }
  });

  it("derives tournament, court, and readiness context for admin match lists", async () => {
    const pool = {
      async query(sql: string) {
        const normalized = sql.replace(/\s+/g, " ");
        if (normalized.includes("FROM matches m")) {
          return [[{
            match_id: "match-1",
            match_code: "Round 1",
            tournament_id: "tournament-1",
            tournament_name: "Alpha Cup",
            home_team_id: "home-team",
            home_team_name: "Bangkok Home",
            away_team_id: "away-team",
            away_team_name: "Chiang Mai Away",
            status: "SCHEDULED",
            scheduled_at: "2026-07-01T10:00:00.000Z",
            venue_name: "Main Hall",
            court_label: "Court A",
            current_seq: 0,
            home_score: null,
            away_score: null,
            assigned_role_codes: "SCORER"
          }], []];
        }
        if (normalized.includes("FROM match_officials")) {
          return [[{ match_id: "match-1", role_code: "SCORER", display_name: "Lead Scorer" }], []];
        }
        if (normalized.includes("FROM match_roster_players")) {
          return [[
            { match_id: "match-1", team_side: "HOME", player_count: 5, starter_count: 5 },
            { match_id: "match-1", team_side: "AWAY", player_count: 5, starter_count: 5 }
          ], []];
        }
        if (normalized.includes("FROM match_roster_confirmations")) {
          return [[
            { match_id: "match-1", team_side: "HOME" },
            { match_id: "match-1", team_side: "AWAY" }
          ], []];
        }
        return [[], []];
      }
    };

    await expect(listAdminMatches(pool as never)).resolves.toEqual([
      expect.objectContaining({
        matchId: "match-1",
        tournamentName: "Alpha Cup",
        venueLabel: "Main Hall",
        courtLabel: "Court A",
        readiness: expect.objectContaining({
          officials: {
            state: "READY",
            label: "1 active official: SCORER",
            assignedCount: 1,
            roles: [{ role: "SCORER", displayName: "Lead Scorer" }]
          },
          roster: { state: "READY", homeCount: 5, awayCount: 5 },
          lineup: expect.objectContaining({ state: "READY" })
        })
      })
    ]);
  });
});

describeDb("operator and admin match listing", { timeout: DB_INTEGRATION_TEST_TIMEOUT_MS }, () => {
  it("returns only active assigned matches to scorer and hides revoked or unassigned matches", async () => {
    process.env.AUTH_COOKIE_SECURE = "false";
    const { app, pool } = await buildMigratedApp();

    try {
      const admin = await seedUser(pool, "ADMIN");
      const scorer = await seedUser(pool, "SCORER");
      const viewer = await seedUser(pool, "VIEWER");
      const adminSession = await login(app, admin.email, admin.password);
      const scorerSession = await login(app, scorer.email, scorer.password);
      const viewerSession = await login(app, viewer.email, viewer.password);
      const scheduledAt = new Date("2026-07-01T10:00:00.000Z").toISOString();
      const matchA = await createMatch(app, adminSession, {
        matchCode: `A-${randomUUID()}`,
        venueName: "Court A",
        scheduledAt
      });
      const matchB = await createMatch(app, adminSession, { matchCode: `B-${randomUUID()}` });
      const matchC = await createMatch(app, adminSession, { matchCode: `C-${randomUUID()}` });

      await pool.query(
        "INSERT INTO match_officials (id, match_id, user_id, role_code, assignment_status, assigned_by_user_id, assigned_at, created_at) VALUES (?, ?, ?, 'SCORER', 'ACTIVE', ?, NOW(3), NOW(3))",
        [randomUUID(), matchA, scorer.userId, admin.userId]
      );
      await pool.query(
        "INSERT INTO match_officials (id, match_id, user_id, role_code, assignment_status, assigned_by_user_id, assigned_at, revoked_by_user_id, revoked_at, created_at) VALUES (?, ?, ?, 'REFEREE', 'REVOKED', ?, NOW(3), ?, NOW(3), NOW(3))",
        [randomUUID(), matchB, scorer.userId, admin.userId, admin.userId]
      );

      const scorerResponse = await app.inject({
        method: "GET",
        url: "/api/v1/operator/matches",
        headers: { cookie: scorerSession.cookie }
      });
      expect(scorerResponse.statusCode).toBe(200);
      expect(scorerResponse.json()).toMatchObject({
        ok: true,
        data: {
          matches: [
            expect.objectContaining({
              matchId: matchA,
              status: "SCHEDULED",
              venueName: "Court A",
              scheduledAt: expect.any(String),
              assignedRoleCodes: ["SCORER"],
              currentSeq: 0
            })
          ]
        }
      });
      expect(JSON.stringify(scorerResponse.json())).not.toContain(matchB);
      expect(JSON.stringify(scorerResponse.json())).not.toContain(matchC);

      const viewerResponse = await app.inject({
        method: "GET",
        url: "/api/v1/operator/matches",
        headers: { cookie: viewerSession.cookie }
      });
      expect(viewerResponse.statusCode).toBe(403);
      expect(viewerResponse.json()).toMatchObject({ error: { reasonCode: "FORBIDDEN" } });

      const adminOperatorResponse = await app.inject({
        method: "GET",
        url: "/api/v1/operator/matches",
        headers: { cookie: adminSession.cookie }
      });
      expect(adminOperatorResponse.statusCode).toBe(200);
      const adminOperatorMatches = adminOperatorResponse.json<{ data: { matches: Array<{ matchId: string }> } }>().data.matches;
      expect(adminOperatorMatches.map((match) => match.matchId)).toEqual(
        expect.arrayContaining([matchA, matchB, matchC])
      );

      const adminMatchesResponse = await app.inject({
        method: "GET",
        url: "/api/v1/admin/matches",
        headers: { cookie: adminSession.cookie }
      });
      expect(adminMatchesResponse.statusCode).toBe(200);
      const adminMatches = adminMatchesResponse.json<{ data: { matches: Array<{ matchId: string }> } }>().data.matches;
      expect(adminMatches.map((match) => match.matchId)).toEqual(
        expect.arrayContaining([matchA, matchB, matchC])
      );

      const nonAdminMatchesResponse = await app.inject({
        method: "GET",
        url: "/api/v1/admin/matches",
        headers: { cookie: scorerSession.cookie }
      });
      expect(nonAdminMatchesResponse.statusCode).toBe(403);
      expect(nonAdminMatchesResponse.json()).toMatchObject({ error: { reasonCode: "FORBIDDEN" } });

      const publicResponse = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${matchA}/scoreboard`
      });
      expect(publicResponse.statusCode).toBe(200);
    } finally {
      await app.close();
      await pool.end();
    }
  });
});
