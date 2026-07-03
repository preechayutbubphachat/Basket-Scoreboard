import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

const matchId = "11111111-1111-4111-8111-111111111111";
const finishedMatchId = "11111111-1111-4111-8111-111111111112";
const homeTeamId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const awayTeamId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type TeamSide = "HOME" | "AWAY";
type RosterRow = {
  roster_player_id: string;
  match_id: string;
  team_side: TeamSide;
  team_id: string;
  player_id: string;
  display_name_snapshot: string;
  jersey_number_snapshot: string | null;
  position: "GUARD" | "FORWARD" | "CENTER" | "UNKNOWN";
  roster_status: "ACTIVE" | "BENCH" | "INACTIVE";
  is_starter: 0 | 1;
  is_captain: 0 | 1;
};

function rosterPlayer(teamSide: TeamSide, index: number, status: RosterRow["roster_status"] = "ACTIVE"): RosterRow {
  const prefix = teamSide === "HOME" ? "aaaa" : "bbbb";
  return {
    roster_player_id: `${prefix}${index.toString().padStart(8, "0")}-1111-4111-8111-111111111111`,
    match_id: matchId,
    team_side: teamSide,
    team_id: teamSide === "HOME" ? homeTeamId : awayTeamId,
    player_id: `${prefix}${index.toString().padStart(8, "0")}-2222-4222-8222-222222222222`,
    display_name_snapshot: `${teamSide} Player ${index}`,
    jersey_number_snapshot: String(index),
    position: "UNKNOWN",
    roster_status: status,
    is_starter: 0,
    is_captain: 0
  };
}

function createLineupPool() {
  const roster: RosterRow[] = [
    ...Array.from({ length: 6 }, (_, index) => rosterPlayer("HOME", index + 1)),
    ...Array.from({ length: 5 }, (_, index) => rosterPlayer("AWAY", index + 1)),
    rosterPlayer("HOME", 7, "INACTIVE")
  ];
  const confirmations = new Map<TeamSide, { reason: string | null; confirmed_by_user_id: string | null }>();

  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes("SELECT match_id, home_team_id, away_team_id, status FROM matches WHERE match_id")) {
        const id = String(params[0]);
        if (id !== matchId && id !== finishedMatchId) return [[], []];
        return [[{
          match_id: id,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          status: id === finishedMatchId ? "FINISHED" : "READY"
        }], []];
      }

      if (sql.includes("FROM match_roster_players mrp") && sql.includes("ORDER BY")) {
        return [roster.filter((entry) => entry.match_id === params[0]), []];
      }

      if (sql.includes("FROM match_roster_players mrp") && sql.includes("mrp.match_id = ? AND mrp.team_side = ? AND mrp.player_id = ?")) {
        return [
          roster.filter((entry) => entry.match_id === params[0] && entry.team_side === params[1] && entry.player_id === params[2]),
          []
        ];
      }

      if (sql.includes("FROM match_roster_confirmations")) {
        return [[...confirmations.entries()].map(([teamSide, confirmation]) => ({ team_side: teamSide, ...confirmation })), []];
      }

      if (sql.includes("UPDATE match_roster_players SET is_starter = 1")) {
        const entry = roster.find((player) => player.match_id === params[0] && player.team_side === params[1] && player.player_id === params[2]);
        if (entry) entry.is_starter = 1;
        return [{ affectedRows: entry ? 1 : 0 }, []];
      }

      if (sql.includes("UPDATE match_roster_players SET is_starter = 0")) {
        const entry = roster.find((player) => player.match_id === params[0] && player.team_side === params[1] && player.player_id === params[2]);
        if (entry) entry.is_starter = 0;
        return [{ affectedRows: entry ? 1 : 0 }, []];
      }

      if (sql.includes("UPDATE match_roster_players SET is_captain = 0")) {
        roster
          .filter((player) => player.match_id === params[0] && player.team_side === params[1])
          .forEach((player) => {
            player.is_captain = 0;
          });
        return [{ affectedRows: 1 }, []];
      }

      if (sql.includes("UPDATE match_roster_players SET is_captain = 1")) {
        const entry = roster.find((player) => player.match_id === params[0] && player.team_side === params[1] && player.player_id === params[2]);
        if (entry) entry.is_captain = 1;
        return [{ affectedRows: entry ? 1 : 0 }, []];
      }

      if (sql.includes("INSERT INTO match_roster_confirmations")) {
        confirmations.set(String(params[2]) as TeamSide, {
          confirmed_by_user_id: String(params[3]),
          reason: params[4] === null ? null : String(params[4])
        });
        return [{ affectedRows: 1 }, []];
      }

      return [{ affectedRows: 1 }, []];
    }
  };

  return {
    roster,
    confirmations,
    pool: {
      getConnection: vi.fn().mockResolvedValue(connection)
    }
  };
}

function headers(role = "ADMIN") {
  return { "x-dev-user-role": role };
}

afterEach(() => {
  delete process.env.AUTH_TEST_DISABLE_CSRF;
});

describe("alpha lineup and starter management", () => {
  it("lets ADMIN read lineup readiness and returns safe empty confirmation state", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createLineupPool();
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/lineup`,
        headers: headers()
      });

      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        data: {
          matchId,
          home: { teamId: homeTeamId, readiness: { playerCount: 7, starterCount: 0, captainSet: false, confirmed: false, ready: false } },
          away: { teamId: awayTeamId, readiness: { playerCount: 5, starterCount: 0, captainSet: false, confirmed: false, ready: false } }
        }
      });
    } finally {
      await app.close();
    }
  });

  it("selects and removes starters while enforcing the Alpha five-starter limit", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createLineupPool();
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      for (const player of fake.roster.filter((entry) => entry.team_side === "HOME" && entry.roster_status !== "INACTIVE").slice(0, 5)) {
        const response = await app.inject({
          method: "POST",
          url: `/api/v1/matches/${matchId}/lineup/HOME/starters/${player.player_id}`,
          headers: headers(),
          payload: { expectedSeq: null, commandId: null, reason: null }
        });
        expect(response.statusCode, response.body).toBe(200);
      }

      const tooMany = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/lineup/HOME/starters/${fake.roster.find((entry) => entry.team_side === "HOME" && entry.jersey_number_snapshot === "6")!.player_id}`,
        headers: headers(),
        payload: { expectedSeq: null, commandId: null, reason: null }
      });
      expect(tooMany.statusCode).toBe(422);
      expect(tooMany.json()).toMatchObject({ error: { reasonCode: "VALIDATION_ERROR" } });

      const removed = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/lineup/HOME/starters/${fake.roster[0].player_id}/remove`,
        headers: headers(),
        payload: { expectedSeq: null, commandId: null, reason: null }
      });
      expect(removed.statusCode).toBe(200);
      expect(removed.json()).toMatchObject({ ok: true, data: { home: { readiness: { starterCount: 4 } } } });
    } finally {
      await app.close();
    }
  });

  it("rejects wrong-side, missing, inactive, and finished-match lineup mutations safely", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createLineupPool();
    const app = buildApiApp({ pool: fake.pool as never });
    const awayPlayer = fake.roster.find((entry) => entry.team_side === "AWAY")!;
    const inactivePlayer = fake.roster.find((entry) => entry.roster_status === "INACTIVE")!;

    try {
      for (const [url, expectedStatus] of [
        [`/api/v1/matches/${matchId}/lineup/HOME/starters/${awayPlayer.player_id}`, 404],
        [`/api/v1/matches/${matchId}/lineup/HOME/starters/99999999-9999-4999-8999-999999999999`, 404],
        [`/api/v1/matches/${matchId}/lineup/HOME/starters/${inactivePlayer.player_id}`, 422],
        [`/api/v1/matches/${finishedMatchId}/lineup/HOME/starters/${fake.roster[0].player_id}`, 422]
      ] as const) {
        const response = await app.inject({
          method: "POST",
          url,
          headers: headers(),
          payload: { expectedSeq: null, commandId: null, reason: null }
        });
        expect(response.statusCode, response.body).toBe(expectedStatus);
      }
    } finally {
      await app.close();
    }
  });

  it("sets one captain per side and confirms only valid five-starter rosters", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createLineupPool();
    const app = buildApiApp({ pool: fake.pool as never });
    const homePlayers = fake.roster.filter((entry) => entry.team_side === "HOME" && entry.roster_status !== "INACTIVE");

    try {
      const tooEarly = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/lineup/HOME/confirm`,
        headers: headers(),
        payload: { expectedSeq: null, commandId: null, reason: "alpha lineup" }
      });
      expect(tooEarly.statusCode).toBe(422);

      for (const player of homePlayers.slice(0, 5)) {
        await app.inject({
          method: "POST",
          url: `/api/v1/matches/${matchId}/lineup/HOME/starters/${player.player_id}`,
          headers: headers(),
          payload: { expectedSeq: null, commandId: null, reason: null }
        });
      }

      const firstCaptain = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/lineup/HOME/captain/${homePlayers[0].player_id}`,
        headers: headers(),
        payload: { expectedSeq: null, commandId: null, reason: null }
      });
      expect(firstCaptain.statusCode).toBe(200);

      const secondCaptain = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/lineup/HOME/captain/${homePlayers[1].player_id}`,
        headers: headers(),
        payload: { expectedSeq: null, commandId: null, reason: null }
      });
      expect(secondCaptain.statusCode).toBe(200);
      expect(fake.roster.filter((entry) => entry.team_side === "HOME" && entry.is_captain === 1)).toHaveLength(1);

      const confirmed = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/lineup/HOME/confirm`,
        headers: headers(),
        payload: { expectedSeq: null, commandId: null, reason: "alpha lineup" }
      });
      expect(confirmed.statusCode, confirmed.body).toBe(200);
      expect(confirmed.json()).toMatchObject({
        ok: true,
        data: {
          home: { readiness: { starterCount: 5, captainSet: true, confirmed: true, ready: true } }
        }
      });
    } finally {
      await app.close();
    }
  });

  it("extends roster reads with readiness and keeps mutations admin-only", async () => {
    process.env.AUTH_TEST_DISABLE_CSRF = "true";
    const fake = createLineupPool();
    const app = buildApiApp({ pool: fake.pool as never });

    try {
      const viewerMutation = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/lineup/HOME/starters/${fake.roster[0].player_id}`,
        headers: headers("VIEWER"),
        payload: { expectedSeq: null, commandId: null, reason: null }
      });
      expect(viewerMutation.statusCode).toBe(403);

      const roster = await app.inject({
        method: "GET",
        url: `/api/v1/matches/${matchId}/rosters`,
        headers: headers()
      });
      expect(roster.statusCode, roster.body).toBe(200);
      expect(roster.json()).toMatchObject({
        ok: true,
        data: {
          readiness: {
            home: { playerCount: 7, starterCount: 0, confirmed: false },
            away: { playerCount: 5, starterCount: 0, confirmed: false }
          }
        }
      });
    } finally {
      await app.close();
    }
  });
});
