import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PublicScoreboardProjection } from "@basket-scoreboard/api-contracts";
import { PublicLiveScoreboard } from "../../apps/web/src/components/PublicLiveScoreboard";
import {
  buildPublicScoreboardDisplayModel,
  buildPublicScoreboardTeamLabels,
  publicScoreboardDisplayHasPrivateExposure,
  toPublicRecentActionDisplay
} from "../../apps/web/src/lib/publicScoreboardDisplay";

const baseProjection: PublicScoreboardProjection = {
  matchId: "93bd90bd-040d-48f5-bb9c-1354d6e80077",
  homeTeamName: "Tigers",
  awayTeamName: "Falcons",
  homeScore: 27,
  awayScore: 36,
  teamFouls: { home: 2, away: 1 },
  periodType: "REGULATION",
  periodNumber: 2,
  gameClockRemainingMs: 253143,
  shotClockRemainingMs: 20463,
  status: "LIVE",
  recentActions: []
};

const context = { homeTeamLabel: "Tigers", awayTeamLabel: "Falcons" };

function displayFor(recentActions: unknown, projection: PublicScoreboardProjection = baseProjection) {
  return buildPublicScoreboardDisplayModel(projection, {
    nowMs: 0,
    receivedAtMs: null,
    realtimeState: "CONNECTED",
    recentActionDisplay: toPublicRecentActionDisplay(recentActions, buildPublicScoreboardTeamLabels(projection))
  });
}

describe("public live scoreboard latest-action ticker", () => {
  it.each([
    [{ kind: "SCORE", teamSide: "HOME", points: 1 }, "Tigers +1"],
    [{ kind: "SCORE", teamSide: "AWAY", points: 2 }, "Falcons +2"],
    [{ kind: "SCORE", teamSide: "HOME", points: 3 }, "Tigers +3"],
    [{ kind: "TEAM_FOUL", teamSide: "HOME" }, "Tigers team foul"],
    [{ kind: "TIMEOUT", teamSide: "AWAY" }, "Falcons timeout"],
    [{ kind: "PERIOD", phase: "STARTED", periodType: "REGULATION", periodNumber: 2 }, "REG P2 started"],
    [{ kind: "PERIOD", phase: "ENDED", periodType: "REGULATION", periodNumber: 2 }, "REG P2 ended"],
    [{ kind: "PERIOD", phase: "STARTED", periodType: "OVERTIME", periodNumber: 1 }, "OT P1 started"],
    [{ kind: "GAME_STATUS", status: "STARTED" }, "Game started"],
    [{ kind: "GAME_STATUS", status: "FINAL" }, "Final"]
  ])("maps %o to safe public text", (action, text) => {
    expect(toPublicRecentActionDisplay([action], context)).toEqual({ text });
  });

  it("uses only newest state and replaces correction, empty, reconnect and match state", () => {
    const three = [
      { kind: "TIMEOUT", teamSide: "AWAY" },
      { kind: "SCORE", teamSide: "HOME", points: 2 },
      { kind: "GAME_STATUS", status: "STARTED" }
    ];
    expect(displayFor(three).recentEventTicker).toBe("Falcons timeout");
    expect(displayFor(three).recentEventTicker).toBe(displayFor(three).recentEventTicker);
    expect(displayFor(three.slice(1)).recentEventTicker).toBe("Tigers +2");
    expect(displayFor([]).recentEventTicker).toBe("No public play updates available.");
    expect(displayFor([{ kind: "TEAM_FOUL", teamSide: "AWAY" }]).recentEventTicker).toBe("Falcons team foul");
    const nextMatch = { ...baseProjection, matchId: "next-match", homeTeamName: "North", awayTeamName: "South" };
    expect(displayFor([{ kind: "SCORE", teamSide: "HOME", points: 3 }], nextMatch).recentEventTicker).toBe("North +3");
  });

  it("omits malformed and unknown data without stringifying it", () => {
    const invalid = [
      null,
      "raw",
      { kind: "SCORE", teamSide: "HOME", points: 4, note: "private" },
      { kind: "PERIOD", phase: "STARTED", periodType: "OVERTIME", periodNumber: 0 },
      { kind: "UNKNOWN", rawEvents: ["private"] }
    ];
    for (const action of invalid) expect(toPublicRecentActionDisplay([action], context)).toBeNull();
    expect(displayFor(invalid).recentEventTicker).toBe("No public play updates available.");
  });

  it("preserves Unicode and escapes HTML-like team labels", () => {
    const thai = "โรงเรียนเมืองทอง";
    const longThai = "ทีมบาสเกตบอลเทศบาลจังหวัดร้อยเอ็ด";
    expect(toPublicRecentActionDisplay([{ kind: "SCORE", teamSide: "HOME", points: 3 }], { ...context, homeTeamLabel: thai })).toEqual({ text: `${thai} +3` });
    expect(toPublicRecentActionDisplay([{ kind: "TIMEOUT", teamSide: "AWAY" }], { ...context, awayTeamLabel: longThai })).toEqual({ text: `${longThai} timeout` });
    const htmlLabel = "<script>alert(1)</script>";
    const display = displayFor([{ kind: "SCORE", teamSide: "HOME", points: 2 }], { ...baseProjection, homeTeamName: htmlLabel });
    const html = renderToStaticMarkup(createElement(PublicLiveScoreboard, { display }));
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; +2");
    expect(html).not.toContain("<script>");
  });

  it("reuses theme labels and excludes private fields", () => {
    const projection = {
      ...baseProjection,
      displayTheme: {
        tournament: { displayName: null, logoUrl: null, showLogo: false, colors: null, backgroundStyle: "DEFAULT_ARENA" },
        home: { displayName: "Team Display Test", logoUrl: null, showLogo: false, colors: null },
        away: { displayName: null, logoUrl: null, showLogo: false, colors: null },
        flags: { textOnlyFallback: false, neutralHighContrast: false }
      },
      recentActions: [{ kind: "SCORE", teamSide: "HOME", points: 2 }]
    } as PublicScoreboardProjection;
    const display = displayFor(projection.recentActions, projection);
    const serialized = JSON.stringify(display);
    expect(display.recentEventTicker).toBe("Team Display Test +2");
    expect(publicScoreboardDisplayHasPrivateExposure(serialized)).toBe(false);
    expect(serialized).not.toMatch(/sourceEventSeq|initializedAtSeq|recentActionState|playerId|playerName|jerseyNumber|actor|device|role|session|token|csrf|commandId|correlationId|causationId|reason|note|requester|audit|correction|rawEvents|lastEventSeq|currentSeq|expectedSeq|projectionVersion|eventSeq|streamVersion/i);
  });

  it("keeps one polite atomic status region, memoization and static one-line CSS", () => {
    const component = readFileSync("apps/web/src/components/PublicLiveScoreboard.tsx", "utf8");
    const styles = readFileSync("apps/web/src/styles.css", "utf8");
    const app = readFileSync("apps/web/src/App.tsx", "utf8");
    expect(component).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(component).not.toContain("dangerouslySetInnerHTML");
    expect(styles).toMatch(/\.recent-event-ticker strong[\s\S]*overflow:\s*hidden[\s\S]*text-overflow:\s*ellipsis[\s\S]*white-space:\s*nowrap/);
    expect(styles).not.toMatch(/\.recent-event-ticker[^}]*animation|\.recent-event-ticker[^}]*marquee/);
    expect(app).toMatch(/const recentActionDisplay = useMemo\(/);
    expect(app).toContain("[projection?.recentActions, teamLabels]");
    expect(app).toContain('sceneModel.sceneType === "LIVE_SCOREBOARD"');
    expect(app).toContain("return <PublicScoreboardDisplayPage matchId={sceneModel.matchId} />");
    expect(component).toContain("recent-event-ticker");
    expect(readFileSync("apps/web/src/components/PublicFinalSummaryDisplayScene.tsx", "utf8")).not.toContain("recent-event-ticker");
  });
});
