import { describe, expect, it } from "vitest";
import {
  buildRosterBaselineProjection,
  canonicalRosterBaselineHash,
  canonicalRosterBaselinePayload,
  projectLegacyConfirmation,
  rebuildRosterBaselineFromEvents
} from "../../apps/api/src/rosters/rosterBaselineProjection.js";

const members = Array.from({ length: 5 }, (_, index) => ({
  playerId: `player-${index + 1}`,
  displayName: `Player ${index + 1}`,
  jerseyNumber: String(index + 1),
  teamId: "team-home",
  rosterStatus: "ACTIVE" as const,
  isStarter: true,
  isCaptain: false,
  eligibilityState: "ELIGIBLE" as const
}));

describe("RM-08 P1A roster baseline projection", () => {
  it("uses a stable canonical payload and only FIBA_2024 maps five starters", () => {
    expect(canonicalRosterBaselinePayload({ teamSide: "HOME", sourceRevision: "r1", members })).toBe(
      canonicalRosterBaselinePayload({ sourceRevision: "r1", members, teamSide: "HOME" })
    );

    expect(buildRosterBaselineProjection({
      matchId: "match-1", matchTeamId: "team-home", teamSide: "HOME", members, sourceRevision: "r1", version: { eventSeq: 4, eventId: "event-1", canonicalPayloadHash: "hash" },
      ruleProfile: "FIBA_2024", confirmation: null
    }).readiness).toMatchObject({ state: "ROSTER_NOT_CONFIRMED", effective: false, requiredStarterCount: 5 });

    expect(buildRosterBaselineProjection({
      matchId: "match-1", matchTeamId: "team-home", teamSide: "HOME", members, sourceRevision: "r1", version: { eventSeq: 4, eventId: "event-1", canonicalPayloadHash: "hash" },
      ruleProfile: "NBA", confirmation: null
    }).readiness).toMatchObject({ state: "NOT_EVALUATED", effective: false, requiredStarterCount: null });
  });

  it("keeps legacy confirmations ineffective and applies the locked readiness precedence", () => {
    expect(projectLegacyConfirmation({ confirmed: true, version: null })).toEqual({ state: "LEGACY_UNVERSIONED", effective: false });

    const invalid = buildRosterBaselineProjection({
      matchId: "match-2", matchTeamId: "team-home", teamSide: "AWAY", members: [{ ...members[0]!, eligibilityState: "BLOCKING_REVIEW" }], sourceRevision: "r2",
      version: { eventSeq: 5, eventId: "event-2", canonicalPayloadHash: "hash2" }, ruleProfile: "FIBA_2024",
      confirmation: { confirmed: true, version: { eventSeq: 4, eventId: "old", canonicalPayloadHash: "old" } }
    });
    expect(invalid.readiness).toMatchObject({ state: "BLOCKING_ELIGIBILITY_REVIEW", effective: false });
  });

  it("preserves the replay-required member semantics in canonical source order", () => {
    const canonical = canonicalRosterBaselinePayload({
      teamSide: "HOME",
      sourceRevision: "source-revision",
      members: [{
        playerId: "player-1",
        teamId: "team-home",
        displayName: "Player 1",
        jerseyNumber: "1",
        rosterStatus: "ACTIVE",
        isStarter: true,
        isCaptain: false,
        eligibilityState: "ELIGIBLE"
      }]
    });

    expect(JSON.parse(canonical)).toMatchObject({
      teamSide: "HOME",
      sourceRevision: "source-revision",
      members: [{ playerId: "player-1", teamId: "team-home", rosterStatus: "ACTIVE", eligibilityState: "ELIGIBLE" }]
    });
  });

  it("rejects a hash-valid member envelope with an unexpected private field", () => {
    const malformedMembers = [{ ...members[0]!, privateField: "must-not-enter-projection" }];
    expect(() => rebuildRosterBaselineFromEvents([{
      seqNo: 4,
      eventId: "event-malformed",
      eventType: "MATCH_ROSTER_BASELINE_IMPORTED",
      payload: {
        schemaVersion: 1,
        matchId: "match-1",
        teamSide: "HOME",
        matchTeamId: "team-home",
        members: malformedMembers,
        source: { legacyRosterRevision: "r1", importedAt: "2026-08-01T00:00:00.000Z" },
        rulesProfile: "FIBA_2024",
        rosterVersion: {
          eventSeq: 4,
          eventId: "event-malformed",
          canonicalPayloadHash: canonicalRosterBaselineHash({ schemaVersion: 1, matchId: "match-1", matchTeamId: "team-home", teamSide: "HOME", sourceRevision: "r1", members: members.slice(0, 1), ruleProfile: "FIBA_2024", rosterVersion: { eventSeq: 4, eventId: "event-malformed" } })
        },
        integrity: { issues: [] },
        confirmation: { status: "UNCONFIRMED" }
      }
    }], "HOME")).toThrow("ROSTER_UNKNOWN_ELIGIBILITY_STATE");
  });

  it("rebuilds the protected baseline from the append-only event payload", () => {
    const rebuilt = rebuildRosterBaselineFromEvents([{ seqNo: 4, eventId: "event-1", eventType: "MATCH_ROSTER_BASELINE_IMPORTED", payload: {
      schemaVersion: 1,
      matchId: "match-1", teamSide: "HOME", matchTeamId: "team-home", members, source: { legacyRosterRevision: "r1", importedAt: "2026-08-01T00:00:00.000Z" },
      rulesProfile: "FIBA_2024", rosterVersion: { eventSeq: 4, eventId: "event-1", canonicalPayloadHash: canonicalRosterBaselineHash({ schemaVersion: 1, matchId: "match-1", matchTeamId: "team-home", teamSide: "HOME", sourceRevision: "r1", members, ruleProfile: "FIBA_2024", rosterVersion: { eventSeq: 4, eventId: "event-1" } }) }, integrity: { issues: [] }, confirmation: { status: "UNCONFIRMED" }
    } }], "HOME");
    expect(rebuilt).toMatchObject({ teamSide: "HOME", version: { eventSeq: 4, eventId: "event-1" }, sourceRevision: "r1" });
    expect(rebuilt?.members).toEqual(members);
  });
});
