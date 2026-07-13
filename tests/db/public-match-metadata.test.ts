import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as createSocketClient, type Socket } from "socket.io-client";
import type { Pool } from "mysql2/promise";
import { buildApiApp } from "../../apps/api/src/app";
import { hasDatabaseEnv } from "../../apps/api/src/config/env";
import { createDatabasePool } from "../../apps/api/src/db";
import { MariaDbMigrationConnection, getDefaultMigrationsDir, runMigrations } from "../../apps/api/src/migrations";
import { resolvePublicMatchMetadata } from "../../apps/api/src/publicScoreboard/publicMatchMetadata";
import type { PublicMatchSnapshotPayload } from "../../packages/api-contracts/src";

const describeDb = hasDatabaseEnv() ? describe : describe.skip;
const forbiddenPublicKeys = new Set([
  "lastEventSeq", "currentSeq", "expectedSeq", "projectionVersion", "eventSeq", "streamVersion",
  "tournamentId", "venueId", "courtId", "teamId", "actor", "session", "token", "csrf",
  "permissions", "assignments", "audit", "correction", "rawEvents", "match_code", "scheduled_at",
  "venue_name", "metadata"
]);

describeDb.sequential("DB-backed public match metadata", () => {
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
    await waitForMigratedMatchesTable(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("resolves complete, partial and missing metadata without cross-match leakage", async () => {
    const completeId = await insertMatch(pool, {
      matchCode: "Round 2",
      scheduledAt: "2026-07-20 10:00:00",
      venueName: "Municipal Arena",
      metadata: { courtLabel: "Court A", courtId: randomUUID(), privateNote: "hidden" }
    });
    const partialId = await insertMatch(pool, { venueName: "Main Arena", metadata: {} });
    const missingId = await insertMatch(pool, { metadata: {} });

    expect(await resolvePublicMatchMetadata(pool, completeId)).toEqual({
      roundLabel: "Round 2",
      courtLabel: "Court A",
      venueLabel: "Municipal Arena",
      scheduledStart: "2026-07-20T10:00:00.000Z"
    });
    expect(await resolvePublicMatchMetadata(pool, partialId)).toEqual({ venueLabel: "Main Arena" });
    expect(await resolvePublicMatchMetadata(pool, missingId)).toBeUndefined();
  });

  it("ignores array metadata, non-string court labels and every extra metadata key", async () => {
    const arrayId = await insertMatch(pool, { metadata: ["Court A"] });
    const nonStringId = await insertMatch(pool, { metadata: { courtLabel: 42, courtId: randomUUID() } });
    const safeId = await insertMatch(pool, { metadata: { courtLabel: "Court B", venueId: randomUUID(), nested: { secret: true } } });

    expect(await resolvePublicMatchMetadata(pool, arrayId)).toBeUndefined();
    expect(await resolvePublicMatchMetadata(pool, nonStringId)).toBeUndefined();
    expect(await resolvePublicMatchMetadata(pool, safeId)).toEqual({ courtLabel: "Court B" });
  });

  it("omits blank and control-character labels loaded from authoritative columns", async () => {
    const matchId = await insertMatch(pool, {
      matchCode: " ",
      venueName: "Arena\nPrivate",
      metadata: { courtLabel: "\tCourt A" }
    });

    expect(await resolvePublicMatchMetadata(pool, matchId)).toBeUndefined();
  });

  it("keeps public HTTP and socket metadata identical with exact safe envelopes", async () => {
    const matchId = await insertMatch(pool, {
      matchCode: "Final",
      scheduledAt: "2026-07-20 10:00:00",
      venueName: "Municipal Arena",
      metadata: { courtLabel: "Court A", courtId: randomUUID(), venueId: randomUUID() }
    });
    await insertProjection(pool, matchId);
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
      expect(snapshot.publicScoreboard.matchMetadata).toEqual(httpProjection.matchMetadata);
      expect(snapshot.publicScoreboard.matchMetadata).toEqual({
        roundLabel: "Final",
        courtLabel: "Court A",
        venueLabel: "Municipal Arena",
        scheduledStart: "2026-07-20T10:00:00.000Z"
      });
      expect(Object.keys(snapshot).sort()).toEqual(["matchId", "publicScoreboard", "serverTime"]);
      expect([...collectForbiddenPublicKeys(snapshot)]).toEqual([]);
      expect([...collectForbiddenPublicKeys(httpProjection)]).toEqual([]);
    } finally {
      socket.close();
      await app.close();
    }
  });
});

async function insertMatch(pool: Pool, input: {
  matchCode?: string | null;
  scheduledAt?: string | null;
  venueName?: string | null;
  metadata: unknown;
}) {
  const matchId = randomUUID();
  await pool.query(
    "INSERT INTO matches (match_id, match_code, status, scheduled_at, venue_name, metadata) VALUES (?, ?, 'LIVE', ?, ?, ?)",
    [matchId, input.matchCode ?? null, input.scheduledAt ?? null, input.venueName ?? null, JSON.stringify(input.metadata)]
  );
  return matchId;
}

async function insertProjection(pool: Pool, matchId: string) {
  await pool.query(
    "INSERT INTO match_projections (projection_id, match_id, projection_type, projection_version, last_event_seq, projection_data) VALUES (?, ?, 'scoreboard', 1, 0, ?)",
    [randomUUID(), matchId, JSON.stringify({ matchId, homeScore: 0, awayScore: 0, teamFouls: { home: 0, away: 0 }, periodNumber: 1, gameClockRemainingMs: 600000, shotClockRemainingMs: 24000, status: "LIVE", currentSeq: 0 })]
  );
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

function collectForbiddenPublicKeys(value: unknown, found = new Set<string>()) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenPublicKeys.has(key)) found.add(key);
    collectForbiddenPublicKeys(child, found);
  }
  return found;
}

async function waitForMigratedMatchesTable(pool: Pool) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      await pool.query("SELECT match_id FROM matches LIMIT 1");
      await pool.query("SELECT projection_id FROM match_projections LIMIT 1");
      await pool.query("SELECT screen_id FROM display_screens LIMIT 1");
      return;
    } catch (error) {
      if (!String(error).includes("doesn't exist")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Timed out waiting for disposable database migrations");
}
