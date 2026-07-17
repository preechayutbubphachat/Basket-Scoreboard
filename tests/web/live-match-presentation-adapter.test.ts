import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EffectiveMatchAccess } from "@basket-scoreboard/api-contracts";
import {
  buildLiveMatchNavigation,
  buildLiveMatchPresentationContext
} from "../../apps/web/src/lib/liveMatchPresentation";

const matchId = "93bd90bd-040d-48f5-bb9c-1354d6e80077";

function access(capabilities: Partial<EffectiveMatchAccess["capabilities"]> = {}): EffectiveMatchAccess {
  return {
    matchId,
    capabilities: {
      matchRead: false,
      scoreOperate: false,
      foulOperate: false,
      gameClockOperate: false,
      shotClockOperate: false,
      timeoutOperate: false,
      lifecycleOperate: false,
      correctionRequest: false,
      correctionApply: false,
      correctionReject: false,
      auditRead: false,
      ...capabilities
    }
  };
}

describe("live match presentation adapters", () => {
  it("builds the presentation-only match context from server-returned fields", () => {
    expect(buildLiveMatchPresentationContext({
      matchId,
      homeTeamName: "Bangkok Thunder",
      awayTeamName: "Chiang Mai Falcons",
      status: "LIVE",
      tournamentLabel: "National Arena Invitational",
      courtLabel: "Court 1",
      periodLabel: "Q4"
    })).toEqual({
      matchId,
      homeTeamName: "Bangkok Thunder",
      awayTeamName: "Chiang Mai Falcons",
      status: "LIVE",
      tournamentLabel: "National Arena Invitational",
      courtLabel: "Court 1",
      periodLabel: "Q4",
      readOnly: false
    });
  });

  it("builds stable capability-driven navigation", () => {
    const navigation = buildLiveMatchNavigation({
      matchId,
      currentView: "clock",
      effectiveAccess: access({
        matchRead: true,
        scoreOperate: true,
        foulOperate: true,
        gameClockOperate: true,
        timeoutOperate: true,
        lifecycleOperate: true,
        correctionRequest: true,
        auditRead: true
      })
    });

    expect(navigation.map(({ id, current }) => ({ id, current: current ?? false }))).toEqual([
      { id: "score", current: false },
      { id: "fouls", current: false },
      { id: "clock", current: true },
      { id: "timeouts", current: false },
      { id: "lifecycle", current: false },
      { id: "corrections", current: false },
      { id: "summary", current: false },
      { id: "replay", current: false },
      { id: "audit-log", current: false }
    ]);
  });

  it("preserves long multilingual labels, omits optional metadata, and derives read-only only from authoritative status", () => {
    const input = {
      matchId,
      homeTeamName: "Bangkok Metropolitan Youth Basketball Academy Championship Selection",
      awayTeamName: "สโมสรบาสเกตบอลเยาวชนเชียงใหม่ Falcons",
      status: "FINAL",
      tournamentLabel: "การแข่งขัน National Arena Invitational",
      courtLabel: null,
      periodLabel: ""
    };

    const first = buildLiveMatchPresentationContext(input);
    const second = buildLiveMatchPresentationContext(input);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      homeTeamName: input.homeTeamName,
      awayTeamName: input.awayTeamName,
      tournamentLabel: input.tournamentLabel,
      courtLabel: null,
      periodLabel: null,
      readOnly: true
    });
  });

  it("uses safe team fallbacks and excludes unexpected private metadata", () => {
    const context = buildLiveMatchPresentationContext({
      matchId,
      homeTeamName: null,
      awayTeamName: " ",
      status: "LIVE",
      expectedSeq: 7,
      currentSeq: 8,
      commandId: "private-command",
      correlationId: "private-correlation",
      actor: { userId: "private-user" },
      audit: { reason: "private-reason" }
    } as Parameters<typeof buildLiveMatchPresentationContext>[0] & Record<string, unknown>);

    expect(context).toEqual({
      matchId,
      homeTeamName: "Home team pending",
      awayTeamName: "Away team pending",
      status: "LIVE",
      tournamentLabel: null,
      courtLabel: null,
      periodLabel: null,
      readOnly: false
    });
    expect(JSON.stringify(context)).not.toMatch(/Seq|command|correlation|actor|audit|reason/i);
  });

  it.each([
    ["scoreOperate", "score"],
    ["foulOperate", "fouls"],
    ["gameClockOperate", "clock"],
    ["shotClockOperate", "clock"],
    ["timeoutOperate", "timeouts"],
    ["lifecycleOperate", "lifecycle"],
    ["correctionRequest", "corrections"],
    ["auditRead", "audit-log"]
  ] as const)("maps %s to the evidence-backed %s route", (capability, expectedView) => {
    const navigation = buildLiveMatchNavigation({
      matchId,
      effectiveAccess: access({ matchRead: true, [capability]: true })
    });

    expect(navigation.map((item) => item.id)).toContain(expectedView);
  });

  it("uses matchRead for summary and replay without inventing correction authority", () => {
    const navigation = buildLiveMatchNavigation({
      matchId,
      effectiveAccess: access({ matchRead: true, correctionApply: true, correctionReject: true })
    });

    expect(navigation.map((item) => item.id)).toEqual(["summary", "replay"]);
  });

  it("fails closed for missing access, zero capabilities, and matchId mismatch", () => {
    expect(buildLiveMatchNavigation({ matchId, currentView: "score" })).toEqual([]);
    expect(buildLiveMatchNavigation({ matchId, effectiveAccess: access() })).toEqual([]);
    expect(buildLiveMatchNavigation({
      matchId: "different-match",
      effectiveAccess: access({ matchRead: true, scoreOperate: true })
    })).toEqual([]);
  });

  it("does not synthesize unauthorized or unknown current items", () => {
    const unauthorized = buildLiveMatchNavigation({
      matchId,
      currentView: "score",
      effectiveAccess: access({ matchRead: true })
    });
    const unknown = buildLiveMatchNavigation({
      matchId,
      currentView: "invented-view",
      effectiveAccess: access({ matchRead: true })
    });

    expect(unauthorized.map((item) => item.id)).toEqual(["summary", "replay"]);
    expect(unauthorized.some((item) => item.current)).toBe(false);
    expect(unknown.some((item) => item.current)).toBe(false);
  });

  it("ignores role, global permission, and assignment claims outside EffectiveMatchAccess", () => {
    const navigation = buildLiveMatchNavigation({
      matchId,
      currentView: "score",
      effectiveAccess: null,
      role: "ADMIN",
      permissions: ["match.score.operate"],
      matchAssignments: [{ matchId, roleCode: "MATCH_OPERATOR" }],
      assignmentRole: "MATCH_OPERATOR"
    } as Parameters<typeof buildLiveMatchNavigation>[0] & Record<string, unknown>);

    expect(navigation).toEqual([]);
  });

  it("owns no fetching, realtime, commands, role authorization, or public coupling", () => {
    const source = readFileSync("apps/web/src/lib/liveMatchPresentation.ts", "utf8");

    expect(source).not.toMatch(/fetch\(|apiClient|socket\.io|socket\.emit|new WebSocket|\bio\(|match:join|setInterval/);
    expect(source).not.toMatch(/user\.role|role\s*===|\.permissions|matchAssignments|assignmentRole/);
    expect(source).not.toMatch(/expectedSeq|currentSeq|lastEventSeq|correlationId|commandId|audit metadata|correction reason/i);
    expect(source).not.toMatch(/PublicDisplayShell|\/public\//);
  });
});
