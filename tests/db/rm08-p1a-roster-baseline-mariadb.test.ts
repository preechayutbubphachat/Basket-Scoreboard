import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { buildApiApp } from "../../apps/api/src/app";
import { loginWithPassword } from "../../apps/api/src/auth/sessionAuth";
import { hasDatabaseEnv } from "../../apps/api/src/config/env";
import { createDatabasePool } from "../../apps/api/src/db";
import { MariaDbMigrationConnection, getDefaultMigrationsDir, runMigrations } from "../../apps/api/src/migrations";
import { importRosterBaseline, type RosterBaselineFailureSeam } from "../../apps/api/src/rosters/rosterBaselineService";
import { assignPlayerToMatchRoster, confirmLineupRoster, removeLineupStarter, selectLineupStarter, setLineupCaptain, updateMatchRosterPlayer } from "../../apps/api/src/rosters/rosterRepository";
import { buildRosterBaselineProjection, rebuildRosterBaselineFromEvents } from "../../apps/api/src/rosters/rosterBaselineProjection";
import { serializePublicRosterBaseline } from "../../apps/api/src/rosters/rosterBaselinePublicSerializer";
import { listMatchEvents } from "../../apps/api/src/matchEventStore/repositories";
import { getMatchSync } from "../../apps/api/src/matchEventStore/syncService";
import { recoverRosterBaselineForMatch } from "../../apps/api/src/rosters/rosterBaselineRepository";
import { io as createSocket, type Socket } from "socket.io-client";

const describeDb = hasDatabaseEnv() && process.env.DATABASE_PORT !== "3300" && process.env.DATABASE_HOST === "127.0.0.1" ? describe : describe.skip;
beforeEach(() => {
  vi.stubEnv("AUTH_TEST_PROVIDER", "server-owned");
});
const adminHeaders = { "x-dev-user-role": "ADMIN", "x-dev-user-id": "00000000-0000-4000-8000-0000000000a8" };
const user = { userId: adminHeaders["x-dev-user-id"], role: "ADMIN" as const, permissions: [], assignedMatchIds: [], deviceId: "rm08-p1a-real-db", authMode: "DEV_HEADER" as const };
const seams: RosterBaselineFailureSeam[] = ["afterEvent", "afterHead", "afterProtectedProjection", "afterPublicProjection", "afterSnapshot", "afterReceipt", "afterAudit", "beforeCommit"];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete process.env.AUTH_TEST_DISABLE_CSRF;
});

describeDb("RM-08 P1A authoritative roster baseline on isolated MariaDB", { timeout: 120_000 }, () => {
  it.each(seams)("rolls back every durable write at %s and supports durable retry", async (seam) => {
    const pool = await migratedPool();
    const app = buildApiApp({ pool });
    try {
      const fixture = await createFixture(app, pool);
      const command = baselineCommand(fixture.matchId, 0);
      let observerVerified = false;
      await expect(importRosterBaseline({
        pool, command, user, injectFailureAt: seam,
        onFailureSeam: async () => {
          const observer = await pool.getConnection();
          try {
            expect(await state(observer, fixture.matchId, command.commandId)).toEqual(emptyState());
            observerVerified = true;
          } finally { observer.release(); }
        }
      })).rejects.toThrow(`INJECTED_ROSTER_BASELINE_FAILURE:${seam}`);
      expect(observerVerified).toBe(true);
      expect(await durableState(pool, fixture.matchId, command.commandId)).toEqual(emptyState());
      await expect(importRosterBaseline({ pool, command, user })).resolves.toMatchObject({ status: "ACCEPTED", currentSeq: 1 });
      expect(await durableState(pool, fixture.matchId, command.commandId)).toEqual(fullState());
    } finally { await app.close(); await pool.end(); }
  });

  it("uses two distinct connections to serialize imports, deduplicate exact retry, and reject payload collision", async () => {
    const pool = await migratedPool();
    const app = buildApiApp({ pool });
    try {
      const fixture = await createFixture(app, pool);
      let arrived = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const barrier = async () => { arrived += 1; if (arrived === 2) release(); await gate; };
      const left = baselineCommand(fixture.matchId, 0);
      const right = baselineCommand(fixture.matchId, 0);
      const [leftResult, rightResult] = await Promise.all([
        importRosterBaseline({ pool, command: left, user, beforeStreamLockBarrier: barrier }),
        importRosterBaseline({ pool, command: right, user, beforeStreamLockBarrier: barrier })
      ]);
      expect([leftResult.status, rightResult.status].sort()).toEqual(["ACCEPTED", "SYNC_REQUIRED"]);
      const accepted = leftResult.status === "ACCEPTED" ? left : right;
      expect(await durableState(pool, fixture.matchId, accepted.commandId)).toEqual(fullState());
      await expect(importRosterBaseline({ pool, command: accepted, user })).resolves.toMatchObject({ status: "DUPLICATE_ACCEPTED", currentSeq: 1 });
      await expect(importRosterBaseline({ pool, command: { ...accepted, teamSide: "AWAY" }, user })).resolves.toMatchObject({ status: "REJECTED", reasonCode: "IDEMPOTENCY_COLLISION" });
      const sameRevision = baselineCommand(fixture.matchId, 1);
      const beforeSameRevision = await durableSnapshot(pool, fixture.matchId);
      await expect(importRosterBaseline({ pool, command: sameRevision, user })).resolves.toMatchObject({ status: "REJECTED", reasonCode: "DUPLICATE_SOURCE_REVISION" });
      expect(await durableSnapshot(pool, fixture.matchId)).toBe(beforeSameRevision);
      expect(await durableState(pool, fixture.matchId, accepted.commandId)).toEqual(fullState());
    } finally { await app.close(); await pool.end(); }
  });

  it("fails closed for cross-team membership without omitting malformed source rows", async () => {
    const pool = await migratedPool();
    const app = buildApiApp({ pool });
    try {
      const fixture = await createFixture(app, pool);
      await pool.query("UPDATE match_roster_players SET team_id = ? WHERE match_id = ? AND team_side = 'HOME' LIMIT 1", [fixture.awayTeamId, fixture.matchId]);
      const command = baselineCommand(fixture.matchId, 0);
      await expect(importRosterBaseline({ pool, command, user })).resolves.toMatchObject({ status: "REJECTED", reasonCode: "INVALID_ROSTER_RELATIONSHIP" });
      expect(await durableState(pool, fixture.matchId, command.commandId)).toEqual(emptyState());
    } finally { await app.close(); await pool.end(); }
  });

  it("rejects a duplicate player identity at the match-roster uniqueness boundary", async () => {
    const pool = await migratedPool();
    const app = buildApiApp({ pool });
    try {
      const fixture = await createFixture(app, pool);
      const [[player]] = await pool.query<RowDataPacket[]>("SELECT player_id, display_name_snapshot, jersey_number_snapshot FROM match_roster_players WHERE match_id = ? AND team_side = 'HOME' LIMIT 1", [fixture.matchId]);
      await expect(pool.query(
        "INSERT INTO match_roster_players (roster_player_id, match_id, team_side, team_id, player_id, display_name_snapshot, jersey_number_snapshot, roster_status, is_starter, is_captain) VALUES (?, ?, 'AWAY', ?, ?, ?, ?, 'ACTIVE', 0, 0)",
        [randomUUID(), fixture.matchId, fixture.awayTeamId, player.player_id, player.display_name_snapshot, player.jersey_number_snapshot]
      )).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
      expect(await durableState(pool, fixture.matchId, randomUUID())).toMatchObject({ events: 0, head: 0, protectedProjections: 0, publicProjections: 0, snapshots: 0 });
    } finally { await app.close(); await pool.end(); }
  });

  it("rejects the executable validation matrix without changing any affected durable row", async () => {
    const cases: Array<{ name: string; mutate: (pool: Pool, fixture: { matchId: string; homeTeamId: string; awayTeamId: string }) => Promise<void>; reason: string }> = [
      { name: "malformed roster row", mutate: async (pool, fixture) => { await pool.query("UPDATE match_roster_players SET display_name_snapshot = '' WHERE match_id = ? AND team_side = 'HOME' LIMIT 1", [fixture.matchId]); }, reason: "INVALID_ROSTER_RELATIONSHIP" },
      { name: "unknown player", mutate: async (pool, fixture) => { await pool.query("SET FOREIGN_KEY_CHECKS = 0"); try { await pool.query("DELETE p FROM players p JOIN match_roster_players mrp ON mrp.player_id = p.player_id WHERE mrp.match_id = ? AND mrp.team_side = 'HOME' LIMIT 1", [fixture.matchId]); } finally { await pool.query("SET FOREIGN_KEY_CHECKS = 1"); } }, reason: "INVALID_ROSTER_RELATIONSHIP" },
      { name: "unknown team", mutate: async (pool, fixture) => { await pool.query("SET FOREIGN_KEY_CHECKS = 0"); try { await pool.query("UPDATE match_roster_players SET team_id = ? WHERE match_id = ? AND team_side = 'HOME' LIMIT 1", [randomUUID(), fixture.matchId]); } finally { await pool.query("SET FOREIGN_KEY_CHECKS = 1"); } }, reason: "INVALID_ROSTER_RELATIONSHIP" },
      { name: "cross-team player", mutate: async (pool, fixture) => { await pool.query("UPDATE match_roster_players SET team_id = ? WHERE match_id = ? AND team_side = 'HOME' LIMIT 1", [fixture.awayTeamId, fixture.matchId]); }, reason: "INVALID_ROSTER_RELATIONSHIP" },
      { name: "inactive starter", mutate: async (pool, fixture) => { await pool.query("UPDATE match_roster_players SET roster_status = 'INACTIVE' WHERE match_id = ? AND team_side = 'HOME' AND is_starter = 1 LIMIT 1", [fixture.matchId]); }, reason: "INVALID_ROSTER_RELATIONSHIP" },
      { name: "inactive captain", mutate: async (pool, fixture) => { await pool.query("UPDATE match_roster_players SET roster_status = 'INACTIVE' WHERE match_id = ? AND team_side = 'HOME' AND is_captain = 1 LIMIT 1", [fixture.matchId]); }, reason: "INVALID_ROSTER_RELATIONSHIP" },
      { name: "starter outside effective roster", mutate: async (pool, fixture) => { await pool.query("UPDATE match_roster_players SET roster_status = 'INACTIVE', is_starter = 1 WHERE match_id = ? AND team_side = 'HOME' AND is_starter = 1 LIMIT 1", [fixture.matchId]); }, reason: "INVALID_ROSTER_RELATIONSHIP" },
      { name: "captain outside effective roster", mutate: async (pool, fixture) => { await pool.query("UPDATE match_roster_players SET roster_status = 'INACTIVE', is_captain = 1 WHERE match_id = ? AND team_side = 'HOME' AND is_captain = 1 LIMIT 1", [fixture.matchId]); }, reason: "INVALID_ROSTER_RELATIONSHIP" },
      { name: "empty roster", mutate: async (pool, fixture) => { await pool.query("DELETE FROM match_roster_players WHERE match_id = ? AND team_side = 'HOME'", [fixture.matchId]); }, reason: "INVALID_ROSTER_RELATIONSHIP" },
      { name: "unsupported rules profile", mutate: async (pool, fixture) => { await pool.query("UPDATE matches SET rule_profile_id = 'NBA' WHERE match_id = ?", [fixture.matchId]); }, reason: "NOT_EVALUATED" },
      { name: "missing starter-count binding", mutate: async (pool, fixture) => { await pool.query("UPDATE matches SET rule_profile_id = 'CUSTOM' WHERE match_id = ?", [fixture.matchId]); }, reason: "NOT_EVALUATED" }
    ];

    for (const testCase of cases) {
      const pool = await migratedPool();
      const app = buildApiApp({ pool });
      try {
        const fixture = await createFixture(app, pool);
        await testCase.mutate(pool, fixture);
        const before = await durableSnapshot(pool, fixture.matchId);
        const result = await importRosterBaseline({ pool, command: baselineCommand(fixture.matchId, 0), user });
        expect(result.status, testCase.name).toBe("REJECTED");
        expect(result.reasonCode, testCase.name).toBe(testCase.reason);
        expect(await durableSnapshot(pool, fixture.matchId), testCase.name).toBe(before);
      } finally { await app.close(); await pool.end(); }
    }
  });

  it("keeps missing eligibility fail-closed and blocks readiness without an eligibility engine", async () => {
    const pool = await migratedPool();
    const app = buildApiApp({ pool });
    try {
      const fixture = await createFixture(app, pool);
      const result = await importRosterBaseline({ pool, command: baselineCommand(fixture.matchId, 0), user });
      expect(result.status).toBe("ACCEPTED");
      expect(result.projection).toMatchObject({ readiness: { state: "NOT_EVALUATED", effective: false }, eligibilitySummary: { notEvaluated: 5 } });
    } finally { await app.close(); await pool.end(); }
  });

  it("rebuilds protected roster state from the event stream after projection loss", async () => {
    const pool = await migratedPool();
    const app = buildApiApp({ pool });
    try {
      const fixture = await createFixture(app, pool);
      await expect(importRosterBaseline({ pool, command: baselineCommand(fixture.matchId, 0), user })).resolves.toMatchObject({ status: "ACCEPTED" });
      await pool.query("DELETE FROM match_projections WHERE match_id = ? AND projection_type = 'roster-baseline-protected-home'", [fixture.matchId]);
      const sync = await getMatchSync({ pool, matchId: fixture.matchId, lastEventSeq: 0 });
      expect(sync.rosterBaseline).toHaveLength(1);
      expect(sync.rosterBaseline[0]?.projection).toMatchObject({ teamSide: "HOME", members: expect.any(Array), version: expect.objectContaining({ eventSeq: 1 }) });
    } finally { await app.close(); await pool.end(); }
  });

  it("uses the persisted snapshot and a nonzero real tail through production recovery after projection loss", async () => {
    const pool = await migratedPool();
    const app = buildApiApp({ pool });
    try {
      const fixture = await createFixture(app, pool);
      await expect(importRosterBaseline({ pool, command: baselineCommand(fixture.matchId, 0), user })).resolves.toMatchObject({ status: "ACCEPTED", currentSeq: 1 });
      const playerId = randomUUID();
      await pool.query("INSERT INTO players (player_id, team_id, display_name, jersey_number) VALUES (?, ?, ?, ?)", [playerId, fixture.homeTeamId, "Home reserve", "99"]);
      await pool.query("INSERT INTO match_roster_players (roster_player_id, match_id, team_side, team_id, player_id, display_name_snapshot, jersey_number_snapshot, roster_status, is_starter, is_captain) VALUES (?, ?, 'HOME', ?, ?, 'Home reserve', '99', 'BENCH', 0, 0)", [randomUUID(), fixture.matchId, fixture.homeTeamId, playerId]);
      await expect(importRosterBaseline({ pool, command: baselineCommand(fixture.matchId, 1), user })).resolves.toMatchObject({ status: "ACCEPTED", currentSeq: 2 });
      await pool.query("DELETE FROM match_roster_baseline_snapshots WHERE match_id = ? AND event_seq = 2", [fixture.matchId]);
      await pool.query("DELETE FROM match_projections WHERE match_id = ? AND projection_type = 'roster-baseline-protected-home'", [fixture.matchId]);

      const connection = await pool.getConnection();
      try {
        const recovered = await recoverRosterBaselineForMatch(connection, fixture.matchId, "HOME");
        expect(recovered.mode).toBe("SNAPSHOT_TAIL");
        expect(recovered.snapshotEventSeq).toBe(1);
        expect(recovered.tailEventSeqs).toEqual([2]);
        expect(recovered.projection).toMatchObject({
          teamSide: "HOME",
          matchTeamId: fixture.homeTeamId,
          members: expect.arrayContaining([expect.objectContaining({ playerId, displayName: "Home reserve" })]),
          version: expect.objectContaining({ eventSeq: 2 }),
          readiness: expect.objectContaining({ state: "NOT_EVALUATED" })
        });
      } finally { connection.release(); }

      const sync = await getMatchSync({ pool, matchId: fixture.matchId, lastEventSeq: 0 });
      expect(sync.rosterBaseline).toHaveLength(1);
      expect(sync.rosterBaseline[0]?.projection).toMatchObject({ matchTeamId: fixture.homeTeamId, version: expect.objectContaining({ eventSeq: 2 }) });
    } finally { await app.close(); await pool.end(); }
  });

  it("recovers multiple real tails, no-tail snapshots, full replay, corrupt snapshots, future snapshots, and gaps", async () => {
    const pool = await migratedPool();
    const app = buildApiApp({ pool });
    try {
      const fixture = await createFixture(app, pool);
      await expect(importRosterBaseline({ pool, command: baselineCommand(fixture.matchId, 0), user })).resolves.toMatchObject({ status: "ACCEPTED", currentSeq: 1 });
      const firstTailPlayer = await addBenchPlayer(pool, fixture, 1);
      await expect(importRosterBaseline({ pool, command: baselineCommand(fixture.matchId, 1), user })).resolves.toMatchObject({ status: "ACCEPTED", currentSeq: 2 });
      const secondTailPlayer = await addBenchPlayer(pool, fixture, 2);
      await expect(importRosterBaseline({ pool, command: baselineCommand(fixture.matchId, 2), user })).resolves.toMatchObject({ status: "ACCEPTED", currentSeq: 3 });
      await pool.query("DELETE FROM match_roster_baseline_snapshots WHERE match_id = ? AND team_side = 'HOME' AND event_seq > 1", [fixture.matchId]);
      await pool.query("DELETE FROM match_projections WHERE match_id = ? AND projection_type = 'roster-baseline-protected-home'", [fixture.matchId]);
      const connection = await pool.getConnection();
      try {
        const recovered = await recoverRosterBaselineForMatch(connection, fixture.matchId, "HOME");
        expect(recovered).toMatchObject({ mode: "SNAPSHOT_TAIL", snapshotEventSeq: 1, tailEventSeqs: [2, 3], projection: { version: { eventSeq: 3 }, members: expect.arrayContaining([expect.objectContaining({ playerId: firstTailPlayer }), expect.objectContaining({ playerId: secondTailPlayer })]) } });
      } finally { connection.release(); }

      await expect(importRosterBaseline({ pool, command: { ...baselineCommand(fixture.matchId, 3), teamSide: "AWAY" }, user })).resolves.toMatchObject({ status: "ACCEPTED", currentSeq: 4 });
      const noTailConnection = await pool.getConnection();
      try { expect(await recoverRosterBaselineForMatch(noTailConnection, fixture.matchId, "AWAY")).toMatchObject({ mode: "SNAPSHOT_TAIL", snapshotEventSeq: 4, tailEventSeqs: [] }); } finally { noTailConnection.release(); }

      await pool.query("DELETE FROM match_roster_baseline_snapshots WHERE match_id = ? AND team_side = 'HOME'", [fixture.matchId]);
      const replayConnection = await pool.getConnection();
      try { expect(await recoverRosterBaselineForMatch(replayConnection, fixture.matchId, "HOME")).toMatchObject({ mode: "FULL_REPLAY", snapshotEventSeq: null, projection: { version: { eventSeq: 3 } } }); } finally { replayConnection.release(); }

      await pool.query("UPDATE match_roster_baseline_snapshots SET projection_data = ? WHERE match_id = ? AND team_side = 'AWAY'", [JSON.stringify({ snapshotSchemaVersion: 1, projection: {} }), fixture.matchId]);
      await pool.query("DELETE FROM match_projections WHERE match_id = ? AND projection_type = 'roster-baseline-protected-away'", [fixture.matchId]);
      const corruptConnection = await pool.getConnection();
      try { expect(await recoverRosterBaselineForMatch(corruptConnection, fixture.matchId, "AWAY")).toMatchObject({ mode: "FULL_REPLAY", projection: { version: { eventSeq: 4 } } }); } finally { corruptConnection.release(); }

      const futureId = randomUUID();
      await pool.query("INSERT INTO match_roster_baseline_snapshots (snapshot_id, match_id, team_side, event_seq, event_id, canonical_payload_hash, projection_data) VALUES (?, ?, 'HOME', 5, ?, ?, ?)", [randomUUID(), fixture.matchId, futureId, "0".repeat(64), "{}"]);
      const futureConnection = await pool.getConnection();
      try { await expect(recoverRosterBaselineForMatch(futureConnection, fixture.matchId, "HOME")).rejects.toMatchObject({ code: "ROSTER_SNAPSHOT_AHEAD_OF_STREAM" }); } finally { futureConnection.release(); }
      await pool.query("DELETE FROM match_roster_baseline_snapshots WHERE match_id = ? AND event_id = ?", [fixture.matchId, futureId]);
      await pool.query("UPDATE match_streams SET last_seq_no = 5 WHERE match_id = ?", [fixture.matchId]);
      const gapConnection = await pool.getConnection();
      try { await expect(recoverRosterBaselineForMatch(gapConnection, fixture.matchId, "HOME")).rejects.toMatchObject({ code: "ROSTER_EVENT_STREAM_GAP" }); } finally { gapConnection.release(); }
      await pool.query("UPDATE match_streams SET last_seq_no = 4 WHERE match_id = ?", [fixture.matchId]);
    } finally { await app.close(); await pool.end(); }
  });

  it("proves roster snapshot-plus-tail equals full replay and live protected/public state", async () => {
    const pool = await migratedPool();
    const app = buildApiApp({ pool });
    try {
      const fixture = await createFixture(app, pool);
      await expect(importRosterBaseline({ pool, command: baselineCommand(fixture.matchId, 0), user })).resolves.toMatchObject({ status: "ACCEPTED", currentSeq: 1 });
      const connection = await pool.getConnection();
      let snapshot: any;
      try {
        const [rows] = await connection.query<RowDataPacket[]>("SELECT projection_data FROM match_roster_baseline_snapshots WHERE match_id = ? AND team_side = 'HOME' ORDER BY event_seq DESC LIMIT 1", [fixture.matchId]);
        snapshot = JSON.parse(String(rows[0]!.projection_data)).projection;
      } finally { connection.release(); }
      await expect(importRosterBaseline({ pool, command: { ...baselineCommand(fixture.matchId, 1), teamSide: "AWAY" }, user })).resolves.toMatchObject({ status: "ACCEPTED", currentSeq: 2 });
      const fullConnection = await pool.getConnection();
      let fullEvents: Awaited<ReturnType<typeof listMatchEvents>>;
      try { fullEvents = await listMatchEvents(fullConnection, fixture.matchId, 0); } finally { fullConnection.release(); }
      const fullReplay = { HOME: rebuildRosterBaselineFromEvents(fullEvents, "HOME"), AWAY: rebuildRosterBaselineFromEvents(fullEvents, "AWAY") };
      const tail = fullEvents.filter((event) => event.seqNo > snapshot.version.eventSeq);
      const snapshotTail = { HOME: snapshot, AWAY: rebuildRosterBaselineFromEvents(tail, "AWAY") };
      expect(snapshotTail).toEqual(fullReplay);
      for (const teamSide of ["HOME", "AWAY"] as const) {
        expect(fullReplay[teamSide]).toMatchObject(independentRosterOracle(fullEvents, teamSide));
        expect(snapshotTail[teamSide]).toMatchObject(independentRosterOracle(fullEvents, teamSide));
      }
      expect(snapshotTail.HOME).toMatchObject({ teamSide: "HOME", matchTeamId: fixture.homeTeamId, version: expect.objectContaining({ eventSeq: 1 }), readiness: expect.any(Object) });
      expect(snapshotTail.AWAY).toMatchObject({ teamSide: "AWAY", matchTeamId: fixture.awayTeamId, version: expect.objectContaining({ eventSeq: 2 }), readiness: expect.any(Object) });
      const live = await getMatchSync({ pool, matchId: fixture.matchId, lastEventSeq: 0 });
      expect(Object.fromEntries(live.rosterBaseline.map((entry) => [entry.teamSide, entry.projection]))).toEqual(fullReplay);
      expect(serializePublicRosterBaseline(snapshotTail.HOME!)).toEqual(serializePublicRosterBaseline(fullReplay.HOME!));
      expect(serializePublicRosterBaseline(snapshotTail.AWAY!)).toEqual(serializePublicRosterBaseline(fullReplay.AWAY!));
      expect(tail.some((event) => event.seqNo === 2 && event.eventType === "MATCH_ROSTER_BASELINE_IMPORTED")).toBe(true);
    } finally { await app.close(); await pool.end(); }
  });

  it("proves the mounted REST boundary, assignment revocation, CSRF, stale sequence, and privacy contract", async () => {
    const pool = await migratedPool();
    const app = buildApiApp({ pool });
    try {
      const fixture = await createFixture(app, pool);
      const otherFixture = await createFixture(app, pool);
      process.env.AUTH_TEST_DISABLE_CSRF = "false";
      const admin = await seedPrincipal(pool, "ADMIN");
      const scorer = await seedPrincipal(pool, "SCORER");
      const referee = await seedPrincipal(pool, "REFEREE");
      const viewer = await seedPrincipal(pool, "VIEWER");
      const timer = await seedPrincipal(pool, "TIMER");
      const shotClock = await seedPrincipal(pool, "SHOT_CLOCK_OPERATOR");
      const unassigned = await seedPrincipal(pool, "SCORER");
      await assignOfficial(pool, fixture.matchId, scorer.userId, "SCORER", admin.userId);
      await assignOfficial(pool, fixture.matchId, referee.userId, "REFEREE", admin.userId);
      await assignOfficial(pool, fixture.matchId, viewer.userId, "VIEWER", admin.userId);
      await assignOfficial(pool, fixture.matchId, timer.userId, "TIMER", admin.userId);
      await assignOfficial(pool, fixture.matchId, shotClock.userId, "SHOT_CLOCK_OPERATOR", admin.userId);

      const adminSession = await sessionFor(pool, admin);
      const scorerSession = await sessionFor(pool, scorer);
      const refereeSession = await sessionFor(pool, referee);
      const viewerSession = await sessionFor(pool, viewer);
      const timerSession = await sessionFor(pool, timer);
      const shotClockSession = await sessionFor(pool, shotClock);
      const unassignedSession = await sessionFor(pool, unassigned);
      const url = `/api/v1/matches/${fixture.matchId}/roster-baseline/import`;
      const importHeaders = (session: Session, expectedSeq: number, commandId = randomUUID()) => ({
        cookie: session.cookie,
        "x-csrf-token": session.csrfToken,
        "x-expected-seq": String(expectedSeq),
        "idempotency-key": commandId,
        "x-correlation-id": randomUUID()
      });

      const beforeAccessDenials = await durableState(pool, fixture.matchId, randomUUID());
      const anonymous = await app.inject({ method: "POST", url, payload: { teamSide: "HOME" }, headers: { "x-expected-seq": "0", "idempotency-key": randomUUID() } });
      expect(anonymous.statusCode).toBe(401);
      const viewerDenied = await app.inject({ method: "POST", url, headers: importHeaders(viewerSession, 0), payload: { teamSide: "HOME" } });
      expect(viewerDenied.statusCode).toBe(403);
      const unassignedDenied = await app.inject({ method: "POST", url, headers: importHeaders(unassignedSession, 0), payload: { teamSide: "HOME" } });
      expect(unassignedDenied.statusCode).toBe(403);
      const timerDenied = await app.inject({ method: "POST", url, headers: importHeaders(timerSession, 0), payload: { teamSide: "HOME" } });
      expect(timerDenied.statusCode).toBe(403);
      const shotClockDenied = await app.inject({ method: "POST", url, headers: importHeaders(shotClockSession, 0), payload: { teamSide: "HOME" } });
      expect(shotClockDenied.statusCode).toBe(403);
      const forgedRoleDenied = await app.inject({ method: "POST", url, headers: { ...importHeaders(unassignedSession, 0), "x-dev-user-role": "ADMIN" }, payload: { teamSide: "HOME" } });
      expect(forgedRoleDenied.statusCode).toBe(403);
      expect(await durableState(pool, fixture.matchId, randomUUID())).toEqual(beforeAccessDenials);
      const wrongMatchDenied = await app.inject({ method: "POST", url: `/api/v1/matches/${otherFixture.matchId}/roster-baseline/import`, headers: importHeaders(scorerSession, 0), payload: { teamSide: "HOME" } });
      expect(wrongMatchDenied.statusCode).toBe(403);
      expect(await durableState(pool, otherFixture.matchId, randomUUID())).toEqual(emptyState());
      const revokedBeforeImport = await app.inject({ method: "POST", url, headers: importHeaders(scorerSession, 0), payload: { teamSide: "HOME" } });
      expect(revokedBeforeImport.statusCode).toBe(200);

      const deniedState = await durableState(pool, fixture.matchId, randomUUID());
      expect(deniedState).toMatchObject({ events: 1, head: 1, protectedProjections: 1, publicProjections: 1, snapshots: 1 });
      const beforeRejected = await durableState(pool, fixture.matchId, randomUUID());
      const missingCsrf = await app.inject({ method: "POST", url, headers: { cookie: adminSession.cookie, "x-expected-seq": "1", "idempotency-key": randomUUID() }, payload: { teamSide: "AWAY" } });
      expect(missingCsrf.json()).toMatchObject({ error: { reasonCode: "CSRF_REQUIRED" } });
      expect(await durableState(pool, fixture.matchId, randomUUID())).toEqual(beforeRejected);
      const invalidCsrf = await app.inject({ method: "POST", url, headers: { ...importHeaders(adminSession, 1), "x-csrf-token": "invalid" }, payload: { teamSide: "AWAY" } });
      expect(invalidCsrf.json()).toMatchObject({ error: { reasonCode: "CSRF_INVALID" } });
      expect(await durableState(pool, fixture.matchId, randomUUID())).toEqual(beforeRejected);

      const forgedPayload = await app.inject({ method: "POST", url, headers: importHeaders(adminSession, 1), payload: { teamSide: "AWAY", members: [], readiness: "READY", rosterVersion: { eventSeq: 999 } } });
      expect(forgedPayload.statusCode).toBe(400);
      const afterRejected = await durableState(pool, fixture.matchId, randomUUID());
      expect(afterRejected).toEqual(beforeRejected);
      const stale = await app.inject({ method: "POST", url, headers: importHeaders(adminSession, 0), payload: { teamSide: "AWAY" } });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ status: "SYNC_REQUIRED" });
      expect(await durableState(pool, fixture.matchId, randomUUID())).toEqual(beforeRejected);

      const rawEventsUrl = `/api/v1/matches/${fixture.matchId}/events`;
      expect((await app.inject({ method: "GET", url: rawEventsUrl })).statusCode).toBe(401);
      expect((await app.inject({ method: "GET", url: rawEventsUrl, headers: { cookie: viewerSession.cookie } })).statusCode).toBe(403);
      expect((await app.inject({ method: "GET", url: rawEventsUrl, headers: { cookie: timerSession.cookie } })).statusCode).toBe(403);
      expect((await app.inject({ method: "GET", url: rawEventsUrl, headers: { cookie: shotClockSession.cookie } })).statusCode).toBe(403);
      expect((await app.inject({ method: "GET", url: rawEventsUrl, headers: { cookie: unassignedSession.cookie } })).statusCode).toBe(403);
      expect((await app.inject({ method: "GET", url: `/api/v1/matches/${otherFixture.matchId}/events`, headers: { cookie: scorerSession.cookie } })).statusCode).toBe(403);
      expect((await app.inject({ method: "GET", url: rawEventsUrl, headers: { cookie: unassignedSession.cookie, "x-dev-user-role": "ADMIN" } })).statusCode).toBe(403);
      expect((await app.inject({ method: "GET", url: rawEventsUrl, headers: { cookie: adminSession.cookie } })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: rawEventsUrl, headers: { cookie: refereeSession.cookie } })).statusCode).toBe(200);

      const mountedMatchList = await app.inject({ method: "GET", url: "/api/v1/matches", headers: { cookie: adminSession.cookie } });
      expect(mountedMatchList.statusCode).toBe(200);
      expect(JSON.stringify(mountedMatchList.json())).not.toContain('"ready":true');

      const protectedResponse = await app.inject({ method: "GET", url: `/api/v1/matches/${fixture.matchId}/roster-baseline/HOME`, headers: { cookie: scorerSession.cookie } });
      const publicResponse = await app.inject({ method: "GET", url: `/api/v1/public/matches/${fixture.matchId}/roster-baseline/HOME` });
      expect(protectedResponse.statusCode).toBe(200);
      expect(publicResponse.statusCode).toBe(200);
      const protectedBody = JSON.stringify(protectedResponse.json());
      const publicBody = JSON.stringify(publicResponse.json());
      expect(protectedBody).toContain("eligibilityState");
      const protectedData = protectedResponse.json<{ data: Record<string, unknown> }>().data;
      expect(Object.keys(protectedData).sort()).toEqual(["confirmation", "eligibilitySummary", "integrityIssues", "matchId", "matchTeamId", "members", "projectionIntegrityHash", "readiness", "ruleProfile", "sourceRevision", "teamSide", "version"]);
      expect(protectedData.version).toEqual(expect.objectContaining({ eventSeq: 1, eventId: expect.any(String), canonicalPayloadHash: expect.any(String) }));
      expect(protectedData.readiness).toEqual(expect.objectContaining({ state: expect.any(String), effective: expect.any(Boolean), starterCount: expect.any(Number), requiredStarterCount: 5, captainSet: expect.any(Boolean) }));
      const publicEnvelope = publicResponse.json<{ ok: boolean; data: { teamSide: string; readiness: { status: "READY" | "NOT_READY" }; initialized: boolean } }>();
      expect(Object.keys(publicEnvelope).sort()).toEqual(["data", "ok"]);
      expect(Object.keys(publicEnvelope.data).sort()).toEqual(["initialized", "readiness", "teamSide"]);
      expect(Object.keys(publicEnvelope.data.readiness).sort()).toEqual(["status"]);
      expect(publicEnvelope.data).toMatchObject({ teamSide: "HOME", readiness: { status: "NOT_READY" }, initialized: true });
      for (const forbidden of ["registrationIdentifier", "dateOfBirth", "identityDocumentReference", "disciplinaryDetail", "actor", "device", "receipt", "audit", "correlationId", "causationId", "canonicalPayloadHash", "legacyRosterRevision", "authorizationTrace", "integrityDiagnostics"]) {
        expect(publicBody).not.toContain(forbidden);
      }
      expect(publicBody).not.toContain("playerId");

      await pool.query("UPDATE match_officials SET assignment_status = 'REVOKED', revoked_at = NOW(3) WHERE match_id = ? AND user_id = ?", [fixture.matchId, scorer.userId]);
      const beforeRevoked = await durableState(pool, fixture.matchId, randomUUID());
      const revoked = await app.inject({ method: "POST", url, headers: importHeaders(scorerSession, 1), payload: { teamSide: "AWAY" } });
      expect(revoked.statusCode).toBe(403);
      expect(await durableState(pool, fixture.matchId, randomUUID())).toEqual(beforeRevoked);
      const refereeImport = await app.inject({ method: "POST", url, headers: importHeaders(refereeSession, 1), payload: { teamSide: "AWAY" } });
      expect(refereeImport.statusCode).toBe(200);
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("keeps mounted confirmation version binding fail-closed", async () => {
    const pool = await migratedPool();
    const app = buildApiApp({ pool });
    try {
      const fixture = await createFixture(app, pool);
      const imported = await importRosterBaseline({ pool, command: baselineCommand(fixture.matchId, 0), user });
      if (!imported.projection || !imported.eventId || imported.eventSeq === undefined) throw new Error("Baseline fixture did not produce a version");
      const eligibleMembers = imported.projection.members;
      const version = { eventSeq: imported.eventSeq, eventId: imported.eventId, canonicalPayloadHash: imported.projection.version!.canonicalPayloadHash };
      const writeProjection = async (projection: unknown) => { await pool.query("UPDATE match_projections SET projection_data = ? WHERE match_id = ? AND projection_type = 'roster-baseline-protected-home'", [JSON.stringify(projection), fixture.matchId]); };
      const baseInput = { matchId: fixture.matchId, teamSide: "HOME" as const, matchTeamId: fixture.homeTeamId, members: eligibleMembers, sourceRevision: imported.projection.sourceRevision, version, ruleProfile: "FIBA_2024" };

      await writeProjection(buildRosterBaselineProjection({ ...baseInput, confirmation: { confirmed: true, version: { eventSeq: version.eventSeq - 1, eventId: version.eventId, canonicalPayloadHash: version.canonicalPayloadHash } } }));
      const stale = await app.inject({ method: "GET", url: `/api/v1/matches/${fixture.matchId}/roster-baseline/HOME`, headers: adminHeaders });
      expect(stale.statusCode).toBe(200);
      expect(stale.json()).toMatchObject({ data: { readiness: { state: "NOT_EVALUATED", effective: false } } });

      await writeProjection(buildRosterBaselineProjection({ ...baseInput, confirmation: { confirmed: true, version: null } }));
      const legacy = await app.inject({ method: "GET", url: `/api/v1/matches/${fixture.matchId}/roster-baseline/HOME`, headers: adminHeaders });
      expect(legacy.statusCode).toBe(200);
      expect(legacy.json()).toMatchObject({ data: { readiness: { state: "NOT_EVALUATED", effective: false } } });

      await writeProjection(buildRosterBaselineProjection({ ...baseInput, confirmation: { confirmed: true, version } }));
      const matching = await app.inject({ method: "GET", url: `/api/v1/matches/${fixture.matchId}/roster-baseline/HOME`, headers: adminHeaders });
      expect(matching.statusCode).toBe(200);
      expect(matching.json()).toMatchObject({ data: { readiness: { state: "NOT_EVALUATED", effective: false } } });
    } finally { await app.close(); await pool.end(); }
  });

  it("quarantines every mounted roster PATCH critical field atomically", async () => {
    const pool = await migratedPool();
    const app = buildApiApp({ pool });
    try {
      const fixture = await createFixture(app, pool);
      const [[player]] = await pool.query<RowDataPacket[]>("SELECT player_id FROM match_roster_players WHERE match_id = ? AND team_side = 'HOME' LIMIT 1", [fixture.matchId]);
      const url = `/api/v1/matches/${fixture.matchId}/rosters/HOME/players/${player.player_id}`;
      const payloads = [
        { roster_status: "INACTIVE" }, { status: "INACTIVE" }, { is_starter: false }, { isStarter: false },
        { is_captain: false }, { isCaptain: false }, { confirmation: { confirmed: true } }, { readiness: "READY" },
        { roster_version: { eventSeq: 1 } }, { rosterVersion: { eventSeq: 1 } }, { lock_state: "LOCKED" },
        { lockState: "LOCKED" }, { status: "ACTIVE", isStarter: false, isCaptain: false, readiness: "READY" },
 { displayNameSnapshot: "safe-field-must-not-bypass", status: "ACTIVE", isStarter: false, isCaptain: false }
      ];
      for (const payload of payloads) {
        const before = await rosterRow(pool, fixture.matchId, player.player_id);
        const response = await app.inject({ method: "PATCH", url, headers: adminHeaders, payload });
        expect(response.statusCode, JSON.stringify(payload)).toBe(409);
        expect(response.json()).toMatchObject({ error: { reasonCode: "LINEUP_CRITICAL_FIELD_REQUIRES_EXPLICIT_COMMAND" } });
        expect(await rosterRow(pool, fixture.matchId, player.player_id), JSON.stringify(payload)).toBe(before);
      }
    } finally { await app.close(); await pool.end(); }
  });

  it("rejects every mutable legacy roster operation after baseline authority with no durable mutation", async () => {
    const pool = await migratedPool();
    const app = buildApiApp({ pool });
    try {
      const fixture = await createFixture(app, pool);
      const [[player]] = await pool.query<RowDataPacket[]>("SELECT player_id FROM match_roster_players WHERE match_id = ? AND team_side = 'HOME' LIMIT 1", [fixture.matchId]);
      const playerId = String(player.player_id);
      await expect(importRosterBaseline({ pool, command: baselineCommand(fixture.matchId, 0), user })).resolves.toMatchObject({ status: "ACCEPTED", currentSeq: 1 });
      const before = await durableSnapshot(pool, fixture.matchId);
      const beforeRoster = await rosterRow(pool, fixture.matchId, playerId);
      const operations = [
        () => selectLineupStarter(pool, { matchId: fixture.matchId, teamSide: "HOME", playerId, input: {} }),
        () => removeLineupStarter(pool, { matchId: fixture.matchId, teamSide: "HOME", playerId, input: {} }),
        () => setLineupCaptain(pool, { matchId: fixture.matchId, teamSide: "HOME", playerId, input: {} }),
        () => confirmLineupRoster(pool, { matchId: fixture.matchId, teamSide: "HOME", input: {}, actorUserId: user.userId }),
        () => assignPlayerToMatchRoster(pool, { matchId: fixture.matchId, teamSide: "HOME", playerId }),
        () => updateMatchRosterPlayer(pool, { matchId: fixture.matchId, teamSide: "HOME", playerId, input: { status: "ACTIVE", isStarter: true, isCaptain: true } })
      ];
      for (const operation of operations) {
        await expect(operation()).resolves.toMatchObject({ ok: false, statusCode: 409, reasonCode: "ROSTER_BASELINE_INITIALIZED_EXPLICIT_COMMAND_REQUIRED" });
        expect(await durableSnapshot(pool, fixture.matchId)).toBe(before);
        expect(await rosterRow(pool, fixture.matchId, playerId)).toBe(beforeRoster);
      }
    } finally { await app.close(); await pool.end(); }
  });

  it("proves mounted Socket.IO protected/public authorization, revocation re-check, and sanitized delivery", async () => {
    const pool = await migratedPool();
    const app = buildApiApp({ pool, realtime: { enabled: true } });
    const sockets: Socket[] = [];
    const phase = (name: string) => console.info(`[RM08-SOCKET-PHASE] ${name}`);
    try {
      phase("server created");
      const fixture = await createFixture(app, pool);
      process.env.AUTH_TEST_DISABLE_CSRF = "false";
      const admin = await seedPrincipal(pool, "ADMIN");
      const scorer = await seedPrincipal(pool, "SCORER");
      const viewer = await seedPrincipal(pool, "VIEWER");
      const timer = await seedPrincipal(pool, "TIMER");
      await assignOfficial(pool, fixture.matchId, scorer.userId, "SCORER", admin.userId);
      await assignOfficial(pool, fixture.matchId, viewer.userId, "VIEWER", admin.userId);
      await assignOfficial(pool, fixture.matchId, timer.userId, "TIMER", admin.userId);

      const scorerSession = await sessionFor(pool, scorer);
      const adminSession = await sessionFor(pool, admin);
      const scoreResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${fixture.matchId}/commands/score/add`,
        headers: { cookie: adminSession.cookie, "x-csrf-token": adminSession.csrfToken },
        payload: {
          commandId: randomUUID(),
          matchId: fixture.matchId,
          expectedSeq: 0,
          correlationId: randomUUID(),
          clientTimestamp: new Date().toISOString(),
          payload: { teamSide: "HOME", points: 2, playerId: null, periodNumber: 1, gameClockRemainingMs: 590000, note: null, role: "ADMIN", assignedMatchIds: [fixture.matchId] }
        }
      });
      expect(scoreResponse.statusCode, scoreResponse.body).toBe(200);
      const initialBaseline = await app.inject({ method: "POST", url: `/api/v1/matches/${fixture.matchId}/roster-baseline/import`, headers: { cookie: adminSession.cookie, "x-csrf-token": adminSession.csrfToken, "x-expected-seq": "1", "idempotency-key": randomUUID() }, payload: { teamSide: "HOME" } });
      expect(initialBaseline.statusCode, initialBaseline.body).toBe(200);
      await app.listen({ host: "127.0.0.1", port: 0 });
      phase("server listening");

      const address = app.server.address();
      if (!address || typeof address === "string") throw new Error("Socket test server did not expose a TCP address");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const protectedSocket = await connectSocket(baseUrl, { cookie: scorerSession.cookie }); sockets.push(protectedSocket); phase("protected operator connected");
      const adminSocket = await connectSocket(baseUrl, { cookie: adminSession.cookie }); sockets.push(adminSocket); phase("protected admin connected");
      const publicSocket = await connectSocket(baseUrl); sockets.push(publicSocket); phase("public client connected");
      const viewerSocket = await connectSocket(baseUrl, { cookie: (await sessionFor(pool, viewer)).cookie }); sockets.push(viewerSocket);
      const timerSocket = await connectSocket(baseUrl, { cookie: (await sessionFor(pool, timer)).cookie }); sockets.push(timerSocket);
      const protectedSnapshot = waitForEvent(protectedSocket, "match:operator-snapshot", 2_000, "protected subscription");
      protectedSocket.emit("match:join", { matchId: fixture.matchId, view: "OPERATOR", lastSeq: 0 });
      const protectedPayload = await protectedSnapshot;
      phase("protected subscriptions acknowledged");
      expect(JSON.stringify(protectedPayload)).toContain("rosterBaseline");
      const protectedSyncPayload = protectedPayload as { rosterBaseline: Array<{ teamSide: string; projection: Record<string, unknown> }> };
      expect(protectedSyncPayload.rosterBaseline).toHaveLength(1);
      expect(Object.keys(protectedSyncPayload.rosterBaseline[0]!.projection).sort()).toEqual(["confirmation", "eligibilitySummary", "integrityIssues", "matchId", "matchTeamId", "members", "projectionIntegrityHash", "readiness", "ruleProfile", "sourceRevision", "teamSide", "version"]);
      expect(protectedSyncPayload.rosterBaseline[0]!.projection.version).toEqual(expect.objectContaining({ eventSeq: 2, eventId: expect.any(String), canonicalPayloadHash: expect.any(String) }));
      expect(protectedSyncPayload.rosterBaseline[0]!.projection.readiness).toEqual(expect.objectContaining({ state: expect.any(String), effective: expect.any(Boolean), starterCount: expect.any(Number), requiredStarterCount: 5, captainSet: expect.any(Boolean) }));
      const reconnectSocket = await connectSocket(baseUrl, { cookie: scorerSession.cookie }); sockets.push(reconnectSocket);
      const reconnectSnapshot = waitForEvent(reconnectSocket, "match:operator-snapshot", 2_000, "protected reconnect");
      reconnectSocket.emit("match:join", { matchId: fixture.matchId, view: "OPERATOR", lastSeq: 0 });
      const reconnectPayload = await reconnectSnapshot;
      expect(reconnectPayload.rosterBaseline).toEqual(protectedPayload.rosterBaseline);
      const adminSnapshot = waitForEvent(adminSocket, "match:operator-snapshot", 2_000, "admin subscription");
      adminSocket.emit("match:join", { matchId: fixture.matchId, view: "OPERATOR", lastSeq: 0 });
      await adminSnapshot;

      const publicScoreboardSnapshot = waitForEvent(publicSocket, "match:snapshot", 2_000, "public scoreboard subscription");
      const publicSnapshot = waitForEvent(publicSocket, "roster-baseline:public-snapshot", 2_000, "public roster subscription");
      publicSocket.emit("match:join", { matchId: fixture.matchId, view: "PUBLIC_SCOREBOARD", lastSeq: 0 });
      await publicScoreboardSnapshot;
      const publicPayload = await publicSnapshot;
      phase("public subscription acknowledged");
      const publicJson = JSON.stringify(publicPayload);
      expect(publicJson).not.toContain("playerId");
      for (const projection of publicPayload.projections) {
        expect(Object.keys(projection).sort()).toEqual(["initialized", "readiness", "teamSide"]);
        expect(Object.keys(projection.readiness).sort()).toEqual(["status"]);
        expect(projection).toMatchObject({ readiness: { status: "NOT_READY" }, initialized: true });
      }
      for (const forbidden of ["playerId", "eligibilityState", "canonicalPayloadHash", "legacyRosterRevision", "correlationId", "causationId", "audit", "receipt", "actor", "device"]) expect(publicJson).not.toContain(forbidden);

      const denied = waitForEvent(viewerSocket, "match:error", 2_000, "viewer denial");
      const beforeSocketDenials = await durableState(pool, fixture.matchId, randomUUID());
      viewerSocket.emit("match:join", { matchId: fixture.matchId, view: "OPERATOR", lastSeq: 0 });
      expect(await denied).toMatchObject({ reasonCode: "FORBIDDEN" });
      const timerDenied = waitForEvent(timerSocket, "match:error", 2_000, "timer denial");
      timerSocket.emit("match:join", { matchId: fixture.matchId, view: "OPERATOR", lastSeq: 0 });
      expect(await timerDenied).toMatchObject({ reasonCode: "FORBIDDEN" });
      const anonymousSocket = await connectSocket(baseUrl); sockets.push(anonymousSocket);
      const anonymousDenied = waitForEvent(anonymousSocket, "match:error", 2_000, "anonymous denial");
      anonymousSocket.emit("match:join", { matchId: fixture.matchId, view: "OPERATOR", lastSeq: 0 });
      expect(await anonymousDenied).toMatchObject({ reasonCode: "FORBIDDEN" });
      expect(await durableState(pool, fixture.matchId, randomUUID())).toEqual(beforeSocketDenials);

      await pool.query("UPDATE match_officials SET assignment_status = 'REVOKED', revoked_at = NOW(3) WHERE match_id = ? AND user_id = ?", [fixture.matchId, scorer.userId]);
      phase("assignment revoked");
      const revokedUpdate = waitForNoEvent(protectedSocket, "roster-baseline:protected-updated", 300, "revoked protected delivery");
      const authorizedUpdate = waitForEvent(adminSocket, "roster-baseline:protected-updated", 2_000, "admin protected delivery");
      const publicUpdate = waitForEvent(publicSocket, "roster-baseline:public-updated", 2_000, "public update delivery");
      const committedCommandId = randomUUID();
      const committedHeaders = { cookie: adminSession.cookie, "x-csrf-token": adminSession.csrfToken, "x-expected-seq": "2", "idempotency-key": committedCommandId, "x-correlation-id": randomUUID() };
      const adminSessionResult = await app.inject({ method: "POST", url: `/api/v1/matches/${fixture.matchId}/roster-baseline/import`, headers: committedHeaders, payload: { teamSide: "AWAY" } });
      expect(adminSessionResult.statusCode).toBe(200);
      phase("baseline command committed");
      expect(await revokedUpdate).toBe(true);
      expect(await authorizedUpdate).toMatchObject({ matchId: fixture.matchId, teamSide: "AWAY" });
      const publicUpdatePayload = await publicUpdate;
      expect(JSON.stringify(publicUpdatePayload)).not.toContain("playerId");
      expect(Object.keys(publicUpdatePayload.projection).sort()).toEqual(["initialized", "readiness", "teamSide"]);
      expect(Object.keys(publicUpdatePayload.projection.readiness).sort()).toEqual(["status"]);
      const committedBody = adminSessionResult.json<{ eventId?: string; currentSeq?: number }>();
      adminSocket.disconnect();
      const retrySocket = await connectSocket(baseUrl, { cookie: adminSession.cookie }); sockets.push(retrySocket);
      const retrySnapshot = waitForEvent(retrySocket, "match:operator-snapshot", 2_000, "disconnect-after-commit reconnect");
      retrySocket.emit("match:join", { matchId: fixture.matchId, view: "OPERATOR", lastSeq: 2 });
      await retrySnapshot;
      const retryResult = await app.inject({ method: "POST", url: `/api/v1/matches/${fixture.matchId}/roster-baseline/import`, headers: committedHeaders, payload: { teamSide: "AWAY" } });
      expect(retryResult.statusCode).toBe(200);
      expect(retryResult.json()).toMatchObject({ eventId: committedBody.eventId, currentSeq: committedBody.currentSeq });
      const tailReconnectSocket = await connectSocket(baseUrl, { cookie: adminSession.cookie }); sockets.push(tailReconnectSocket);
      const tailReconnectSnapshot = waitForEvent(tailReconnectSocket, "match:operator-snapshot", 2_000, "protected tail reconnect");
      tailReconnectSocket.emit("match:join", { matchId: fixture.matchId, view: "OPERATOR", lastSeq: 1 });
      const tailReconnectPayload = await tailReconnectSnapshot as { missedEvents: Array<{ seqNo: number; eventType: string }> };
      expect(tailReconnectPayload.missedEvents).toEqual(expect.arrayContaining([expect.objectContaining({ seqNo: 3, eventType: "MATCH_ROSTER_BASELINE_IMPORTED" })]));
      const publicReconnect = await connectSocket(baseUrl); sockets.push(publicReconnect);
      const publicReconnectSnapshot = waitForEvent(publicReconnect, "roster-baseline:public-snapshot", 2_000, "public nonzero-tail reconnect");
      await pool.query("DELETE FROM match_projections WHERE match_id = ? AND projection_type = 'roster-baseline-protected-home'", [fixture.matchId]);
      publicReconnect.emit("match:join", { matchId: fixture.matchId, view: "PUBLIC_SCOREBOARD", lastSeq: 1 });
      const publicReconnectPayload = await publicReconnectSnapshot as { matchId: string; projections: Array<Record<string, unknown>>; readiness: Record<string, unknown>; recoveredTailEventSeqs?: number[] };
      expect(publicReconnectPayload).toEqual(expect.objectContaining({ matchId: fixture.matchId }));
      expect(publicReconnectPayload.recoveredTailEventSeqs).toBeUndefined();
      expect(publicReconnectPayload.projections.map((projection) => projection.teamSide).sort()).toEqual(["AWAY", "HOME"]);
      for (const projection of publicReconnectPayload.projections) {
        expect(Object.keys(projection).sort()).toEqual(["initialized", "readiness", "teamSide"]);
        expect(Object.keys(projection.readiness as Record<string, unknown>).sort()).toEqual(["status"]);
      }
      expect(JSON.stringify(publicReconnectPayload)).not.toContain("playerId");
      phase("clients disconnected");
    } finally {
      await Promise.allSettled(sockets.map((socket) => socket.close()));
      await app.close();
      await pool.end();
      phase("server closed and database handles released");
    }
  });
});

async function migratedPool() {
  process.env.AUTH_TEST_DISABLE_CSRF = "true";
  const pool = createDatabasePool();
  const connection = await pool.getConnection();
  try { await runMigrations({ migrationsDir: getDefaultMigrationsDir(), connection: new MariaDbMigrationConnection(connection) }); } finally { connection.release(); }
  return pool;
}

async function createFixture(app: ReturnType<typeof buildApiApp>, pool: Pool) {
  const homeTeamId = randomUUID();
  const awayTeamId = randomUUID();
  await pool.query("INSERT INTO teams (team_id, name) VALUES (?, ?), (?, ?)", [homeTeamId, `RM08 Home ${homeTeamId}`, awayTeamId, `RM08 Away ${awayTeamId}`]);
  const response = await app.inject({ method: "POST", url: "/api/v1/matches", headers: adminHeaders, payload: { matchCode: `RM08-${randomUUID()}`, ruleProfileId: "FIBA_2024", homeTeamId, awayTeamId } });
  expect(response.statusCode, response.body).toBe(201);
  const matchId = response.json<{ matchId: string }>().matchId;
  for (const [teamSide, teamId, label] of [["HOME", homeTeamId, "Home"], ["AWAY", awayTeamId, "Away"]] as const) {
    for (let index = 1; index <= 5; index += 1) {
      const playerId = randomUUID();
      await pool.query("INSERT INTO players (player_id, team_id, display_name, jersey_number) VALUES (?, ?, ?, ?)", [playerId, teamId, `${label} ${index}`, String(index)]);
      await pool.query("INSERT INTO match_roster_players (roster_player_id, match_id, team_side, team_id, player_id, display_name_snapshot, jersey_number_snapshot, roster_status, is_starter, is_captain) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?)", [randomUUID(), matchId, teamSide, teamId, playerId, `${label} ${index}`, String(index), index === 1]);
    }
  }
  return { matchId, homeTeamId, awayTeamId };
}

async function addBenchPlayer(pool: Pool, fixture: { matchId: string; homeTeamId: string }, index: number) {
  const playerId = randomUUID();
  await pool.query("INSERT INTO players (player_id, team_id, display_name, jersey_number) VALUES (?, ?, ?, ?)", [playerId, fixture.homeTeamId, `Home reserve ${index}`, String(90 + index)]);
  await pool.query("INSERT INTO match_roster_players (roster_player_id, match_id, team_side, team_id, player_id, display_name_snapshot, jersey_number_snapshot, roster_status, is_starter, is_captain) VALUES (?, ?, 'HOME', ?, ?, ?, ?, 'BENCH', 0, 0)", [randomUUID(), fixture.matchId, fixture.homeTeamId, playerId, `Home reserve ${index}`, String(90 + index)]);
  return playerId;
}

async function rosterRow(pool: Pool, matchId: string, playerId: string) {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT team_side, team_id, player_id, display_name_snapshot, jersey_number_snapshot, roster_status, is_starter, is_captain FROM match_roster_players WHERE match_id = ? AND player_id = ?", [matchId, playerId]);
  return JSON.stringify(rows);
}

function baselineCommand(matchId: string, expectedSeq: number) { return { matchId, teamSide: "HOME" as const, expectedSeq, commandId: randomUUID(), correlationId: randomUUID() }; }
type Principal = { userId: string; email: string; password: string };
type Session = { cookie: string; csrfToken: string };

async function seedPrincipal(pool: Pool, roleKey: "ADMIN" | "SCORER" | "REFEREE" | "VIEWER" | "TIMER" | "SHOT_CLOCK_OPERATOR"): Promise<Principal> {
  const userId = randomUUID();
  const email = `${userId}@rm08.example`;
  const password = `Task004-${randomUUID()}`;
  await pool.query("INSERT IGNORE INTO roles (role_id, role_key, role_name) VALUES (?, ?, ?)", [randomUUID(), roleKey, roleKey]);
  const [roles] = await pool.query<RowDataPacket[]>("SELECT role_id FROM roles WHERE role_key = ?", [roleKey]);
  const permissions = roleKey === "ADMIN"
    ? ["match.create", "match.read", "match.score.operate", "public.scoreboard.read"]
    : roleKey === "VIEWER" || roleKey === "TIMER" || roleKey === "SHOT_CLOCK_OPERATOR"
      ? ["match.read", "public.scoreboard.read"]
      : ["match.read", "match.score.operate", "public.scoreboard.read"];
  for (const permissionKey of permissions) {
    await pool.query("INSERT IGNORE INTO permissions (permission_id, permission_key, description) VALUES (?, ?, ?)", [randomUUID(), permissionKey, permissionKey]);
    const [permissionRows] = await pool.query<RowDataPacket[]>("SELECT permission_id FROM permissions WHERE permission_key = ?", [permissionKey]);
    await pool.query("INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)", [roles[0]!.role_id, permissionRows[0]!.permission_id]);
  }
  await pool.query("INSERT INTO users (user_id, email, display_name, password_hash, status) VALUES (?, ?, ?, ?, 'ACTIVE')", [userId, email, `${roleKey} RM08`, await bcrypt.hash(password, 10)]);
  await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userId, roles[0]!.role_id]);
  return { userId, email, password };
}

async function assignOfficial(pool: Pool, matchId: string, userId: string, roleCode: string, assignedBy: string) {
  await pool.query("INSERT INTO match_officials (id, match_id, user_id, role_code, assignment_status, assigned_by_user_id, assigned_at, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, NOW(3), NOW(3))", [randomUUID(), matchId, userId, roleCode, assignedBy]);
}

async function sessionFor(pool: Pool, principal: Principal): Promise<Session> {
  const result = await loginWithPassword(pool, { email: principal.email, password: principal.password });
  if (!result.ok) throw new Error("Task 004 test login failed");
  return { cookie: result.cookie, csrfToken: result.csrfToken };
}

function connectSocket(baseUrl: string, headers: Record<string, string> = {}) {
  return new Promise<Socket>((resolve, reject) => {
    const socket = createSocket(baseUrl, { transports: ["websocket"], extraHeaders: headers, timeout: 2_000 });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function waitForEvent(socket: Socket, event: string, timeoutMs = 2_000, phase = event) {
  return new Promise<unknown>((resolve, reject) => {
    const onEvent = (payload: unknown) => { clearTimeout(timer); socket.off(event, onEvent); resolve(payload); };
    const timer = setTimeout(() => { socket.off(event, onEvent); reject(new Error(`SOCKET_PHASE_TIMEOUT:${phase}`)); }, timeoutMs);
    socket.once(event, onEvent);
  });
}
function waitForNoEvent(socket: Socket, event: string, timeoutMs: number, phase = event) {
  return new Promise<boolean>((resolve) => {
    const onEvent = () => { clearTimeout(timer); socket.off(event, onEvent); resolve(false); };
    const timer = setTimeout(() => { socket.off(event, onEvent); resolve(true); }, timeoutMs);
    socket.once(event, onEvent);
  });
}
function independentRosterOracle(events: Awaited<ReturnType<typeof listMatchEvents>>, teamSide: "HOME" | "AWAY") {
  const event = [...events].reverse().find((candidate) => candidate.eventType === "MATCH_ROSTER_BASELINE_IMPORTED" && (candidate.payload as { teamSide?: unknown }).teamSide === teamSide);
  if (!event || !event.payload || typeof event.payload !== "object") throw new Error(`Missing canonical roster event for ${teamSide}`);
  const payload = event.payload as {
    teamSide: "HOME" | "AWAY";
    matchTeamId: string;
    members: unknown[];
    source?: { legacyRosterRevision?: string };
    rosterVersion?: { eventSeq?: number; eventId?: string; canonicalPayloadHash?: string };
  };
  return {
    teamSide,
    matchTeamId: payload.matchTeamId,
    members: payload.members,
    sourceRevision: payload.source?.legacyRosterRevision,
    version: {
      eventSeq: Number(payload.rosterVersion?.eventSeq ?? event.seqNo),
      eventId: payload.rosterVersion?.eventId ?? event.eventId,
      canonicalPayloadHash: payload.rosterVersion?.canonicalPayloadHash
    }
  };
}
function emptyState() { return { events: 0, head: 0, protectedProjections: 0, publicProjections: 0, snapshots: 0, receipts: 0, audits: 0 }; }
function fullState() { return { events: 1, head: 1, protectedProjections: 1, publicProjections: 1, snapshots: 1, receipts: 1, audits: 1 }; }
async function durableState(pool: Pool, matchId: string, commandId: string) { const connection = await pool.getConnection(); try { return await state(connection, matchId, commandId); } finally { connection.release(); } }
async function durableSnapshot(pool: Pool, matchId: string) {
  const connection = await pool.getConnection();
  try {
    const [events] = await connection.query<RowDataPacket[]>("SELECT seq_no, event_id, event_type, payload, command_id, expected_seq, correlation_id FROM match_events WHERE match_id = ? ORDER BY seq_no", [matchId]);
    const [head] = await connection.query<RowDataPacket[]>("SELECT last_seq_no FROM match_streams WHERE match_id = ?", [matchId]);
    const [projections] = await connection.query<RowDataPacket[]>("SELECT projection_type, projection_version, last_event_seq, projection_data FROM match_projections WHERE match_id = ? AND projection_type LIKE 'roster-baseline-%' ORDER BY projection_type", [matchId]);
    const [snapshots] = await connection.query<RowDataPacket[]>("SELECT team_side, event_seq, event_id, canonical_payload_hash, projection_data FROM match_roster_baseline_snapshots WHERE match_id = ? ORDER BY team_side, event_seq", [matchId]);
    const [receipts] = await connection.query<RowDataPacket[]>("SELECT command_id, request_hash, status, result FROM command_deduplication WHERE match_id = ? ORDER BY command_id", [matchId]);
    const [audits] = await connection.query<RowDataPacket[]>("SELECT action, event_seq, old_value, new_value, correlation_id, causation_id FROM audit_logs WHERE entity_id = ? AND action = 'MATCH_ROSTER_BASELINE_IMPORTED' ORDER BY event_seq", [matchId]);
    return JSON.stringify({ events, head, projections, snapshots, receipts, audits });
  } finally { connection.release(); }
}
async function state(connection: PoolConnection, matchId: string, commandId: string) {
  const [[events], [head], [protectedRows], [publicRows], [snapshots], [receipts], [audits]] = await Promise.all([
    connection.query<RowDataPacket[]>("SELECT COUNT(*) AS value FROM match_events WHERE match_id = ?", [matchId]),
    connection.query<RowDataPacket[]>("SELECT last_seq_no AS value FROM match_streams WHERE match_id = ?", [matchId]),
    connection.query<RowDataPacket[]>("SELECT COUNT(*) AS value FROM match_projections WHERE match_id = ? AND projection_type = 'roster-baseline-protected-home'", [matchId]),
    connection.query<RowDataPacket[]>("SELECT COUNT(*) AS value FROM match_projections WHERE match_id = ? AND projection_type = 'roster-baseline-public-home'", [matchId]),
    connection.query<RowDataPacket[]>("SELECT COUNT(*) AS value FROM match_roster_baseline_snapshots WHERE match_id = ?", [matchId]),
    connection.query<RowDataPacket[]>("SELECT COUNT(*) AS value FROM command_deduplication WHERE match_id = ? AND command_id = ?", [matchId, commandId]),
    connection.query<RowDataPacket[]>("SELECT COUNT(*) AS value FROM audit_logs WHERE entity_id = ? AND action = 'MATCH_ROSTER_BASELINE_IMPORTED'", [matchId])
  ]);
  return { events: Number(events[0]!.value), head: Number(head[0]!.value), protectedProjections: Number(protectedRows[0]!.value), publicProjections: Number(publicRows[0]!.value), snapshots: Number(snapshots[0]!.value), receipts: Number(receipts[0]!.value), audits: Number(audits[0]!.value) };
}
