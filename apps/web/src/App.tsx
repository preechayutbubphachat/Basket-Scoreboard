import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  CommandResult,
  FoulType,
  AuditLogGroupFilter,
  AuditLogRow,
  MatchAuditLogResponse,
  MatchLineupResponse,
  MatchReplayResponse,
  MatchRosterPlayer,
  MatchRostersResponse,
  MatchSummaryPlayer,
  MatchSummaryResponse,
  MatchSummaryTeam,
  MatchOfficialRoleCode,
  OperatorMatchSummary,
  PlayerPosition,
  ReplayGroupFilter,
  ReplayItem,
  ScoreboardProjection,
  TimeoutRequestedBy,
  TournamentScheduleMatch,
  TournamentScheduleResponse,
  TournamentSummary
} from "@basket-scoreboard/api-contracts";
import { AuthProvider, useCurrentUser } from "./auth/AuthProvider";
import { ApiClientError, getDefaultApiBaseUrl, type AssignmentRecord } from "./lib/apiClient";
import {
  canManageAssignments,
  createAssignmentFormState,
  getProtectedRouteDecision,
  matchOfficialRoleCodes,
  validateRevokeReason,
  type AssignmentFormState
} from "./lib/adminAssignments";
import {
  buildAdminMatchActions,
  buildAdminMatchLink,
  buildOperatorMatchAuditLogLink,
  buildOperatorMatchClockLink,
  buildOperatorMatchScoreLink,
  buildOperatorMatchFoulsLink,
  buildOperatorMatchLifecycleLink,
  buildOperatorMatchReplayLink,
  buildOperatorMatchSummaryLink,
  buildOperatorMatchTimeoutsLink,
  buildPublicScoreboardLink,
  buildOperatorMatchCard,
  canAccessOperatorMatches,
  canOperateScore,
  createEmptyOperatorMatchesMessage,
  getTeamLabel
} from "./lib/operatorMatches";
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
  type ScoreControlPoint,
  type ScoreControlTeamSide
} from "./lib/scoreControl";
import {
  buildFoulControlPanels,
  buildTeamFoulCommandPayload,
  foulTypeOptions,
  getFoulControlFeedback,
  getFoulControlLinks,
  type FoulControlTeamSide
} from "./lib/foulControl";
import {
  buildClockControlState,
  buildGameClockSetPayload,
  buildShotClockResetPayload,
  buildShotClockSetPayload,
  getClockControlFeedback,
  getClockControlLinks
} from "./lib/clockControl";
import {
  buildTimeoutControlPanels,
  buildTimeoutEndPayload,
  buildTimeoutGrantPayload,
  getActiveTimeoutLabel,
  getTimeoutControlFeedback,
  getTimeoutControlLinks,
  timeoutRequestedByOptions,
  type TimeoutControlTeamSide
} from "./lib/timeoutControl";
import {
  buildLifecycleCommandPayload,
  buildLifecycleControlState,
  getLifecycleActionPlan,
  getLifecycleControlFeedback,
  getLifecycleControlLinks,
  type LifecycleAction
} from "./lib/lifecycleControl";
import {
  buildCreatePlayerPayload,
  buildPlayerFoulCommandPayload,
  buildRosterPlayerDisplayLabel,
  buildRosterPlayerLabel,
  buildRosterReadinessLabel,
  buildScorePlayerOptions,
  createPlayerFormState,
  getRosterPlayersForSide,
  getRosterTeamLabel,
  type CreatePlayerFormState
} from "./lib/rosterControl";
import {
  buildReplayEventGroupOptions,
  buildReplayEventMeta,
  getReplayScoreAfterLabel
} from "./lib/replayControl";
import {
  buildAuditLogFilterOptions,
  buildAuditLogRowMeta,
  getAuditCorrectionRows
} from "./lib/auditLogControl";
import {
  buildAdminTournamentScheduleLink,
  buildPublicTournamentScheduleLink,
  buildScheduleRowMeta,
  buildScheduleStatusFilters,
  getPublicScheduleLinks,
  getScheduleStatusGroup,
  type ScheduleStatusFilter
} from "./lib/scheduleControl";
import { buildSummaryPlayerLabels, getSummaryTeamTotals } from "./lib/summaryControl";
import {
  applyRealtimeProjectionUpdate,
  createPublicProjectionSocket,
  getOperatorPollingIntervalMs,
  getPublicPollingIntervalMs,
  getRealtimeConnectionLabel,
  shouldRefetchAfterRealtimeProjection,
  type RealtimeConnectionState
} from "./lib/realtimeProjectionSync";

type Route =
  | { name: "home" }
  | { name: "login" }
  | { name: "admin" }
  | { name: "admin-matches" }
  | { name: "admin-tournaments" }
  | { name: "admin-tournament-schedule"; tournamentId: string }
  | { name: "admin-officials"; matchId: string }
  | { name: "admin-rosters"; matchId: string }
  | { name: "admin-lineup"; matchId: string }
  | { name: "admin-summary"; matchId: string }
  | { name: "admin-replay"; matchId: string }
  | { name: "admin-audit-log"; matchId: string }
  | { name: "operator-matches" }
  | { name: "operator-score"; matchId: string }
  | { name: "operator-fouls"; matchId: string }
  | { name: "operator-clock"; matchId: string }
  | { name: "operator-timeouts"; matchId: string }
  | { name: "operator-lifecycle"; matchId: string }
  | { name: "operator-summary"; matchId: string }
  | { name: "operator-replay"; matchId: string }
  | { name: "operator-audit-log"; matchId: string }
  | { name: "public-scoreboard"; matchId: string }
  | { name: "public-tournaments" }
  | { name: "public-tournament-schedule"; tournamentId: string }
  | { name: "unauthorized" };

function parseRoute(pathname: string): Route {
  const officialMatch = pathname.match(/^\/admin\/matches\/([^/]+)\/officials$/);
  const matchId = officialMatch?.[1];
  if (matchId) {
    return { name: "admin-officials", matchId: decodeURIComponent(matchId) };
  }
  const adminTournamentScheduleMatch = pathname.match(/^\/admin\/tournaments\/([^/]+)\/schedule$/);
  const adminTournamentId = adminTournamentScheduleMatch?.[1];
  if (adminTournamentId) {
    return { name: "admin-tournament-schedule", tournamentId: decodeURIComponent(adminTournamentId) };
  }
  const rosterMatch = pathname.match(/^\/admin\/matches\/([^/]+)\/rosters$/);
  const rosterMatchId = rosterMatch?.[1];
  if (rosterMatchId) {
    return { name: "admin-rosters", matchId: decodeURIComponent(rosterMatchId) };
  }
  const lineupMatch = pathname.match(/^\/admin\/matches\/([^/]+)\/lineup$/);
  const lineupMatchId = lineupMatch?.[1];
  if (lineupMatchId) {
    return { name: "admin-lineup", matchId: decodeURIComponent(lineupMatchId) };
  }
  const adminSummaryMatch = pathname.match(/^\/admin\/matches\/([^/]+)\/summary$/);
  const adminSummaryMatchId = adminSummaryMatch?.[1];
  if (adminSummaryMatchId) {
    return { name: "admin-summary", matchId: decodeURIComponent(adminSummaryMatchId) };
  }
  const adminReplayMatch = pathname.match(/^\/admin\/matches\/([^/]+)\/replay$/);
  const adminReplayMatchId = adminReplayMatch?.[1];
  if (adminReplayMatchId) {
    return { name: "admin-replay", matchId: decodeURIComponent(adminReplayMatchId) };
  }
  const adminAuditMatch = pathname.match(/^\/admin\/matches\/([^/]+)\/audit-log$/);
  const adminAuditMatchId = adminAuditMatch?.[1];
  if (adminAuditMatchId) {
    return { name: "admin-audit-log", matchId: decodeURIComponent(adminAuditMatchId) };
  }
  const operatorScoreMatch = pathname.match(/^\/operator\/matches\/([^/]+)\/score$/);
  const operatorMatchId = operatorScoreMatch?.[1];
  if (operatorMatchId) {
    return { name: "operator-score", matchId: decodeURIComponent(operatorMatchId) };
  }
  const operatorFoulsMatch = pathname.match(/^\/operator\/matches\/([^/]+)\/fouls$/);
  const operatorFoulsMatchId = operatorFoulsMatch?.[1];
  if (operatorFoulsMatchId) {
    return { name: "operator-fouls", matchId: decodeURIComponent(operatorFoulsMatchId) };
  }
  const operatorClockMatch = pathname.match(/^\/operator\/matches\/([^/]+)\/clock$/);
  const operatorClockMatchId = operatorClockMatch?.[1];
  if (operatorClockMatchId) {
    return { name: "operator-clock", matchId: decodeURIComponent(operatorClockMatchId) };
  }
  const operatorTimeoutsMatch = pathname.match(/^\/operator\/matches\/([^/]+)\/timeouts$/);
  const operatorTimeoutsMatchId = operatorTimeoutsMatch?.[1];
  if (operatorTimeoutsMatchId) {
    return { name: "operator-timeouts", matchId: decodeURIComponent(operatorTimeoutsMatchId) };
  }
  const operatorLifecycleMatch = pathname.match(/^\/operator\/matches\/([^/]+)\/lifecycle$/);
  const operatorLifecycleMatchId = operatorLifecycleMatch?.[1];
  if (operatorLifecycleMatchId) {
    return { name: "operator-lifecycle", matchId: decodeURIComponent(operatorLifecycleMatchId) };
  }
  const operatorSummaryMatch = pathname.match(/^\/operator\/matches\/([^/]+)\/summary$/);
  const operatorSummaryMatchId = operatorSummaryMatch?.[1];
  if (operatorSummaryMatchId) {
    return { name: "operator-summary", matchId: decodeURIComponent(operatorSummaryMatchId) };
  }
  const operatorReplayMatch = pathname.match(/^\/operator\/matches\/([^/]+)\/replay$/);
  const operatorReplayMatchId = operatorReplayMatch?.[1];
  if (operatorReplayMatchId) {
    return { name: "operator-replay", matchId: decodeURIComponent(operatorReplayMatchId) };
  }
  const operatorAuditMatch = pathname.match(/^\/operator\/matches\/([^/]+)\/audit-log$/);
  const operatorAuditMatchId = operatorAuditMatch?.[1];
  if (operatorAuditMatchId) {
    return { name: "operator-audit-log", matchId: decodeURIComponent(operatorAuditMatchId) };
  }
  const publicScoreboardMatch = pathname.match(/^\/public\/scoreboard\/([^/]+)$/);
  const publicMatchId = publicScoreboardMatch?.[1];
  if (publicMatchId) {
    return { name: "public-scoreboard", matchId: decodeURIComponent(publicMatchId) };
  }
  const publicTournamentScheduleMatch = pathname.match(/^\/public\/tournaments\/([^/]+)\/schedule$/);
  const publicTournamentId = publicTournamentScheduleMatch?.[1];
  if (publicTournamentId) {
    return { name: "public-tournament-schedule", tournamentId: decodeURIComponent(publicTournamentId) };
  }
  if (pathname === "/login") return { name: "login" };
  if (pathname === "/admin") return { name: "admin" };
  if (pathname === "/admin/matches") return { name: "admin-matches" };
  if (pathname === "/admin/tournaments") return { name: "admin-tournaments" };
  if (pathname === "/operator/matches") return { name: "operator-matches" };
  if (pathname === "/public/tournaments" || pathname === "/public/schedule") return { name: "public-tournaments" };
  if (pathname === "/unauthorized") return { name: "unauthorized" };
  return { name: "home" };
}

function navigate(to: string) {
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  return route;
}

function useLiveClockNow(enabled: boolean) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return nowMs;
}

function ProtectedRoute({
  children,
  requireAdmin = false,
  requireOperator = false
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireOperator?: boolean;
}) {
  const { currentUser, state } = useCurrentUser();

  useEffect(() => {
    if (state.loading) return;
    const decision = getProtectedRouteDecision(currentUser, requireAdmin ? { requireRole: "ADMIN" } : {});
    if (decision.action === "REDIRECT") {
      navigate(decision.to);
      return;
    }
    if (requireOperator && !canAccessOperatorMatches(currentUser)) {
      navigate("/unauthorized");
    }
  }, [currentUser, requireAdmin, requireOperator, state.loading]);

  if (state.loading) {
    return <StatusPanel title="Loading session" message="Checking current browser session." />;
  }

  const decision = getProtectedRouteDecision(currentUser, requireAdmin ? { requireRole: "ADMIN" } : {});
  if (decision.action !== "ALLOW") {
    return <StatusPanel title="Redirecting" message="Checking access for this page." />;
  }

  if (requireOperator && !canAccessOperatorMatches(currentUser)) {
    return <StatusPanel title="Redirecting" message="Checking operator access for this page." />;
  }

  return <>{children}</>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { currentUser, roleSummary, logout } = useCurrentUser();

  async function onLogout(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    await logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate("/"); }}>
          Basketball Scoreboard
        </a>
        <nav aria-label="Main navigation">
          {currentUser && canManageAssignments(currentUser) ? (
            <a href="/admin" onClick={(event) => { event.preventDefault(); navigate("/admin"); }}>
              Admin
            </a>
          ) : null}
          {currentUser && canManageAssignments(currentUser) ? (
            <a href="/admin/tournaments" onClick={(event) => { event.preventDefault(); navigate("/admin/tournaments"); }}>
              Tournaments
            </a>
          ) : null}
          <a href="/public/tournaments" onClick={(event) => { event.preventDefault(); navigate("/public/tournaments"); }}>
            Public Schedule
          </a>
          {currentUser && canAccessOperatorMatches(currentUser) ? (
            <a href="/operator/matches" onClick={(event) => { event.preventDefault(); navigate("/operator/matches"); }}>
              Operator Matches
            </a>
          ) : null}
          {currentUser ? (
            <a href="/login" onClick={onLogout}>
              Logout
            </a>
          ) : (
            <a href="/login" onClick={(event) => { event.preventDefault(); navigate("/login"); }}>
              Login
            </a>
          )}
        </nav>
        <div className="user-summary">
          {currentUser ? (
            <>
              <strong>{currentUser.displayName ?? currentUser.email ?? currentUser.userId}</strong>
              <span>{roleSummary}</span>
            </>
          ) : (
            <span>Not signed in</span>
          )}
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}

function LoginPage() {
  const { currentUser, login, state } = useCurrentUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (currentUser) {
      navigate("/admin");
    }
  }, [currentUser]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await login({ email, password });
  }

  return (
    <section className="panel narrow">
      <h1>Login</h1>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Email
          <input autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {state.error ? <ErrorMessage code={state.error.reasonCode} message={state.error.message} /> : null}
        <button type="submit" disabled={state.loading}>
          {state.loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </section>
  );
}

function AdminHome() {
  const [matchId, setMatchId] = useState("");

  function openMatch(event: FormEvent) {
    event.preventDefault();
    if (matchId.trim()) {
      navigate(`/admin/matches/${encodeURIComponent(matchId.trim())}/officials`);
    }
  }

  return (
    <section className="panel">
      <h1>Admin</h1>
      <p>Manage match official assignments through the production API.</p>
      <p>
        <a href="/admin/matches" onClick={(event) => { event.preventDefault(); navigate("/admin/matches"); }}>
          Browse matches
        </a>
      </p>
      <p>
        <a href="/admin/tournaments" onClick={(event) => { event.preventDefault(); navigate("/admin/tournaments"); }}>
          Browse tournaments
        </a>
      </p>
      <form className="inline-form" onSubmit={openMatch}>
        <label>
          Match ID
          <input value={matchId} onChange={(event) => setMatchId(event.target.value)} />
        </label>
        <button type="submit">Open officials</button>
      </form>
    </section>
  );
}

function AdminMatchesPage() {
  const { api, currentUser } = useCurrentUser();
  const [matches, setMatches] = useState<OperatorMatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const isAdmin = canManageAssignments(currentUser);

  async function loadMatches(options: { clearMessage?: boolean } = {}) {
    setLoading(true);
    if (options.clearMessage ?? true) {
      setMessage(null);
    }
    try {
      setMatches(await api.getAdminMatches());
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMatches();
  }, [api]);

  async function createDemoMatch() {
    if (!isAdmin) return;
    setCreatingDemo(true);
    setMessage(null);
    try {
      const result = await api.createSmokeMatch();
      setMessage({
        tone: "success",
        text: result.created ? "Demo match created." : "Demo match reused."
      });
      await loadMatches({ clearMessage: false });
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setCreatingDemo(false);
    }
  }

  return (
    <section className="panel">
      <h1>Admin Matches</h1>
      <p className="muted">Browse matches, assign officials, open score control, or launch the public scoreboard.</p>
      {isAdmin ? (
        <div className="button-row">
          <button type="button" disabled={creatingDemo} onClick={() => void createDemoMatch()}>
            {creatingDemo ? "Creating demo match..." : "Create demo match"}
          </button>
        </div>
      ) : null}
      {message ? <Notice {...message} /> : null}
      {loading ? <p>Loading matches...</p> : null}
      {!loading && matches.length === 0 ? <p className="muted">No matches found.</p> : null}
      {matches.length > 0 ? <MatchTable matches={matches} mode="admin" /> : null}
    </section>
  );
}

function AdminTournamentsPage() {
  const { api } = useCurrentUser();
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  async function loadTournaments() {
    setLoading(true);
    setMessage(null);
    try {
      setTournaments(await api.getTournaments());
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTournaments();
  }, [api]);

  return (
    <section className="panel">
      <h1>Tournaments</h1>
      <p className="muted">Review tournament schedules using existing match setup and projection state.</p>
      {message ? <Notice {...message} /> : null}
      {loading ? <p>Loading tournaments...</p> : null}
      {!loading && tournaments.length === 0 ? <p className="muted">No tournaments found.</p> : null}
      {tournaments.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tournament</th>
                <th>Status</th>
                <th>Matches</th>
                <th>Live</th>
                <th>Finished</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((tournament) => {
                const scheduleHref = buildAdminTournamentScheduleLink(tournament.tournamentId);
                return (
                  <tr key={tournament.tournamentId}>
                    <td>{tournament.name}</td>
                    <td>{tournament.status}</td>
                    <td>{tournament.matchCount}</td>
                    <td>{tournament.liveMatchCount}</td>
                    <td>{tournament.finishedMatchCount}</td>
                    <td>
                      <a
                        href={scheduleHref}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate(scheduleHref);
                        }}
                      >
                        Open Schedule
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function AdminTournamentSchedulePage({ tournamentId }: { tournamentId: string }) {
  const { api } = useCurrentUser();
  const [schedule, setSchedule] = useState<TournamentScheduleResponse | null>(null);
  const [filter, setFilter] = useState<ScheduleStatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  async function loadSchedule() {
    setLoading(true);
    setMessage(null);
    try {
      setSchedule(await api.getTournamentSchedule(tournamentId));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSchedule();
  }, [api, tournamentId]);

  const matches = filterScheduleMatches(schedule?.matches ?? [], filter);

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <h1>Tournament Schedule</h1>
          <p className="muted">{schedule ? schedule.tournament.name : `Tournament ID: ${tournamentId}`}</p>
        </div>
        <div className="button-row">
          <a className="button-link secondary" href="/admin/tournaments" onClick={(event) => { event.preventDefault(); navigate("/admin/tournaments"); }}>
            Back
          </a>
          <button type="button" onClick={() => void loadSchedule()}>Refresh</button>
        </div>
      </div>
      {message ? <Notice {...message} /> : null}
      {schedule ? <TournamentSummaryStrip tournament={schedule.tournament} /> : null}
      <ScheduleFilterBar value={filter} onChange={setFilter} />
      {loading ? <p>Loading schedule...</p> : null}
      {!loading && matches.length === 0 ? <p className="muted">No matches for this filter.</p> : null}
      {matches.length > 0 ? <ScheduleTable matches={matches} mode="admin" /> : null}
    </section>
  );
}

function PublicTournamentsPage() {
  const { api } = useCurrentUser();
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage(null);
      try {
        setTournaments(await api.getPublicTournaments());
      } catch (error) {
        setMessage(toUiMessage(error));
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [api]);

  return (
    <section className="panel">
      <h1>Public Schedule</h1>
      <p className="muted">Read-only tournament schedule.</p>
      {message ? <Notice {...message} /> : null}
      {loading ? <p>Loading tournaments...</p> : null}
      {!loading && tournaments.length === 0 ? <p className="muted">No public tournaments found.</p> : null}
      <div className="match-grid">
        {tournaments.map((tournament) => {
          const href = buildPublicTournamentScheduleLink(tournament.tournamentId);
          return (
            <article className="match-card" key={tournament.tournamentId}>
              <h2>{tournament.name}</h2>
              <dl>
                <div><dt>Status</dt><dd>{tournament.status}</dd></div>
                <div><dt>Matches</dt><dd>{tournament.matchCount}</dd></div>
                <div><dt>Live</dt><dd>{tournament.liveMatchCount}</dd></div>
                <div><dt>Finished</dt><dd>{tournament.finishedMatchCount}</dd></div>
              </dl>
              <a className="button-link" href={href} onClick={(event) => { event.preventDefault(); navigate(href); }}>
                Open Schedule
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PublicTournamentSchedulePage({ tournamentId }: { tournamentId: string }) {
  const { api } = useCurrentUser();
  const [schedule, setSchedule] = useState<TournamentScheduleResponse | null>(null);
  const [filter, setFilter] = useState<ScheduleStatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  async function loadSchedule() {
    setLoading(true);
    setMessage(null);
    try {
      setSchedule(await api.getPublicTournamentSchedule(tournamentId));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSchedule();
  }, [api, tournamentId]);

  const matches = filterScheduleMatches(schedule?.matches ?? [], filter);

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <h1>Public Schedule</h1>
          <p className="muted">{schedule ? schedule.tournament.name : `Tournament ID: ${tournamentId}`}</p>
        </div>
        <button type="button" onClick={() => void loadSchedule()}>Refresh</button>
      </div>
      {message ? <Notice {...message} /> : null}
      <ScheduleFilterBar value={filter} onChange={setFilter} />
      {loading ? <p>Loading public schedule...</p> : null}
      {!loading && matches.length === 0 ? <p className="muted">No matches for this filter.</p> : null}
      {matches.length > 0 ? <ScheduleTable matches={matches} mode="public" /> : null}
    </section>
  );
}

function OperatorMatchesPage() {
  const { api } = useCurrentUser();
  const [matches, setMatches] = useState<OperatorMatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage(null);
      try {
        setMatches(await api.getOperatorMatches());
      } catch (error) {
        setMessage(toUiMessage(error));
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [api]);

  return (
    <section className="stack">
      <div className="panel">
        <h1>Operator Matches</h1>
        <p className="muted">Only active match assignments returned by the backend are shown here.</p>
        {message ? <Notice {...message} /> : null}
      </div>
      {loading ? <section className="panel"><p>Loading assigned matches...</p></section> : null}
      {!loading && matches.length === 0 ? (
        <section className="panel"><p className="muted">{createEmptyOperatorMatchesMessage()}</p></section>
      ) : null}
      {!loading && matches.length > 0 ? (
        <section className="match-grid">
          {matches.map((match) => {
            const card = buildOperatorMatchCard(match);
            return (
              <article className="match-card" key={match.matchId}>
                <h2>{card.title}</h2>
                <dl>
                  <div><dt>Status</dt><dd>{card.statusLabel}</dd></div>
                  <div><dt>Scheduled</dt><dd>{card.scheduledLabel}</dd></div>
                  <div><dt>Venue</dt><dd>{card.venueLabel}</dd></div>
                  <div><dt>Roles</dt><dd>{card.assignedRolesLabel}</dd></div>
                  <div><dt>Current Seq</dt><dd>{card.currentSeqLabel}</dd></div>
                </dl>
                <div className="button-row">
                  <a
                    className="button-link"
                    href={card.scoreControl.href}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(card.scoreControl.href);
                    }}
                  >
                    {card.scoreControl.label}
                  </a>
                  <a
                    className="button-link"
                    href={card.foulControl.href}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(card.foulControl.href);
                    }}
                  >
                    {card.foulControl.label}
                  </a>
                  <a
                    className="button-link"
                    href={card.clockControl.href}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(card.clockControl.href);
                    }}
                  >
                    {card.clockControl.label}
                  </a>
                  <a
                    className="button-link"
                    href={card.timeoutControl.href}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(card.timeoutControl.href);
                    }}
                  >
                    {card.timeoutControl.label}
                  </a>
                  <a
                    className="button-link"
                    href={card.lifecycleControl.href}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(card.lifecycleControl.href);
                    }}
                  >
                    {card.lifecycleControl.label}
                  </a>
                  <a
                    className="button-link"
                    href={card.summary.href}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(card.summary.href);
                    }}
                  >
                    {card.summary.label}
                  </a>
                  <a
                    className="button-link"
                    href={card.replay.href}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(card.replay.href);
                    }}
                  >
                    {card.replay.label}
                  </a>
                  <a
                    className="button-link secondary"
                    href={card.publicScoreboard.href}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(card.publicScoreboard.href);
                    }}
                  >
                    {card.publicScoreboard.label}
                  </a>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </section>
  );
}

function usePublicProjectionRealtime(
  matchId: string,
  projection: ScoreboardProjection | null,
  setProjection: React.Dispatch<React.SetStateAction<ScoreboardProjection | null>>,
  onProjectionReceived?: () => void,
  onSequenceGap?: () => void | Promise<void>
) {
  const [realtimeState, setRealtimeState] = useState<RealtimeConnectionState>("POLLING_FALLBACK");
  const projectionSeqRef = useRef(0);
  const projectionRef = useRef<ScoreboardProjection | null>(null);
  const onProjectionReceivedRef = useRef(onProjectionReceived);
  const onSequenceGapRef = useRef(onSequenceGap);
  const fallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    projectionRef.current = projection;
    projectionSeqRef.current = projection?.lastEventSeq ?? projection?.currentSeq ?? 0;
  }, [projection]);

  useEffect(() => {
    onProjectionReceivedRef.current = onProjectionReceived;
  }, [onProjectionReceived]);

  useEffect(() => {
    onSequenceGapRef.current = onSequenceGap;
  }, [onSequenceGap]);

  useEffect(() => {
    const socket = createPublicProjectionSocket(getDefaultApiBaseUrl());

    const clearFallbackTimer = () => {
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };

    const schedulePollingFallback = () => {
      clearFallbackTimer();
      fallbackTimerRef.current = window.setTimeout(() => {
        setRealtimeState("POLLING_FALLBACK");
      }, 1500);
    };

    const joinPublicRoom = () => {
      clearFallbackTimer();
      setRealtimeState("CONNECTED");
      socket.emit("match:join", {
        matchId,
        lastSeq: projectionSeqRef.current,
        view: "PUBLIC_SCOREBOARD"
      });
    };

    const applyProjection = (next: ScoreboardProjection) => {
      if (shouldRefetchAfterRealtimeProjection(projectionRef.current, next)) {
        void onSequenceGapRef.current?.();
        return;
      }

      const incomingSeq = next.lastEventSeq ?? next.currentSeq;
      if (projectionRef.current && incomingSeq < projectionSeqRef.current) {
        return;
      }

      setProjection((current) => applyRealtimeProjectionUpdate(current, next));
      onProjectionReceivedRef.current?.();
    };

    socket.on("connect", joinPublicRoom);
    socket.on("disconnect", () => {
      setRealtimeState("RECONNECTING");
      schedulePollingFallback();
    });
    socket.on("connect_error", () => {
      setRealtimeState("UNAVAILABLE");
      schedulePollingFallback();
    });
    socket.io.on("reconnect_attempt", () => {
      setRealtimeState("RECONNECTING");
      schedulePollingFallback();
    });
    socket.on("match:snapshot", (payload) => {
      if (payload.matchId === matchId) {
        applyProjection(payload.publicScoreboard);
      }
    });
    socket.on("projection.updated", (payload) => {
      if (payload.matchId === matchId) {
        applyProjection(payload.publicScoreboard);
      }
    });
    socket.on("match:error", () => {
      setRealtimeState("UNAVAILABLE");
      schedulePollingFallback();
    });

    return () => {
      clearFallbackTimer();
      socket.close();
    };
  }, [matchId, setProjection]);

  return realtimeState;
}

function OperatorScorePage({ matchId }: { matchId: string }) {
  const { api, currentUser } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [rosters, setRosters] = useState<MatchRostersResponse | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<Record<ScoreControlTeamSide, string>>({ HOME: "", AWAY: "" });
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const canSubmitScore = canOperateScore(currentUser);
  const realtimeState = usePublicProjectionRealtime(matchId, projection, setProjection, undefined, refreshProjectionSilently);

  async function loadState() {
    setLoading(true);
    setMessage(null);
    try {
      const [nextProjection, nextRosters] = await Promise.all([
        api.getMatchProjection(matchId),
        api.getMatchRosters(matchId).catch(() => null)
      ]);
      setProjection(nextProjection);
      setRosters(nextRosters);
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadState();
  }, [matchId]);

  async function refreshProjectionSilently() {
    try {
      setProjection(await api.getMatchProjection(matchId));
    } catch (error) {
      setMessage(toUiMessage(error));
    }
  }

  useEffect(() => {
    const timer = window.setInterval(
      () => void refreshProjectionSilently(),
      getOperatorPollingIntervalMs(realtimeState)
    );
    return () => window.clearInterval(timer);
  }, [api, matchId, realtimeState]);

  async function refreshAfterCommand(lastSeq: number) {
    const sync = await api.syncMatch(matchId, lastSeq);
    if (sync.projection) {
      setProjection(sync.projection);
      return;
    }
    setProjection(await api.getMatchProjection(matchId));
  }

  async function addScore(teamSide: ScoreControlTeamSide, points: ScoreControlPoint) {
    if (!projection || !canUseLiveMatchControls(projection, canSubmitScore, Boolean(pendingKey))) return;
    const key = `${teamSide}-${points}`;
    setPendingKey(key);
    setMessage(null);
    const previousSeq = projection.currentSeq;

    try {
      const payload = buildScoreCommandPayload(projection, teamSide, points);
      const playerId = selectedPlayers[teamSide] || null;
      const result = await api.addScore(matchId, {
        ...payload,
        payload: {
          ...payload.payload,
          playerId
        }
      });

      if (result.status === "SYNC_REQUIRED" || result.reasonCode === "INVALID_EXPECTED_SEQ") {
        setMessage(getScoreControlFeedback(result));
        await refreshAfterCommand(previousSeq);
        return;
      }

      const responseProjection = getAcceptedScoreProjection(result);
      if (responseProjection) {
        setProjection(responseProjection);
      } else {
        await refreshAfterCommand(previousSeq);
      }
      setMessage(getScoreControlFeedback(result));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section className="stack">
      <div className="panel">
        <h1>Score Control</h1>
        <p className="muted">Match ID: {matchId}</p>
        {!canSubmitScore ? <ErrorMessage code="FORBIDDEN" message="Score operation permission is required." /> : null}
        {pendingKey ? <Notice tone="success" text="Saving..." /> : null}
        {message ? <Notice {...message} /> : null}
      </div>
      {loading ? <section className="panel"><p>Loading match state...</p></section> : null}
      {!loading && !projection ? (
        <section className="panel"><p className="muted">No scoreboard projection found for this match.</p></section>
      ) : null}
      {projection ? (
        <section className="panel score-control">
          {isFinishedMatchStatus(projection.status) ? (
            <Notice tone="error" text={finishedMatchLiveControlWarning} />
          ) : null}
          <div className="score-display" aria-label="Current score">
            {buildScoreControlPanels(projection).map((panel) => (
              <div key={panel.teamSide}>
                <span>{panel.label}</span>
                <strong>{panel.score}</strong>
                <small>{panel.teamName}</small>
                <small>Fouls {projection.teamFouls?.[panel.teamSide === "HOME" ? "home" : "away"] ?? 0}</small>
              </div>
            ))}
          </div>
          <dl className="state-strip">
            <div><dt>Status</dt><dd>{projection.status}</dd></div>
            <div><dt>Period</dt><dd>{projection.periodNumber}</dd></div>
            <div><dt>Seq</dt><dd>{projection.currentSeq}</dd></div>
            <div><dt>Expected Seq</dt><dd>{projection.currentSeq}</dd></div>
            <div><dt>Sync</dt><dd>{getRealtimeConnectionLabel(realtimeState)}</dd></div>
          </dl>
          <div className="score-actions">
            {buildScoreControlPanels(projection).map((panel) => (
              <div key={panel.teamSide}>
                <h2>{panel.teamName}</h2>
                <label>
                  Player
                  <select
                    value={selectedPlayers[panel.teamSide]}
                    onChange={(event) =>
                      setSelectedPlayers({ ...selectedPlayers, [panel.teamSide]: event.target.value })
                    }
                  >
                    <option value="">No player attribution</option>
                    {buildScorePlayerOptions(rosters, panel.teamSide).map((player) => (
                      <option key={player.playerId} value={player.playerId}>
                        {player.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="button-row">
                  {panel.buttons.map((button) => {
                    return (
                      <button
                        key={button.pendingKey}
                        type="button"
                        className="score-button"
                        disabled={!canUseLiveMatchControls(projection, canSubmitScore, Boolean(pendingKey))}
                        onClick={() => void addScore(panel.teamSide, button.points)}
                      >
                        {getScoreControlPendingLabel(button.pendingKey, pendingKey)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="button-row">
            {Object.values(getScoreControlLinks(matchId, currentUser))
              .filter((link): link is { href: string; label: string } => Boolean(link))
              .map((link) => (
                <a
                  key={link.href}
                  className="button-link secondary"
                  href={link.href}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(link.href);
                  }}
                >
                  {link.label}
                </a>
              ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function OperatorFoulPage({ matchId }: { matchId: string }) {
  const { api, currentUser } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [rosters, setRosters] = useState<MatchRostersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [foulType, setFoulType] = useState<FoulType>("PERSONAL");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const canSubmitFoul = canOperateScore(currentUser);
  const realtimeState = usePublicProjectionRealtime(matchId, projection, setProjection, undefined, refreshProjectionSilently);

  async function loadState() {
    setLoading(true);
    setMessage(null);
    try {
      const [nextProjection, nextRosters] = await Promise.all([
        api.getMatchProjection(matchId),
        api.getMatchRosters(matchId).catch(() => null)
      ]);
      setProjection(nextProjection);
      setRosters(nextRosters);
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadState();
  }, [matchId]);

  async function refreshProjectionSilently() {
    try {
      setProjection(await api.getMatchProjection(matchId));
    } catch (error) {
      setMessage(toUiMessage(error));
    }
  }

  useEffect(() => {
    const timer = window.setInterval(
      () => void refreshProjectionSilently(),
      getOperatorPollingIntervalMs(realtimeState)
    );
    return () => window.clearInterval(timer);
  }, [api, matchId, realtimeState]);

  async function refreshAfterCommand(lastSeq: number) {
    const sync = await api.syncMatch(matchId, lastSeq);
    if (sync.projection) {
      setProjection(sync.projection);
      return;
    }
    setProjection(await api.getMatchProjection(matchId));
  }

  async function addTeamFoul(teamSide: FoulControlTeamSide) {
    if (!projection || !canUseLiveMatchControls(projection, canSubmitFoul, Boolean(pendingKey))) return;
    const key = `TEAM-${teamSide}`;
    setPendingKey(key);
    setMessage(null);
    const previousSeq = projection.currentSeq;

    try {
      const result = await api.addTeamFoul(
        matchId,
        buildTeamFoulCommandPayload(projection, teamSide, { foulType, reason })
      );

      if (result.status === "SYNC_REQUIRED" || result.reasonCode === "INVALID_EXPECTED_SEQ") {
        setMessage(getFoulControlFeedback(result));
        await refreshAfterCommand(previousSeq);
        return;
      }

      await refreshAfterCommand(previousSeq);
      setMessage(getFoulControlFeedback(result));
      setReason("");
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setPendingKey(null);
    }
  }

  async function addPlayerFoul(player: MatchRosterPlayer) {
    if (!projection || !canUseLiveMatchControls(projection, canSubmitFoul, Boolean(pendingKey))) return;
    const key = `PLAYER-${player.playerId}`;
    setPendingKey(key);
    setMessage(null);
    const previousSeq = projection.currentSeq;

    try {
      const result = await api.addPlayerFoul(
        matchId,
        buildPlayerFoulCommandPayload(projection, player, { foulType, reason })
      );

      if (result.status === "SYNC_REQUIRED" || result.reasonCode === "INVALID_EXPECTED_SEQ") {
        setMessage(getFoulControlFeedback(result));
        await refreshAfterCommand(previousSeq);
        return;
      }

      await refreshAfterCommand(previousSeq);
      setMessage(getFoulControlFeedback(result));
      setReason("");
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section className="stack">
      <div className="panel">
        <h1>Foul Control</h1>
        <p className="muted">Match ID: {matchId}</p>
        {!canSubmitFoul ? <ErrorMessage code="FORBIDDEN" message="Foul operation permission is required." /> : null}
        {pendingKey ? <Notice tone="success" text="Saving..." /> : null}
        {message ? <Notice {...message} /> : null}
      </div>
      {loading ? <section className="panel"><p>Loading match state...</p></section> : null}
      {!loading && !projection ? (
        <section className="panel"><p className="muted">No scoreboard projection found for this match.</p></section>
      ) : null}
      {projection ? (
        <section className="panel score-control">
          {isFinishedMatchStatus(projection.status) ? (
            <Notice tone="error" text={finishedMatchLiveControlWarning} />
          ) : null}
          <dl className="state-strip">
            <div><dt>Status</dt><dd>{projection.status}</dd></div>
            <div><dt>Period</dt><dd>{projection.periodNumber}</dd></div>
            <div><dt>Seq</dt><dd>{projection.currentSeq}</dd></div>
            <div><dt>Expected Seq</dt><dd>{projection.currentSeq}</dd></div>
            <div><dt>Sync</dt><dd>{getRealtimeConnectionLabel(realtimeState)}</dd></div>
          </dl>
          <div className="form-grid compact">
            <label>
              Foul type
              <select value={foulType} onChange={(event) => setFoulType(event.target.value as FoulType)}>
                {foulTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <input value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
          </div>
          <div className="score-actions">
            {buildFoulControlPanels(projection).map((panel) => (
              <div key={panel.teamSide}>
                <h2>{panel.teamName}</h2>
                <div className="foul-count">
                  <span>{panel.label} team fouls</span>
                  <strong>{panel.fouls}</strong>
                </div>
                <button
                  type="button"
                  className="score-button"
                  disabled={!canUseLiveMatchControls(projection, canSubmitFoul, Boolean(pendingKey))}
                  onClick={() => void addTeamFoul(panel.teamSide)}
                >
                  {pendingKey === panel.pendingKey ? "Saving..." : "Add Team Foul"}
                </button>
              </div>
            ))}
          </div>
          <section className="inline-panel">
            <h2>Player Fouls</h2>
            {!rosters || (rosters.rosters.HOME.length === 0 && rosters.rosters.AWAY.length === 0) ? (
              <p className="muted">No roster players found. Team foul control is available.</p>
            ) : (
              <div className="score-actions">
                {(["HOME", "AWAY"] as const).map((teamSide) => (
                  <div key={teamSide}>
                    <h3>{getRosterTeamLabel(projection, teamSide)}</h3>
                    {getRosterPlayersForSide(rosters, teamSide).length === 0 ? (
                      <p className="muted">No players assigned.</p>
                    ) : null}
                    {getRosterPlayersForSide(rosters, teamSide).map((player) => (
                      <button
                        key={player.playerId}
                        type="button"
                        className="score-button"
                        disabled={
                          !canUseLiveMatchControls(projection, canSubmitFoul, Boolean(pendingKey)) ||
                          player.status === "INACTIVE"
                        }
                        onClick={() => void addPlayerFoul(player)}
                      >
                        {pendingKey === `PLAYER-${player.playerId}`
                          ? "Saving..."
                          : `Add foul ${buildRosterPlayerDisplayLabel(player)}`}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
          <div className="button-row">
            {Object.values(getFoulControlLinks(matchId)).map((link) => (
              <a
                key={link.href}
                className="button-link secondary"
                href={link.href}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(link.href);
                }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function OperatorClockPage({ matchId }: { matchId: string }) {
  const { api, currentUser } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [projectionReceivedAtMs, setProjectionReceivedAtMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [gameMinutes, setGameMinutes] = useState(10);
  const [gameSeconds, setGameSeconds] = useState(0);
  const [shotSeconds, setShotSeconds] = useState(24);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const canSubmitClock = canOperateScore(currentUser);
  const nowMs = useLiveClockNow(Boolean(projection?.gameClock?.running || projection?.shotClock?.running));
  const realtimeState = usePublicProjectionRealtime(matchId, projection, setProjection, () => {
    setProjectionReceivedAtMs(Date.now());
  }, refreshProjectionSilently);

  async function loadState() {
    setLoading(true);
    setMessage(null);
    try {
      const nextProjection = await api.getMatchProjection(matchId);
      setProjection(nextProjection);
      setProjectionReceivedAtMs(Date.now());
      setGameMinutes(Math.floor(nextProjection.gameClockRemainingMs / 60000));
      setGameSeconds(Math.floor((nextProjection.gameClockRemainingMs % 60000) / 1000));
      setShotSeconds(Math.ceil((nextProjection.shotClockRemainingMs ?? 24000) / 1000));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadState();
  }, [matchId]);

  async function refreshProjectionSilently() {
    try {
      const nextProjection = await api.getMatchProjection(matchId);
      setProjection(nextProjection);
      setProjectionReceivedAtMs(Date.now());
    } catch (error) {
      setMessage(toUiMessage(error));
    }
  }

  useEffect(() => {
    const timer = window.setInterval(
      () => void refreshProjectionSilently(),
      getOperatorPollingIntervalMs(realtimeState)
    );
    return () => window.clearInterval(timer);
  }, [api, matchId, realtimeState]);

  async function refreshAfterCommand(lastSeq: number) {
    const sync = await api.syncMatch(matchId, lastSeq);
    const nextProjection = sync.projection ?? await api.getMatchProjection(matchId);
    setProjection(nextProjection);
    setProjectionReceivedAtMs(Date.now());
    setGameMinutes(Math.floor(nextProjection.gameClockRemainingMs / 60000));
    setGameSeconds(Math.floor((nextProjection.gameClockRemainingMs % 60000) / 1000));
    setShotSeconds(Math.ceil((nextProjection.shotClockRemainingMs ?? 24000) / 1000));
  }

  async function runClockCommand(key: string, command: () => Promise<CommandResult>) {
    if (!projection || !canSubmitClock) return;
    setPendingKey(key);
    setMessage(null);
    const previousSeq = projection.currentSeq;

    try {
      const result = await command();
      if (result.status === "SYNC_REQUIRED" || result.reasonCode === "INVALID_EXPECTED_SEQ") {
        setMessage(getClockControlFeedback(result));
        await refreshAfterCommand(previousSeq);
        return;
      }

      await refreshAfterCommand(previousSeq);
      setMessage(getClockControlFeedback(result));
      setReason("");
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setPendingKey(null);
    }
  }

  const clockState = projection ? buildClockControlState(projection, { nowMs, receivedAtMs: projectionReceivedAtMs }) : null;

  return (
    <section className="stack">
      <div className="panel">
        <h1>Clock Control</h1>
        <p className="muted">Match ID: {matchId}</p>
        {!canSubmitClock ? <ErrorMessage code="FORBIDDEN" message="Clock operation permission is required." /> : null}
        {pendingKey ? <Notice tone="success" text="Saving..." /> : null}
        {message ? <Notice {...message} /> : null}
      </div>
      {loading ? <section className="panel"><p>Loading match state...</p></section> : null}
      {!loading && !projection ? (
        <section className="panel"><p className="muted">No scoreboard projection found for this match.</p></section>
      ) : null}
      {projection && clockState ? (
        <section className="panel score-control">
          <div className="clock-display" aria-label="Clock state">
            <div>
              <span>Game Clock</span>
              <strong>{clockState.gameClockLabel}</strong>
              <small>{clockState.gameClockRunning ? "Running" : "Stopped"}</small>
            </div>
            <div>
              <span>Shot Clock</span>
              <strong>{clockState.shotClockLabel}</strong>
              <small>{clockState.shotClockRunning ? "Running" : "Stopped"}</small>
            </div>
          </div>
          <dl className="state-strip">
            <div><dt>Status</dt><dd>{projection.status}</dd></div>
            <div><dt>Period</dt><dd>{projection.periodNumber}</dd></div>
            <div><dt>Seq</dt><dd>{projection.currentSeq}</dd></div>
            <div><dt>Expected Seq</dt><dd>{clockState.expectedSeq}</dd></div>
            <div><dt>Sync</dt><dd>{getRealtimeConnectionLabel(realtimeState)}</dd></div>
          </dl>
          <div className="button-row">
            <button
              type="button"
              className="score-button"
              disabled={!canSubmitClock || Boolean(pendingKey)}
              onClick={() => void runClockCommand("game-start", () =>
                api.startGameClock(matchId, { expectedSeq: projection.currentSeq })
              )}
            >
              Start Game Clock
            </button>
            <button
              type="button"
              className="score-button"
              disabled={!canSubmitClock || Boolean(pendingKey)}
              onClick={() => void runClockCommand("game-stop", () =>
                api.stopGameClock(matchId, { expectedSeq: projection.currentSeq })
              )}
            >
              Stop Game Clock
            </button>
            <button
              type="button"
              className="score-button"
              disabled={!canSubmitClock || Boolean(pendingKey)}
              onClick={() => void runClockCommand("shot-24", () =>
                api.resetShotClock(matchId, buildShotClockResetPayload(projection, 24000, reason))
              )}
            >
              Reset Shot 24
            </button>
            <button
              type="button"
              className="score-button"
              disabled={!canSubmitClock || Boolean(pendingKey)}
              onClick={() => void runClockCommand("shot-14", () =>
                api.resetShotClock(matchId, buildShotClockResetPayload(projection, 14000, reason))
              )}
            >
              Reset Shot 14
            </button>
          </div>
          <div className="form-grid compact">
            <label>
              Game minutes
              <input
                type="number"
                min="0"
                max="10"
                value={gameMinutes}
                onChange={(event) => setGameMinutes(Number(event.target.value))}
              />
            </label>
            <label>
              Game seconds
              <input
                type="number"
                min="0"
                max="59"
                value={gameSeconds}
                onChange={(event) => setGameSeconds(Number(event.target.value))}
              />
            </label>
            <label>
              Shot seconds
              <input
                type="number"
                min="0"
                max="24"
                value={shotSeconds}
                onChange={(event) => setShotSeconds(Number(event.target.value))}
              />
            </label>
            <label>
              Reason
              <input value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
          </div>
          <div className="button-row">
            <button
              type="button"
              disabled={!canSubmitClock || Boolean(pendingKey)}
              onClick={() => void runClockCommand("game-set", () =>
                api.setGameClock(matchId, buildGameClockSetPayload(projection, {
                  minutes: gameMinutes,
                  seconds: gameSeconds,
                  reason
                }))
              )}
            >
              Set Game Clock
            </button>
            <button
              type="button"
              disabled={!canSubmitClock || Boolean(pendingKey)}
              onClick={() => void runClockCommand("shot-set", () =>
                api.setShotClock(matchId, buildShotClockSetPayload(projection, { seconds: shotSeconds, reason }))
              )}
            >
              Set Shot Clock
            </button>
          </div>
          <div className="button-row">
            {Object.values(getClockControlLinks(matchId)).map((link) => (
              <a
                key={link.href}
                className="button-link secondary"
                href={link.href}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(link.href);
                }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function OperatorTimeoutPage({ matchId }: { matchId: string }) {
  const { api, currentUser } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [requestedBy, setRequestedBy] = useState<TimeoutRequestedBy>("HEAD_COACH");
  const [durationSeconds, setDurationSeconds] = useState(60);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const canSubmitTimeout = canOperateScore(currentUser);
  const realtimeState = usePublicProjectionRealtime(matchId, projection, setProjection, undefined, refreshProjectionSilently);

  async function loadState() {
    setLoading(true);
    setMessage(null);
    try {
      setProjection(await api.getMatchProjection(matchId));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadState();
  }, [matchId]);

  async function refreshProjectionSilently() {
    try {
      setProjection(await api.getMatchProjection(matchId));
    } catch (error) {
      setMessage(toUiMessage(error));
    }
  }

  useEffect(() => {
    const timer = window.setInterval(
      () => void refreshProjectionSilently(),
      getOperatorPollingIntervalMs(realtimeState)
    );
    return () => window.clearInterval(timer);
  }, [api, matchId, realtimeState]);

  async function refreshAfterCommand(lastSeq: number) {
    const sync = await api.syncMatch(matchId, lastSeq);
    setProjection(sync.projection ?? await api.getMatchProjection(matchId));
  }

  async function grantTimeout(teamSide: TimeoutControlTeamSide) {
    if (!projection || !canSubmitTimeout) return;
    const key = `grant-${teamSide}`;
    setPendingKey(key);
    setMessage(null);
    const previousSeq = projection.currentSeq;

    try {
      const result = await api.grantTimeout(
        matchId,
        buildTimeoutGrantPayload(projection, teamSide, requestedBy, durationSeconds * 1000, reason)
      );

      if (result.status === "SYNC_REQUIRED" || result.reasonCode === "INVALID_EXPECTED_SEQ") {
        setMessage(getTimeoutControlFeedback(result));
        await refreshAfterCommand(previousSeq);
        return;
      }

      await refreshAfterCommand(previousSeq);
      setMessage(getTimeoutControlFeedback(result));
      setReason("");
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setPendingKey(null);
    }
  }

  async function endTimeout() {
    if (!projection || !canSubmitTimeout || !projection.activeTimeout) return;
    setPendingKey("end");
    setMessage(null);
    const previousSeq = projection.currentSeq;

    try {
      const result = await api.endTimeout(matchId, buildTimeoutEndPayload(projection, reason));
      if (result.status === "SYNC_REQUIRED" || result.reasonCode === "INVALID_EXPECTED_SEQ") {
        setMessage(getTimeoutControlFeedback(result));
        await refreshAfterCommand(previousSeq);
        return;
      }

      await refreshAfterCommand(previousSeq);
      setMessage(getTimeoutControlFeedback(result));
      setReason("");
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section className="stack">
      <div className="panel">
        <h1>Timeout Control</h1>
        <p className="muted">Match ID: {matchId}</p>
        {!canSubmitTimeout ? <ErrorMessage code="FORBIDDEN" message="Timeout operation permission is required." /> : null}
        {pendingKey ? <Notice tone="success" text="Saving..." /> : null}
        {message ? <Notice {...message} /> : null}
      </div>
      {loading ? <section className="panel"><p>Loading match state...</p></section> : null}
      {!loading && !projection ? (
        <section className="panel"><p className="muted">No scoreboard projection found for this match.</p></section>
      ) : null}
      {projection ? (
        <section className="panel score-control">
          <dl className="state-strip">
            <div><dt>Status</dt><dd>{projection.status}</dd></div>
            <div><dt>Period</dt><dd>{projection.periodNumber}</dd></div>
            <div><dt>Seq</dt><dd>{projection.currentSeq}</dd></div>
            <div><dt>Expected Seq</dt><dd>{projection.currentSeq}</dd></div>
            <div><dt>Sync</dt><dd>{getRealtimeConnectionLabel(realtimeState)}</dd></div>
          </dl>
          <div className="form-grid compact">
            <label>
              Requested by
              <select value={requestedBy} onChange={(event) => setRequestedBy(event.target.value as TimeoutRequestedBy)}>
                {timeoutRequestedByOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              Duration seconds
              <input
                type="number"
                min="1"
                max="120"
                value={durationSeconds}
                onChange={(event) => setDurationSeconds(Number(event.target.value))}
              />
            </label>
            <label>
              Reason
              <input value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
          </div>
          <section className="inline-panel">
            <h2>{getActiveTimeoutLabel(projection)}</h2>
            <button
              type="button"
              disabled={!canSubmitTimeout || Boolean(pendingKey) || !projection.activeTimeout}
              onClick={() => void endTimeout()}
            >
              End Timeout
            </button>
          </section>
          <div className="score-actions">
            {buildTimeoutControlPanels(projection).map((panel) => (
              <div key={panel.teamSide}>
                <h2>{panel.teamName}</h2>
                <div className="foul-count">
                  <span>Timeouts</span>
                  <strong>{panel.remaining}</strong>
                  <small>Used {panel.used}</small>
                </div>
                <button
                  type="button"
                  className="score-button"
                  disabled={
                    !canSubmitTimeout ||
                    Boolean(pendingKey) ||
                    Boolean(projection.activeTimeout) ||
                    panel.remaining <= 0
                  }
                  onClick={() => void grantTimeout(panel.teamSide)}
                >
                  {pendingKey === panel.pendingKey ? "Saving..." : "Grant Timeout"}
                </button>
              </div>
            ))}
          </div>
          <div className="button-row">
            {Object.values(getTimeoutControlLinks(matchId)).map((link) => (
              <a
                key={link.href}
                className="button-link secondary"
                href={link.href}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(link.href);
                }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function OperatorLifecyclePage({ matchId }: { matchId: string }) {
  const { api, currentUser } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<LifecycleAction | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const canSubmitLifecycle = canOperateScore(currentUser);
  const realtimeState = usePublicProjectionRealtime(matchId, projection, setProjection, undefined, refreshProjectionSilently);

  async function loadState() {
    setLoading(true);
    setMessage(null);
    try {
      setProjection(await api.getMatchProjection(matchId));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadState();
  }, [matchId]);

  async function refreshProjectionSilently() {
    try {
      setProjection(await api.getMatchProjection(matchId));
    } catch (error) {
      setMessage(toUiMessage(error));
    }
  }

  useEffect(() => {
    const timer = window.setInterval(
      () => void refreshProjectionSilently(),
      getOperatorPollingIntervalMs(realtimeState)
    );
    return () => window.clearInterval(timer);
  }, [api, matchId, realtimeState]);

  async function refreshAfterCommand(lastSeq: number) {
    const sync = await api.syncMatch(matchId, lastSeq);
    setProjection(sync.projection ?? await api.getMatchProjection(matchId));
  }

  async function runLifecycleCommand(action: LifecycleAction) {
    if (!projection || !canSubmitLifecycle) return;
    const plan = getLifecycleActionPlan(projection)[action];
    if (!plan.enabled) return;
    if (plan.requiresConfirmation && !window.confirm(`${plan.label}?`)) {
      return;
    }

    setPendingKey(action);
    setMessage(null);
    const previousSeq = projection.currentSeq;
    const input = buildLifecycleCommandPayload(projection, reason);

    try {
      const result =
        action === "startMatch"
          ? await api.startMatch(matchId, input)
          : action === "endPeriod"
            ? await api.endPeriod(matchId, input)
            : action === "startNextPeriod"
              ? await api.startNextPeriod(matchId, input)
              : action === "startOvertime"
                ? await api.startOvertime(matchId, input)
                : await api.finishMatch(matchId, input);

      if (result.status === "SYNC_REQUIRED" || result.reasonCode === "INVALID_EXPECTED_SEQ") {
        setMessage(getLifecycleControlFeedback(result));
        await refreshAfterCommand(previousSeq);
        return;
      }

      await refreshAfterCommand(previousSeq);
      setMessage(getLifecycleControlFeedback(result));
      setReason("");
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setPendingKey(null);
    }
  }

  const lifecycleState = projection ? buildLifecycleControlState(projection) : null;
  const actionPlan = projection ? getLifecycleActionPlan(projection) : null;

  return (
    <section className="stack">
      <div className="panel">
        <h1>Match Lifecycle</h1>
        <p className="muted">Match ID: {matchId}</p>
        {!canSubmitLifecycle ? <ErrorMessage code="FORBIDDEN" message="Lifecycle operation permission is required." /> : null}
        {pendingKey ? <Notice tone="success" text="Saving..." /> : null}
        {message ? <Notice {...message} /> : null}
      </div>
      {loading ? <section className="panel"><p>Loading match state...</p></section> : null}
      {!loading && !projection ? (
        <section className="panel"><p className="muted">No scoreboard projection found for this match.</p></section>
      ) : null}
      {projection && lifecycleState && actionPlan ? (
        <section className="panel score-control">
          <dl className="state-strip">
            <div><dt>Status</dt><dd>{lifecycleState.status}</dd></div>
            <div><dt>Period</dt><dd>{lifecycleState.periodNumber}</dd></div>
            <div><dt>Type</dt><dd>{lifecycleState.periodType}</dd></div>
            <div><dt>Seq</dt><dd>{projection.currentSeq}</dd></div>
            <div><dt>Expected Seq</dt><dd>{lifecycleState.expectedSeq}</dd></div>
            <div><dt>Sync</dt><dd>{getRealtimeConnectionLabel(realtimeState)}</dd></div>
          </dl>
          <div className="clock-display" aria-label="Lifecycle summary">
            <div>
              <span>Score</span>
              <strong>{lifecycleState.scoreLabel}</strong>
              <small>{lifecycleState.finalLabel ?? "Official result pending"}</small>
            </div>
            <div>
              <span>Game Clock</span>
              <strong>{lifecycleState.clockLabel}</strong>
              <small>{projection.gameClock?.running ? "Running" : "Stopped"}</small>
            </div>
          </div>
          <label className="form-grid compact">
            Reason
            <input value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <div className="button-row">
            {(Object.entries(actionPlan) as Array<[LifecycleAction, { enabled: boolean; label: string }]>).map(
              ([action, plan]) => (
                <button
                  key={action}
                  type="button"
                  className="score-button"
                  disabled={!canSubmitLifecycle || Boolean(pendingKey) || !plan.enabled}
                  onClick={() => void runLifecycleCommand(action)}
                >
                  {pendingKey === action ? "Saving..." : plan.label}
                </button>
              )
            )}
          </div>
          <div className="button-row">
            {Object.values(getLifecycleControlLinks(matchId)).map((link) => (
              <a
                key={link.href}
                className="button-link secondary"
                href={link.href}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(link.href);
                }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function MatchSummaryPage({ matchId, backHref }: { matchId: string; backHref: string }) {
  const { api } = useCurrentUser();
  const [summary, setSummary] = useState<MatchSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  useEffect(() => {
    async function loadSummary() {
      setLoading(true);
      setMessage(null);
      try {
        setSummary(await api.getMatchSummary(matchId));
      } catch (error) {
        setMessage(toUiMessage(error));
      } finally {
        setLoading(false);
      }
    }

    void loadSummary();
  }, [api, matchId]);

  return (
    <section className="stack">
      <div className="panel">
        <h1>Match Summary</h1>
        <p className="muted">Match ID: {matchId}</p>
        <div className="button-row">
          <a
            className="button-link secondary"
            href={backHref}
            onClick={(event) => {
              event.preventDefault();
              navigate(backHref);
            }}
          >
            Back
          </a>
          <a
            className="button-link"
            href={buildOperatorMatchReplayLink(matchId)}
            onClick={(event) => {
              event.preventDefault();
              navigate(buildOperatorMatchReplayLink(matchId));
            }}
          >
            Open Replay
          </a>
          <a
            className="button-link"
            href={buildOperatorMatchAuditLogLink(matchId)}
            onClick={(event) => {
              event.preventDefault();
              navigate(buildOperatorMatchAuditLogLink(matchId));
            }}
          >
            Open Audit Log
          </a>
        </div>
        {message ? <Notice {...message} /> : null}
      </div>
      {loading ? <section className="panel"><p>Loading match summary...</p></section> : null}
      {!loading && !summary && !message ? (
        <section className="panel"><p className="muted">No match summary found.</p></section>
      ) : null}
      {summary ? (
        <>
          <section className="panel">
            <dl className="state-strip">
              <div><dt>Status</dt><dd>{summary.status}</dd></div>
              <div><dt>Period</dt><dd>{summary.periodNumber}</dd></div>
              <div><dt>Type</dt><dd>{summary.periodType}</dd></div>
              <div><dt>Current Seq</dt><dd>{summary.currentSeq}</dd></div>
              <div><dt>Generated</dt><dd>{formatDate(summary.generatedAt)}</dd></div>
            </dl>
            <div className="score-display">
              <div>
                <span>{summary.home.teamName}</span>
                <strong>{summary.home.score}</strong>
              </div>
              <div>
                <span>{summary.away.teamName}</span>
                <strong>{summary.away.score}</strong>
              </div>
            </div>
          </section>
          <section className="score-actions">
            <SummaryTeamPanel team={summary.home} />
            <SummaryTeamPanel team={summary.away} />
          </section>
          <section className="panel">
            <h2>Event Counts</h2>
            <dl className="state-strip">
              <div><dt>Total</dt><dd>{summary.events.total}</dd></div>
              <div><dt>Score</dt><dd>{summary.events.scoreEvents}</dd></div>
              <div><dt>Fouls</dt><dd>{summary.events.foulEvents}</dd></div>
              <div><dt>Timeouts</dt><dd>{summary.events.timeoutEvents}</dd></div>
              <div><dt>Lifecycle</dt><dd>{summary.events.lifecycleEvents}</dd></div>
              <div><dt>Corrections</dt><dd>{summary.events.correctionEvents}</dd></div>
            </dl>
          </section>
        </>
      ) : null}
    </section>
  );
}

function SummaryTeamPanel({ team }: { team: MatchSummaryTeam }) {
  return (
    <article className="panel">
      <h2>{team.teamName}</h2>
      <dl className="state-strip">
        {getSummaryTeamTotals(team).map((item) => (
          <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
        ))}
      </dl>
      <SummaryPlayerTable players={team.players} unattributedPoints={team.unattributedPoints} />
    </article>
  );
}

function SummaryPlayerTable({
  players,
  unattributedPoints
}: {
  players: MatchSummaryPlayer[];
  unattributedPoints: number;
}) {
  if (players.length === 0 && unattributedPoints === 0) {
    return <p className="muted">No player scoring or fouls found.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Role</th>
            <th>PTS</th>
            <th>PF</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.playerId}>
              <td>{player.jerseyNumber ?? "-"}</td>
              <td>{player.displayName}</td>
              <td>{buildSummaryPlayerLabels(player).join(", ") || "-"}</td>
              <td>{player.points}</td>
              <td>{player.personalFouls}</td>
            </tr>
          ))}
          {unattributedPoints > 0 ? (
            <tr>
              <td>-</td>
              <td>Team-only scoring</td>
              <td>-</td>
              <td>{unattributedPoints}</td>
              <td>0</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function MatchReplayPage({ matchId, backHref }: { matchId: string; backHref: string }) {
  const { api } = useCurrentUser();
  const [replay, setReplay] = useState<MatchReplayResponse | null>(null);
  const [group, setGroup] = useState<ReplayGroupFilter>("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  async function loadReplay(nextGroup = group) {
    setLoading(true);
    setMessage(null);
    try {
      setReplay(await api.getMatchReplay(matchId, { group: nextGroup, limit: 300 }));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReplay(group);
  }, [api, matchId, group]);

  function selectGroup(nextGroup: ReplayGroupFilter) {
    setGroup(nextGroup);
  }

  return (
    <section className="stack">
      <div className="panel">
        <h1>Replay Timeline</h1>
        <p className="muted">Match ID: {matchId}</p>
        <div className="button-row">
          <a
            className="button-link secondary"
            href={backHref}
            onClick={(event) => {
              event.preventDefault();
              navigate(backHref);
            }}
          >
            Back
          </a>
          <button type="button" onClick={() => void loadReplay(group)} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <a
            className="button-link"
            href={buildOperatorMatchAuditLogLink(matchId)}
            onClick={(event) => {
              event.preventDefault();
              navigate(buildOperatorMatchAuditLogLink(matchId));
            }}
          >
            Open Audit Log
          </a>
        </div>
        {message ? <Notice {...message} /> : null}
      </div>
      {replay ? (
        <section className="panel">
          <dl className="state-strip">
            <div><dt>Status</dt><dd>{replay.status}</dd></div>
            <div><dt>Current Seq</dt><dd>{replay.currentSeq}</dd></div>
            <div><dt>Events</dt><dd>{replay.items.length}</dd></div>
            <div><dt>Generated</dt><dd>{formatDate(replay.generatedAt)}</dd></div>
          </dl>
          <div className="score-display">
            <div>
              <span>{replay.homeTeamName}</span>
              <strong>{replay.items.at(-1)?.scoreAfter?.home ?? "-"}</strong>
            </div>
            <div>
              <span>{replay.awayTeamName}</span>
              <strong>{replay.items.at(-1)?.scoreAfter?.away ?? "-"}</strong>
            </div>
          </div>
        </section>
      ) : null}
      <section className="panel">
        <div className="button-row" role="group" aria-label="Replay event filters">
          {buildReplayEventGroupOptions().map((option) => (
            <button
              key={option.value}
              type="button"
              className={group === option.value ? "score-button" : undefined}
              disabled={loading}
              onClick={() => selectGroup(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
      {loading ? <section className="panel"><p>Loading replay timeline...</p></section> : null}
      {!loading && replay && replay.items.length === 0 ? (
        <section className="panel"><p className="muted">No replay events found for this filter.</p></section>
      ) : null}
      {replay && replay.items.length > 0 ? (
        <section className="panel">
          <h2>Timeline</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Seq</th>
                  <th>Group</th>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Detail</th>
                  <th>Score</th>
                  <th>Actor</th>
                </tr>
              </thead>
              <tbody>
                {replay.items.map((item) => (
                  <ReplayTimelineRow key={`${item.seq}-${item.eventType}`} item={item} replay={replay} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function ReplayTimelineRow({ item, replay }: { item: ReplayItem; replay: MatchReplayResponse }) {
  const meta = buildReplayEventMeta(item);
  const scoreAfter = getReplayScoreAfterLabel(item, replay);
  const playerLabel = item.player
    ? `${item.player.jerseyNumber ? `#${item.player.jerseyNumber} ` : ""}${item.player.displayName}`
    : null;
  return (
    <tr>
      <td>{item.seq}</td>
      <td>{meta.badge}</td>
      <td>{meta.timestamp}</td>
      <td>
        <strong>{meta.title}</strong>
        <div className="muted">{item.eventType}</div>
      </td>
      <td>
        <span>{meta.description}</span>
        {playerLabel ? <div className="muted">{playerLabel}</div> : null}
      </td>
      <td>{scoreAfter ?? "-"}</td>
      <td>{item.actor?.role ?? "-"}</td>
    </tr>
  );
}

function MatchAuditLogPage({ matchId, backHref }: { matchId: string; backHref: string }) {
  const { api } = useCurrentUser();
  const [auditLog, setAuditLog] = useState<MatchAuditLogResponse | null>(null);
  const [group, setGroup] = useState<AuditLogGroupFilter>("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  async function loadAuditLog(nextGroup = group) {
    setLoading(true);
    setMessage(null);
    try {
      setAuditLog(await api.getMatchAuditLog(matchId, { group: nextGroup, limit: 300 }));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAuditLog(group);
  }, [api, matchId, group]);

  function selectGroup(nextGroup: AuditLogGroupFilter) {
    setGroup(nextGroup);
  }

  const correctionRows = auditLog ? getAuditCorrectionRows(auditLog) : [];

  return (
    <section className="stack">
      <div className="panel">
        <h1>Audit Log / Correction Review</h1>
        <p className="muted">Match ID: {matchId}</p>
        <div className="button-row">
          <a
            className="button-link secondary"
            href={backHref}
            onClick={(event) => {
              event.preventDefault();
              navigate(backHref);
            }}
          >
            Back
          </a>
          <button type="button" onClick={() => void loadAuditLog(group)} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {message ? <Notice {...message} /> : null}
      </div>
      {auditLog ? (
        <section className="panel">
          <dl className="state-strip">
            <div><dt>Status</dt><dd>{auditLog.status}</dd></div>
            <div><dt>Current Seq</dt><dd>{auditLog.currentSeq}</dd></div>
            <div><dt>Total Rows</dt><dd>{auditLog.summary.totalRows}</dd></div>
            <div><dt>Event Rows</dt><dd>{auditLog.summary.eventRows}</dd></div>
            <div><dt>Corrections</dt><dd>{auditLog.summary.correctionRows}</dd></div>
            <div><dt>Rejected</dt><dd>{auditLog.summary.rejectedRows}</dd></div>
            <div><dt>Missing Reason</dt><dd>{auditLog.summary.missingReasonRows}</dd></div>
            <div><dt>Generated</dt><dd>{formatDate(auditLog.generatedAt)}</dd></div>
          </dl>
        </section>
      ) : null}
      <section className="panel">
        <div className="button-row" role="group" aria-label="Audit log filters">
          {buildAuditLogFilterOptions().map((option) => (
            <button
              key={option.value}
              type="button"
              className={group === option.value ? "score-button" : undefined}
              disabled={loading}
              onClick={() => selectGroup(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
      {loading ? <section className="panel"><p>Loading audit log...</p></section> : null}
      {!loading && auditLog && auditLog.rows.length === 0 ? (
        <section className="panel"><p className="muted">No audit rows found for this filter.</p></section>
      ) : null}
      {auditLog && auditLog.rows.length > 0 ? (
        <section className="panel">
          <h2>Audit Rows</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Seq</th>
                  <th>Time</th>
                  <th>Group</th>
                  <th>Event/Action</th>
                  <th>Actor</th>
                  <th>Role</th>
                  <th>Reason</th>
                  <th>Correlation / Command</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.rows.map((row) => (
                  <AuditLogRowView key={`${row.source}-${row.seq ?? row.createdAt}-${row.eventType}`} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <section className="panel">
        <h2>Correction Review</h2>
        {correctionRows.length === 0 ? (
          <p className="muted">No correction events found.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Seq</th>
                  <th>Event</th>
                  <th>Reason</th>
                  <th>Actor</th>
                </tr>
              </thead>
              <tbody>
                {correctionRows.map((row) => (
                  <tr key={`correction-${row.seq}-${row.eventType}`}>
                    <td>{row.seq ?? "-"}</td>
                    <td>{row.eventType}</td>
                    <td>{row.reason ?? "Unavailable"}</td>
                    <td>{row.actor.displayName ?? row.actor.userId ?? "Unavailable"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function AuditLogRowView({ row }: { row: AuditLogRow }) {
  const meta = buildAuditLogRowMeta(row);
  return (
    <tr>
      <td>{row.seq ?? "-"}</td>
      <td>{meta.timestamp}</td>
      <td>{meta.badge}</td>
      <td>
        <strong>{meta.title}</strong>
        <div className="muted">{row.eventType}</div>
        <div className="muted">{row.description}</div>
      </td>
      <td>{meta.actorLabel}</td>
      <td>{row.actor.role ?? "Unavailable"}</td>
      <td>{meta.reasonLabel}</td>
      <td>
        <span>{row.correlationId ?? "Unavailable"}</span>
        <div className="muted">{row.commandId ?? "No command id"}</div>
        <div className="muted">{row.causationId ?? "No causation id"}</div>
        <div className="muted">{row.device.label ?? "No device metadata"}</div>
      </td>
    </tr>
  );
}

function PublicScoreboardPage({ matchId }: { matchId: string }) {
  const { api } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [projectionReceivedAtMs, setProjectionReceivedAtMs] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const nowMs = useLiveClockNow(Boolean(projection?.gameClock?.running || projection?.shotClock?.running));
  const realtimeState = usePublicProjectionRealtime(matchId, projection, setProjection, () => {
    setProjectionReceivedAtMs(Date.now());
    setMessage(null);
  }, refreshPublicScoreboard);

  async function refreshPublicScoreboard(cancelled?: () => boolean) {
    try {
      const next = await api.getPublicScoreboard(matchId);
      if (!cancelled?.()) {
        setProjection(next);
        setProjectionReceivedAtMs(Date.now());
        setMessage(null);
      }
    } catch (error) {
      if (!cancelled?.()) {
        setMessage(toUiMessage(error));
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    void refreshPublicScoreboard(() => cancelled);
    const timer = window.setInterval(
      () => void refreshPublicScoreboard(() => cancelled),
      getPublicPollingIntervalMs(realtimeState)
    );
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [api, matchId, realtimeState]);

  return (
    <section className="panel public-scoreboard">
      <h1>Public Scoreboard</h1>
      <p className="muted">Match ID: {matchId}</p>
      {message ? <Notice {...message} /> : null}
      {projection ? (
        <>
          <div className="score-display large" aria-label="Public score">
            {buildScoreControlPanels(projection).map((panel) => (
              <div key={panel.teamSide}>
                <span>{panel.label}</span>
                <strong>{panel.score}</strong>
                <small>{panel.teamName}</small>
              </div>
            ))}
          </div>
          <div className="clock-display public-clock" aria-label="Public clock">
            <div>
              <span>Game Clock</span>
              <strong>{buildClockControlState(projection, { nowMs, receivedAtMs: projectionReceivedAtMs }).gameClockLabel}</strong>
              <small>{buildClockControlState(projection, { nowMs, receivedAtMs: projectionReceivedAtMs }).gameClockRunning ? "Running" : "Stopped"}</small>
            </div>
            <div>
              <span>Shot Clock</span>
              <strong>{buildClockControlState(projection, { nowMs, receivedAtMs: projectionReceivedAtMs }).shotClockLabel}</strong>
              <small>{buildClockControlState(projection, { nowMs, receivedAtMs: projectionReceivedAtMs }).shotClockRunning ? "Running" : "Stopped"}</small>
            </div>
          </div>
          <div className="state-strip" aria-label="Timeouts">
            {buildTimeoutControlPanels(projection).map((panel) => (
              <div key={panel.teamSide}>
                <dt>{panel.teamSide} Timeouts</dt>
                <dd>{panel.remaining}</dd>
              </div>
            ))}
            <div><dt>Active Timeout</dt><dd>{getActiveTimeoutLabel(projection)}</dd></div>
          </div>
          <dl className="state-strip">
            <div><dt>Status</dt><dd>{projection.status}</dd></div>
            <div><dt>Period</dt><dd>{projection.periodNumber}</dd></div>
            <div><dt>Type</dt><dd>{projection.periodType === "OVERTIME" ? "OT" : "REG"}</dd></div>
            <div><dt>Seq</dt><dd>{projection.currentSeq}</dd></div>
            <div><dt>Sync</dt><dd>{getRealtimeConnectionLabel(realtimeState)}</dd></div>
          </dl>
          {projection.status === "FINISHED" ? (
            <Notice
              tone="success"
              text={`Final ${projection.finalScore?.home ?? projection.homeScore} - ${projection.finalScore?.away ?? projection.awayScore}`}
            />
          ) : null}
        </>
      ) : (
        <p>Loading scoreboard...</p>
      )}
    </section>
  );
}

function TournamentSummaryStrip({ tournament }: { tournament: TournamentSummary }) {
  return (
    <dl className="state-strip">
      <div><dt>Status</dt><dd>{tournament.status}</dd></div>
      <div><dt>Matches</dt><dd>{tournament.matchCount}</dd></div>
      <div><dt>Live</dt><dd>{tournament.liveMatchCount}</dd></div>
      <div><dt>Finished</dt><dd>{tournament.finishedMatchCount}</dd></div>
    </dl>
  );
}

function ScheduleFilterBar({
  value,
  onChange
}: {
  value: ScheduleStatusFilter;
  onChange: (value: ScheduleStatusFilter) => void;
}) {
  return (
    <div className="button-row" role="group" aria-label="Schedule filter">
      {buildScheduleStatusFilters().map((filter) => (
        <button
          key={filter.value}
          type="button"
          className={filter.value === value ? "active" : undefined}
          onClick={() => onChange(filter.value)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

function filterScheduleMatches(matches: TournamentScheduleMatch[], filter: ScheduleStatusFilter) {
  if (filter === "all") {
    return matches;
  }

  return matches.filter((match) => getScheduleStatusGroup(match.status) === filter);
}

function ScheduleTable({ matches, mode }: { matches: TournamentScheduleMatch[]; mode: "admin" | "public" }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Court</th>
            <th>Match</th>
            <th>Score</th>
            <th>Status</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => {
            const meta = buildScheduleRowMeta(match);
            return (
              <tr key={match.matchId}>
                <td>{meta.scheduleLabel}</td>
                <td>{meta.locationLabel}</td>
                <td>{meta.matchupLabel}</td>
                <td>{meta.scoreLabel}</td>
                <td>{match.status}</td>
                <td>
                  {mode === "admin" ? <AdminScheduleLinks match={match} /> : <PublicScheduleLinks match={match} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AdminScheduleLinks({ match }: { match: TournamentScheduleMatch }) {
  const links = [
    { href: buildOperatorMatchScoreLink(match.matchId), label: "Operator Score" },
    { href: match.publicScoreboardPath, label: "Public Scoreboard" },
    { href: buildOperatorMatchSummaryLink(match.matchId), label: "Summary" },
    { href: buildOperatorMatchReplayLink(match.matchId), label: "Replay" },
    { href: buildOperatorMatchAuditLogLink(match.matchId), label: "Audit Log" }
  ];

  return (
    <span className="inline-actions">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          onClick={(event) => {
            event.preventDefault();
            navigate(link.href);
          }}
        >
          {link.label}
        </a>
      ))}
    </span>
  );
}

function PublicScheduleLinks({ match }: { match: TournamentScheduleMatch }) {
  const links = getPublicScheduleLinks(match);
  return (
    <span className="inline-actions">
      <a
        href={links.scoreboard.href}
        onClick={(event) => {
          event.preventDefault();
          navigate(links.scoreboard.href);
        }}
      >
        {links.scoreboard.label}
      </a>
    </span>
  );
}

function MatchTable({ matches, mode }: { matches: OperatorMatchSummary[]; mode: "admin" | "operator" }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Match</th>
            <th>Status</th>
            <th>Scheduled</th>
            <th>Venue</th>
            <th>Seq</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => (
            <tr key={match.matchId}>
              <td>{getTeamLabel(match)}</td>
              <td>{match.status}</td>
              <td>{formatDate(match.scheduledAt)}</td>
              <td>{match.venueName ?? "-"}</td>
              <td>{match.currentSeq}</td>
              <td>
                {mode === "admin" ? (
                  <span className="inline-actions">
                    {Object.values(buildAdminMatchActions(match.matchId)).map((action) => (
                      <a
                        key={action.href}
                        href={action.href}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate(action.href);
                        }}
                      >
                        {action.label}
                      </a>
                    ))}
                  </span>
                ) : (
                  <span className="inline-actions">
                    <a
                      href={buildOperatorMatchScoreLink(match.matchId)}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(buildOperatorMatchScoreLink(match.matchId));
                      }}
                    >
                      Score
                    </a>
                    <a
                      href={buildOperatorMatchFoulsLink(match.matchId)}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(buildOperatorMatchFoulsLink(match.matchId));
                      }}
                    >
                      Fouls
                    </a>
                    <a
                      href={buildOperatorMatchClockLink(match.matchId)}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(buildOperatorMatchClockLink(match.matchId));
                      }}
                    >
                      Clock
                    </a>
                    <a
                      href={buildOperatorMatchTimeoutsLink(match.matchId)}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(buildOperatorMatchTimeoutsLink(match.matchId));
                      }}
                    >
                      Timeouts
                    </a>
                    <a
                      href={buildOperatorMatchLifecycleLink(match.matchId)}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(buildOperatorMatchLifecycleLink(match.matchId));
                      }}
                    >
                      Lifecycle
                    </a>
                    <a
                      href={buildOperatorMatchSummaryLink(match.matchId)}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(buildOperatorMatchSummaryLink(match.matchId));
                      }}
                    >
                      Summary
                    </a>
                    <a
                      href={buildOperatorMatchReplayLink(match.matchId)}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(buildOperatorMatchReplayLink(match.matchId));
                      }}
                    >
                      Replay
                    </a>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminOfficialsPage({ matchId }: { matchId: string }) {
  const { api, currentUser } = useCurrentUser();
  const [officials, setOfficials] = useState<AssignmentRecord[]>([]);
  const [form, setForm] = useState<AssignmentFormState>(() => createAssignmentFormState());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const isAdmin = canManageAssignments(currentUser);

  async function loadOfficials() {
    setLoading(true);
    setMessage(null);
    try {
      setOfficials(await api.listOfficials(matchId));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOfficials();
  }, [matchId]);

  async function submitAssignment(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin) return;
    setMessage(null);
    try {
      await api.assignOfficial(matchId, {
        userId: form.userId.trim(),
        roleCode: form.roleCode
      });
      setMessage({ tone: "success", text: "Assignment saved from backend response." });
      setForm(createAssignmentFormState());
      await loadOfficials();
    } catch (error) {
      setMessage(toUiMessage(error));
    }
  }

  async function revoke(assignment: AssignmentRecord) {
    const reason = window.prompt(`Reason to revoke ${assignment.roleCode} assignment`);
    const validation = validateRevokeReason(reason ?? "");
    if (!validation.ok) {
      setMessage({ tone: "error", text: validation.message, code: validation.reasonCode });
      return;
    }
    try {
      await api.revokeOfficial(matchId, assignment.id, reason!.trim());
      setMessage({ tone: "success", text: "Assignment revoked from backend response." });
      await loadOfficials();
    } catch (error) {
      setMessage(toUiMessage(error));
    }
  }

  return (
    <section className="stack">
      <div className="panel">
        <h1>Match Officials</h1>
        <p className="muted">Match ID: {matchId}</p>
        {!isAdmin ? <ErrorMessage code="FORBIDDEN" message="Admin role is required to manage assignments." /> : null}
        {message ? <Notice {...message} /> : null}
      </div>

      {isAdmin ? (
        <section className="panel">
          <h2>Add assignment</h2>
          <form className="assignment-form" onSubmit={submitAssignment}>
            <label>
              User ID
              <input value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })} />
            </label>
            <label>
              Role code
              <select
                value={form.roleCode}
                onChange={(event) =>
                  setForm({ ...form, roleCode: event.target.value as MatchOfficialRoleCode })
                }
              >
                {matchOfficialRoleCodes.map((roleCode) => (
                  <option key={roleCode} value={roleCode}>
                    {roleCode}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Assign official</button>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <h2>Assignments</h2>
        {loading ? <p>Loading assignments...</p> : null}
        {!loading && officials.length === 0 ? <p className="muted">No assignments found for this match.</p> : null}
        {officials.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Assigned</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {officials.map((official) => (
                  <tr key={official.id}>
                    <td>{official.userId}</td>
                    <td>{official.roleCode}</td>
                    <td>{official.assignmentStatus}</td>
                    <td>{formatDate(official.assignedAt)}</td>
                    <td>
                      {isAdmin && official.assignmentStatus === "ACTIVE" ? (
                        <button type="button" className="danger" onClick={() => void revoke(official)}>
                          Revoke
                        </button>
                      ) : (
                        <span className="muted">No action</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function AdminRostersPage({ matchId }: { matchId: string }) {
  const { api, currentUser } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [rosters, setRosters] = useState<MatchRostersResponse | null>(null);
  const [teamPlayers, setTeamPlayers] = useState<Record<"HOME" | "AWAY", Array<{ playerId: string; displayName: string; jerseyNumber: string | null; position: PlayerPosition }>>>({
    HOME: [],
    AWAY: []
  });
  const [forms, setForms] = useState<Record<"HOME" | "AWAY", CreatePlayerFormState>>({
    HOME: createPlayerFormState(),
    AWAY: createPlayerFormState()
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const isAdmin = canManageAssignments(currentUser);

  async function loadRosters(options: { clearMessage?: boolean } = {}) {
    setLoading(true);
    if (options.clearMessage ?? true) {
      setMessage(null);
    }
    try {
      const nextProjection = await api.getMatchProjection(matchId);
      setProjection(nextProjection);
      const nextRosters = await api.getMatchRosters(matchId);
      setRosters(nextRosters);
      const homePlayers = nextProjection.homeTeamId ? await api.listTeamPlayers(nextProjection.homeTeamId) : [];
      const awayPlayers = nextProjection.awayTeamId ? await api.listTeamPlayers(nextProjection.awayTeamId) : [];
      setTeamPlayers({
        HOME: homePlayers,
        AWAY: awayPlayers
      });
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRosters();
  }, [matchId]);

  async function createAndAssign(teamSide: "HOME" | "AWAY") {
    if (!isAdmin || !projection) return;
    const teamId = teamSide === "HOME" ? projection.homeTeamId : projection.awayTeamId;
    if (!teamId) {
      setMessage({ tone: "error", code: "VALIDATION_ERROR", text: `${teamSide} team is not assigned.` });
      return;
    }

    try {
      const player = await api.createPlayer(teamId, buildCreatePlayerPayload(forms[teamSide]));
      await api.assignRosterPlayer(matchId, teamSide, player.playerId);
      setForms({ ...forms, [teamSide]: createPlayerFormState() });
      setMessage({ tone: "success", text: `${teamSide} roster player saved.` });
      await loadRosters({ clearMessage: false });
    } catch (error) {
      setMessage(toUiMessage(error));
    }
  }

  async function assignExisting(teamSide: "HOME" | "AWAY", playerId: string) {
    if (!isAdmin) return;
    try {
      await api.assignRosterPlayer(matchId, teamSide, playerId);
      setMessage({ tone: "success", text: `${teamSide} roster assignment saved.` });
      await loadRosters({ clearMessage: false });
    } catch (error) {
      setMessage(toUiMessage(error));
    }
  }

  return (
    <section className="stack">
      <div className="panel">
        <h1>Match Rosters</h1>
        <p className="muted">Match ID: {matchId}</p>
        {!isAdmin ? <ErrorMessage code="FORBIDDEN" message="Admin role is required to manage rosters." /> : null}
        {message ? <Notice {...message} /> : null}
      </div>
      {loading ? <section className="panel"><p>Loading rosters...</p></section> : null}
      {!loading && projection ? (
        <section className="score-actions">
          {(["HOME", "AWAY"] as const).map((teamSide) => {
            const teamId = teamSide === "HOME" ? projection.homeTeamId : projection.awayTeamId;
            const form = forms[teamSide];
            const rosterPlayers = getRosterPlayersForSide(rosters, teamSide);
            const assignedIds = new Set(rosterPlayers.map((player) => player.playerId));
            return (
              <article className="panel" key={teamSide}>
                <h2>{getRosterTeamLabel(projection, teamSide)}</h2>
                <p className="muted">{teamId ?? "Team pending"}</p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Player</th>
                        <th>Position</th>
                        <th>Status</th>
                        <th>Starter</th>
                        <th>Captain</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rosterPlayers.length === 0 ? (
                        <tr><td colSpan={6}>No roster players assigned.</td></tr>
                      ) : rosterPlayers.map((player) => (
                        <tr key={player.playerId}>
                          <td>{player.jerseyNumberSnapshot ?? "-"}</td>
                          <td>{player.displayNameSnapshot}</td>
                          <td>{player.position}</td>
                          <td>{player.status}</td>
                          <td>{player.isStarter ? "Yes" : "No"}</td>
                          <td>{player.isCaptain ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <form className="assignment-form" onSubmit={(event) => { event.preventDefault(); void createAndAssign(teamSide); }}>
                  <label>
                    Player name
                    <input
                      value={form.displayName}
                      onChange={(event) => setForms({ ...forms, [teamSide]: { ...form, displayName: event.target.value } })}
                    />
                  </label>
                  <label>
                    Jersey
                    <input
                      value={form.jerseyNumber}
                      onChange={(event) => setForms({ ...forms, [teamSide]: { ...form, jerseyNumber: event.target.value } })}
                    />
                  </label>
                  <label>
                    Position
                    <select
                      value={form.position}
                      onChange={(event) => setForms({ ...forms, [teamSide]: { ...form, position: event.target.value as PlayerPosition } })}
                    >
                      {(["UNKNOWN", "GUARD", "FORWARD", "CENTER"] as const).map((position) => (
                        <option key={position} value={position}>{position}</option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" disabled={!isAdmin || !teamId}>Add to team and roster</button>
                </form>
                <div className="button-row">
                  {teamPlayers[teamSide].filter((player) => !assignedIds.has(player.playerId)).map((player) => (
                    <button
                      key={player.playerId}
                      type="button"
                      className="secondary"
                      disabled={!isAdmin}
                      onClick={() => void assignExisting(teamSide, player.playerId)}
                    >
                      Assign {player.jerseyNumber ? `#${player.jerseyNumber} ` : ""}{player.displayName}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </section>
  );
}

function AdminLineupPage({ matchId }: { matchId: string }) {
  const { api, currentUser } = useCurrentUser();
  const [lineup, setLineup] = useState<MatchLineupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const isAdmin = canManageAssignments(currentUser);

  async function loadLineup(options: { clearMessage?: boolean } = {}) {
    setLoading(true);
    if (options.clearMessage ?? true) {
      setMessage(null);
    }
    try {
      setLineup(await api.getMatchLineup(matchId));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLineup();
  }, [matchId]);

  async function runLineupAction(
    key: string,
    successText: string,
    action: () => Promise<MatchLineupResponse>
  ) {
    if (!isAdmin) return;
    setPendingKey(key);
    setMessage(null);
    try {
      setLineup(await action());
      setMessage({ tone: "success", text: successText });
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section className="stack">
      <div className="panel">
        <h1>Lineup / Starters</h1>
        <p className="muted">Match ID: {matchId}</p>
        {!isAdmin ? <ErrorMessage code="FORBIDDEN" message="Admin role is required to manage lineup." /> : null}
        {pendingKey ? <Notice tone="success" text="Saving..." /> : null}
        {message ? <Notice {...message} /> : null}
      </div>
      {loading ? <section className="panel"><p>Loading lineup...</p></section> : null}
      {!loading && !lineup ? <section className="panel"><p className="muted">No lineup found.</p></section> : null}
      {lineup ? (
        <section className="score-actions">
          {(["HOME", "AWAY"] as const).map((teamSide) => {
            const side = teamSide === "HOME" ? lineup.home : lineup.away;
            const sideKey = teamSide.toLowerCase() as "home" | "away";
            return (
              <article className="panel" key={teamSide}>
                <h2>{side.teamName ?? side.teamId ?? teamSide}</h2>
                <dl className="state-strip">
                  <div><dt>Starters</dt><dd>{side.readiness.starterCount}/5</dd></div>
                  <div><dt>Captain</dt><dd>{side.readiness.captainSet ? "SET" : "NEEDED"}</dd></div>
                  <div><dt>Readiness</dt><dd>{buildRosterReadinessLabel(side.readiness)}</dd></div>
                </dl>
                {side.players.length === 0 ? <p className="muted">No roster players assigned.</p> : null}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Player</th>
                        <th>Status</th>
                        <th>Starter</th>
                        <th>Captain</th>
                      </tr>
                    </thead>
                    <tbody>
                      {side.players.map((player) => (
                        <tr key={player.playerId}>
                          <td>{player.jerseyNumberSnapshot ?? "-"}</td>
                          <td>{player.displayNameSnapshot}</td>
                          <td>{buildRosterPlayerDisplayLabel(player)}</td>
                          <td>
                            {player.isStarter ? (
                              <button
                                type="button"
                                className="secondary"
                                disabled={!isAdmin || Boolean(pendingKey)}
                                onClick={() => void runLineupAction(
                                  `remove-${player.playerId}`,
                                  "Starter removed.",
                                  () => api.removeLineupStarter(matchId, teamSide, player.playerId)
                                )}
                              >
                                Clear starter
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={!isAdmin || Boolean(pendingKey) || player.status === "INACTIVE"}
                                onClick={() => void runLineupAction(
                                  `starter-${player.playerId}`,
                                  "Starter selected.",
                                  () => api.selectLineupStarter(matchId, teamSide, player.playerId)
                                )}
                              >
                                Select starter
                              </button>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className={player.isCaptain ? "secondary" : undefined}
                              disabled={!isAdmin || Boolean(pendingKey) || player.status === "INACTIVE"}
                              onClick={() => void runLineupAction(
                                `captain-${player.playerId}`,
                                "Captain set.",
                                () => api.setLineupCaptain(matchId, teamSide, player.playerId)
                              )}
                            >
                              {player.isCaptain ? "Captain" : "Set captain"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  disabled={!isAdmin || Boolean(pendingKey)}
                  onClick={() => void runLineupAction(
                    `confirm-${teamSide}`,
                    `${teamSide} roster confirmed.`,
                    () => api.confirmLineupRoster(matchId, teamSide, "alpha lineup")
                  )}
                >
                  Confirm {teamSide} Roster
                </button>
                {lineup[sideKey].readiness.confirmed ? <p className="muted">Roster confirmed.</p> : null}
              </article>
            );
          })}
        </section>
      ) : null}
    </section>
  );
}

function HomePage() {
  return (
    <section className="panel">
      <h1>Basketball Scoreboard</h1>
      <p>Phase 1 foundation shell. Match events remain the source of truth.</p>
      <p className="muted">Production login and admin match official assignment UI are now available.</p>
    </section>
  );
}

function UnauthorizedPage() {
  return <StatusPanel title="Unauthorized" message="Your current session cannot access this page." />;
}

function StatusPanel({ title, message }: { title: string; message: string }) {
  return (
    <section className="panel">
      <h1>{title}</h1>
      <p>{message}</p>
    </section>
  );
}

function ErrorMessage({ code, message }: { code: string; message: string }) {
  return (
    <div className="notice error" role="alert">
      <strong>{code}</strong>
      <span>{message}</span>
    </div>
  );
}

function Notice({ tone, text, code }: { tone: "success" | "error"; text: string; code?: string }) {
  return (
    <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}>
      {code ? <strong>{code}</strong> : null}
      <span>{text}</span>
    </div>
  );
}

function toUiMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return {
      tone: "error" as const,
      code: error.reasonCode,
      text:
        error.reasonCode === "CSRF_REQUIRED" || error.reasonCode === "CSRF_INVALID"
          ? `${error.message}. Refresh the form and try again.`
          : error.message
    };
  }
  return { tone: "error" as const, code: "INTERNAL_ERROR", text: "Unexpected error" };
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function RoutedApp() {
  const route = useRoute();

  const content = useMemo(() => {
    switch (route.name) {
      case "login":
        return <LoginPage />;
      case "admin":
        return (
          <ProtectedRoute requireAdmin>
            <AdminHome />
          </ProtectedRoute>
        );
      case "admin-matches":
        return (
          <ProtectedRoute requireAdmin>
            <AdminMatchesPage />
          </ProtectedRoute>
        );
      case "admin-tournaments":
        return (
          <ProtectedRoute requireAdmin>
            <AdminTournamentsPage />
          </ProtectedRoute>
        );
      case "admin-tournament-schedule":
        return (
          <ProtectedRoute requireAdmin>
            <AdminTournamentSchedulePage tournamentId={route.tournamentId} />
          </ProtectedRoute>
        );
      case "admin-officials":
        return (
          <ProtectedRoute requireAdmin>
            <AdminOfficialsPage matchId={route.matchId} />
          </ProtectedRoute>
        );
      case "admin-rosters":
        return (
          <ProtectedRoute requireAdmin>
            <AdminRostersPage matchId={route.matchId} />
          </ProtectedRoute>
        );
      case "admin-lineup":
        return (
          <ProtectedRoute requireAdmin>
            <AdminLineupPage matchId={route.matchId} />
          </ProtectedRoute>
        );
      case "admin-summary":
        return (
          <ProtectedRoute requireAdmin>
            <MatchSummaryPage matchId={route.matchId} backHref="/admin/matches" />
          </ProtectedRoute>
        );
      case "admin-replay":
        return (
          <ProtectedRoute requireAdmin>
            <MatchReplayPage matchId={route.matchId} backHref="/admin/matches" />
          </ProtectedRoute>
        );
      case "admin-audit-log":
        return (
          <ProtectedRoute requireAdmin>
            <MatchAuditLogPage matchId={route.matchId} backHref="/admin/matches" />
          </ProtectedRoute>
        );
      case "operator-matches":
        return (
          <ProtectedRoute requireOperator>
            <OperatorMatchesPage />
          </ProtectedRoute>
        );
      case "operator-score":
        return (
          <ProtectedRoute requireOperator>
            <OperatorScorePage matchId={route.matchId} />
          </ProtectedRoute>
        );
      case "operator-fouls":
        return (
          <ProtectedRoute requireOperator>
            <OperatorFoulPage matchId={route.matchId} />
          </ProtectedRoute>
        );
      case "operator-clock":
        return (
          <ProtectedRoute requireOperator>
            <OperatorClockPage matchId={route.matchId} />
          </ProtectedRoute>
        );
      case "operator-timeouts":
        return (
          <ProtectedRoute requireOperator>
            <OperatorTimeoutPage matchId={route.matchId} />
          </ProtectedRoute>
        );
      case "operator-lifecycle":
        return (
          <ProtectedRoute requireOperator>
            <OperatorLifecyclePage matchId={route.matchId} />
          </ProtectedRoute>
        );
      case "operator-summary":
        return (
          <ProtectedRoute requireOperator>
            <MatchSummaryPage matchId={route.matchId} backHref="/operator/matches" />
          </ProtectedRoute>
        );
      case "operator-replay":
        return (
          <ProtectedRoute requireOperator>
            <MatchReplayPage matchId={route.matchId} backHref="/operator/matches" />
          </ProtectedRoute>
        );
      case "operator-audit-log":
        return (
          <ProtectedRoute requireOperator>
            <MatchAuditLogPage matchId={route.matchId} backHref="/operator/matches" />
          </ProtectedRoute>
        );
      case "public-scoreboard":
        return <PublicScoreboardPage matchId={route.matchId} />;
      case "public-tournaments":
        return <PublicTournamentsPage />;
      case "public-tournament-schedule":
        return <PublicTournamentSchedulePage tournamentId={route.tournamentId} />;
      case "unauthorized":
        return <UnauthorizedPage />;
      case "home":
        return <HomePage />;
    }
  }, [route]);

  return <Shell>{content}</Shell>;
}

export default function App() {
  return (
    <AuthProvider>
      <RoutedApp />
    </AuthProvider>
  );
}
