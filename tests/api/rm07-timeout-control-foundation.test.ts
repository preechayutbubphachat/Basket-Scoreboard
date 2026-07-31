import { describe, expect, it } from "vitest";
import { timeoutGrantCommandSchema } from "@basket-scoreboard/api-contracts";
import { createInitialScoreboardProjection, deriveTimeoutGrantAuthority, applyTimeoutGranted, applyTeamTimeoutCorrected } from "../../apps/api/src/matchEventStore/projection";

const envelope = {
  commandId: "22222222-2222-4222-8222-222222222222",
  matchId: "11111111-1111-4111-8111-111111111111",
  expectedSeq: 8,
  correlationId: "33333333-3333-4333-8333-333333333333",
  clientTimestamp: "2026-07-31T10:00:00.000Z"
};

describe("RM-07 authoritative timeout control", () => {
  it("accepts only teamSide in the grant payload and rejects server-owned fields", () => {
    expect(timeoutGrantCommandSchema.parse({ ...envelope, payload: { teamSide: "HOME" } }).payload).toEqual({ teamSide: "HOME" });
    for (const forbidden of ["requestedBy", "durationMs", "reason", "periodNumber", "gameClockRemainingMs", "opportunityId", "eligible", "usedBefore", "remainingAfter"]) {
      expect(timeoutGrantCommandSchema.safeParse({ ...envelope, payload: { teamSide: "HOME", [forbidden]: forbidden === "eligible" ? true : 1 } }).success, forbidden).toBe(false);
    }
  });

  it("derives first-half, second-half late-Q4, and per-overtime quota without replenishment", () => {
    const base = { ...createInitialScoreboardProjection(envelope.matchId), status: "LIVE" as const, currentSeq: 8, currentPeriodStartedAt: "2026-07-31T09:00:00.000Z", timeoutOpportunity: { status: "OPEN" as const, eligibleTeams: ["HOME" as const], sourceEventId: "opportunity", sourceSeq: 8, sourceFactType: "DEAD_BALL_CONFIRMED" as const, ruleProfileId: "FIBA_2024" as const } };
    expect(deriveTimeoutGrantAuthority(base, "HOME")).toMatchObject({ eligible: true, quotaWindow: "FIRST_HALF", quota: 2, usedBefore: 0, usedAfter: 1, remainingAfter: 1 });
    const q4 = { ...base, periodNumber: 4, gameClockRemainingMs: 120000, gameClock: { ...base.gameClock, remainingMs: 120000 }, timeoutsByHalf: { ...base.timeoutsByHalf, secondHalf: { home: 1, away: 0 } } };
    expect(deriveTimeoutGrantAuthority(q4, "HOME")).toMatchObject({ eligible: true, quotaWindow: "SECOND_HALF_LATE_Q4", quota: 2, usedBefore: 1, remainingAfter: 0 });
    expect(deriveTimeoutGrantAuthority({ ...q4, timeoutsByHalf: { ...q4.timeoutsByHalf, secondHalf: { home: 2, away: 0 } } }, "HOME")).toMatchObject({ eligible: false, reasonCode: "TIMEOUT_QUOTA_EXHAUSTED" });
    const ot = { ...base, periodNumber: 5, periodType: "OVERTIME" as const, timeoutsByOvertime: { "5": { home: 0, away: 0 } } };
    expect(deriveTimeoutGrantAuthority(ot, "HOME")).toMatchObject({ eligible: true, quotaWindow: "OVERTIME_5", quota: 1, remainingAfter: 0 });
  });

  it("requires a fresh authoritative opportunity and preserves usage through compensation", () => {
    const base = { ...createInitialScoreboardProjection(envelope.matchId), status: "LIVE" as const, currentSeq: 8, currentPeriodStartedAt: "started", timeoutOpportunity: { status: "OPEN" as const, eligibleTeams: ["HOME" as const], sourceEventId: "opportunity", sourceSeq: 8, sourceFactType: "DEAD_BALL_CONFIRMED" as const, ruleProfileId: "FIBA_2024" as const } };
    expect(deriveTimeoutGrantAuthority({ ...base, timeoutOpportunity: { ...base.timeoutOpportunity, status: "CLOSED" as const } }, "HOME")).toMatchObject({ eligible: false, reasonCode: "TIMEOUT_OPPORTUNITY_CLOSED" });
    const authority = deriveTimeoutGrantAuthority(base, "HOME");
    if (!authority.eligible) throw new Error("expected authority");
    const granted = applyTimeoutGranted(base, { teamSide: "HOME", startedAt: "now", durationMs: 60_000, requestedBy: "OTHER", reason: null, periodNumber: 1, gameClockRemainingMs: 600000, shotClockRemainingMs: 24000, ...authority }, 9, "grant");
    expect(granted.timeoutsByHalf.firstHalf.home).toBe(1);
    expect(granted.activeTimeout).toMatchObject({
      timeoutEventId: "grant",
      teamSide: "HOME",
      grantedAtSeq: 9,
      period: 1,
      opportunitySourceEventId: "opportunity",
      opportunitySourceEventSeq: 8
    });
    const corrected = applyTeamTimeoutCorrected(granted, { targetEventId: "grant", targetSeq: 9, teamSide: "HOME", periodNumber: 1 }, 10);
    expect(corrected.timeoutsByHalf.firstHalf.home).toBe(0);
    expect(corrected.activeTimeout).toBeNull();
  });
});
