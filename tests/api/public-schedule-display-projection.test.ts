import { describe, expect, it } from "vitest";
import type { TournamentScheduleResponse } from "../../packages/api-contracts/src";
import { buildPublicScheduleDisplayProjection } from "../../apps/api/src/tournaments/publicScheduleDisplayProjection";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const courtA = "22222222-2222-4222-8222-222222222222";
const courtB = "33333333-3333-4333-8333-333333333333";

describe("public schedule display projection", () => {
  it("returns only narrow real rows and normalizes public statuses", () => {
    const result = buildPublicScheduleDisplayProjection(scheduleFixture(), { courtId: null, limit: 8 });

    expect(result).toEqual({
      tournamentLabel: "Alpha Cup",
      rows: [
        {
          matchId: "44444444-4444-4444-8444-444444444444",
          scheduledAt: null,
          homeTeamName: "Bangkok Home",
          awayTeamName: "Chiang Mai Away",
          status: "LIVE",
          courtLabel: "Court A",
          venueLabel: "Main Hall",
          tournamentLabel: "Alpha Cup",
          stageLabel: null,
          roundLabel: "Round 1"
        },
        {
          matchId: "55555555-5555-4555-8555-555555555555",
          scheduledAt: "2026-07-10T12:00:00.000Z",
          homeTeamName: "Khon Kaen",
          awayTeamName: "Udon Thani",
          status: "SCHEDULED",
          courtLabel: "Court B",
          venueLabel: null,
          tournamentLabel: "Alpha Cup",
          stageLabel: "Semi-final",
          roundLabel: null
        },
        {
          matchId: "66666666-6666-4666-8666-666666666666",
          scheduledAt: "2026-07-10T14:00:00.000Z",
          homeTeamName: "Final Home",
          awayTeamName: "Final Away",
          status: "FINAL",
          courtLabel: null,
          venueLabel: "Arena Annex",
          tournamentLabel: "Alpha Cup",
          stageLabel: null,
          roundLabel: "Final"
        }
      ],
      emptyMessage: null
    });
    expect(JSON.stringify(result)).not.toMatch(
      /homeTeamId|awayTeamId|courtId|currentSeq|clock|score|readiness|conflict|operations|metadata|actor|device|session|token|csrf|commandId|correlationId|audit|correction/i
    );
  });

  it("filters court before applying the server-side limit", () => {
    const result = buildPublicScheduleDisplayProjection(scheduleFixture(), { courtId: courtB, limit: 1 });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.matchId).toBe("55555555-5555-4555-8555-555555555555");
  });

  it("excludes draft, cancelled, unknown, and incomplete rows", () => {
    const result = buildPublicScheduleDisplayProjection(scheduleFixture(), { courtId: null, limit: 20 });

    expect(result.rows.map((row) => row.matchId)).toEqual([
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666"
    ]);
  });

  it("returns a safe empty result without inventing rows", () => {
    const result = buildPublicScheduleDisplayProjection(scheduleFixture(), {
      courtId: "99999999-9999-4999-8999-999999999999",
      limit: 8
    });

    expect(result).toEqual({
      tournamentLabel: "Alpha Cup",
      rows: [],
      emptyMessage: "No public schedule entries available."
    });
  });
});

function scheduleFixture(): TournamentScheduleResponse {
  return {
    tournament: {
      tournamentId,
      name: "Alpha Cup",
      status: "ACTIVE",
      matchCount: 7,
      liveMatchCount: 1,
      finishedMatchCount: 1
    },
    matches: [
      matchRow({
        matchId: "44444444-4444-4444-8444-444444444444",
        courtId: courtA,
        courtLabel: "Court A",
        venueLabel: "Main Hall",
        scheduledAt: null,
        homeTeamId: "home-1",
        homeTeamName: "Bangkok Home",
        awayTeamId: "away-1",
        awayTeamName: "Chiang Mai Away",
        status: "PERIOD_BREAK",
        roundLabel: "Round 1"
      }),
      matchRow({
        matchId: "55555555-5555-4555-8555-555555555555",
        courtId: courtB,
        courtLabel: "Court B",
        scheduledAt: "2026-07-10T12:00:00.000Z",
        homeTeamId: "home-2",
        homeTeamName: "Khon Kaen",
        awayTeamId: "away-2",
        awayTeamName: "Udon Thani",
        status: "READY",
        stageName: "Semi-final"
      }),
      matchRow({
        matchId: "66666666-6666-4666-8666-666666666666",
        courtId: null,
        venueLabel: "Arena Annex",
        scheduledAt: "2026-07-10T14:00:00.000Z",
        homeTeamId: "home-3",
        homeTeamName: "Final Home",
        awayTeamId: "away-3",
        awayTeamName: "Final Away",
        status: "FINISHED",
        roundLabel: "Final"
      }),
      matchRow({ matchId: "77777777-7777-4777-8777-777777777777", status: "DRAFT" }),
      matchRow({ matchId: "88888888-8888-4888-8888-888888888888", status: "CANCELLED" }),
      matchRow({ matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "INTERNAL_REVIEW" }),
      matchRow({
        matchId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        status: "SCHEDULED",
        homeTeamId: null,
        homeTeamName: "HOME",
        awayTeamId: null,
        awayTeamName: "AWAY"
      })
    ],
    generatedAt: "2026-07-10T10:00:00.000Z"
  };
}

function matchRow(overrides: Partial<TournamentScheduleResponse["matches"][number]>) {
  return {
    matchId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    tournamentId,
    stageName: null,
    groupName: null,
    roundLabel: null,
    courtId: courtA,
    courtLabel: null,
    venueLabel: null,
    scheduledAt: null,
    homeTeamId: "home-team",
    homeTeamName: "Home Team",
    awayTeamId: "away-team",
    awayTeamName: "Away Team",
    status: "SCHEDULED",
    homeScore: 91,
    awayScore: 87,
    currentSeq: 44,
    publicScoreboardPath: "/public/scoreboard/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    ...overrides
  };
}
