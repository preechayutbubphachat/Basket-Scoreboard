import { describe, expect, it } from "vitest";
import {
  buildRosterBaselineProjection,
  canonicalRosterBaselineHash,
  hasCanonicalRosterBaselineEventAnchor,
  hasCanonicalRosterBaselineIntegrity,
  rebuildRosterBaselineFromEvents,
  rebuildRosterBaselineFromSnapshotAndEvents
} from "../../apps/api/src/rosters/rosterBaselineProjection.js";
import { serializePublicRosterBaseline } from "../../apps/api/src/rosters/rosterBaselinePublicSerializer.js";

const members = Array.from({ length: 5 }, (_, index) => ({
  playerId: `player-${index + 1}`,
  teamId: "team-home",
  displayName: `Player ${index + 1}`,
  jerseyNumber: String(index + 1),
  rosterStatus: "ACTIVE" as const,
  isStarter: true,
  isCaptain: false,
  eligibilityState: "ELIGIBLE" as const
}));

function eventMembers(eligibilityState: unknown) {
  return members.map((member, index) => index === 0 ? { ...member, eligibilityState } : member);
}

function eventPayload(payloadMembers: unknown[]) {
  const canonicalPayloadHash = canonicalRosterBaselineHash({
    schemaVersion: 1,
    matchId: "match-v4",
    matchTeamId: "team-home",
    teamSide: "HOME",
    sourceRevision: "revision-v4",
    members: payloadMembers as typeof members,
    ruleProfile: "FIBA_2024",
    rosterVersion: { eventSeq: 1, eventId: "event-v4" }
  });
  return {
    schemaVersion: 1,
    matchId: "match-v4",
    teamSide: "HOME",
    matchTeamId: "team-home",
    members: payloadMembers,
    source: { legacyRosterRevision: "revision-v4" },
    rulesProfile: "FIBA_2024",
    rosterVersion: { eventSeq: 1, eventId: "event-v4", canonicalPayloadHash },
    integrity: { issues: [] },
    confirmation: { status: "VERSIONED" }
  };
}

describe("RM-08 V4 rule and projection integrity", () => {
  it.each(["UNKNOWN", "FUTURE_ELIGIBILITY", "eligible", null, undefined])(
    "fails closed for unknown eligibility value %s without silently removing the member",
    (eligibilityState) => {
      const payloadMembers = eventMembers(eligibilityState);
      expect(() => rebuildRosterBaselineFromEvents([
        { seqNo: 1, eventId: "event-v4", eventType: "MATCH_ROSTER_BASELINE_IMPORTED", payload: eventPayload(payloadMembers) }
      ], "HOME")).toThrow("ROSTER_UNKNOWN_ELIGIBILITY_STATE");
      expect(payloadMembers).toHaveLength(5);
    }
  );

  it("fails closed for mixed known and unknown members and does not emit a public READY result", () => {
    const payloadMembers = eventMembers("UNKNOWN");
    expect(() => rebuildRosterBaselineFromEvents([
      { seqNo: 1, eventId: "event-v4", eventType: "MATCH_ROSTER_BASELINE_IMPORTED", payload: eventPayload(payloadMembers) }
    ], "HOME")).toThrow();

    const safeProjection = buildRosterBaselineProjection({
      matchId: "match-v4",
      teamSide: "HOME",
      matchTeamId: "team-home",
      members,
      sourceRevision: "revision-v4",
      version: { eventSeq: 1, eventId: "event-v4", canonicalPayloadHash: "hash-v4" },
      ruleProfile: "FIBA_2024",
      confirmation: { confirmed: true, version: { eventSeq: 1, eventId: "event-v4", canonicalPayloadHash: "hash-v4" } },
      integrityIssues: ["UNKNOWN_ELIGIBILITY_STATE"]
    });
    expect(safeProjection.readiness.effective).toBe(false);
    expect(serializePublicRosterBaseline(safeProjection)).toEqual({
      teamSide: "HOME",
      readiness: { status: "NOT_READY" },
      initialized: true
    });
  });

  it.each([null, "NBA", "CUSTOM", "", 42])("does not evaluate an unvalidated rules profile: %s", (ruleProfile) => {
    const projection = buildRosterBaselineProjection({
      matchId: "match-v4",
      teamSide: "HOME",
      matchTeamId: "team-home",
      members,
      sourceRevision: "revision-v4",
      version: { eventSeq: 1, eventId: "event-v4", canonicalPayloadHash: "hash-v4" },
      ruleProfile: ruleProfile as string | null,
      confirmation: { confirmed: true, version: { eventSeq: 1, eventId: "event-v4", canonicalPayloadHash: "hash-v4" } }
    });
    expect(projection.readiness.state).toBe("NOT_EVALUATED");
    expect(projection.readiness.effective).toBe(false);
  });

  it("rejects hash-valid malformed member envelopes before readiness evaluation", () => {
    const malformedMembers = members.map((member, index) => index === 0 ? { ...member, displayName: 42 } : member);
    expect(() => rebuildRosterBaselineFromEvents([
      { seqNo: 1, eventId: "event-v4", eventType: "MATCH_ROSTER_BASELINE_IMPORTED", payload: eventPayload(malformedMembers) }
    ], "HOME")).toThrow("ROSTER_UNKNOWN_ELIGIBILITY_STATE");
  });

  it("uses FIBA_2024 binding and does not require a captain", () => {
    const projection = buildRosterBaselineProjection({
      matchId: "match-v4",
      teamSide: "HOME",
      matchTeamId: "team-home",
      members,
      sourceRevision: "revision-v4",
      version: { eventSeq: 1, eventId: "event-v4", canonicalPayloadHash: "hash-v4" },
      ruleProfile: "FIBA_2024",
      confirmation: { confirmed: true, version: { eventSeq: 1, eventId: "event-v4", canonicalPayloadHash: "hash-v4" } }
    });
    expect(projection.readiness).toMatchObject({ state: "READY", effective: true, requiredStarterCount: 5, captainSet: false });
  });

  it("rejects same-sequence content corruption through the server-derived projection hash", () => {
    const projection = buildRosterBaselineProjection({
      matchId: "match-v4",
      teamSide: "HOME",
      matchTeamId: "team-home",
      members,
      sourceRevision: "revision-v4",
      version: { eventSeq: 7, eventId: "event-v4", canonicalPayloadHash: "hash-v4" },
      ruleProfile: "FIBA_2024",
      confirmation: { confirmed: true, version: { eventSeq: 7, eventId: "event-v4", canonicalPayloadHash: "hash-v4" } }
    });
    expect(hasCanonicalRosterBaselineIntegrity(projection, "match-v4")).toBe(true);
    expect(hasCanonicalRosterBaselineIntegrity({ ...projection, members: [{ ...projection.members[0]!, displayName: "Corrupted" }, ...projection.members.slice(1)] }, "match-v4")).toBe(false);
    expect(hasCanonicalRosterBaselineIntegrity({ ...projection, projectionIntegrityHash: "client-supplied" }, "match-v4")).toBe(false);
  });

  it("rejects content corruption even when a caller recomputes the self-hash", () => {
    const version = { eventSeq: 1, eventId: "event-v4", canonicalPayloadHash: canonicalRosterBaselineHash({ schemaVersion: 1, matchId: "match-v4", matchTeamId: "team-home", teamSide: "HOME", sourceRevision: "revision-v4", members, ruleProfile: "FIBA_2024", rosterVersion: { eventSeq: 1, eventId: "event-v4" } }) };
    const projection = buildRosterBaselineProjection({
      matchId: "match-v4",
      teamSide: "HOME",
      matchTeamId: "team-home",
      members,
      sourceRevision: "revision-v4",
      version,
      ruleProfile: "FIBA_2024",
      confirmation: { confirmed: true, version }
    });
    const event = {
      seqNo: 1,
      eventId: "event-v4",
      eventType: "MATCH_ROSTER_BASELINE_IMPORTED",
      matchId: "match-v4",
      payload: eventPayload(members)
    };
    const tampered = buildRosterBaselineProjection({
      matchId: projection.matchId ?? undefined,
      teamSide: projection.teamSide,
      matchTeamId: projection.matchTeamId ?? undefined,
      members: members.map((member, index) => index === 0 ? { ...member, displayName: "Tampered" } : member),
      sourceRevision: projection.sourceRevision,
      version,
      ruleProfile: projection.ruleProfile,
      confirmation: { confirmed: true, version }
    });

    expect(hasCanonicalRosterBaselineEventAnchor(projection, event, "HOME")).toBe(true);
    expect(hasCanonicalRosterBaselineEventAnchor(tampered, event, "HOME")).toBe(false);
  });

  it("rejects an event whose embedded payload hash is not derived from canonical members", () => {
    const event = {
      seqNo: 1,
      eventId: "event-v4",
      eventType: "MATCH_ROSTER_BASELINE_IMPORTED",
      matchId: "match-v4",
      payload: {
        ...eventPayload(members),
        rosterVersion: { eventSeq: 1, eventId: "event-v4", canonicalPayloadHash: "not-derived" }
      }
    };
    const projection = buildRosterBaselineProjection({
      matchId: "match-v4",
      teamSide: "HOME",
      matchTeamId: "team-home",
      members,
      sourceRevision: "revision-v4",
      version: { eventSeq: 1, eventId: "event-v4", canonicalPayloadHash: "not-derived" },
      ruleProfile: "FIBA_2024",
      confirmation: { confirmed: true, version: { eventSeq: 1, eventId: "event-v4", canonicalPayloadHash: "not-derived" } }
    });

    expect(hasCanonicalRosterBaselineEventAnchor(projection, event, "HOME")).toBe(false);
  });

  it("binds the canonical event hash to the supported rule profile", () => {
    const validEvent = {
      seqNo: 1,
      eventId: "event-v4",
      eventType: "MATCH_ROSTER_BASELINE_IMPORTED",
      matchId: "match-v4",
      payload: eventPayload(members)
    };
    const profileTamperedEvent = {
      ...validEvent,
      payload: { ...validEvent.payload, rulesProfile: "NBA" }
    };
    const projection = buildRosterBaselineProjection({
      matchId: "match-v4",
      teamSide: "HOME",
      matchTeamId: "team-home",
      members,
      sourceRevision: "revision-v4",
      version: validEvent.payload.rosterVersion,
      ruleProfile: "FIBA_2024",
      confirmation: { confirmed: true, version: validEvent.payload.rosterVersion }
    });

    expect(hasCanonicalRosterBaselineEventAnchor(projection, validEvent, "HOME")).toBe(true);
    expect(hasCanonicalRosterBaselineEventAnchor(projection, profileTamperedEvent, "HOME")).toBe(false);
  });

  it("exposes the exact public DTO key set", () => {
    const projection = buildRosterBaselineProjection({
      matchId: "match-v4",
      teamSide: "AWAY",
      matchTeamId: "team-away",
      members,
      sourceRevision: "revision-v4",
      version: null,
      ruleProfile: "FIBA_2024",
      confirmation: null
    });
    expect(Object.keys(serializePublicRosterBaseline(projection)).sort()).toEqual(["initialized", "readiness", "teamSide"]);
    expect(Object.keys(serializePublicRosterBaseline(projection).readiness)).toEqual(["status"]);
  });

  it("rejects duplicate player identities before deriving readiness", () => {
    const duplicateMembers = [...members, { ...members[0]!, displayName: "Same Player Duplicate" }];
    expect(() => rebuildRosterBaselineFromEvents([
      { seqNo: 1, eventId: "event-duplicate", eventType: "MATCH_ROSTER_BASELINE_IMPORTED", payload: eventPayload(duplicateMembers) }
    ], "HOME")).toThrow("ROSTER_DUPLICATE_MEMBER_IDENTITY");
  });

  it("rejects a hash-valid cross-match event when the requested match/team scope differs", () => {
    const crossMatchEvent = {
      seqNo: 1,
      eventId: "event-cross-match",
      eventType: "MATCH_ROSTER_BASELINE_IMPORTED",
      matchId: "match-b",
      payload: eventPayload(members)
    };
    const rebuild = rebuildRosterBaselineFromEvents as unknown as (
      events: unknown[],
      teamSide: "HOME" | "AWAY",
      expectedMatchId: string,
      expectedTeamId: string
    ) => unknown;
    expect(() => rebuild([crossMatchEvent], "HOME", "match-a", "team-home")).toThrow("ROSTER_EVENT_INVALID_RELATIONSHIP");
  });

  it("changes the canonical event hash when policy-critical relationship identity changes", () => {
    const base = { teamSide: "HOME" as const, sourceRevision: "revision-v4", members, ruleProfile: "FIBA_2024" };
    const hash = (overrides: Record<string, unknown>) => canonicalRosterBaselineHash({ ...base, ...overrides } as never);
    const canonical = hash({ eventType: "MATCH_ROSTER_BASELINE_IMPORTED", schemaVersion: 1, matchId: "match-a", matchTeamId: "team-home", rosterVersion: { eventSeq: 1, eventId: "event-a" } });
    expect(hash({ eventType: "MATCH_ROSTER_BASELINE_IMPORTED", schemaVersion: 1, matchId: "match-b", matchTeamId: "team-home", rosterVersion: { eventSeq: 1, eventId: "event-a" } })).not.toBe(canonical);
    expect(hash({ eventType: "MATCH_ROSTER_BASELINE_IMPORTED", schemaVersion: 1, matchId: "match-a", matchTeamId: "team-away", rosterVersion: { eventSeq: 1, eventId: "event-a" } })).not.toBe(canonical);
    expect(hash({ eventType: "OTHER_EVENT", schemaVersion: 1, matchId: "match-a", matchTeamId: "team-home", rosterVersion: { eventSeq: 1, eventId: "event-a" } })).not.toBe(canonical);
    expect(hash({ eventType: "MATCH_ROSTER_BASELINE_IMPORTED", schemaVersion: 2, matchId: "match-a", matchTeamId: "team-home", rosterVersion: { eventSeq: 1, eventId: "event-a" } })).not.toBe(canonical);
    expect(hash({ eventType: "MATCH_ROSTER_BASELINE_IMPORTED", schemaVersion: 1, matchId: "match-a", matchTeamId: "team-home", rosterVersion: { eventSeq: 2, eventId: "event-a" } })).not.toBe(canonical);
    expect(hash({ eventType: "MATCH_ROSTER_BASELINE_IMPORTED", schemaVersion: 1, matchId: "match-a", matchTeamId: "team-home", rosterVersion: { eventSeq: 1, eventId: "event-b" } })).not.toBe(canonical);
  });

  it("rejects a hash-valid cross-match tail before applying it to a snapshot", () => {
    const snapshot = buildRosterBaselineProjection({
      matchId: "match-a",
      teamSide: "HOME",
      matchTeamId: "team-home",
      members,
      sourceRevision: "revision-v4",
      version: { eventSeq: 1, eventId: "event-a", canonicalPayloadHash: "hash-a" },
      ruleProfile: "FIBA_2024",
      confirmation: { confirmed: true, version: { eventSeq: 1, eventId: "event-a", canonicalPayloadHash: "hash-a" } }
    });
    const crossMatchTail = {
      seqNo: 2,
      eventId: "event-b",
      eventType: "MATCH_ROSTER_BASELINE_IMPORTED",
      matchId: "match-b",
      payload: eventPayload(members)
    };
    const rebuild = rebuildRosterBaselineFromSnapshotAndEvents as unknown as (
      projection: unknown,
      tail: unknown[],
      teamSide: "HOME" | "AWAY",
      expectedMatchId: string,
      expectedTeamId: string
    ) => unknown;
    expect(() => rebuild(snapshot, [crossMatchTail], "HOME", "match-a", "team-home")).toThrow("ROSTER_EVENT_INVALID_RELATIONSHIP");
  });
});
