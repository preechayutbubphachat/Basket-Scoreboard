import type { Pool } from "mysql2/promise";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RosterBaselineRecoveryResult } from "../../apps/api/src/rosters/rosterBaselineService";
import { getReadinessForMatches } from "../../apps/api/src/matchReadiness/matchReadinessService";

const { recoverBaseline } = vi.hoisted(() => ({
  recoverBaseline: vi.fn()
}));

vi.mock("../../apps/api/src/rosters/rosterBaselineService", () => ({
  loadAuthoritativeRosterBaseline: recoverBaseline
}));

type QueryResult = [unknown[], unknown[]];

type QueryConnection = {
  query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
  release: () => void;
};

function createPool(options: { baselineEvents: unknown[]; legacyRoster: unknown[]; legacyConfirmations: unknown[] }) {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const connection: QueryConnection = {
    async query(sql, params) {
      queries.push({ sql, params });
      const normalized = sql.replace(/\s+/g, " ").toUpperCase();
      if (normalized.includes("FROM MATCHES")) {
        const ids = Array.isArray(params?.[0]) ? params[0] as string[] : [String(params?.[0] ?? "")];
        return [ids.map((match_id) => ({ match_id, rule_profile_id: "FIBA_2024" })), []];
      }
      if (normalized.includes("FROM MATCH_EVENTS")) return [options.baselineEvents, []];
      if (normalized.includes("FROM MATCH_OFFICIALS")) return [[], []];
      if (normalized.includes("FROM MATCH_ROSTER_PLAYERS")) return [options.legacyRoster, []];
      if (normalized.includes("FROM MATCH_ROSTER_CONFIRMATIONS")) return [options.legacyConfirmations, []];
      throw new Error(`Unexpected readiness query: ${sql}`);
    },
    release() {}
  };
  return {
    pool: {
      async getConnection() {
        return connection;
      }
    } as unknown as Pool,
    queries
  };
}

function recoveryFor(state: string, effective: boolean, starterCount: number, confirmed: boolean): RosterBaselineRecoveryResult {
  return {
    projection: {
      members: Array.from({ length: Math.max(starterCount, 1) }, (_, index) => ({
        rosterPlayerId: `roster-${index}`,
        matchId: "match-divergence",
        teamSide: "HOME",
        teamId: "team",
        playerId: `player-${index}`,
        displayNameSnapshot: `Private Player ${index}`,
        jerseyNumberSnapshot: String(index + 1),
        position: "GUARD",
        rosterStatus: "ACTIVE",
        isStarter: index < starterCount,
        isCaptain: index === 0
      })),
      readiness: {
        state,
        effective,
        starterCount
      },
      confirmation: {
        effective: confirmed
      }
    }
  } as unknown as RosterBaselineRecoveryResult;
}

describe("RM-08 authoritative readiness divergence", () => {
  beforeEach(() => {
    recoverBaseline.mockReset();
  });

  it("event-backed NOT_EVALUATED and STARTERS_INCOMPLETE win over legacy READY data", async () => {
    const { pool, queries } = createPool({
      baselineEvents: [
        { match_id: "match-divergence", team_side: "HOME" },
        { match_id: "match-divergence", team_side: "AWAY" }
      ],
      legacyRoster: [
        { match_id: "match-divergence", team_side: "HOME", player_count: 5, starter_count: 5 },
        { match_id: "match-divergence", team_side: "AWAY", player_count: 5, starter_count: 5 }
      ],
      legacyConfirmations: [
        { match_id: "match-divergence", team_side: "HOME" },
        { match_id: "match-divergence", team_side: "AWAY" }
      ]
    });
    recoverBaseline
      .mockResolvedValueOnce(recoveryFor("NOT_EVALUATED", false, 5, true))
      .mockResolvedValueOnce(recoveryFor("STARTERS_INCOMPLETE", false, 4, true));

    const readiness = await getReadinessForMatches(pool, [{ matchId: "match-divergence", status: "SCHEDULED" }]);
    const result = readiness.get("match-divergence");

    expect(result?.authoritativeBaseline.source).toBe("EVENT_BACKED_BASELINE");
    expect(result?.authoritativeBaseline.home).toMatchObject({
      initialized: true,
      state: "NOT_EVALUATED",
      effective: false,
      blockingCode: "NOT_EVALUATED"
    });
    expect(result?.authoritativeBaseline.away).toMatchObject({
      initialized: true,
      state: "STARTERS_INCOMPLETE",
      effective: false,
      blockingCode: "STARTERS_INCOMPLETE"
    });
    expect(result?.lineup.state).toBe("INCOMPLETE");

    const legacyQueries = queries.filter(({ sql }) => /match_roster_(players|confirmations)/i.test(sql));
    expect(legacyQueries).toHaveLength(2);
    expect(legacyQueries.every(({ params }) => JSON.stringify(params).includes("__NO_LEGACY_COMPATIBILITY_SCOPE__"))).toBe(true);
  });

  it("uses the bounded legacy compatibility path only when baseline events are absent", async () => {
    const { pool, queries } = createPool({
      baselineEvents: [],
      legacyRoster: [
        { match_id: "match-legacy", team_side: "HOME", player_count: 5, starter_count: 5 },
        { match_id: "match-legacy", team_side: "AWAY", player_count: 5, starter_count: 5 }
      ],
      legacyConfirmations: [
        { match_id: "match-legacy", team_side: "HOME" },
        { match_id: "match-legacy", team_side: "AWAY" }
      ]
    });

    const readiness = await getReadinessForMatches(pool, [{ matchId: "match-legacy", status: "SCHEDULED" }]);
    const result = readiness.get("match-legacy");

    expect(recoverBaseline).not.toHaveBeenCalled();
    expect(result?.authoritativeBaseline.source).toBe("LEGACY_COMPATIBILITY_PATH");
    expect(result?.authoritativeBaseline.home).toMatchObject({ initialized: false, state: "NOT_EVALUATED", effective: false, blockingCode: "NOT_EVALUATED" });
    expect(result?.authoritativeBaseline.away).toMatchObject({ initialized: false, state: "NOT_EVALUATED", effective: false, blockingCode: "NOT_EVALUATED" });
    expect(result?.lineup.state).toBe("INCOMPLETE");

    const legacyQueries = queries.filter(({ sql }) => /match_roster_(players|confirmations)/i.test(sql));
    expect(legacyQueries.every(({ params }) => JSON.stringify(params).includes("match-legacy"))).toBe(true);
  });
});
