import { describe, expect, it } from "vitest";
import { buildApiApp } from "../../apps/api/src/app";

const matchId = "11111111-1111-4111-8111-111111111111";

describe("RM-06 assistant-coach designation", () => {
  it("is a protected create-only setup endpoint", async () => {
    const app = buildApiApp({ pool: { getConnection: async () => { throw new Error("auth must run first"); } } as never });
    try {
      const response = await app.inject({ method: "POST", url: `/api/v1/matches/${matchId}/assistant-coach-designation`, payload: { commandId: "22222222-2222-4222-8222-222222222222", matchId, expectedSeq: 0, correlationId: "33333333-3333-4333-8333-333333333333", clientTimestamp: "2026-07-30T00:00:00.000Z", payload: { teamSide: "HOME", displayName: "Assistant Coach" } } });
      expect(response.statusCode).toBe(401);
    } finally { await app.close(); }
  });
});
