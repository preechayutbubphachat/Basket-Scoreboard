import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";
import {
  createInitialScoreboardProjection,
  type ScoreboardProjection
} from "../../apps/api/src/matchEventStore/projection";

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

function createRosterPool() {
  let projection: ScoreboardProjection = createInitialScoreboardProjection(matchId);
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
  const events: Array<{ eventType: string; payload: unknown }> = [];

  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
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

      if (sql.includes("FROM match_roster_players mrp") && sql.includes("mrp.player_id = ?")) {
        return [roster.filter((entry) => entry.match_id === params[0] && entry.player_id === params[1]), []];
      }

      if (sql.includes("FROM command_deduplication")) {
        return [[], []];
      }

      if (sql.includes("SELECT last_seq_no FROM match_streams")) {
        return [[{ last_seq_no: currentSeq }], []];
      }

      if (sql.includes("SELECT projection_data, last_event_seq FROM match_projections")) {
        return [[{ projection_data: JSON.stringify(projection), last_event_seq: currentSeq }], []];
      }

      if (sql.includes("INSERT INTO match_events")) {
        if (sql.includes("'SCORE_ADDED'")) {
          events.push({ eventType: "SCORE_ADDED", payload: JSON.parse(String(params[3])) });
        } else {
          events.push({ eventType: String(params[3]), payload: JSON.parse(String(params[4])) });
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
    pool: {
      getConnection: vi.fn().mockResolvedValue(connection)
    }
  };
}

afterEach(() => {
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
      expect(teamOnly.json()).toMatchObject({ status: "ACCEPTED" });
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
      expect(attributed.json()).toMatchObject({ status: "ACCEPTED" });
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
});
