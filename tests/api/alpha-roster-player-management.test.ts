import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";
import {
  createInitialScoreboardProjection,
  type ScoreboardProjection
} from "../../apps/api/src/matchEventStore/projection";

beforeEach(() => {
  vi.stubEnv("AUTH_TEST_PROVIDER", "server-owned");
});

const matchId = "11111111-1111-4111-8111-111111111111";
const homeTeamId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const awayTeamId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const homePlayerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const awayPlayerId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function command(commandId: string, payload: Record<string, unknown>) {
  return {
    commandId,
    matchId,
    expectedSeq: 0,
    correlationId: "33333333-3333-4333-8333-333333333333",
    clientTimestamp: "2026-07-02T10:00:00.000Z",
    payload
  };
}

function createRosterPool(options: {
  delayedDuplicate?: { command: ReturnType<typeof command>; result: Record<string, unknown> };
  failOnEventType?: string;
  initialStatus?: ScoreboardProjection["status"];
} = {}) {
  let projection: ScoreboardProjection = {
    ...createInitialScoreboardProjection(matchId),
    ...(options.initialStatus ? { status: options.initialStatus } : {})
  };
  let currentSeq = 0;
  const players = new Map<string, {
    player_id: string;
    team_id: string;
    display_name: string;
    jersey_number: string | null;
    status: "ACTIVE" | "INACTIVE";
    metadata: unknown;
  }>();
  const roster: Array<{
    roster_player_id: string;
    match_id: string;
    team_side: "HOME" | "AWAY";
    team_id: string;
    player_id: string;
    display_name_snapshot: string;
    jersey_number_snapshot: string | null;
    position: "GUARD" | "FORWARD" | "CENTER" | "UNKNOWN";
    roster_status: "ACTIVE" | "BENCH" | "INACTIVE";
    is_starter: 0 | 1;
    is_captain: 0 | 1;
  }> = [];
  const events: Array<{
    eventId: string;
    seqNo: number;
    eventType: string;
    payload: unknown;
    correlationId: string;
    causationId: string | null;
  }> = [];
  const commandResults = new Map<string, { request_hash: string; result: unknown }>();
  let dedupLookupCount = 0;

  let transactionEventStart = 0;
  const beginTransaction = vi.fn(async () => {
    transactionEventStart = events.length;
  });
  const commit = vi.fn(async () => undefined);
  const rollback = vi.fn(async () => {
    events.splice(transactionEventStart);
  });
  const connection = {
    beginTransaction,
    commit,
    rollback,
    release: vi.fn(),
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes("FROM teams WHERE team_id")) {
        const teamId = String(params[0]);
        return [[teamId === homeTeamId || teamId === awayTeamId ? { team_id: teamId } : null].filter(Boolean), []];
      }

      if (sql.includes("INSERT INTO players")) {
        players.set(String(params[0]), {
          player_id: String(params[0]),
          team_id: String(params[1]),
          display_name: String(params[2]),
          jersey_number: params[3] === null ? null : String(params[3]),
          status: "ACTIVE",
          metadata: JSON.parse(String(params[5]))
        });
        return [{ affectedRows: 1 }, []];
      }

      if (sql.includes("FROM players WHERE team_id")) {
        const teamId = String(params[0]);
        return [[...players.values()].filter((player) => player.team_id === teamId), []];
      }

      if (sql.includes("FROM players WHERE player_id")) {
        const player = players.get(String(params[0]));
        return [player ? [player] : [], []];
      }

      if (sql.includes("FROM matches WHERE match_id")) {
        return [[{
          match_id: matchId,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          status: "READY"
        }], []];
      }

      if (sql.includes("INSERT INTO match_roster_players")) {
        const existing = roster.find((entry) => entry.match_id === params[1] && entry.player_id === params[4]);
        if (!existing) {
          roster.push({
            roster_player_id: String(params[0]),
            match_id: String(params[1]),
            team_side: params[2] as "HOME" | "AWAY",
            team_id: String(params[3]),
            player_id: String(params[4]),
            display_name_snapshot: String(params[5]),
            jersey_number_snapshot: params[6] === null ? null : String(params[6]),
            position: params[7] as "GUARD" | "FORWARD" | "CENTER" | "UNKNOWN",
            roster_status: "ACTIVE",
            is_starter: 0,
            is_captain: 0
          });
        }
        return [{ affectedRows: existing ? 0 : 1 }, []];
      }

      if (sql.includes("FROM match_roster_players mrp") && sql.includes("ORDER BY mrp.team_side")) {
        return [roster, []];
      }

      if (sql.includes("FROM match_roster_confirmations")) {
        return [[], []];
      }

      if (sql.includes("FROM match_roster_players mrp") && sql.includes("mrp.player_id = ?")) {
        return [
          roster.filter((entry) => {
            if (sql.includes("mrp.team_side = ?")) {
              return (
                entry.match_id === params[0] &&
                entry.team_side === params[1] &&
                entry.player_id === params[2] &&
                entry.roster_status !== "INACTIVE"
              );
            }
            if (sql.includes("on_court.is_starter = 1")) {
              const onCourtCount = roster.filter((candidate) =>
                candidate.match_id === entry.match_id &&
                candidate.team_side === entry.team_side &&
                candidate.roster_status === "ACTIVE" &&
                candidate.is_starter === 1
              ).length;
              return entry.match_id === params[0] &&
                entry.player_id === params[1] &&
                entry.roster_status === "ACTIVE" &&
                entry.is_starter === 1 &&
                onCourtCount === 5;
            }
            return entry.match_id === params[0] && entry.player_id === params[1];
          }),
          []
        ];
      }

      if (sql.includes("FROM command_deduplication")) {
        dedupLookupCount += 1;
        let record = commandResults.get(`${params[0]}:${params[1]}`);
        if (!record && dedupLookupCount >= 2 && options.delayedDuplicate &&
          options.delayedDuplicate.command.matchId === params[0] &&
          options.delayedDuplicate.command.commandId === params[1]) {
          record = {
            request_hash: createHash("sha256")
              .update(JSON.stringify(options.delayedDuplicate.command))
              .digest("hex"),
            result: options.delayedDuplicate.result
          };
        }
        return [record ? [{ request_hash: record.request_hash, result: JSON.stringify(record.result) }] : [], []];
      }

      if (sql.includes("SELECT last_seq_no FROM match_streams")) {
        return [[{ last_seq_no: currentSeq }], []];
      }

      if (sql.includes("SELECT projection_data, last_event_seq FROM match_projections")) {
        if (sql.includes("projection_type = ?")) return [[], []];
        return [[{ projection_data: JSON.stringify(projection), last_event_seq: currentSeq }], []];
      }

      if (sql.includes("JSON_EXTRACT(payload")) {
        return [events
          .filter((event) => event.eventType === "MATCH_ROSTER_BASELINE_IMPORTED")
          .map((event) => ({ event_id: event.eventId })), []];
      }

      if (sql.includes("FROM match_events")) {
        return [events, []];
      }

      if (sql.includes("INSERT INTO match_events")) {
        const insertedEventType = sql.includes("'SCORE_ADDED'")
          ? "SCORE_ADDED"
          : sql.includes("'FREE_THROW_ENTITLEMENT_CREATED'")
            ? "FREE_THROW_ENTITLEMENT_CREATED"
            : sql.includes("'PLAY_RESUMPTION_DECLARED'")
              ? "PLAY_RESUMPTION_DECLARED"
              : String(params[3]);
        if (options.failOnEventType === insertedEventType) {
          throw new Error(`simulated ${insertedEventType} insert failure`);
        }
        if (sql.includes("'SCORE_ADDED'")) {
          events.push({ eventId: String(params[0]), seqNo: Number(params[2]), eventType: "SCORE_ADDED", payload: JSON.parse(String(params[3])), correlationId: String(params[10]), causationId: null });
        } else if (sql.includes("'FREE_THROW_ENTITLEMENT_CREATED'")) {
          events.push({ eventId: String(params[0]), seqNo: Number(params[2]), eventType: "FREE_THROW_ENTITLEMENT_CREATED", payload: JSON.parse(String(params[3])), correlationId: String(params[10]), causationId: String(params[11]) });
        } else if (sql.includes("'PLAY_RESUMPTION_DECLARED'")) {
          events.push({ eventId: String(params[0]), seqNo: Number(params[2]), eventType: "PLAY_RESUMPTION_DECLARED", payload: JSON.parse(String(params[3])), correlationId: String(params[10]), causationId: String(params[11]) });
        } else {
          events.push({ eventId: String(params[0]), seqNo: Number(params[2]), eventType: String(params[3]), payload: JSON.parse(String(params[4])), correlationId: String(params[11]), causationId: null });
        }
        return [{ affectedRows: 1 }, []];
      }

      if (sql.includes("UPDATE match_streams SET last_seq_no")) {
        currentSeq = Number(params[0]);
        return [{ affectedRows: 1 }, []];
      }

      if (sql.includes("UPDATE match_projections SET projection_data")) {
        projection = JSON.parse(String(params[0])) as ScoreboardProjection;
        return [{ affectedRows: 1 }, []];
      }

      if (sql.includes("INSERT INTO command_deduplication")) {
        commandResults.set(`${params[1]}:${params[0]}`, {
          request_hash: String(params[3]),
          result: JSON.parse(String(params[4]))
        });
        return [{ affectedRows: 1 }, []];
      }

      if (sql.includes("FROM matches m")) {
        return [[{
          match_id: matchId,
          match_status: projection.status,
          projection_data: JSON.stringify(projection),
          last_event_seq: currentSeq,
          home_team_id: homeTeamId,
          home_team_name: "HOME",
          away_team_id: awayTeamId,
          away_team_name: "AWAY",
          updated_at: new Date("2026-07-02T10:00:00.000Z")
        }], []];
      }

      return [{ affectedRows: 1 }, []];
    }
  };

  return {
    events,
    players,
    roster,
    rollback,
    commit,
    get commandResultCount() {
      return commandResults.size;
    },
    get projection() {
      return projection;
    },
    pool: {
      getConnection: vi.fn().mockResolvedValue(connection)
    }
  };
}

function seedSupportedOnCourtFive(
  roster: ReturnType<typeof createRosterPool>["roster"],
  playerId: string
) {
  const target = roster.find((entry) => entry.player_id === playerId);
  if (!target) throw new Error(`Missing roster target ${playerId}`);
  target.roster_status = "ACTIVE";
  target.is_starter = 1;
  for (let index = 0; index < 4; index += 1) {
    roster.push({
      ...target,
      roster_player_id: `55555555-5555-4555-8555-55555555555${index}`,
      player_id: `66666666-6666-4666-8666-66666666666${index}`,
      display_name_snapshot: `On-court teammate ${index + 1}`,
      jersey_number_snapshot: String(index + 8),
      is_captain: 0
    });
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete process.env.AUTH_TEST_DISABLE_CSRF;
});

describe("alpha roster and player management", () => {
  it("lets ADMIN create players and assign them to HOME/AWAY match rosters", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createRosterPool();
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const created = await app.inject({
        method: "POST",
        url: `/api/v1/teams/${homeTeamId}/players`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { playerId: homePlayerId, displayName: "Narin Guard", jerseyNumber: "7", position: "GUARD" }
      });
      expect(created.statusCode, created.body).toBe(201);
      expect(created.json()).toMatchObject({
        ok: true,
        data: { player: { playerId: homePlayerId, teamId: homeTeamId, displayName: "Narin Guard", position: "GUARD" } }
      });

      const assigned = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/rosters/HOME/players`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { playerId: homePlayerId }
      });
      expect(assigned.statusCode).toBe(201);

      const rosters = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/rosters`,
        headers: { "x-dev-user-role": "ADMIN" }
      });
      expect(rosters.statusCode).toBe(200);
      expect(rosters.json()).toMatchObject({
        ok: true,
        data: {
          rosters: {
            HOME: [{ playerId: homePlayerId, displayNameSnapshot: "Narin Guard", jerseyNumberSnapshot: "7" }],
            AWAY: []
          }
        }
      });
    } finally {
      await app.close();
    }
  });

  it("rejects wrong-side roster assignment and non-admin mutation safely", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createRosterPool();
    fake.players.set(awayPlayerId, {
      player_id: awayPlayerId,
      team_id: awayTeamId,
      display_name: "Away Forward",
      jersey_number: "12",
      status: "ACTIVE",
      metadata: { position: "FORWARD" }
    });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const scorerCreate = await app.inject({
        method: "POST",
        url: `/api/v1/teams/${homeTeamId}/players`,
        headers: { "x-dev-user-role": "SCORER", "x-dev-match-ids": matchId },
        payload: { displayName: "Blocked", jerseyNumber: "1", position: "GUARD" }
      });
      expect(scorerCreate.statusCode).toBe(403);

      const wrongSide = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/rosters/HOME/players`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { playerId: awayPlayerId }
      });
      expect(wrongSide.statusCode).toBe(422);
      expect(wrongSide.json()).toMatchObject({ error: { reasonCode: "VALIDATION_ERROR" } });
    } finally {
      await app.close();
    }
  });

  it("requires roster membership before player foul and snapshots player identity in events", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createRosterPool();
    fake.players.set(homePlayerId, {
      player_id: homePlayerId,
      team_id: homeTeamId,
      display_name: "Narin Guard",
      jersey_number: "7",
      status: "ACTIVE",
      metadata: { position: "GUARD" }
    });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const rejected = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/foul/player/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: command("22222222-2222-4222-8222-222222222221", {
          teamSide: "HOME",
          playerId: homePlayerId,
          foulType: "PERSONAL",
          reason: null
        })
      });
      expect(rejected.statusCode).toBe(200);
      expect(rejected.json()).toMatchObject({ status: "REJECTED", reasonCode: "VALIDATION_ERROR" });

      await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/rosters/HOME/players`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { playerId: homePlayerId }
      });

      const accepted = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/foul/player/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: command("22222222-2222-4222-8222-222222222222", {
          teamSide: "HOME",
          playerId: homePlayerId,
          foulType: "PERSONAL",
          reason: null
        })
      });
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json()).toMatchObject({ status: "ACCEPTED" });
      expect(fake.events.at(-1)).toMatchObject({
        eventType: "PLAYER_FOUL_ADDED",
        payload: {
          playerId: homePlayerId,
          playerName: "Narin Guard",
          jerseyNumber: "7"
        }
      });
    } finally {
      await app.close();
    }
  });

  it("records the isolated player technical foul as one foul fact plus two atomic consequence events", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createRosterPool({ initialStatus: "LIVE" });
    fake.players.set(homePlayerId, {
      player_id: homePlayerId,
      team_id: homeTeamId,
      display_name: "Narin Guard",
      jersey_number: "7",
      status: "ACTIVE",
      metadata: { position: "GUARD" }
    });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/rosters/HOME/players`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { playerId: homePlayerId }
      });
      const unsupportedLineup = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/foul/player/technical`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: command("22222222-2222-4222-8222-222222222228", { playerId: homePlayerId })
      });
      expect(unsupportedLineup.json()).toMatchObject({
        status: "REJECTED",
        reasonCode: "VALIDATION_ERROR",
        currentSeq: 0
      });
      expect(fake.events).toEqual([]);

      seedSupportedOnCourtFive(fake.roster, homePlayerId);

      const envelope = command("22222222-2222-4222-8222-222222222229", { playerId: homePlayerId });
      const accepted = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/foul/player/technical`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: envelope
      });

      expect(accepted.statusCode, accepted.body).toBe(200);
      expect(accepted.json()).toMatchObject({
        status: "ACCEPTED",
        currentSeq: 3,
        appendedEvents: [
          { seqNo: 1, eventType: "PLAYER_FOUL_ADDED" },
          { seqNo: 2, eventType: "FREE_THROW_ENTITLEMENT_CREATED" },
          { seqNo: 3, eventType: "PLAY_RESUMPTION_DECLARED" }
        ]
      });
      expect(fake.events.map((event) => event.eventType)).toEqual([
        "PLAYER_FOUL_ADDED",
        "FREE_THROW_ENTITLEMENT_CREATED",
        "PLAY_RESUMPTION_DECLARED"
      ]);
      expect(fake.events.map((event) => event.seqNo)).toEqual([1, 2, 3]);
      expect(fake.events.every((event) => event.correlationId === envelope.correlationId)).toBe(true);
      expect(fake.events[1]!.causationId).toBe(fake.events[0]!.eventId);
      expect(fake.events[2]!.causationId).toBe(fake.events[1]!.eventId);
      expect(fake.events[0]!.payload).toMatchObject({
        playerId: homePlayerId,
        teamSide: "HOME",
        foulType: "TECHNICAL"
      });
      expect(fake.events[1]!.payload).toMatchObject({ attempts: 1, awardedTo: "AWAY" });
      expect(fake.events[2]!.payload).toMatchObject({ mode: "RESUME_INTERRUPTED_PLAY" });
      expect(fake.projection).toMatchObject({
        currentSeq: 3,
        homeScore: 0,
        awayScore: 0,
        teamFouls: { home: 1, away: 0 },
        playerFouls: [{ personalFouls: 0, technicalFouls: 1, totalTowardLimit: 1 }]
      });

      const retry = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/foul/player/technical`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: envelope
      });
      expect(retry.json()).toMatchObject({
        status: "DUPLICATE_ACCEPTED",
        currentSeq: 3,
        appendedEvents: [
          { seqNo: 1 },
          { seqNo: 2 },
          { seqNo: 3 }
        ]
      });
      expect(fake.events).toHaveLength(3);

      const identityCollision = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/foul/player/technical`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { ...envelope, payload: { playerId: awayPlayerId } }
      });
      expect(identityCollision.json()).toMatchObject({
        status: "REJECTED",
        reasonCode: "VALIDATION_ERROR",
        currentSeq: 3
      });
      expect(fake.events).toHaveLength(3);

      const repeatedTechnical = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/foul/player/technical`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          ...command("22222222-2222-4222-8222-222222222231", { playerId: homePlayerId }),
          expectedSeq: 3
        }
      });
      expect(repeatedTechnical.json()).toMatchObject({
        status: "REJECTED",
        reasonCode: "VALIDATION_ERROR",
        currentSeq: 3
      });
      expect(fake.events).toHaveLength(3);
    } finally {
      await app.close();
    }
  });

  it("rechecks command identity after the stream lock and returns the concurrent accepted range", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const concurrentCommand = command("22222222-2222-4222-8222-222222222231", { playerId: homePlayerId });
    const originalResult = {
      status: "ACCEPTED",
      commandId: concurrentCommand.commandId,
      matchId,
      currentSeq: 3,
      appendedEvents: [
        { eventId: "77777777-7777-4777-8777-777777777771", seqNo: 1, eventType: "PLAYER_FOUL_ADDED" },
        { eventId: "77777777-7777-4777-8777-777777777772", seqNo: 2, eventType: "FREE_THROW_ENTITLEMENT_CREATED" },
        { eventId: "77777777-7777-4777-8777-777777777773", seqNo: 3, eventType: "PLAY_RESUMPTION_DECLARED" }
      ],
      reasonCode: null,
      message: null
    };
    const fake = createRosterPool({
      delayedDuplicate: { command: concurrentCommand, result: originalResult },
      initialStatus: "LIVE"
    });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/foul/player/technical`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: concurrentCommand
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ...originalResult, status: "DUPLICATE_ACCEPTED" });
      expect(fake.events).toEqual([]);
      expect(fake.rollback).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it.each(["FREE_THROW_ENTITLEMENT_CREATED", "PLAY_RESUMPTION_DECLARED"])(
    "rolls back the entire technical-foul bundle when %s cannot be inserted",
    async (failedEventType) => {
      process.env.AUTH_TEST_DISABLE_CSRF = "true";
      const fake = createRosterPool({ failOnEventType: failedEventType, initialStatus: "LIVE" });
      fake.players.set(homePlayerId, {
        player_id: homePlayerId,
        team_id: homeTeamId,
        display_name: "Narin Guard",
        jersey_number: "7",
        status: "ACTIVE",
        metadata: { position: "GUARD" }
      });
      const app = buildApiApp({ pool: fake.pool as never });

      try {
        await app.inject({
          method: "POST",
          url: `/api/v1/matches/${matchId}/rosters/HOME/players`,
          headers: { "x-dev-user-role": "ADMIN" },
          payload: { playerId: homePlayerId }
        });
        seedSupportedOnCourtFive(fake.roster, homePlayerId);
        fake.commit.mockClear();
        fake.rollback.mockClear();
        const response = await app.inject({
          method: "POST",
          url: `/api/v1/matches/${matchId}/commands/foul/player/technical`,
          headers: { "x-dev-user-role": "ADMIN" },
          payload: command("22222222-2222-4222-8222-222222222230", { playerId: homePlayerId })
        });

        expect(response.statusCode).toBe(500);
        expect(fake.rollback).toHaveBeenCalledTimes(1);
        expect(fake.commit).not.toHaveBeenCalled();
        expect(fake.events).toEqual([]);
        expect(fake.commandResultCount).toBe(0);
        expect(fake.projection).toMatchObject({ currentSeq: 0, teamFouls: { home: 0, away: 0 }, playerFouls: [] });
      } finally {
        await app.close();
      }
    }
  );

  it("keeps team-only scoring while allowing optional roster player attribution", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createRosterPool();
    fake.players.set(homePlayerId, {
      player_id: homePlayerId,
      team_id: homeTeamId,
      display_name: "Narin Guard",
      jersey_number: "7",
      status: "ACTIVE",
      metadata: { position: "GUARD" }
    });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const teamOnly = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/score/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: command("22222222-2222-4222-8222-222222222223", {
          teamSide: "HOME",
          points: 2,
          playerId: null,
          periodNumber: 1,
          gameClockRemainingMs: 600000,
          note: null
        })
      });
      expect(teamOnly.statusCode, teamOnly.body).toBe(200);
      expect(teamOnly.json()).toMatchObject({
        status: "ACCEPTED",
        projection: {
          currentSeq: 1,
          homeScore: 2,
          awayScore: 0
        }
      });
      expect(fake.events.at(-1)).toMatchObject({ eventType: "SCORE_ADDED", payload: { playerId: null } });

      await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/rosters/HOME/players`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { playerId: homePlayerId }
      });

      const attributed = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/score/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: {
          ...command("22222222-2222-4222-8222-222222222224", {
          teamSide: "HOME",
          points: 3,
          playerId: homePlayerId,
          periodNumber: 1,
          gameClockRemainingMs: 600000,
          note: null
          }),
          expectedSeq: 1
        }
      });
      expect(attributed.statusCode).toBe(200);
      expect(attributed.json()).toMatchObject({
        status: "ACCEPTED",
        projection: {
          currentSeq: 2,
          homeScore: 5,
          awayScore: 0
        }
      });
      expect(fake.events.at(-1)).toMatchObject({
        eventType: "SCORE_ADDED",
        payload: {
          playerId: homePlayerId,
          playerNameSnapshot: "Narin Guard",
          jerseyNumberSnapshot: "7"
        }
      });
    } finally {
      await app.close();
    }
  });

  it("rejects invalid score attribution without appending match events", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createRosterPool();
    fake.players.set(homePlayerId, {
      player_id: homePlayerId,
      team_id: homeTeamId,
      display_name: "Narin Guard",
      jersey_number: "7",
      status: "ACTIVE",
      metadata: { position: "GUARD" }
    });
    fake.players.set(awayPlayerId, {
      player_id: awayPlayerId,
      team_id: awayTeamId,
      display_name: "Away Forward",
      jersey_number: "9",
      status: "ACTIVE",
      metadata: { position: "FORWARD" }
    });
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/rosters/AWAY/players`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: { playerId: awayPlayerId }
      });

      const wrongSide = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/score/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: command("22222222-2222-4222-8222-222222222225", {
          teamSide: "HOME",
          points: 2,
          playerId: awayPlayerId,
          periodNumber: 1,
          gameClockRemainingMs: 600000,
          note: null
        })
      });
      expect(wrongSide.statusCode).toBe(200);
      expect(wrongSide.json()).toMatchObject({ status: "REJECTED", reasonCode: "VALIDATION_ERROR" });
      expect(fake.events).toHaveLength(0);

      const notInRoster = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/score/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: command("22222222-2222-4222-8222-222222222226", {
          teamSide: "HOME",
          points: 2,
          playerId: homePlayerId,
          periodNumber: 1,
          gameClockRemainingMs: 600000,
          note: null
        })
      });
      expect(notInRoster.statusCode).toBe(200);
      expect(notInRoster.json()).toMatchObject({ status: "REJECTED", reasonCode: "VALIDATION_ERROR" });
      expect(fake.events).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("keeps duplicate score commands idempotent and stale expectedSeq non-mutating", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createRosterPool();
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const duplicateCommand = command("22222222-2222-4222-8222-222222222227", {
        teamSide: "HOME",
        points: 1,
        playerId: null,
        periodNumber: 1,
        gameClockRemainingMs: 600000,
        note: null
      });
      const accepted = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/score/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: duplicateCommand
      });
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json()).toMatchObject({ status: "ACCEPTED", currentSeq: 1 });

      const duplicate = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/score/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: duplicateCommand
      });
      expect(duplicate.statusCode).toBe(200);
      expect(duplicate.json()).toMatchObject({ status: "DUPLICATE_ACCEPTED", currentSeq: 1 });
      expect(fake.events).toHaveLength(1);

      const stale = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/commands/score/add`,
        headers: { "x-dev-user-role": "ADMIN" },
        payload: command("22222222-2222-4222-8222-222222222228", {
          teamSide: "AWAY",
          points: 3,
          playerId: null,
          periodNumber: 1,
          gameClockRemainingMs: 600000,
          note: null
        })
      });
      expect(stale.statusCode).toBe(200);
      expect(stale.json()).toMatchObject({ status: "SYNC_REQUIRED", currentSeq: 1 });
      expect(fake.events).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
});
