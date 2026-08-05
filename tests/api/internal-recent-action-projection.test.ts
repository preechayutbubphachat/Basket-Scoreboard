import { describe, expect, it } from "vitest";
import { toPublicScoreboardProjection } from "../../apps/api/src/publicScoreboard/publicScoreboardProjection";
import {
  applyMatchFinished,
  applyMatchStarted,
  applyOvertimeStarted,
  applyPeriodEnded,
  applyScoreAdded,
  applyScoreCorrected,
  applyTeamFoulAdded,
  applyTimeoutGranted,
  createInitialScoreboardProjection,
  normalizeScoreboardProjection
} from "../../apps/api/src/matchEventStore/projection";
import {
  applyInternalRecentActionEvent,
  createInternalRecentActionState,
  normalizeInternalRecentActionState
} from "../../apps/api/src/matchEventStore/recentActionProjection";

const matchId = "11111111-1111-4111-8111-111111111111";
const at = "2026-07-13T00:00:00.000Z";

function score(teamSide: "HOME" | "AWAY", points: 1 | 2 | 3, periodNumber = 1) {
  return {
    teamSide,
    points,
    playerId: null,
    playerNameSnapshot: null,
    jerseyNumberSnapshot: null,
    periodNumber,
    gameClockRemainingMs: 500000,
    note: null
  };
}

describe("internal effective recent-action projection", () => {
  it("initializes new matches at sequence zero and keeps three newest eligible actions", () => {
    let projection = createInitialScoreboardProjection(matchId);
    projection = applyMatchStarted(projection, {
      startedAt: at,
      periodNumber: 1,
      periodType: "REGULATION",
      gameClockRemainingMs: 600000,
      shotClockRemainingMs: 24000,
      reason: "private"
    }, 1);
    projection = applyScoreAdded(projection, score("HOME", 2), 2);
    projection = applyTeamFoulAdded(projection, { teamSide: "AWAY", foulType: "PERSONAL", reason: "private", periodNumber: 1 }, 3);
    projection = applyTimeoutGranted(projection, {
      teamSide: "HOME",
      requestedBy: "COACH",
      durationMs: 60000,
      reason: "private",
      startedAt: at,
      periodNumber: 1,
      gameClockRemainingMs: 500000,
      shotClockRemainingMs: 20000
    }, 4);

    expect(projection.recentActionState).toEqual({
      version: 1,
      initializedAtSeq: 0,
      items: [
        { sourceEventSeq: 4, kind: "TIMEOUT", teamSide: "HOME" },
        { sourceEventSeq: 3, kind: "TEAM_FOUL", teamSide: "AWAY" },
        { sourceEventSeq: 2, kind: "SCORE", teamSide: "HOME", points: 2 }
      ]
    });
  });

  it("maps player fouls to one generic team foul and retains no player data", () => {
    const state = applyInternalRecentActionEvent(createInternalRecentActionState(0), "PLAYER_FOUL_ADDED", {
      teamSide: "AWAY",
      playerId: "private-player",
      playerName: "Private Name",
      jerseyNumber: "9",
      foulType: "PERSONAL",
      reason: "private"
    }, 1);

    expect(state.items).toEqual([{ sourceEventSeq: 1, kind: "TEAM_FOUL", teamSide: "AWAY" }]);
    expect(JSON.stringify(state)).not.toMatch(/private-player|Private Name|jersey|foulType|reason/i);
  });

  it("ignores operational, private, unknown, and invalid events", () => {
    const base = createInternalRecentActionState(0);
    const eventTypes = [
      "GAME_CLOCK_STARTED", "GAME_CLOCK_STOPPED", "GAME_CLOCK_SET", "SHOT_CLOCK_RESET", "SHOT_CLOCK_SET",
      "TIMEOUT_ENDED", "CORRECTION_REQUESTED", "CORRECTION_APPLIED", "CORRECTION_REJECTED",
      "GAME_CLOCK_CORRECTED", "SHOT_CLOCK_CORRECTED"
    ] as const;
    const final = eventTypes.reduce(
      (state, eventType, index) => applyInternalRecentActionEvent(state, eventType, { teamSide: "HOME" }, index + 1),
      base
    );

    expect(final.items).toEqual([]);
    expect(applyInternalRecentActionEvent(final, "SCORE_ADDED", { teamSide: "HOME", points: 4 }, 20).items).toEqual([]);
    expect(applyInternalRecentActionEvent(final, "PERIOD_STARTED", { periodType: "INVALID", periodNumber: 1 }, 21).items).toEqual([]);
  });

  it("bootstraps a legacy projection prospectively at its authoritative head", () => {
    const legacy = normalizeScoreboardProjection({
      ...createInitialScoreboardProjection(matchId),
      currentSeq: 40,
      recentActionState: undefined
    });

    expect(legacy.recentActionState).toEqual({ version: 1, initializedAtSeq: 40, items: [] });
    expect(applyScoreAdded(legacy, score("HOME", 2), 40).recentActionState.items).toEqual([]);
    expect(applyScoreAdded(legacy, score("HOME", 3), 41).recentActionState.items).toEqual([
      { sourceEventSeq: 41, kind: "SCORE", teamSide: "HOME", points: 3 }
    ]);
  });

  it("normalizes current snapshots and resets malformed private state safely", () => {
    const current = normalizeScoreboardProjection({
      ...createInitialScoreboardProjection(matchId),
      currentSeq: 5,
      recentActionState: {
        version: 1,
        initializedAtSeq: 0,
        items: [
          { sourceEventSeq: 4, kind: "SCORE", teamSide: "HOME", points: 2 },
          { sourceEventSeq: 5, kind: "TIMEOUT", teamSide: "AWAY", privateField: "drop" }
        ]
      } as never
    });
    expect(current.recentActionState.items).toEqual([
      { sourceEventSeq: 5, kind: "TIMEOUT", teamSide: "AWAY" },
      { sourceEventSeq: 4, kind: "SCORE", teamSide: "HOME", points: 2 }
    ]);

    expect(normalizeInternalRecentActionState({ version: 99, items: [] }, 12)).toEqual({
      version: 1,
      initializedAtSeq: 12,
      items: []
    });
  });

  it("removes correction targets idempotently without backfilling discarded history", () => {
    let projection = createInitialScoreboardProjection(matchId);
    projection = applyScoreAdded(projection, score("HOME", 1), 1);
    projection = applyScoreAdded(projection, score("HOME", 2), 2);
    projection = applyScoreAdded(projection, score("AWAY", 3), 3);
    projection = applyScoreAdded(projection, score("HOME", 2), 4);

    projection = applyScoreCorrected(projection, { teamSide: "AWAY", points: 3, correctedEventSeq: 3 }, 5);
    expect(projection.recentActionState.items.map((item) => item.sourceEventSeq)).toEqual([4, 2]);
    projection = applyScoreCorrected(projection, { teamSide: "AWAY", points: 3, correctedEventSeq: 3 }, 6);
    expect(projection.recentActionState.items.map((item) => item.sourceEventSeq)).toEqual([4, 2]);
  });

  it("uses each correction event's actual target sequence and creates no correction action", () => {
    let state = createInternalRecentActionState(0);
    state = applyInternalRecentActionEvent(state, "SCORE_ADDED", { teamSide: "HOME", points: 2 }, 1);
    state = applyInternalRecentActionEvent(state, "TEAM_FOUL_ADDED", { teamSide: "AWAY" }, 2);
    state = applyInternalRecentActionEvent(state, "TIMEOUT_GRANTED", { teamSide: "HOME" }, 3);
    state = applyInternalRecentActionEvent(state, "SCORE_REMOVED_BY_CORRECTION", { originalScoreSeq: 1, reason: "private" }, 4);
    state = applyInternalRecentActionEvent(state, "TEAM_FOUL_CORRECTED", { correctedEventSeq: 2, reason: "private" }, 5);
    state = applyInternalRecentActionEvent(state, "TIMEOUT_CORRECTED", { correctedEventSeq: 3, reason: "private" }, 6);
    expect(state.items).toEqual([]);

    state = applyInternalRecentActionEvent(state, "PLAYER_FOUL_ADDED", { teamSide: "AWAY", playerId: "private" }, 7);
    state = applyInternalRecentActionEvent(state, "PLAYER_FOUL_CORRECTED", { correctedEventSeq: 7, playerId: "private" }, 8);
    expect(state.items).toEqual([]);
  });

  it("is deterministic across uninterrupted replay and snapshot catch-up", () => {
    const started = applyMatchStarted(createInitialScoreboardProjection(matchId), {
      startedAt: at,
      periodNumber: 1,
      periodType: "REGULATION",
      gameClockRemainingMs: 600000,
      shotClockRemainingMs: 24000,
      reason: null
    }, 1);
    const snapshot = applyScoreAdded(started, score("HOME", 2), 2);
    const uninterrupted = applyPeriodEnded(applyScoreAdded(snapshot, score("AWAY", 3), 3), {
      periodNumber: 1,
      periodType: "REGULATION",
      endedAt: at,
      gameClockRemainingMs: 0,
      shotClockRemainingMs: 10000,
      reason: null
    }, 4);
    const caughtUp = applyPeriodEnded(applyScoreAdded(normalizeScoreboardProjection(JSON.parse(JSON.stringify(snapshot))), score("AWAY", 3), 3), {
      periodNumber: 1,
      periodType: "REGULATION",
      endedAt: at,
      gameClockRemainingMs: 0,
      shotClockRemainingMs: 10000,
      reason: null
    }, 4);

    expect(caughtUp.recentActionState).toEqual(uninterrupted.recentActionState);
  });

  it("handles overtime, finalization, and post-final correction without leaking private state publicly", () => {
    let projection = createInitialScoreboardProjection(matchId);
    projection = applyScoreAdded(projection, score("HOME", 3, 4), 1);
    projection = applyOvertimeStarted(projection, {
      periodNumber: 5,
      periodType: "OVERTIME",
      startedAt: at,
      gameClockRemainingMs: 300000,
      shotClockRemainingMs: 24000,
      reason: "private"
    }, 2);
    projection = applyMatchFinished(projection, {
      finishedAt: at,
      finalHomeScore: 3,
      finalAwayScore: 0,
      winnerSide: "HOME",
      reason: "private"
    }, 3);
    projection = applyScoreCorrected(projection, { teamSide: "HOME", points: 3, correctedEventSeq: 1 }, 4);

    expect(projection.recentActionState.items).toEqual([
      { sourceEventSeq: 3, kind: "GAME_STATUS", status: "FINAL" },
      { sourceEventSeq: 2, kind: "PERIOD", phase: "STARTED", periodType: "OVERTIME", periodNumber: 5 }
    ]);
    const publicProjection = toPublicScoreboardProjection(projection);
    expect(publicProjection).not.toHaveProperty("recentActionState");
    expect(JSON.stringify(publicProjection)).not.toMatch(/sourceEventSeq|initializedAtSeq|correctedEvent|private/i);
  });

  it("keeps state isolated by match and ignores duplicate reducer delivery", () => {
    const first = applyInternalRecentActionEvent(createInternalRecentActionState(0), "SCORE_ADDED", { teamSide: "HOME", points: 2 }, 1);
    const duplicate = applyInternalRecentActionEvent(first, "SCORE_ADDED", { teamSide: "HOME", points: 2 }, 1);
    const second = applyScoreAdded(createInitialScoreboardProjection("22222222-2222-4222-8222-222222222222"), score("AWAY", 1), 1);

    expect(duplicate).toEqual(first);
    expect(second.recentActionState.items).toEqual([{ sourceEventSeq: 1, kind: "SCORE", teamSide: "AWAY", points: 1 }]);
    expect(first.items).toEqual([{ sourceEventSeq: 1, kind: "SCORE", teamSide: "HOME", points: 2 }]);
  });
});
