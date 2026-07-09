import { readFileSync } from "node:fs";
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
  createAssignmentCandidateOptions,
  createAssignmentFormState,
  getAssignmentFormLabels,
  getProtectedRouteDecision,
  isAssignmentSubmitDisabled,
  submitAssignmentForm,
  toAssignmentValidationMessage,
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
  buildLineupSetupSummary,
  buildRosterReadinessLabel,
  buildRosterSetupSummary,
  buildSetupQuickLinks,
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
  getFoulControlFeedback,
  getFoulControlLinks
} from "../../apps/web/src/lib/foulControl";
import {
  buildClockControlState,
  buildGameClockSetPayload,
  buildShotClockResetPayload,
  buildShotClockSetPayload,
  deriveDisplayClockMs,
  getClockControlFeedback,
  getClockControlLinks
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
  buildReplayRowClassName,
  buildReplayCorrectionDetail,
  getReplayScoreAfterLabel,
  hasReplayMutationControls
} from "../../apps/web/src/lib/replayControl";
import {
  buildCorrectionCommandPayload,
  buildCorrectionEventMeta,
  buildCorrectionNavItems,
  canSubmitCorrectionReason,
  getCorrectionControlFeedback,
  hasCorrectionPublicExposure
} from "../../apps/web/src/lib/correctionControl";
import {
  buildAuditCorrectionDetailRows,
  buildAuditLogFilterOptions,
  buildAuditLogRowMeta,
  buildAuditRowClassName,
  getAuditCorrectionRows,
  hasAuditLogMutationControls
} from "../../apps/web/src/lib/auditLogControl";
import {
  buildAdminTournamentScheduleLink,
  buildAdminTournamentStandingsLink,
  buildAdminTournamentDisplayThemeLink,
  buildAdminTeamDisplayProfileLink,
  buildAdminMatchDisplayThemeLink,
  buildScheduleChecklistBadge,
  buildReadinessBadges,
  buildPublicTournamentScheduleLink,
  buildPublicTournamentStandingsLink,
  buildScheduleRowMeta,
  buildScheduleStatusFilters,
  buildSelectedCourtPreview,
  buildVenueCourtOptions,
  buildTournamentQuickLinks,
  createCourtFormState,
  createCourtPayload,
  createVenueFormState,
  createVenuePayload,
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
  getScheduleConflictSummary,
  getScheduledMatchConflictWarning,
  getScheduledMatchFormFeedback,
  getTournamentEmptyState,
  hasPublicScheduleMutationControls,
  hasPublicStandingsMutationControls
} from "../../apps/web/src/lib/scheduleControl";
import {
  buildAdminTournamentLiveDashboardLink,
  buildLiveDashboardCard,
  buildLiveDashboardFilters,
  buildLiveDashboardSummary,
  buildOperatorTournamentLiveDashboardLink,
  filterLiveDashboardMatches,
  getLiveDashboardEmptyState
} from "../../apps/web/src/lib/liveDashboardControl";
import {
  buildMatchStartChecklist,
  buildLifecycleCommandPayload,
  buildLifecycleControlState,
  buildLifecycleReadinessContext,
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
import {
  buildPublicScoreboardDisplayLink,
  buildPublicScoreboardDisplayModel,
  buildPublicDisplayThemeView,
  getPublicDisplayControlsClassName,
  isPublicDisplayKioskMode,
  publicScoreboardDisplayHasPrivateExposure
} from "../../apps/web/src/lib/publicScoreboardDisplay";
import {
  buildDisplayThemePreviewModel,
  createMatchDisplayOverrideFormState,
  createMatchDisplayOverridePayload,
  createTeamDisplayProfileFormState,
  createTeamDisplayProfilePayload,
  createTournamentDisplayThemeFormState,
  createTournamentDisplayThemePayload,
  displayThemePreviewHasPrivateExposure,
  getDisplayThemeSaveState,
  getLogoPreviewState,
  validateMatchDisplayOverrideForm,
  validateTeamDisplayProfileForm,
  validateTournamentDisplayThemeForm
} from "../../apps/web/src/lib/displayThemeControl";
import {
  buildAdminDisplayScreenDetailLink,
  buildAdminDisplayScreenNewLink,
  buildAdminDisplayScreenPreviewLink,
  buildAdminDisplayScreensLink,
  buildAdminDisplayScreenScenesLink,
  buildPublicDisplayScreenLink,
  createDisplaySceneFormState,
  createDisplayScenePayload,
  createDisplayScreenFormState,
  createDisplayScreenPayload,
  displaySceneTypeOptions,
  getDisplaySceneConfigSummary,
  getDisplaySceneSaveState,
  getDisplayScreenSaveState,
  getPublicDisplayPreviewSummary,
  publicDisplayPreviewHasPrivateExposure,
  validateDisplaySceneForm,
  validateDisplayScreenForm
} from "../../apps/web/src/lib/displayScreenControl";
import type {
  AuthenticatedUser,
  DisplaySceneResponse,
  DisplayScreenResponse,
  MatchAuditLogResponse,
  MatchLineupResponse,
  MatchReadiness,
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

const matchLineup: MatchLineupResponse = {
  matchId: scoreboardProjection.matchId,
  home: {
    teamId: "home-team",
    teamName: "Bangkok HOME",
    players: matchRosters.rosters.HOME,
    readiness: matchRosters.readiness!.home
  },
  away: {
    teamId: "away-team",
    teamName: "Chiang Mai AWAY",
    players: matchRosters.rosters.AWAY,
    readiness: matchRosters.readiness!.away
  }
};

const incompleteReadiness: MatchReadiness = {
  officials: { state: "READY", label: "2 active officials", assignedCount: 2, roles: [] },
  roster: { state: "READY", homeCount: 7, awayCount: 8 },
  lineup: { state: "INCOMPLETE", homeStarters: 5, awayStarters: 4, homeConfirmed: true, awayConfirmed: false },
  lifecycle: { state: "NOT_STARTED", label: "Not started" }
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
      courtId: "court-1",
      courtLabel: null,
      venueLabel: "Court A",
      scheduledAt: "2026-07-03T10:00:00.000Z",
      homeTeamId: "home-team",
      homeTeamName: "Bangkok HOME",
      awayTeamId: "away-team",
      awayTeamName: "Chiang Mai AWAY",
      status: "LIVE",
      periodNumber: 2,
      periodType: "REGULATION",
      gameClockRemainingMs: 385000,
      gameClockRunning: false,
      shotClockRemainingMs: 12000,
      shotClockRunning: false,
      homeScore: 10,
      awayScore: 8,
      currentSeq: 3,
      publicScoreboardPath: `/public/scoreboard/${scoreboardProjection.matchId}`,
      operations: {
        operatorScoreUrl: `/operator/matches/${scoreboardProjection.matchId}/score`,
        operatorFoulsUrl: `/operator/matches/${scoreboardProjection.matchId}/fouls`,
        operatorClockUrl: `/operator/matches/${scoreboardProjection.matchId}/clock`,
        operatorTimeoutsUrl: `/operator/matches/${scoreboardProjection.matchId}/timeouts`,
        operatorLifecycleUrl: `/operator/matches/${scoreboardProjection.matchId}/lifecycle`,
        officialsUrl: `/admin/matches/${scoreboardProjection.matchId}/officials`,
        rostersUrl: `/admin/matches/${scoreboardProjection.matchId}/rosters`,
        lineupUrl: `/admin/matches/${scoreboardProjection.matchId}/lineup`,
        summaryUrl: `/operator/matches/${scoreboardProjection.matchId}/summary`,
        replayUrl: `/operator/matches/${scoreboardProjection.matchId}/replay`,
        auditLogUrl: `/operator/matches/${scoreboardProjection.matchId}/audit-log`
      },
      readiness: {
        officials: {
          state: "READY",
          label: "2 active officials: REFEREE, SCORER",
          assignedCount: 2,
          roles: [
            { role: "REFEREE", displayName: "Court Referee" },
            { role: "SCORER", displayName: "Lead Scorer" }
          ]
        },
        roster: { state: "READY", homeCount: 7, awayCount: 8 },
        lineup: {
          state: "INCOMPLETE",
          homeStarters: 5,
          awayStarters: 4,
          homeConfirmed: true,
          awayConfirmed: false
        },
        lifecycle: { state: "LIVE", label: "Live" }
      }
    }
  ],
  generatedAt: "2026-07-03T10:05:00.000Z"
};

const venueList = {
  venues: [
    {
      venueId: "venue-1",
      name: "Main Hall",
      shortName: "MH",
      address: "Bangkok",
      active: true,
      courts: [
        { courtId: "court-1", label: "Court A", displayName: "Main Hall / Court A", active: true }
      ]
    }
  ]
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

  test("loads sanitized official candidates from the protected API", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          candidates: [
            {
              userId: "user-1",
              displayName: "Score Table",
              roles: ["SCORER"]
            }
          ]
        }
      })
    );
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    const candidates = await client.listOfficialCandidates();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/users/official-candidates",
      expect.objectContaining({ credentials: "include" })
    );
    expect(candidates).toEqual([{ userId: "user-1", displayName: "Score Table", roles: ["SCORER"] }]);
    expect(JSON.stringify(candidates)).not.toMatch(/password|session|cookie|csrf|token/i);
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

  test("reads eligible correction events without CSRF and applies correction with CSRF", async () => {
    const correctionEvents = {
      matchId: scoreboardProjection.matchId,
      currentSeq: 3,
      events: [
        {
          seqNo: 1,
          eventType: "SCORE_ADDED",
          occurredAt: "2026-07-06T09:00:01.000Z",
          actorDisplayName: null,
          summary: "HOME +2",
          eligible: true,
          ineligibleReason: null,
          correctionKind: "SCORE_UNDO",
          currentValue: { teamSide: "HOME", points: 2 },
          proposedCompensation: { teamSide: "HOME", points: -2 }
        }
      ]
    };
    const correctionResult = {
      ok: true,
      matchId: scoreboardProjection.matchId,
      seqNo: 4,
      eventType: "SCORE_CORRECTED",
      projection: scoreboardProjection
    };
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(correctionEvents))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValueOnce(jsonResponse(correctionResult));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.getEligibleCorrectionEvents(scoreboardProjection.matchId, { limit: 20 })).resolves.toEqual(correctionEvents);
    await expect(client.applyAlphaCorrection(scoreboardProjection.matchId, {
      expectedSeq: 3,
      correctedEventSeq: 1,
      correctionKind: "SCORE_UNDO",
      reason: "Wrong team score",
      payload: {
        correctionKind: "SCORE_UNDO",
        target: { seqNo: 1 },
        delta: null,
        newValue: null
      }
    })).resolves.toEqual(correctionResult);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `/api/v1/matches/${scoreboardProjection.matchId}/corrections/eligible-events?limit=20`,
      expect.objectContaining({ credentials: "include", method: "GET" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/auth/csrf", expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `/api/v1/matches/${scoreboardProjection.matchId}/corrections`,
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" })
      })
    );
  });

  test("reads protected and public tournament schedules without CSRF", async () => {
    const liveDashboard = {
      tournamentId: "tournament-1",
      tournament: tournamentList.tournaments[0],
      generatedAt: tournamentSchedule.generatedAt,
      matches: []
    };
    const fetchMock = vi.fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: tournamentList }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: tournamentSchedule }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: liveDashboard }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: tournamentList }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: tournamentSchedule }));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.getTournaments()).resolves.toEqual(tournamentList.tournaments);
    await expect(client.getTournamentSchedule("tournament-1")).resolves.toEqual(tournamentSchedule);
    await expect(client.getTournamentLiveDashboard("tournament-1")).resolves.toEqual(liveDashboard);
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
      "/api/v1/tournaments/tournament-1/live-dashboard",
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/v1/public/tournaments",
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
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
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { venue: venueList.venues[0] } }, 201))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { court: venueList.venues[0].courts[0] } }, 201))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { venues: venueList.venues } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { matchId: "match-1", currentSeq: 0, scheduleMatch: tournamentSchedule.matches[0] } }, 201));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.createTournament({ name: "Alpha Cup", status: "ACTIVE", startsAt: null, endsAt: null })).resolves.toEqual(tournamentList.tournaments[0]);
    await expect(client.createTeam({ tournamentId: "tournament-1", name: "Bangkok Home", shortName: "BKK" })).resolves.toMatchObject({
      teamId: "team-1",
      name: "Bangkok Home"
    });
    await expect(client.createVenue({ name: "Main Hall", shortName: "MH", address: "Bangkok" })).resolves.toMatchObject({
      venueId: "venue-1",
      name: "Main Hall"
    });
    await expect(client.createCourt("venue-1", { label: "Court A", displayName: "Main Hall / Court A" })).resolves.toMatchObject({
      courtId: "court-1",
      label: "Court A"
    });
    await expect(client.getVenues()).resolves.toEqual(venueList.venues);
    await expect(
      client.createTournamentMatch("tournament-1", {
        homeTeamId: "home-team",
        awayTeamId: "away-team",
        courtId: "court-1",
        roundLabel: "Round 1",
        courtLabel: null,
        venueLabel: null,
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
      "/api/v1/venues",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }),
        body: JSON.stringify({ name: "Main Hall", shortName: "MH", address: "Bangkok" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/v1/venues/venue-1/courts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }),
        body: JSON.stringify({ label: "Court A", displayName: "Main Hall / Court A" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/v1/venues",
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
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

  test("reads and writes protected display branding settings with CSRF on writes", async () => {
    const theme = {
      tournamentId: "tournament-1",
      displayName: "Alpha Cup",
      logoUrl: "https://assets.example.test/tournament.png",
      primaryColor: "#111827",
      secondaryColor: "#1f2937",
      accentColor: "#f59e0b",
      textColor: "#ffffff",
      backgroundStyle: "DEFAULT_ARENA" as const,
      showTournamentLogo: true,
      active: true
    };
    const profile = {
      teamId: "team-1",
      displayName: "Bangkok Home",
      logoUrl: "/assets/home.png",
      primaryColor: "#0f172a",
      secondaryColor: "#334155",
      accentColor: "#facc15",
      textColor: "#ffffff",
      showTeamLogo: true,
      active: true
    };
    const override = {
      matchId: "match-1",
      home: { primaryColor: "#111827", secondaryColor: null, accentColor: null, textColor: "#ffffff" },
      away: { primaryColor: "#7f1d1d", secondaryColor: null, accentColor: null, textColor: "#ffffff" },
      showTeamLogos: true,
      textOnlyFallback: false,
      neutralHighContrast: false,
      emergencyOverrideEnabled: false,
      emergencyReason: null
    };
    const fetchMock = vi.fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { theme } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { profile } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { override } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { theme } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { profile } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { override } }));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.getTournamentDisplayTheme("tournament-1")).resolves.toEqual(theme);
    await expect(client.getTeamDisplayProfile("team-1")).resolves.toEqual(profile);
    await expect(client.getMatchDisplayOverride("match-1")).resolves.toEqual(override);
    await expect(client.saveTournamentDisplayTheme("tournament-1", createTournamentDisplayThemePayload(createTournamentDisplayThemeFormState(theme)))).resolves.toEqual(theme);
    await expect(client.saveTeamDisplayProfile("team-1", createTeamDisplayProfilePayload(createTeamDisplayProfileFormState(profile)))).resolves.toEqual(profile);
    await expect(client.saveMatchDisplayOverride("match-1", createMatchDisplayOverridePayload(createMatchDisplayOverrideFormState(override)))).resolves.toEqual(override);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/tournaments/tournament-1/display-theme", expect.objectContaining({ credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/teams/team-1/display-profile", expect.objectContaining({ credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/v1/matches/match-1/display-override", expect.objectContaining({ credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/v1/auth/csrf", expect.objectContaining({ credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/v1/tournaments/tournament-1/display-theme",
      expect.objectContaining({ method: "PUT", headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/v1/teams/team-1/display-profile",
      expect.objectContaining({ method: "PUT", headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "/api/v1/matches/match-1/display-override",
      expect.objectContaining({ method: "PUT", headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }) })
    );
  });

  test("manages display screens and scenes with CSRF on writes", async () => {
    const screen: DisplayScreenResponse = {
      screenId: "11111111-1111-4111-8111-111111111111",
      screenSlug: "court-1-main",
      displayName: "Court 1 Main",
      tournamentId: "22222222-2222-4222-8222-222222222222",
      description: "Main arena display",
      publicEnabled: true,
      active: true
    };
    const scene: DisplaySceneResponse = {
      sceneId: "33333333-3333-4333-8333-333333333333",
      screenId: screen.screenId,
      sceneType: "LIVE_SCOREBOARD",
      sceneName: "Live court",
      sceneConfig: { matchId: scoreboardProjection.matchId },
      sortOrder: 0,
      active: true
    };
    const publicDisplay = {
      screen: { screenSlug: screen.screenSlug, displayName: screen.displayName },
      activeScene: { sceneType: "LIVE_SCOREBOARD", publicData: { matchId: scoreboardProjection.matchId }, refreshAfterMs: 1000 },
      serverTime: "2026-07-09T00:00:00.000Z"
    };
    const fetchMock = vi.fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { screens: [screen] } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { screen } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { csrfToken: "csrf-token" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { screen } }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { screen } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { scenes: [scene] } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { scene } }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { scene } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { activeScene: { screenId: screen.screenId, scene, assignedAt: "2026-07-09T00:00:00.000Z" } } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: publicDisplay }));
    const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: fetchMock });

    await expect(client.listDisplayScreens()).resolves.toEqual([screen]);
    await expect(client.getDisplayScreen(screen.screenId)).resolves.toEqual(screen);
    await expect(client.createDisplayScreen(createDisplayScreenPayload(createDisplayScreenFormState(screen)))).resolves.toEqual(screen);
    await expect(client.updateDisplayScreen(screen.screenId, createDisplayScreenPayload(createDisplayScreenFormState(screen)))).resolves.toEqual(screen);
    await expect(client.listDisplayScenes(screen.screenId)).resolves.toEqual([scene]);
    await expect(client.createDisplayScene(screen.screenId, createDisplayScenePayload(createDisplaySceneFormState(scene)))).resolves.toEqual(scene);
    await expect(client.updateDisplayScene(screen.screenId, scene.sceneId, createDisplayScenePayload(createDisplaySceneFormState(scene)))).resolves.toEqual(scene);
    await expect(client.setActiveDisplayScene(screen.screenId, scene.sceneId)).resolves.toEqual({
      screenId: screen.screenId,
      scene,
      assignedAt: "2026-07-09T00:00:00.000Z"
    });
    await expect(client.getPublicDisplayScreen(screen.screenSlug)).resolves.toEqual(publicDisplay);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/display-screens", expect.objectContaining({ credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/v1/display-screens/${screen.screenId}`, expect.objectContaining({ credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/v1/auth/csrf", expect.objectContaining({ credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/v1/display-screens",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      `/api/v1/display-screens/${screen.screenId}`,
      expect.objectContaining({ method: "PATCH", headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(6, `/api/v1/display-screens/${screen.screenId}/scenes`, expect.objectContaining({ credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      `/api/v1/display-screens/${screen.screenId}/scenes`,
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      `/api/v1/display-screens/${screen.screenId}/scenes/${scene.sceneId}`,
      expect.objectContaining({ method: "PATCH", headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      9,
      `/api/v1/display-screens/${screen.screenId}/active-scene`,
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-csrf-token": "csrf-token" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(10, "/api/v1/public/display/court-1-main", expect.objectContaining({ credentials: "include" }));
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

  test("builds public 16:9 display model from public projection without private links or metadata", () => {
    const display = buildPublicScoreboardDisplayModel(scoreboardProjection, {
      nowMs: Date.parse("2026-07-01T10:00:00.000Z"),
      receivedAtMs: Date.parse("2026-07-01T10:00:00.000Z"),
      realtimeState: "POLLING_FALLBACK"
    });

    expect(buildPublicScoreboardDisplayLink("match 1")).toBe("/public/scoreboard/match%201/display");
    expect(display).toMatchObject({
      home: {
        label: "HOME",
        teamName: "Bangkok HOME",
        score: 10,
        fouls: 2,
        timeouts: 5
      },
      away: {
        label: "AWAY",
        teamName: "Chiang Mai AWAY",
        score: 8,
        fouls: 1,
        timeouts: 5
      },
      gameClock: {
        label: "8:32",
        stateLabel: "Stopped"
      },
      shotClock: {
        label: "24",
        stateLabel: "Stopped",
        className: "public-display-shot-clock"
      },
      periodLabel: "REG P1",
      statusLabel: "LIVE",
      statusClassName: "arena-live-badge is-live",
      matchCodeLabel: "11111111",
      seqLabel: "Seq 3",
      syncLabel: "Polling fallback active"
    });
    expect(display.home.panelClassName).toContain("home-panel");
    expect(display.away.panelClassName).toContain("away-panel");
    expect(display.home.scoreClassName).toContain("score-pulse");
    expect(display.systemStatus).toEqual([
      { icon: "DB", label: "Projection", value: "Public" },
      { icon: "SY", label: "Sync", value: "Poll" },
      { icon: "WF", label: "Connection", value: "Poll" },
      { icon: "SQ", label: "Seq", value: "3" },
      { icon: "LS", label: "Last sync", value: expect.any(String) }
    ]);
    expect(display.recentEventTicker).toContain("Recent play updates");
    expect(display.recentEventTicker).not.toMatch(/HOME|AWAY|\d+\s*-\s*\d+|SCORE_ADDED/i);
    expect(publicScoreboardDisplayHasPrivateExposure(JSON.stringify(display))).toBe(false);
  });

  test("public display renders team stats in panels without duplicated bottom stat strip", () => {
    const appSource = readFileSync("apps/web/src/App.tsx", "utf8");
    const styleSource = readFileSync("apps/web/src/styles.css", "utf8");
    const display = buildPublicScoreboardDisplayModel(scoreboardProjection, {
      nowMs: Date.parse("2026-07-01T10:00:00.000Z"),
      receivedAtMs: Date.parse("2026-07-01T10:00:00.000Z"),
      realtimeState: "CONNECTED"
    });

    expect(appSource).toContain("public-display-team-metrics");
    expect(appSource).not.toContain("arena-stat-strip");
    expect(styleSource).toContain(".public-display-team-metrics");
    expect(styleSource).not.toContain(".arena-stat-strip");
    expect(display.home).toMatchObject({ timeouts: 5, fouls: 2 });
    expect(display.away).toMatchObject({ timeouts: 5, fouls: 1 });
    expect(display.recentEventTicker).toContain("Recent play updates");
  });

  test("public display model derives running clocks and final label safely", () => {
    const display = buildPublicScoreboardDisplayModel({
      ...scoreboardProjection,
      status: "FINAL",
      finalScore: { home: 88, away: 84 },
      gameClock: {
        remainingMs: 60000,
        running: true,
        lastStartedAt: "2026-07-01T10:00:00.000Z"
      },
      shotClock: {
        remainingMs: 9000,
        running: true,
        lastStartedAt: "2026-07-01T10:00:00.000Z"
      },
      serverTime: "2026-07-01T10:00:00.000Z",
      lastEventSeq: 12
    }, {
      nowMs: Date.parse("2026-07-01T10:00:02.000Z"),
      receivedAtMs: Date.parse("2026-07-01T10:00:00.000Z"),
      realtimeState: "CONNECTED"
    });

    expect(display.gameClock).toMatchObject({ label: "0:58", stateLabel: "Running" });
    expect(display.shotClock).toMatchObject({ label: "7", stateLabel: "Running" });
    expect(display.finalLabel).toBe("Final 88 - 84");
    expect(display.seqLabel).toBe("Seq 12");
    expect(display.syncLabel).toBe("Realtime connected");
  });

  test("public display applies sanitized tournament and team display theme", () => {
    const display = buildPublicScoreboardDisplayModel({
      ...scoreboardProjection,
      displayTheme: {
        tournament: {
          displayName: "Youth Cup Display",
          logoUrl: "https://cdn.example.com/tournament.png",
          showLogo: true,
          backgroundStyle: "DARK_GRADIENT",
          colors: {
            primaryColor: "#111111",
            secondaryColor: "#222222",
            accentColor: "#ffaa00",
            textColor: "#ffffff"
          }
        },
        home: {
          displayName: "Bangkok Tigers",
          logoUrl: "https://cdn.example.com/tigers.png",
          showLogo: true,
          colors: {
            primaryColor: "#cc0000",
            secondaryColor: "#220000",
            accentColor: "#ffcc00",
            textColor: "#ffffff"
          }
        },
        away: {
          displayName: "Phuket Sharks",
          logoUrl: "https://cdn.example.com/sharks.png",
          showLogo: true,
          colors: {
            primaryColor: "#0033cc",
            secondaryColor: "#000022",
            accentColor: "#00ccff",
            textColor: "#ffffff"
          }
        },
        flags: {
          textOnlyFallback: false,
          neutralHighContrast: false
        }
      }
    }, {
      nowMs: Date.parse("2026-07-01T10:00:00.000Z"),
      receivedAtMs: Date.parse("2026-07-01T10:00:00.000Z"),
      realtimeState: "CONNECTED"
    });

    expect(display.arenaFrameClassName).toContain("arena-background-dark-gradient");
    expect(display.arenaFrameStyle).toMatchObject({
      "--arena-bg": "#111111",
      "--arena-bg-secondary": "#222222",
      "--arena-accent": "#ffaa00",
      "--arena-text": "#ffffff"
    });
    expect(display.tournament).toMatchObject({
      displayName: "Youth Cup Display",
      logoUrl: "https://cdn.example.com/tournament.png",
      showLogo: true
    });
    expect(display.matchCodeLabel).toBe("11111111");
    expect(display.statusClassName).toBe("arena-live-badge is-live");
    expect(display.home).toMatchObject({
      teamName: "Bangkok Tigers",
      logoUrl: "https://cdn.example.com/tigers.png",
      showLogo: true,
      style: {
        "--team-primary": "#cc0000",
        "--team-secondary": "#220000",
        "--team-accent": "#ffcc00",
        "--team-text": "#ffffff",
        "--score-color": "#f8fafc"
      }
    });
    expect(display.away).toMatchObject({
      teamName: "Phuket Sharks",
      style: {
        "--team-primary": "#0033cc",
        "--team-accent": "#00ccff"
      }
    });
    expect(publicScoreboardDisplayHasPrivateExposure(JSON.stringify(display))).toBe(false);
  });

  test("public display model keeps long tournament and team names public safe for broadcast layout", () => {
    const display = buildPublicScoreboardDisplayModel({
      ...scoreboardProjection,
      homeTeamName: "Bangkok International Youth Basketball Academy Tigers",
      awayTeamName: "Phuket Provincial Demonstration School Ocean Sharks",
      displayTheme: {
        tournament: {
          displayName: "Bangkok Youth Championship Invitational Public Display Showcase",
          logoUrl: null,
          showLogo: false,
          backgroundStyle: "DARK_GRADIENT",
          colors: {
            primaryColor: "#07111f",
            secondaryColor: "#111827",
            accentColor: "#facc15",
            textColor: "#f8fafc"
          }
        },
        home: {
          displayName: "Bangkok International Youth Basketball Academy Tigers",
          logoUrl: null,
          showLogo: false,
          colors: {
            primaryColor: "#7f1d1d",
            secondaryColor: "#120607",
            accentColor: "#ef4444",
            textColor: "#f8fafc"
          }
        },
        away: {
          displayName: "Phuket Provincial Demonstration School Ocean Sharks",
          logoUrl: null,
          showLogo: false,
          colors: {
            primaryColor: "#1d4ed8",
            secondaryColor: "#020617",
            accentColor: "#38bdf8",
            textColor: "#f8fafc"
          }
        },
        flags: {
          textOnlyFallback: false,
          neutralHighContrast: false
        }
      }
    }, {
      nowMs: Date.parse("2026-07-01T10:00:00.000Z"),
      receivedAtMs: Date.parse("2026-07-01T10:00:00.000Z"),
      realtimeState: "CONNECTED"
    });

    expect(display.tournament.displayName).toBe("Bangkok Youth Championship Invitational Public Display Showcase");
    expect(display.home.teamName).toContain("Bangkok International");
    expect(display.away.teamName).toContain("Phuket Provincial");
    expect(display.home.style).toMatchObject({
      "--team-primary": "#7f1d1d",
      "--team-accent": "#ef4444",
      "--score-color": "#f8fafc"
    });
    expect(display.away.style).toMatchObject({
      "--team-primary": "#1d4ed8",
      "--team-accent": "#38bdf8",
      "--score-color": "#f8fafc"
    });
    expect(publicScoreboardDisplayHasPrivateExposure(JSON.stringify(display))).toBe(false);
  });

  test("public display model keeps default fallback when no display theme exists", () => {
    const display = buildPublicScoreboardDisplayModel({
      ...scoreboardProjection,
      displayTheme: null
    }, {
      nowMs: Date.parse("2026-07-01T10:00:00.000Z"),
      receivedAtMs: Date.parse("2026-07-01T10:00:00.000Z"),
      realtimeState: "POLLING_FALLBACK"
    });

    expect(display.arenaFrameClassName).toContain("arena-background-default-arena");
    expect(display.tournament).toEqual({ displayName: null, logoUrl: null, showLogo: false });
    expect(display.home.teamName).toBe("Bangkok HOME");
    expect(display.away.teamName).toBe("Chiang Mai AWAY");
    expect(display.home.style).toMatchObject({ "--team-accent": "#38bdf8" });
    expect(display.away.style).toMatchObject({ "--team-accent": "#f97316" });
  });

  test("public display theme view applies match override, high contrast, and text-only fallback safely", () => {
    const themed = buildPublicDisplayThemeView({
      tournament: {
        displayName: "Youth Cup",
        logoUrl: "https://cdn.example.com/youth.png",
        showLogo: true,
        backgroundStyle: "SOLID",
        colors: { primaryColor: "#111111", secondaryColor: "#222222", accentColor: "#333333", textColor: "#ffffff" }
      },
      home: {
        displayName: "Tigers",
        logoUrl: "https://cdn.example.com/tigers.png",
        showLogo: true,
        colors: { primaryColor: "#ff0000", secondaryColor: null, accentColor: "#ffcc00", textColor: "#ffffff" }
      },
      away: {
        displayName: "Sharks",
        logoUrl: "https://cdn.example.com/sharks.png",
        showLogo: true,
        colors: { primaryColor: "#0000ff", secondaryColor: null, accentColor: "#00ccff", textColor: "#ffffff" }
      },
      flags: { textOnlyFallback: false, neutralHighContrast: false }
    });
    const textOnly = buildPublicDisplayThemeView({
      tournament: {
        displayName: "Youth Cup",
        logoUrl: "https://cdn.example.com/youth.png",
        showLogo: true,
        backgroundStyle: "HIGH_CONTRAST",
        colors: { primaryColor: "#111111", secondaryColor: "#222222", accentColor: "#333333", textColor: "#ffffff" }
      },
      home: {
        displayName: "Tigers",
        logoUrl: "https://cdn.example.com/tigers.png",
        showLogo: true,
        colors: { primaryColor: "#bad", secondaryColor: null, accentColor: "#ffcc00", textColor: "#ffffff" }
      },
      away: {
        displayName: "Sharks",
        logoUrl: "https://cdn.example.com/sharks.png",
        showLogo: true,
        colors: { primaryColor: "#0000ff", secondaryColor: null, accentColor: "#00ccff", textColor: "#ffffff" }
      },
      flags: { textOnlyFallback: true, neutralHighContrast: true }
    });

    expect(themed.home.style).toMatchObject({ "--team-primary": "#ff0000", "--team-accent": "#ffcc00" });
    expect(themed.away.style).toMatchObject({ "--team-primary": "#0000ff", "--team-accent": "#00ccff" });
    expect(themed.home.style["--score-color"]).toBe("#f8fafc");
    expect(themed.away.style["--score-color"]).toBe("#f8fafc");
    expect(themed.home.style["--score-color"]).not.toBe(themed.home.style["--team-primary"]);
    expect(themed.home.style["--score-color"]).not.toBe(themed.home.style["--team-accent"]);
    expect(textOnly.flags).toEqual({ textOnlyFallback: true, neutralHighContrast: true });
    expect(textOnly.tournament.showLogo).toBe(false);
    expect(textOnly.home).toMatchObject({
      logoUrl: null,
      showLogo: false,
      style: { "--team-primary": "#38bdf8", "--team-accent": "#38bdf8", "--score-color": "#f8fafc" }
    });
    expect(textOnly.away).toMatchObject({
      logoUrl: null,
      showLogo: false,
      style: { "--team-primary": "#f97316", "--team-accent": "#f97316", "--score-color": "#f8fafc" }
    });
  });

  test("public display score color stays readable with dark team and match override colors", () => {
    const display = buildPublicScoreboardDisplayModel({
      ...scoreboardProjection,
      displayTheme: {
        tournament: {
          displayName: "Night Cup",
          logoUrl: null,
          showLogo: false,
          backgroundStyle: "DEFAULT_ARENA",
          colors: {
            primaryColor: "#000000",
            secondaryColor: "#050505",
            accentColor: "#111111",
            textColor: "#f8fafc"
          }
        },
        home: {
          displayName: "Dark Home",
          logoUrl: null,
          showLogo: false,
          colors: {
            primaryColor: "#000000",
            secondaryColor: "#050505",
            accentColor: "#111111",
            textColor: "#f8fafc"
          }
        },
        away: {
          displayName: "Dark Away",
          logoUrl: null,
          showLogo: false,
          colors: {
            primaryColor: "#010101",
            secondaryColor: "#060606",
            accentColor: "#121212",
            textColor: "#f8fafc"
          }
        },
        flags: {
          textOnlyFallback: false,
          neutralHighContrast: false
        }
      }
    }, {
      nowMs: Date.parse("2026-07-01T10:00:00.000Z"),
      receivedAtMs: Date.parse("2026-07-01T10:00:00.000Z"),
      realtimeState: "CONNECTED"
    });

    expect(display.home.style).toMatchObject({
      "--team-primary": "#000000",
      "--team-accent": "#111111",
      "--score-color": "#f8fafc"
    });
    expect(display.away.style).toMatchObject({
      "--team-primary": "#010101",
      "--team-accent": "#121212",
      "--score-color": "#f8fafc"
    });
    expect(display.home.style["--score-color"]).not.toBe(display.home.style["--team-accent"]);
    expect(display.away.style["--score-color"]).not.toBe(display.away.style["--team-primary"]);
    expect(publicScoreboardDisplayHasPrivateExposure(JSON.stringify(display))).toBe(false);
  });

  test("public display marks low and critical shot clock states without exposing commands", () => {
    const lowDisplay = buildPublicScoreboardDisplayModel({
      ...scoreboardProjection,
      shotClockRemainingMs: 5000,
      shotClock: { remainingMs: 5000, running: false, lastStartedAt: null }
    }, {
      nowMs: Date.parse("2026-07-01T10:00:00.000Z"),
      receivedAtMs: Date.parse("2026-07-01T10:00:00.000Z"),
      realtimeState: "RECONNECTING"
    });
    const criticalDisplay = buildPublicScoreboardDisplayModel({
      ...scoreboardProjection,
      shotClockRemainingMs: 3000,
      shotClock: { remainingMs: 3000, running: false, lastStartedAt: null }
    }, {
      nowMs: Date.parse("2026-07-01T10:00:00.000Z"),
      receivedAtMs: Date.parse("2026-07-01T10:00:00.000Z"),
      realtimeState: "CONNECTED"
    });

    expect(lowDisplay.shotClock.className).toContain("shot-clock-low");
    expect(lowDisplay.shotClock.className).not.toContain("shot-clock-critical");
    expect(lowDisplay.systemStatus[1]).toEqual({ icon: "SY", label: "Sync", value: "Rejoin" });
    expect(criticalDisplay.shotClock.className).toContain("shot-clock-low");
    expect(criticalDisplay.shotClock.className).toContain("shot-clock-critical");
    expect(JSON.stringify(criticalDisplay)).not.toMatch(/Add Score|Add Foul|Start Clock|Stop Clock|Submit Correction|command/i);
  });

  test("public display kiosk controls start hidden and remain compact without private links", () => {
    expect(isPublicDisplayKioskMode("?kiosk=1")).toBe(true);
    expect(isPublicDisplayKioskMode("?kiosk=true")).toBe(false);
    expect(isPublicDisplayKioskMode("")).toBe(false);

    const hiddenKioskClass = getPublicDisplayControlsClassName({ kioskMode: true, controlsVisible: false });
    const visibleClass = getPublicDisplayControlsClassName({ kioskMode: false, controlsVisible: true });

    expect(hiddenKioskClass).toBe("public-display-shell kiosk-mode controls-hidden");
    expect(visibleClass).toBe("public-display-shell controls-visible");
    expect(`${hiddenKioskClass} ${visibleClass}`).not.toMatch(/\/admin|\/operator|audit-log|replay|corrections|commandId|correlationId|correctionDetails/i);
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

  test("official assignment form uses an official picker instead of raw user id copy", () => {
    expect(getAssignmentFormLabels()).toEqual({
      official: "Official",
      officialPlaceholder: "Select official",
      role: "Role code"
    });
  });

  test("assignment submit is disabled until official and role are selected", () => {
    expect(isAssignmentSubmitDisabled(createAssignmentFormState({ userId: "", roleCode: "SCORER" }), false)).toBe(true);
    expect(isAssignmentSubmitDisabled(createAssignmentFormState({ userId: "user-1", roleCode: "SCORER" }), true)).toBe(true);
    expect(isAssignmentSubmitDisabled(createAssignmentFormState({ userId: "user-1", roleCode: "SCORER" }), false)).toBe(false);
  });

  test("assignment picker options use display names and friendly validation messages", () => {
    expect(
      createAssignmentCandidateOptions([
        { userId: "user-1", displayName: "Score Table", roles: ["SCORER"] },
        { userId: "user-2", displayName: null, roles: ["REFEREE"] }
      ])
    ).toEqual([
      { value: "user-1", label: "Score Table (SCORER)" },
      { value: "user-2", label: "user-2 (REFEREE)" }
    ]);
    expect(toAssignmentValidationMessage("USER_REQUIRED")).toBe("Please select a valid official.");
    expect(toAssignmentValidationMessage("USER_NOT_FOUND")).toBe("Please select a valid official.");
    expect(toAssignmentValidationMessage("DUPLICATE_ASSIGNMENT")).toBe("This official is already assigned to this role.");
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
      homeTeamName: null,
      awayTeamId: "away-1",
      awayTeamName: null,
      matchCode: "Round 1",
      tournamentId: "tournament-1",
      tournamentName: "Alpha Cup",
      status: "SCHEDULED",
      scheduledAt: "2026-07-01T10:00:00.000Z",
      venueName: "Court A",
      venueLabel: "Main Hall",
      courtLabel: "Court A",
      assignedRoleCodes: ["SCORER"],
      currentSeq: 0,
      homeScore: null,
      awayScore: null,
      readiness: tournamentSchedule.matches[0].readiness
    });

    expect(card.title).toBe("home-1 vs away-1");
    expect(card.tournamentLabel).toBe("Alpha Cup");
    expect(card.venueLabel).toBe("Main Hall / Court A");
    expect(card.readinessLabel).toBe("Officials READY (REFEREE, SCORER) / Roster READY / Lineup INCOMPLETE / Live");
    expect(card.assignedRolesLabel).toBe("Your role: SCORER");
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
      rosters: { href: "/admin/matches/match-1/rosters", label: "Setup Roster" },
      lineup: { href: "/admin/matches/match-1/lineup", label: "Setup Lineup" },
      summary: { href: "/admin/matches/match-1/summary", label: "Summary" },
      replay: { href: "/admin/matches/match-1/replay", label: "Replay" },
      auditLog: { href: "/admin/matches/match-1/audit-log", label: "Audit Log" },
      operator: { href: "/operator/matches/match-1/score", label: "Operator Score" },
      fouls: { href: "/operator/matches/match-1/fouls", label: "Operator Fouls" },
      clock: { href: "/operator/matches/match-1/clock", label: "Operator Clock" },
      timeouts: { href: "/operator/matches/match-1/timeouts", label: "Operator Timeouts" },
      lifecycle: { href: "/operator/matches/match-1/lifecycle", label: "Start / Lifecycle" },
      corrections: { href: "/operator/matches/match-1/corrections", label: "Corrections" },
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
    expect(buildRosterSetupSummary(matchRosters)).toEqual({
      state: "INCOMPLETE",
      homeCount: 2,
      awayCount: 0,
      nextAction: "Add players to both teams before lineup confirmation."
    });
    expect(buildLineupSetupSummary(matchLineup)).toEqual({
      state: "INCOMPLETE",
      homeStarters: 1,
      awayStarters: 0,
      homeConfirmed: false,
      awayConfirmed: false,
      nextAction: "Select 5 starters for HOME and AWAY before confirmation."
    });
    expect(buildSetupQuickLinks(scoreboardProjection.matchId)).toEqual({
      rosters: { href: `/admin/matches/${scoreboardProjection.matchId}/rosters`, label: "Setup Roster" },
      lineup: { href: `/admin/matches/${scoreboardProjection.matchId}/lineup`, label: "Setup Lineup" },
      lifecycle: { href: `/operator/matches/${scoreboardProjection.matchId}/lifecycle`, label: "Start / Lifecycle" }
    });
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
      corrections: {
        href: `/operator/matches/${scoreboardProjection.matchId}/corrections`,
        label: "Open Corrections"
      },
      adminMatches: { href: "/admin/matches", label: "Admin Match List" }
    });
    expect(getScoreControlLinks(scoreboardProjection.matchId, viewerUser).adminMatches).toBeNull();
    expect(getScoreControlLinks(scoreboardProjection.matchId, viewerUser).auditLog).toBeNull();
  });

  test("builds foul page correction link", () => {
    expect(getFoulControlLinks(scoreboardProjection.matchId).corrections).toEqual({
      href: `/operator/matches/${scoreboardProjection.matchId}/corrections`,
      label: "Corrections"
    });
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

  test("highlights correction replay rows and summarizes protected correction details", () => {
    const correctionItem = {
      ...matchReplay.items[1],
      eventGroup: "CORRECTION" as const,
      eventType: "SCORE_CORRECTED",
      title: "Score corrected",
      description: "Correction applied.",
      correctionDetails: {
        correctedEventSeq: 7,
        correctedEventType: "SCORE_ADDED",
        correctionKind: "SCORE_UNDO",
        reason: "Wrong team score",
        delta: { teamSide: "HOME", points: -2 }
      }
    };

    expect(buildReplayRowClassName(correctionItem)).toBe("correction-row");
    expect(buildReplayCorrectionDetail(correctionItem)).toEqual([
      "Correction: SCORE_UNDO",
      "Corrected event seq: 7",
      "Reason: Wrong team score",
      "Effect: HOME -2 points"
    ]);
    expect(buildReplayRowClassName(matchReplay.items[0])).toBe("");
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

  test("highlights correction audit rows and renders missing correction fields safely", () => {
    const correctionRow = {
      ...matchAuditLog.rows[1],
      seq: 12,
      eventType: "SCORE_CORRECTED",
      reason: "Wrong team score",
      correctionDetails: {
        correctedEventSeq: 7,
        correctedEventType: "SCORE_ADDED",
        correctionKind: "SCORE_UNDO",
        reason: "Wrong team score",
        oldValue: { teamSide: "HOME", points: 2 },
        newValue: { teamSide: "HOME", points: 0 },
        delta: { teamSide: "HOME", points: -2 }
      }
    };
    const missingFieldsRow = {
      ...correctionRow,
      reason: null,
      correctionDetails: null
    };

    expect(buildAuditRowClassName(correctionRow)).toBe("correction-row");
    expect(buildAuditCorrectionDetailRows(correctionRow)).toEqual([
      { label: "Correction event seq", value: "12" },
      { label: "Corrected event seq", value: "7" },
      { label: "Corrected event type", value: "SCORE_ADDED" },
      { label: "Correction kind", value: "SCORE_UNDO" },
      { label: "Reason", value: "Wrong team score" },
      { label: "Old value", value: "HOME +2" },
      { label: "New value", value: "HOME +0" },
      { label: "Delta", value: "HOME -2 points" }
    ]);
    expect(buildAuditCorrectionDetailRows(missingFieldsRow).map((row) => row.value)).toContain("Not recorded");
    expect(buildAuditRowClassName(matchAuditLog.rows[0])).toBe("");
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
      { href: "/admin/tournaments/tournament%201/live-dashboard", label: "Live Dashboard", private: true },
      { href: "/admin/tournaments/tournament%201/standings", label: "Standings", private: true },
      { href: "/admin/tournaments/tournament%201/display-theme", label: "Display Theme", private: true },
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
    expect(buildAdminTournamentDisplayThemeLink("tournament 1")).toBe("/admin/tournaments/tournament%201/display-theme");
    expect(buildAdminTeamDisplayProfileLink("team 1")).toBe("/admin/teams/team%201/display-profile");
    expect(buildAdminMatchDisplayThemeLink("match 1")).toBe("/admin/matches/match%201/display-theme");
    expect(buildPublicTournamentScheduleLink("tournament 1")).toBe("/public/tournaments/tournament%201/schedule");
    expect(buildPublicTournamentStandingsLink("tournament 1")).toBe("/public/tournaments/tournament%201/standings");
    expect(createTournamentFormState()).toEqual({ name: "", status: "ACTIVE", startsAt: "", endsAt: "" });
    expect(createTeamFormState("tournament-1")).toEqual({ tournamentId: "tournament-1", name: "", shortName: "" });
    expect(createScheduledMatchFormState()).toEqual({
      homeTeamId: "",
      awayTeamId: "",
      scheduledAt: "",
      courtId: "",
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
      courtId: "",
      scheduledAt: "",
      roundLabel: " Round 1 ",
      courtLabel: "",
      venueLabel: " Main Hall "
    })).toEqual({
      homeTeamId: "home-team",
      awayTeamId: "away-team",
      courtId: null,
      roundLabel: "Round 1",
      courtLabel: null,
      venueLabel: "Main Hall",
      scheduledAt: null
    });
    expect(createTournamentMatchPayload({
      homeTeamId: "home-team",
      awayTeamId: "away-team",
      courtId: "court-1",
      scheduledAt: "",
      roundLabel: "",
      courtLabel: " Legacy Court ",
      venueLabel: " Legacy Venue "
    })).toEqual({
      homeTeamId: "home-team",
      awayTeamId: "away-team",
      courtId: "court-1",
      roundLabel: null,
      courtLabel: null,
      venueLabel: null,
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
      statusGroup: "live",
      conflictCount: 0,
      conflictBadgeLabel: null,
      conflictDetail: null
    });
    expect(buildReadinessBadges(tournamentSchedule.matches[0])).toEqual([
      { label: "Officials: READY", title: "2 active officials: REFEREE, SCORER" },
      { label: "Roster: READY", title: "HOME 7 / AWAY 8" },
      { label: "Lineup: INCOMPLETE", title: "HOME 5 starters, confirmed / AWAY 4 starters, not confirmed" },
      { label: "Lifecycle: LIVE", title: "Live" }
    ]);
    expect(buildScheduleChecklistBadge(tournamentSchedule.matches[0])).toEqual({
      label: "Checklist: WARNINGS",
      title: "Ready 3 / Warnings 1 / Missing 0"
    });
    expect(buildScheduleRowMeta({
      ...tournamentSchedule.matches[0],
      courtLabel: "Court A",
      venueLabel: "Main Hall"
    }).locationLabel).toBe("Main Hall / Court A");
    expect(buildScheduleRowMeta({
      ...tournamentSchedule.matches[0],
      scheduledAt: null,
      courtLabel: "null",
      venueLabel: "null",
      homeTeamName: "null",
      awayTeamName: ""
    })).toEqual({
      matchupLabel: "TBD vs TBD",
      scoreLabel: "10 - 8",
      scheduleLabel: "Schedule pending",
      locationLabel: "Court TBD",
      statusGroup: "live",
      conflictCount: 0,
      conflictBadgeLabel: null,
      conflictDetail: null
    });
    expect(getPublicScheduleLinks(tournamentSchedule.matches[0])).toEqual({
      scoreboard: {
        href: `/public/scoreboard/${scoreboardProjection.matchId}`,
        label: "Open Scoreboard"
      },
      display: {
        href: `/public/scoreboard/${scoreboardProjection.matchId}/display`,
        label: "Display Mode"
      },
      summary: null,
      auditLog: null,
      replay: null,
      operator: null
    });
    expect(JSON.stringify(Object.values(getPublicScheduleLinks(tournamentSchedule.matches[0])).filter(Boolean))).not.toMatch(
      /admin|operator|audit|replay|lineup|roster|lifecycle/i
    );
  });

  test("public schedule dashboard is read-only", () => {
    expect(hasPublicScheduleMutationControls()).toBe(false);
    expect(getPublicScheduleEmptyState(0)).toEqual({
      title: "No scheduled matches",
      description: "This tournament does not have scheduled matches yet."
    });
  });

  test("builds display theme form defaults, payloads, and validation errors", () => {
    const tournamentState = createTournamentDisplayThemeFormState();
    const teamState = createTeamDisplayProfileFormState();
    const matchState = createMatchDisplayOverrideFormState();

    expect(tournamentState).toMatchObject({
      displayName: "",
      logoUrl: "",
      backgroundStyle: "DEFAULT_ARENA",
      showTournamentLogo: true,
      active: true
    });
    expect(teamState).toMatchObject({ displayName: "", logoUrl: "", showTeamLogo: true, active: true });
    expect(matchState).toMatchObject({
      showTeamLogos: true,
      textOnlyFallback: false,
      neutralHighContrast: false,
      emergencyOverrideEnabled: false,
      emergencyReason: ""
    });

    expect(validateTournamentDisplayThemeForm({ ...tournamentState, primaryColor: "#12GG00" })).toContain("#RRGGBB");
    expect(validateTeamDisplayProfileForm({ ...teamState, logoUrl: "javascript:alert(1)" })).toContain("Logo URL");
    expect(validateMatchDisplayOverrideForm({ ...matchState, awayAccentColor: "blue" })).toContain("#RRGGBB");

    expect(createTournamentDisplayThemePayload({
      ...tournamentState,
      displayName: "  Alpha Cup  ",
      logoUrl: "  ",
      primaryColor: "#111827"
    })).toMatchObject({
      displayName: "Alpha Cup",
      logoUrl: null,
      primaryColor: "#111827"
    });
    expect(createTeamDisplayProfilePayload({ ...teamState, displayName: " Home ", showTeamLogo: false })).toMatchObject({
      displayName: "Home",
      showTeamLogo: false
    });
    expect(createMatchDisplayOverridePayload({
      ...matchState,
      homePrimaryColor: "#111827",
      emergencyReason: " Match day contrast issue "
    })).toMatchObject({
      homePrimaryColor: "#111827",
      emergencyReason: "Match day contrast issue"
    });
  });

  test("keeps display theme save state independent from completed initial loading", () => {
    const validTournamentState = createTournamentDisplayThemeFormState({
      tournamentId: "tournament-1",
      displayName: "Alpha Cup",
      logoUrl: null,
      primaryColor: "#111827",
      secondaryColor: null,
      accentColor: null,
      textColor: null,
      backgroundStyle: "DEFAULT_ARENA",
      showTournamentLogo: true,
      active: true
    });
    const validationMessage = validateTournamentDisplayThemeForm(validTournamentState);

    expect(validationMessage).toBeNull();
    expect(getDisplayThemeSaveState({
      saving: false,
      routeId: "tournament-1",
      validationMessage
    })).toEqual({ disabled: false, reason: null });
    expect(getDisplayThemeSaveState({
      saving: true,
      routeId: "tournament-1",
      validationMessage
    })).toEqual({ disabled: true, reason: "SAVING" });
    expect(getDisplayThemeSaveState({
      saving: false,
      routeId: "",
      validationMessage
    })).toEqual({ disabled: true, reason: "MISSING_ROUTE_ID" });
    expect(getDisplayThemeSaveState({
      saving: false,
      routeId: "tournament-1",
      validationMessage: "Logo URL must be https:// or a root-relative asset path."
    })).toEqual({ disabled: true, reason: "VALIDATION_ERROR" });
  });

  test("falls back after a failed display logo preview without blocking save", () => {
    const logoUrl = "https://assets.example.test/missing-logo.png";

    expect(getLogoPreviewState(logoUrl, null)).toEqual({ showImage: true, showFallback: false });
    expect(getLogoPreviewState(logoUrl, logoUrl)).toEqual({ showImage: false, showFallback: true });
    expect(getDisplayThemeSaveState({
      saving: false,
      routeId: "tournament-1",
      validationMessage: null
    })).toEqual({ disabled: false, reason: null });
  });

  test("builds local display theme preview without private exposure or public display mutation", () => {
    const tournament = createTournamentDisplayThemeFormState({
      tournamentId: "tournament-1",
      displayName: "Alpha Cup",
      logoUrl: "https://assets.example.test/tournament.png",
      primaryColor: "#020617",
      secondaryColor: "#111827",
      accentColor: "#f59e0b",
      textColor: "#f8fafc",
      backgroundStyle: "DARK_GRADIENT",
      showTournamentLogo: true,
      active: true
    });
    const home = createTeamDisplayProfileFormState({
      teamId: "home-team",
      displayName: "Bangkok Home",
      logoUrl: "/assets/home.png",
      primaryColor: "#0f172a",
      secondaryColor: "#1d4ed8",
      accentColor: "#fde047",
      textColor: "#ffffff",
      showTeamLogo: true,
      active: true
    });
    const match = createMatchDisplayOverrideFormState({
      matchId: "match-1",
      home: { primaryColor: "#14532d", secondaryColor: null, accentColor: null, textColor: "#ffffff" },
      away: { primaryColor: "#7f1d1d", secondaryColor: null, accentColor: null, textColor: "#ffffff" },
      showTeamLogos: false,
      textOnlyFallback: true,
      neutralHighContrast: false,
      emergencyOverrideEnabled: true,
      emergencyReason: "Use neutral fallback if venue display clips logos"
    });

    const preview = buildDisplayThemePreviewModel({ tournament, home, match });
    const serialized = JSON.stringify(preview);

    expect(preview.title).toBe("Alpha Cup");
    expect(preview.home.label).toBe("Bangkok Home");
    expect(preview.home.colors.primaryColor).toBe("#14532d");
    expect(preview.home.showLogo).toBe(false);
    expect(preview.textOnlyFallback).toBe(true);
    expect(displayThemePreviewHasPrivateExposure(serialized)).toBe(false);
    expect(serialized).not.toMatch(/Use neutral fallback|commandId|correlationId|causationId|csrf|audit-log|\/admin|\/operator/i);
  });

  test("builds admin display screen links, forms, payloads, and save state", () => {
    const screen: DisplayScreenResponse = {
      screenId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      screenSlug: "court-1-main",
      displayName: "Court 1 Main",
      tournamentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      description: "Main arena display",
      publicEnabled: true,
      active: true
    };
    const form = createDisplayScreenFormState(screen);

    expect(buildAdminDisplayScreensLink()).toBe("/admin/display-screens");
    expect(buildAdminDisplayScreenNewLink()).toBe("/admin/display-screens/new");
    expect(buildAdminDisplayScreenDetailLink("screen 1")).toBe("/admin/display-screens/screen%201");
    expect(buildAdminDisplayScreenScenesLink("screen 1")).toBe("/admin/display-screens/screen%201/scenes");
    expect(buildAdminDisplayScreenPreviewLink("screen 1")).toBe("/admin/display-screens/screen%201/preview");
    expect(buildPublicDisplayScreenLink("court 1")).toBe("/public/display/court%201");
    expect(validateDisplayScreenForm(form)).toBeNull();
    expect(createDisplayScreenPayload({ ...form, displayName: " Court 1 ", description: "  " })).toMatchObject({
      screenSlug: "court-1-main",
      displayName: "Court 1",
      tournamentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      description: null,
      publicEnabled: true,
      active: true
    });
    expect(validateDisplayScreenForm({ ...form, screenSlug: "Court One" })).toContain("lowercase");
    expect(validateDisplayScreenForm({ ...form, tournamentId: "bad-id" })).toContain("valid UUID");
    expect(getDisplayScreenSaveState({ saving: false, routeId: screen.screenId, validationMessage: null })).toEqual({
      disabled: false,
      reason: null
    });
    expect(getDisplayScreenSaveState({ saving: true, routeId: screen.screenId, validationMessage: null }).disabled).toBe(true);
  });

  test("builds display scene forms, summaries, and public-safe preview state", () => {
    const liveScene: DisplaySceneResponse = {
      sceneId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      screenId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sceneType: "LIVE_SCOREBOARD",
      sceneName: "Live scoreboard",
      sceneConfig: { matchId: scoreboardProjection.matchId },
      sortOrder: 1,
      active: true
    };
    const scheduleForm = {
      ...createDisplaySceneFormState(),
      sceneType: "SCHEDULE" as const,
      sceneName: "Today Schedule",
      tournamentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      courtId: "",
      limit: "8"
    };
    const blankForm = {
      ...createDisplaySceneFormState(),
      sceneType: "BLANK" as const,
      sceneName: "Standby",
      message: " Ready "
    };
    const publicPreview = {
      screen: { screenSlug: "court-1-main", displayName: "Court 1 Main" },
      activeScene: {
        sceneType: "LIVE_SCOREBOARD" as const,
        publicData: { matchId: scoreboardProjection.matchId },
        refreshAfterMs: 1000
      },
      serverTime: "2026-07-09T00:00:00.000Z"
    };

    expect(displaySceneTypeOptions.map((option) => option.value)).toEqual([
      "LIVE_SCOREBOARD",
      "SCHEDULE",
      "FINAL_SUMMARY",
      "BLANK"
    ]);
    expect(createDisplaySceneFormState(liveScene)).toMatchObject({
      sceneType: "LIVE_SCOREBOARD",
      sceneName: "Live scoreboard",
      matchId: scoreboardProjection.matchId,
      sortOrder: "1",
      active: true
    });
    expect(validateDisplaySceneForm(scheduleForm)).toBeNull();
    expect(createDisplayScenePayload(scheduleForm)).toEqual({
      sceneType: "SCHEDULE",
      sceneName: "Today Schedule",
      sceneConfig: {
        tournamentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        courtId: null,
        limit: 8
      },
      sortOrder: 0,
      active: true
    });
    expect(createDisplayScenePayload(blankForm).sceneConfig).toEqual({ message: "Ready" });
    expect(validateDisplaySceneForm({ ...scheduleForm, limit: "30" })).toContain("1 to 20");
    expect(validateDisplaySceneForm({ ...createDisplaySceneFormState(liveScene), matchId: "not-a-uuid" })).toContain("valid match UUID");
    expect(getDisplaySceneConfigSummary(liveScene)).toContain(scoreboardProjection.matchId);
    expect(getDisplaySceneSaveState({ saving: false, screenId: "screen-1", validationMessage: null })).toEqual({
      disabled: false,
      reason: null
    });
    expect(getPublicDisplayPreviewSummary(publicPreview)).toBe("Court 1 Main: LIVE_SCOREBOARD");
    expect(publicDisplayPreviewHasPrivateExposure(publicPreview)).toBe(false);
    expect(publicDisplayPreviewHasPrivateExposure({ commandId: "secret-command", csrf: "token" })).toBe(true);
  });

  test("builds protected live dashboard links, filters, card labels, and warning summaries", () => {
    const match = {
      ...tournamentSchedule.matches[0],
      tournamentId: "tournament-1",
      period: tournamentSchedule.matches[0].periodNumber ?? 1,
      periodType: tournamentSchedule.matches[0].periodType ?? "REGULATION",
      gameClockRemainingMs: tournamentSchedule.matches[0].gameClockRemainingMs ?? 0,
      gameClockRunning: tournamentSchedule.matches[0].gameClockRunning ?? false,
      shotClockRemainingMs: tournamentSchedule.matches[0].shotClockRemainingMs ?? null,
      shotClockRunning: tournamentSchedule.matches[0].shotClockRunning ?? false,
      warnings: [
        { code: "CLOCK_STOPPED_LIVE", label: "Live game clock stopped", severity: "WARNING" as const },
        { code: "CHECKLIST_INCOMPLETE", label: "Checklist incomplete", severity: "INFO" as const }
      ],
      links: {
        score: `/operator/matches/${scoreboardProjection.matchId}/score`,
        fouls: `/operator/matches/${scoreboardProjection.matchId}/fouls`,
        clock: `/operator/matches/${scoreboardProjection.matchId}/clock`,
        timeouts: `/operator/matches/${scoreboardProjection.matchId}/timeouts`,
        corrections: `/operator/matches/${scoreboardProjection.matchId}/corrections`,
        summary: `/operator/matches/${scoreboardProjection.matchId}/summary`,
        replay: `/operator/matches/${scoreboardProjection.matchId}/replay`,
        auditLog: `/operator/matches/${scoreboardProjection.matchId}/audit-log`,
        publicScoreboard: `/public/scoreboard/${scoreboardProjection.matchId}`
      }
    };

    expect(buildAdminTournamentLiveDashboardLink("tournament 1")).toBe("/admin/tournaments/tournament%201/live-dashboard");
    expect(buildOperatorTournamentLiveDashboardLink("tournament 1")).toBe("/operator/tournaments/tournament%201/live-dashboard");
    expect(buildLiveDashboardFilters()).toEqual([
      { value: "all", label: "All" },
      { value: "live", label: "Live" },
      { value: "scheduled", label: "Scheduled" },
      { value: "finished", label: "Finished" },
      { value: "warnings", label: "Warnings" }
    ]);
    expect(buildLiveDashboardSummary([match])).toEqual({
      total: 1,
      live: 1,
      scheduled: 0,
      finished: 0,
      warnings: 1
    });
    expect(filterLiveDashboardMatches([match], "warnings")).toHaveLength(1);
    expect(buildLiveDashboardCard(match)).toMatchObject({
      matchupLabel: "Bangkok HOME vs Chiang Mai AWAY",
      scoreLabel: "10 - 8",
      locationLabel: "Court A",
      periodLabel: "REGULATION P2",
      gameClockLabel: "6:25 stopped",
      shotClockLabel: "12 stopped",
      seqLabel: "Seq 3"
    });
    expect(getLiveDashboardEmptyState(0, 0, "all")).toBe("No matches scheduled yet.");
    expect(getLiveDashboardEmptyState(1, 0, "live")).toBe("No live matches right now.");
    expect(JSON.stringify(match.links)).toContain("/operator/matches/");
    expect(JSON.stringify(Object.values(getPublicScheduleLinks(tournamentSchedule.matches[0])).filter(Boolean))).not.toMatch(
      /live-dashboard|operator|admin|audit-log|replay|corrections/i
    );
  });

  test("builds venue and court management payloads and court dropdown options", () => {
    const venues = [
      {
        venueId: "venue-1",
        name: "Main Hall",
        shortName: "MH",
        address: "Bangkok",
        active: true,
        courts: [
          { courtId: "court-1", label: "Court A", displayName: "Main Hall / Court A", active: true },
          { courtId: "court-2", label: "Court B", displayName: null, active: false }
        ]
      },
      {
        venueId: "venue-2",
        name: "Annex",
        shortName: null,
        address: null,
        active: true,
        courts: [
          { courtId: "court-3", label: "Court A", displayName: null, active: true }
        ]
      }
    ];

    expect(createVenueFormState()).toEqual({ name: "", shortName: "", address: "" });
    expect(createVenuePayload({ name: " Main Hall ", shortName: " MH ", address: "" })).toEqual({
      name: "Main Hall",
      shortName: "MH",
      address: null
    });
    expect(createCourtFormState()).toEqual({ venueId: "", label: "", displayName: "" });
    expect(createCourtPayload({ venueId: "venue-1", label: " Court A ", displayName: "" })).toEqual({
      label: "Court A",
      displayName: null
    });
    expect(buildVenueCourtOptions(venues)).toEqual([
      { value: "court-1", label: "Main Hall / Court A", venueName: "Main Hall", courtLabel: "Court A" },
      { value: "court-3", label: "Annex / Court A", venueName: "Annex", courtLabel: "Court A" }
    ]);
    expect(buildSelectedCourtPreview(venues, "court-1")).toBe("Selected court: Main Hall / Court A");
    expect(buildSelectedCourtPreview(venues, "")).toBeNull();
  });

  test("builds advisory schedule conflict warnings without blocking submit", () => {
    const conflictMatch = {
      ...tournamentSchedule.matches[0],
      conflicts: [
        {
          conflictId: "conflict-1",
          severity: "WARNING" as const,
          type: "SAME_COURT_SAME_TIME" as const,
          message: "Same court and scheduled time as match North vs South.",
          matchId: tournamentSchedule.matches[0].matchId,
          conflictingMatchId: "match-2",
          scheduledAt: "2026-07-03T10:00:00.000Z",
          courtId: "court-1",
          venueLabel: "Main Hall",
          courtLabel: "Court A"
        }
      ]
    };

    expect(getScheduleConflictSummary([conflictMatch])).toBe("Schedule warnings found: 1 court conflict warning.");
    expect(buildScheduleRowMeta(conflictMatch)).toMatchObject({
      conflictCount: 1,
      conflictBadgeLabel: "Court conflict warning",
      conflictDetail: "Same court and scheduled time as match North vs South."
    });
    expect(getScheduledMatchConflictWarning({
      homeTeamId: "home-team",
      awayTeamId: "away-team",
      courtId: "court-1",
      scheduledAt: "2026-07-03T10:00:00.000Z",
      roundLabel: "",
      courtLabel: "",
      venueLabel: ""
    }, [tournamentSchedule.matches[0]], venueList.venues)).toContain("Court conflict warning");
    expect(getScheduledMatchFormFeedback({
      homeTeamId: "home-team",
      awayTeamId: "away-team",
      courtId: "court-1",
      scheduledAt: "2026-07-03T10:00:00.000Z",
      roundLabel: "",
      courtLabel: "",
      venueLabel: ""
    }, 2)).toEqual({ disabled: false, warning: null });
    expect(getScheduledMatchConflictWarning({
      homeTeamId: "home-team",
      awayTeamId: "away-team",
      courtId: "",
      scheduledAt: "2026-07-03T10:00:00.000Z",
      roundLabel: "",
      courtLabel: "Court A",
      venueLabel: "Different Hall"
    }, [tournamentSchedule.matches[0]], venueList.venues)).toBeNull();
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

  test("builds clock page correction link", () => {
    expect(getClockControlLinks(scoreboardProjection.matchId).corrections).toEqual({
      href: `/operator/matches/${scoreboardProjection.matchId}/corrections`,
      label: "Corrections"
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
    expect(getTimeoutControlLinks(scoreboardProjection.matchId).corrections).toEqual({
      href: `/operator/matches/${scoreboardProjection.matchId}/corrections`,
      label: "Corrections"
    });
  });
});

describe("correction control UI policy", () => {
  const eligibleScoreEvent = {
    seqNo: 1,
    eventType: "SCORE_ADDED",
    occurredAt: "2026-07-06T09:00:01.000Z",
    actorDisplayName: null,
    summary: "HOME +2",
    eligible: true,
    ineligibleReason: null,
    correctionKind: "SCORE_UNDO" as const,
    currentValue: { teamSide: "HOME", points: 2 },
    proposedCompensation: { teamSide: "HOME", points: -2 }
  };

  test("builds correction event metadata and reason validation", () => {
    expect(buildCorrectionNavItems(scoreboardProjection.matchId).map((item) => item.label)).toEqual([
      "Score",
      "Fouls",
      "Clock",
      "Timeouts",
      "Corrections",
      "Replay",
      "Audit Log"
    ]);
    expect(buildCorrectionNavItems(scoreboardProjection.matchId, "Corrections").find((item) => item.current)).toMatchObject({
      label: "Corrections",
      className: "button-link"
    });
    expect(buildCorrectionEventMeta(eligibleScoreEvent)).toEqual({
      seqLabel: "#1",
      typeLabel: "SCORE_ADDED",
      statusLabel: "Eligible",
      actionLabel: "Correct",
      summary: "HOME +2"
    });
    expect(canSubmitCorrectionReason("    ")).toBe(false);
    expect(canSubmitCorrectionReason("bad")).toBe(false);
    expect(canSubmitCorrectionReason("Wrong team score")).toBe(true);
  });

  test("builds correction command payload and safe feedback", () => {
    expect(buildCorrectionCommandPayload(scoreboardProjection, eligibleScoreEvent, " Wrong team score ")).toEqual({
      expectedSeq: scoreboardProjection.currentSeq,
      correctedEventSeq: 1,
      correctionKind: "SCORE_UNDO",
      reason: "Wrong team score",
      payload: {
        correctionKind: "SCORE_UNDO",
        target: { seqNo: 1, eventType: "SCORE_ADDED" },
        delta: { teamSide: "HOME", points: -2 },
        newValue: null
      }
    });
    expect(getCorrectionControlFeedback({
      ok: true,
      matchId: scoreboardProjection.matchId,
      seqNo: 4,
      eventType: "SCORE_CORRECTED",
      projection: scoreboardProjection
    })).toEqual({ tone: "success", text: "Correction appended at seq 4." });
    expect(hasCorrectionPublicExposure(JSON.stringify(eligibleScoreEvent))).toBe(true);
    expect(hasCorrectionPublicExposure(JSON.stringify({ homeScore: 8, awayScore: 6 }))).toBe(false);
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

  test("builds lifecycle readiness context without hard blocking start controls", () => {
    expect(buildLifecycleReadinessContext(incompleteReadiness)).toEqual({
      warning: "Setup readiness is incomplete. Review roster, lineup, and official assignments before starting.",
      hardBlock: false,
      items: [
        { label: "Officials", state: "READY", detail: "2 active officials" },
        { label: "Roster", state: "READY", detail: "HOME 7 / AWAY 8" },
        { label: "Lineup", state: "INCOMPLETE", detail: "HOME 5 confirmed / AWAY 4 not confirmed" },
        { label: "Lifecycle", state: "NOT STARTED", detail: "Not started" }
      ]
    });
  });

  test("builds advisory match start checklist without hard blocking start controls", () => {
    expect(buildMatchStartChecklist(scoreboardProjection, incompleteReadiness)).toEqual({
      state: "WARNING",
      readyCount: 4,
      warningCount: 1,
      missingCount: 0,
      advisoryWarning: "Setup checklist has warnings. This Alpha checklist is advisory and does not enforce official start rules.",
      hardBlock: false,
      items: [
        {
          key: "officials",
          label: "Officials",
          status: "READY",
          message: "2 active officials",
          actionLabel: "Assign Officials",
          actionUrl: `/admin/matches/${scoreboardProjection.matchId}/officials`
        },
        {
          key: "roster",
          label: "Roster",
          status: "READY",
          message: "HOME 7 / AWAY 8",
          actionLabel: "Setup Roster",
          actionUrl: `/admin/matches/${scoreboardProjection.matchId}/rosters`
        },
        {
          key: "lineup",
          label: "Lineup",
          status: "WARNING",
          message: "HOME 5 confirmed / AWAY 4 not confirmed",
          actionLabel: "Setup Lineup",
          actionUrl: `/admin/matches/${scoreboardProjection.matchId}/lineup`
        },
        {
          key: "clock_config",
          label: "Clock / Period Config",
          status: "READY",
          message: "Period 1 REGULATION, game clock 8:32, shot clock 24",
          actionLabel: "Open Clock",
          actionUrl: `/operator/matches/${scoreboardProjection.matchId}/clock`
        },
        {
          key: "public_scoreboard",
          label: "Public Scoreboard",
          status: "READY",
          message: "Public scoreboard link is available.",
          actionLabel: "Open Public Scoreboard",
          actionUrl: `/public/scoreboard/${scoreboardProjection.matchId}`
        }
      ]
    });

    expect(getLifecycleActionPlan({ ...scoreboardProjection, status: "READY" }).startMatch.enabled).toBe(true);
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
