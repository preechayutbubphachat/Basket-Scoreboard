import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "@basket-scoreboard/api-contracts";
import { canAccessProtectedRosterState } from "../../apps/api/src/auth/sessionAuth.js";

const matchId = "11111111-1111-4111-8111-111111111111";
const otherMatchId = "22222222-2222-4222-8222-222222222222";

function user(role: AuthenticatedUser["role"], assignedMatchIds: string[] = [], authMode: AuthenticatedUser["authMode"] = "TEST_PROVIDER"): AuthenticatedUser {
  return {
    userId: `${role.toLowerCase()}-user`,
    role,
    roles: [role],
    permissions: ["match.read"],
    assignedMatchIds,
    deviceId: `${role.toLowerCase()}-device`,
    authMode
  };
}

function sessionPool(rows: unknown[] = []) {
  let queryCount = 0;
  return {
    get queryCount() {
      return queryCount;
    },
    async query() {
      queryCount += 1;
      return [rows];
    }
  } as never;
}

describe("RM-08 protected roster authorization parity", () => {
  it("applies the exact role matrix with deny-by-default behavior", async () => {
    const pool = sessionPool();

    await expect(canAccessProtectedRosterState(pool, user("ADMIN"), matchId)).resolves.toBe(true);
    await expect(canAccessProtectedRosterState(pool, user("REFEREE", [matchId]), matchId)).resolves.toBe(true);
    await expect(canAccessProtectedRosterState(pool, user("SCORER", [matchId]), matchId)).resolves.toBe(true);

    for (const role of ["VIEWER", "TIMER", "SHOT_CLOCK_OPERATOR"] as const) {
      await expect(canAccessProtectedRosterState(pool, user(role, [matchId]), matchId)).resolves.toBe(false);
    }

    await expect(canAccessProtectedRosterState(pool, user("REFEREE"), matchId)).resolves.toBe(false);
    await expect(canAccessProtectedRosterState(pool, user("REFEREE", [otherMatchId]), matchId)).resolves.toBe(false);
    await expect(canAccessProtectedRosterState(pool, user("SCORER", [matchId]), otherMatchId)).resolves.toBe(false);
    await expect(canAccessProtectedRosterState(pool, null, matchId)).resolves.toBe(false);
    await expect(canAccessProtectedRosterState(pool, user("VIEWER", [matchId]), matchId)).resolves.toBe(false);
    expect(pool.queryCount).toBe(0);
  });

  it("uses authoritative active session assignments and rejects revoked or wrong-match assignments", async () => {
    const activeRow = {
      id: "assignment-1",
      match_id: matchId,
      user_id: "referee-user",
      display_name: null,
      role_code: "REFEREE",
      assignment_status: "ACTIVE",
      assigned_by_user_id: null,
      assigned_at: new Date("2026-08-03T00:00:00.000Z"),
      revoked_by_user_id: null,
      revoked_at: null,
      created_at: new Date("2026-08-03T00:00:00.000Z"),
      updated_at: null
    };
    const activePool = sessionPool([activeRow]);
    const sessionUser = user("REFEREE", [], "SESSION");
    await expect(canAccessProtectedRosterState(activePool, sessionUser, matchId)).resolves.toBe(true);
    await expect(canAccessProtectedRosterState(activePool, sessionUser, otherMatchId)).resolves.toBe(false);

    const revokedPool = sessionPool([]);
    await expect(canAccessProtectedRosterState(revokedPool, sessionUser, matchId)).resolves.toBe(false);
  });

  it("routes every protected roster boundary through the shared predicate", () => {
    const rosterRoutes = readFileSync("apps/api/src/routes/rosterRoutes.ts", "utf8");
    const matchRoutes = readFileSync("apps/api/src/routes/matchRoutes.ts", "utf8");
    const realtime = readFileSync("apps/api/src/realtime/projectionRealtime.ts", "utf8");

    expect(rosterRoutes).toContain("requireProtectedRosterAccess");
    expect(matchRoutes).toContain("/api/v1/matches/:matchId/sync");
    const eventsRouteStart = matchRoutes.indexOf('"/api/v1/matches/:matchId/events"');
    const eventsRouteEnd = matchRoutes.indexOf('  );', eventsRouteStart);
    expect(eventsRouteStart).toBeGreaterThanOrEqual(0);
    expect(matchRoutes.slice(eventsRouteStart, eventsRouteEnd)).toContain("auth.requireProtectedRosterAccess");
    expect(matchRoutes).toContain("auth.requireProtectedRosterAccess");
    expect(realtime).toContain("url: `/api/v1/matches/${matchId}/sync?lastEventSeq=0`");
    expect(realtime).not.toContain("/effective-access");
  });
});
