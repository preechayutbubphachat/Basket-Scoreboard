import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type {
  MatchRosterPlayer,
  MatchRostersResponse,
  ScoreboardProjection
} from "@basket-scoreboard/api-contracts";
import {
  buildPersonalFoulRosterPresentation,
  foulTypeOptions,
  resolveFoulEffectiveAccess
} from "../../apps/web/src/lib/foulControl";

function access(matchId: string, matchRead: boolean, foulOperate: boolean, correctionRequest: boolean) {
  return {
    matchId,
    capabilities: { matchRead, foulOperate, correctionRequest }
  };
}

function rosterPlayer(playerId: string, teamSide: "HOME" | "AWAY"): MatchRosterPlayer {
  return {
    rosterPlayerId: `${playerId}-roster`,
    matchId: "match-1",
    teamSide,
    teamId: `${teamSide.toLowerCase()}-team`,
    playerId,
    displayNameSnapshot: `${teamSide} ${playerId}`,
    jerseyNumberSnapshot: playerId.at(-1) ?? null,
    position: "GUARD",
    status: "ACTIVE",
    isStarter: false,
    isCaptain: false
  };
}

function projection(playerFouls: ScoreboardProjection["playerFouls"]): ScoreboardProjection {
  return {
    matchId: "match-1",
    homeScore: 0,
    awayScore: 0,
    teamFouls: { home: 0, away: 0 },
    playerFouls,
    periodNumber: 1,
    gameClockRemainingMs: 600_000,
    shotClockRemainingMs: 24_000,
    status: "LIVE",
    currentSeq: 7,
    projectionVersion: "scoreboard-v1"
  };
}

function rosters(
  home: MatchRosterPlayer[] = [rosterPlayer("home-1", "HOME"), rosterPlayer("home-2", "HOME")],
  away: MatchRosterPlayer[] = [rosterPlayer("away-1", "AWAY")]
): MatchRostersResponse {
  return {
    matchId: "match-1",
    rosters: { HOME: home, AWAY: away }
  };
}

function expectedPlayer(player: MatchRosterPlayer, personalFouls: number) {
  return {
    player,
    personalFouls,
    technicalFouls: 0,
    totalTowardLimit: personalFouls,
    hasReachedPersonalFoulLimit: personalFouls >= 5
  };
}

describe("RM-06-P1 foul effective access", () => {
  it("exposes the supported player PERSONAL and TECHNICAL actions", () => {
    expect(foulTypeOptions).toEqual(["PERSONAL", "TECHNICAL"]);
  });

  it("fails closed for loading, error, malformed, denied, and match mismatch", () => {
    expect(resolveFoulEffectiveAccess("match-1", "loading", null)).toMatchObject({ lifecycle: "ACCESS_LOADING", canRead: false, canOperateFoul: false });
    expect(resolveFoulEffectiveAccess("match-1", "error", null)).toMatchObject({ lifecycle: "ACCESS_ERROR", canOperateFoul: false });
    expect(resolveFoulEffectiveAccess("match-1", "ready", { malformed: true })).toMatchObject({ lifecycle: "ACCESS_ERROR", canOperateFoul: false });
    expect(resolveFoulEffectiveAccess("match-1", "ready", access("match-2", true, true, true))).toMatchObject({ lifecycle: "ACCESS_MATCH_MISMATCH", canOperateFoul: false });
    expect(resolveFoulEffectiveAccess("match-1", "ready", access("match-1", false, true, true))).toMatchObject({ lifecycle: "ACCESS_DENIED", canRead: false, canOperateFoul: false });
  });

  it("requires matchRead and foulOperate while keeping correction independent", () => {
    expect(resolveFoulEffectiveAccess("match-1", "ready", access("match-1", true, true, false))).toMatchObject({ canRead: true, canOperateFoul: true, canRequestCorrection: false });
    expect(resolveFoulEffectiveAccess("match-1", "ready", access("match-1", true, false, true))).toMatchObject({ canRead: true, canOperateFoul: false, canRequestCorrection: true });
  });

  it("keeps the route fail closed and refreshes projection, roster, and access together", () => {
    const app = readFileSync("apps/web/src/App.tsx", "utf8");
    const route = app.slice(app.indexOf("function OperatorFoulPage"), app.indexOf("function OperatorClockPage"));

    expect(route).toContain('useState<"loading" | "ready" | "error">("loading")');
    expect(route).toContain("resolveFoulEffectiveAccess(matchId, accessPhase, effectiveAccess)");
    expect(route).toMatch(/Promise\.all\(\[\s*api\.getMatchProjection\(matchId\),\s*api\.getMatchRosters\(matchId\),\s*api\.getEffectiveMatchAccess\(matchId\)/);
    expect(route).not.toContain("canOperateFoul(currentUser, matchId)");
    expect(route).not.toContain("addTeamFoul");
    expect(route).not.toContain("Add Team Foul");
  });
});

describe("RM-06 personal foul count presentation", () => {
  it("joins authoritative counts only by exact active roster playerId with zero for a missing entry", () => {
    const result = buildPersonalFoulRosterPresentation(
      projection([
        { playerId: "home-1", teamSide: "HOME", playerName: "stale name", jerseyNumber: "99", fouls: 3 },
        { playerId: "away-1", teamSide: "AWAY", playerName: null, jerseyNumber: null, fouls: 4 },
        { playerId: "orphan", teamSide: "HOME", playerName: "Private orphan", jerseyNumber: null, fouls: -9 }
      ]),
      rosters()
    );

    expect(result).toEqual({
      available: true,
      playersBySide: {
        HOME: [
          expectedPlayer(rosterPlayer("home-1", "HOME"), 3),
          expectedPlayer(rosterPlayer("home-2", "HOME"), 0)
        ],
        AWAY: [
          expectedPlayer(rosterPlayer("away-1", "AWAY"), 4)
        ]
      }
    });
  });

  it.each([
    {
      name: "duplicate exact playerId projection entries",
      playerFouls: [
        { playerId: "home-1", teamSide: "HOME" as const, playerName: null, jerseyNumber: null, fouls: 1 },
        { playerId: "home-1", teamSide: "HOME" as const, playerName: null, jerseyNumber: null, fouls: 2 }
      ]
    },
    {
      name: "negative fouls",
      playerFouls: [
        { playerId: "home-1", teamSide: "HOME" as const, playerName: null, jerseyNumber: null, fouls: -1 }
      ]
    },
    {
      name: "non-integer fouls",
      playerFouls: [
        { playerId: "home-1", teamSide: "HOME" as const, playerName: null, jerseyNumber: null, fouls: 1.5 }
      ]
    },
    {
      name: "exact-player teamSide mismatch",
      playerFouls: [
        { playerId: "home-1", teamSide: "AWAY" as const, playerName: null, jerseyNumber: null, fouls: 1 }
      ]
    }
  ])("fails closed without player values for $name", ({ playerFouls }) => {
    expect(buildPersonalFoulRosterPresentation(projection(playerFouls), rosters())).toEqual({
      available: false,
      playersBySide: { HOME: [], AWAY: [] }
    });
  });

  it("fails closed when an exact active roster playerId is duplicated across roster entries", () => {
    const duplicate = rosterPlayer("home-1", "HOME");
    expect(buildPersonalFoulRosterPresentation(
      projection([]),
      rosters([rosterPlayer("home-1", "HOME")], [{ ...duplicate, teamSide: "AWAY", teamId: "away-team" }])
    )).toEqual({
      available: false,
      playersBySide: { HOME: [], AWAY: [] }
    });
  });

  it("drops a removed player on the next authoritative roster input", () => {
    const initial = buildPersonalFoulRosterPresentation(
      projection([{ playerId: "home-1", teamSide: "HOME", playerName: null, jerseyNumber: null, fouls: 2 }]),
      rosters()
    );
    const refreshed = buildPersonalFoulRosterPresentation(
      projection([{ playerId: "home-1", teamSide: "HOME", playerName: null, jerseyNumber: null, fouls: 2 }]),
      rosters([rosterPlayer("home-2", "HOME")])
    );

    expect(initial.available && initial.playersBySide.HOME.map(({ player }) => player.playerId)).toEqual(["home-1", "home-2"]);
    expect(refreshed).toEqual({
      available: true,
      playersBySide: {
        HOME: [expectedPlayer(rosterPlayer("home-2", "HOME"), 0)],
        AWAY: [expectedPlayer(rosterPlayer("away-1", "AWAY"), 0)]
      }
    });
  });
});
