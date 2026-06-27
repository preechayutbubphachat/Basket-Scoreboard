import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { buildApiApp } from "../../apps/api/src/app";
import { createDatabasePool } from "../../apps/api/src/db";
import { hasDatabaseEnv } from "../../apps/api/src/config/env";
import {
  MariaDbMigrationConnection,
  getDefaultMigrationsDir,
  runMigrations
} from "../../apps/api/src/migrations";
import { insertAuditLog, listAuditLogsForMatch } from "../../apps/api/src/matchEventStore/auditRepository";
import { correctionEventTypes } from "../../packages/event-model/src";

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

  const app = buildApiApp({ pool });

  return { app, pool };
}

function scoreCommand(matchId: string, expectedSeq: number, commandId = randomUUID()) {
  return {
    commandId,
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
      note: null
    }
  };
}

describeDb("match event store MVP", () => {
  it("creates matches, appends score events, deduplicates commands, syncs missed events, and keeps public output read-only", async () => {
    const { app, pool } = await buildMigratedApp();

    try {
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        payload: {
          matchCode: `M-${randomUUID()}`,
          ruleProfileId: "FIBA_2024"
        }
      });

      expect(createResponse.statusCode).toBe(201);
      const created = createResponse.json<{ matchId: string; currentSeq: number }>();
      expect(created.currentSeq).toBe(0);

      const [matchRows] = await pool.query<RowDataPacket[]>(
        "SELECT match_id FROM matches WHERE match_id = ?",
        [created.matchId]
      );
      const [streamRows] = await pool.query<RowDataPacket[]>(
        "SELECT last_seq_no FROM match_streams WHERE match_id = ?",
        [created.matchId]
      );
      expect(matchRows).toHaveLength(1);
      expect(streamRows[0]!.last_seq_no).toBe(0);

      const stateResponse = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${created.matchId}/state`
      });
      expect(stateResponse.json()).toMatchObject({
        matchId: created.matchId,
        homeScore: 0,
        awayScore: 0,
        currentSeq: 0,
        projectionVersion: "scoreboard-v1"
      });

      const firstCommand = scoreCommand(created.matchId, 0);
      const firstScoreResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/score/add`,
        payload: firstCommand
      });

      expect(firstScoreResponse.statusCode).toBe(200);
      expect(firstScoreResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 1,
        appendedEvents: [{ seqNo: 1, eventType: "SCORE_ADDED" }]
      });

      const duplicateResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/score/add`,
        payload: firstCommand
      });
      expect(duplicateResponse.json()).toMatchObject({
        status: "DUPLICATE_ACCEPTED",
        currentSeq: 1
      });

      const secondCommand = scoreCommand(created.matchId, 1);
      secondCommand.payload.teamSide = "AWAY";
      secondCommand.payload.points = 3;

      const secondScoreResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/score/add`,
        payload: secondCommand
      });
      expect(secondScoreResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 2,
        appendedEvents: [{ seqNo: 2, eventType: "SCORE_ADDED" }]
      });

      const conflictResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/score/add`,
        payload: scoreCommand(created.matchId, 0)
      });
      expect(conflictResponse.json()).toMatchObject({
        status: "SYNC_REQUIRED",
        currentSeq: 2
      });

      const eventsResponse = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${created.matchId}/events`
      });
      const events = eventsResponse.json<Array<{ seqNo: number; eventType: string }>>();
      expect(events.map((event) => event.seqNo)).toEqual([1, 2]);
      expect(events.map((event) => event.eventType)).toEqual(["SCORE_ADDED", "SCORE_ADDED"]);

      const updatedStateResponse = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${created.matchId}/state`
      });
      expect(updatedStateResponse.json()).toMatchObject({
        homeScore: 2,
        awayScore: 3,
        currentSeq: 2
      });

      const syncResponse = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${created.matchId}/sync?lastEventSeq=1`
      });
      expect(syncResponse.json()).toMatchObject({
        matchId: created.matchId,
        currentSeq: 2,
        lastEventSeq: 1,
        fullStateSyncRequired: false,
        projectionVersion: "scoreboard-v1",
        connectionStatus: "ONLINE"
      });
      expect(syncResponse.json<{ missedEvents: unknown[] }>().missedEvents).toHaveLength(1);

      const publicResponse = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${created.matchId}/scoreboard`
      });
      const publicBody = publicResponse.json();
      expect(publicBody).toMatchObject({
        matchId: created.matchId,
        homeScore: 2,
        awayScore: 3,
        currentSeq: 2
      });
      expect(JSON.stringify(publicBody)).not.toContain("actor");
      expect(JSON.stringify(publicBody)).not.toContain("device");
      expect(JSON.stringify(publicBody)).not.toContain("audit");
      expect(JSON.stringify(publicBody)).not.toContain("reason");

      const publicCommandResponse = await app.inject({
        method: "POST",
        url: `/api/v1/public/matches/${created.matchId}/scoreboard`,
        payload: firstCommand
      });
      expect(publicCommandResponse.statusCode).toBe(404);
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("returns safe errors and supports audit log insert/list without exposing audit data publicly", async () => {
    const { app, pool } = await buildMigratedApp();

    try {
      const invalidCreateResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        payload: { matchCode: "" }
      });
      expect(invalidCreateResponse.statusCode).toBe(400);
      expect(invalidCreateResponse.json()).toMatchObject({
        error: {
          reasonCode: "VALIDATION_ERROR",
          message: "Request validation failed"
        }
      });
      expect(JSON.stringify(invalidCreateResponse.json())).not.toContain("DATABASE_PASSWORD");

      const matchCode = `M-${randomUUID()}`;
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        payload: {
          matchCode,
          ruleProfileId: "FIBA_2024"
        }
      });
      const created = createResponse.json<{ matchId: string; currentSeq: number }>();

      const mismatchCommand = scoreCommand(randomUUID(), 0);
      const mismatchResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/score/add`,
        payload: mismatchCommand
      });
      expect(mismatchResponse.json()).toMatchObject({
        status: "REJECTED",
        reasonCode: "MATCH_NOT_FOUND"
      });

      const duplicateMatchCodeResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        payload: {
          matchCode,
          ruleProfileId: "FIBA_2024"
        }
      });
      expect(duplicateMatchCodeResponse.statusCode).toBe(409);
      expect(duplicateMatchCodeResponse.json()).toMatchObject({
        error: { reasonCode: "DB_CONSTRAINT_ERROR" }
      });

      const connection = await pool.getConnection();
      try {
        const audit = await insertAuditLog(connection, {
          entityType: "match",
          entityId: created.matchId,
          action: "CORRECTION_READY_EVENT_REVIEWED",
          actorUserId: "00000000-0000-4000-8000-000000000001",
          actorRole: "SCORER",
          deviceId: "placeholder-device",
          oldValue: null,
          newValue: { status: "reviewed" },
          reason: "audit foundation test",
          correlationId: randomUUID(),
          causationId: null,
          eventSeq: null
        });
        const auditLogs = await listAuditLogsForMatch(connection, created.matchId);
        expect(auditLogs).toEqual([
          expect.objectContaining({
            auditId: audit.auditId,
            entityId: created.matchId,
            action: "CORRECTION_READY_EVENT_REVIEWED",
            reason: "audit foundation test"
          })
        ]);
      } finally {
        connection.release();
      }

      const publicResponse = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${created.matchId}/scoreboard`
      });
      expect(JSON.stringify(publicResponse.json())).not.toContain("audit foundation test");
    } finally {
      await app.close();
      await pool.end();
    }
  });
});

describe("correction event type foundation", () => {
  it("defines correction event types without destructive correction behavior", () => {
    expect(correctionEventTypes).toEqual([
      "CORRECTION_REQUESTED",
      "CORRECTION_APPLIED",
      "CORRECTION_REJECTED",
      "SCORE_REMOVED_BY_CORRECTION"
    ]);
  });
});

describe("event-store source guard", () => {
  it("does not introduce mutable scoreboard state or historical event mutation patterns", () => {
    const roots = ["apps", "packages", "migrations", "tests"];
    const forbidden = [
      new RegExp(`scoreboard_${"state"}`, "i"),
      new RegExp(`UPDATE\\s+match_${"events"}`, "i"),
      new RegExp(`DELETE\\s+FROM\\s+match_${"events"}`, "i"),
      new RegExp(`DROP\\s+TABLE\\s+match_${"events"}`, "i")
    ];
    const matches: string[] = [];

    for (const root of roots) {
      scan(join(process.cwd(), root), matches, forbidden);
    }

    expect(matches).toEqual([]);
  });
});

function scan(dir: string, matches: string[], forbidden: RegExp[]) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);

    if (
      fullPath.includes(`${join("apps", "web", "dist")}`) ||
      fullPath.includes("node_modules") ||
      fullPath.includes("dist-types") ||
      fullPath.endsWith(".tsbuildinfo")
    ) {
      continue;
    }

    if (statSync(fullPath).isDirectory()) {
      scan(fullPath, matches, forbidden);
      continue;
    }

    if (!/\.(ts|tsx|sql|md|json)$/.test(fullPath)) {
      continue;
    }

    const content = readFileSync(fullPath, "utf8");

    for (const pattern of forbidden) {
      if (pattern.test(content)) {
        matches.push(`${fullPath}: ${pattern.source}`);
      }
    }
  }
}
