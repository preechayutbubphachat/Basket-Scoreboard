import { describe, expect, test, vi } from "vitest";
import {
  buildApiUrl,
  createApiClient,
  createApiRequestHeaders,
  getDefaultApiBaseUrl,
  type FetchLike
} from "../../apps/web/src/lib/apiClient";
import { createInitialAuthState, reduceAuthState } from "../../apps/web/src/lib/authState";
import {
  canManageAssignments,
  createAssignmentFormState,
  getProtectedRouteDecision,
  submitAssignmentForm,
  validateRevokeReason
} from "../../apps/web/src/lib/adminAssignments";
import {
  buildAdminMatchActions,
  buildAdminMatchLink,
  buildOperatorMatchAuditLogLink,
  buildOperatorMatchClockLink,
  buildOperatorMatchFoulsLink,
  buildOperatorMatchLifecycleLink,
  buildOperatorMatchReplayLink,
  buildOperatorMatchScoreLink,
  buildOperatorMatchSummaryLink,
  buildOperatorMatchTimeoutsLink,
  buildOperatorMatchCard,
  canAccessOperatorMatches,
  canReadAuditLog,
  canOperateScore,
  createEmptyOperatorMatchesMessage
} from "../../apps/web/src/lib/operatorMatches";
import {
  buildAdminLineupLink,
  buildAdminRosterLink,
  buildCreatePlayerPayload,
  buildPlayerFoulCommandPayload,
  buildRosterReadinessLabel,
  buildScorePlayerOptions,
  createPlayerFormState,
  getRosterPlayerRoleLabels,
  getRosterPlayersForSide
} from "../../apps/web/src/lib/rosterControl";
import {
  buildScoreCommandPayload,
  buildScoreControlPanels,
  canUseLiveMatchControls,
  finishedMatchLiveControlWarning,
  getAcceptedScoreProjection,
  getScoreControlFeedback,
  getScoreControlLinks,
  getScoreControlPendingLabel,
  isFinishedMatchStatus,
  scorePointOptions
} from "../../apps/web/src/lib/scoreControl";
import {
  buildFoulControlPanels,
  buildTeamFoulCommandPayload,
  getFoulControlFeedback
} from "../../apps/web/src/lib/foulControl";
import {
  buildClockControlState,
  buildGameClockSetPayload,
  buildShotClockResetPayload,
  buildShotClockSetPayload,
  deriveDisplayClockMs,
  getClockControlFeedback
} from "../../apps/web/src/lib/clockControl";
import {
  buildTimeoutControlPanels,
  buildTimeoutEndPayload,
  buildTimeoutGrantPayload,
  getActiveTimeoutLabel,
  getTimeoutControlFeedback,
  getTimeoutControlLinks,
  timeoutRequestedByOptions
} from "../../apps/web/src/lib/timeoutControl";
import {
  buildSummaryPlayerLabels,
  getSummaryTeamTotals,
  hasSummaryMutationControls
} from "../../apps/web/src/lib/summaryControl";
import {
  buildReplayEventGroupOptions,
  buildReplayEventMeta,
  getReplayScoreAfterLabel,
  hasReplayMutationControls
} from "../../apps/web/src/lib/replayControl";
import {
  buildAuditLogFilterOptions,
  buildAuditLogRowMeta,
  getAuditCorrectionRows,
  hasAuditLogMutationControls
} from "../../apps/web/src/lib/auditLogControl";
import {
  buildAdminTournamentScheduleLink,
  buildAdminTournamentStandingsLink,
  buildPublicTournamentScheduleLink,
  buildPublicTournamentStandingsLink,
  buildScheduleRowMeta,
  buildScheduleStatusFilters,
  buildTournamentQuickLinks,
  createScheduledMatchFormState,
  createTeamFormState,
  createTournamentFormState,
  createTournamentMatchPayload,
  createTournamentPayload,
  buildStandingsRowMeta,
  getPublicScheduleEmptyState,
  getPublicStandingsEmptyState,
  getPublicScheduleLinks,
  getPublicStandingsLinks,
  getScheduledMatchFormFeedback,
  getTournamentEmptyState,
  hasPublicScheduleMutationControls,
  hasPublicStandingsMutationControls
} from "../../apps/web/src/lib/scheduleControl";
import {
  buildLifecycleCommandPayload,
  buildLifecycleControlState,
  getLifecycleActionPlan,
  getLifecycleControlFeedback,
  getLifecycleControlLinks
} from "../../apps/web/src/lib/lifecycleControl";
import {
  applyRealtimeProjectionUpdate,
  getOperatorPollingIntervalMs,
  getPublicPollingIntervalMs,
  getRealtimeConnectionLabel,
  getSocketBaseUrl,
  parseRealtimeSocketTransports,
  shouldRefetchAfterRealtimeProjection
} from "../../apps/web/src/lib/realtimeProjectionSync";
import type {
  AuthenticatedUser,
  MatchAuditLogResponse,
  MatchReplayResponse,
  MatchRostersResponse,
  MatchSummaryResponse,
  ScoreAddedPayload,
  ScoreboardProjection,
  TournamentListResponse,
  TournamentScheduleResponse,
  TournamentStandingsResponse
} from "../../packages/api-contracts/src";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear()
  };
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: memoryStorage()
});
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: memoryStorage()
});

const adminUser: AuthenticatedUser = {
  userId: "admin-user",
  email: "admin@example.com",
  displayName: "Admin User",
  role: "ADMIN",
  roles: ["ADMIN"],
  permissions: ["match.create", "match.read", "match.audit.read"],
  assignedMatchIds: [],
  matchAssignments: [],
  deviceId: "browser",
  authMode: "SESSION"
};

const viewerUser: AuthenticatedUser = {
  userId: "viewer-user",
  email: "viewer@example.com",
  displayName: "Viewer User",
  role: "VIEWER",
  roles: ["VIEWER"],
  permissions: ["public.scoreboard.read"],
  assignedMatchIds: [],
  matchAssignments: [],
  deviceId: "browser",
  authMode: "SESSION"
};

const scoreboardProjection: ScoreboardProjection = {
  matchId: "11111111-1111-4111-8111-111111111111",
  homeTeamName: "Bangkok HOME",
  awayTeamName: "Chiang Mai AWAY",
  homeScore: 10,
  awayScore: 8,
  teamFouls: { home: 2, away: 1 },
  teamFoulsByPeriod: { "1": { home: 2, away: 1 } },
  playerFouls: [],
  periodNumber: 1,
  gameClockRemainingMs: 512000,
  shotClockRemainingMs: null,
  gameClock: { remainingMs: 512000, running: false, lastStartedAt: null },
  shotClock: { remainingMs: 24000, running: false, lastStartedAt: null },
  clockUpdatedAt: null,
  status: "LIVE",
  currentSeq: 3,
  projectionVersion: "scoreboard-v1"
};

const scorePayload: ScoreAddedPayload = {
  teamSide: "HOME",
  points: 2,
  playerId: null,
  periodNumber: 1,
  gameClockRemainingMs: 512000,
  note: null
};

const matchRosters: MatchRostersResponse = {
  matchId: scoreboardProjection.matchId,
  rosters: {
    HOME: [
      {
        rosterPlayerId: "roster-home-1",
        matchId: scoreboardProjection.matchId,
        teamSide: "HOME",
        teamId: "home-team",
        playerId: "11111111-2222-4333-8444-555555555555",
        displayNameSnapshot: "Narin Guard",
        jerseyNumberSnapshot: "7",
        position: "GUARD",
        status: "ACTIVE",
        isStarter: true,
        isCaptain: true
      },
      {
        rosterPlayerId: "roster-home-2",
        matchId: scoreboardProjection.matchId,
        teamSide: "HOME",
        teamId: "home-team",
        playerId: "11111111-2222-4333-8444-666666666666",
        displayNameSnapshot: "Bench Forward",
        jerseyNumberSnapshot: null,
        position: "FORWARD",
        status: "BENCH",
        isStarter: false,
        isCaptain: false
      }
    ],
    AWAY: []
  },
  readiness: {
    home: { playerCount: 2, starterCount: 1, captainSet: true, confirmed: false, ready: false },
    away: { playerCount: 0, starterCount: 0, captainSet: false, confirmed: false, ready: false }
  }
};

const matchSummary: MatchSummaryResponse = {
  matchId: scoreboardProjection.matchId,
  status: "FINISHED",
  periodNumber: 4,
  periodType: "REGULATION",
  currentSeq: 9,
  home: {
    teamId: "home-team",
    teamName: "Bangkok HOME",
    score: 22,
    teamFouls: 5,
    timeoutsUsed: 2,
    timeoutsRemaining: 3,
    unattributedPoints: 4,
    players: [
      {
        playerId: matchRosters.rosters.HOME[0].playerId,
        jerseyNumber: "7",
        displayName: "Narin Guard",
        teamSide: "HOME",
        isStarter: true,
        isCaptain: true,
        status: "ACTIVE",
        points: 8,
        personalFouls: 2
      }
    ]
  },
  away: {
    teamId: "away-team",
    teamName: "Chiang Mai AWAY",
    score: 18,
    teamFouls: 3,
    timeoutsUsed: 1,
    timeoutsRemaining: 4,
    unattributedPoints: 0,
    players: []
  },
  events: {
    total: 12,
    scoreEvents: 5,
    foulEvents: 3,
    timeoutEvents: 2,
    lifecycleEvents: 1,
    correctionEvents: 1
  },
  generatedAt: "2026-07-01T10:10:00.000Z"
};

const matchReplay: MatchReplayResponse = {
  matchId: scoreboardProjection.matchId,
  status: "FINISHED",
  currentSeq: 9,
  homeTeamName: "Bangkok HOME",
  awayTeamName: "Chiang Mai AWAY",
  group: "all",
  limit: 300,
  items: [
    {
      matchId: scoreboardProjection.matchId,
      seq: 1,
      eventType: "SCORE_ADDED",
      eventGroup: "SCORE",
      periodNumber: 1,
      periodType: "REGULATION",
      teamSide: "HOME",
      title: "HOME +2",
      description: "Narin Guard scored 2 points.",
      scoreAfter: { home: 2, away: 0 },
      player: {
        playerId: matchRosters.rosters.HOME[0].playerId,
        displayName: "Narin Guard",
        jerseyNumber: "7"
      },
      actor: { userId: "actor-1", displayName: null, role: "SCORER" },
      createdAt: "2026-07-01T10:00:01.000Z"
    },
    {
      matchId: scoreboardProjection.matchId,
      seq: 2,
      eventType: "PLAYER_FOUL_ADDED",
      eventGroup: "FOUL",
      periodNumber: 1,
      periodType: "REGULATION",
      teamSide: "HOME",
      title: "HOME player foul",
      description: "Narin Guard personal foul.",
      scoreAfter: null,
      player: {
        playerId: matchRosters.rosters.HOME[0].playerId,
        displayName: "Narin Guard",
        jerseyNumber: "7"
      },
      actor: { userId: "actor-2", displayName: null, role: "SCORER" },
      createdAt: "2026-07-01T10:00:02.000Z"
    }
  ],
  generatedAt: "2026-07-01T10:10:00.000Z"
};

const matchAuditLog: MatchAuditLogResponse = {
  matchId: scoreboardProjection.matchId,
  status: "FINISHED",
  currentSeq: 9,
  group: "all",
  limit: 300,
  rows: [
    {
      matchId: scoreboardProjection.matchId,
      seq: 1,
      source: "MATCH_EVENT",
      group: "SCORE",
      eventType: "SCORE_ADDED",
      status: "APPENDED",
      title: "SCORE_ADDED",
      description: "HOME score event for 2 points.",
      actor: { userId: "actor-1", displayName: null, role: "SCORER" },
      device: { label: "browser-terminal-1", ipMasked: null, userAgentSummary: null },
      reason: null,
      commandId: "command-1",
      correlationId: "correlation-1",
      causationId: null,
      createdAt: "2026-07-01T10:00:01.000Z"
    },
    {
      matchId: scoreboardProjection.matchId,
      seq: 3,
      source: "MATCH_EVENT",
      group: "CORRECTION",
      eventType: "SCORE_REMOVED_BY_CORRECTION",
      status: "CORRECTED",
      title: "Correction review item",
      description: "Correction-related event recorded.",
      actor: { userId: "actor-3", displayName: null, role: "ADMIN" },
      device: { label: "admin-laptop", ipMasked: null, userAgentSummary: null },
      reason: "wrong team",
      commandId: "command-3",
      correlationId: "correlation-3",
      causationId: "event-1",
      createdAt: "2026-07-01T10:00:03.000Z"
    }
  ],
  summary: {
    totalRows: 2,
    eventRows: 2,
    correctionRows: 1,
    rejectedRows: 0,
    missingReasonRows: 1
  },
  generatedAt: "2026-07-01T10:10:00.000Z"
};

const tournamentList: TournamentListResponse = {
  tournaments: [
    {
      tournamentId: "tournament-1",
      name: "Alpha Cup",
      status: "ACTIVE",
      matchCount: 2,
      liveMatchCount: 1,
      finishedMatchCount: 1
    }
  ]
};

const tournamentSchedule: TournamentScheduleResponse = {
  tournament: tournamentList.tournaments[0],
  matches: [
    {
      matchId: scoreboardProjection.matchId,
      tournamentId: "tournament-1",
      stageName: null,
      groupName: null,
      roundLabel: "Round 1",
      courtLabel: null,
      venueLabel: "Court A",
      scheduledAt: "2026-07-03T10:00:00.000Z",
      homeTeamId: "home-team",
      homeTeamName: "Bangkok HOME",
      awayTeamId: "away-team",
      awayTeamName: "Chiang Mai AWAY",
      status: "LIVE",
      homeScore: 10,
      awayScore: 8,
      currentSeq: 3,
      publicScoreboardPath: `/public/scoreboard/${scoreboardProjection.matchId}`
    }
  ],
  generatedAt: "2026-07-03T10:05:00.000Z"
};

const tournamentStandings: TournamentStandingsResponse = {
  tournamentId: "tournament-1",
  tournamentName: "Alpha Cup",
  status: "ACTIVE",
  isOfficial: false,
  rulesNotice: "[NEEDS SOURCE] Missing governing document: official tournament standings and tiebreak rules.",
  generatedAt: "2026-07-03T10:06:00.000Z",
  rows: [
    {
      teamId: "home-team",
      teamName: "Bangkok HOME",
      played: 1,
      wins: 1,
      losses: 0,
      pointsFor: 10,
      pointsAgainst: 8,
      pointDifferential: 2,
      finishedMatchesCounted: 1,
      liveMatchesExcluded: 0,
      scheduledMatchesExcluded: 0,
      tieStatus: "CLEAR"
    }
  ],
  summary: {
    teamCount: 1,
    finishedMatchCount: 1,
    excludedMatchCount: 1
  }
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: init.status ?? 200,
    ...init
  });
}

describe("web API client", () => {
  test("uses a relative same-origin API base when VITE_API_BASE_URL is empty", () => {
    expect(getDefaultApiBaseUrl()).toBe("/api/v1");
    expect(buildApiUrl("", "/api/v1/auth/login")).toBe("/api/v1/auth/login");
    expect(buildApiUrl("/api/v1/", "/auth/login")).toBe("/api/v1/auth/login");
    expect(buildApiUrl("/api/v1", "auth/login")).toBe("/api/v1/auth/login");
  });

  test("adds JSON content type only when a body exists and preserves explicit content type", () => {
    expect(createApiRequestHeaders({ body: JSON.stringify({ ok: true }) })).toMatchObject({
      "content-type": "application/json"
    });
    expect(createApiRequestHeaders({})).not.toHaveProperty("content-type");
    expect(
      createApiRequestHeaders({
        body: JSON.stringify({ ok: true }),
        headers: { "Content-Type": "application/vnd.api+json" }
      })
    ).toMatchObject({ "content-type": "application/vnd.api+json" });
  });

  test("defaults to same-origin api base when VITE_API_BASE_URL is not set", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ ok: true, data: { user: adminUser } }));
    const client = createApiClient({ fetchImpl: fetchMock });

    await client.getCurrentUser();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/me",
      expect.objectContaining({ credentials: "include" })
    );
  });

  test("login does not call csrf before session login and stores returned csrf in memory only", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          user: adminUser,
          csrfToken: "login-csrf-token"
        }
      })
    );
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.login({ email: "admin@example.com", password: "correct-password" })).resolves.toMatchObject({
      user: adminUser,
      csrfToken: "login-csrf-token"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.not.objectContaining({ "x-csrf-token": expect.any(String) })
      })
    );
    expect(client.csrfToken).toBe("login-csrf-token");
    expect(localStorage.getItem("csrf-token")).toBeNull();
    expect(sessionStorage.getItem("csrf-token")).toBeNull();
    expect(localStorage.getItem("sessionToken")).toBeNull();
    expect(sessionStorage.getItem("sessionToken")).toBeNull();
  });

  test("login fetches csrf only after session login when login response omits csrf", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { user: adminUser } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "post-login-csrf" } }));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.login({ email: "admin@example.com", password: "correct-password" })).resolves.toMatchObject({
      user: adminUser,
      csrfToken: "post-login-csrf"
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/auth/login",
      expect.objectContaining({ credentials: "include", method: "POST" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/auth/csrf",
      expect.objectContaining({ credentials: "include", method: "GET" })
    );
    expect(client.csrfToken).toBe("post-login-csrf");
  });

  test("unauthenticated csrf failure does not block a later login request", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        jsonResponse({ error: { reasonCode: "UNAUTHENTICATED", message: "Authentication required" } }, { status: 401 })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          data: {
            user: adminUser,
            csrfToken: "login-csrf-token"
          }
        })
      );
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.ensureCsrfToken()).rejects.toMatchObject({ reasonCode: "UNAUTHENTICATED" });
    await expect(client.login({ email: "admin@example.com", password: "correct-password" })).resolves.toMatchObject({
      csrfToken: "login-csrf-token"
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/auth/csrf", expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/auth/login", expect.any(Object));
  });

  test("attaches credentials to every request", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ ok: true, data: { user: adminUser } }));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await client.getCurrentUser();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/me",
      expect.objectContaining({ credentials: "include" })
    );
  });

  test("keeps CSRF token in memory and attaches it to private write requests", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { assignment: { id: "assignment-1" } } }));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await client.ensureCsrfToken();
    await client.assignOfficial("match-1", { userId: "user-1", roleCode: "SCORER" });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/matches/match-1/officials",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" })
      })
    );
    expect(localStorage.getItem("csrf-token")).toBeNull();
    expect(sessionStorage.getItem("csrf-token")).toBeNull();
  });

  test("reports stable error code and refreshes CSRF on recoverable CSRF_REQUIRED", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        jsonResponse({ error: { reasonCode: "CSRF_REQUIRED", message: "CSRF token is required" } }, { status: 403 })
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "next-csrf" } }));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.assignOfficial("match-1", { userId: "user-1", roleCode: "SCORER" })).rejects.toMatchObject({
      reasonCode: "CSRF_REQUIRED",
      recoverable: true
    });

    expect(fetchMock).toHaveBeenLastCalledWith("/api/v1/auth/csrf", expect.objectContaining({ credentials: "include" }));
  });

  test("uses API error reasonCode instead of a generic HTTP status for login failures", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({ reasonCode: "INVALID_CREDENTIALS", message: "Invalid credentials" }, { status: 401 })
    );
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.login({ email: "admin@example.com", password: "bad-password" })).rejects.toMatchObject({
      reasonCode: "INVALID_CREDENTIALS",
      message: "Invalid credentials"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("uses backend error.code instead of a generic HTTP status when present", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({ code: "INVALID_CREDENTIALS", message: "Invalid credentials" }, { status: 401 })
    );
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.login({ email: "admin@example.com", password: "bad-password" })).rejects.toMatchObject({
      reasonCode: "INVALID_CREDENTIALS",
      message: "Invalid credentials"
    });
  });

  test("uses nested backend error.code instead of a generic HTTP status when present", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({ error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } }, { status: 401 })
    );
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.login({ email: "admin@example.com", password: "bad-password" })).rejects.toMatchObject({
      reasonCode: "INVALID_CREDENTIALS",
      message: "Invalid credentials"
    });
  });

  test("loads operator and admin matches with credentials", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { matches: [] } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { matches: [] } }));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await client.getOperatorMatches();
    await client.getAdminMatches();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/operator/matches",
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/matches",
      expect.objectContaining({ credentials: "include" })
    );
  });

  test("creates smoke match through CSRF-protected API client flow", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          data: {
            matchId: "smoke-match-1",
            created: false,
            publicScoreboardPath: "/public/scoreboard/smoke-match-1",
            operatorScorePath: "/operator/matches/smoke-match-1/score"
          }
        })
      );
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.createSmokeMatch()).resolves.toMatchObject({
      matchId: "smoke-match-1",
      created: false
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/auth/csrf",
      expect.objectContaining({ credentials: "include", method: "GET" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/matches/smoke",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" })
      })
    );
  });

  test("loads private match state and syncs missed events with credentials", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(scoreboardProjection))
      .mockResolvedValueOnce(
        jsonResponse({
          matchId: scoreboardProjection.matchId,
          currentSeq: 4,
          lastEventSeq: 3,
          missedEvents: [],
          projection: { ...scoreboardProjection, currentSeq: 4 },
          fullStateSyncRequired: false,
          serverTime: "2026-07-01T10:00:00.000Z",
          projectionVersion: "scoreboard-v1",
          connectionStatus: "ONLINE"
        })
      );
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.getMatchState(scoreboardProjection.matchId)).resolves.toMatchObject({ currentSeq: 3 });
    await expect(client.syncMatch(scoreboardProjection.matchId, 3)).resolves.toMatchObject({ currentSeq: 4 });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `/api/v1/matches/${scoreboardProjection.matchId}/state`,
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/v1/matches/${scoreboardProjection.matchId}/sync?lastEventSeq=3`,
      expect.objectContaining({ credentials: "include" })
    );
  });

  test("loads enriched operator projection with credentials", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(scoreboardProjection));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.getMatchProjection(scoreboardProjection.matchId)).resolves.toMatchObject({
      homeTeamName: "Bangkok HOME",
      awayTeamName: "Chiang Mai AWAY",
      currentSeq: 3
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/matches/${scoreboardProjection.matchId}/projection`,
      expect.objectContaining({ credentials: "include" })
    );
  });

  test("posts score commands with CSRF, expectedSeq, and no client-owned totals", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "ACCEPTED",
          commandId: "22222222-2222-4222-8222-222222222222",
          matchId: scoreboardProjection.matchId,
          currentSeq: 4,
          appendedEvents: [{ eventId: "33333333-3333-4333-8333-333333333333", seqNo: 4, eventType: "SCORE_ADDED" }],
          reasonCode: null,
          message: null
        })
      );
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    const result = await client.addScore(scoreboardProjection.matchId, { expectedSeq: 3, payload: scorePayload });

    const [, init] = fetchMock.mock.calls[1]!;
    const body = JSON.parse(String(init?.body));
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/v1/matches/${scoreboardProjection.matchId}/commands/score/add`,
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" })
      })
    );
    expect(body).toMatchObject({
      matchId: scoreboardProjection.matchId,
      expectedSeq: 3,
      payload: scorePayload
    });
    expect(body.commandId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.clientTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.homeScore).toBeUndefined();
    expect(body.awayScore).toBeUndefined();
    expect(body["final" + "Score"]).toBeUndefined();
    expect(result.projection).toBeUndefined();
  });

  test("posts team foul commands with CSRF, expectedSeq, and command identifiers", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "ACCEPTED",
          commandId: "22222222-2222-4222-8222-222222222222",
          matchId: scoreboardProjection.matchId,
          currentSeq: 4,
          appendedEvents: [
            { eventId: "33333333-3333-4333-8333-333333333333", seqNo: 4, eventType: "TEAM_FOUL_ADDED" }
          ],
          reasonCode: null,
          message: null
        })
      );
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await client.addTeamFoul(scoreboardProjection.matchId, {
      expectedSeq: 3,
      payload: { teamSide: "HOME", foulType: "PERSONAL", reason: null }
    });

    const [, init] = fetchMock.mock.calls[1]!;
    const body = JSON.parse(String(init?.body));
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/v1/matches/${scoreboardProjection.matchId}/commands/foul/team/add`,
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" })
      })
    );
    expect(body).toMatchObject({
      matchId: scoreboardProjection.matchId,
      expectedSeq: 3,
      payload: { teamSide: "HOME", foulType: "PERSONAL", reason: null }
    });
    expect(body.commandId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test("loads rosters and posts player/roster mutations with CSRF", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: matchRosters }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { players: [] } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { player: { playerId: "player-1" } } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { rosterPlayer: matchRosters.rosters.HOME[0] } }));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.getMatchRosters(scoreboardProjection.matchId)).resolves.toMatchObject(matchRosters);
    await expect(client.listTeamPlayers("home-team")).resolves.toEqual([]);
    await client.createPlayer("home-team", { displayName: "Narin Guard", jerseyNumber: "7", position: "GUARD", active: true });
    await client.assignRosterPlayer(scoreboardProjection.matchId, "HOME", matchRosters.rosters.HOME[0].playerId);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `/api/v1/matches/${scoreboardProjection.matchId}/rosters`,
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/v1/teams/home-team/players",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      `/api/v1/matches/${scoreboardProjection.matchId}/rosters/HOME/players`,
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" })
      })
    );
  });

  test("loads and mutates lineup with CSRF protected API calls", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: matchRosters }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: matchRosters }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: matchRosters }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: matchRosters }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: matchRosters }));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await client.getMatchLineup(scoreboardProjection.matchId);
    await client.selectLineupStarter(scoreboardProjection.matchId, "HOME", matchRosters.rosters.HOME[0].playerId);
    await client.removeLineupStarter(scoreboardProjection.matchId, "HOME", matchRosters.rosters.HOME[0].playerId);
    await client.setLineupCaptain(scoreboardProjection.matchId, "HOME", matchRosters.rosters.HOME[0].playerId);
    await client.confirmLineupRoster(scoreboardProjection.matchId, "HOME", "alpha lineup");

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `/api/v1/matches/${scoreboardProjection.matchId}/lineup`,
      "/api/v1/auth/csrf",
      `/api/v1/matches/${scoreboardProjection.matchId}/lineup/HOME/starters/${matchRosters.rosters.HOME[0].playerId}`,
      `/api/v1/matches/${scoreboardProjection.matchId}/lineup/HOME/starters/${matchRosters.rosters.HOME[0].playerId}/remove`,
      `/api/v1/matches/${scoreboardProjection.matchId}/lineup/HOME/captain/${matchRosters.rosters.HOME[0].playerId}`,
      `/api/v1/matches/${scoreboardProjection.matchId}/lineup/HOME/confirm`
    ]);
    for (const [, init] of fetchMock.mock.calls.slice(2)) {
      expect(init).toEqual(expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" })
      }));
    }
  });

  test("posts player foul commands with roster player id and CSRF", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "ACCEPTED",
          commandId: "22222222-2222-4222-8222-222222222222",
          matchId: scoreboardProjection.matchId,
          currentSeq: 4,
          appendedEvents: [{ eventId: "event", seqNo: 4, eventType: "PLAYER_FOUL_ADDED" }],
          reasonCode: null,
          message: null
        })
      );
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await client.addPlayerFoul(scoreboardProjection.matchId, {
      expectedSeq: 3,
      payload: {
        teamSide: "HOME",
        playerId: matchRosters.rosters.HOME[0].playerId,
        foulType: "PERSONAL",
        reason: null
      }
    });

    const body = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body));
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/v1/matches/${scoreboardProjection.matchId}/commands/foul/player/add`,
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" })
      })
    );
    expect(body).toMatchObject({
      expectedSeq: 3,
      payload: {
        teamSide: "HOME",
        playerId: matchRosters.rosters.HOME[0].playerId
      }
    });
  });

  test("reads match summary without CSRF because it is read-only", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(jsonResponse(matchSummary));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.getMatchSummary(scoreboardProjection.matchId)).resolves.toEqual(matchSummary);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/matches/${scoreboardProjection.matchId}/summary`,
      expect.objectContaining({
        credentials: "include"
      })
    );
  });

  test("reads match replay without CSRF because it is read-only", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(jsonResponse(matchReplay));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.getMatchReplay(scoreboardProjection.matchId, { group: "score", limit: 50 })).resolves.toEqual(matchReplay);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/matches/${scoreboardProjection.matchId}/replay?group=score&limit=50`,
      expect.objectContaining({
        credentials: "include"
      })
    );
  });

  test("reads match audit log without CSRF because it is read-only", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(jsonResponse(matchAuditLog));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.getMatchAuditLog(scoreboardProjection.matchId, { group: "correction", limit: 50 })).resolves.toEqual(matchAuditLog);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/matches/${scoreboardProjection.matchId}/audit-log?group=correction&limit=50`,
      expect.objectContaining({
        credentials: "include",
        method: "GET"
      })
    );
  });

  test("reads protected and public tournament schedules without CSRF", async () => {
    const fetchMock = vi.fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: tournamentList }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: tournamentSchedule }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: tournamentList }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: tournamentSchedule }));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.getTournaments()).resolves.toEqual(tournamentList.tournaments);
    await expect(client.getTournamentSchedule("tournament-1")).resolves.toEqual(tournamentSchedule);
    await expect(client.getPublicTournaments()).resolves.toEqual(tournamentList.tournaments);
    await expect(client.getPublicTournamentSchedule("tournament-1")).resolves.toEqual(tournamentSchedule);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/tournaments",
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/tournaments/tournament-1/schedule",
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/public/tournaments",
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/v1/public/tournaments/tournament-1/schedule",
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock.mock.calls.some(([, init]) => "x-csrf-token" in ((init?.headers as Record<string, string>) ?? {}))).toBe(false);
  });

  test("writes tournament setup data with CSRF", async () => {
    const fetchMock = vi.fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { tournament: tournamentList.tournaments[0] } }, 201))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { team: { teamId: "team-1", tournamentId: "tournament-1", name: "Bangkok Home", shortName: "BKK", status: "ACTIVE" } } }, 201))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { matchId: "match-1", currentSeq: 0, scheduleMatch: tournamentSchedule.matches[0] } }, 201));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.createTournament({ name: "Alpha Cup", status: "ACTIVE", startsAt: null, endsAt: null })).resolves.toEqual(tournamentList.tournaments[0]);
    await expect(client.createTeam({ tournamentId: "tournament-1", name: "Bangkok Home", shortName: "BKK" })).resolves.toMatchObject({
      teamId: "team-1",
      name: "Bangkok Home"
    });
    await expect(
      client.createTournamentMatch("tournament-1", {
        homeTeamId: "home-team",
        awayTeamId: "away-team",
        roundLabel: "Round 1",
        courtLabel: "Court A",
        venueLabel: "Main Hall",
        scheduledAt: "2026-07-03T10:00:00.000Z"
      })
    ).resolves.toMatchObject({ matchId: "match-1", currentSeq: 0 });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/auth/csrf", expect.objectContaining({ credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/tournaments",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }),
        body: JSON.stringify({ name: "Alpha Cup", status: "ACTIVE", startsAt: null, endsAt: null })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/teams",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/v1/tournaments/tournament-1/matches",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" })
      })
    );
  });

  test("reads protected and public tournament standings without CSRF", async () => {
    const fetchMock = vi.fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: tournamentStandings }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: tournamentStandings }));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.getTournamentStandings("tournament-1")).resolves.toEqual(tournamentStandings);
    await expect(client.getPublicTournamentStandings("tournament-1")).resolves.toEqual(tournamentStandings);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/tournaments/tournament-1/standings",
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/public/tournaments/tournament-1/standings",
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock.mock.calls.some(([, init]) => "x-csrf-token" in ((init?.headers as Record<string, string>) ?? {}))).toBe(false);
  });

  test("posts timeout commands with CSRF, expectedSeq, and command identifiers", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "ACCEPTED",
          commandId: "22222222-2222-4222-8222-222222222222",
          matchId: scoreboardProjection.matchId,
          currentSeq: 4,
          appendedEvents: [
            { eventId: "33333333-3333-4333-8333-333333333333", seqNo: 4, eventType: "TIMEOUT_GRANTED" }
          ],
          reasonCode: null,
          message: null
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "ACCEPTED",
          commandId: "22222222-2222-4222-8222-222222222223",
          matchId: scoreboardProjection.matchId,
          currentSeq: 5,
          appendedEvents: [
            { eventId: "33333333-3333-4333-8333-333333333334", seqNo: 5, eventType: "TIMEOUT_ENDED" }
          ],
          reasonCode: null,
          message: null
        })
      );
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await client.grantTimeout(scoreboardProjection.matchId, {
      expectedSeq: 3,
      payload: { teamSide: "HOME", requestedBy: "HEAD_COACH", durationMs: 60000, reason: "Alpha timeout" }
    });
    await client.endTimeout(scoreboardProjection.matchId, {
      expectedSeq: 4,
      payload: { reason: "Done" }
    });

    const grantBody = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body));
    const endBody = JSON.parse(String(fetchMock.mock.calls[2]![1]?.body));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/v1/matches/${scoreboardProjection.matchId}/commands/timeout/grant`,
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `/api/v1/matches/${scoreboardProjection.matchId}/commands/timeout/end`,
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" })
      })
    );
    expect(grantBody).toMatchObject({
      matchId: scoreboardProjection.matchId,
      expectedSeq: 3,
      payload: { teamSide: "HOME", requestedBy: "HEAD_COACH", durationMs: 60000, reason: "Alpha timeout" }
    });
    expect(endBody).toMatchObject({
      matchId: scoreboardProjection.matchId,
      expectedSeq: 4,
      payload: { reason: "Done" }
    });
    expect(grantBody.commandId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(endBody.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test("posts lifecycle commands with CSRF, expectedSeq, and command identifiers", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValue(
        jsonResponse({
          status: "ACCEPTED",
          commandId: "22222222-2222-4222-8222-222222222222",
          matchId: scoreboardProjection.matchId,
          currentSeq: 4,
          appendedEvents: [
            { eventId: "33333333-3333-4333-8333-333333333333", seqNo: 4, eventType: "MATCH_STARTED" }
          ],
          reasonCode: null,
          message: null
        })
      );
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await client.startMatch(scoreboardProjection.matchId, buildLifecycleCommandPayload(scoreboardProjection, "open"));
    await client.endPeriod(scoreboardProjection.matchId, buildLifecycleCommandPayload(scoreboardProjection, "period done"));
    await client.startNextPeriod(scoreboardProjection.matchId, buildLifecycleCommandPayload(scoreboardProjection, null));
    await client.startOvertime(scoreboardProjection.matchId, buildLifecycleCommandPayload(scoreboardProjection, "tied"));
    await client.finishMatch(scoreboardProjection.matchId, buildLifecycleCommandPayload(scoreboardProjection, "final"));

    const lifecyclePaths = fetchMock.mock.calls.slice(1).map(([path]) => String(path));
    expect(lifecyclePaths).toEqual([
      `/api/v1/matches/${scoreboardProjection.matchId}/commands/lifecycle/start-match`,
      `/api/v1/matches/${scoreboardProjection.matchId}/commands/lifecycle/end-period`,
      `/api/v1/matches/${scoreboardProjection.matchId}/commands/lifecycle/start-next-period`,
      `/api/v1/matches/${scoreboardProjection.matchId}/commands/lifecycle/start-overtime`,
      `/api/v1/matches/${scoreboardProjection.matchId}/commands/lifecycle/finish-match`
    ]);

    for (const [, init] of fetchMock.mock.calls.slice(1)) {
      const body = JSON.parse(String(init?.body));
      expect(init).toEqual(expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" })
      }));
      expect(body).toMatchObject({
        matchId: scoreboardProjection.matchId,
        expectedSeq: 3
      });
      expect(body.payload).toHaveProperty("reason");
      expect(body.commandId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
    }
  });

  test("posts clock commands with CSRF, expectedSeq, and command identifiers", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "ACCEPTED",
          commandId: "22222222-2222-4222-8222-222222222222",
          matchId: scoreboardProjection.matchId,
          currentSeq: 4,
          appendedEvents: [
            { eventId: "33333333-3333-4333-8333-333333333333", seqNo: 4, eventType: "SHOT_CLOCK_RESET" }
          ],
          reasonCode: null,
          message: null
        })
      );
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await client.resetShotClock(scoreboardProjection.matchId, {
      expectedSeq: 3,
      payload: { resetToMs: 14000, reason: null }
    });

    const [, init] = fetchMock.mock.calls[1]!;
    const body = JSON.parse(String(init?.body));
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/v1/matches/${scoreboardProjection.matchId}/commands/clock/shot/reset`,
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" })
      })
    );
    expect(body).toMatchObject({
      matchId: scoreboardProjection.matchId,
      expectedSeq: 3,
      payload: { resetToMs: 14000, reason: null }
    });
    expect(body.commandId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test("loads public scoreboard projection without requiring an auth envelope", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(scoreboardProjection));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.getPublicScoreboard(scoreboardProjection.matchId)).resolves.toEqual(scoreboardProjection);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/public/matches/${scoreboardProjection.matchId}/scoreboard`,
      expect.objectContaining({ credentials: "include" })
    );
  });
});

describe("auth state", () => {
  test("initial auth me 401 is represented as signed out without a login error", () => {
    const state = reduceAuthState(createInitialAuthState(), {
      type: "USER_LOADED",
      user: null
    });

    expect(state.user).toBeNull();
    expect(state.error).toBeNull();
    expect(state.loading).toBe(false);
  });

  test("login success stores user and csrf in memory without storing a session token", () => {
    const state = reduceAuthState(createInitialAuthState(), {
      type: "LOGIN_SUCCEEDED",
      user: adminUser,
      csrfToken: "csrf-token"
    });

    expect(state.user).toEqual(adminUser);
    expect(state.csrfToken).toBe("csrf-token");
    expect(localStorage.getItem("sessionToken")).toBeNull();
    expect(sessionStorage.getItem("sessionToken")).toBeNull();
  });

  test("login failure keeps INVALID_CREDENTIALS safe for display", () => {
    const state = reduceAuthState(createInitialAuthState(), {
      type: "LOGIN_FAILED",
      reasonCode: "INVALID_CREDENTIALS",
      message: "Invalid credentials"
    });

    expect(state.error).toEqual({
      reasonCode: "INVALID_CREDENTIALS",
      message: "Invalid credentials"
    });
    expect(state.user).toBeNull();
  });

  test("logout clears authenticated state", () => {
    const loggedIn = reduceAuthState(createInitialAuthState(), {
      type: "LOGIN_SUCCEEDED",
      user: adminUser,
      csrfToken: "csrf-token"
    });

    expect(reduceAuthState(loggedIn, { type: "LOGGED_OUT" })).toEqual(createInitialAuthState());
  });
});

describe("admin assignment UI policy", () => {
  test("protected admin route redirects unauthenticated users to login", () => {
    expect(getProtectedRouteDecision(null, { requireRole: "ADMIN" })).toEqual({ action: "REDIRECT", to: "/login" });
  });

  test("viewer cannot see assignment form", () => {
    expect(canManageAssignments(viewerUser)).toBe(false);
    expect(getProtectedRouteDecision(viewerUser, { requireRole: "ADMIN" })).toEqual({
      action: "REDIRECT",
      to: "/unauthorized"
    });
  });

  test("admin can submit assignment form through the API client", async () => {
    const api = {
      assignOfficial: vi.fn().mockResolvedValue({ id: "assignment-1", matchId: "match-1" })
    };
    const form = createAssignmentFormState({ userId: "user-1", roleCode: "REFEREE" });

    const result = await submitAssignmentForm(api, "match-1", form);

    expect(api.assignOfficial).toHaveBeenCalledWith("match-1", { userId: "user-1", roleCode: "REFEREE" });
    expect(result).toEqual({ ok: true, assignmentId: "assignment-1" });
  });

  test("revoke requires a reason", () => {
    expect(validateRevokeReason("   ")).toEqual({
      ok: false,
      reasonCode: "REASON_REQUIRED",
      message: "Revocation reason is required"
    });
    expect(validateRevokeReason("wrong court assignment")).toEqual({ ok: true });
  });
});

describe("operator match landing UI policy", () => {
  test("unauthenticated operator route redirects to login", () => {
    expect(getProtectedRouteDecision(null)).toEqual({ action: "REDIRECT", to: "/login" });
  });

  test("scorer can access operator matches and viewer cannot", () => {
    const scorerUser: AuthenticatedUser = {
      ...viewerUser,
      role: "SCORER",
      roles: ["SCORER"],
      permissions: ["match.read", "match.score.operate", "public.scoreboard.read"]
    };

    expect(canAccessOperatorMatches(scorerUser)).toBe(true);
    expect(canAccessOperatorMatches(viewerUser)).toBe(false);
  });

  test("scorer match card links assigned match to score control and public scoreboard", () => {
    const card = buildOperatorMatchCard({
      matchId: "match-1",
      homeTeamId: "home-1",
      awayTeamId: "away-1",
      status: "SCHEDULED",
      scheduledAt: "2026-07-01T10:00:00.000Z",
      venueName: "Court A",
      assignedRoleCodes: ["SCORER"],
      currentSeq: 0
    });

    expect(card.title).toBe("home-1 vs away-1");
    expect(card.assignedRolesLabel).toBe("SCORER");
    expect(card.scoreControl).toEqual({
      enabled: true,
      href: "/operator/matches/match-1/score",
      label: "Open Score Control"
    });
    expect(card.foulControl).toEqual({
      enabled: true,
      href: "/operator/matches/match-1/fouls",
      label: "Open Foul Control"
    });
    expect(card.clockControl).toEqual({
      enabled: true,
      href: "/operator/matches/match-1/clock",
      label: "Open Clock Control"
    });
    expect(card.timeoutControl).toEqual({
      enabled: true,
      href: "/operator/matches/match-1/timeouts",
      label: "Open Timeout Control"
    });
    expect(card.summary).toEqual({
      enabled: true,
      href: "/operator/matches/match-1/summary",
      label: "Open Match Summary"
    });
    expect(card.replay).toEqual({
      enabled: true,
      href: "/operator/matches/match-1/replay",
      label: "Open Replay"
    });
    expect(card.publicScoreboard).toEqual({
      enabled: true,
      href: "/public/scoreboard/match-1",
      label: "Public Scoreboard"
    });
    expect(card.currentSeqLabel).toBe("Seq 0");
  });

  test("score control requires score operation permission", () => {
    const scorerUser: AuthenticatedUser = {
      ...viewerUser,
      role: "SCORER",
      roles: ["SCORER"],
      permissions: ["match.read", "match.score.operate", "public.scoreboard.read"]
    };

    expect(canOperateScore(scorerUser)).toBe(true);
    expect(canOperateScore(viewerUser)).toBe(false);
    expect(canReadAuditLog(adminUser)).toBe(true);
    expect(canReadAuditLog(scorerUser)).toBe(false);
    expect(buildOperatorMatchScoreLink("match 1")).toBe("/operator/matches/match%201/score");
    expect(buildOperatorMatchFoulsLink("match 1")).toBe("/operator/matches/match%201/fouls");
    expect(buildOperatorMatchClockLink("match 1")).toBe("/operator/matches/match%201/clock");
    expect(buildOperatorMatchTimeoutsLink("match 1")).toBe("/operator/matches/match%201/timeouts");
    expect(buildOperatorMatchLifecycleLink("match 1")).toBe("/operator/matches/match%201/lifecycle");
    expect(buildOperatorMatchSummaryLink("match 1")).toBe("/operator/matches/match%201/summary");
    expect(buildOperatorMatchReplayLink("match 1")).toBe("/operator/matches/match%201/replay");
    expect(buildOperatorMatchAuditLogLink("match 1")).toBe("/operator/matches/match%201/audit-log");
  });

  test("empty operator match state is explicit", () => {
    expect(createEmptyOperatorMatchesMessage()).toBe("No assigned matches.");
  });

  test("admin match list exposes officials, operator, and public scoreboard actions", () => {
    expect(buildAdminMatchLink("match-1")).toBe("/admin/matches/match-1/officials");
    expect(buildAdminMatchActions("match-1")).toEqual({
      officials: { href: "/admin/matches/match-1/officials", label: "Officials" },
      rosters: { href: "/admin/matches/match-1/rosters", label: "Rosters" },
      lineup: { href: "/admin/matches/match-1/lineup", label: "Lineup" },
      summary: { href: "/admin/matches/match-1/summary", label: "Summary" },
      replay: { href: "/admin/matches/match-1/replay", label: "Replay" },
      auditLog: { href: "/admin/matches/match-1/audit-log", label: "Audit Log" },
      operator: { href: "/operator/matches/match-1/score", label: "Operator Score" },
      fouls: { href: "/operator/matches/match-1/fouls", label: "Operator Fouls" },
      clock: { href: "/operator/matches/match-1/clock", label: "Operator Clock" },
      timeouts: { href: "/operator/matches/match-1/timeouts", label: "Operator Timeouts" },
      lifecycle: { href: "/operator/matches/match-1/lifecycle", label: "Operator Lifecycle" },
      publicScoreboard: { href: "/public/scoreboard/match-1", label: "Public scoreboard" }
    });
  });
});

describe("roster control UI policy", () => {
  test("builds roster links and player form payloads", () => {
    expect(buildAdminRosterLink("match 1")).toBe("/admin/matches/match%201/rosters");
    expect(buildAdminLineupLink("match 1")).toBe("/admin/matches/match%201/lineup");
    expect(createPlayerFormState()).toEqual({ displayName: "", jerseyNumber: "", position: "UNKNOWN" });
    expect(buildCreatePlayerPayload({ displayName: " Narin Guard ", jerseyNumber: " 7 ", position: "GUARD" }))
      .toEqual({ displayName: "Narin Guard", jerseyNumber: "7", position: "GUARD", active: true });
  });

  test("builds roster-backed player foul and score attribution options", () => {
    expect(getRosterPlayersForSide(matchRosters, "HOME")).toHaveLength(2);
    expect(buildScorePlayerOptions(matchRosters, "HOME")).toEqual([
      { playerId: matchRosters.rosters.HOME[0].playerId, label: "#7 Narin Guard - STARTER, CAPTAIN" },
      { playerId: matchRosters.rosters.HOME[1].playerId, label: "Bench Forward - BENCH" }
    ]);
    expect(getRosterPlayerRoleLabels(matchRosters.rosters.HOME[0])).toEqual(["STARTER", "CAPTAIN"]);
    expect(getRosterPlayerRoleLabels(matchRosters.rosters.HOME[1])).toEqual(["BENCH"]);
    expect(buildRosterReadinessLabel(matchRosters.readiness!.home)).toBe("NEEDS STARTERS");
    expect(buildPlayerFoulCommandPayload(scoreboardProjection, matchRosters.rosters.HOME[0], {
      foulType: "PERSONAL",
      reason: " reach "
    })).toEqual({
      expectedSeq: 3,
      payload: {
        teamSide: "HOME",
        playerId: matchRosters.rosters.HOME[0].playerId,
        foulType: "PERSONAL",
        reason: "reach"
      }
    });
  });
});

describe("score control UI policy", () => {
  test("builds large HOME and AWAY score panels from projection team names", () => {
    const panels = buildScoreControlPanels(scoreboardProjection);

    expect(scorePointOptions).toEqual([1, 2, 3]);
    expect(panels).toEqual([
      {
        teamSide: "HOME",
        label: "HOME",
        teamName: "Bangkok HOME",
        score: 10,
        buttons: [
          { points: 1, label: "+1", pendingKey: "HOME-1" },
          { points: 2, label: "+2", pendingKey: "HOME-2" },
          { points: 3, label: "+3", pendingKey: "HOME-3" }
        ]
      },
      {
        teamSide: "AWAY",
        label: "AWAY",
        teamName: "Chiang Mai AWAY",
        score: 8,
        buttons: [
          { points: 1, label: "+1", pendingKey: "AWAY-1" },
          { points: 2, label: "+2", pendingKey: "AWAY-2" },
          { points: 3, label: "+3", pendingKey: "AWAY-3" }
        ]
      }
    ]);
  });

  test("builds score command payload from current projection without client-owned totals", () => {
    expect(buildScoreCommandPayload(scoreboardProjection, "AWAY", 3)).toEqual({
      expectedSeq: 3,
      payload: {
        teamSide: "AWAY",
        points: 3,
        playerId: null,
        periodNumber: 1,
        gameClockRemainingMs: 512000,
        note: null
      }
    });
  });

  test("maps score control pending and command result feedback", () => {
    expect(getScoreControlPendingLabel("HOME-2", "HOME-2")).toBe("Saving...");
    expect(getScoreControlPendingLabel("HOME-2", "AWAY-2")).toBe("+2");
    expect(
      getScoreControlFeedback({
        status: "ACCEPTED",
        commandId: "cmd",
        matchId: scoreboardProjection.matchId,
        currentSeq: 4,
        appendedEvents: [],
        reasonCode: null,
        message: null
      })
    ).toEqual({ tone: "success", text: "Score updated. Current seq 4." });
    expect(
      getScoreControlFeedback({
        status: "SYNC_REQUIRED",
        commandId: "cmd",
        matchId: scoreboardProjection.matchId,
        currentSeq: 5,
        appendedEvents: [],
        reasonCode: "INVALID_EXPECTED_SEQ",
        message: "Expected seq 3, current seq 5"
      })
    ).toEqual({
      tone: "error",
      code: "INVALID_EXPECTED_SEQ",
      text: "Conflict: scoreboard refreshed, please try again."
    });
  });

  test("uses accepted command projection for immediate score UI updates", () => {
    const nextProjection = { ...scoreboardProjection, currentSeq: 4, homeScore: 12 };
    expect(
      getAcceptedScoreProjection({
        status: "ACCEPTED",
        commandId: "cmd",
        matchId: scoreboardProjection.matchId,
        currentSeq: 4,
        appendedEvents: [],
        reasonCode: null,
        message: null,
        projection: nextProjection
      })
    ).toEqual(nextProjection);
    expect(
      getAcceptedScoreProjection({
        status: "SYNC_REQUIRED",
        commandId: "cmd",
        matchId: scoreboardProjection.matchId,
        currentSeq: 5,
        appendedEvents: [],
        reasonCode: "INVALID_EXPECTED_SEQ",
        message: "Expected seq 3, current seq 5"
      })
    ).toBeNull();
  });

  test("disables live score controls and shows correction warning after match is finished", () => {
    expect(isFinishedMatchStatus("FINISHED")).toBe(true);
    expect(isFinishedMatchStatus("FINAL")).toBe(true);
    expect(canUseLiveMatchControls({ ...scoreboardProjection, status: "FINISHED" }, true, false)).toBe(false);
    expect(canUseLiveMatchControls({ ...scoreboardProjection, status: "FINAL" }, true, false)).toBe(false);
    expect(canUseLiveMatchControls({ ...scoreboardProjection, status: "LIVE" }, true, false)).toBe(true);
    expect(canUseLiveMatchControls({ ...scoreboardProjection, status: "PERIOD_BREAK" }, true, false)).toBe(true);
    expect(finishedMatchLiveControlWarning).toBe("Match is finished. Use correction workflow for post-game edits.");
  });

  test("score command response projection does not require a roster refetch", async () => {
    const nextProjection = { ...scoreboardProjection, currentSeq: 4, homeScore: 12 };
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "ACCEPTED",
          commandId: "22222222-2222-4222-8222-222222222222",
          matchId: scoreboardProjection.matchId,
          currentSeq: 4,
          appendedEvents: [{ eventId: "33333333-3333-4333-8333-333333333333", seqNo: 4, eventType: "SCORE_ADDED" }],
          reasonCode: null,
          message: null,
          projection: nextProjection
        })
      );
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    const result = await client.addScore(scoreboardProjection.matchId, {
      expectedSeq: 3,
      payload: { ...scorePayload, playerId: matchRosters.rosters.HOME[0].playerId }
    });

    expect(getAcceptedScoreProjection(result)).toEqual(nextProjection);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(
      `/api/v1/matches/${scoreboardProjection.matchId}/rosters`
    );
  });

  test("builds score control navigation links", () => {
    expect(getScoreControlLinks(scoreboardProjection.matchId, adminUser)).toEqual({
      operatorMatches: { href: "/operator/matches", label: "Back to Operator Matches" },
      summary: {
        href: `/operator/matches/${scoreboardProjection.matchId}/summary`,
        label: "Open Match Summary"
      },
      replay: {
        href: `/operator/matches/${scoreboardProjection.matchId}/replay`,
        label: "Open Replay"
      },
      auditLog: {
        href: `/operator/matches/${scoreboardProjection.matchId}/audit-log`,
        label: "Open Audit Log"
      },
      publicScoreboard: {
        href: `/public/scoreboard/${scoreboardProjection.matchId}`,
        label: "Open Public Scoreboard"
      },
      adminMatches: { href: "/admin/matches", label: "Admin Match List" }
    });
    expect(getScoreControlLinks(scoreboardProjection.matchId, viewerUser).adminMatches).toBeNull();
    expect(getScoreControlLinks(scoreboardProjection.matchId, viewerUser).auditLog).toBeNull();
  });
});

describe("foul control UI policy", () => {
  test("builds HOME and AWAY team foul panels from projection team names", () => {
    expect(buildFoulControlPanels(scoreboardProjection)).toEqual([
      {
        teamSide: "HOME",
        label: "HOME",
        teamName: "Bangkok HOME",
        fouls: 2,
        pendingKey: "TEAM-HOME"
      },
      {
        teamSide: "AWAY",
        label: "AWAY",
        teamName: "Chiang Mai AWAY",
        fouls: 1,
        pendingKey: "TEAM-AWAY"
      }
    ]);
  });

  test("builds team foul command payload from current projection without client-owned totals", () => {
    expect(buildTeamFoulCommandPayload(scoreboardProjection, "AWAY", {
      foulType: "TECHNICAL",
      reason: " bench warning "
    })).toEqual({
      expectedSeq: 3,
      payload: {
        teamSide: "AWAY",
        foulType: "TECHNICAL",
        reason: "bench warning"
      }
    });
  });

  test("maps foul control command result feedback", () => {
    expect(
      getFoulControlFeedback({
        status: "ACCEPTED",
        commandId: "cmd",
        matchId: scoreboardProjection.matchId,
        currentSeq: 4,
        appendedEvents: [],
        reasonCode: null,
        message: null
      })
    ).toEqual({ tone: "success", text: "Foul added. Current seq 4." });
    expect(
      getFoulControlFeedback({
        status: "SYNC_REQUIRED",
        commandId: "cmd",
        matchId: scoreboardProjection.matchId,
        currentSeq: 5,
        appendedEvents: [],
        reasonCode: "INVALID_EXPECTED_SEQ",
        message: "Expected seq 3, current seq 5"
      })
    ).toEqual({
      tone: "error",
      code: "INVALID_EXPECTED_SEQ",
      text: "Conflict: refreshed, please try again."
    });
  });

  test("disables live foul controls and shows correction warning after match is finished", () => {
    expect(canUseLiveMatchControls({ ...scoreboardProjection, status: "FINISHED" }, true, false)).toBe(false);
    expect(canUseLiveMatchControls({ ...scoreboardProjection, status: "FINAL" }, true, false)).toBe(false);
    expect(canUseLiveMatchControls({ ...scoreboardProjection, status: "LIVE" }, true, false)).toBe(true);
    expect(finishedMatchLiveControlWarning).toBe("Match is finished. Use correction workflow for post-game edits.");
  });
});

describe("match summary UI policy", () => {
  test("builds team total labels for summary cards", () => {
    expect(getSummaryTeamTotals(matchSummary.home)).toEqual([
      { label: "Score", value: "22" },
      { label: "Team fouls", value: "5" },
      { label: "Timeouts", value: "2 used / 3 remaining" },
      { label: "Unattributed points", value: "4" }
    ]);
  });

  test("builds starter and captain labels for box score players", () => {
    expect(buildSummaryPlayerLabels(matchSummary.home.players[0])).toEqual(["STARTER", "CAPTAIN"]);
    expect(buildSummaryPlayerLabels({ ...matchSummary.home.players[0], isStarter: false, isCaptain: false })).toEqual([]);
  });

  test("summary dashboard is read-only", () => {
    expect(hasSummaryMutationControls()).toBe(false);
  });
});

describe("match replay UI policy", () => {
  test("builds replay filter options and event labels", () => {
    expect(buildReplayEventGroupOptions()).toEqual([
      { value: "all", label: "All" },
      { value: "score", label: "Score" },
      { value: "foul", label: "Fouls" },
      { value: "timeout", label: "Timeouts" },
      { value: "clock", label: "Clock" },
      { value: "lifecycle", label: "Lifecycle" },
      { value: "correction", label: "Corrections" }
    ]);
    expect(buildReplayEventMeta(matchReplay.items[0])).toEqual({
      badge: "SCORE",
      title: "HOME +2",
      description: "Narin Guard scored 2 points.",
      timestamp: expect.any(String)
    });
  });

  test("formats replay score-after state and remains read-only", () => {
    expect(getReplayScoreAfterLabel(matchReplay.items[0], matchReplay)).toBe("Score after: Bangkok HOME 2 - 0 Chiang Mai AWAY");
    expect(getReplayScoreAfterLabel(matchReplay.items[1], matchReplay)).toBeNull();
    expect(hasReplayMutationControls()).toBe(false);
  });
});

describe("match audit log UI policy", () => {
  test("builds audit filters, row metadata, and correction review rows", () => {
    expect(buildAuditLogFilterOptions()).toEqual([
      { value: "all", label: "All" },
      { value: "score", label: "Score" },
      { value: "foul", label: "Fouls" },
      { value: "clock", label: "Clock" },
      { value: "shot_clock", label: "Shot Clock" },
      { value: "timeout", label: "Timeouts" },
      { value: "lifecycle", label: "Lifecycle" },
      { value: "roster_lineup", label: "Roster/Lineup" },
      { value: "correction", label: "Corrections" },
      { value: "rejected", label: "Rejected" },
      { value: "other", label: "Other" }
    ]);
    expect(buildAuditLogRowMeta(matchAuditLog.rows[1])).toEqual({
      badge: "CORRECTION",
      title: "Correction review item",
      actorLabel: "actor-3",
      reasonLabel: "wrong team",
      timestamp: expect.any(String)
    });
    expect(getAuditCorrectionRows(matchAuditLog)).toEqual([matchAuditLog.rows[1]]);
  });

  test("audit log dashboard is read-only", () => {
    expect(hasAuditLogMutationControls()).toBe(false);
  });
});

describe("tournament schedule UI policy", () => {
  test("builds actionable tournament setup empty states and quick links", () => {
    expect(getTournamentEmptyState()).toEqual({
      title: "No tournaments yet",
      description: "Create a tournament to start scheduling matches.",
      helperText: "After creating a tournament, add teams and scheduled matches.",
      primaryActionLabel: "Create Tournament"
    });
    expect(buildTournamentQuickLinks("tournament 1")).toEqual([
      { href: "/admin/tournaments/tournament%201/schedule", label: "Schedule", private: true },
      { href: "/admin/tournaments/tournament%201/standings", label: "Standings", private: true },
      { href: "/public/tournaments/tournament%201/schedule", label: "Public Schedule", private: false },
      { href: "/public/tournaments/tournament%201/standings", label: "Public Standings", private: false }
    ]);
  });

  test("builds scheduled match form feedback for missing and duplicate team choices", () => {
    expect(getScheduledMatchFormFeedback(createScheduledMatchFormState(), 0)).toEqual({
      disabled: true,
      warning: "Create at least two teams before scheduling a match."
    });
    expect(getScheduledMatchFormFeedback({ ...createScheduledMatchFormState(), homeTeamId: "home-team" }, 2)).toEqual({
      disabled: true,
      warning: "Select both Home and Away teams."
    });
    expect(getScheduledMatchFormFeedback({
      ...createScheduledMatchFormState(),
      homeTeamId: "home-team",
      awayTeamId: "home-team"
    }, 2)).toEqual({
      disabled: true,
      warning: "Home and Away teams must be different."
    });
    expect(getScheduledMatchFormFeedback({
      ...createScheduledMatchFormState(),
      homeTeamId: "home-team",
      awayTeamId: "away-team"
    }, 2)).toEqual({ disabled: false, warning: null });
    expect(getScheduledMatchFormFeedback({
      ...createScheduledMatchFormState(),
      homeTeamId: "home-team",
      awayTeamId: "away-team"
    }, 2, true)).toEqual({
      disabled: true,
      warning: "Saving scheduled match..."
    });
  });

  test("builds schedule links, filters, and public-safe row metadata", () => {
    expect(buildAdminTournamentScheduleLink("tournament 1")).toBe("/admin/tournaments/tournament%201/schedule");
    expect(buildAdminTournamentStandingsLink("tournament 1")).toBe("/admin/tournaments/tournament%201/standings");
    expect(buildPublicTournamentScheduleLink("tournament 1")).toBe("/public/tournaments/tournament%201/schedule");
    expect(buildPublicTournamentStandingsLink("tournament 1")).toBe("/public/tournaments/tournament%201/standings");
    expect(createTournamentFormState()).toEqual({ name: "", status: "ACTIVE", startsAt: "", endsAt: "" });
    expect(createTeamFormState("tournament-1")).toEqual({ tournamentId: "tournament-1", name: "", shortName: "" });
    expect(createScheduledMatchFormState()).toEqual({
      homeTeamId: "",
      awayTeamId: "",
      scheduledAt: "",
      roundLabel: "",
      courtLabel: "",
      venueLabel: ""
    });
    expect(createTournamentPayload({ name: " Alpha Cup ", status: "ACTIVE", startsAt: "", endsAt: "" })).toEqual({
      name: "Alpha Cup",
      status: "ACTIVE",
      startsAt: null,
      endsAt: null
    });
    expect(createTournamentMatchPayload({
      homeTeamId: "home-team",
      awayTeamId: "away-team",
      scheduledAt: "",
      roundLabel: " Round 1 ",
      courtLabel: "",
      venueLabel: " Main Hall "
    })).toEqual({
      homeTeamId: "home-team",
      awayTeamId: "away-team",
      roundLabel: "Round 1",
      courtLabel: null,
      venueLabel: "Main Hall",
      scheduledAt: null
    });
    expect(buildScheduleStatusFilters()).toEqual([
      { value: "all", label: "All" },
      { value: "scheduled", label: "Scheduled" },
      { value: "live", label: "Live" },
      { value: "finished", label: "Finished" }
    ]);
    expect(buildScheduleRowMeta(tournamentSchedule.matches[0])).toEqual({
      matchupLabel: "Bangkok HOME vs Chiang Mai AWAY",
      scoreLabel: "10 - 8",
      scheduleLabel: expect.any(String),
      locationLabel: "Court A",
      statusGroup: "live"
    });
    expect(getPublicScheduleLinks(tournamentSchedule.matches[0])).toEqual({
      scoreboard: {
        href: `/public/scoreboard/${scoreboardProjection.matchId}`,
        label: "Open Scoreboard"
      },
      summary: null,
      auditLog: null,
      replay: null,
      operator: null
    });
  });

  test("public schedule dashboard is read-only", () => {
    expect(hasPublicScheduleMutationControls()).toBe(false);
    expect(getPublicScheduleEmptyState(0)).toEqual({
      title: "No scheduled matches",
      description: "This tournament does not have scheduled matches yet."
    });
  });

  test("builds provisional standings row metadata and public-safe links", () => {
    expect(buildStandingsRowMeta(tournamentStandings.rows[0], 1)).toEqual({
      provisionalRank: 1,
      recordLabel: "1-0",
      pointDifferentialLabel: "+2",
      tieLabel: "Clear"
    });
    expect(getPublicStandingsLinks("tournament-1")).toEqual({
      schedule: {
        href: "/public/tournaments/tournament-1/schedule",
        label: "Open Public Schedule"
      },
      auditLog: null,
      replay: null,
      operator: null
    });
    expect(hasPublicStandingsMutationControls()).toBe(false);
    expect(getPublicStandingsEmptyState(0, 0)).toEqual({
      title: "No finished matches",
      description: "Standings are provisional and will update after finished matches are available."
    });
  });
});

describe("clock control UI policy", () => {
  test("builds clock display state from projection", () => {
    expect(buildClockControlState(scoreboardProjection)).toEqual({
      gameClockLabel: "8:32",
      gameClockRunning: false,
      shotClockLabel: "24",
      shotClockRunning: false,
      expectedSeq: 3
    });
  });

  test("derives stopped clock display from authoritative remaining time", () => {
    expect(
      deriveDisplayClockMs({
        clock: { remainingMs: 512000, running: false, lastStartedAt: null },
        fallbackRemainingMs: 600000,
        nowMs: Date.parse("2026-07-01T10:00:05.000Z")
      })
    ).toBe(512000);
  });

  test("derives running clock display using server time and client receipt time", () => {
    expect(
      deriveDisplayClockMs({
        clock: {
          remainingMs: 600000,
          running: true,
          lastStartedAt: "2026-07-01T10:00:00.000Z"
        },
        fallbackRemainingMs: 600000,
        serverTime: "2026-07-01T10:00:01.000Z",
        receivedAtMs: Date.parse("2026-07-01T10:00:02.000Z"),
        nowMs: Date.parse("2026-07-01T10:00:04.500Z")
      })
    ).toBe(596500);
  });

  test("derived running clock display never goes below zero and resyncs with new polling projection", () => {
    const firstProjection: ScoreboardProjection = {
      ...scoreboardProjection,
      gameClock: {
        remainingMs: 1000,
        running: true,
        lastStartedAt: "2026-07-01T10:00:00.000Z"
      },
      gameClockRemainingMs: 1000,
      serverTime: "2026-07-01T10:00:00.000Z"
    };
    const resyncedProjection: ScoreboardProjection = {
      ...scoreboardProjection,
      gameClock: {
        remainingMs: 9000,
        running: true,
        lastStartedAt: "2026-07-01T10:01:00.000Z"
      },
      gameClockRemainingMs: 9000,
      serverTime: "2026-07-01T10:01:00.000Z"
    };

    expect(buildClockControlState(firstProjection, {
      nowMs: Date.parse("2026-07-01T10:00:05.000Z"),
      receivedAtMs: Date.parse("2026-07-01T10:00:00.000Z")
    }).gameClockLabel).toBe("0:00");
    expect(buildClockControlState(resyncedProjection, {
      nowMs: Date.parse("2026-07-01T10:01:02.000Z"),
      receivedAtMs: Date.parse("2026-07-01T10:01:00.000Z")
    }).gameClockLabel).toBe("0:07");
  });

  test("derives running shot clock display from projection for operator and public screens", () => {
    const runningShotClockProjection: ScoreboardProjection = {
      ...scoreboardProjection,
      shotClockRemainingMs: 24000,
      shotClock: {
        remainingMs: 24000,
        running: true,
        lastStartedAt: "2026-07-01T10:00:00.000Z"
      },
      serverTime: "2026-07-01T10:00:00.000Z"
    };

    expect(buildClockControlState(runningShotClockProjection, {
      nowMs: Date.parse("2026-07-01T10:00:03.100Z"),
      receivedAtMs: Date.parse("2026-07-01T10:00:00.000Z")
    })).toMatchObject({
      shotClockLabel: "21",
      shotClockRunning: true
    });
  });

  test("freezes shot clock display when polling resyncs a stopped projection", () => {
    const stoppedShotClockProjection: ScoreboardProjection = {
      ...scoreboardProjection,
      shotClockRemainingMs: 19000,
      shotClock: {
        remainingMs: 19000,
        running: false,
        lastStartedAt: null
      },
      serverTime: "2026-07-01T10:00:05.000Z"
    };

    expect(buildClockControlState(stoppedShotClockProjection, {
      nowMs: Date.parse("2026-07-01T10:00:30.000Z"),
      receivedAtMs: Date.parse("2026-07-01T10:00:05.000Z")
    })).toMatchObject({
      shotClockLabel: "19",
      shotClockRunning: false
    });
  });

  test("builds game and shot clock command payloads from current projection", () => {
    expect(buildGameClockSetPayload(scoreboardProjection, { minutes: 7, seconds: 30, reason: " table correction " }))
      .toEqual({
        expectedSeq: 3,
        payload: { remainingMs: 450000, reason: "table correction" }
      });
    expect(buildShotClockSetPayload(scoreboardProjection, { seconds: 12, reason: "" })).toEqual({
      expectedSeq: 3,
      payload: { remainingMs: 12000, reason: null }
    });
    expect(buildShotClockResetPayload(scoreboardProjection, 14000, "")).toEqual({
      expectedSeq: 3,
      payload: { resetToMs: 14000, reason: null }
    });
  });

  test("maps clock control command result feedback", () => {
    expect(
      getClockControlFeedback({
        status: "ACCEPTED",
        commandId: "cmd",
        matchId: scoreboardProjection.matchId,
        currentSeq: 4,
        appendedEvents: [],
        reasonCode: null,
        message: null
      })
    ).toEqual({ tone: "success", text: "Clock updated. Current seq 4." });
    expect(
      getClockControlFeedback({
        status: "SYNC_REQUIRED",
        commandId: "cmd",
        matchId: scoreboardProjection.matchId,
        currentSeq: 5,
        appendedEvents: [],
        reasonCode: "INVALID_EXPECTED_SEQ",
        message: "Expected seq 3, current seq 5"
      })
    ).toEqual({
      tone: "error",
      code: "INVALID_EXPECTED_SEQ",
      text: "Conflict: refreshed, please try again."
    });
  });
});

describe("timeout control UI policy", () => {
  test("builds timeout panels from projection defaults and active timeout state", () => {
    const projection: ScoreboardProjection = {
      ...scoreboardProjection,
      timeouts: { home: { used: 1, remaining: 4 }, away: { used: 0, remaining: 5 } },
      activeTimeout: {
        teamSide: "HOME",
        startedAt: "2026-07-02T10:00:00.000Z",
        durationMs: 60000,
        remainingMs: 45000,
        requestedBy: "HEAD_COACH"
      }
    };

    expect(buildTimeoutControlPanels(projection)).toEqual([
      { teamSide: "HOME", teamName: "Bangkok HOME", used: 1, remaining: 4, pendingKey: "grant-HOME" },
      { teamSide: "AWAY", teamName: "Chiang Mai AWAY", used: 0, remaining: 5, pendingKey: "grant-AWAY" }
    ]);
    expect(getActiveTimeoutLabel(projection)).toBe("Bangkok HOME timeout - 45s remaining");
    expect(timeoutRequestedByOptions).toContain("HEAD_COACH");
  });

  test("builds timeout command payloads with expectedSeq", () => {
    expect(buildTimeoutGrantPayload(scoreboardProjection, "AWAY", "BENCH", 60000, "TV break")).toEqual({
      expectedSeq: 3,
      payload: { teamSide: "AWAY", requestedBy: "BENCH", durationMs: 60000, reason: "TV break" }
    });
    expect(buildTimeoutEndPayload(scoreboardProjection, "Done")).toEqual({
      expectedSeq: 3,
      payload: { reason: "Done" }
    });
  });

  test("maps timeout command feedback", () => {
    expect(getTimeoutControlFeedback({
      status: "ACCEPTED",
      commandId: "cmd",
      matchId: scoreboardProjection.matchId,
      currentSeq: 4,
      appendedEvents: [],
      reasonCode: null,
      message: null
    })).toEqual({ tone: "success", text: "Timeout updated. Current seq 4." });
    expect(getTimeoutControlFeedback({
      status: "REJECTED",
      commandId: "cmd",
      matchId: scoreboardProjection.matchId,
      currentSeq: 3,
      appendedEvents: [],
      reasonCode: "VALIDATION_ERROR",
      message: "Active timeout already exists"
    })).toEqual({ tone: "error", code: "VALIDATION_ERROR", text: "Active timeout already exists" });
  });

  test("builds timeout page sibling links", () => {
    expect(Object.values(getTimeoutControlLinks(scoreboardProjection.matchId)).map((link) => link.href)).toContain(
      `/public/scoreboard/${scoreboardProjection.matchId}`
    );
  });
});

describe("match lifecycle control UI policy", () => {
  test("builds lifecycle state with safe defaults for old projections", () => {
    expect(buildLifecycleControlState(scoreboardProjection)).toEqual({
      status: "LIVE",
      periodNumber: 1,
      periodType: "REGULATION",
      expectedSeq: 3,
      scoreLabel: "Bangkok HOME 10 - 8 Chiang Mai AWAY",
      clockLabel: "8:32",
      finalLabel: null
    });

    expect(buildLifecycleControlState({
      ...scoreboardProjection,
      status: "FINISHED",
      winnerSide: "HOME",
      finalScore: { home: 91, away: 88 }
    })).toMatchObject({
      status: "FINISHED",
      finalLabel: "Final: Bangkok HOME 91 - 88 Chiang Mai AWAY (HOME)"
    });
  });

  test("enables only phase-safe lifecycle actions", () => {
    expect(getLifecycleActionPlan({ ...scoreboardProjection, status: "READY" })).toMatchObject({
      startMatch: { enabled: true },
      endPeriod: { enabled: false },
      startNextPeriod: { enabled: false },
      startOvertime: { enabled: false },
      finishMatch: { enabled: false }
    });

    expect(getLifecycleActionPlan({ ...scoreboardProjection, status: "PERIOD_BREAK", periodNumber: 4, homeScore: 80, awayScore: 80 }))
      .toMatchObject({
        startMatch: { enabled: false },
        startNextPeriod: { enabled: false },
        startOvertime: { enabled: true },
        finishMatch: { enabled: false }
      });
  });

  test("builds lifecycle command payload and feedback", () => {
    expect(buildLifecycleCommandPayload(scoreboardProjection, " final buzzer ")).toEqual({
      expectedSeq: 3,
      payload: { reason: "final buzzer" }
    });
    expect(buildLifecycleCommandPayload(scoreboardProjection, "")).toEqual({
      expectedSeq: 3,
      payload: { reason: null }
    });
    expect(getLifecycleControlFeedback({
      status: "ACCEPTED",
      commandId: "cmd",
      matchId: scoreboardProjection.matchId,
      currentSeq: 4,
      appendedEvents: [{ eventId: "event", seqNo: 4, eventType: "MATCH_FINISHED" }],
      reasonCode: null,
      message: null
    })).toEqual({ tone: "success", text: "Match finished. Current seq 4." });
    expect(getLifecycleControlFeedback({
      status: "SYNC_REQUIRED",
      commandId: "cmd",
      matchId: scoreboardProjection.matchId,
      currentSeq: 5,
      appendedEvents: [],
      reasonCode: "INVALID_EXPECTED_SEQ",
      message: "Expected seq 3, current seq 5"
    })).toEqual({ tone: "error", code: "INVALID_EXPECTED_SEQ", text: "Conflict: refreshed, please try again." });
  });

  test("builds lifecycle sibling links", () => {
    expect(getLifecycleControlLinks(scoreboardProjection.matchId)).toEqual({
      score: { href: `/operator/matches/${scoreboardProjection.matchId}/score`, label: "Score" },
      fouls: { href: `/operator/matches/${scoreboardProjection.matchId}/fouls`, label: "Fouls" },
      clock: { href: `/operator/matches/${scoreboardProjection.matchId}/clock`, label: "Clock" },
      timeouts: { href: `/operator/matches/${scoreboardProjection.matchId}/timeouts`, label: "Timeouts" },
      publicScoreboard: { href: `/public/scoreboard/${scoreboardProjection.matchId}`, label: "Public scoreboard" }
    });
  });
});

describe("public scoreboard realtime sync policy", () => {
  test("uses env transport config and supports polling-only mode", () => {
    expect(parseRealtimeSocketTransports("polling")).toEqual(["polling"]);
    expect(parseRealtimeSocketTransports("polling,websocket")).toEqual(["polling", "websocket"]);
    expect(parseRealtimeSocketTransports(undefined)).toEqual(["polling", "websocket"]);
  });

  test("applies realtime projection updates at the same or newer sequence", () => {
    const incoming: ScoreboardProjection = {
      ...scoreboardProjection,
      homeScore: 12,
      currentSeq: 4,
      lastEventSeq: 4
    };

    expect(applyRealtimeProjectionUpdate(scoreboardProjection, incoming)).toEqual(incoming);
    expect(applyRealtimeProjectionUpdate({ ...scoreboardProjection, currentSeq: 4 }, incoming)).toEqual(incoming);
  });

  test("ignores stale realtime projection updates so polling remains authoritative", () => {
    const current: ScoreboardProjection = {
      ...scoreboardProjection,
      homeScore: 12,
      currentSeq: 5,
      lastEventSeq: 5
    };
    const stale: ScoreboardProjection = {
      ...scoreboardProjection,
      homeScore: 10,
      currentSeq: 4,
      lastEventSeq: 4
    };

    expect(applyRealtimeProjectionUpdate(current, stale)).toBe(current);
  });

  test("detects realtime sequence gaps so callers can refetch authoritative projection", () => {
    const current: ScoreboardProjection = {
      ...scoreboardProjection,
      currentSeq: 5,
      lastEventSeq: 5
    };

    expect(shouldRefetchAfterRealtimeProjection(current, { ...scoreboardProjection, currentSeq: 6, lastEventSeq: 6 })).toBe(false);
    expect(shouldRefetchAfterRealtimeProjection(current, { ...scoreboardProjection, currentSeq: 8, lastEventSeq: 8 })).toBe(true);
  });

  test("derives socket base URL from same-origin and absolute API bases", () => {
    expect(getSocketBaseUrl("/api/v1")).toBeUndefined();
    expect(getSocketBaseUrl("https://scoreboard.example.com/api/v1")).toBe("https://scoreboard.example.com");
  });

  test("exposes realtime connection labels with explicit fallback states", () => {
    expect(getRealtimeConnectionLabel("CONNECTED")).toBe("Realtime connected");
    expect(getRealtimeConnectionLabel("RECONNECTING")).toBe("Realtime reconnecting");
    expect(getRealtimeConnectionLabel("UNAVAILABLE")).toBe("Realtime unavailable");
    expect(getRealtimeConnectionLabel("POLLING_FALLBACK")).toBe("Polling fallback active");
  });

  test("uses faster polling fallback intervals while realtime is disconnected", () => {
    expect(getPublicPollingIntervalMs("CONNECTED")).toBe(1000);
    expect(getPublicPollingIntervalMs("POLLING_FALLBACK")).toBe(300);
    expect(getOperatorPollingIntervalMs("RECONNECTING")).toBe(300);
    expect(getOperatorPollingIntervalMs("CONNECTED")).toBe(500);
  });
});
