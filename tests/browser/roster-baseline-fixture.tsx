import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../apps/web/src/App";
import "../../apps/web/src/styles/tokens.css";
import "../../apps/web/src/styles/primitives.css";
import "../../apps/web/src/styles.css";

const matchId = "fixture-roster-match";

declare global {
  interface Window {
    __rosterFixture: {
      getSnapshot(): { commandAttempts: number; resyncRequests: number; requests: Array<{ method: string; pathname: string; body: unknown }> };
    };
  }
}

const originalFetch = window.fetch.bind(window);
const state = new URLSearchParams(window.location.search).get("state") ?? "not-initialized";
let commandAttempts = 0;
let resyncRequests = 0;
let imported = ["ready", "not-evaluated", "blocking-eligibility", "not-confirmed", "starters-incomplete"].includes(state);
let syncFailed = state === "sync-required";
let awaitingResync = false;
let requests: Array<{ method: string; pathname: string; body: unknown }> = [];

function success(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
}

function apiError(status: number, reasonCode: string, message: string) {
  return new Response(JSON.stringify({ error: { reasonCode, message } }), { status, headers: { "content-type": "application/json" } });
}

function readinessState() {
  if (state === "not-evaluated") return "NOT_EVALUATED";
  if (state === "blocking-eligibility") return "BLOCKING_ELIGIBILITY_REVIEW";
  if (state === "not-confirmed") return "ROSTER_NOT_CONFIRMED";
  if (state === "starters-incomplete") return "STARTERS_INCOMPLETE";
  return "READY";
}

function baseline(teamSide: "HOME" | "AWAY") {
  return {
    teamSide,
    version: { eventSeq: 12, eventId: `event-${teamSide.toLowerCase()}`, canonicalPayloadHash: "hash" },
    readiness: { state: readinessState(), effective: readinessState() === "READY", starterCount: readinessState() === "READY" ? 5 : 0, requiredStarterCount: 5 },
    integrityIssues: readinessState() === "BLOCKING_ELIGIBILITY_REVIEW" ? ["BLOCKING_ELIGIBILITY_REVIEW"] : [],
    members: [{ displayName: "Private Player Must Not Become Public", jerseyNumber: "99", isStarter: true, isCaptain: true }]
  };
}

window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
  if (!url.pathname.startsWith("/api/v1/")) return originalFetch(input, init);
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  let body: unknown = null;
  if (typeof init.body === "string") {
    try { body = JSON.parse(init.body); } catch { body = init.body; }
  }
  requests.push({ method, pathname: url.pathname, body });

  if (url.pathname === "/api/v1/auth/me") {
    return success({ user: {
      userId: "fixture-admin",
      email: "admin@example.test",
      displayName: "Fixture Admin",
      role: "ADMIN",
      roles: ["ADMIN"],
      permissions: ["match.read", "match.roster.import"],
      assignedMatchIds: [matchId],
      matchAssignments: [{ matchId, roleCode: "ADMIN", active: true }],
      deviceId: "fixture-device",
      authMode: "SESSION"
    } });
  }
  if (url.pathname === "/api/v1/auth/csrf") return success({ csrfToken: "fixture-csrf" });
  if (url.pathname.endsWith("/projection")) {
    if (awaitingResync) {
      resyncRequests += 1;
      awaitingResync = false;
    }
    return success({
    matchId, homeTeamId: "home-team", awayTeamId: "away-team", homeTeamName: "Home", awayTeamName: "Away",
    homeScore: 0, awayScore: 0, teamFouls: { home: 0, away: 0 }, playerFouls: [],
    periodType: "REGULATION", periodNumber: 1, gameClockRemainingMs: 600000, shotClockRemainingMs: 24000,
    status: "SCHEDULED", currentSeq: 12, projectionVersion: "scoreboard-v1"
    });
  }
  if (url.pathname.endsWith("/roster-baseline/HOME") || url.pathname.endsWith("/roster-baseline/AWAY")) {
    const teamSide = url.pathname.endsWith("/HOME") ? "HOME" : "AWAY";
    if (!imported) return apiError(404, "NOT_FOUND", "Baseline not initialized");
    return success(baseline(teamSide));
  }
  if (url.pathname.endsWith("/roster-baseline/import") && method === "POST") {
    commandAttempts += 1;
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (state === "unauthorized") return apiError(401, "UNAUTHORIZED", "Authentication is required.");
    if (state === "assignment-revoked") return apiError(403, "ASSIGNMENT_REVOKED", "Match assignment is no longer active.");
    if (syncFailed) {
      syncFailed = false;
      awaitingResync = true;
      return success({ status: "SYNC_REQUIRED", currentSeq: 13, reasonCode: "INVALID_EXPECTED_SEQ", message: "Authoritative sequence changed." });
    }
    imported = true;
    return success({ status: "ACCEPTED", currentSeq: 13, reasonCode: null, message: null, projection: baseline("HOME") });
  }
  if (url.pathname.endsWith("/sync")) {
    resyncRequests += 1;
    return success({ matchId, currentSeq: 13, projection: {} });
  }
  return apiError(404, "NOT_FOUND", `Unexpected fixture path ${url.pathname}`);
};

window.__rosterFixture = {
  getSnapshot() { return { commandAttempts, resyncRequests, requests: structuredClone(requests) }; }
};

window.history.replaceState({}, "", `/admin/matches/${matchId}/rosters`);
const root = document.getElementById("root");
if (!root) throw new Error("Fixture root missing");
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
