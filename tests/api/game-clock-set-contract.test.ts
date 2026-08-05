import { describe, expect, test } from "vitest";
import {
  gameClockSetPayloadSchema,
  gameClockStartCommandSchema,
  gameClockStopCommandSchema,
  shotClockResetPayloadSchema,
  shotClockSetPayloadSchema
} from "@basket-scoreboard/api-contracts";

describe("RM-04 P2 game-clock set contract", () => {
  test("requires a trimmed, non-empty reason of at most 500 characters", () => {
    for (const reason of [undefined, null, "", "   ", "x".repeat(501)]) {
      expect(gameClockSetPayloadSchema.safeParse({ remainingMs: 150000, reason }).success).toBe(false);
    }
    expect(gameClockSetPayloadSchema.parse({ remainingMs: 150000, reason: "  table correction  " })).toEqual({
      remainingMs: 150000,
      reason: "table correction"
    });
    expect(gameClockSetPayloadSchema.safeParse({ remainingMs: 600000, reason: "x".repeat(500) }).success).toBe(true);
  });

  test("retains existing time bounds and independent clock contracts", () => {
    expect(gameClockSetPayloadSchema.safeParse({ remainingMs: 600001, reason: "valid" }).success).toBe(false);
    expect(shotClockSetPayloadSchema.safeParse({ remainingMs: 14000, reason: "shot correction" }).success).toBe(true);
    expect(shotClockResetPayloadSchema.safeParse({ resetToMs: 24000, reason: null }).success).toBe(true);

    const envelope = {
      commandId: "2f71172e-5991-4265-a29c-d5218aa05171",
      matchId: "63207413-b570-4d70-9107-a612883e2299",
      expectedSeq: 0,
      correlationId: "e3a4beb9-32dc-46fc-8745-bbc73a193c57",
      clientTimestamp: "2026-07-18T00:00:00.000Z",
      payload: {}
    };
    expect(gameClockStartCommandSchema.safeParse(envelope).success).toBe(true);
    expect(gameClockStopCommandSchema.safeParse(envelope).success).toBe(true);
  });

  test("requires and canonicalizes only the shot-set correction reason", () => {
    for (const reason of [undefined, null, "", "   ", "x".repeat(501)]) {
      expect(shotClockSetPayloadSchema.safeParse({ remainingMs: 14000, reason }).success).toBe(false);
    }
    expect(shotClockSetPayloadSchema.parse({ remainingMs: 0, reason: "  shot correction  " })).toEqual({ remainingMs: 0, reason: "shot correction" });
    expect(shotClockSetPayloadSchema.safeParse({ remainingMs: 24000, reason: "x".repeat(500) }).success).toBe(true);
    expect(shotClockSetPayloadSchema.safeParse({ remainingMs: 24001, reason: "valid" }).success).toBe(false);
    expect(shotClockResetPayloadSchema.safeParse({ resetToMs: 14000, reason: null }).success).toBe(true);
    expect(shotClockResetPayloadSchema.safeParse({ resetToMs: 12000, reason: null }).success).toBe(false);
  });
});
