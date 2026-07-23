import { describe, expect, it, vi } from "vitest";
import type {
  AuthenticatedUser,
  MatchOfficialRoleCode,
  PermissionCode
} from "@basket-scoreboard/api-contracts";
import { buildApiApp } from "../../apps/api/src/app";
import { buildEffectiveMatchAccess } from "../../apps/api/src/auth/effectiveMatchAccess";

const matchA = "11111111-1111-4111-8111-111111111111";
const matchB = "22222222-2222-4222-8222-222222222222";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const allMatchPermissions: PermissionCode[] = [
  "match.read",
  "match.score.operate",
  "match.foul.operate",
  "match.clock.game.operate",
  "match.clock.shot.operate",
  "match.timeout.operate",
  "match.lifecycle.operate",
  "match.correction.request",
  "match.correction.apply",
  "match.correction.reject",
  "match.audit.read"
];

function sessionUser(permissions: PermissionCode[] = allMatchPermissions): AuthenticatedUser {
  return {
    userId,
    role: "SCORER",
    roles: ["SCORER"],
    permissions,
    assignedMatchIds: [matchA],
    authMode: "SESSION",
    deviceId: "test-device"
  };
}

function assignmentRow(matchId: string, roleCode: MatchOfficialRoleCode) {
  return {
    id: `assignment-${roleCode}`,
    match_id: matchId,
    user_id: userId,
    display_name: "Assigned Operator",
    role_code: roleCode,
    assignment_status: "ACTIVE",
    assigned_by_user_id: null,
    assigned_at: new Date("2026-07-17T00:00:00.000Z"),
    revoked_by_user_id: null,
    revoked_at: null,
    created_at: new Date("2026-07-17T00:00:00.000Z"),
    updated_at: null
  };
}

function createAssignmentPool(roleCode: MatchOfficialRoleCode, assignedMatchId = matchA) {
  const queries: string[] = [];
  let active = true;
  const pool = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes("FROM match_officials")) {
        return [active ? [assignmentRow(assignedMatchId, roleCode)] : [], []];
      }
      if (sql.includes("SELECT COUNT(*) AS count FROM matches")) {
        return [[{ count: 1 }], []];
      }
      return [[], []];
    }
  };

  return {
    pool,
    queries,
    revoke: () => { active = false; }
  };
}

function createMatchAccessPool() {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes("SELECT COUNT(*) AS count FROM matches")) {
        return [[{ count: 1 }], []];
      }
      return [[], []];
    },
    getConnection: vi.fn()
  };

  return { pool, queries };
}

describe("effective match access contract", () => {
  it("returns a protected server-calculated capability allowlist for canonical admin access", async () => {
    const { pool } = createMatchAccessPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchA}/effective-access`,
        headers: { "x-dev-user-role": "ADMIN" }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        ok: true,
        data: {
          matchId: matchA,
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
    } finally {
      await app.close();
    }
  });

  it("requires authentication and ignores client claims instead of treating them as authority", async () => {
    const { pool } = createMatchAccessPool();
    const app = buildApiApp({ pool: pool as never });

    try {
      const unauthenticated = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchA}/effective-access`
      });
      expect(unauthenticated.statusCode).toBe(401);

      const forged = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchA}/effective-access?role=ADMIN&permissions=match.audit.read&assignmentRole=MATCH_OPERATOR&effectiveCapabilities=true`,
        headers: {
          "x-dev-user-role": "SCORER",
          "x-dev-match-ids": matchA
        }
      });
      expect(forged.statusCode).toBe(200);
      expect(forged.json().data.capabilities).toMatchObject({
        matchRead: true,
        scoreOperate: true,
        foulOperate: true,
        gameClockOperate: false,
        shotClockOperate: false,
        timeoutOperate: false,
        lifecycleOperate: false,
        correctionRequest: true,
        correctionApply: false,
        correctionReject: false,
        auditRead: false
      });
    } finally {
      await app.close();
    }
  });

  it.each([
    ["TIMER", { gameClockOperate: true, shotClockOperate: false }],
    ["SHOT_CLOCK_OPERATOR", { gameClockOperate: false, shotClockOperate: true }]
  ] as const)("keeps %s clock capabilities isolated", async (roleCode, expected) => {
    const { pool } = createAssignmentPool(roleCode);
    const access = await buildEffectiveMatchAccess(pool as never, sessionUser(), matchA);

    expect(access.capabilities).toMatchObject({
      matchRead: true,
      scoreOperate: false,
      foulOperate: false,
      timeoutOperate: false,
      lifecycleOperate: false,
      ...expected
    });
  });

  it("maps score, foul, timeout, lifecycle, and correction capabilities through canonical assignment policy", async () => {
    const scorerPool = createAssignmentPool("SCORER");
    const scorer = await buildEffectiveMatchAccess(scorerPool.pool as never, sessionUser(), matchA);
    expect(scorer.capabilities).toMatchObject({
      matchRead: true,
      scoreOperate: true,
      foulOperate: true,
      gameClockOperate: false,
      shotClockOperate: false,
      timeoutOperate: false,
      lifecycleOperate: false,
      correctionRequest: true,
      correctionApply: false,
      correctionReject: false,
      auditRead: false
    });

    const operatorPool = createAssignmentPool("MATCH_OPERATOR");
    const operator = await buildEffectiveMatchAccess(operatorPool.pool as never, sessionUser(), matchA);
    expect(operator.capabilities).toMatchObject({
      scoreOperate: true,
      foulOperate: true,
      gameClockOperate: true,
      shotClockOperate: true,
      timeoutOperate: true,
      lifecycleOperate: true,
      correctionRequest: true,
      correctionApply: false,
      correctionReject: false,
      auditRead: false
    });

    const refereePool = createAssignmentPool("REFEREE");
    const referee = await buildEffectiveMatchAccess(refereePool.pool as never, sessionUser(), matchA);
    expect(referee.capabilities).toMatchObject({
      matchRead: true,
      scoreOperate: false,
      correctionRequest: true,
      correctionApply: true,
      correctionReject: true,
      auditRead: false
    });
  });

  it("denies missing global permission even when the active assignment role would allow it", async () => {
    const { pool } = createAssignmentPool("MATCH_OPERATOR");
    const access = await buildEffectiveMatchAccess(
      pool as never,
      sessionUser(["match.read", "match.score.operate"]),
      matchA
    );

    expect(access.capabilities).toEqual({
      matchRead: true,
      scoreOperate: true,
      foulOperate: false,
      gameClockOperate: false,
      shotClockOperate: false,
      timeoutOperate: false,
      lifecycleOperate: false,
      correctionRequest: false,
      correctionApply: false,
      correctionReject: false,
      auditRead: false
    });
  });

  it("removes capabilities on the next calculation after authoritative revocation", async () => {
    const assignment = createAssignmentPool("SCORER");
    const before = await buildEffectiveMatchAccess(assignment.pool as never, sessionUser(), matchA);
    assignment.revoke();
    const after = await buildEffectiveMatchAccess(assignment.pool as never, sessionUser(), matchA);

    expect(before.capabilities.scoreOperate).toBe(true);
    expect(after.capabilities).toEqual(Object.fromEntries(
      Object.keys(before.capabilities).map((capability) => [capability, false])
    ));
  });

  it("fails closed for no assignment and cross-match assignment without capability leakage", async () => {
    const noAssignment = createAssignmentPool("SCORER");
    noAssignment.revoke();
    const none = await buildEffectiveMatchAccess(noAssignment.pool as never, sessionUser(), matchA);
    const crossMatchPool = createAssignmentPool("MATCH_OPERATOR", matchA);
    const crossMatch = await buildEffectiveMatchAccess(crossMatchPool.pool as never, sessionUser(), matchB);

    expect(Object.values(none.capabilities).every((allowed) => !allowed)).toBe(true);
    expect(Object.values(crossMatch.capabilities).every((allowed) => !allowed)).toBe(true);
  });

  it("returns 404 for an inaccessible nonexistent match without private authorization metadata", async () => {
    const { pool } = createMatchAccessPool();
    pool.query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT COUNT(*) AS count FROM matches")) return [[{ count: 0 }], []];
      return [[], []];
    });
    const app = buildApiApp({ pool: pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchA}/effective-access`,
        headers: { "x-dev-user-role": "ADMIN" }
      });
      expect(response.statusCode).toBe(404);
      expect(JSON.stringify(response.json())).not.toMatch(
        /actor|device|session|token|csrf|commandId|correlationId|causationId|expectedSeq|lastEventSeq|currentSeq|projectionVersion|sourceEventSeq|initializedAtSeq|audit|correctionReason/i
      );
    } finally {
      await app.close();
    }
  });

  it("uses read-only assignment queries and never mutates events, projections, or snapshots", async () => {
    const { pool, queries } = createAssignmentPool("MATCH_OPERATOR");
    await buildEffectiveMatchAccess(pool as never, sessionUser(), matchA);

    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((sql) => /^\s*SELECT/i.test(sql))).toBe(true);
    expect(queries.join("\n")).not.toMatch(/(?:^|\n)\s*(?:INSERT|UPDATE|DELETE|REPLACE)\b|match_events|match_projections|snapshots/im);
  });
});
