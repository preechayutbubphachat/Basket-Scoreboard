import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { buildApiApp } from "../../apps/api/src/app";
import { createDatabasePool } from "../../apps/api/src/db";
import { hasDatabaseEnv } from "../../apps/api/src/config/env";
import { MariaDbMigrationConnection, getDefaultMigrationsDir, runMigrations } from "../../apps/api/src/migrations";
import { appendTimeoutGrantCommand, type TimeoutCommandFailureSeam } from "../../apps/api/src/matchEventStore/appendTimeoutCommand";
import { timeoutGrantCommandSchema, type AuthenticatedUser } from "@basket-scoreboard/api-contracts";

const describeDb = hasDatabaseEnv() ? describe : describe.skip;
const admin = { "x-dev-user-role": "ADMIN", "x-dev-user-id": "00000000-0000-4000-8000-0000000000aa" };
const envelope = (matchId: string, expectedSeq: number, payload: object, commandId = randomUUID()) => ({ commandId, matchId, expectedSeq, correlationId: randomUUID(), clientTimestamp: new Date().toISOString(), payload });
const taskUser: AuthenticatedUser = { userId: admin["x-dev-user-id"], role: "ADMIN", permissions: [], assignedMatchIds: [], deviceId: "task013-real-db", authMode: "DEV_HEADER" };
const seams: TimeoutCommandFailureSeam[] = ["afterEvent", "afterHead", "afterProjection", "afterReceipt", "afterAudit", "beforeCommit"];

afterAll(() => { delete process.env.AUTH_TEST_DISABLE_CSRF; });

describeDb("RM-07 timeout control on isolated MariaDB", { timeout: 60_000 }, () => {
  it("atomically grants, audits, deduplicates, rejects collisions, serializes privately, and resolves concurrency", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const pool = createDatabasePool();
    const migration = await pool.getConnection();
    try { await runMigrations({ migrationsDir: getDefaultMigrationsDir(), connection: new MariaDbMigrationConnection(migration) }); } finally { migration.release(); }
    const app = buildApiApp({ pool });
    try {
      const created = await app.inject({ method: "POST", url: "/api/v1/matches", headers: admin, payload: { matchCode: `RM07-TIMEOUT-${randomUUID()}`, ruleProfileId: "FIBA_2024" } });
      expect(created.statusCode).toBe(201);
      const { matchId } = created.json<{ matchId: string }>();
      const started = await app.inject({ method: "POST", url: `/api/v1/matches/${matchId}/commands/lifecycle/start-match`, headers: admin, payload: envelope(matchId, 0, { reason: null }) });
      expect(started.json()).toMatchObject({ status: "ACCEPTED", currentSeq: 1 });
      expect((await app.inject({ method: "POST", url: `/api/v1/matches/${matchId}/commands/clock/game/start`, headers: admin, payload: envelope(matchId, 1, {}) })).json()).toMatchObject({ status: "ACCEPTED", currentSeq: 2 });
      const opportunity = await app.inject({ method: "POST", url: `/api/v1/matches/${matchId}/commands/score/add`, headers: admin, payload: envelope(matchId, 2, { teamSide: "HOME", points: 2, playerId: null, periodNumber: 1, gameClockRemainingMs: 590000, note: null }) });
      expect(opportunity.json()).toMatchObject({ status: "ACCEPTED", currentSeq: 3 });

      const commandId = randomUUID();
      const grant = envelope(matchId, 3, { teamSide: "AWAY" }, commandId);
      const accepted = await app.inject({ method: "POST", url: `/api/v1/matches/${matchId}/commands/timeout/grant`, headers: admin, payload: grant });
      expect(accepted.json(), accepted.body).toMatchObject({ status: "ACCEPTED", currentSeq: 4, appendedEvents: [{ eventType: "TEAM_TIMEOUT_GRANTED" }] });
      const duplicate = await app.inject({ method: "POST", url: `/api/v1/matches/${matchId}/commands/timeout/grant`, headers: admin, payload: grant });
      expect(duplicate.json()).toMatchObject({ status: "DUPLICATE_ACCEPTED", currentSeq: 4, appendedEvents: [] });
      const collision = await app.inject({ method: "POST", url: `/api/v1/matches/${matchId}/commands/timeout/grant`, headers: admin, payload: { ...grant, payload: { teamSide: "HOME" } } });
      expect(collision.json()).toMatchObject({ status: "REJECTED", reasonCode: "DUPLICATE_COMMAND" });

      const [events] = await pool.query<RowDataPacket[]>("SELECT event_type, payload FROM match_events WHERE match_id = ? ORDER BY seq_no", [matchId]);
      expect(events).toHaveLength(4);
      const persisted = JSON.parse(events[3]!.payload);
      expect(persisted).toMatchObject({ teamSide: "AWAY", ruleProfileId: "FIBA_2024", opportunitySeq: 3, quotaWindow: "FIRST_HALF", usedBefore: 0, usedAfter: 1, remainingAfter: 1 });
      const [receipts] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM command_deduplication WHERE match_id = ? AND command_id = ?", [matchId, commandId]);
      expect(Number(receipts[0]!.count)).toBe(1);
      const [audits] = await pool.query<RowDataPacket[]>("SELECT action FROM audit_logs WHERE entity_id = ? AND action = 'TEAM_TIMEOUT_GRANTED'", [matchId]);
      expect(audits).toHaveLength(1);

      const projection = await app.inject({ method: "GET", url: `/api/v1/matches/${matchId}/projection`, headers: admin });
      expect(projection.json()).toMatchObject({ currentSeq: 4, timeoutsByHalf: { firstHalf: { away: 1 } }, activeTimeout: { teamSide: "AWAY" } });
      const publicState = await app.inject({ method: "GET", url: `/api/v1/public/matches/${matchId}/scoreboard` });
      const serialized = JSON.stringify(publicState.json());
      expect(serialized).not.toContain("timeoutOpportunity");
      expect(serialized).not.toContain("opportunitySeq");
      expect(serialized).not.toContain("usedBefore");

    } finally { await app.close(); await pool.end(); }
  });

  it.each(seams)("rolls back the real accepted transaction at %s and remains retryable", async (seam) => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const pool = createDatabasePool();
    const migration = await pool.getConnection();
    try { await runMigrations({ migrationsDir: getDefaultMigrationsDir(), connection: new MariaDbMigrationConnection(migration) }); } finally { migration.release(); }
    const app = buildApiApp({ pool });
    try {
      const matchId = await createOpenOpportunity(app, `RM07-ROLLBACK-${seam}-${randomUUID()}`);
      const baseline = await durableState(pool, matchId);
      const command = timeoutGrantCommandSchema.parse(envelope(matchId, 3, { teamSide: "AWAY" }));
      let seamObserved = false;

      await expect(appendTimeoutGrantCommand({
        pool,
        command,
        user: taskUser,
        injectFailureAt: seam,
        async onFailureSeam(actual, transactionalConnection) {
          expect(actual).toBe(seam);
          const inside = await transactionState(transactionalConnection, matchId, command.commandId);
          const outside = await durableState(pool, matchId, command.commandId);
          expect(inside.events).toBe(baseline.events + 1);
          expect(outside).toEqual({ ...baseline, receipts: 0, audits: 0 });
          seamObserved = true;
        }
      })).rejects.toThrow(`INJECTED_TIMEOUT_COMMAND_FAILURE:${seam}`);

      expect(seamObserved).toBe(true);
      expect(await durableState(pool, matchId, command.commandId)).toEqual({ ...baseline, receipts: 0, audits: 0 });
      await expect(appendTimeoutGrantCommand({ pool, command, user: taskUser })).resolves.toMatchObject({ status: "ACCEPTED", currentSeq: 4 });
    } finally { await app.close(); await pool.end(); }
  });

  it("serializes two real connections at one expected sequence to one accept and one conflict", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const pool = createDatabasePool();
    const migration = await pool.getConnection();
    try { await runMigrations({ migrationsDir: getDefaultMigrationsDir(), connection: new MariaDbMigrationConnection(migration) }); } finally { migration.release(); }
    const app = buildApiApp({ pool });
    try {
      const matchId = await createOpenOpportunity(app, `RM07-CONCURRENCY-${randomUUID()}`);
      let arrivals = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const barrier = async () => { arrivals += 1; if (arrivals === 2) release(); await gate; };
      const first = timeoutGrantCommandSchema.parse(envelope(matchId, 3, { teamSide: "AWAY" }));
      const second = timeoutGrantCommandSchema.parse(envelope(matchId, 3, { teamSide: "AWAY" }));

      const results = await Promise.all([
        appendTimeoutGrantCommand({ pool, command: first, user: taskUser, beforeStreamLockBarrier: barrier }),
        appendTimeoutGrantCommand({ pool, command: second, user: taskUser, beforeStreamLockBarrier: barrier })
      ]);
      expect(results.map((result) => result.status).sort(), JSON.stringify(results)).toEqual(["ACCEPTED", "SYNC_REQUIRED"]);
      const acceptedCommandId = results[0]!.status === "ACCEPTED" ? first.commandId : second.commandId;
      const state = await durableState(pool, matchId, acceptedCommandId);
      expect(state).toMatchObject({ events: 4, head: 4, projection: 4, receipts: 1, audits: 1 });
      const observer = await pool.getConnection();
      try {
        const [rows] = await observer.query<RowDataPacket[]>("SELECT seq_no FROM match_events WHERE match_id = ? ORDER BY seq_no", [matchId]);
        expect(rows.map((row) => Number(row.seq_no))).toEqual([1, 2, 3, 4]);
      } finally { observer.release(); }
    } finally { await app.close(); await pool.end(); }
  });
});

async function createOpenOpportunity(app: ReturnType<typeof buildApiApp>, matchCode: string) {
  const created = await app.inject({ method: "POST", url: "/api/v1/matches", headers: admin, payload: { matchCode, ruleProfileId: "FIBA_2024" } });
  expect(created.statusCode).toBe(201);
  const { matchId } = created.json<{ matchId: string }>();
  expect((await app.inject({ method: "POST", url: `/api/v1/matches/${matchId}/commands/lifecycle/start-match`, headers: admin, payload: envelope(matchId, 0, { reason: null }) })).json()).toMatchObject({ status: "ACCEPTED", currentSeq: 1 });
  expect((await app.inject({ method: "POST", url: `/api/v1/matches/${matchId}/commands/clock/game/start`, headers: admin, payload: envelope(matchId, 1, {}) })).json()).toMatchObject({ status: "ACCEPTED", currentSeq: 2 });
  expect((await app.inject({ method: "POST", url: `/api/v1/matches/${matchId}/commands/score/add`, headers: admin, payload: envelope(matchId, 2, { teamSide: "HOME", points: 2, playerId: null, periodNumber: 1, gameClockRemainingMs: 590000, note: null }) })).json()).toMatchObject({ status: "ACCEPTED", currentSeq: 3 });
  return matchId;
}

async function transactionState(connection: PoolConnection, matchId: string, commandId: string) {
  return queryState(connection, matchId, commandId);
}

async function durableState(pool: Pool, matchId: string, commandId = "") {
  const connection = await pool.getConnection();
  try { return await queryState(connection, matchId, commandId); } finally { connection.release(); }
}

async function queryState(connection: PoolConnection, matchId: string, commandId: string) {
  const [[eventCount], [head], [projection], [receiptCount], [auditCount]] = await Promise.all([
    connection.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM match_events WHERE match_id = ?", [matchId]),
    connection.query<RowDataPacket[]>("SELECT last_seq_no AS value FROM match_streams WHERE match_id = ?", [matchId]),
    connection.query<RowDataPacket[]>("SELECT last_event_seq AS value FROM match_projections WHERE match_id = ?", [matchId]),
    connection.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM command_deduplication WHERE match_id = ? AND command_id = ?", [matchId, commandId]),
    connection.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM audit_logs WHERE entity_id = ? AND action = 'TEAM_TIMEOUT_GRANTED'", [matchId])
  ]);
  return {
    events: Number(eventCount[0]!.count),
    head: Number(head[0]!.value),
    projection: Number(projection[0]!.value),
    receipts: Number(receiptCount[0]!.count),
    audits: Number(auditCount[0]!.count)
  };
}
