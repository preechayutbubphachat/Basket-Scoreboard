import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { buildApiApp } from "../../apps/api/src/app";
import { createDatabasePool } from "../../apps/api/src/db";
import { hasDatabaseEnv } from "../../apps/api/src/config/env";
import {
  MariaDbMigrationConnection,
  getDefaultMigrationsDir,
  runMigrations
} from "../../apps/api/src/migrations";
import { DB_INTEGRATION_TEST_TIMEOUT_MS } from "../helpers/dbIntegrationTimeout";
import { insertAuditLog, listAuditLogsForMatch } from "../../apps/api/src/matchEventStore/auditRepository";
import { correctionEventTypes } from "../../packages/event-model/src";

const describeDb = hasDatabaseEnv() ? describe : describe.skip;
const adminHeaders = {
  "x-dev-user-role": "ADMIN",
  "x-dev-user-id": "00000000-0000-4000-8000-0000000000aa"
};

afterAll(() => {
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

async function buildMigratedApp() {
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

function teamFoulCommand(
  matchId: string,
  expectedSeq: number,
  teamSide: "HOME" | "AWAY" = "HOME",
  commandId = randomUUID()
) {
  return {
    commandId,
    matchId,
    expectedSeq,
    correlationId: randomUUID(),
    clientTimestamp: new Date().toISOString(),
    payload: {
      teamSide,
      foulType: "PERSONAL",
      reason: null
    }
  };
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

  it("appends team foul events, updates projection, deduplicates commands, and rejects stale expectedSeq", async () => {
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

      const homeFoul = teamFoulCommand(created.matchId, 0, "HOME");
      const homeFoulResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/foul/team/add`,
        headers: scorerHeaders(created.matchId),
        payload: homeFoul
      });
      expect(homeFoulResponse.statusCode).toBe(200);
      expect(homeFoulResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 1,
        appendedEvents: [{ seqNo: 1, eventType: "TEAM_FOUL_ADDED" }]
      });

      const duplicateResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/foul/team/add`,
        headers: scorerHeaders(created.matchId),
        payload: homeFoul
      });
      expect(duplicateResponse.json()).toMatchObject({
        status: "DUPLICATE_ACCEPTED",
        currentSeq: 1,
        appendedEvents: []
      });

      const awayFoulResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/foul/team/add`,
        headers: scorerHeaders(created.matchId),
        payload: teamFoulCommand(created.matchId, 1, "AWAY")
      });
      expect(awayFoulResponse.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 2
      });

      const staleResponse = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${created.matchId}/commands/foul/team/add`,
        headers: scorerHeaders(created.matchId),
        payload: teamFoulCommand(created.matchId, 0, "HOME")
      });
      expect(staleResponse.json()).toMatchObject({
        status: "SYNC_REQUIRED",
        currentSeq: 2,
        reasonCode: "INVALID_EXPECTED_SEQ"
      });

      const [eventRows] = await pool.query<RowDataPacket[]>(
        "SELECT seq_no, event_type, payload FROM match_events WHERE match_id = ? ORDER BY seq_no ASC",
        [created.matchId]
      );
      expect(eventRows.map((event) => event.event_type)).toEqual([
        "TEAM_FOUL_ADDED",
        "TEAM_FOUL_ADDED"
      ]);

      const projectionResponse = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${created.matchId}/projection`,
        headers: scorerHeaders(created.matchId)
      });
      expect(projectionResponse.json()).toMatchObject({
        currentSeq: 2,
        lastEventSeq: 2,
        teamFouls: { home: 1, away: 1 },
        teamFoulsByPeriod: { "1": { home: 1, away: 1 } },
        playerFouls: []
      });

      const publicResponse = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${created.matchId}/scoreboard`
      });
      expect(publicResponse.json()).toMatchObject({
        teamFouls: { home: 1, away: 1 }
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
