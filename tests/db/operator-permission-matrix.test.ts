import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { buildApiApp } from "../../apps/api/src/app";
import { createDatabasePool } from "../../apps/api/src/db";
import { hasDatabaseEnv } from "../../apps/api/src/config/env";
import { isMatchStreamReadConflict } from "../../apps/api/src/matchEventStore/repositories";
import {
  MariaDbMigrationConnection,
  getDefaultMigrationsDir,
  runMigrations
} from "../../apps/api/src/migrations";

const describeDb = hasDatabaseEnv() ? describe : describe.skip;
type App = ReturnType<typeof buildApiApp>;
type Session = { cookie: string; csrfToken: string };
type AssignmentRole =
  | "SCORER"
  | "ASSISTANT_SCORER"
  | "TIMER"
  | "SHOT_CLOCK_OPERATOR"
  | "MATCH_OPERATOR"
  | "REFEREE";

const operatorPermissions = [
  "match.score.operate",
  "match.foul.operate",
  "match.clock.game.operate",
  "match.clock.shot.operate",
  "match.timeout.operate",
  "match.lifecycle.operate"
];

async function buildMigratedApp() {
  process.env.AUTH_COOKIE_SECURE = "false";
  delete process.env.AUTH_TEST_DISABLE_CSRF;
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

async function seedRole(pool: Pool, roleKey: "ADMIN" | "SCORER" | "REFEREE") {
  await pool.query("INSERT IGNORE INTO roles (role_id, role_key, role_name) VALUES (?, ?, ?)", [
    randomUUID(), roleKey, roleKey
  ]);
  const [roles] = await pool.query<RowDataPacket[]>("SELECT role_id FROM roles WHERE role_key = ?", [roleKey]);
  const permissions = roleKey === "ADMIN"
    ? ["match.create", "match.read", ...operatorPermissions, "match.correction.request", "match.correction.apply", "match.correction.reject", "match.audit.read", "public.scoreboard.read"]
    : roleKey === "REFEREE"
      ? ["match.read", "match.correction.request", "match.correction.apply", "match.correction.reject", "match.audit.read", "public.scoreboard.read"]
      : ["match.read", ...operatorPermissions, "match.correction.request", "public.scoreboard.read"];
  for (const permission of permissions) {
    await pool.query("INSERT IGNORE INTO permissions (permission_id, permission_key, description) VALUES (?, ?, ?)", [randomUUID(), permission, permission]);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT permission_id FROM permissions WHERE permission_key = ?", [permission]);
    await pool.query("INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)", [roles[0]!.role_id, rows[0]!.permission_id]);
  }
  return roles[0]!.role_id as string;
}

async function seedUser(pool: Pool, roleKey: "ADMIN" | "SCORER" | "REFEREE") {
  const userId = randomUUID();
  const email = `${userId}@permission.test`;
  const password = "isolated permission test";
  const roleId = await seedRole(pool, roleKey);
  await pool.query("INSERT INTO users (user_id, email, display_name, password_hash, status) VALUES (?, ?, ?, ?, 'ACTIVE')", [
    userId, email, `${roleKey} synthetic`, await bcrypt.hash(password, 4)
  ]);
  await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userId, roleId]);
  return { userId, email, password };
}

async function login(app: App, user: { email: string; password: string }): Promise<Session> {
  const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: user });
  expect(response.statusCode).toBe(200);
  return {
    cookie: String(response.headers["set-cookie"]).split(";")[0]!,
    csrfToken: response.json<{ data: { csrfToken: string } }>().data.csrfToken
  };
}

async function createMatch(app: App, admin: Session) {
  const response = await app.inject({
    method: "POST", url: "/api/v1/matches",
    headers: { cookie: admin.cookie, "x-csrf-token": admin.csrfToken },
    payload: { matchCode: `PERM-${randomUUID()}`, ruleProfileId: "FIBA_2024" }
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ matchId: string }>().matchId;
}

async function assign(pool: Pool, matchId: string, userId: string, role: AssignmentRole, adminId: string) {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO match_officials (id, match_id, user_id, role_code, assignment_status, assigned_by_user_id, assigned_at, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, NOW(3), NOW(3))",
    [id, matchId, userId, role, adminId]
  );
  return id;
}

function envelope(matchId: string, payload: Record<string, unknown>, expectedSeq = 0, commandId = randomUUID()) {
  return { commandId, matchId, expectedSeq, correlationId: randomUUID(), clientTimestamp: new Date().toISOString(), payload };
}

const commands = {
  score: { path: "score/add", payload: { teamSide: "HOME", points: 2, playerId: null, periodNumber: 1, gameClockRemainingMs: 590000, note: null } },
  teamFoul: { path: "foul/team/add", payload: { teamSide: "HOME", foulType: "PERSONAL", reason: null } },
  gameStart: { path: "clock/game/start", payload: {} },
  gameStop: { path: "clock/game/stop", payload: {} },
  gameSet: { path: "clock/game/set", payload: { remainingMs: 540000, reason: null } },
  shotReset: { path: "clock/shot/reset", payload: { resetToMs: 14000, reason: null } },
  shotSet: { path: "clock/shot/set", payload: { remainingMs: 12000, reason: null } },
  timeout: { path: "timeout/grant", payload: { teamSide: "HOME", requestedBy: "HEAD_COACH", durationMs: 60000, reason: null } },
  lifecycle: { path: "lifecycle/start-match", payload: { reason: null } },
  correctionApply: { path: "corrections/apply-score", payload: { correctionRequestSeq: 1, targetSeq: 1, reason: "synthetic correction", removeOriginalScore: true, replacement: null } },
  correctionReject: { path: "corrections/reject", payload: { correctionRequestSeq: 1, reason: "synthetic correction" } }
} as const;

async function state(pool: Pool, matchId: string) {
  const [events] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) event_count, COALESCE(MAX(seq_no), 0) latest_seq FROM match_events WHERE match_id = ?", [matchId]);
  const [projection] = await pool.query<RowDataPacket[]>("SELECT * FROM match_projections WHERE match_id = ?", [matchId]);
  return { eventCount: Number(events[0]!.event_count), latestSeq: Number(events[0]!.latest_seq), projection: projection[0] ?? null, snapshotCount: 0 };
}

async function send(app: App, session: Session, matchId: string, command: { path: string; payload: Record<string, unknown> }, options: { csrf?: string | null; expectedSeq?: number; commandId?: string; extra?: Record<string, unknown> } = {}) {
  const headers: Record<string, string> = { cookie: session.cookie };
  if (options.csrf !== null) headers["x-csrf-token"] = options.csrf ?? session.csrfToken;
  return app.inject({
    method: "POST", url: `/api/v1/matches/${matchId}/commands/${command.path}`,
    headers,
    payload: { ...envelope(matchId, command.payload, options.expectedSeq ?? 0, options.commandId), ...(options.extra ?? {}) }
  });
}

async function expectDeniedUnchanged(app: App, pool: Pool, session: Session, matchId: string, command: { path: string; payload: Record<string, unknown> }) {
  const before = await state(pool, matchId);
  const response = await send(app, session, matchId, command);
  expect(response.statusCode).toBe(403);
  expect(JSON.stringify(response.json())).not.toMatch(/match\.(score|foul|clock|timeout|lifecycle|correction)\./i);
  expect(await state(pool, matchId)).toEqual(before);
}

async function getEffectiveAccess(app: App, session: Session, matchId: string) {
  return app.inject({
    method: "GET",
    url: `/api/v1/matches/${matchId}/effective-access`,
    headers: { cookie: session.cookie }
  });
}

describeDb.sequential("DB-backed granular operator permission matrix", () => {
  it("returns canonical effective access for an ADMIN without a match assignment", async () => {
    const { app, pool } = await buildMigratedApp();
    try {
      const adminUser = await seedUser(pool, "ADMIN");
      const admin = await login(app, adminUser);
      const matchId = await createMatch(app, admin);
      const before = await state(pool, matchId);

      const response = await getEffectiveAccess(app, admin, matchId);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ok: true,
        data: {
          matchId,
          capabilities: {
            matchRead: true,
            scoreOperate: true,
            foulOperate: true,
            gameClockOperate: true,
            shotClockOperate: true,
            timeoutOperate: true,
            lifecycleOperate: true,
            correctionRequest: true,
            correctionApply: true,
            correctionReject: true,
            auditRead: true
          }
        }
      });
      expect(await state(pool, matchId)).toEqual(before);
    } finally {
      await app.close(); await pool.end();
    }
  }, 60_000);

  it("returns canonical effective access for an actively assigned REFEREE", async () => {
    const { app, pool } = await buildMigratedApp();
    try {
      const adminUser = await seedUser(pool, "ADMIN");
      const refereeUser = await seedUser(pool, "REFEREE");
      const admin = await login(app, adminUser);
      const referee = await login(app, refereeUser);
      const matchId = await createMatch(app, admin);
      await assign(pool, matchId, refereeUser.userId, "REFEREE", adminUser.userId);
      const before = await state(pool, matchId);

      const response = await getEffectiveAccess(app, referee, matchId);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ok: true,
        data: {
          matchId,
          capabilities: {
            matchRead: true,
            scoreOperate: false,
            foulOperate: false,
            gameClockOperate: false,
            shotClockOperate: false,
            timeoutOperate: false,
            lifecycleOperate: false,
            correctionRequest: true,
            correctionApply: true,
            correctionReject: true,
            auditRead: false
          }
        }
      });
      expect(await state(pool, matchId)).toEqual(before);
    } finally {
      await app.close(); await pool.end();
    }
  }, 60_000);

  it("denies effective access for an explicitly inactive assignment without match writes", async () => {
    const { app, pool } = await buildMigratedApp();
    try {
      const adminUser = await seedUser(pool, "ADMIN");
      const scorerUser = await seedUser(pool, "SCORER");
      const admin = await login(app, adminUser);
      const scorer = await login(app, scorerUser);
      const matchId = await createMatch(app, admin);
      const assignmentId = await assign(pool, matchId, scorerUser.userId, "SCORER", adminUser.userId);

      expect((await getEffectiveAccess(app, scorer, matchId)).statusCode).toBe(200);
      const before = await state(pool, matchId);
      await pool.query(
        "UPDATE match_officials SET assignment_status = 'INACTIVE', updated_at = NOW(3) WHERE id = ?",
        [assignmentId]
      );

      const response = await getEffectiveAccess(app, scorer, matchId);

      expect(response.statusCode).toBe(403);
      expect(JSON.stringify(response.json())).not.toMatch(/match\.(score|foul|clock|timeout|lifecycle|correction)\./i);
      expect(await state(pool, matchId)).toEqual(before);
    } finally {
      await app.close(); await pool.end();
    }
  }, 60_000);

  it("calculates effective access from current assignment state without match writes", async () => {
    const { app, pool } = await buildMigratedApp();
    try {
      const adminUser = await seedUser(pool, "ADMIN");
      const operatorUser = await seedUser(pool, "SCORER");
      const admin = await login(app, adminUser);
      const operator = await login(app, operatorUser);
      const matchA = await createMatch(app, admin);
      const matchB = await createMatch(app, admin);
      const assignmentId = await assign(pool, matchA, operatorUser.userId, "TIMER", adminUser.userId);
      const before = await state(pool, matchA);

      const active = await getEffectiveAccess(app, operator, matchA);
      expect(active.statusCode).toBe(200);
      expect(active.json()).toEqual({
        ok: true,
        data: {
          matchId: matchA,
          capabilities: {
            matchRead: true,
            scoreOperate: false,
            foulOperate: false,
            gameClockOperate: true,
            shotClockOperate: false,
            timeoutOperate: false,
            lifecycleOperate: false,
            correctionRequest: false,
            correctionApply: false,
            correctionReject: false,
            auditRead: false
          }
        }
      });
      expect(await state(pool, matchA)).toEqual(before);

      expect((await getEffectiveAccess(app, operator, matchB)).statusCode).toBe(403);
      await pool.query(
        "UPDATE match_officials SET assignment_status = 'REVOKED', revoked_by_user_id = ?, revoked_at = NOW(3) WHERE id = ?",
        [adminUser.userId, assignmentId]
      );
      expect((await getEffectiveAccess(app, operator, matchA)).statusCode).toBe(403);
      expect(await state(pool, matchA)).toEqual(before);
    } finally {
      await app.close(); await pool.end();
    }
  }, 60_000);

  it("enforces every assignment role and leaves denied commands unchanged", async () => {
    const { app, pool } = await buildMigratedApp();
    try {
      const adminUser = await seedUser(pool, "ADMIN");
      const admin = await login(app, adminUser);
      const cases: Array<{ role: AssignmentRole; allowed: Array<keyof typeof commands>; denied: Array<keyof typeof commands> }> = [
        { role: "SCORER", allowed: ["score", "teamFoul"], denied: ["gameStart", "gameStop", "gameSet", "shotReset", "timeout", "lifecycle", "correctionApply", "correctionReject"] },
        { role: "ASSISTANT_SCORER", allowed: ["score", "teamFoul"], denied: ["gameStart", "shotReset", "timeout", "lifecycle", "correctionApply", "correctionReject"] },
        { role: "TIMER", allowed: ["gameStart", "gameStop", "gameSet"], denied: ["score", "teamFoul", "shotReset", "timeout", "lifecycle", "correctionApply", "correctionReject"] },
        { role: "SHOT_CLOCK_OPERATOR", allowed: ["shotReset", "shotSet"], denied: ["score", "teamFoul", "gameStart", "timeout", "lifecycle", "correctionApply", "correctionReject"] },
        { role: "MATCH_OPERATOR", allowed: ["score", "teamFoul", "gameStart", "gameStop", "gameSet", "shotReset", "shotSet", "timeout", "lifecycle"], denied: ["correctionApply", "correctionReject"] }
      ];

      for (const matrix of cases) {
        const user = await seedUser(pool, "SCORER");
        const session = await login(app, user);
        for (const name of matrix.allowed) {
          const matchId = await createMatch(app, admin);
          await assign(pool, matchId, user.userId, matrix.role, adminUser.userId);
          const response = await send(app, session, matchId, commands[name]);
          expect(response.statusCode, `${matrix.role} should allow ${name}`).toBe(200);
        }
        for (const name of matrix.denied) {
          const matchId = await createMatch(app, admin);
          await assign(pool, matchId, user.userId, matrix.role, adminUser.userId);
          await expectDeniedUnchanged(app, pool, session, matchId, commands[name]);
        }
      }
    } finally {
      await app.close(); await pool.end();
    }
  }, 60_000);

  it("enforces CSRF, cross-match assignment, revocation, forged authority, idempotency and concurrency", async () => {
    const { app, pool } = await buildMigratedApp();
    try {
      const adminUser = await seedUser(pool, "ADMIN");
      const scorerUser = await seedUser(pool, "SCORER");
      const admin = await login(app, adminUser);
      const scorer = await login(app, scorerUser);
      const matchA = await createMatch(app, admin);
      const matchB = await createMatch(app, admin);
      const assignmentId = await assign(pool, matchA, scorerUser.userId, "SCORER", adminUser.userId);

      expect((await send(app, scorer, matchA, commands.score, { csrf: null })).statusCode).toBe(403);
      expect((await send(app, scorer, matchA, commands.score, { csrf: "invalid" })).statusCode).toBe(403);
      await expectDeniedUnchanged(app, pool, scorer, matchB, commands.score);
      const beforeForged = await state(pool, matchB);
      const forged = await send(app, scorer, matchB, commands.score, { extra: { role: "ADMIN", permissions: operatorPermissions, assignmentId, enabled: true } });
      expect(forged.statusCode).toBe(403);
      expect(await state(pool, matchB)).toEqual(beforeForged);

      const commandId = randomUUID();
      const accepted = await send(app, scorer, matchA, commands.score, { commandId });
      expect(accepted.statusCode).toBe(200);
      const duplicate = await send(app, scorer, matchA, commands.score, { commandId });
      expect(duplicate.json()).toMatchObject({ status: "DUPLICATE_ACCEPTED", currentSeq: 1 });
      expect((await state(pool, matchA)).eventCount).toBe(1);

      await pool.query("UPDATE match_officials SET assignment_status = 'REVOKED', revoked_by_user_id = ?, revoked_at = NOW(3) WHERE id = ?", [adminUser.userId, assignmentId]);
      const beforeRevoked = await state(pool, matchA);
      expect((await send(app, scorer, matchA, commands.score, { expectedSeq: 1 })).statusCode).toBe(403);
      expect(await state(pool, matchA)).toEqual(beforeRevoked);

      const concurrentUser = await seedUser(pool, "SCORER");
      const concurrentSession = await login(app, concurrentUser);
      const concurrentMatch = await createMatch(app, admin);
      await assign(pool, concurrentMatch, concurrentUser.userId, "MATCH_OPERATOR", adminUser.userId);
      const [one, two] = await Promise.all([
        send(app, concurrentSession, concurrentMatch, commands.score),
        send(app, concurrentSession, concurrentMatch, commands.gameSet)
      ]);
      const statuses = [one.json<{ status: string }>().status, two.json<{ status: string }>().status];
      expect(statuses.filter((status) => status === "ACCEPTED")).toHaveLength(1);
      expect(statuses).toEqual(expect.arrayContaining(["ACCEPTED", "SYNC_REQUIRED"]));
      expect((await state(pool, concurrentMatch)).eventCount).toBe(1);

      for (let round = 0; round < 20; round += 1) {
        const matchId = await createMatch(app, admin);
        await assign(pool, matchId, concurrentUser.userId, "SCORER", adminUser.userId);
        const [left, right] = await Promise.all([
          send(app, concurrentSession, matchId, commands.score),
          send(app, concurrentSession, matchId, { ...commands.score, payload: { ...commands.score.payload, teamSide: "AWAY" } })
        ]);
        const roundStatuses = [left.json<{ status: string }>().status, right.json<{ status: string }>().status];
        expect(roundStatuses.filter((status) => status === "ACCEPTED"), `round ${round}`).toHaveLength(1);
        expect(roundStatuses.filter((status) => status === "SYNC_REQUIRED"), `round ${round}`).toHaveLength(1);
        expect([left.statusCode, right.statusCode]).not.toContain(500);
        expect((await state(pool, matchId)).eventCount).toBe(1);
      }

      const retryMatch = await createMatch(app, admin);
      await assign(pool, retryMatch, concurrentUser.userId, "SCORER", adminUser.userId);
      const retryCommandId = randomUUID();
      const [retryOne, retryTwo] = await Promise.all([
        send(app, concurrentSession, retryMatch, commands.score, { commandId: retryCommandId }),
        send(app, concurrentSession, retryMatch, commands.score, { commandId: retryCommandId })
      ]);
      expect([retryOne.statusCode, retryTwo.statusCode]).not.toContain(500);
      expect([retryOne.json<{ status: string }>().status, retryTwo.json<{ status: string }>().status]).toEqual(
        expect.arrayContaining(["ACCEPTED", "DUPLICATE_ACCEPTED"])
      );
      expect((await state(pool, retryMatch)).eventCount).toBe(1);

      const staleBefore = await state(pool, retryMatch);
      const stale = await send(app, concurrentSession, retryMatch, commands.score, { expectedSeq: 0 });
      expect(stale.json()).toMatchObject({ status: "SYNC_REQUIRED", reasonCode: "INVALID_EXPECTED_SEQ" });
      expect(await state(pool, retryMatch)).toEqual(staleBefore);
      expect(isMatchStreamReadConflict({ code: "ER_DUP_ENTRY", errno: 1062, sqlState: "23000", sqlMessage: "duplicate" })).toBe(false);
      expect(isMatchStreamReadConflict(new Error("unknown persistence failure"))).toBe(false);
    } finally {
      await app.close(); await pool.end();
    }
  }, 60_000);
});
