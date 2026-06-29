import { describe, expect, test, vi } from "vitest";
import { createApiClient, type FetchLike } from "../../apps/web/src/lib/apiClient";
import { createInitialAuthState, reduceAuthState } from "../../apps/web/src/lib/authState";
import {
  canManageAssignments,
  createAssignmentFormState,
  getProtectedRouteDecision,
  submitAssignmentForm,
  validateRevokeReason
} from "../../apps/web/src/lib/adminAssignments";
import {
  buildAdminMatchLink,
  buildOperatorMatchScoreLink,
  buildOperatorMatchCard,
  canAccessOperatorMatches,
  canOperateScore,
  createEmptyOperatorMatchesMessage
} from "../../apps/web/src/lib/operatorMatches";
import type { AuthenticatedUser, ScoreAddedPayload, ScoreboardProjection } from "../../packages/api-contracts/src";

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
  homeScore: 10,
  awayScore: 8,
  periodNumber: 1,
  gameClockRemainingMs: 512000,
  shotClockRemainingMs: null,
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

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: init.status ?? 200,
    ...init
  });
}

describe("web API client", () => {
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
      "/api/v1/admin/matches",
      expect.objectContaining({ credentials: "include" })
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

    await client.addScore(scoreboardProjection.matchId, { expectedSeq: 3, payload: scorePayload });

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
    expect(buildOperatorMatchScoreLink("match 1")).toBe("/operator/matches/match%201/score");
  });

  test("empty operator match state is explicit", () => {
    expect(createEmptyOperatorMatchesMessage()).toBe("No active match assignments found for this account.");
  });

  test("admin match list links to officials page", () => {
    expect(buildAdminMatchLink("match-1")).toBe("/admin/matches/match-1/officials");
  });
});
