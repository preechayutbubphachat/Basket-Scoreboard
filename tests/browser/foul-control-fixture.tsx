import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../apps/web/src/App";
import "../../apps/web/src/styles/tokens.css";
import "../../apps/web/src/styles/primitives.css";
import "../../apps/web/src/styles/live-match-shell.css";
import "../../apps/web/src/styles/clock-workspace.css";
import "../../apps/web/src/styles/score-workspace.css";
import "../../apps/web/src/styles.css";

type AccessMode = "allowed" | "denied" | "error" | "loading" | "malformed" | "mismatch" | "readonly";
type CommandMode = "accepted" | "accepted-refresh-fail" | "network-ambiguous" | "rejected" | "sync-required";
type RosterVariant = "away-empty" | "both-empty" | "home-empty" | "large-roster" | "long-names" | "normal";
type ProjectionVariant = "duplicate" | "fractional" | "mismatch" | "negative" | "normal";

type FixtureRequest = {
  body: unknown;
  method: string;
  pathname: string;
};

type FoulFixtureController = {
  clearTelemetry(): void;
  getSnapshot(): {
    commandAttempts: number;
    commandBodies: unknown[];
    maxConcurrentCommands: number;
    projection: ReturnType<typeof createProjection>;
    requests: FixtureRequest[];
  };
  setAcceptedRefreshDelay(milliseconds: number): void;
  setAccessMode(mode: AccessMode): void;
  setAuthorityDelay(milliseconds: number): void;
  setCommandMode(mode: CommandMode): void;
  setPersistenceBlocked(blocked: boolean): void;
  setPersonalFoulCount(playerId: string, fouls: number): void;
  setProjectionStatus(status: string): void;
  removeRosterPlayer(playerId: string): void;
  setRosterVariant(variant: RosterVariant): void;
};

declare global {
  interface Window {
    __foulFixture: FoulFixtureController;
    __foulFixtureConfig?: Record<string, string>;
  }
}

const matchId = "fixture-match";
const foulQueueStorageKey = "basket-scoreboard:rm06:foul-queue:v1";
const originalFetch = window.fetch.bind(window);
const originalStorageSetItem = Storage.prototype.setItem;
const parameters = window.__foulFixtureConfig ?? {};
const initialState = parameters.state ?? "ready";

function rosterPlayer(
  teamSide: "HOME" | "AWAY",
  index: number,
  options: { longName?: boolean } = {}
) {
  const sideLabel = teamSide === "HOME" ? "Bangkok" : "เชียงใหม่";
  const playerName = options.longName
    ? `${sideLabel} ${teamSide} International Youth Academy Player With A Deliberately Long Mixed ภาษาไทย Name ${index}`
    : `${sideLabel} Player ${index}`;
  return {
    rosterPlayerId: `${teamSide.toLowerCase()}-roster-${index}`,
    matchId,
    teamSide,
    teamId: `${teamSide.toLowerCase()}-team`,
    playerId: `${teamSide.toLowerCase()}-player-${index}`,
    displayNameSnapshot: playerName,
    jerseyNumberSnapshot: String(index).padStart(2, "0"),
    position: "GUARD",
    status: "ACTIVE",
    isStarter: index <= 5,
    isCaptain: index === 1
  };
}

function createRosters(variant: RosterVariant) {
  const count = variant === "large-roster" ? 18 : 4;
  const longName = variant === "long-names";
  const home = variant === "home-empty" || variant === "both-empty"
    ? []
    : Array.from({ length: count }, (_, index) => rosterPlayer("HOME", index + 1, { longName }));
  const away = variant === "away-empty" || variant === "both-empty"
    ? []
    : Array.from({ length: count }, (_, index) => rosterPlayer("AWAY", index + 1, { longName }));
  return { matchId, rosters: { HOME: home, AWAY: away } };
}

function createPlayerFouls(variant: ProjectionVariant) {
  const playerFouls = [
    {
      playerId: "home-player-1",
      teamSide: "HOME",
      playerName: "Bangkok Player 1",
      jerseyNumber: "01",
      fouls: 2
    },
    {
      playerId: "away-player-1",
      teamSide: "AWAY",
      playerName: "Chiang Mai Player 1",
      jerseyNumber: "01",
      fouls: 4
    },
    {
      playerId: "removed-or-orphan-player",
      teamSide: "HOME",
      playerName: "Private orphan",
      jerseyNumber: null,
      fouls: -9
    }
  ];
  if (variant === "duplicate") {
    playerFouls.push({ ...playerFouls[0], fouls: 3 });
  } else if (variant === "negative") {
    playerFouls[0] = { ...playerFouls[0], fouls: -1 };
  } else if (variant === "fractional") {
    playerFouls[0] = { ...playerFouls[0], fouls: 1.5 };
  } else if (variant === "mismatch") {
    playerFouls[0] = { ...playerFouls[0], teamSide: "AWAY" };
  }
  return playerFouls;
}

function createProjection(status = "LIVE", longNames = false, variant: ProjectionVariant = "normal") {
  return {
    matchId,
    homeTeamId: "home-team",
    homeTeamName: longNames
      ? "Bangkok Metropolitan International Youth Basketball Academy Championship Selection"
      : "Bangkok Thunder",
    awayTeamId: "away-team",
    awayTeamName: longNames
      ? "สโมสรบาสเกตบอลเยาวชนเชียงใหม่ฟอลคอนส์นานาชาติชิงแชมป์ประเทศไทย"
      : "Chiang Mai Falcons",
    homeScore: 72,
    awayScore: 68,
    teamFouls: { home: 3, away: 2 },
    playerFouls: createPlayerFouls(variant),
    periodType: "REGULATION",
    periodNumber: 4,
    gameClockRemainingMs: 123_000,
    shotClockRemainingMs: 14_000,
    status,
    currentSeq: 40,
    projectionVersion: "scoreboard-v1" as const
  };
}

const initialAccessMode: AccessMode = (
  ["denied", "error", "loading", "malformed", "mismatch", "readonly"].includes(initialState)
    ? initialState
    : "allowed"
) as AccessMode;
const initialRosterVariant: RosterVariant = (
  ["home-empty", "away-empty", "both-empty", "large-roster", "long-names"].includes(initialState)
    ? initialState
    : "normal"
) as RosterVariant;
const initialProjectionVariant: ProjectionVariant = (
  initialState === "malformed-foul-duplicate"
    ? "duplicate"
    : initialState === "malformed-foul-negative"
      ? "negative"
      : initialState === "malformed-foul-fractional"
        ? "fractional"
        : initialState === "malformed-foul-mismatch"
          ? "mismatch"
          : "normal"
) as ProjectionVariant;

const state = {
  acceptedProjectionAvailableAt: 0,
  acceptedRefreshDelayMs: 0,
  accessMode: initialAccessMode,
  authorityDelayMs: 0,
  commandAttempts: 0,
  commandBodies: [] as unknown[],
  commandMode: (parameters.command ?? "accepted") as CommandMode,
  concurrentCommands: 0,
  failNextRefresh: false,
  maxConcurrentCommands: 0,
  persistenceBlocked: false,
  projection: createProjection(
    initialState === "finished" ? "FINISHED" : initialState === "final" ? "FINAL" : "LIVE",
    initialState === "long-names",
    initialProjectionVariant
  ),
  requests: [] as FixtureRequest[],
  rosterVariant: initialRosterVariant,
  rosters: createRosters(initialRosterVariant)
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function success(data: unknown) {
  return jsonResponse({ ok: true, data });
}

function apiError(status: number, reasonCode: string, message: string) {
  return jsonResponse({
    ok: false,
    error: { code: reasonCode, reasonCode, message }
  }, status);
}

function delay(milliseconds: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Request aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Request aborted", "AbortError"));
    }, { once: true });
  });
}

function effectiveAccess() {
  if (state.accessMode === "malformed") return { malformed: true };
  return {
    matchId: state.accessMode === "mismatch" ? "different-match" : matchId,
    capabilities: {
      matchRead: state.accessMode !== "denied",
      scoreOperate: true,
      foulOperate: state.accessMode === "allowed",
      gameClockOperate: false,
      shotClockOperate: false,
      timeoutOperate: false,
      lifecycleOperate: false,
      correctionRequest: state.accessMode === "allowed" || state.accessMode === "readonly",
      correctionApply: false,
      correctionReject: false,
      auditRead: true
    }
  };
}

function applyAcceptedFoul(body: any) {
  const side = body?.payload?.teamSide;
  const playerId = body?.payload?.playerId;
  if (side === "HOME") state.projection.teamFouls.home += 1;
  if (side === "AWAY") state.projection.teamFouls.away += 1;
  const existing = state.projection.playerFouls.find((entry) => entry.playerId === playerId);
  if (existing) {
    existing.fouls += 1;
  } else if (typeof playerId === "string" && (side === "HOME" || side === "AWAY")) {
    const player = [...state.rosters.rosters.HOME, ...state.rosters.rosters.AWAY]
      .find((candidate) => candidate.playerId === playerId);
    state.projection.playerFouls.push({
      playerId,
      teamSide: side,
      playerName: player?.displayNameSnapshot ?? null,
      jerseyNumber: player?.jerseyNumberSnapshot ?? null,
      fouls: 1
    });
  }
  state.projection.currentSeq += 1;
}

window.fetch = async (input, init = {}) => {
  const requestUrl = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
  if (!requestUrl.pathname.startsWith("/api/v1/")) return originalFetch(input, init);

  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  let body: unknown = null;
  if (typeof init.body === "string") {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = init.body;
    }
  }
  state.requests.push({ body, method, pathname: requestUrl.pathname });

  if (requestUrl.pathname === "/api/v1/auth/me") {
    return success({
      user: {
        userId: "fixture-user",
        email: "operator@example.test",
        displayName: "Assigned Foul Operator",
        role: "SCORER",
        roles: ["SCORER"],
        permissions: ["match.read", "match.foul.operate", "match.correction.request"],
        assignedMatchIds: [matchId],
        matchAssignments: [{ matchId, roleCode: "SCORER", active: true }],
        deviceId: "fixture-device",
        authMode: "SESSION"
      }
    });
  }
  if (requestUrl.pathname === "/api/v1/auth/csrf") return success({ csrfToken: "fixture-csrf-token" });

  if (requestUrl.pathname.endsWith("/effective-access")) {
    if (state.accessMode === "loading") return new Promise<Response>(() => {});
    if (state.authorityDelayMs) await delay(state.authorityDelayMs, init.signal);
    if (state.accessMode === "error") return apiError(503, "SERVICE_UNAVAILABLE", "Access fixture unavailable");
    if (state.failNextRefresh) {
      state.failNextRefresh = false;
      return apiError(503, "SERVICE_UNAVAILABLE", "Authoritative refresh failed");
    }
    return success(effectiveAccess());
  }
  if (requestUrl.pathname.endsWith("/projection")) {
    if (state.accessMode === "loading") return new Promise<Response>(() => {});
    if (state.authorityDelayMs) await delay(state.authorityDelayMs, init.signal);
    const acceptedProjectionWaitMs = state.acceptedProjectionAvailableAt - Date.now();
    if (acceptedProjectionWaitMs > 0) await delay(acceptedProjectionWaitMs, init.signal);
    if (state.accessMode === "error") return apiError(503, "SERVICE_UNAVAILABLE", "Projection fixture unavailable");
    return jsonResponse(state.projection);
  }
  if (requestUrl.pathname.endsWith("/rosters")) {
    if (state.accessMode === "loading") return new Promise<Response>(() => {});
    if (state.authorityDelayMs) await delay(state.authorityDelayMs, init.signal);
    if (state.accessMode === "error") return apiError(503, "SERVICE_UNAVAILABLE", "Roster fixture unavailable");
    return success(state.rosters);
  }
  if (requestUrl.pathname.endsWith("/sync")) {
    if (state.acceptedRefreshDelayMs > 0) {
      await delay(state.acceptedRefreshDelayMs, init.signal);
    }
    if (state.commandMode === "accepted-refresh-fail") {
      state.failNextRefresh = true;
      return apiError(503, "SERVICE_UNAVAILABLE", "Accepted command reconciliation failed");
    }
    return jsonResponse({
      matchId,
      lastEventSeqFromClient: Number(requestUrl.searchParams.get("lastEventSeq") ?? 0),
      currentSeq: state.projection.currentSeq,
      serverTime: new Date().toISOString(),
      mode: "FULL_STATE",
      projection: state.projection,
      requiresFullSync: false
    });
  }
  if (requestUrl.pathname.endsWith("/commands/foul/player/add") && method === "POST") {
    state.commandAttempts += 1;
    state.commandBodies.push(body);
    state.concurrentCommands += 1;
    state.maxConcurrentCommands = Math.max(state.maxConcurrentCommands, state.concurrentCommands);
    try {
      await delay(180, init.signal);
      if (state.commandMode === "network-ambiguous" && state.commandAttempts === 1) {
        throw new TypeError("Fixture transport outcome is unknown");
      }
      if (state.commandMode === "sync-required") {
        return jsonResponse({
          status: "SYNC_REQUIRED",
          reasonCode: "INVALID_EXPECTED_SEQ",
          message: "Authoritative sequence changed.",
          currentSeq: state.projection.currentSeq
        });
      }
      if (state.commandMode === "rejected") {
        return jsonResponse({
          status: "REJECTED",
          reasonCode: "RULE_VIOLATION",
          message: "Fixture definite rejection.",
          currentSeq: state.projection.currentSeq
        });
      }
      applyAcceptedFoul(body);
      state.acceptedProjectionAvailableAt = Date.now() + state.acceptedRefreshDelayMs;
      return jsonResponse({
        status: "ACCEPTED",
        currentSeq: state.projection.currentSeq,
        appendedEventSeqs: [state.projection.currentSeq]
      });
    } finally {
      state.concurrentCommands -= 1;
    }
  }

  return apiError(404, "NOT_FOUND", `Unexpected fixture API path ${requestUrl.pathname}`);
};

window.__foulFixture = {
  clearTelemetry() {
    state.commandAttempts = 0;
    state.commandBodies = [];
    state.concurrentCommands = 0;
    state.maxConcurrentCommands = 0;
    state.requests = [];
  },
  getSnapshot() {
    return {
      commandAttempts: state.commandAttempts,
      commandBodies: structuredClone(state.commandBodies),
      maxConcurrentCommands: state.maxConcurrentCommands,
      projection: structuredClone(state.projection),
      requests: structuredClone(state.requests)
    };
  },
  setAcceptedRefreshDelay(milliseconds) {
    state.acceptedRefreshDelayMs = Math.max(0, milliseconds);
  },
  setAccessMode(mode) {
    state.accessMode = mode;
  },
  setAuthorityDelay(milliseconds) {
    state.authorityDelayMs = Math.max(0, milliseconds);
  },
  setCommandMode(mode) {
    state.commandMode = mode;
  },
  setPersistenceBlocked(blocked) {
    state.persistenceBlocked = blocked;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (state.persistenceBlocked && key === foulQueueStorageKey) {
        throw new DOMException("Fixture persistence blocked", "QuotaExceededError");
      }
      return originalStorageSetItem.call(this, key, value);
    };
  },
  setPersonalFoulCount(playerId, fouls) {
    const entry = state.projection.playerFouls.find((candidate) => candidate.playerId === playerId);
    if (entry) entry.fouls = fouls;
  },
  setProjectionStatus(status) {
    state.projection.status = status;
  },
  removeRosterPlayer(playerId) {
    state.rosters.rosters.HOME = state.rosters.rosters.HOME.filter((player) => player.playerId !== playerId);
    state.rosters.rosters.AWAY = state.rosters.rosters.AWAY.filter((player) => player.playerId !== playerId);
  },
  setRosterVariant(variant) {
    state.rosterVariant = variant;
    state.rosters = createRosters(variant);
  }
};

const routePath = `/operator/matches/${matchId}/fouls`;
window.history.replaceState({}, "", routePath);
const root = document.getElementById("root");
if (!root) throw new Error("Fixture root was not found");
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
