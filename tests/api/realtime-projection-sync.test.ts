import { afterEach, describe, expect, it, vi } from "vitest";
import { io as createSocketClient, type Socket } from "socket.io-client";
import { buildApiApp } from "../../apps/api/src/app";
import { parseRealtimeSocketTransports } from "../../apps/api/src/realtime/projectionRealtime";
import type {
  PublicMatchSnapshotPayload,
  PublicProjectionUpdatedPayload,
  ScoreboardProjection
} from "../../packages/api-contracts/src";

const matchId = "11111111-1111-4111-8111-111111111111";

function baseProjection(overrides: Partial<ScoreboardProjection> = {}): ScoreboardProjection {
  return {
    matchId,
    homeTeamId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    homeTeamName: "HOME",
    awayTeamId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    awayTeamName: "AWAY",
    homeScore: 0,
    awayScore: 0,
    teamFouls: { home: 0, away: 0 },
    teamFoulsByPeriod: {},
    playerFouls: [{
      playerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      teamSide: "HOME",
      playerName: "Private Player",
      jerseyNumber: "7",
      fouls: 1
    }],
    periodNumber: 1,
    gameClockRemainingMs: 600000,
    shotClockRemainingMs: 24000,
    gameClock: { remainingMs: 600000, running: false, lastStartedAt: null },
    shotClock: { remainingMs: 24000, running: false, lastStartedAt: null },
    clockUpdatedAt: null,
    status: "LIVE",
    currentSeq: 0,
    lastEventSeq: 0,
    projectionVersion: "scoreboard-v1",
    ...overrides
  };
}

function createRealtimeFakePool(options: { matchFound?: boolean; metadata?: Record<string, unknown> } = {}) {
  const matchFound = options.matchFound ?? true;
  let currentSeq = 0;
  let projection = baseProjection();
  const events: unknown[] = [];
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes("FROM command_deduplication")) {
        return [[], []];
      }

      if (sql.includes("SELECT last_seq_no FROM match_streams")) {
        return [[{ last_seq_no: currentSeq }], []];
      }

      if (sql.includes("INSERT INTO match_events")) {
        events.push({ sql, params });
        return [{ affectedRows: 1 }, []];
      }

      if (sql.includes("UPDATE match_streams SET last_seq_no")) {
        currentSeq = Number(params[0]);
        return [{ affectedRows: 1 }, []];
      }

      if (sql.includes("SELECT projection_data, last_event_seq FROM match_projections")) {
        return [[{ projection_data: JSON.stringify(projection), last_event_seq: currentSeq }], []];
      }

      if (sql.includes("UPDATE match_projections SET projection_data")) {
        projection = JSON.parse(String(params[0])) as ScoreboardProjection;
        projection = { ...projection, lastEventSeq: projection.currentSeq };
        return [{ affectedRows: 1 }, []];
      }

      if (sql.includes("FROM matches m")) {
        return [
          matchFound
            ? [
                {
                  match_id: matchId,
                  match_status: projection.status,
                  projection_data: JSON.stringify(projection),
                  last_event_seq: projection.currentSeq,
                  home_team_id: null,
                  home_team_name: "HOME",
                  away_team_id: null,
                  away_team_name: "AWAY",
                  updated_at: new Date("2026-07-02T10:00:00.000Z")
                }
              ]
            : [],
          []
        ];
      }

      if (sql.includes("DATE_FORMAT(scheduled_at")) {
        return [[options.metadata ?? {
          match_code: "Round 2",
          scheduled_at: new Date("2026-07-20T10:00:00.000Z"),
          venue_name: "Municipal Arena",
          metadata: JSON.stringify({ courtLabel: "Court A", courtId: "private-court" })
        }], []];
      }

      return [{ affectedRows: 1 }, []];
    }
  };

  return {
    events,
    pool: {
      getConnection: vi.fn().mockResolvedValue(connection)
    }
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

const forbiddenPublicKeys = new Set([
  "lastEventSeq", "currentSeq", "expectedSeq", "projectionVersion", "eventSeq", "streamVersion",
  "actor", "device", "session", "token", "csrf", "commandId", "correlationId", "causationId",
  "audit", "correction", "permissions", "assignments", "rawEvents", "sourceEventSeq",
  "initializedAtSeq", "recentActionState", "playerName", "jerseyNumber"
]);

function collectForbiddenPublicKeys(value: unknown, found = new Set<string>()) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenPublicKeys.has(key)) found.add(key);
    collectForbiddenPublicKeys(child, found);
  }
  return found;
}

async function startRealtimeApp(pool: unknown) {
  const app = buildApiApp({ pool: pool as never, realtime: { enabled: true } });
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  return { app, address };
}

afterEach(() => {
  delete process.env.AUTH_TEST_DISABLE_CSRF;
});

describe("realtime projection sync", () => {
  it("parses server transport env for Plesk polling-only compatibility", () => {
    expect(parseRealtimeSocketTransports("polling")).toEqual(["polling"]);
    expect(parseRealtimeSocketTransports("polling,websocket")).toEqual(["polling", "websocket"]);
    expect(parseRealtimeSocketTransports(undefined)).toEqual(["polling", "websocket"]);
  });

  it("allows public scoreboard clients to join a match room and receive a snapshot", async () => {
    const { pool } = createRealtimeFakePool();
    const { app, address } = await startRealtimeApp(pool);
    const socket = createSocketClient(address, { transports: ["websocket"], forceNew: true });

    try {
      await waitForSocketEvent(socket, "connect");
      const snapshotPromise = waitForSocketEvent(socket, "match:snapshot");
      socket.emit("match:join", { matchId, view: "PUBLIC_SCOREBOARD" });
      const snapshot = await snapshotPromise as PublicMatchSnapshotPayload;
      expect(Object.keys(snapshot).sort()).toEqual(["matchId", "publicScoreboard", "serverTime"]);
      expect(snapshot).toMatchObject({
        matchId,
        publicScoreboard: {
          matchId,
          homeTeamName: "HOME",
          awayTeamName: "AWAY",
          recentActions: [],
          matchMetadata: {
            roundLabel: "Round 2",
            courtLabel: "Court A",
            venueLabel: "Municipal Arena",
            scheduledStart: "2026-07-20T10:00:00.000Z"
          }
        }
      });
      expect([...collectForbiddenPublicKeys(snapshot)]).toEqual([]);
      expect(JSON.stringify(snapshot)).not.toMatch(/homeTeamId|awayTeamId|playerId|playerFouls|roster/i);
      expect(JSON.stringify(snapshot)).not.toMatch(/courtId|venueId|tournamentId|match_code|scheduled_at|venue_name|rawEvents/i);
    } finally {
      socket.close();
      await app.close();
    }
  });

  it("omits unsafe legacy branding from public socket snapshots", async () => {
    const { pool } = createRealtimeFakePool();
    const unsafeTheme = {
      tournament: {
        displayName: "Youth Cup",
        logoUrl: "https://cdn.example.com/tournament.png",
        showLogo: true,
        backgroundStyle: "DARK_GRADIENT" as const,
        colors: { primaryColor: null, secondaryColor: null, accentColor: null, textColor: null }
      },
      home: {
        displayName: "HOME",
        logoUrl: "/assets/branding/teams/home.png",
        showLogo: true,
        colors: { primaryColor: null, secondaryColor: null, accentColor: null, textColor: null }
      },
      away: {
        displayName: "AWAY",
        logoUrl: "/assets/branding/%252e%252e/secret.png",
        showLogo: true,
        colors: { primaryColor: null, secondaryColor: null, accentColor: null, textColor: null }
      },
      flags: { textOnlyFallback: false, neutralHighContrast: false }
    };
    const connection = await (pool as { getConnection: () => Promise<{ query: (sql: string, params?: unknown[]) => Promise<unknown> }> }).getConnection();
    await connection.query("UPDATE match_projections SET projection_data", [
      JSON.stringify(baseProjection({ displayTheme: unsafeTheme })),
      0,
      matchId
    ]);
    const { app, address } = await startRealtimeApp(pool);
    const socket = createSocketClient(address, { transports: ["websocket"], forceNew: true });

    try {
      await waitForSocketEvent(socket, "connect");
      const snapshotPromise = waitForSocketEvent<PublicMatchSnapshotPayload>(socket, "match:snapshot");
      socket.emit("match:join", { matchId, view: "PUBLIC_SCOREBOARD" });
      const snapshot = await snapshotPromise;
      expect(Object.keys(snapshot).sort()).toEqual(["matchId", "publicScoreboard", "serverTime"]);
      expect(snapshot.publicScoreboard.displayTheme).toMatchObject({
        tournament: { logoUrl: null, showLogo: true },
        home: { logoUrl: "/assets/branding/teams/home.png", showLogo: true },
        away: { logoUrl: null, showLogo: true }
      });
      expect(JSON.stringify(snapshot)).not.toContain("cdn.example.com");
      expect([...collectForbiddenPublicKeys(snapshot)]).toEqual([]);
    } finally {
      socket.close();
      await app.close();
    }
  });

  it("allows public scoreboard clients to connect with polling transport only", async () => {
    process.env.REALTIME_SOCKET_TRANSPORTS = "polling";
    const { pool } = createRealtimeFakePool();
    const { app, address } = await startRealtimeApp(pool);
    const socket = createSocketClient(address, { transports: ["polling"], forceNew: true });

    try {
      await waitForSocketEvent(socket, "connect");
      const snapshotPromise = waitForSocketEvent(socket, "match:snapshot");
      socket.emit("match:join", { matchId, view: "PUBLIC_SCOREBOARD" });
      await expect(snapshotPromise).resolves.toMatchObject({
        matchId,
        publicScoreboard: { matchId }
      });
    } finally {
      delete process.env.REALTIME_SOCKET_TRANSPORTS;
      socket.close();
      await app.close();
    }
  });

  it("rejects socket write commands and keeps realtime notification-only", async () => {
    const { pool } = createRealtimeFakePool();
    const { app, address } = await startRealtimeApp(pool);
    const socket = createSocketClient(address, { transports: ["websocket"], forceNew: true });

    try {
      await waitForSocketEvent(socket, "connect");
      const rejectedPromise = waitForSocketEvent(socket, "COMMAND_REJECTED");
      socket.emit("COMMAND_SUBMIT", { type: "score/add" });
      await expect(rejectedPromise).resolves.toMatchObject({
        reasonCode: "FORBIDDEN",
        message: "Socket commands are disabled; use REST command endpoints"
      });
    } finally {
      socket.close();
      await app.close();
    }
  });

  it("denies protected room joins even when a public client forges authority", async () => {
    const { pool } = createRealtimeFakePool();
    const { app, address } = await startRealtimeApp(pool);
    const socket = createSocketClient(address, { transports: ["websocket"], forceNew: true });

    try {
      await waitForSocketEvent(socket, "connect");
      const errorPromise = waitForSocketEvent<Record<string, unknown>>(socket, "match:error");
      socket.emit("match:join", {
        matchId,
        view: "OPERATOR",
        role: "ADMIN",
        permissions: ["match.score.operate"],
        assignedMatchIds: [matchId]
      });
      const error = await errorPromise;
      expect(error).toMatchObject({ reasonCode: "FORBIDDEN", matchId });
      expect(Object.keys(error).sort()).toEqual(["matchId", "message", "reasonCode", "serverTime"]);
    } finally {
      socket.close();
      await app.close();
    }
  });

  it("rehydrates a public client after reconnect without a sequence cursor", async () => {
    const { pool } = createRealtimeFakePool();
    const { app, address } = await startRealtimeApp(pool);
    const socket = createSocketClient(address, { transports: ["websocket"], forceNew: true });

    try {
      await waitForSocketEvent(socket, "connect");
      const firstSnapshot = waitForSocketEvent<PublicMatchSnapshotPayload>(socket, "match:snapshot");
      socket.emit("match:join", { matchId, view: "PUBLIC_SCOREBOARD" });
      expect([...collectForbiddenPublicKeys(await firstSnapshot)]).toEqual([]);

      socket.disconnect();
      const reconnected = waitForSocketEvent(socket, "connect");
      socket.connect();
      await reconnected;
      const nextSnapshot = waitForSocketEvent<PublicMatchSnapshotPayload>(socket, "match:snapshot");
      socket.emit("match:join", { matchId, view: "PUBLIC_SCOREBOARD" });
      const snapshot = await nextSnapshot;
      expect(Object.keys(snapshot).sort()).toEqual(["matchId", "publicScoreboard", "serverTime"]);
      expect(snapshot.publicScoreboard.recentActions).toEqual([]);
      expect([...collectForbiddenPublicKeys(snapshot)]).toEqual([]);
    } finally {
      socket.close();
      await app.close();
    }
  });

  it("emits projection.updated after an accepted score command commits", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const { pool, events } = createRealtimeFakePool();
    const { app, address } = await startRealtimeApp(pool);
    const socket = createSocketClient(address, { transports: ["websocket"], forceNew: true });

    try {
      await waitForSocketEvent(socket, "connect");
      const snapshotPromise = waitForSocketEvent(socket, "match:snapshot");
      socket.emit("match:join", { matchId, view: "PUBLIC_SCOREBOARD" });
      await snapshotPromise;

      const updatePromise = waitForSocketEvent(socket, "projection.updated");
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/score/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          commandId: "22222222-2222-4222-8222-222222222222",
          matchId,
          expectedSeq: 0,
          correlationId: "33333333-3333-4333-8333-333333333333",
          clientTimestamp: "2026-07-02T10:00:00.000Z",
          payload: {
            teamSide: "HOME",
            points: 2,
            playerId: null,
            periodNumber: 1,
            gameClockRemainingMs: 600000,
            note: null
          }
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: "ACCEPTED", currentSeq: 1 });
      const update = await updatePromise as PublicProjectionUpdatedPayload;
      expect(Object.keys(update).sort()).toEqual(["matchId", "publicScoreboard", "updatedAt"]);
      expect(update.publicScoreboard.recentActions).toEqual([
        { kind: "SCORE", teamSide: "HOME", points: 2 }
      ]);
      expect(update).toMatchObject({
        matchId,
        publicScoreboard: {
          matchId,
          homeScore: 2,
          matchMetadata: {
            roundLabel: "Round 2",
            courtLabel: "Court A",
            venueLabel: "Municipal Arena",
            scheduledStart: "2026-07-20T10:00:00.000Z"
          }
        }
      });
      expect([...collectForbiddenPublicKeys(update)]).toEqual([]);
      expect(JSON.stringify(update)).not.toMatch(/homeTeamId|awayTeamId|playerId|playerFouls|roster/i);
      expect(JSON.stringify(update)).not.toMatch(/courtId|venueId|tournamentId|match_code|scheduled_at|venue_name|rawEvents/i);
      expect(events).toHaveLength(1);
    } finally {
      socket.close();
      await app.close();
    }
  });

  it("does not emit projection.updated for stale expectedSeq rejections", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const { pool, events } = createRealtimeFakePool();
    const { app, address } = await startRealtimeApp(pool);
    const socket = createSocketClient(address, { transports: ["websocket"], forceNew: true });

    try {
      await waitForSocketEvent(socket, "connect");
      const snapshotPromise = waitForSocketEvent(socket, "match:snapshot");
      socket.emit("match:join", { matchId, view: "PUBLIC_SCOREBOARD" });
      await snapshotPromise;

      let emitted = false;
      socket.once("projection.updated", () => {
        emitted = true;
      });
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/score/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          commandId: "22222222-2222-4222-8222-222222222223",
          matchId,
          expectedSeq: 99,
          correlationId: "33333333-3333-4333-8333-333333333334",
          clientTimestamp: "2026-07-02T10:00:00.000Z",
          payload: {
            teamSide: "HOME",
            points: 2,
            playerId: null,
            periodNumber: 1,
            gameClockRemainingMs: 600000,
            note: null
          }
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: "SYNC_REQUIRED" });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(emitted).toBe(false);
      expect(events).toHaveLength(0);
    } finally {
      socket.close();
      await app.close();
    }
  });

  it("returns a safe error when joining an unknown public match", async () => {
    const { pool } = createRealtimeFakePool({ matchFound: false });
    const { app, address } = await startRealtimeApp(pool);
    const socket = createSocketClient(address, { transports: ["websocket"], forceNew: true });

    try {
      await waitForSocketEvent(socket, "connect");
      const errorPromise = waitForSocketEvent(socket, "match:error");
      socket.emit("match:join", { matchId, view: "PUBLIC_SCOREBOARD" });
      const error = await errorPromise as Record<string, unknown>;
      expect(error).toMatchObject({
        reasonCode: "MATCH_NOT_FOUND",
        matchId
      });
      expect(Object.keys(error).sort()).toEqual(["matchId", "message", "reasonCode", "serverTime"]);
      expect([...collectForbiddenPublicKeys(error)]).toEqual([]);
    } finally {
      socket.close();
      await app.close();
    }
  });
});
