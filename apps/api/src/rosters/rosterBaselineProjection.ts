import { createHash } from "node:crypto";

export type TeamSide = "HOME" | "AWAY";
export type EligibilityStatus = "ELIGIBLE" | "BLOCKING_REVIEW" | "NOT_EVALUATED";
export const SUPPORTED_ROSTER_RULE_PROFILE = "FIBA_2024" as const;

export function resolveSupportedStarterCount(ruleProfile: unknown): number | null {
  return ruleProfile === SUPPORTED_ROSTER_RULE_PROFILE ? 5 : null;
}

export function isEligibilityStatus(value: unknown): value is EligibilityStatus {
  return value === "ELIGIBLE" || value === "BLOCKING_REVIEW" || value === "NOT_EVALUATED";
}
export type BaselineMember = {
  playerId: string;
  teamId: string;
  displayName: string;
  jerseyNumber: string | null;
  rosterStatus: "ACTIVE" | "BENCH" | "INACTIVE";
  isStarter: boolean;
  isCaptain: boolean;
  eligibilityState: EligibilityStatus;
};
export type RosterVersion = { eventSeq: number; eventId: string; canonicalPayloadHash: string };
export type RosterConfirmation = { confirmed: boolean; version: RosterVersion | null };
export type RosterReadinessState =
  | "BLOCKING_ELIGIBILITY_REVIEW"
  | "INVALID_ROSTER_RELATIONSHIP"
  | "MALFORMED_LEGACY_STATE"
  | "ROSTER_NOT_INITIALIZED"
  | "ROSTER_NOT_CONFIRMED"
  | "STARTERS_INCOMPLETE"
  | "READY"
  | "NOT_EVALUATED";

export type CanonicalRosterBaselineInput = {
  eventType?: string;
  schemaVersion?: number;
  matchId?: string | null;
  matchTeamId?: string | null;
  teamSide: TeamSide;
  sourceRevision: string;
  members: BaselineMember[];
  ruleProfile?: string | null;
  rosterVersion?: { eventSeq: number; eventId: string } | null;
};

export function canonicalRosterBaselinePayload(input: CanonicalRosterBaselineInput) {
  assertNoDuplicateMemberIdentities(input.members);
  return JSON.stringify({
    eventType: input.eventType ?? "MATCH_ROSTER_BASELINE_IMPORTED",
    matchId: input.matchId ?? null,
    matchTeamId: input.matchTeamId ?? null,
    members: input.members.map((member) => ({
      displayName: member.displayName,
      eligibilityState: member.eligibilityState,
      isCaptain: member.isCaptain,
      isStarter: member.isStarter,
      jerseyNumber: member.jerseyNumber,
      playerId: member.playerId,
      rosterStatus: member.rosterStatus,
      teamId: member.teamId
    })).sort((a, b) => a.playerId.localeCompare(b.playerId)),
    ruleProfile: input.ruleProfile ?? null,
    rosterVersion: input.rosterVersion
      ? { eventId: input.rosterVersion.eventId, eventSeq: input.rosterVersion.eventSeq }
      : null,
    schemaVersion: input.schemaVersion ?? 1,
    sourceRevision: input.sourceRevision,
    teamSide: input.teamSide
  });
}

export function canonicalRosterBaselineHash(input: CanonicalRosterBaselineInput) {
  return createHash("sha256").update(canonicalRosterBaselinePayload(input)).digest("hex");
}

export function projectLegacyConfirmation(confirmation: RosterConfirmation | null) {
  if (!confirmation?.confirmed) return { state: "UNCONFIRMED" as const, effective: false };
  if (!confirmation.version) return { state: "LEGACY_UNVERSIONED" as const, effective: false };
  return { state: "VERSIONED" as const, effective: true };
}

export function buildRosterBaselineProjection(input: {
  matchId?: string;
  teamSide: TeamSide;
  matchTeamId?: string;
  members: BaselineMember[];
  sourceRevision: string;
  version: RosterVersion | null;
  ruleProfile: string | null;
  confirmation: RosterConfirmation | null;
  integrityIssues?: string[];
}) {
  const integrityIssues = input.integrityIssues ?? [];
  const duplicateMemberIdentity = hasDuplicateMemberIdentity(input.members);
  const relationshipValid = typeof input.matchId === "string"
    && input.matchId.length > 0
    && typeof input.matchTeamId === "string"
    && input.matchTeamId.length > 0
    && input.members.every((member) => member.teamId === input.matchTeamId);
  const effectiveIntegrityIssues = [
    ...integrityIssues,
    ...(relationshipValid ? [] : ["INVALID_ROSTER_RELATIONSHIP"]),
    ...(duplicateMemberIdentity ? ["ROSTER_DUPLICATE_MEMBER_IDENTITY"] : [])
  ];
  const confirmation = projectLegacyConfirmation(input.confirmation);
  const requiredStarterCount = resolveSupportedStarterCount(input.ruleProfile);
  const starterCount = input.members.filter((member) => member.isStarter).length;
  let state: RosterReadinessState;

  if (effectiveIntegrityIssues.length > 0) state = "INVALID_ROSTER_RELATIONSHIP";
  else if (input.members.some((member) => member.eligibilityState === "BLOCKING_REVIEW")) state = "BLOCKING_ELIGIBILITY_REVIEW";
  else if (confirmation.state === "LEGACY_UNVERSIONED") state = "MALFORMED_LEGACY_STATE";
  else if (!input.version) state = "ROSTER_NOT_INITIALIZED";
  else if (requiredStarterCount === null || input.members.some((member) => member.eligibilityState === "NOT_EVALUATED")) state = "NOT_EVALUATED";
  else if (!confirmation.effective || !sameVersion(input.confirmation?.version ?? null, input.version)) state = "ROSTER_NOT_CONFIRMED";
  else if (starterCount !== requiredStarterCount) state = "STARTERS_INCOMPLETE";
  else state = "READY";

  const projection = {
    matchId: input.matchId ?? null,
    teamSide: input.teamSide,
    matchTeamId: input.matchTeamId ?? null,
    members: input.members,
    sourceRevision: input.sourceRevision,
    version: input.version,
    ruleProfile: input.ruleProfile,
    integrityIssues: effectiveIntegrityIssues,
    eligibilitySummary: summarizeEligibility(input.members),
    confirmation,
    readiness: { state, effective: state === "READY", requiredStarterCount, starterCount, captainSet: input.members.some((member) => member.isCaptain) }
  };
  return { ...projection, projectionIntegrityHash: canonicalRosterBaselineProjectionHash(projection) };
}

export function canonicalRosterBaselineProjectionHash(input: {
  matchId: string | null;
  teamSide: TeamSide;
  matchTeamId: string | null;
  members: BaselineMember[];
  sourceRevision: string;
  version: RosterVersion | null;
  ruleProfile: string | null;
  integrityIssues: string[];
  confirmation: { state: string; effective: boolean };
  readiness: { state: RosterReadinessState; effective: boolean; starterCount: number; requiredStarterCount: number | null; captainSet: boolean };
}) {
  return createHash("sha256").update(JSON.stringify({
    confirmation: input.confirmation,
    integrityIssues: input.integrityIssues,
    matchId: input.matchId,
    matchTeamId: input.matchTeamId,
    members: input.members,
    readiness: input.readiness,
    ruleProfile: input.ruleProfile,
    sourceRevision: input.sourceRevision,
    teamSide: input.teamSide,
    version: input.version
  })).digest("hex");
}

export function hasCanonicalRosterBaselineIntegrity(
  projection: RosterBaselineProjection,
  matchId: string,
  expectedMatchTeamId?: string
) {
  return projection.matchId === matchId
    && (!expectedMatchTeamId || projection.matchTeamId === expectedMatchTeamId)
    && projection.ruleProfile === SUPPORTED_ROSTER_RULE_PROFILE
    && projection.members.every((member) => parseBaselineMember(member) !== null)
    && !hasDuplicateMemberIdentity(projection.members)
    && projection.projectionIntegrityHash === canonicalRosterBaselineProjectionHash(projection);
}

export function hasCanonicalRosterBaselineEventAnchor(
  projection: RosterBaselineProjection,
  event: { seqNo: number; eventId: string; eventType: string; payload: unknown },
  teamSide: TeamSide,
  expectedMatchTeamId?: string
) {
  if (event.eventType !== "MATCH_ROSTER_BASELINE_IMPORTED") return false;
  if (expectedMatchTeamId && projection.matchTeamId !== expectedMatchTeamId) return false;
  let rebuilt: RosterBaselineProjection | null;
  try {
    rebuilt = rebuildRosterBaselineFromEvents([event], teamSide, projection.matchId ?? undefined, expectedMatchTeamId ?? projection.matchTeamId ?? undefined);
  } catch {
    return false;
  }
  const eventPayload = record(event.payload);
  const expectedMatchId = typeof eventPayload.matchId === "string" ? eventPayload.matchId : null;
  const eventMatchTeamId = typeof eventPayload.matchTeamId === "string" ? eventPayload.matchTeamId : null;
  return rebuilt !== null
    && expectedMatchId !== null
    && eventMatchTeamId !== null
    && rebuilt.matchId === expectedMatchId
    && rebuilt.matchTeamId === eventMatchTeamId
    && rebuilt.members.every((member) => member.teamId === eventMatchTeamId)
    && rebuilt.version?.eventSeq === event.seqNo
    && rebuilt.version.eventId === event.eventId
    && projection.version?.eventSeq === rebuilt.version.eventSeq
    && projection.version.eventId === rebuilt.version.eventId
    && projection.version.canonicalPayloadHash === rebuilt.version.canonicalPayloadHash
    && projection.projectionIntegrityHash === rebuilt.projectionIntegrityHash;
}

export function rebuildRosterBaselineFromEvents(
  events: Array<{ seqNo: number; eventId: string; eventType: string; payload: unknown }>,
  teamSide: TeamSide,
  expectedMatchId?: string,
  expectedTeamId?: string
) {
  return [...events]
    .sort((left, right) => left.seqNo - right.seqNo)
    .reduce<RosterBaselineProjection | null>((projection, event) => {
      if (event.eventType === "MATCH_ROSTER_BASELINE_IMPORTED") {
        const payload = record(event.payload);
        if (payload.teamSide !== teamSide && (payload.teamSide === "HOME" || payload.teamSide === "AWAY")) return projection;
      }
      assertEventRelationship(event, teamSide, expectedMatchId, expectedTeamId);
      return reduceRosterBaselineEvent(projection, event, teamSide, expectedMatchId, expectedTeamId);
    }, null);
}

export type RosterBaselineProjection = ReturnType<typeof buildRosterBaselineProjection>;

export function reduceRosterBaselineEvent(
  previous: RosterBaselineProjection | null,
  event: { seqNo: number; eventId: string; eventType: string; payload: unknown },
  teamSide: TeamSide,
  expectedMatchId?: string,
  expectedTeamId?: string
) {
  if (event.eventType !== "MATCH_ROSTER_BASELINE_IMPORTED") return previous;
  const payload = record(event.payload);
  assertEventRelationship(event, teamSide, expectedMatchId, expectedTeamId);
  if (payload.teamSide !== teamSide) return previous;
  const source = record(payload.source);
  const version = record(payload.rosterVersion);
  const integrity = record(payload.integrity);
  const confirmation = record(payload.confirmation);
  const eventMatchId = typeof payload.matchId === "string" && payload.matchId.length > 0 ? payload.matchId : null;
  const eventMatchTeamId = typeof payload.matchTeamId === "string" && payload.matchTeamId.length > 0 ? payload.matchTeamId : null;
  if (!eventMatchId || !eventMatchTeamId) throw new Error("ROSTER_INVALID_RELATIONSHIP");
  const rawMembers = Array.isArray(payload.members) ? payload.members : [];
  const parsedMembers = rawMembers.map(parseBaselineMember);
  const members = parsedMembers.filter((member): member is BaselineMember => member !== null);
  const unknownEligibility = parsedMembers.some((member) => member === null);
  if (unknownEligibility) throw new Error("ROSTER_UNKNOWN_ELIGIBILITY_STATE");
  assertNoDuplicateMemberIdentities(members);
  if (members.some((member) => member.teamId !== eventMatchTeamId)) throw new Error("ROSTER_INVALID_RELATIONSHIP");
  const sourceRevision = typeof source.legacyRosterRevision === "string" ? source.legacyRosterRevision : "";
  const ruleProfile = typeof payload.rulesProfile === "string" ? payload.rulesProfile : null;
  const rosterVersion = typeof version.eventId === "string" && typeof version.canonicalPayloadHash === "string"
    ? { eventSeq: Number(version.eventSeq ?? event.seqNo), eventId: version.eventId, canonicalPayloadHash: version.canonicalPayloadHash }
    : null;
  const schemaVersion = payload.schemaVersion;
  if (schemaVersion !== 1) throw new Error("ROSTER_EVENT_SCHEMA_VERSION_INVALID");
  if (!rosterVersion || rosterVersion.eventSeq !== event.seqNo || rosterVersion.eventId !== event.eventId) throw new Error("ROSTER_EVENT_ANCHOR_MISMATCH");
  const canonicalPayloadHash = canonicalRosterBaselineHash({
    eventType: event.eventType,
    schemaVersion,
    matchId: eventMatchId,
    matchTeamId: eventMatchTeamId,
    teamSide,
    sourceRevision,
    members,
    ruleProfile,
    rosterVersion: { eventSeq: event.seqNo, eventId: event.eventId }
  });
  if (rosterVersion.canonicalPayloadHash !== canonicalPayloadHash) throw new Error("ROSTER_CANONICAL_PAYLOAD_HASH_MISMATCH");
  return buildRosterBaselineProjection({
    matchId: eventMatchId,
    teamSide,
    matchTeamId: eventMatchTeamId,
    members,
    sourceRevision,
    version: rosterVersion,
    ruleProfile,
    confirmation: { confirmed: confirmation.status === "VERSIONED", version: rosterVersion },
    integrityIssues: [
      ...(Array.isArray(integrity.issues) ? integrity.issues.filter((issue): issue is string => typeof issue === "string") : []),
      ...(unknownEligibility ? ["UNKNOWN_ELIGIBILITY_STATE"] : [])
    ]
  });
}

export function rebuildRosterBaselineFromSnapshotAndEvents(
  snapshot: RosterBaselineProjection,
  tail: Array<{ seqNo: number; eventId: string; eventType: string; payload: unknown }>,
  teamSide: TeamSide,
  expectedMatchId?: string,
  expectedTeamId?: string
) {
  if (!snapshot.matchId || !snapshot.matchTeamId || snapshot.teamSide !== teamSide || !hasCanonicalRosterBaselineIntegrity(snapshot, snapshot.matchId)) {
    throw new Error("ROSTER_SNAPSHOT_INVALID");
  }
  if (snapshot.members.some((member) => member.teamId !== snapshot.matchTeamId)) {
    throw new Error("ROSTER_SNAPSHOT_INVALID_RELATIONSHIP");
  }
  const snapshotSeq = snapshot.version?.eventSeq ?? 0;
  return [...tail]
    .sort((left, right) => left.seqNo - right.seqNo)
    .reduce<RosterBaselineProjection>((projection, event) => {
      if (event.seqNo <= snapshotSeq) throw new Error("ROSTER_SNAPSHOT_TAIL_SEQUENCE_NOT_ADVANCED");
      assertEventRelationship(event, teamSide, expectedMatchId ?? snapshot.matchId ?? undefined, expectedTeamId ?? snapshot.matchTeamId ?? undefined);
      return reduceRosterBaselineEvent(projection, event, teamSide, expectedMatchId ?? snapshot.matchId ?? undefined, expectedTeamId ?? snapshot.matchTeamId ?? undefined) ?? projection;
    }, snapshot);
}

export function assertEventRelationship(
  event: { eventId: string; eventType: string; payload: unknown; matchId?: string },
  teamSide: TeamSide,
  expectedMatchId?: string,
  expectedTeamId?: string
) {
  if (event.eventType !== "MATCH_ROSTER_BASELINE_IMPORTED") {
    if (expectedMatchId && event.matchId !== expectedMatchId) throw new Error("ROSTER_EVENT_INVALID_RELATIONSHIP");
    return;
  }
  const payload = record(event.payload);
  const eventMatchId = typeof payload.matchId === "string" ? payload.matchId : null;
  const eventMatchTeamId = typeof payload.matchTeamId === "string" ? payload.matchTeamId : null;
  if (expectedMatchId && (event.matchId !== expectedMatchId || eventMatchId !== expectedMatchId)) throw new Error("ROSTER_EVENT_INVALID_RELATIONSHIP");
  if (expectedTeamId && eventMatchTeamId !== expectedTeamId) throw new Error("ROSTER_EVENT_INVALID_RELATIONSHIP");
  if (payload.teamSide !== teamSide || payload.schemaVersion !== 1 || !eventMatchId || !eventMatchTeamId) throw new Error("ROSTER_EVENT_INVALID_RELATIONSHIP");
  const rawMembers = Array.isArray(payload.members) ? payload.members : [];
  const memberIdentities = rawMembers.map((member) => record(member));
  if (memberIdentities.some((member) => typeof member.playerId !== "string" || typeof member.teamId !== "string")) throw new Error("ROSTER_EVENT_INVALID_RELATIONSHIP");
  const playerIds = new Set<string>();
  for (const member of memberIdentities) {
    if (playerIds.has(member.playerId as string)) throw new Error("ROSTER_DUPLICATE_MEMBER_IDENTITY");
    playerIds.add(member.playerId as string);
    if (member.teamId !== eventMatchTeamId) throw new Error("ROSTER_EVENT_INVALID_RELATIONSHIP");
  }
}

export function assertNoDuplicateMemberIdentities(members: BaselineMember[]) {
  if (hasDuplicateMemberIdentity(members)) throw new Error("ROSTER_DUPLICATE_MEMBER_IDENTITY");
}

function hasDuplicateMemberIdentity(members: BaselineMember[]) {
  const playerIds = new Set<string>();
  for (const member of members) {
    if (playerIds.has(member.playerId)) return true;
    playerIds.add(member.playerId);
  }
  return false;
}

function sameVersion(left: RosterVersion | null, right: RosterVersion | null) {
  return Boolean(left && right && left.eventSeq === right.eventSeq && left.eventId === right.eventId && left.canonicalPayloadHash === right.canonicalPayloadHash);
}

function summarizeEligibility(members: BaselineMember[]) {
  return {
    eligible: members.filter((member) => member.eligibilityState === "ELIGIBLE").length,
    blockingReview: members.filter((member) => member.eligibilityState === "BLOCKING_REVIEW").length,
    notEvaluated: members.filter((member) => member.eligibilityState === "NOT_EVALUATED").length
  };
}

export function parseBaselineMember(value: unknown): BaselineMember | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const member = value as Record<string, unknown>;
  if (
    typeof member.playerId !== "string" || member.playerId.length === 0
    || typeof member.teamId !== "string" || member.teamId.length === 0
    || typeof member.displayName !== "string" || member.displayName.length === 0
    || (member.jerseyNumber !== null && typeof member.jerseyNumber !== "string")
    || (member.rosterStatus !== "ACTIVE" && member.rosterStatus !== "BENCH" && member.rosterStatus !== "INACTIVE")
    || typeof member.isStarter !== "boolean"
    || typeof member.isCaptain !== "boolean"
    || !isEligibilityStatus(member.eligibilityState)
  ) return null;
  const allowedKeys = new Set(["playerId", "teamId", "displayName", "jerseyNumber", "rosterStatus", "isStarter", "isCaptain", "eligibilityState"]);
  if (Object.keys(member).some((key) => !allowedKeys.has(key))) return null;
  return {
    playerId: member.playerId,
    teamId: member.teamId,
    displayName: member.displayName,
    jerseyNumber: member.jerseyNumber,
    rosterStatus: member.rosterStatus,
    isStarter: member.isStarter,
    isCaptain: member.isCaptain,
    eligibilityState: member.eligibilityState
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
