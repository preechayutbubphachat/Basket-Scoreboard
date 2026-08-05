import { describe, expect, it } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";
import { setMatchHeadCoachDesignationCommand } from "../../apps/api/src/matchEventStore/setupCommands";
import { vi } from "vitest";

const matchId = "11111111-1111-4111-8111-111111111111";

describe("RM-06 head-coach designation route", () => {
  it("exists as a protected route and rejects an anonymous designation command", async () => {
    const app = buildApiApp({
      pool: { getConnection: async () => { throw new Error("route auth should run before database access"); } } as never
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/matches/${matchId}/head-coach-designation`,
        payload: {
          commandId: "22222222-2222-4222-8222-222222222222",
          matchId,
          expectedSeq: 0,
          correlationId: "33333333-3333-4333-8333-333333333333",
          clientTimestamp: "2026-07-29T00:00:00.000Z",
          payload: { teamSide: "HOME", displayName: "Head Coach" }
        }
      });

      expect(response.statusCode, response.body).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("atomically audits and deduplicates a designation without appending a match event", async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    let designationCreated = false;
    const connection = {
      beginTransaction: vi.fn(async () => undefined),
      commit: vi.fn(async () => undefined),
      rollback: vi.fn(async () => undefined),
      release: vi.fn(),
      async query(sql: string, params: unknown[] = []) {
        queries.push({ sql, params });
        if (sql.includes("FROM command_deduplication")) return [[], []];
        if (sql.includes("SELECT last_seq_no FROM match_streams")) return [[{ last_seq_no: 4 }], []];
        if (sql.includes("FROM match_head_coach_designations")) {
          return designationCreated ? [[{
            designation_id: "44444444-4444-4444-8444-444444444444",
            match_id: matchId,
            team_side: "HOME",
            display_name: "Head Coach",
            external_reference: null,
            designated_at: new Date("2026-07-29T00:00:00.000Z"),
            designated_by: "55555555-5555-4555-8555-555555555555"
          }], []] : [[], []];
        }
        if (sql.includes("INSERT INTO match_head_coach_designations")) designationCreated = true;
        return [{ affectedRows: 1 }, []];
      }
    };
    const result = await setMatchHeadCoachDesignationCommand({
      pool: { getConnection: vi.fn().mockResolvedValue(connection) } as never,
      command: {
        commandId: "22222222-2222-4222-8222-222222222222",
        matchId,
        expectedSeq: 4,
        correlationId: "33333333-3333-4333-8333-333333333333",
        clientTimestamp: "2026-07-29T00:00:00.000Z",
        payload: { teamSide: "HOME", displayName: "Head Coach" }
      },
      user: { userId: "55555555-5555-4555-8555-555555555555", role: "ADMIN", deviceId: "test-device" } as never
    });

    expect(result).toMatchObject({ status: "ACCEPTED", currentSeq: 4, appendedEvents: [] });
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(queries.some(({ sql }) => sql.includes("INSERT INTO match_head_coach_designations"))).toBe(true);
    expect(queries.some(({ sql }) => sql.includes("INSERT INTO audit_logs"))).toBe(true);
    expect(queries.some(({ sql }) => sql.includes("INSERT INTO command_deduplication"))).toBe(true);
    expect(queries.some(({ sql }) => sql.includes("INSERT INTO match_events"))).toBe(false);
  });
});
