import { describe, expect, it } from "vitest";
import {
  recordPlayerTechnicalFoulCommandSchema,
  type ScoreboardProjection
} from "@basket-scoreboard/api-contracts";
import {
  applyPlayerFoulAdded,
  createInitialScoreboardProjection
} from "../../apps/api/src/matchEventStore/projection";
import { toPublicScoreboardProjection } from "../../apps/api/src/publicScoreboard/publicScoreboardProjection";
import { getMatchReplayWithConnection } from "../../apps/api/src/matchEventStore/replayService";

const command = {
  commandId: "11111111-1111-4111-8111-111111111111",
  matchId: "22222222-2222-4222-8222-222222222222",
  expectedSeq: 3,
  correlationId: "33333333-3333-4333-8333-333333333333",
  clientTimestamp: "2026-07-28T00:00:00.000Z",
  payload: {
    playerId: "44444444-4444-4444-8444-444444444444"
  }
};

describe("RM-06 active-player technical foul contract", () => {
  it("accepts only playerId from the client and leaves TECHNICAL derivation to the server", () => {
    expect(recordPlayerTechnicalFoulCommandSchema.parse(command).payload).toEqual({
      playerId: command.payload.playerId
    });
    expect(() =>
      recordPlayerTechnicalFoulCommandSchema.parse({
        ...command,
        payload: { ...command.payload, foulType: "TECHNICAL" }
      })
    ).toThrow();
    expect(() =>
      recordPlayerTechnicalFoulCommandSchema.parse({
        ...command,
        payload: { ...command.payload, teamSide: "HOME" }
      })
    ).toThrow();
  });

  it("keeps the private player aggregate canonical and category-minimal", () => {
    const player: ScoreboardProjection["playerFouls"][number] = {
      playerId: command.payload.playerId,
      teamSide: "HOME",
      playerName: "Active Player",
      jerseyNumber: "4",
      fouls: 2,
      personalFouls: 1,
      technicalFouls: 1,
      totalTowardLimit: 2
    };

    expect(Object.keys(player).sort()).toEqual([
      "fouls",
      "jerseyNumber",
      "personalFouls",
      "playerId",
      "playerName",
      "teamSide",
      "technicalFouls",
      "totalTowardLimit"
    ]);
  });

  it("records one technical foul and one derived team foul without other state side effects", () => {
    const initial = {
      ...createInitialScoreboardProjection(command.matchId),
      homeScore: 8,
      awayScore: 7,
      gameClockRemainingMs: 321_000,
      shotClockRemainingMs: 13_000,
      gameClock: { remainingMs: 321_000, running: false, lastStartedAt: null },
      shotClock: { remainingMs: 13_000, running: false, lastStartedAt: null }
    };

    const next = applyPlayerFoulAdded(initial, {
      teamSide: "HOME",
      playerId: command.payload.playerId,
      playerName: "Active Player",
      jerseyNumber: "4",
      foulType: "TECHNICAL",
      reason: null,
      periodNumber: 2
    }, 4);

    expect(next.playerFouls).toEqual([{
      playerId: command.payload.playerId,
      teamSide: "HOME",
      playerName: "Active Player",
      jerseyNumber: "4",
      fouls: 1,
      personalFouls: 0,
      technicalFouls: 1,
      totalTowardLimit: 1
    }]);
    expect(next.teamFouls).toEqual({ home: 1, away: 0 });
    expect(next.teamFoulsByPeriod).toEqual({ "2": { home: 1, away: 0 } });
    expect(next).toMatchObject({
      homeScore: 8,
      awayScore: 7,
      gameClockRemainingMs: 321_000,
      shotClockRemainingMs: 13_000,
      gameClock: initial.gameClock,
      shotClock: initial.shotClock
    });
  });

  it("does not serialize private player foul aggregates or technical entitlement publicly", () => {
    const privateProjection = applyPlayerFoulAdded(createInitialScoreboardProjection(command.matchId), {
      teamSide: "HOME",
      playerId: command.payload.playerId,
      playerName: "Private Player",
      jerseyNumber: "4",
      foulType: "TECHNICAL",
      reason: null,
      periodNumber: 1
    }, 1);

    const publicJson = JSON.stringify(toPublicScoreboardProjection(privateProjection));
    expect(publicJson).not.toContain("playerFouls");
    expect(publicJson).not.toContain("technicalFouls");
    expect(publicJson).not.toContain("freeThrowEntitlement");
    expect(publicJson).not.toContain("Private Player");
  });

  it("marks the exact causally linked technical consequences voided after correction", async () => {
    const foulEventId = "55555555-5555-4555-8555-555555555551";
    const entitlementEventId = "55555555-5555-4555-8555-555555555552";
    const resumptionEventId = "55555555-5555-4555-8555-555555555553";
    const eventRow = (seqNo: number, eventId: string, eventType: string, payload: unknown) => ({
      event_id: eventId,
      match_id: command.matchId,
      seq_no: seqNo,
      event_type: eventType,
      payload: JSON.stringify(payload),
      actor_user_id: "66666666-6666-4666-8666-666666666666",
      actor_role: "ADMIN",
      device_id: "test-device",
      occurred_at: new Date("2026-07-28T00:00:00.000Z"),
      recorded_at: new Date("2026-07-28T00:00:00.000Z"),
      command_id: command.commandId,
      expected_seq: 0,
      correlation_id: command.correlationId,
      causation_id: null,
      reason: null,
      rule_profile_id: "FIBA_2024"
    });
    const events = [
      eventRow(1, foulEventId, "PLAYER_FOUL_ADDED", {
        playerId: command.payload.playerId,
        playerName: "Active Player",
        teamSide: "HOME",
        foulType: "TECHNICAL"
      }),
      eventRow(2, entitlementEventId, "FREE_THROW_ENTITLEMENT_CREATED", {
        sourceFoulEventId: foulEventId,
        attempts: 1,
        awardedTo: "AWAY"
      }),
      eventRow(3, resumptionEventId, "PLAY_RESUMPTION_DECLARED", {
        sourceEntitlementEventId: entitlementEventId,
        mode: "RESUME_INTERRUPTED_PLAY"
      }),
      eventRow(4, "55555555-5555-4555-8555-555555555554", "PLAYER_FOUL_CORRECTED", {
        correctedEventSeq: 1,
        newValue: {
          consequenceDisposition: "VOIDED_WITH_SOURCE_FOUL",
          voidedConsequenceEventIds: [entitlementEventId, resumptionEventId]
        }
      })
    ];
    const projection = { ...createInitialScoreboardProjection(command.matchId), currentSeq: 4 };
    const connection = {
      async query(sql: string) {
        if (sql.includes("FROM matches m")) {
          return [[{
            match_id: command.matchId,
            match_status: "LIVE",
            projection_data: JSON.stringify(projection),
            last_event_seq: 4,
            home_team_id: null,
            home_team_name: "HOME",
            away_team_id: null,
            away_team_name: "AWAY",
            updated_at: new Date("2026-07-28T00:00:00.000Z")
          }], []];
        }
        if (sql.includes("FROM match_events")) return [events, []];
        throw new Error(`Unexpected replay query: ${sql}`);
      }
    };

    const replay = await getMatchReplayWithConnection(connection as never, command.matchId, {
      group: "foul",
      limit: 20
    });

    expect(replay?.items.filter((item) =>
      item.eventType === "FREE_THROW_ENTITLEMENT_CREATED" || item.eventType === "PLAY_RESUMPTION_DECLARED"
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: expect.stringContaining("(voided)"), description: expect.stringContaining("Voided by player-foul correction") }),
      expect.objectContaining({ title: expect.stringContaining("(voided)"), description: expect.stringContaining("Voided by player-foul correction") })
    ]));
  });
});
