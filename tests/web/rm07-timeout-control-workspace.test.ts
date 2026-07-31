import { describe, expect, it, vi } from "vitest";
import { createApiClient, type FetchLike } from "../../apps/web/src/lib/apiClient";
import {
  buildTimeoutControlState,
  buildTimeoutGrantPayload,
  buildTimeoutOpportunityPresentation
} from "../../apps/web/src/lib/timeoutControl";
import {
  createInitialScoreboardProjection,
  type TimeoutOpportunityProjection
} from "../../apps/api/src/matchEventStore/projection";

const matchId = "11111111-1111-4111-8111-111111111111";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

describe("RM-07 timeout client authority boundary", () => {
  it("builds the grant request with teamSide as the only payload field", () => {
    const projection = { ...createInitialScoreboardProjection(matchId), currentSeq: 7 };

    expect(buildTimeoutGrantPayload(projection, "HOME")).toEqual({
      expectedSeq: 7,
      payload: { teamSide: "HOME" }
    });
  });

  it("sends the exact strict grant payload through the actual API client", async () => {
    const fetchImpl = vi.fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValueOnce(jsonResponse({
        status: "ACCEPTED",
        commandId: "22222222-2222-4222-8222-222222222222",
        matchId,
        currentSeq: 8,
        appendedEvents: [],
        reasonCode: null,
        message: null
      }));
    const api = createApiClient({ baseUrl: "/api/v1", fetchImpl });

    await api.grantTimeout(matchId, { expectedSeq: 7, payload: { teamSide: "AWAY" } });

    const request = fetchImpl.mock.calls[1]![1]!;
    const body = JSON.parse(String(request.body));
    expect(body.payload).toEqual({ teamSide: "AWAY" });
    expect(body.payload).not.toHaveProperty("requestedBy");
    expect(body.payload).not.toHaveProperty("durationMs");
    expect(body.payload).not.toHaveProperty("reason");
  });

  it("renders only authoritative opportunity and quota state without optimistic decrement", () => {
    const opportunity = {
      status: "OPEN",
      eligibleTeams: ["AWAY"],
      sourceEventId: "opportunity-1",
      sourceSeq: 8,
      sourceFactType: "DEAD_BALL_CONFIRMED",
      ruleProfileId: "FIBA_2024"
    } satisfies TimeoutOpportunityProjection;
    const projection = {
      currentSeq: 8,
      periodNumber: 4,
      timeouts: { home: { used: 3, remaining: 1 }, away: { used: 2, remaining: 2 } },
      timeoutOpportunity: opportunity
    };

    expect(buildTimeoutOpportunityPresentation(projection)).toEqual({
      status: "OPEN",
      eligibleTeams: "AWAY",
      lateQ4Restriction: "HOME restricted",
      quotas: {
        home: { used: 3, remaining: 1 },
        away: { used: 2, remaining: 2 }
      }
    });
    expect(projection.timeouts.home.remaining).toBe(1);
  });

  it.each([
    { status: "UNKNOWN", eligibleTeams: [], remaining: [1, 1], pending: false, canOperate: true, expected: [false, false] },
    { status: "CLOSED", eligibleTeams: [], remaining: [1, 1], pending: false, canOperate: true, expected: [false, false] },
    { status: "OPEN", eligibleTeams: ["HOME"], remaining: [1, 1], pending: false, canOperate: true, expected: [true, false] },
    { status: "OPEN", eligibleTeams: ["AWAY"], remaining: [1, 1], pending: false, canOperate: true, expected: [false, true] },
    { status: "OPEN", eligibleTeams: ["HOME", "AWAY"], remaining: [1, 1], pending: false, canOperate: true, expected: [true, true] },
    { status: "OPEN", eligibleTeams: ["HOME", "AWAY"], remaining: [0, 1], pending: false, canOperate: true, expected: [false, true] },
    { status: "OPEN", eligibleTeams: ["HOME", "AWAY"], remaining: [1, 0], pending: false, canOperate: true, expected: [true, false] },
    { status: "OPEN", eligibleTeams: ["HOME", "AWAY"], remaining: [1, 1], pending: true, canOperate: true, expected: [false, false] },
    { status: "OPEN", eligibleTeams: ["HOME", "AWAY"], remaining: [1, 1], pending: false, canOperate: false, expected: [false, false] }
  ] as const)("derives grant controls from authoritative $status state", ({ status, eligibleTeams, remaining, pending, canOperate, expected }) => {
    const projection = {
      timeouts: { home: { used: 1, remaining: remaining[0] }, away: { used: 2, remaining: remaining[1] } },
      timeoutOpportunity: {
        status,
        eligibleTeams: [...eligibleTeams],
        sourceEventId: status === "OPEN" ? "opportunity-2" : null,
        sourceSeq: status === "OPEN" ? 9 : null,
        sourceFactType: status === "OPEN" ? "DEAD_BALL_CONFIRMED" : null,
        ruleProfileId: "FIBA_2024"
      }
    } satisfies Pick<ReturnType<typeof createInitialScoreboardProjection>, "timeouts" | "timeoutOpportunity">;

    const state = buildTimeoutControlState(projection, { canOperate, pending });
    expect([state.home.enabled, state.away.enabled]).toEqual(expected);
    expect(state.home.remaining).toBe(remaining[0]);
    expect(state.away.remaining).toBe(remaining[1]);
  });
});
