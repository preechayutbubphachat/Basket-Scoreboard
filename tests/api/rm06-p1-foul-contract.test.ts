import { describe, expect, it } from "vitest";
import {
  addPlayerFoulCommandSchema,
  addTeamFoulCommandSchema
} from "@basket-scoreboard/api-contracts";

const envelope = {
  commandId: "00000000-0000-4000-8000-000000000001",
  matchId: "00000000-0000-4000-8000-000000000002",
  expectedSeq: 0,
  correlationId: "00000000-0000-4000-8000-000000000003",
  clientTimestamp: "2026-07-19T00:00:00.000Z"
};

describe("RM-06-P1 foul command contract", () => {
  it.each(["TECHNICAL", "UNSPORTSMANLIKE", "DISQUALIFYING", "OTHER", "SPECIAL"])(
    "rejects unsupported player foul type %s before append",
    (foulType) => {
      const result = addPlayerFoulCommandSchema.safeParse({
        ...envelope,
        payload: {
          teamSide: "HOME",
          playerId: "00000000-0000-4000-8000-000000000004",
          foulType,
          reason: null
        }
      });

      expect(result.success).toBe(false);
    }
  );

  it("accepts only a player-attributed PERSONAL foul", () => {
    const result = addPlayerFoulCommandSchema.safeParse({
      ...envelope,
      payload: {
        teamSide: "AWAY",
        playerId: "00000000-0000-4000-8000-000000000004",
        foulType: "PERSONAL",
        reason: null
      }
    });

    expect(result.success).toBe(true);
  });

  it("rejects direct team foul commands before append", () => {
    const result = addTeamFoulCommandSchema.safeParse({
      ...envelope,
      payload: {
        teamSide: "HOME",
        foulType: "PERSONAL",
        reason: null
      }
    });

    expect(result.success).toBe(false);
  });
});
