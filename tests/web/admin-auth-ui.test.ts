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
  buildOperatorMatchCard,
  canAccessOperatorMatches,
  createEmptyOperatorMatchesMessage
} from "../../apps/web/src/lib/operatorMatches";
import type { AuthenticatedUser } from "../../packages/api-contracts/src";

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

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: init.status ?? 200,
    ...init
  });
}

describe("web API client", () => {
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
});

describe("auth state", () => {
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

  test("scorer match card shows assigned match with disabled score control", () => {
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
    expect(card.scoreControl).toEqual({ enabled: false, label: "Score Control: coming next" });
    expect(card.currentSeqLabel).toBe("Seq 0");
  });

  test("empty operator match state is explicit", () => {
    expect(createEmptyOperatorMatchesMessage()).toBe("No active match assignments found for this account.");
  });

  test("admin match list links to officials page", () => {
    expect(buildAdminMatchLink("match-1")).toBe("/admin/matches/match-1/officials");
  });
});
