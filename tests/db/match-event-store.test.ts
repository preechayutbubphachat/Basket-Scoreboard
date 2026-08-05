import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { io as createSocketClient, type Socket } from "socket.io-client";
import bcrypt from "bcryptjs";
import { buildApiApp } from "../../apps/api/src/app";
import { createDatabasePool } from "../../apps/api/src/db";
import { hasDatabaseEnv } from "../../apps/api/src/config/env";
import {
  MariaDbMigrationConnection,
  getDefaultMigrationsDir,
  runMigrations
} from "../../apps/api/src/migrations";
import { DB_INTEGRATION_TEST_TIMEOUT_MS } from "../helpers/dbIntegrationTimeout";
import { prepareAuthoritativeLifecycleFixture } from "../helpers/authoritativeLifecycleFixture";
import { insertAuditLog, listAuditLogsForMatch } from "../../apps/api/src/matchEventStore/auditRepository";
import { appendTeamFoulAddedCommand } from "../../apps/api/src/matchEventStore/appendFoulCommand";
import { appendTimeoutOpportunityFactCommand, type TimeoutOpportunityFailureSeam } from "../../apps/api/src/matchEventStore/appendTimeoutOpportunityFactCommand";
import { listMatchEvents } from "../../apps/api/src/matchEventStore/repositories";
import { rebuildTimeoutOpportunityProjection } from "../../apps/api/src/matchEventStore/replayService";
import { getMatchSync } from "../../apps/api/src/matchEventStore/syncService";
import { correctionEventTypes } from "../../packages/event-model/src";

const describeDb = hasDatabaseEnv() ? describe : describe.skip;
beforeEach(() => {
  vi.stubEnv("AUTH_TEST_PROVIDER", "server-owned");
});

function onceSocketEvent<T>(socket: Socket, eventName: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}`)), 5000);
    socket.once(eventName, (payload: T) => { clearTimeout(timer); resolve(payload); });
  });
}
const adminHeaders = {
  "x-dev-user-role": "ADMIN",
  "x-dev-user-id": "00000000-0000-4000-8000-0000000000aa"
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete process.env.AUTH_TEST_DISABLE_CSRF;
});

function scorerHeaders(matchId: string, userId = "00000000-0000-4000-8000-0000000000bb") {
  return {
    "x-dev-user-role": "SCORER",
    "x-dev-user-id": userId,
    "x-dev-match-ids": matchId
  };
}

function viewerHeaders(matchId: string) {
  return {
    "x-dev-user-role": "VIEWER",
    "x-dev-user-id": "00000000-0000-4000-8000-0000000000cc",
    "x-dev-match-ids": matchId
  };
}

async function buildMigratedApp(options: { realtime?: boolean } = {}) {
  process.env.AUTH_COOKIE_SECURE = "false";
  process.env.AUTH_TEST_DISABLE_CSRF = "true";
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

  const app = buildApiApp({ pool, realtime: { enabled: options.realtime } });

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

function task015Command(matchId: string, expectedSeq: number, commandId = randomUUID()) {
  return {
    commandId,
    matchId,
    expectedSeq,
    correlationId: randomUUID(),
    clientTimestamp: new Date().toISOString(),
    payload: { factType: "DEAD_BALL_CONFIRMED" as const }
  };
}

function lifecycleStartCommand(matchId: string, expectedSeq = 0) {
  return { commandId: randomUUID(), matchId, expectedSeq, correlationId: randomUUID(), clientTimestamp: new Date().toISOString(), payload: { reason: null } };
}

function clockCommand(
  matchId: string,
  expectedSeq: number,
  payload: Record<string, unknown> = {},
  commandId = randomUUID()
) {
  return {
    commandId,
    matchId,
    expectedSeq,
    correlationId: randomUUID(),
    clientTimestamp: new Date().toISOString(),
    payload
  };
}

function correctionRequestCommand(matchId: string, expectedSeq: number, targetSeq: number, commandId = randomUUID()) {
  return {
    commandId,
    matchId,
    expectedSeq,
    correlationId: randomUUID(),
    clientTimestamp: new Date().toISOString(),
    payload: {
      targetSeq,
      correctionType: "SCORE_CORRECTION",
      reason: "Wrong team selected",
      note: null
    }
  };
}

function applyScoreCorrectionCommand(
  matchId: string,
  expectedSeq: number,
  correctionRequestSeq: number,
  targetSeq: number,
  commandId = randomUUID()
) {
  return {
    commandId,
    matchId,
    expectedSeq,
    correlationId: randomUUID(),
    clientTimestamp: new Date().toISOString(),
    payload: {
      correctionRequestSeq,
      targetSeq,
      reason: "Wrong team selected",
      removeOriginalScore: true,
      replacement: {
        teamSide: "AWAY",
        points: 2,
        playerId: null,
        periodNumber: 1,
        gameClockRemainingMs: 540000,
        note: "Corrected from HOME to AWAY"
      }
    }
  };
}

function rejectCorrectionCommand(
  matchId: string,
  expectedSeq: number,
  correctionRequestSeq: number,
  commandId = randomUUID()
) {
  return {
    commandId,
    matchId,
    expectedSeq,
    correlationId: randomUUID(),
    clientTimestamp: new Date().toISOString(),
    payload: {
      correctionRequestSeq,
      reason: "Request reviewed and rejected"
    }
  };
}

function alphaScoreUndoCommand(matchId: string, expectedSeq: number, correctedEventSeq: number) {
  return {
    commandId: randomUUID(),
    matchId,
    expectedSeq,
    correlationId: randomUUID(),
    clientTimestamp: new Date().toISOString(),
    correctedEventSeq,
    correctionKind: "SCORE_UNDO",
    reason: "Verified scorer table correction",
    payload: {
      correctionKind: "SCORE_UNDO",
      target: { seqNo: correctedEventSeq, eventType: "SCORE_ADDED" },
      delta: { points: -2, teamSide: "HOME" },
      newValue: null
    }
  };
}

describeDb("match event store MVP", { timeout: DB_INTEGRATION_TEST_TIMEOUT_MS }, () => {
  it("appends clock events, updates projection, deduplicates commands, and rejects stale expectedSeq", async () => {
    const { app, pool } = await buildMigratedApp();

    try {
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        headers: adminHeaders,
        payload: {
          matchCode: `CLOCK-${randomUUID()}`,
          ruleProfileId: "FIBA_2024"
        }
      });
      expect(createResponse.statusCode).toBe(201);
      const created = createResponse.json<{ matchId: string }>();

      const start = clockCommand(created.matchId, 0);
      const startResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/clock/game/start`,
        headers: adminHeaders,
        payload: start
      });
      expect(startResponse.statusCode).toBe(200);
      expect(startResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 1,
        appendedEvents: [{ seqNo: 1, eventType: "GAME_CLOCK_STARTED" }]
      });

      const duplicateStart = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/clock/game/start`,
        headers: adminHeaders,
        payload: start
      });
      expect(duplicateStart.json()).toMatchObject({
        status: "DUPLICATE_ACCEPTED",
        currentSeq: 1,
        appendedEvents: []
      });

      const stopResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/clock/game/stop`,
        headers: adminHeaders,
        payload: clockCommand(created.matchId, 1)
      });
      expect(stopResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 2,
        appendedEvents: [{ seqNo: 2, eventType: "GAME_CLOCK_STOPPED" }]
      });

      const resetShotResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/clock/shot/reset`,
        headers: adminHeaders,
        payload: clockCommand(created.matchId, 2, { resetToMs: 14000, reason: null })
      });
      expect(resetShotResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 3,
        appendedEvents: [{ seqNo: 3, eventType: "SHOT_CLOCK_RESET" }]
      });

      const rejectedSetResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/clock/game/set`,
        headers: adminHeaders,
        payload: clockCommand(created.matchId, 3, { remainingMs: 150000, reason: "   " })
      });
      expect(rejectedSetResponse.statusCode).toBe(400);

      const set = clockCommand(created.matchId, 3, { remainingMs: 150000, reason: "  table correction  " });
      const setResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/clock/game/set`,
        headers: adminHeaders,
        payload: set
      });
      expect(setResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 4,
        appendedEvents: [{ seqNo: 4, eventType: "GAME_CLOCK_SET" }]
      });
      const duplicateSetResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/clock/game/set`,
        headers: adminHeaders,
        payload: set
      });
      expect(duplicateSetResponse.json()).toMatchObject({ status: "DUPLICATE_ACCEPTED", currentSeq: 4, appendedEvents: [] });

      const rejectedShotSetResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/clock/shot/set`,
        headers: adminHeaders,
        payload: clockCommand(created.matchId, 4, { remainingMs: 12000, reason: "   " })
      });
      expect(rejectedShotSetResponse.statusCode).toBe(400);

      const shotSet = clockCommand(created.matchId, 4, { remainingMs: 12000, reason: "  shot table correction  " });
      const shotSetResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/clock/shot/set`,
        headers: adminHeaders,
        payload: shotSet
      });
      expect(shotSetResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 5,
        appendedEvents: [{ seqNo: 5, eventType: "SHOT_CLOCK_SET" }]
      });
      const duplicateShotSetResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/clock/shot/set`,
        headers: adminHeaders,
        payload: shotSet
      });
      expect(duplicateShotSetResponse.json()).toMatchObject({ status: "DUPLICATE_ACCEPTED", currentSeq: 5, appendedEvents: [] });

      const staleResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/clock/shot/set`,
        headers: adminHeaders,
        payload: clockCommand(created.matchId, 1, { remainingMs: 12000, reason: "stale shot correction" })
      });
      expect(staleResponse.json()).toMatchObject({
        status: "SYNC_REQUIRED",
        currentSeq: 5,
        reasonCode: "INVALID_EXPECTED_SEQ"
      });

      const [eventRows] = await pool.query<RowDataPacket[]>(
        "SELECT seq_no, event_type FROM match_events WHERE match_id = ? ORDER BY seq_no ASC",
        [created.matchId]
      );
      expect(eventRows.map((event) => event.event_type)).toEqual([
        "GAME_CLOCK_STARTED",
        "GAME_CLOCK_STOPPED",
        "SHOT_CLOCK_RESET",
        "GAME_CLOCK_SET",
        "SHOT_CLOCK_SET"
      ]);

      const [setEventRows] = await pool.query<RowDataPacket[]>(
        "SELECT payload, reason FROM match_events WHERE match_id = ? AND seq_no = 4",
        [created.matchId]
      );
      expect(JSON.parse(setEventRows[0]!.payload)).toMatchObject({ remainingMs: 150000, reason: "table correction" });
      expect(setEventRows[0]!.reason).toBe("table correction");

      const [shotSetEventRows] = await pool.query<RowDataPacket[]>(
        "SELECT payload, reason FROM match_events WHERE match_id = ? AND seq_no = 5",
        [created.matchId]
      );
      expect(JSON.parse(shotSetEventRows[0]!.payload)).toMatchObject({ remainingMs: 12000, reason: "shot table correction" });
      expect(shotSetEventRows[0]!.reason).toBe("shot table correction");

      const connection = await pool.getConnection();
      try {
        const auditLogs = await listAuditLogsForMatch(connection, created.matchId);
        expect(auditLogs).toEqual(expect.arrayContaining([
          expect.objectContaining({ action: "GAME_CLOCK_SET", eventSeq: 4, reason: "table correction" }),
          expect.objectContaining({ action: "SHOT_CLOCK_SET", eventSeq: 5, reason: "shot table correction" })
        ]));
      } finally {
        connection.release();
      }

      const projectionResponse = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${created.matchId}/projection`,
        headers: scorerHeaders(created.matchId)
      });
      expect(projectionResponse.json()).toMatchObject({
        currentSeq: 5,
        lastEventSeq: 5,
        gameClock: { remainingMs: 150000, running: false },
        shotClock: { remainingMs: 12000, running: false },
        shotClockRemainingMs: 12000
      });

      const publicResponse = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${created.matchId}/scoreboard`
      });
      expect(publicResponse.json()).toMatchObject({
        gameClock: { running: false },
        shotClock: { remainingMs: 12000 },
        shotClockRemainingMs: 12000
      });

      const concurrentMatchResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        headers: adminHeaders,
        payload: { matchCode: `SHOT-CONCURRENT-${randomUUID()}`, ruleProfileId: "FIBA_2024" }
      });
      const concurrentMatch = concurrentMatchResponse.json<{ matchId: string }>();
      const [left, right] = await Promise.all([
        app.inject({ method: "POST", url: `/api/v1/matches/${concurrentMatch.matchId}/commands/clock/shot/set`, headers: adminHeaders, payload: clockCommand(concurrentMatch.matchId, 0, { remainingMs: 14000, reason: "left correction" }) }),
        app.inject({ method: "POST", url: `/api/v1/matches/${concurrentMatch.matchId}/commands/clock/shot/set`, headers: adminHeaders, payload: clockCommand(concurrentMatch.matchId, 0, { remainingMs: 12000, reason: "right correction" }) })
      ]);
      expect([left.json().status, right.json().status]).toEqual(expect.arrayContaining(["ACCEPTED", "SYNC_REQUIRED"]));
      const [concurrentRows] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS event_count FROM match_events WHERE match_id = ?",
        [concurrentMatch.matchId]
      );
      expect(concurrentRows[0]!.event_count).toBe(1);
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("rejects direct team foul commands before append", async () => {
    const { app, pool } = await buildMigratedApp();

    try {
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        headers: adminHeaders,
        payload: {
          matchCode: `FOUL-${randomUUID()}`,
          ruleProfileId: "FIBA_2024"
        }
      });
      expect(createResponse.statusCode).toBe(201);
      const created = createResponse.json<{ matchId: string }>();

      const storeResult = await appendTeamFoulAddedCommand({
        pool,
        command: {
          commandId: randomUUID(),
          matchId: created.matchId,
          expectedSeq: 0,
          correlationId: randomUUID(),
          clientTimestamp: new Date().toISOString(),
          payload: { teamSide: "HOME", foulType: "PERSONAL", reason: null }
        },
        user: {
          userId: adminHeaders["x-dev-user-id"],
          role: "ADMIN",
          permissions: [],
          assignedMatchIds: [],
          deviceId: "db-test",
          authMode: "DEV_HEADER"
        }
      });
      expect(storeResult).toMatchObject({
        status: "REJECTED",
        currentSeq: 0,
        appendedEvents: [],
        reasonCode: "VALIDATION_ERROR"
      });

      const homeFoulResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/foul/team/add`,
        headers: scorerHeaders(created.matchId),
        payload: {
          commandId: randomUUID(),
          matchId: created.matchId,
          expectedSeq: 0,
          correlationId: randomUUID(),
          clientTimestamp: new Date().toISOString(),
          payload: { teamSide: "HOME", foulType: "PERSONAL", reason: null }
        }
      });
      expect(homeFoulResponse.statusCode).toBe(400);
      expect(homeFoulResponse.json()).toMatchObject({ error: { reasonCode: "VALIDATION_ERROR" } });

      const [eventRows] = await pool.query<RowDataPacket[]>(
        "SELECT seq_no, event_type, payload FROM match_events WHERE match_id = ? ORDER BY seq_no ASC",
        [created.matchId]
      );
      expect(eventRows).toEqual([]);

      const projectionResponse = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${created.matchId}/projection`,
        headers: scorerHeaders(created.matchId)
      });
      expect(projectionResponse.json()).toMatchObject({
        currentSeq: 0,
        lastEventSeq: 0,
        teamFouls: { home: 0, away: 0 },
        teamFoulsByPeriod: {},
        playerFouls: []
      });

      const publicResponse = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${created.matchId}/scoreboard`
      });
      expect(publicResponse.json()).toMatchObject({
        teamFouls: { home: 0, away: 0 }
      });
      expect(JSON.stringify(publicResponse.json())).not.toContain("audit");
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("creates matches, appends score events, deduplicates commands, syncs missed events, and keeps public output read-only", async () => {
    const { app, pool } = await buildMigratedApp();

    try {
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        headers: adminHeaders,
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
        url: `/api/v1/matches/${created.matchId}/state`,
        headers: scorerHeaders(created.matchId)
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
        headers: scorerHeaders(created.matchId),
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
        headers: scorerHeaders(created.matchId),
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
        headers: scorerHeaders(created.matchId),
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
        headers: scorerHeaders(created.matchId),
        payload: scoreCommand(created.matchId, 0)
      });
      expect(conflictResponse.json()).toMatchObject({
        status: "SYNC_REQUIRED",
        currentSeq: 2
      });

      const eventsResponse = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${created.matchId}/events`,
        headers: scorerHeaders(created.matchId)
      });
      const events = eventsResponse.json<Array<{ seqNo: number; eventType: string }>>();
      expect(events.map((event) => event.seqNo)).toEqual([1, 2]);
      expect(events.map((event) => event.eventType)).toEqual(["SCORE_ADDED", "SCORE_ADDED"]);

      const updatedStateResponse = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${created.matchId}/state`,
        headers: scorerHeaders(created.matchId)
      });
      expect(updatedStateResponse.json()).toMatchObject({
        homeScore: 2,
        awayScore: 3,
        currentSeq: 2
      });

      const syncResponse = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${created.matchId}/sync?lastEventSeq=1`,
        headers: scorerHeaders(created.matchId)
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
        awayScore: 3
      });
      expect(JSON.stringify(publicBody)).not.toMatch(
        /currentSeq|lastEventSeq|expectedSeq|projectionVersion|eventSeq|seqNo|playerFouls|roster|teamId|homeTeamId|awayTeamId/i
      );
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
        headers: adminHeaders,
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
        headers: adminHeaders,
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
        headers: scorerHeaders(created.matchId),
        payload: mismatchCommand
      });
      expect(mismatchResponse.json()).toMatchObject({
        status: "REJECTED",
        reasonCode: "MATCH_NOT_FOUND"
      });

      const duplicateMatchCodeResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        headers: adminHeaders,
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

  it("enforces RBAC for score and correction commands without trusting command payload roles", async () => {
    const { app, pool } = await buildMigratedApp();

    try {
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        headers: adminHeaders,
        payload: {
          matchCode: `M-${randomUUID()}`,
          ruleProfileId: "FIBA_2024"
        }
      });
      const created = createResponse.json<{ matchId: string }>();
      const command = {
        ...scoreCommand(created.matchId, 0),
        payload: {
          ...scoreCommand(created.matchId, 0).payload,
          role: "ADMIN"
        }
      };

      const anonymousScoreResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/score/add`,
        payload: command
      });
      expect(anonymousScoreResponse.statusCode).toBe(401);
      expect(anonymousScoreResponse.json()).toMatchObject({
        error: { reasonCode: "UNAUTHENTICATED" }
      });

      const viewerScoreResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/score/add`,
        headers: viewerHeaders(created.matchId),
        payload: command
      });
      expect(viewerScoreResponse.statusCode).toBe(403);
      expect(viewerScoreResponse.json()).toMatchObject({
        error: { reasonCode: "FORBIDDEN" }
      });

      const unassignedScorerResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/score/add`,
        headers: scorerHeaders(randomUUID()),
        payload: command
      });
      expect(unassignedScorerResponse.statusCode).toBe(403);
      expect(unassignedScorerResponse.json()).toMatchObject({
        error: { reasonCode: "MATCH_NOT_ASSIGNED" }
      });

      const assignedScoreResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/score/add`,
        headers: scorerHeaders(created.matchId),
        payload: command
      });
      expect(assignedScoreResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 1
      });

      const [eventRows] = await pool.query<RowDataPacket[]>(
        "SELECT actor_role FROM match_events WHERE match_id = ? AND seq_no = 1",
        [created.matchId]
      );
      expect(eventRows[0]!.actor_role).toBe("SCORER");

      const correctionRequest = correctionRequestCommand(created.matchId, 1, 1);
      const correctionRequestResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/corrections/request`,
        headers: scorerHeaders(created.matchId),
        payload: correctionRequest
      });
      expect(correctionRequestResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 2
      });

      const scorerApplyResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/corrections/apply-score`,
        headers: scorerHeaders(created.matchId),
        payload: applyScoreCorrectionCommand(created.matchId, 2, 2, 1)
      });
      expect(scorerApplyResponse.statusCode).toBe(403);
      expect(scorerApplyResponse.json()).toMatchObject({
        error: { reasonCode: "FORBIDDEN" }
      });

      const adminApplyResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/corrections/apply-score`,
        headers: adminHeaders,
        payload: applyScoreCorrectionCommand(created.matchId, 2, 2, 1)
      });
      expect(adminApplyResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 5
      });
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("requests, applies, lists, and rejects score corrections using append-only compensating events", async () => {
    const { app, pool } = await buildMigratedApp();

    try {
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        headers: adminHeaders,
        payload: {
          matchCode: `M-${randomUUID()}`,
          ruleProfileId: "FIBA_2024"
        }
      });
      const created = createResponse.json<{ matchId: string }>();

      const scoreResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/score/add`,
        headers: scorerHeaders(created.matchId),
        payload: scoreCommand(created.matchId, 0)
      });
      expect(scoreResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 1
      });

      const missingReason = correctionRequestCommand(created.matchId, 1, 1);
      missingReason.payload.reason = "";
      const missingReasonResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/corrections/request`,
        headers: scorerHeaders(created.matchId),
        payload: missingReason
      });
      expect(missingReasonResponse.statusCode).toBe(400);
      expect(missingReasonResponse.json()).toMatchObject({
        error: { reasonCode: "VALIDATION_ERROR" }
      });

      const missingTargetResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/corrections/request`,
        headers: scorerHeaders(created.matchId),
        payload: correctionRequestCommand(created.matchId, 1, 999)
      });
      expect(missingTargetResponse.json()).toMatchObject({
        status: "REJECTED",
        currentSeq: 1,
        reasonCode: "MATCH_NOT_FOUND"
      });

      const requestCommand = correctionRequestCommand(created.matchId, 1, 1);
      const requestResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/corrections/request`,
        headers: scorerHeaders(created.matchId),
        payload: requestCommand
      });
      expect(requestResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 2,
        appendedEvents: [{ seqNo: 2, eventType: "CORRECTION_REQUESTED" }]
      });

      const duplicateRequestResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/corrections/request`,
        headers: scorerHeaders(created.matchId),
        payload: requestCommand
      });
      expect(duplicateRequestResponse.json()).toMatchObject({
        status: "DUPLICATE_ACCEPTED",
        currentSeq: 2
      });

      const [beforeStaleApplyRows] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS event_count FROM match_events WHERE match_id = ?",
        [created.matchId]
      );
      const staleApplyResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/corrections/apply-score`,
        headers: adminHeaders,
        payload: applyScoreCorrectionCommand(created.matchId, 1, 2, 1)
      });
      expect(staleApplyResponse.json()).toMatchObject({
        status: "SYNC_REQUIRED",
        currentSeq: 2
      });
      const [afterStaleApplyRows] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS event_count FROM match_events WHERE match_id = ?",
        [created.matchId]
      );
      expect(afterStaleApplyRows[0]!.event_count).toBe(beforeStaleApplyRows[0]!.event_count);

      const applyCommand = applyScoreCorrectionCommand(created.matchId, 2, 2, 1);
      const applyResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/corrections/apply-score`,
        headers: adminHeaders,
        payload: applyCommand
      });
      expect(applyResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 5,
        appendedEvents: [
          { seqNo: 3, eventType: "SCORE_REMOVED_BY_CORRECTION" },
          { seqNo: 4, eventType: "SCORE_ADDED" },
          { seqNo: 5, eventType: "CORRECTION_APPLIED" }
        ]
      });

      const duplicateApplyResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/corrections/apply-score`,
        headers: adminHeaders,
        payload: applyCommand
      });
      expect(duplicateApplyResponse.json()).toMatchObject({
        status: "DUPLICATE_ACCEPTED",
        currentSeq: 5,
        appendedEvents: []
      });

      const eventsResponse = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${created.matchId}/events`,
        headers: scorerHeaders(created.matchId)
      });
      const events = eventsResponse.json<
        Array<{
          eventId: string;
          seqNo: number;
          eventType: string;
          commandId: string;
          correlationId: string;
          causationId: string | null;
          reason?: string;
        }>
      >();
      expect(events.map((event) => event.seqNo)).toEqual([1, 2, 3, 4, 5]);
      expect(events.map((event) => event.eventType)).toEqual([
        "SCORE_ADDED",
        "CORRECTION_REQUESTED",
        "SCORE_REMOVED_BY_CORRECTION",
        "SCORE_ADDED",
        "CORRECTION_APPLIED"
      ]);
      expect(events[0]!.eventType).toBe("SCORE_ADDED");
      expect(events[0]!.commandId).not.toBe(applyCommand.commandId);
      expect(events[4]!.commandId).toBe(applyCommand.commandId);
      expect(events.slice(2).map((event) => event.correlationId)).toEqual([
        applyCommand.correlationId,
        applyCommand.correlationId,
        applyCommand.correlationId
      ]);
      expect(new Set(events.slice(2).map((event) => event.commandId)).size).toBe(3);
      expect(events[2]!.causationId).toBe(events[0]!.eventId);
      expect(events[3]!.causationId).toBe(events[2]!.eventId);
      expect(events[4]!.causationId).toBe(events[1]!.eventId);

      const [afterDuplicateApplyRows] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS event_count FROM match_events WHERE match_id = ?",
        [created.matchId]
      );
      expect(afterDuplicateApplyRows[0]!.event_count).toBe(5);

      const stateResponse = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${created.matchId}/state`,
        headers: scorerHeaders(created.matchId)
      });
      expect(stateResponse.json()).toMatchObject({
        homeScore: 0,
        awayScore: 2,
        currentSeq: 5
      });

      const correctionsResponse = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${created.matchId}/corrections`,
        headers: scorerHeaders(created.matchId)
      });
      expect(correctionsResponse.json()).toEqual([
        expect.objectContaining({
          correctionRequestSeq: 2,
          targetSeq: 1,
          status: "APPLIED",
          reason: "Wrong team selected"
        })
      ]);

      const connection = await pool.getConnection();
      try {
        const auditLogs = await listAuditLogsForMatch(connection, created.matchId);
        expect(auditLogs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: "CORRECTION_APPLIED",
              reason: "Wrong team selected",
              eventSeq: 5
            })
          ])
        );
      } finally {
        connection.release();
      }

      const publicResponse = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${created.matchId}/scoreboard`
      });
      const publicJson = JSON.stringify(publicResponse.json());
      expect(publicJson).not.toContain("Wrong team selected");
      expect(publicJson).not.toContain("actor");
      expect(publicJson).not.toContain("device");
      expect(publicJson).not.toContain("audit");
      expect(publicJson).not.toContain("correction");

      const rejectMatchResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        headers: adminHeaders,
        payload: {
          matchCode: `M-${randomUUID()}`,
          ruleProfileId: "FIBA_2024"
        }
      });
      const rejectMatch = rejectMatchResponse.json<{ matchId: string }>();
      await app.inject({
        method: "POST",
        url: `/api/v1/matches/${rejectMatch.matchId}/commands/score/add`,
        headers: scorerHeaders(rejectMatch.matchId),
        payload: scoreCommand(rejectMatch.matchId, 0)
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/matches/${rejectMatch.matchId}/commands/corrections/request`,
        headers: scorerHeaders(rejectMatch.matchId),
        payload: correctionRequestCommand(rejectMatch.matchId, 1, 1)
      });
      const beforeRejectState = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${rejectMatch.matchId}/state`,
        headers: scorerHeaders(rejectMatch.matchId)
      });
      const rejectResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${rejectMatch.matchId}/commands/corrections/reject`,
        headers: adminHeaders,
        payload: rejectCorrectionCommand(rejectMatch.matchId, 2, 2)
      });
      expect(rejectResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 3,
        appendedEvents: [{ seqNo: 3, eventType: "CORRECTION_REJECTED" }]
      });
      const afterRejectState = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${rejectMatch.matchId}/state`,
        headers: scorerHeaders(rejectMatch.matchId)
      });
      expect(afterRejectState.json()).toMatchObject({
        homeScore: beforeRejectState.json<{ homeScore: number }>().homeScore,
        awayScore: beforeRejectState.json<{ awayScore: number }>().awayScore,
        currentSeq: 3
      });
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("appends one active-roster PERSONAL player foul and keeps duplicate and stale commands safe", async () => {
    const { app, pool } = await buildMigratedApp();
    try {
      const homeTeamId = randomUUID();
      const awayTeamId = randomUUID();
      const playerId = randomUUID();
      await pool.query("INSERT INTO teams (team_id, name) VALUES (?, ?), (?, ?)", [homeTeamId, "RM06 Home", awayTeamId, "RM06 Away"]);
      await pool.query("INSERT INTO players (player_id, team_id, display_name, jersey_number) VALUES (?, ?, ?, ?)", [playerId, homeTeamId, "RM06 Player", "6"]);

      const createResponse = await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        headers: adminHeaders,
        payload: { matchCode: `RM06-${randomUUID()}`, ruleProfileId: "FIBA_2024", homeTeamId, awayTeamId }
      });
      const { matchId } = createResponse.json<{ matchId: string }>();
      await pool.query(
        "INSERT INTO match_roster_players (roster_player_id, match_id, team_side, team_id, player_id, display_name_snapshot, jersey_number_snapshot, roster_status) VALUES (?, ?, 'HOME', ?, ?, ?, ?, 'ACTIVE')",
        [randomUUID(), matchId, homeTeamId, playerId, "RM06 Player", "6"]
      );

      const command = {
        commandId: randomUUID(), matchId, expectedSeq: 0, correlationId: randomUUID(), clientTimestamp: new Date().toISOString(),
        payload: { teamSide: "HOME", playerId, foulType: "PERSONAL", reason: null }
      };
      const accepted = await app.inject({ method: "POST", url: `/api/v1/matches/${matchId}/commands/foul/player/add`, headers: scorerHeaders(matchId), payload: command });
      expect(accepted.json()).toMatchObject({ status: "ACCEPTED", currentSeq: 1, appendedEvents: [{ seqNo: 1, eventType: "PLAYER_FOUL_ADDED" }] });

      const duplicate = await app.inject({ method: "POST", url: `/api/v1/matches/${matchId}/commands/foul/player/add`, headers: scorerHeaders(matchId), payload: command });
      expect(duplicate.json()).toMatchObject({ status: "DUPLICATE_ACCEPTED", currentSeq: 1, appendedEvents: [] });

      const stale = await app.inject({
        method: "POST", url: `/api/v1/matches/${matchId}/commands/foul/player/add`, headers: scorerHeaders(matchId),
        payload: { ...command, commandId: randomUUID(), correlationId: randomUUID() }
      });
      expect(stale.json()).toMatchObject({ status: "SYNC_REQUIRED", currentSeq: 1, appendedEvents: [], reasonCode: "INVALID_EXPECTED_SEQ" });

      const wrongSide = await app.inject({
        method: "POST", url: `/api/v1/matches/${matchId}/commands/foul/player/add`, headers: scorerHeaders(matchId),
        payload: { ...command, commandId: randomUUID(), expectedSeq: 1, correlationId: randomUUID(), payload: { ...command.payload, teamSide: "AWAY" } }
      });
      expect(wrongSide.json()).toMatchObject({ status: "REJECTED", currentSeq: 1, appendedEvents: [], reasonCode: "VALIDATION_ERROR" });

      const [events] = await pool.query<RowDataPacket[]>("SELECT event_type FROM match_events WHERE match_id = ? ORDER BY seq_no", [matchId]);
      expect(events.map((event) => event.event_type)).toEqual(["PLAYER_FOUL_ADDED"]);
      const projection = await app.inject({ method: "GET", url: `/api/v1/matches/${matchId}/projection`, headers: scorerHeaders(matchId) });
      expect(projection.json()).toMatchObject({
        currentSeq: 1,
        teamFouls: { home: 1, away: 0 },
        teamFoulsByPeriod: { "1": { home: 1, away: 0 } },
        playerFouls: [{ playerId, teamSide: "HOME", fouls: 1 }]
      });
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("allows at most one concurrent direct score compensation and rejects a cross-match target", async () => {
    const { app, pool } = await buildMigratedApp();
    try {
      const createMatch = async () => (await app.inject({
        method: "POST", url: "/api/v1/matches", headers: adminHeaders,
        payload: { matchCode: `CORRECTION-${randomUUID()}`, ruleProfileId: "FIBA_2024" }
      })).json<{ matchId: string }>();
      const matchA = await createMatch();
      const matchB = await createMatch();
      const score = await app.inject({
        method: "POST", url: `/api/v1/matches/${matchA.matchId}/commands/score/add`, headers: adminHeaders,
        payload: scoreCommand(matchA.matchId, 0)
      });
      expect(score.json()).toMatchObject({ status: "ACCEPTED", currentSeq: 1 });

      const [left, right] = await Promise.all([
        app.inject({ method: "POST", url: `/api/v1/matches/${matchA.matchId}/corrections`, headers: adminHeaders, payload: alphaScoreUndoCommand(matchA.matchId, 1, 1) }),
        app.inject({ method: "POST", url: `/api/v1/matches/${matchA.matchId}/corrections`, headers: adminHeaders, payload: alphaScoreUndoCommand(matchA.matchId, 1, 1) })
      ]);
      expect([left.json().status, right.json().status]).toEqual(expect.arrayContaining(["ACCEPTED", "SYNC_REQUIRED"]));
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT event_type, COUNT(*) AS event_count FROM match_events WHERE match_id = ? AND event_type = 'SCORE_CORRECTED' GROUP BY event_type",
        [matchA.matchId]
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0]!.event_count)).toBe(1);

      const crossMatch = await app.inject({
        method: "POST", url: `/api/v1/matches/${matchB.matchId}/corrections`, headers: adminHeaders,
        payload: alphaScoreUndoCommand(matchB.matchId, 0, 1)
      });
      expect(crossMatch.json()).toMatchObject({ status: "REJECTED", reasonCode: "MATCH_NOT_FOUND", currentSeq: 0 });
      const [crossRows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS event_count FROM match_events WHERE match_id = ?", [matchB.matchId]);
      expect(Number(crossRows[0]!.event_count)).toBe(0);
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("proves Task015 rollback seams, two-connection concurrency, and mounted correction on real MariaDB", async () => {
    const { app, pool } = await buildMigratedApp();
    const user = { userId: "00000000-0000-4000-8000-0000000000bb", role: "SCORER" as const, deviceId: "task015-real-db" };
    const createStartedMatch = async () => {
      const createdResponse = await app.inject({ method: "POST", url: "/api/v1/matches", headers: adminHeaders, payload: { matchCode: `T015-${randomUUID()}`, ruleProfileId: "FIBA_2024" } });
      const created = createdResponse.json<{ matchId: string }>();
      await prepareAuthoritativeLifecycleFixture(pool, created.matchId);
      const started = await app.inject({ method: "POST", url: `/api/v1/matches/${created.matchId}/commands/lifecycle/start-match`, headers: adminHeaders, payload: lifecycleStartCommand(created.matchId, 2) });
      expect(started.json()).toMatchObject({ status: "ACCEPTED", currentSeq: 3 });
      const clockStarted = await app.inject({ method: "POST", url: `/api/v1/matches/${created.matchId}/commands/clock/game/start`, headers: adminHeaders, payload: clockCommand(created.matchId, 3) });
      expect(clockStarted.json()).toMatchObject({ status: "ACCEPTED", currentSeq: 4 });
      return created.matchId;
    };
    try {
      const taskCommandState = async (matchId: string, commandId: string, database: PoolConnection | typeof pool = pool) => {
        const [rows] = await database.query<RowDataPacket[]>(
          "SELECT (SELECT COUNT(*) FROM match_events WHERE match_id = ? AND command_id = ?) AS event_count, (SELECT last_seq_no FROM match_streams WHERE match_id = ?) AS head_seq, (SELECT last_event_seq FROM match_projections WHERE match_id = ? AND projection_type = 'scoreboard') AS projection_seq, (SELECT COUNT(*) FROM command_deduplication WHERE match_id = ? AND command_id = ?) AS receipt_count, (SELECT COUNT(*) FROM audit_logs WHERE entity_id = ? AND action = 'TIMEOUT_OPPORTUNITY_FACT_RECORDED') AS audit_count",
          [matchId, commandId, matchId, matchId, matchId, commandId, matchId]
        );
        return {
          eventCount: Number(rows[0]!.event_count),
          headSeq: Number(rows[0]!.head_seq),
          projectionSeq: Number(rows[0]!.projection_seq),
          receiptCount: Number(rows[0]!.receipt_count),
          auditCount: Number(rows[0]!.audit_count)
        };
      };
      const seams: TimeoutOpportunityFailureSeam[] = ["afterEvent", "afterHead", "afterProjection", "afterReceipt", "afterAudit", "beforeCommit"];
      for (const seam of seams) {
        const matchId = await createStartedMatch();
        const command = task015Command(matchId, 4);
        const [baselineProjectionRows] = await pool.query<RowDataPacket[]>("SELECT projection_data FROM match_projections WHERE match_id = ? AND projection_type = 'scoreboard'", [matchId]);
        const baselineProjection = typeof baselineProjectionRows[0]!.projection_data === "string" ? JSON.parse(baselineProjectionRows[0]!.projection_data) : baselineProjectionRows[0]!.projection_data;
        await expect(appendTimeoutOpportunityFactCommand({
          pool,
          command,
          user,
          injectFailureAt: seam,
          onFailureSeam: async (_heldSeam, transactionalConnection) => {
            const observerConnection = await pool.getConnection();
            try {
              const [transactionRows] = await transactionalConnection.query<RowDataPacket[]>("SELECT CONNECTION_ID() AS connection_id");
              const [observerRows] = await observerConnection.query<RowDataPacket[]>("SELECT CONNECTION_ID() AS connection_id");
              expect(Number(observerRows[0]!.connection_id)).not.toBe(Number(transactionRows[0]!.connection_id));
              expect(await taskCommandState(matchId, command.commandId, observerConnection)).toEqual({ eventCount: 0, headSeq: 4, projectionSeq: 4, receiptCount: 0, auditCount: 0 });
            } finally {
              observerConnection.release();
            }
          }
        })).rejects.toThrow(`INJECTED_TIMEOUT_OPPORTUNITY_FAILURE:${seam}`);
        expect(await taskCommandState(matchId, command.commandId)).toEqual({ eventCount: 0, headSeq: 4, projectionSeq: 4, receiptCount: 0, auditCount: 0 });
        const retry = await appendTimeoutOpportunityFactCommand({ pool, command, user });
        expect(retry.status).toBe("ACCEPTED");
        expect(await taskCommandState(matchId, command.commandId)).toEqual({ eventCount: 1, headSeq: 5, projectionSeq: 5, receiptCount: 1, auditCount: 1 });
        const [exactRows] = await pool.query<RowDataPacket[]>(
          "SELECT e.event_id, e.seq_no, e.event_type, e.payload AS event_payload, e.command_id, e.expected_seq, e.correlation_id, e.causation_id, d.command_type, d.request_hash, d.status AS receipt_status, d.result, p.projection_data, a.action, a.actor_user_id, a.actor_role, a.device_id, a.old_value, a.new_value, a.reason AS audit_reason, a.correlation_id AS audit_correlation_id, a.causation_id AS audit_causation_id, a.event_seq AS audit_event_seq, a.created_at AS audit_created_at FROM match_events e JOIN command_deduplication d ON d.match_id = e.match_id AND d.command_id = e.command_id JOIN match_projections p ON p.match_id = e.match_id AND p.projection_type = 'scoreboard' JOIN audit_logs a ON a.entity_id = e.match_id AND a.action = 'TIMEOUT_OPPORTUNITY_FACT_RECORDED' AND a.event_seq = e.seq_no WHERE e.match_id = ? AND e.command_id = ?",
          [matchId, command.commandId]
        );
        expect(exactRows).toHaveLength(1);
        const exact = exactRows[0]!;
        const eventPayload = typeof exact.event_payload === "string" ? JSON.parse(exact.event_payload) : exact.event_payload;
        const storedResult = typeof exact.result === "string" ? JSON.parse(exact.result) : exact.result;
        const storedProjection = typeof exact.projection_data === "string" ? JSON.parse(exact.projection_data) : exact.projection_data;
        const auditOldValue = typeof exact.old_value === "string" ? JSON.parse(exact.old_value) : exact.old_value;
        const auditNewValue = typeof exact.new_value === "string" ? JSON.parse(exact.new_value) : exact.new_value;
        expect(exact).toMatchObject({ seq_no: 5, event_type: "TIMEOUT_OPPORTUNITY_FACT_RECORDED", command_id: command.commandId, expected_seq: 4, correlation_id: command.correlationId, causation_id: null, command_type: "timeout-opportunity/fact", request_hash: createHash("sha256").update(JSON.stringify(command)).digest("hex"), receipt_status: "ACCEPTED", action: "TIMEOUT_OPPORTUNITY_FACT_RECORDED", actor_user_id: user.userId, actor_role: user.role, device_id: user.deviceId, audit_reason: null, audit_correlation_id: command.correlationId, audit_event_seq: 5 });
        expect(eventPayload).toEqual({ factType: "DEAD_BALL_CONFIRMED", sourceEventId: exact.event_id, sourceSeq: 5, occurredAt: command.clientTimestamp, periodNumber: 1, gameClockRemainingMs: 600000, gameClockRunning: true, matchStatus: "LIVE", ruleProfileId: "FIBA_2024" });
        expect(storedResult).toEqual(retry);
        expect(storedProjection).toEqual(retry.projection);
        expect(auditOldValue).toEqual(baselineProjection.timeoutOpportunity);
        expect(auditNewValue).toEqual(storedProjection.timeoutOpportunity);
        expect(exact.audit_causation_id).toBe(exact.event_id);
        expect(Number.isNaN(new Date(exact.audit_created_at).getTime())).toBe(false);
      }

      const concurrentMatchId = await createStartedMatch();
      const connectionIds = new Set<number>();
      let barrierArrivals = 0;
      let releaseBarrier!: () => void;
      const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });
      const beforeStreamLockBarrier = async (connection: PoolConnection) => {
        const [rows] = await connection.query<RowDataPacket[]>("SELECT CONNECTION_ID() AS connection_id");
        connectionIds.add(Number(rows[0]!.connection_id));
        barrierArrivals += 1;
        if (barrierArrivals === 2) releaseBarrier();
        await barrier;
      };
      const concurrentResults = await Promise.all([
        appendTimeoutOpportunityFactCommand({ pool, command: task015Command(concurrentMatchId, 4), user, beforeStreamLockBarrier }),
        appendTimeoutOpportunityFactCommand({ pool, command: task015Command(concurrentMatchId, 4), user, beforeStreamLockBarrier })
      ]);
      expect(barrierArrivals).toBe(2);
      expect(connectionIds.size).toBe(2);
      expect(concurrentResults.map((result) => result.status).sort()).toEqual(["ACCEPTED", "SYNC_REQUIRED"]);
      const [concurrentEvents] = await pool.query<RowDataPacket[]>("SELECT seq_no FROM match_events WHERE match_id = ? AND event_type = 'TIMEOUT_OPPORTUNITY_FACT_RECORDED'", [concurrentMatchId]);
      expect(concurrentEvents.map((row) => Number(row.seq_no))).toEqual([5]);

      const restartedMatchId = await createStartedMatch();
      expect((await app.inject({ method: "POST", url: `/api/v1/matches/${restartedMatchId}/commands/score/add`, headers: adminHeaders, payload: scoreCommand(restartedMatchId, 4) })).json()).toMatchObject({ status: "ACCEPTED", currentSeq: 5 });
      const [goalRows] = await pool.query<RowDataPacket[]>("SELECT event_id FROM match_events WHERE match_id = ? AND seq_no = 5 AND event_type = 'SCORE_ADDED'", [restartedMatchId]);
      expect((await app.inject({ method: "POST", url: `/api/v1/matches/${restartedMatchId}/commands/clock/game/stop`, headers: adminHeaders, payload: clockCommand(restartedMatchId, 5) })).json()).toMatchObject({ status: "ACCEPTED", currentSeq: 6 });
      expect((await app.inject({ method: "POST", url: `/api/v1/matches/${restartedMatchId}/commands/clock/game/start`, headers: adminHeaders, payload: clockCommand(restartedMatchId, 6) })).json()).toMatchObject({ status: "ACCEPTED", currentSeq: 7 });
      const restartedGoalAttempt = await appendTimeoutOpportunityFactCommand({
        pool,
        user,
        command: {
          commandId: randomUUID(), matchId: restartedMatchId, expectedSeq: 7, correlationId: randomUUID(), clientTimestamp: new Date().toISOString(),
          payload: { factType: "REFEREE_INTERRUPTION", referencedGoalEventId: goalRows[0]!.event_id, referencedGoalSeq: 5 }
        }
      });
      expect(restartedGoalAttempt).toMatchObject({ status: "REJECTED", currentSeq: 7, appendedEvents: [] });
      const [restartFactRows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM match_events WHERE match_id = ? AND event_type = 'TIMEOUT_OPPORTUNITY_FACT_RECORDED'", [restartedMatchId]);
      expect(Number(restartFactRows[0]!.count)).toBe(0);

      const mountedMatchId = await createStartedMatch();
      await pool.query("INSERT INTO match_officials (id, match_id, user_id, role_code, assignment_status, assigned_at, created_at) VALUES (?, ?, ?, 'SCORER', 'ACTIVE', NOW(3), NOW(3))", [randomUUID(), mountedMatchId, user.userId]);
      const [mountedBaselineRows] = await pool.query<RowDataPacket[]>("SELECT projection_data FROM match_projections WHERE match_id = ? AND projection_type = 'scoreboard'", [mountedMatchId]);
      const mountedBaselineProjection = typeof mountedBaselineRows[0]!.projection_data === "string" ? JSON.parse(mountedBaselineRows[0]!.projection_data) : mountedBaselineRows[0]!.projection_data;
      const mountedBaselineTimeouts = structuredClone(mountedBaselineProjection.timeouts);
      const mountedFact = task015Command(mountedMatchId, 4);
      const acceptedFact = await app.inject({ method: "POST", url: `/api/v1/matches/${mountedMatchId}/commands/timeout-opportunity/fact`, headers: scorerHeaders(mountedMatchId), payload: mountedFact });
      expect(acceptedFact.statusCode, acceptedFact.body).toBe(200);
      const factBody = acceptedFact.json<{ status: string; appendedEvents: Array<{ eventId: string; seqNo: number }> }>();
      expect(factBody.status).toBe("ACCEPTED");
      const correction = { commandId: randomUUID(), matchId: mountedMatchId, expectedSeq: 5, correlationId: randomUUID(), clientTimestamp: new Date().toISOString(), payload: { targetEventId: factBody.appendedEvents[0]!.eventId, targetSeq: factBody.appendedEvents[0]!.seqNo, reason: "Verified table correction" } };
      const acceptedCorrection = await app.inject({ method: "POST", url: `/api/v1/matches/${mountedMatchId}/commands/timeout-opportunity/correct`, headers: scorerHeaders(mountedMatchId), payload: correction });
      expect(acceptedCorrection.json()).toMatchObject({ status: "ACCEPTED", currentSeq: 6 });
      const correctionRetry = await app.inject({ method: "POST", url: `/api/v1/matches/${mountedMatchId}/commands/timeout-opportunity/correct`, headers: scorerHeaders(mountedMatchId), payload: correction });
      expect(correctionRetry.json()).toMatchObject({ status: "DUPLICATE_ACCEPTED", currentSeq: 6 });
      const correctionCollision = await app.inject({
        method: "POST", url: `/api/v1/matches/${mountedMatchId}/commands/timeout-opportunity/correct`, headers: scorerHeaders(mountedMatchId),
        payload: { ...correction, payload: { ...correction.payload, reason: "Changed collision payload" } }
      });
      expect(correctionCollision.json()).toMatchObject({ status: "REJECTED", currentSeq: 6 });
      const [causalRows] = await pool.query<RowDataPacket[]>(
        "SELECT event_id, event_type, causation_id, payload FROM match_events WHERE match_id = ? AND seq_no IN (5, 6) ORDER BY seq_no",
        [mountedMatchId]
      );
      expect(causalRows[0]!.causation_id).toBeNull();
      expect(causalRows[1]!.causation_id).toBe(causalRows[0]!.event_id);
      const correctionPayload = typeof causalRows[1]!.payload === "string" ? JSON.parse(causalRows[1]!.payload) : causalRows[1]!.payload;
      expect(correctionPayload).toMatchObject({
        targetEventId: causalRows[0]!.event_id,
        targetSeq: 5,
        reason: "Verified table correction",
        actorUserId: user.userId,
        actorRole: "SCORER",
        deviceId: expect.any(String),
        oldEffect: expect.any(Object),
        newEffect: expect.any(Object)
      });
      const [causalAudits] = await pool.query<RowDataPacket[]>(
        "SELECT action, causation_id FROM audit_logs WHERE entity_id = ? AND action IN ('TIMEOUT_OPPORTUNITY_FACT_RECORDED', 'TIMEOUT_OPPORTUNITY_CORRECTED') ORDER BY event_seq",
        [mountedMatchId]
      );
      expect(causalAudits).toMatchObject([
        { action: "TIMEOUT_OPPORTUNITY_FACT_RECORDED", causation_id: causalRows[0]!.event_id },
        { action: "TIMEOUT_OPPORTUNITY_CORRECTED", causation_id: causalRows[1]!.event_id }
      ]);
      const [collisionCounts] = await pool.query<RowDataPacket[]>(
        "SELECT (SELECT COUNT(*) FROM match_events WHERE match_id = ?) AS event_count, (SELECT COUNT(*) FROM command_deduplication WHERE match_id = ?) AS receipt_count, (SELECT COUNT(*) FROM audit_logs WHERE entity_id = ?) AS audit_count",
        [mountedMatchId, mountedMatchId, mountedMatchId]
      );
      expect(collisionCounts[0]).toMatchObject({ event_count: 6, receipt_count: 4, audit_count: 4 });
      const [mountedFinalRows] = await pool.query<RowDataPacket[]>("SELECT projection_data FROM match_projections WHERE match_id = ? AND projection_type = 'scoreboard'", [mountedMatchId]);
      const mountedFinalProjection = typeof mountedFinalRows[0]!.projection_data === "string" ? JSON.parse(mountedFinalRows[0]!.projection_data) : mountedFinalRows[0]!.projection_data;
      expect(mountedFinalProjection.timeouts).toEqual(mountedBaselineTimeouts);
      expect((await app.inject({ method: "POST", url: `/api/v1/matches/${mountedMatchId}/commands/timeout-opportunity/fact`, headers: viewerHeaders(mountedMatchId), payload: task015Command(mountedMatchId, 6) })).statusCode).toBe(403);
      expect((await app.inject({ method: "POST", url: `/api/v1/matches/${mountedMatchId}/commands/timeout-opportunity/fact`, payload: task015Command(mountedMatchId, 6) })).statusCode).toBe(401);
      expect((await app.inject({ method: "POST", url: `/api/v1/matches/${mountedMatchId}/commands/timeout-opportunity/fact`, headers: scorerHeaders(randomUUID()), payload: task015Command(mountedMatchId, 6) })).statusCode).toBe(403);
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("converges replacement score identity across live, replay, snapshot-tail, and protected sync without granting a timeout", async () => {
    const { app, pool } = await buildMigratedApp({ realtime: true });
    try {
      const created = (await app.inject({
        method: "POST",
        url: "/api/v1/matches",
        headers: adminHeaders,
        payload: { matchCode: `T015-IDENTITY-${randomUUID()}`, ruleProfileId: "FIBA_2024" }
      })).json<{ matchId: string }>();
      await prepareAuthoritativeLifecycleFixture(pool, created.matchId);
      const [baselineRows] = await pool.query<RowDataPacket[]>("SELECT projection_data FROM match_projections WHERE match_id = ? AND projection_type = 'scoreboard'", [created.matchId]);
      const baselineProjection = typeof baselineRows[0]!.projection_data === "string" ? JSON.parse(baselineRows[0]!.projection_data) : baselineRows[0]!.projection_data;
      const baselineTimeouts = structuredClone(baselineProjection.timeouts);
      expect((await app.inject({ method: "POST", url: `/api/v1/matches/${created.matchId}/commands/lifecycle/start-match`, headers: adminHeaders, payload: lifecycleStartCommand(created.matchId, 2) })).json()).toMatchObject({ status: "ACCEPTED", currentSeq: 3 });
      expect((await app.inject({ method: "POST", url: `/api/v1/matches/${created.matchId}/commands/clock/game/start`, headers: adminHeaders, payload: clockCommand(created.matchId, 3) })).json()).toMatchObject({ status: "ACCEPTED", currentSeq: 4 });
      expect((await app.inject({ method: "POST", url: `/api/v1/matches/${created.matchId}/commands/score/add`, headers: adminHeaders, payload: scoreCommand(created.matchId, 4) })).json()).toMatchObject({ status: "ACCEPTED", currentSeq: 5 });
      const request = correctionRequestCommand(created.matchId, 5, 5);
      expect((await app.inject({ method: "POST", url: `/api/v1/matches/${created.matchId}/commands/corrections/request`, headers: adminHeaders, payload: request })).json()).toMatchObject({ status: "ACCEPTED", currentSeq: 6 });
      const applied = (await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/corrections/apply-score`,
        headers: adminHeaders,
        payload: applyScoreCorrectionCommand(created.matchId, 6, 6, 5)
      })).json<{ status: string; projection: { timeoutOpportunity: { sourceEventId: string | null } } }>();
      expect(applied.status).toBe("ACCEPTED");

      const [projectionRows] = await pool.query<RowDataPacket[]>("SELECT projection_data FROM match_projections WHERE match_id = ? AND projection_type = 'scoreboard'", [created.matchId]);
      const liveProjection = typeof projectionRows[0]!.projection_data === "string"
        ? JSON.parse(projectionRows[0]!.projection_data)
        : projectionRows[0]!.projection_data;
      expect(liveProjection.timeouts).toEqual(baselineTimeouts);
      const connection = await pool.getConnection();
      let events;
      try {
        events = await listMatchEvents(connection, created.matchId);
      } finally {
        connection.release();
      }
      const replacement = events.find((event) => event.seqNo === 8 && event.eventType === "SCORE_ADDED");
      expect(replacement).toBeDefined();
      const fullReplay = rebuildTimeoutOpportunityProjection(created.matchId, events);
      const beforeCorrectionSnapshot = rebuildTimeoutOpportunityProjection(created.matchId, events.filter((event) => event.seqNo <= 5));
      const snapshotTail = rebuildTimeoutOpportunityProjection(created.matchId, events, beforeCorrectionSnapshot);
      const protectedSync = await getMatchSync({ pool, matchId: created.matchId, lastEventSeq: 5 });
      const mountedSyncResponse = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${created.matchId}/sync?lastEventSeq=5`,
        headers: adminHeaders
      });
      expect(mountedSyncResponse.statusCode).toBe(200);
      const mountedSync = mountedSyncResponse.json<{ projection: typeof fullReplay; missedEvents: Array<{ seqNo: number }> }>();
      expect([
        liveProjection.timeoutOpportunity.sourceEventId,
        fullReplay.timeoutOpportunity.sourceEventId,
        snapshotTail.timeoutOpportunity.sourceEventId,
        protectedSync.projection?.timeoutOpportunity.sourceEventId,
        mountedSync.projection.timeoutOpportunity.sourceEventId
      ]).toEqual(Array(5).fill(replacement!.eventId));
      expect(mountedSync.projection.timeoutOpportunity).toEqual(fullReplay.timeoutOpportunity);
      expect(mountedSync.projection.timeoutOpportunityHistory).toEqual(fullReplay.timeoutOpportunityHistory);
      expect(protectedSync.projection?.timeoutOpportunity).toEqual(fullReplay.timeoutOpportunity);
      expect(protectedSync.projection?.timeoutOpportunityHistory).toEqual(fullReplay.timeoutOpportunityHistory);
      expect(liveProjection.timeoutOpportunity).toEqual(fullReplay.timeoutOpportunity);
      expect(liveProjection.timeoutOpportunityHistory).toEqual(fullReplay.timeoutOpportunityHistory);
      expect(snapshotTail.timeoutOpportunity).toEqual(fullReplay.timeoutOpportunity);
      expect(snapshotTail.timeoutOpportunityHistory).toEqual(fullReplay.timeoutOpportunityHistory);
      expect(mountedSync.missedEvents.map((event) => event.seqNo)).toEqual([6, 7, 8, 9]);

      const [forbiddenRows] = await pool.query<RowDataPacket[]>(
        "SELECT event_type FROM match_events WHERE match_id = ? AND event_type IN ('TIMEOUT_GRANTED', 'TIMEOUT_ENDED', 'TIMEOUT_CORRECTED', 'TEAM_TIMEOUT_GRANTED', 'TEAM_TIMEOUT_ENDED', 'TEAM_TIMEOUT_CORRECTED')",
        [created.matchId]
      );
      expect(forbiddenRows).toEqual([]);
      const persistedProjection = JSON.stringify(projectionRows[0]!.projection_data);
      expect(persistedProjection).not.toContain("timeoutQuota");
      expect(persistedProjection).not.toContain("lateQ4");

      const publicResponse = await app.inject({ method: "GET", url: `/api/v1/public/matches/${created.matchId}/scoreboard` });
      const publicJson = JSON.stringify(publicResponse.json());
      for (const privateField of ["timeoutOpportunity", "sourceEventId", "actorUserId", "deviceId", "Wrong team selected", "Corrected from HOME to AWAY"]) {
        expect(publicJson).not.toContain(privateField);
      }
      const productionUserId = randomUUID();
      const productionEmail = `${productionUserId}@task015-session.test`;
      const productionPassword = "Task015 isolated session password";
      await pool.query("INSERT IGNORE INTO roles (role_id, role_key, role_name) VALUES (?, 'ADMIN', 'ADMIN')", [randomUUID()]);
      await pool.query("INSERT IGNORE INTO permissions (permission_id, permission_key, description) VALUES (?, 'match.read', 'match.read')", [randomUUID()]);
      const [adminRoleRows] = await pool.query<RowDataPacket[]>("SELECT role_id FROM roles WHERE role_key = 'ADMIN'");
      const [matchReadRows] = await pool.query<RowDataPacket[]>("SELECT permission_id FROM permissions WHERE permission_key = 'match.read'");
      await pool.query("INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)", [adminRoleRows[0]!.role_id, matchReadRows[0]!.permission_id]);
      await pool.query("INSERT INTO users (user_id, email, display_name, password_hash, status) VALUES (?, ?, 'Task015 Session Admin', ?, 'ACTIVE')", [productionUserId, productionEmail, await bcrypt.hash(productionPassword, 4)]);
      await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [productionUserId, adminRoleRows[0]!.role_id]);
      const loginResponse = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: productionEmail, password: productionPassword } });
      expect(loginResponse.statusCode).toBe(200);
      const productionSessionCookie = String(loginResponse.headers["set-cookie"]).split(";")[0]!;
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const operatorSnapshots: Array<{ projection: typeof fullReplay; missedEvents: Array<{ seqNo: number }> }> = [];
      const operatorSocket = createSocketClient(address, {
        transports: ["polling"], forceNew: true, reconnection: false, autoConnect: false,
        extraHeaders: { cookie: productionSessionCookie }
      });
      try {
        for (let reconnectAttempt = 0; reconnectAttempt < 2; reconnectAttempt += 1) {
          const connected = onceSocketEvent(operatorSocket, "connect");
          operatorSocket.connect();
          await connected;
          const operatorSnapshotPromise = onceSocketEvent<{ projection: typeof fullReplay; missedEvents: Array<{ seqNo: number }> }>(operatorSocket, "match:operator-snapshot");
          operatorSocket.emit("match:join", { matchId: created.matchId, lastSeq: 5, view: "OPERATOR" });
          operatorSnapshots.push(await operatorSnapshotPromise);
          operatorSocket.disconnect();
        }
      } finally {
        operatorSocket.disconnect();
      }
      for (const operatorSnapshot of operatorSnapshots) {
        expect(operatorSnapshot.projection.timeoutOpportunity).toEqual(fullReplay.timeoutOpportunity);
        expect(operatorSnapshot.projection.timeoutOpportunityHistory).toEqual(fullReplay.timeoutOpportunityHistory);
        expect(operatorSnapshot.missedEvents.map((event) => event.seqNo)).toEqual([6, 7, 8, 9]);
      }
      const socket = createSocketClient(address, { transports: ["polling"], forceNew: true, reconnection: false, autoConnect: false });
      try {
        const connected = onceSocketEvent(socket, "connect");
        socket.connect();
        await connected;
        const snapshotPromise = onceSocketEvent<Record<string, unknown>>(socket, "match:snapshot");
        socket.emit("match:join", { matchId: created.matchId, view: "PUBLIC_SCOREBOARD" });
        const socketJson = JSON.stringify(await snapshotPromise);
        for (const privateField of ["timeoutOpportunity", "timeoutOpportunityHistory", "sourceEventId", "actorUserId", "actorRole", "deviceId", "commandId", "correctionRequestSeq", "originalScoreEventId", "Wrong team selected", "Corrected from HOME to AWAY"]) {
          expect(socketJson).not.toContain(privateField);
        }
        const rejectionPromise = onceSocketEvent<{ reasonCode: string }>(socket, "COMMAND_REJECTED");
        socket.emit("COMMAND_SUBMIT", { commandType: "timeout-opportunity/correct", matchId: created.matchId });
        expect(await rejectionPromise).toMatchObject({ reasonCode: "FORBIDDEN" });
      } finally {
        socket.disconnect();
      }
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
      "SCORE_REMOVED_BY_CORRECTION",
      "SCORE_CORRECTED",
      "TEAM_FOUL_CORRECTED",
      "PLAYER_FOUL_CORRECTED",
      "TIMEOUT_CORRECTED",
      "GAME_CLOCK_CORRECTED",
      "SHOT_CLOCK_CORRECTED"
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
