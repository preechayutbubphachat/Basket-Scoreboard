import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  PublicRecentAction,
  PublicScoreboardProjection,
  ScoreboardProjection
} from "@basket-scoreboard/api-contracts";
import {
  toPublicRecentActions,
  toPublicScoreboardProjection
} from "../../apps/api/src/publicScoreboard/publicScoreboardProjection";

const forbiddenKeys = new Set([
  "sourceEventSeq", "initializedAtSeq", "recentActionState", "version", "playerId",
  "playerName", "jerseyNumber", "actor", "device", "role", "session", "token", "csrf",
  "commandId", "correlationId", "causationId", "audit", "correction", "reason", "note",
  "requester", "rawEvents", "lastEventSeq", "currentSeq", "expectedSeq", "projectionVersion",
  "eventSeq", "streamVersion"
]);

describe("public recent-action projection", () => {
  it("defines the explicit public discriminated union without provenance", () => {
    expectTypeOf<PublicScoreboardProjection>().toHaveProperty("recentActions");
    expectTypeOf<PublicRecentAction>().not.toHaveProperty("sourceEventSeq");
    expectTypeOf<PublicRecentAction>().not.toHaveProperty("playerId");
  });

  it("maps every approved kind in newest-first order and strips private fields", () => {
    const state = {
      version: 1,
      initializedAtSeq: 10,
      items: [
        privateItem(18, { kind: "SCORE", teamSide: "HOME", points: 3 }),
        privateItem(17, { kind: "TEAM_FOUL", teamSide: "AWAY" }),
        privateItem(16, { kind: "TIMEOUT", teamSide: "HOME" })
      ]
    };

    expect(toPublicRecentActions(state)).toEqual([
      { kind: "SCORE", teamSide: "HOME", points: 3 },
      { kind: "TEAM_FOUL", teamSide: "AWAY" },
      { kind: "TIMEOUT", teamSide: "HOME" }
    ]);
    expect([...collectForbiddenKeys(toPublicRecentActions(state))]).toEqual([]);

    expect(toPublicRecentActions({
      version: 1,
      initializedAtSeq: 10,
      items: [
        privateItem(15, { kind: "PERIOD", phase: "ENDED", periodType: "REGULATION", periodNumber: 4 }),
        privateItem(14, { kind: "PERIOD", phase: "STARTED", periodType: "OVERTIME", periodNumber: 5 }),
        privateItem(13, { kind: "GAME_STATUS", status: "FINAL" })
      ]
    })).toEqual([
      { kind: "PERIOD", phase: "ENDED", periodType: "REGULATION", periodNumber: 4 },
      { kind: "PERIOD", phase: "STARTED", periodType: "OVERTIME", periodNumber: 5 },
      { kind: "GAME_STATUS", status: "FINAL" }
    ]);
  });

  it("returns empty for absent or malformed state and omits invalid or pre-cutoff items", () => {
    expect(toPublicRecentActions(undefined)).toEqual([]);
    expect(toPublicRecentActions({ version: 2, initializedAtSeq: 0, items: [] })).toEqual([]);
    expect(toPublicRecentActions({ version: 1, initializedAtSeq: 2, items: [
      privateItem(2, { kind: "SCORE", teamSide: "HOME", points: 2 }),
      privateItem(3, { kind: "SCORE", teamSide: "HOME", points: 4 }),
      privateItem(4, { kind: "UNKNOWN", teamSide: "HOME" }),
      privateItem(5, { kind: "PERIOD", phase: "STARTED", periodType: "REGULATION", periodNumber: 0 })
    ] })).toEqual([]);
  });

  it("caps output at three without reading later items", () => {
    expect(toPublicRecentActions({ version: 1, initializedAtSeq: 0, items: [
      privateItem(5, { kind: "SCORE", teamSide: "HOME", points: 1 }),
      privateItem(4, { kind: "SCORE", teamSide: "HOME", points: 2 }),
      privateItem(3, { kind: "SCORE", teamSide: "HOME", points: 3 }),
      privateItem(2, { kind: "TIMEOUT", teamSide: "AWAY" })
    ] })).toHaveLength(3);
  });

  it("serializes complete replacement lists without cross-match state", () => {
    const first = toPublicScoreboardProjection(projection("match-a", {
      version: 1,
      initializedAtSeq: 0,
      items: [privateItem(1, { kind: "SCORE", teamSide: "HOME", points: 2 })]
    }));
    const second = toPublicScoreboardProjection(projection("match-b", {
      version: 1,
      initializedAtSeq: 4,
      items: []
    }));

    expect(first.recentActions).toEqual([{ kind: "SCORE", teamSide: "HOME", points: 2 }]);
    expect(second.recentActions).toEqual([]);
  });
});

function projection(matchId: string, recentActionState: unknown) {
  return {
    matchId,
    homeScore: 0,
    awayScore: 0,
    teamFouls: { home: 0, away: 0 },
    playerFouls: [],
    periodNumber: 1,
    gameClockRemainingMs: 600000,
    shotClockRemainingMs: 24000,
    status: "LIVE",
    currentSeq: 0,
    projectionVersion: "scoreboard-v1",
    recentActionState
  } as ScoreboardProjection & { recentActionState: unknown };
}

function privateItem(sourceEventSeq: number, item: Record<string, unknown>) {
  return {
    sourceEventSeq,
    ...item,
    playerId: "private-player",
    playerName: "Private Player",
    jerseyNumber: "7",
    actor: "private-actor",
    commandId: "private-command",
    correctionReason: "private-reason",
    rawPayload: { private: true }
  };
}

function collectForbiddenKeys(value: unknown, found = new Set<string>()) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) found.add(key);
    collectForbiddenKeys(child, found);
  }
  return found;
}
