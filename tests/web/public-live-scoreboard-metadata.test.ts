import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PublicMatchMetadata, PublicScoreboardProjection } from "@basket-scoreboard/api-contracts";
import { PublicLiveScoreboard } from "../../apps/web/src/components/PublicLiveScoreboard";
import {
  buildPublicArenaMatchMetadataDisplay,
  buildPublicScoreboardDisplayModel,
  publicScoreboardDisplayHasPrivateExposure
} from "../../apps/web/src/lib/publicScoreboardDisplay";

const baseProjection: PublicScoreboardProjection = {
  matchId: "93bd90bd-040d-48f5-bb9c-1354d6e80077",
  homeTeamName: "Home",
  awayTeamName: "Away",
  homeScore: 27,
  awayScore: 36,
  teamFouls: { home: 2, away: 1 },
  timeouts: {
    home: { used: 0, remaining: 5 },
    away: { used: 0, remaining: 5 }
  },
  periodType: "REGULATION",
  periodNumber: 2,
  gameClockRemainingMs: 253143,
  shotClockRemainingMs: 20463,
  status: "LIVE"
};

function buildDisplay(matchMetadata?: PublicMatchMetadata) {
  return buildPublicScoreboardDisplayModel({ ...baseProjection, matchMetadata }, {
    nowMs: Date.parse("2026-07-13T03:15:47.000Z"),
    receivedAtMs: Date.parse("2026-07-13T03:15:47.000Z"),
    realtimeState: "CONNECTED"
  });
}

function renderMetadata(matchMetadata?: PublicMatchMetadata) {
  return renderToStaticMarkup(createElement(PublicLiveScoreboard, { display: buildDisplay(matchMetadata) }));
}

describe("public live scoreboard match metadata", () => {
  it.each([
    ["all fields", { roundLabel: "Round 2", courtLabel: "cout 1", venueLabel: "Main Arena", scheduledStart: "2026-07-20T10:00:00.000Z" }, ["Round 2", "cout 1", "Main Arena"]],
    ["round only", { roundLabel: "Round 2" }, ["Round 2"]],
    ["court only", { courtLabel: "cout 1" }, ["cout 1"]],
    ["venue only", { venueLabel: "Main Arena" }, ["Main Arena"]],
    ["court and venue", { courtLabel: "cout 1", venueLabel: "Main Arena" }, ["cout 1", "Main Arena"]],
    ["round court and venue", { roundLabel: "Round 2", courtLabel: "cout 1", venueLabel: "Main Arena" }, ["Round 2", "cout 1", "Main Arena"]]
  ] satisfies Array<[string, PublicMatchMetadata, string[]]>)("renders %s", (_name, metadata, expectedValues) => {
    const html = renderMetadata(metadata);
    expect(html).toContain('class="arena-match-metadata"');
    for (const value of expectedValues) expect(html).toContain(value);
    expect(html).not.toContain(baseProjection.matchId);
  });

  it("integrates match details into the broadcast header instead of adding a layout rail", () => {
    const html = renderMetadata({ roundLabel: "Round 2", courtLabel: "Court 1", venueLabel: "Main Arena" });
    const headerStart = html.indexOf('<header class="arena-header has-match-metadata">');
    const metadataStart = html.indexOf('<dl class="arena-match-metadata"');
    const headerEnd = html.indexOf("</header>");

    expect(headerStart).toBeGreaterThan(-1);
    expect(metadataStart).toBeGreaterThan(headerStart);
    expect(metadataStart).toBeLessThan(headerEnd);
    expect(html.slice(headerEnd + "</header>".length)).not.toContain("arena-match-metadata");
  });

  it("omits the rail for no metadata or scheduledStart-only metadata until timezone policy is explicit", () => {
    const noMetadata = renderMetadata();
    expect(noMetadata).not.toContain("arena-match-metadata");
    expect(noMetadata).toContain('<header class="arena-header">');
    expect(noMetadata).not.toContain("arena-header has-match-metadata");
    const scheduledStartOnly = renderMetadata({ scheduledStart: "2026-07-20T10:00:00.000Z" });
    expect(scheduledStartOnly).not.toContain("arena-match-metadata");
    expect(scheduledStartOnly).not.toContain("2026-07-20");
    expect(scheduledStartOnly).not.toContain("START");
    expect(buildDisplay().arenaFrameClassName).not.toContain("has-match-metadata");
  });

  it("precomputes metadata when the projection changes and uses React text escaping", () => {
    const appSource = readFileSync(new URL("../../apps/web/src/App.tsx", import.meta.url), "utf8");
    const componentSource = readFileSync(new URL("../../apps/web/src/components/PublicLiveScoreboard.tsx", import.meta.url), "utf8");

    expect(appSource).toMatch(/useMemo\(\s*\(\) => buildPublicArenaMatchMetadataDisplay\(projection\?\.matchMetadata\)/);
    expect(appSource).toContain("[projection?.matchMetadata]");
    expect(appSource).toMatch(/buildPublicScoreboardDisplayModel\(projection, \{[\s\S]*?matchMetadata/);
    expect(componentSource).not.toContain("dangerouslySetInnerHTML");
  });

  it("trims defensively, preserves Unicode and authoritative spelling, and escapes HTML-like text", () => {
    const metadata = buildPublicArenaMatchMetadataDisplay({
      roundLabel: "  รอบรองชนะเลิศ  ",
      courtLabel: " cout 1 ",
      venueLabel: "<script>alert(1)</script> Main Municipal Competition Arena สนามกีฬาเทศบาลจังหวัดร้อยเอ็ด"
    });
    const html = renderMetadata({
      roundLabel: "  รอบรองชนะเลิศ  ",
      courtLabel: " cout 1 ",
      venueLabel: "<script>alert(1)</script> Main Municipal Competition Arena สนามกีฬาเทศบาลจังหวัดร้อยเอ็ด"
    });

    expect(metadata).toMatchObject({ round: "รอบรองชนะเลิศ", court: "cout 1" });
    expect(html).toContain("รอบรองชนะเลิศ");
    expect(html).toContain("cout 1");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; Main Municipal Competition Arena สนามกีฬาเทศบาลจังหวัดร้อยเอ็ด");
    expect(html).not.toContain("<script>");
  });

  it("replaces metadata completely across duplicate, partial, empty, reconnect and match changes", () => {
    const full = buildDisplay({ roundLabel: "Round 2", courtLabel: "Court A", venueLabel: "Main Arena" });
    const duplicate = buildDisplay({ roundLabel: "Round 2", courtLabel: "Court A", venueLabel: "Main Arena" });
    const partial = buildDisplay({ courtLabel: "Court B" });
    const empty = buildDisplay();
    const nextMatch = buildPublicScoreboardDisplayModel({ ...baseProjection, matchId: "next-match", matchMetadata: { venueLabel: "Arena B" } }, {
      nowMs: Date.parse("2026-07-13T03:15:47.000Z"),
      receivedAtMs: Date.parse("2026-07-13T03:15:47.000Z"),
      realtimeState: "CONNECTED"
    });

    expect(duplicate.matchMetadata).toEqual(full.matchMetadata);
    expect(partial.matchMetadata).toEqual({ court: "Court B" });
    expect(empty.matchMetadata).toEqual({});
    expect(nextMatch.matchMetadata).toEqual({ venue: "Arena B" });
    expect(JSON.stringify([partial, empty, nextMatch])).not.toMatch(/Round 2|Court A|Main Arena/);
  });

  it("keeps the display model allowlisted and free of private operational fields", () => {
    const display = buildDisplay({ roundLabel: "Round 2", courtLabel: "cout 1", venueLabel: "Main Arena" });
    const serialized = JSON.stringify(display);

    expect(display.matchMetadata).toEqual({ round: "Round 2", court: "cout 1", venue: "Main Arena" });
    expect(publicScoreboardDisplayHasPrivateExposure(serialized)).toBe(false);
    expect(serialized).not.toMatch(/match_code|scheduled_at|venue_name|courtId|venueId|tournamentId|divisionId|teamId|playerId|lastEventSeq|currentSeq|expectedSeq|projectionVersion|permissions|assignments|rawEvents/i);
  });
});
