import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { buildApiApp } from "../../apps/api/src/app";
import { hasDatabaseEnv } from "../../apps/api/src/config/env";
import { createDatabasePool } from "../../apps/api/src/db";
import { MariaDbMigrationConnection, getDefaultMigrationsDir, runMigrations } from "../../apps/api/src/migrations";

const describeDb = hasDatabaseEnv() ? describe : describe.skip;
const adminHeaders = {
  "x-dev-user-role": "ADMIN",
  "x-dev-user-id": "00000000-0000-4000-8000-0000000000aa"
};

describeDb("internal recent-action projection persistence", () => {
  it("persists new and prospective legacy state while keeping public output unchanged", async () => {
    const { app, pool } = await buildMigratedApp();
    try {
      const first = await createMatch(app, "RECENT-NEW");
      expect(await projectionData(pool, first)).toMatchObject({
        currentSeq: 0,
        recentActionState: { version: 1, initializedAtSeq: 0, items: [] }
      });

      const firstCommand = scoreCommand(first, 0, "HOME", 2);
      expect((await app.inject({
        method: "POST",
        url: `/api/v1/matches/${first}/commands/score/add`,
        headers: adminHeaders,
        payload: firstCommand
      })).json()).toMatchObject({ status: "ACCEPTED", currentSeq: 1 });
      expect((await app.inject({
        method: "POST",
        url: `/api/v1/matches/${first}/commands/score/add`,
        headers: adminHeaders,
        payload: firstCommand
      })).json()).toMatchObject({ status: "DUPLICATE_ACCEPTED", currentSeq: 1 });

      const persisted = await projectionData(pool, first);
      expect(persisted.recentActionState).toEqual({
        version: 1,
        initializedAtSeq: 0,
        items: [{ sourceEventSeq: 1, kind: "SCORE", teamSide: "HOME", points: 2 }]
      });

      await pool.query(
        "UPDATE match_projections SET projection_data = JSON_REMOVE(projection_data, '$.recentActionState') WHERE match_id = ?",
        [first]
      );
      expect((await app.inject({
        method: "POST",
        url: `/api/v1/matches/${first}/commands/score/add`,
        headers: adminHeaders,
        payload: scoreCommand(first, 1, "AWAY", 3)
      })).json()).toMatchObject({ status: "ACCEPTED", currentSeq: 2 });

      expect((await projectionData(pool, first)).recentActionState).toEqual({
        version: 1,
        initializedAtSeq: 1,
        items: [{ sourceEventSeq: 2, kind: "SCORE", teamSide: "AWAY", points: 3 }]
      });

      const publicResponse = await app.inject({ method: "GET", url: `/api/v1/public/matches/${first}/scoreboard` });
      expect(publicResponse.statusCode).toBe(200);
      expect(JSON.stringify(publicResponse.json())).not.toMatch(/recentActionState|sourceEventSeq|initializedAtSeq/i);

      const second = await createMatch(app, "RECENT-ISOLATED");
      expect((await projectionData(pool, second)).recentActionState).toEqual({
        version: 1,
        initializedAtSeq: 0,
        items: []
      });
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("persists correction removal and safely rejects a stream whose projection row is absent", async () => {
    const { app, pool } = await buildMigratedApp();
    try {
      const matchId = await createMatch(app, "RECENT-CORRECTION");
      await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/score/add`,
        headers: adminHeaders,
        payload: scoreCommand(matchId, 0, "HOME", 2)
      });
      const request = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/corrections/request`,
        headers: adminHeaders,
        payload: correctionRequest(matchId, 1, 1)
      });
      expect(request.json()).toMatchObject({ status: "ACCEPTED", currentSeq: 2 });
      const apply = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/corrections/apply-score`,
        headers: adminHeaders,
        payload: applyCorrection(matchId, 2, 2, 1)
      });
      expect(apply.json()).toMatchObject({ status: "ACCEPTED" });
      expect((await projectionData(pool, matchId)).recentActionState.items).toEqual([]);

      const missingProjectionMatch = await createMatch(app, "RECENT-NO-PROJECTION");
      await pool.query("DELETE FROM match_projections WHERE match_id = ?", [missingProjectionMatch]);
      const rejected = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${missingProjectionMatch}/commands/score/add`,
        headers: adminHeaders,
        payload: scoreCommand(missingProjectionMatch, 0, "HOME", 2)
      });
      expect(rejected.statusCode).toBe(500);
      expect(rejected.json()).toEqual({ error: { reasonCode: "INTERNAL_ERROR", message: "Internal server error" } });
      const [events] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) count FROM match_events WHERE match_id = ?", [missingProjectionMatch]);
      expect(Number(events[0]!.count)).toBe(0);
    } finally {
      await app.close();
      await pool.end();
    }
  });
});

async function buildMigratedApp() {
  process.env.AUTH_TEST_DISABLE_CSRF = "true";
  const pool = createDatabasePool();
  const connection = await pool.getConnection();
  try {
    await runMigrations({ migrationsDir: getDefaultMigrationsDir(), connection: new MariaDbMigrationConnection(connection) });
  } finally {
    connection.release();
  }
  return { app: buildApiApp({ pool }), pool };
}

async function createMatch(app: ReturnType<typeof buildApiApp>, prefix: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/matches",
    headers: adminHeaders,
    payload: { matchCode: `${prefix}-${randomUUID()}`, ruleProfileId: "FIBA_2024" }
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ matchId: string }>().matchId;
}

async function projectionData(pool: ReturnType<typeof createDatabasePool>, matchId: string) {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT projection_data FROM match_projections WHERE match_id = ?", [matchId]);
  const value = rows[0]!.projection_data;
  return (typeof value === "string" ? JSON.parse(value) : value) as {
    currentSeq?: number;
    recentActionState: { version: number; initializedAtSeq: number; items: Array<Record<string, unknown>> };
  };
}

function scoreCommand(matchId: string, expectedSeq: number, teamSide: "HOME" | "AWAY", points: 1 | 2 | 3) {
  return {
    commandId: randomUUID(),
    matchId,
    expectedSeq,
    correlationId: randomUUID(),
    clientTimestamp: new Date().toISOString(),
    payload: { teamSide, points, playerId: null, periodNumber: 1, gameClockRemainingMs: 590000, note: null }
  };
}

function correctionRequest(matchId: string, expectedSeq: number, targetSeq: number) {
  return {
    commandId: randomUUID(), matchId, expectedSeq, correlationId: randomUUID(), clientTimestamp: new Date().toISOString(),
    payload: { targetSeq, correctionType: "SCORE_CORRECTION", reason: "Test correction", note: null }
  };
}

function applyCorrection(matchId: string, expectedSeq: number, correctionRequestSeq: number, targetSeq: number) {
  return {
    commandId: randomUUID(), matchId, expectedSeq, correlationId: randomUUID(), clientTimestamp: new Date().toISOString(),
    payload: { correctionRequestSeq, targetSeq, reason: "Test correction", removeOriginalScore: true, replacement: null }
  };
}
