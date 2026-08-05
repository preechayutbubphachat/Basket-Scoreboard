import { describe, expect, it } from "vitest";
import { buildRosterBaselineProjection } from "../../apps/api/src/rosters/rosterBaselineProjection";
import { serializePublicRosterBaseline } from "../../apps/api/src/rosters/rosterBaselinePublicSerializer";

describe("RM-08 public roster baseline privacy boundary", () => {
  it("serializes only the locked public readiness allowlist", () => {
    const projection = buildRosterBaselineProjection({
      teamSide: "HOME",
      matchTeamId: "team-home",
      sourceRevision: "revision-1",
      members: [{
        playerId: "player-private",
        teamId: "team-home",
        displayName: "Private Player",
        jerseyNumber: "99",
        rosterStatus: "ACTIVE",
        isStarter: true,
        isCaptain: true,
        eligibilityState: "ELIGIBLE"
      }],
      version: { eventSeq: 7, eventId: "event-7", canonicalPayloadHash: "hash-7" },
      ruleProfile: "FIBA_2024",
      confirmation: null
    });

    const publicPayload = serializePublicRosterBaseline(projection);

    expect(Object.keys(publicPayload)).toEqual(["teamSide", "readiness", "initialized"]);
    expect(Object.keys(publicPayload.readiness)).toEqual(["status"]);
    expect(publicPayload).toEqual({
      teamSide: "HOME",
      readiness: { status: "NOT_READY" },
      initialized: true
    });

    for (const forbidden of [
      "displayName",
      "jerseyNumber",
      "isStarter",
      "isCaptain",
      "lastEventSeq",
      "playerId",
      "matchTeamId",
      "eligibilityState",
      "canonicalPayloadHash"
    ]) {
      expect(JSON.stringify(publicPayload)).not.toContain(forbidden);
    }
  });
});
