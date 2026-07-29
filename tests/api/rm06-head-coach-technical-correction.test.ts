import { describe, expect, it } from "vitest";
import { alphaCorrectionCommandSchema } from "@basket-scoreboard/api-contracts";
import {
  applyHeadCoachTechnicalFoulCorrected,
  applyHeadCoachTechnicalFoulAdded,
  createInitialScoreboardProjection
} from "../../apps/api/src/matchEventStore/projection";
import { appendAlphaCorrection } from "../../apps/api/src/matchEventStore/correctionCommands";

const matchId = "11111111-1111-4111-8111-111111111111";

describe("RM-06 head-coach technical correction", () => {
  it("appends one causally-linked correction that voids the exact free-throw and resumption pair without repeating their administered consequences", async () => {
    const designationId = "44444444-4444-4444-8444-444444444444";
    const sourceEventId = "source-foul";
    const entitlementEventId = "entitlement";
    const resumptionEventId = "resumption";
    const projection = applyHeadCoachTechnicalFoulAdded({
      ...createInitialScoreboardProjection(matchId),
      status: "LIVE",
      teamFouls: { home: 3, away: 2 }
    }, {
      teamSide: "HOME",
      headCoachDesignationId: designationId,
      headCoachDisplayNameSnapshot: "Coach Narin",
      periodNumber: 2,
      gameClockSnapshot: "314000",
      ruleProfileId: "FIBA_2024",
      ruleVersion: "2024.v1"
    }, 1);
    projection.currentSeq = 3;
    const events = [
      eventRow(1, sourceEventId, "HEAD_COACH_TECHNICAL_FOUL_RECORDED", { teamSide: "HOME", headCoachDesignationId: designationId, headCoachDisplayNameSnapshot: "Coach Narin", classification: "C" }, null),
      eventRow(2, entitlementEventId, "FREE_THROW_ENTITLEMENT_CREATED", { sourceFoulEventId: sourceEventId, attempts: 1, awardedTo: "AWAY" }, sourceEventId),
      eventRow(3, resumptionEventId, "PLAY_RESUMPTION_DECLARED", { sourceEntitlementEventId: entitlementEventId, mode: "RESUME_INTERRUPTED_PLAY" }, entitlementEventId)
    ];
    const writes: Array<{ sql: string; params: unknown[] }> = [];
    let currentSeq = 3;
    let storedProjection = projection;
    const connection = {
      beginTransaction: async () => undefined,
      commit: async () => undefined,
      rollback: async () => undefined,
      release: () => undefined,
      async query(sql: string, params: unknown[] = []) {
        writes.push({ sql, params });
        if (sql.includes("FROM command_deduplication")) return [[], []];
        if (sql.includes("SELECT last_seq_no FROM match_streams")) return [[{ last_seq_no: currentSeq }], []];
        if (sql.includes("FROM match_events") && sql.includes("seq_no =")) return [[events.find((event) => event.seq_no === params[1])].filter(Boolean), []];
        if (sql.includes("FROM match_events")) return [[...events], []];
        if (sql.includes("SELECT projection_data, last_event_seq FROM match_projections")) return [[{ projection_data: JSON.stringify(storedProjection), last_event_seq: currentSeq }], []];
        if (sql.includes("INSERT INTO match_events")) {
          events.push(eventRow(Number(params[2]), String(params[0]), String(params[3]), JSON.parse(String(params[4])), params[12] === null ? null : String(params[12])));
          return [{ affectedRows: 1 }, []];
        }
        if (sql.startsWith("UPDATE match_streams")) { currentSeq = Number(params[0]); return [{ affectedRows: 1 }, []]; }
        if (sql.startsWith("UPDATE match_projections")) { storedProjection = JSON.parse(String(params[0])); return [{ affectedRows: 1 }, []]; }
        return [{ affectedRows: 1 }, []];
      }
    };
    const command = {
      commandId: "22222222-2222-4222-8222-222222222222",
      matchId,
      expectedSeq: 3,
      correlationId: "33333333-3333-4333-8333-333333333333",
      clientTimestamp: "2026-07-29T00:00:00.000Z",
      correctedEventSeq: 1,
      correctionKind: "HEAD_COACH_TECHNICAL_UNDO" as const,
      reason: "Recorded against the wrong head coach",
      payload: { correctionKind: "HEAD_COACH_TECHNICAL_UNDO" as const, target: {}, delta: null, newValue: null }
    };

    const result = await appendAlphaCorrection({ pool: { getConnection: async () => connection } as never, command, user: { userId: "55555555-5555-4555-8555-555555555555", role: "ADMIN", deviceId: "test" } as never });
    expect(result).toMatchObject({ status: "ACCEPTED", currentSeq: 4, appendedEvents: [{ eventType: "HEAD_COACH_TECHNICAL_FOUL_CORRECTED", seqNo: 4 }] });
    const correction = events.at(-1)!;
    expect(correction.causation_id).toBe(sourceEventId);
    expect(JSON.parse(String(correction.payload))).toMatchObject({
      correctedEventSeq: 1,
      correctionKind: "HEAD_COACH_TECHNICAL_UNDO",
      newValue: { consequenceDisposition: "VOIDED_WITH_SOURCE_FOUL", voidedConsequenceEventIds: [entitlementEventId, resumptionEventId] }
    });
    expect(events.filter((event) => event.event_type === "FREE_THROW_ENTITLEMENT_CREATED" || event.event_type === "PLAY_RESUMPTION_DECLARED")).toHaveLength(2);
    expect(storedProjection.headCoachTechnicals[0]).toMatchObject({ coachTechnicalCount: 0, disqualificationReviewRequired: false });
    expect(storedProjection.teamFouls).toEqual({ home: 3, away: 2 });
    expect(writes.some(({ sql }) => sql.includes("INSERT INTO command_deduplication"))).toBe(true);
  });

  it("keeps full event replay and snapshot-tail application equivalent for the private coach count", () => {
    const base = { ...createInitialScoreboardProjection(matchId), status: "LIVE" as const };
    const payload = { teamSide: "HOME" as const, headCoachDesignationId: "44444444-4444-4444-8444-444444444444", headCoachDisplayNameSnapshot: "Coach Narin", periodNumber: 2, gameClockSnapshot: "314000", ruleProfileId: "FIBA_2024" as const, ruleVersion: "2024.v1" };
    const replayed = applyHeadCoachTechnicalFoulCorrected(applyHeadCoachTechnicalFoulAdded(base, payload, 1), { designationId: payload.headCoachDesignationId }, 4);
    const snapshotAtSeq1 = applyHeadCoachTechnicalFoulAdded(base, payload, 1);
    const tailed = applyHeadCoachTechnicalFoulCorrected(snapshotAtSeq1, { designationId: payload.headCoachDesignationId }, 4);
    expect(replayed).toMatchObject({ currentSeq: 4, headCoachTechnicals: [{ coachTechnicalCount: 0, disqualificationReviewRequired: false }] });
    expect(tailed).toEqual(replayed);
  });

  it("accepts only the dedicated correction kind and compensates the private coach count", () => {
    expect(alphaCorrectionCommandSchema.parse({
      commandId: "22222222-2222-4222-8222-222222222222",
      matchId,
      expectedSeq: 3,
      correlationId: "33333333-3333-4333-8333-333333333333",
      clientTimestamp: "2026-07-29T00:00:00.000Z",
      correctedEventSeq: 1,
      correctionKind: "HEAD_COACH_TECHNICAL_UNDO",
      reason: "Recorded against the wrong head coach",
      payload: { correctionKind: "HEAD_COACH_TECHNICAL_UNDO", target: {}, delta: null, newValue: null }
    }).correctionKind).toBe("HEAD_COACH_TECHNICAL_UNDO");

    const corrected = applyHeadCoachTechnicalFoulCorrected({
      ...createInitialScoreboardProjection(matchId),
      teamFouls: { home: 3, away: 2 },
      headCoachTechnicals: [{
        designationId: "44444444-4444-4444-8444-444444444444",
        teamSide: "HOME",
        displayNameSnapshot: "Head Coach",
        coachTechnicalCount: 2,
        disqualificationReviewRequired: true
      }]
    }, {
      designationId: "44444444-4444-4444-8444-444444444444"
    }, 4);

    expect(corrected.headCoachTechnicals[0]).toMatchObject({
      coachTechnicalCount: 1,
      disqualificationReviewRequired: false
    });
    expect(corrected.teamFouls).toEqual({ home: 3, away: 2 });
    expect(corrected.playerFouls).toEqual([]);
  });
});

function eventRow(seq_no: number, event_id: string, event_type: string, payload: Record<string, unknown>, causation_id: string | null) {
  return {
    event_id,
    match_id: matchId,
    seq_no,
    event_type,
    payload: JSON.stringify(payload),
    actor_user_id: "55555555-5555-4555-8555-555555555555",
    actor_role: "ADMIN",
    device_id: "test",
    occurred_at: new Date("2026-07-29T00:00:00.000Z"),
    recorded_at: new Date("2026-07-29T00:00:00.000Z"),
    command_id: `command-${seq_no}`,
    expected_seq: seq_no - 1,
    correlation_id: `correlation-${seq_no}`,
    causation_id,
    reason: null,
    rule_profile_id: "FIBA_2024"
  };
}
