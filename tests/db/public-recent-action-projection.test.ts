import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as createSocketClient, type Socket } from "socket.io-client";
import type { Pool } from "mysql2/promise";
import { buildApiApp } from "../../apps/api/src/app";
import { hasDatabaseEnv } from "../../apps/api/src/config/env";
import { createDatabasePool } from "../../apps/api/src/db";
import {
  MariaDbMigrationConnection,
  getDefaultMigrationsDir,
  runMigrations
} from "../../apps/api/src/migrations";
import type { PublicMatchSnapshotPayload } from "../../packages/api-contracts/src";
import {
  DB_INTEGRATION_HOOK_TIMEOUT_MS,
  DB_INTEGRATION_TEST_TIMEOUT_MS
} from "../helpers/dbIntegrationTimeout";

const describeDb = hasDatabaseEnv() ? describe : describe.skip;
const forbiddenKeys = new Set([
  "sourceEventSeq", "initializedAtSeq", "recentActionState", "version", "playerId",
  "playerName", "jerseyNumber", "actor", "device", "role", "session", "token", "csrf",
  "commandId", "correlationId", "causationId", "audit", "correction", "reason", "note",
  "requester", "rawEvents", "lastEventSeq", "currentSeq", "expectedSeq", "projectionVersion",
  "eventSeq", "streamVersion"
]);

describeDb.sequential("DB-backed public recent actions", { timeout: DB_INTEGRATION_TEST_TIMEOUT_MS }, () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createDatabasePool();
    const connection = await pool.getConnection();
    try {
      await runMigrations({
        migrationsDir: getDefaultMigrationsDir(),
        connection: new MariaDbMigrationConnection(connection)
      });
    } finally {
      connection.release();
    }
  }, DB_INTEGRATION_HOOK_TIMEOUT_MS);

  afterAll(async () => {
    await pool?.end();
  }, DB_INTEGRATION_HOOK_TIMEOUT_MS);

  it("maps legacy absence to empty without event-history reads", async () => {
    const matchId = await insertMatchAndProjection(pool, undefined);
    const queries: string[] = [];
    const app = buildApiApp({ pool: queryLoggingPool(pool, queries) as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${matchId}/scoreboard`
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ matchId, recentActions: [] });
      expect(queries.filter((sql) => sql.includes("match_projections"))).toHaveLength(1);
      expect(queries.some((sql) => sql.includes("FROM match_events"))).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("keeps persisted HTTP and socket actions equal and recursively public-safe", async () => {
    const matchId = await insertMatchAndProjection(pool, {
      version: 1,
      initializedAtSeq: 4,
      items: [
        privateItem(7, { kind: "SCORE", teamSide: "HOME", points: 2 }),
        privateItem(6, { kind: "TEAM_FOUL", teamSide: "AWAY" }),
        privateItem(5, { kind: "GAME_STATUS", status: "STARTED" })
      ]
    });
    const app = buildApiApp({ pool, realtime: { enabled: true } });
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const socket = createSocketClient(address, { transports: ["websocket"], forceNew: true });

    try {
      await waitForSocketEvent(socket, "connect");
      const snapshotPromise = waitForSocketEvent<PublicMatchSnapshotPayload>(socket, "match:snapshot");
      socket.emit("match:join", { matchId, view: "PUBLIC_SCOREBOARD" });
      const [snapshot, response] = await Promise.all([
        snapshotPromise,
        app.inject({ method: "GET", url: `/api/v1/public/matches/${matchId}/scoreboard` })
      ]);
      const httpProjection = response.json();

      expect(response.statusCode).toBe(200);
      expect(snapshot.publicScoreboard.recentActions).toEqual(httpProjection.recentActions);
      expect(httpProjection.recentActions).toEqual([
        { kind: "SCORE", teamSide: "HOME", points: 2 },
        { kind: "TEAM_FOUL", teamSide: "AWAY" },
        { kind: "GAME_STATUS", status: "STARTED" }
      ]);
      expect([...collectForbiddenKeys(snapshot)]).toEqual([]);
      expect([...collectForbiddenKeys(httpProjection)]).toEqual([]);
    } finally {
      socket.close();
      await app.close();
    }
  });

  it("publishes a persisted correction result as an empty replacement list", async () => {
    const matchId = await insertMatchAndProjection(pool, {
      version: 1,
      initializedAtSeq: 10,
      items: []
    });
    const app = buildApiApp({ pool });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${matchId}/scoreboard`
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().recentActions).toEqual([]);
      expect(JSON.stringify(response.json())).not.toMatch(/correction|reason|sourceEventSeq/i);
    } finally {
      await app.close();
    }
  });
});

async function insertMatchAndProjection(pool: Pool, recentActionState: unknown) {
  const matchId = randomUUID();
  await pool.query(
    "INSERT INTO matches (match_id, match_code, status, metadata) VALUES (?, ?, 'LIVE', ?)",
    [matchId, `PUBLIC-RECENT-${randomUUID()}`, JSON.stringify({})]
  );
  const projection = {
    matchId,
    homeScore: 0,
    awayScore: 0,
    teamFouls: { home: 0, away: 0 },
    playerFouls: [],
    periodNumber: 1,
    gameClockRemainingMs: 600000,
    shotClockRemainingMs: 24000,
    status: "LIVE",
    currentSeq: 0,
    ...(recentActionState === undefined ? {} : { recentActionState })
  };
  await pool.query(
    "INSERT INTO match_projections (projection_id, match_id, projection_type, projection_version, last_event_seq, projection_data) VALUES (?, ?, 'scoreboard', 1, 0, ?)",
    [randomUUID(), matchId, JSON.stringify(projection)]
  );
  return matchId;
}

function queryLoggingPool(pool: Pool, queries: string[]) {
  return {
    async getConnection() {
      const connection = await pool.getConnection();
      return {
        async query(sql: string, params?: unknown[]) {
          queries.push(sql);
          return connection.query(sql, params);
        },
        release() {
          connection.release();
        }
      };
    }
  };
}

function privateItem(sourceEventSeq: number, item: Record<string, unknown>) {
  return {
    sourceEventSeq,
    ...item,
    playerId: randomUUID(),
    playerName: "Private Player",
    jerseyNumber: "7",
    actor: "private-actor",
    reason: "private-reason"
  };
}

function waitForSocketEvent<T>(socket: Socket, eventName: string, timeoutMs = 3000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}`)), timeoutMs);
    socket.once(eventName, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function collectForbiddenKeys(value: unknown, found = new Set<string>()) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) found.add(key);
    collectForbiddenKeys(child, found);
  }
  return found;
}
