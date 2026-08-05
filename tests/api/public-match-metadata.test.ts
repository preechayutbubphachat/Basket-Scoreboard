import { describe, expect, it } from "vitest";
import {
  normalizePublicLabel,
  normalizeScheduledStart,
  resolvePublicMatchMetadata
} from "../../apps/api/src/publicScoreboard/publicMatchMetadata";
import { toPublicScoreboardProjection } from "../../apps/api/src/publicScoreboard/publicScoreboardProjection";
import type { ScoreboardProjection } from "@basket-scoreboard/api-contracts";

function databaseWith(row: Record<string, unknown> | undefined) {
  return {
    query: async () => [[...(row ? [row] : [])], []]
  } as never;
}

const projection = {
  matchId: "match-public",
  homeScore: 10,
  awayScore: 12,
  teamFouls: { home: 1, away: 2 },
  periodNumber: 2,
  gameClockRemainingMs: 300000,
  shotClockRemainingMs: 24000,
  status: "LIVE",
  currentSeq: 4,
  lastEventSeq: 4,
  projectionVersion: "scoreboard-v1",
  homeTeamId: "private-home",
  awayTeamId: "private-away",
  playerFouls: []
} as unknown as ScoreboardProjection;

describe("public match metadata", () => {
  it("resolves the explicit complete allowlist and ignores extra metadata", async () => {
    const metadata = await resolvePublicMatchMetadata(databaseWith({
      match_code: " Round 2 ",
      scheduled_at: "2026-07-20 10:00:00",
      venue_name: " Municipal Arena ",
      metadata: JSON.stringify({ courtLabel: " Court A ", courtId: "private-court", privateNote: "hidden" })
    }), "match-public");

    expect(metadata).toEqual({
      roundLabel: "Round 2",
      courtLabel: "Court A",
      venueLabel: "Municipal Arena",
      scheduledStart: "2026-07-20T10:00:00.000Z"
    });
    expect(JSON.stringify(metadata)).not.toMatch(/courtId|privateNote|metadata|match_code|scheduled_at|venue_name/i);
  });

  it("omits invalid, blank, malformed and non-string values", async () => {
    expect(await resolvePublicMatchMetadata(databaseWith({
      match_code: " ", scheduled_at: "not-a-date", venue_name: "Arena\nPrivate", metadata: "[]"
    }), "match-public")).toBeUndefined();
    expect(await resolvePublicMatchMetadata(databaseWith({
      match_code: "R".repeat(201), scheduled_at: null, venue_name: null, metadata: { courtLabel: 42 }
    }), "match-public")).toBeUndefined();
    expect(await resolvePublicMatchMetadata(databaseWith({
      match_code: null, scheduled_at: null, venue_name: "Main Arena", metadata: "{broken"
    }), "match-public")).toEqual({ venueLabel: "Main Arena" });
  });

  it("preserves Unicode labels and validates deterministic timestamps", () => {
    expect(normalizePublicLabel("  รอบรองชนะเลิศ  ")).toBe("รอบรองชนะเลิศ");
    expect(normalizePublicLabel("โรงยิมโรงเรียนหนองพอก")).toBe("โรงยิมโรงเรียนหนองพอก");
    expect(normalizePublicLabel("Court\u0000A")).toBeUndefined();
    expect(normalizeScheduledStart("2026-02-29 10:00:00")).toBeUndefined();
    expect(normalizeScheduledStart("2026-07-20T10:00:00.125Z")).toBe("2026-07-20T10:00:00.125Z");
  });

  it("adds metadata through the explicit public mapper without private projection fields", async () => {
    const metadata = await resolvePublicMatchMetadata(databaseWith({
      match_code: "Final", scheduled_at: null, venue_name: null, metadata: { courtLabel: "Court A" }
    }), "match-public");
    const result = toPublicScoreboardProjection(projection, metadata);

    expect(result.matchMetadata).toEqual({ roundLabel: "Final", courtLabel: "Court A" });
    expect(JSON.stringify(result)).not.toMatch(/private-home|private-away|currentSeq|lastEventSeq|playerFouls/i);
  });

  it("does not share metadata across matches", async () => {
    const first = await resolvePublicMatchMetadata(databaseWith({
      match_code: "Round 1", scheduled_at: null, venue_name: null, metadata: {}
    }), "match-a");
    const second = await resolvePublicMatchMetadata(databaseWith({
      match_code: null, scheduled_at: null, venue_name: "Arena B", metadata: {}
    }), "match-b");

    expect(toPublicScoreboardProjection({ ...projection, matchId: "match-a" }, first).matchMetadata).toEqual({ roundLabel: "Round 1" });
    expect(toPublicScoreboardProjection({ ...projection, matchId: "match-b" }, second).matchMetadata).toEqual({ venueLabel: "Arena B" });
    expect(toPublicScoreboardProjection({ ...projection, matchId: "match-c" }).matchMetadata).toBeUndefined();
  });
});
