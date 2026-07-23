import { describe, expect, test } from "vitest";
import { resolveScoreEffectiveAccess } from "../../apps/web/src/lib/scoreControl";

function access(matchId: string, matchRead: boolean, scoreOperate: boolean, correctionRequest: boolean) {
  return {
    matchId,
    capabilities: {
      matchRead,
      scoreOperate,
      correctionRequest
    }
  };
}

describe("RM-05-P4 score effective access", () => {
  test("fails closed for loading, error, malformed, denied, and cross-match access", () => {
    expect(resolveScoreEffectiveAccess("match-1", "loading", null)).toMatchObject({ lifecycle: "ACCESS_LOADING", canRead: false, canOperateScore: false, canRequestCorrection: false });
    expect(resolveScoreEffectiveAccess("match-1", "error", null)).toMatchObject({ lifecycle: "ACCESS_ERROR", canOperateScore: false });
    expect(resolveScoreEffectiveAccess("match-1", "ready", { malformed: true })).toMatchObject({ lifecycle: "ACCESS_ERROR", canOperateScore: false });
    expect(resolveScoreEffectiveAccess("match-1", "ready", access("match-2", true, true, true))).toMatchObject({ lifecycle: "ACCESS_MATCH_MISMATCH", canOperateScore: false });
    expect(resolveScoreEffectiveAccess("match-1", "ready", access("match-1", false, true, true))).toMatchObject({ lifecycle: "ACCESS_DENIED", canRead: false, canOperateScore: false });
  });

  test("keeps score and correction capabilities independent", () => {
    expect(resolveScoreEffectiveAccess("match-1", "ready", access("match-1", true, false, true))).toMatchObject({ canRead: true, canOperateScore: false, canRequestCorrection: true });
    expect(resolveScoreEffectiveAccess("match-1", "ready", access("match-1", true, true, false))).toMatchObject({ canRead: true, canOperateScore: true, canRequestCorrection: false });
  });
});
