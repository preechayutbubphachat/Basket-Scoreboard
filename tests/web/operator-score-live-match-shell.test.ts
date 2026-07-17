import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { createApiClient } from "../../apps/web/src/lib/apiClient";
import {
  buildOperatorScoreCommandStatus,
  buildOperatorScoreConnection
} from "../../apps/web/src/lib/operatorScoreShell";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");

describe("operator Score LiveMatchShell adoption", () => {
  test("hydrates canonical effective match access through the existing API client", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      data: {
        matchId: "match-1",
        capabilities: {
          matchRead: true,
          scoreOperate: true,
          foulOperate: false,
          gameClockOperate: false,
          shotClockOperate: false,
          timeoutOperate: false,
          lifecycleOperate: false,
          correctionRequest: false,
          correctionApply: false,
          correctionReject: false,
          auditRead: false
        }
      }
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const api = createApiClient({ baseUrl: "/api/v1", fetchImpl });

    await expect(api.getEffectiveMatchAccess("match-1")).resolves.toMatchObject({
      matchId: "match-1",
      capabilities: { matchRead: true, scoreOperate: true }
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/v1/matches/match-1/effective-access");
  });

  test("maps route-owned realtime state into the canonical shell vocabulary", () => {
    expect(buildOperatorScoreConnection("CONNECTED", false)).toEqual({
      label: "Realtime connected",
      state: "connected"
    });
    expect(buildOperatorScoreConnection("RECONNECTING", false).state).toBe("reconnecting");
    expect(buildOperatorScoreConnection("POLLING_FALLBACK", false).state).toBe("reconnecting");
    expect(buildOperatorScoreConnection("UNAVAILABLE", false).state).toBe("offline");
    expect(buildOperatorScoreConnection("CONNECTED", true).state).toBe("read-only");
  });

  test("maps existing command feedback without taking command ownership", () => {
    expect(buildOperatorScoreCommandStatus("HOME-2", null)).toMatchObject({ state: "pending" });
    expect(buildOperatorScoreCommandStatus(null, { tone: "success", text: "Accepted" })).toEqual({
      detail: "Accepted",
      state: "accepted"
    });
    expect(buildOperatorScoreCommandStatus(null, {
      tone: "error",
      text: "Refresh required",
      code: "INVALID_EXPECTED_SEQ"
    })).toEqual({ detail: "Refresh required", state: "sync-required" });
    expect(buildOperatorScoreCommandStatus(null, { tone: "error", text: "Denied", code: "FORBIDDEN" })).toEqual({
      detail: "Denied",
      state: "rejected"
    });
    expect(buildOperatorScoreCommandStatus(null, null)).toBeUndefined();
  });

  test("adopts only Score while preserving route-owned realtime, polling, and commands", () => {
    const scoreStart = appSource.indexOf("function OperatorScorePage");
    const foulStart = appSource.indexOf("function OperatorFoulPage");
    const scoreSource = appSource.slice(scoreStart, foulStart);

    expect(scoreSource).toContain("<AuthenticatedDashboardShell");
    expect(scoreSource).toContain("<LiveMatchShell");
    expect(scoreSource).toContain("buildLiveMatchPresentationContext");
    expect(scoreSource).toContain("buildLiveMatchNavigation");
    expect(scoreSource).toContain("api.getEffectiveMatchAccess(matchId)");
    expect(scoreSource).toContain("usePublicProjectionRealtime(");
    expect(scoreSource).toContain("window.setInterval(");
    expect(scoreSource).toContain("buildScoreCommandPayload(projection");
    expect(scoreSource).toContain("const previousSeq = projection.currentSeq");
    expect(scoreSource).not.toContain("<dt>Seq</dt>");
    expect(scoreSource).not.toContain("<dt>Expected Seq</dt>");
    expect(appSource.slice(foulStart)).not.toContain("<LiveMatchShell");
    expect(appSource).toContain('route.name === "operator-score"');
  });
});
