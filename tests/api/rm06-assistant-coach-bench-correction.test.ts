import { describe, expect, it, vi } from "vitest";
import { appendAlphaCorrection } from "../../apps/api/src/matchEventStore/correctionCommands";
import { applyAssistantCoachBenchTechnicalFoulAdded, createInitialScoreboardProjection } from "../../apps/api/src/matchEventStore/projection";

const matchId = "11111111-1111-4111-8111-111111111111";
const assistantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const headCoachId = "44444444-4444-4444-8444-444444444444";
const user = { userId: "55555555-5555-4555-8555-555555555555", role: "ADMIN" as const, deviceId: "test" };

function row(seqNo: number, eventId: string, eventType: string, payload: Record<string, unknown>, causationId: string | null) {
  return { event_id: eventId, match_id: matchId, seq_no: seqNo, event_type: eventType, payload: JSON.stringify(payload), actor_user_id: user.userId, actor_role: user.role, device_id: user.deviceId, occurred_at: new Date("2026-07-30T00:00:00.000Z"), recorded_at: new Date("2026-07-30T00:00:00.000Z"), command_id: `source-${seqNo}`, expected_seq: seqNo - 1, correlation_id: `correlation-${seqNo}`, causation_id: causationId, reason: null, rule_profile_id: "FIBA_2024" };
}

describe("RM-06 assistant-coach bench correction runtime", () => {
  it("runs the real correction transaction, voids the exact causal consequences, and compensates the charged head-coach projection once", async () => {
    const foulId = "foul-event";
    const entitlementId = "entitlement-event";
    const resumptionId = "resumption-event";
    const foulPayload = { teamSide: "HOME" as const, assistantCoachDesignationId: assistantId, assistantCoachDisplayNameSnapshot: "Assistant Mira", chargedHeadCoachDesignationId: headCoachId, chargedHeadCoachDisplayNameSnapshot: "Coach Narin", classification: "B" as const };
    const events = [
      row(1, foulId, "BENCH_TECHNICAL_FOUL_RECORDED", foulPayload, null),
      row(2, entitlementId, "FREE_THROW_ENTITLEMENT_CREATED", { sourceFoulEventId: foulId, attempts: 1, awardedTo: "AWAY" }, foulId),
      row(3, resumptionId, "PLAY_RESUMPTION_DECLARED", { sourceEntitlementEventId: entitlementId, mode: "RESUME_INTERRUPTED_PLAY" }, entitlementId)
    ];
    let currentSeq = 3;
    let projection = applyAssistantCoachBenchTechnicalFoulAdded({ ...createInitialScoreboardProjection(matchId), status: "LIVE", teamFouls: { home: 3, away: 2 } }, foulPayload, 1);
    projection.currentSeq = 3;
    const receipts: unknown[] = [];
    const connection = {
      beginTransaction: vi.fn(async () => undefined), commit: vi.fn(async () => undefined), rollback: vi.fn(async () => undefined), release: vi.fn(),
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes("FROM command_deduplication")) return [[], []];
        if (sql.includes("SELECT last_seq_no FROM match_streams")) return [[{ last_seq_no: currentSeq }], []];
        if (sql.includes("FROM match_events") && sql.includes("seq_no =")) return [[events.find((event) => event.seq_no === params[1])].filter(Boolean), []];
        if (sql.includes("FROM match_events")) return [[...events], []];
        if (sql.includes("SELECT projection_data, last_event_seq FROM match_projections")) return [[{ projection_data: JSON.stringify(projection), last_event_seq: currentSeq }], []];
        if (sql.includes("INSERT INTO match_events")) { events.push(row(Number(params[2]), String(params[0]), String(params[3]), JSON.parse(String(params[4])), params[12] == null ? null : String(params[12]))); return [{ affectedRows: 1 }, []]; }
        if (sql.startsWith("UPDATE match_streams")) { currentSeq = Number(params[0]); return [{ affectedRows: 1 }, []]; }
        if (sql.startsWith("UPDATE match_projections")) { projection = JSON.parse(String(params[0])); return [{ affectedRows: 1 }, []]; }
        if (sql.includes("INSERT INTO command_deduplication")) { receipts.push(params); return [{ affectedRows: 1 }, []]; }
        return [{ affectedRows: 1 }, []];
      }
    };
    const command = { commandId: "22222222-2222-4222-8222-222222222222", matchId, expectedSeq: 3, correlationId: "33333333-3333-4333-8333-333333333333", clientTimestamp: "2026-07-30T00:00:00.000Z", correctedEventSeq: 1, correctionKind: "BENCH_TECHNICAL_UNDO" as const, reason: "Assistant technical entered in error", payload: { correctionKind: "BENCH_TECHNICAL_UNDO" as const, target: {}, delta: null, newValue: null } };

    const result = await appendAlphaCorrection({ pool: { getConnection: vi.fn(async () => connection) } as never, command, user });
    expect(result).toMatchObject({ status: "ACCEPTED", currentSeq: 4, appendedEvents: [{ seqNo: 4, eventType: "BENCH_TECHNICAL_FOUL_CORRECTED" }] });
    const correction = events.at(-1)!;
    expect(correction.causation_id).toBe(foulId);
    expect(JSON.parse(String(correction.payload))).toMatchObject({ correctedEventSeq: 1, correctionKind: "BENCH_TECHNICAL_UNDO", oldValue: { assistantCoachDesignationId: assistantId, chargedHeadCoachDesignationId: headCoachId, consequenceEventIds: [entitlementId, resumptionId] }, newValue: { consequenceDisposition: "VOIDED_WITH_SOURCE_FOUL", voidedConsequenceEventIds: [entitlementId, resumptionId] } });
    expect(events.filter((event) => event.event_type === "FREE_THROW_ENTITLEMENT_CREATED" || event.event_type === "PLAY_RESUMPTION_DECLARED")).toHaveLength(2);
    expect(projection.headCoachTechnicals[0]).toMatchObject({ designationId: headCoachId, benchTechnicalCount: 0, disqualificationReviewRequired: false, disqualificationReviewReason: null });
    expect(projection.teamFouls).toEqual({ home: 3, away: 2 });
    expect(projection.playerFouls).toEqual([]);
    expect(receipts).toHaveLength(1);
    expect(connection.commit).toHaveBeenCalledOnce();
  });
});
