import React, { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  MatchOfficialRoleCode,
  OperatorMatchSummary,
  ScoreAddedPayload,
  ScoreboardProjection
} from "@basket-scoreboard/api-contracts";
import { AuthProvider, useCurrentUser } from "./auth/AuthProvider";
import { ApiClientError, type AssignmentRecord } from "./lib/apiClient";
import {
  canManageAssignments,
  createAssignmentFormState,
  getProtectedRouteDecision,
  matchOfficialRoleCodes,
  validateRevokeReason,
  type AssignmentFormState
} from "./lib/adminAssignments";
import {
  buildAdminMatchLink,
  buildOperatorMatchScoreLink,
  buildPublicScoreboardLink,
  buildOperatorMatchCard,
  canAccessOperatorMatches,
  canOperateScore,
  createEmptyOperatorMatchesMessage,
  getTeamLabel
} from "./lib/operatorMatches";

type Route =
  | { name: "home" }
  | { name: "login" }
  | { name: "admin" }
  | { name: "admin-matches" }
  | { name: "admin-officials"; matchId: string }
  | { name: "operator-matches" }
  | { name: "operator-score"; matchId: string }
  | { name: "public-scoreboard"; matchId: string }
  | { name: "unauthorized" };

function parseRoute(pathname: string): Route {
  const officialMatch = pathname.match(/^\/admin\/matches\/([^/]+)\/officials$/);
  const matchId = officialMatch?.[1];
  if (matchId) {
    return { name: "admin-officials", matchId: decodeURIComponent(matchId) };
  }
  const operatorScoreMatch = pathname.match(/^\/operator\/matches\/([^/]+)\/score$/);
  const operatorMatchId = operatorScoreMatch?.[1];
  if (operatorMatchId) {
    return { name: "operator-score", matchId: decodeURIComponent(operatorMatchId) };
  }
  const publicScoreboardMatch = pathname.match(/^\/public\/scoreboard\/([^/]+)$/);
  const publicMatchId = publicScoreboardMatch?.[1];
  if (publicMatchId) {
    return { name: "public-scoreboard", matchId: decodeURIComponent(publicMatchId) };
  }
  if (pathname === "/login") return { name: "login" };
  if (pathname === "/admin") return { name: "admin" };
  if (pathname === "/admin/matches") return { name: "admin-matches" };
  if (pathname === "/operator/matches") return { name: "operator-matches" };
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
  const { api } = useCurrentUser();
  const [matches, setMatches] = useState<OperatorMatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage(null);
      try {
        setMatches(await api.getAdminMatches());
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
      <h1>Admin Matches</h1>
      <p className="muted">Open a match to manage official assignments.</p>
      {message ? <Notice {...message} /> : null}
      {loading ? <p>Loading matches...</p> : null}
      {!loading && matches.length === 0 ? <p className="muted">No matches found.</p> : null}
      {matches.length > 0 ? <MatchTable matches={matches} mode="admin" /> : null}
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

function OperatorScorePage({ matchId }: { matchId: string }) {
  const { api, currentUser } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const canSubmitScore = canOperateScore(currentUser);

  async function loadState() {
    setLoading(true);
    setMessage(null);
    try {
      setProjection(await api.getMatchState(matchId));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadState();
  }, [matchId]);

  async function refreshAfterCommand(lastSeq: number) {
    const sync = await api.syncMatch(matchId, lastSeq);
    if (sync.projection) {
      setProjection(sync.projection);
      return;
    }
    setProjection(await api.getMatchState(matchId));
  }

  async function addScore(teamSide: ScoreAddedPayload["teamSide"], points: ScoreAddedPayload["points"]) {
    if (!projection || !canSubmitScore) return;
    const key = `${teamSide}-${points}`;
    setPendingKey(key);
    setMessage(null);
    const previousSeq = projection.currentSeq;

    try {
      const result = await api.addScore(matchId, {
        expectedSeq: previousSeq,
        payload: {
          teamSide,
          points,
          playerId: null,
          periodNumber: projection.periodNumber,
          gameClockRemainingMs: projection.gameClockRemainingMs,
          note: null
        }
      });

      if (result.status === "SYNC_REQUIRED" || result.reasonCode === "INVALID_EXPECTED_SEQ") {
        setMessage({ tone: "error", code: "INVALID_EXPECTED_SEQ", text: "State changed, please retry." });
        await refreshAfterCommand(previousSeq);
        return;
      }

      await refreshAfterCommand(previousSeq);
      setMessage({ tone: "success", text: `Score accepted. Current seq ${result.currentSeq}.` });
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
        {message ? <Notice {...message} /> : null}
      </div>
      {loading ? <section className="panel"><p>Loading match state...</p></section> : null}
      {!loading && !projection ? (
        <section className="panel"><p className="muted">No scoreboard projection found for this match.</p></section>
      ) : null}
      {projection ? (
        <section className="panel score-control">
          <div className="score-display" aria-label="Current score">
            <div>
              <span>Home</span>
              <strong>{projection.homeScore}</strong>
            </div>
            <div>
              <span>Away</span>
              <strong>{projection.awayScore}</strong>
            </div>
          </div>
          <dl className="state-strip">
            <div><dt>Status</dt><dd>{projection.status}</dd></div>
            <div><dt>Period</dt><dd>{projection.periodNumber}</dd></div>
            <div><dt>Seq</dt><dd>{projection.currentSeq}</dd></div>
          </dl>
          <div className="score-actions">
            {(["HOME", "AWAY"] as const).map((teamSide) => (
              <div key={teamSide}>
                <h2>{teamSide === "HOME" ? "Home" : "Away"}</h2>
                <div className="button-row">
                  {([1, 2, 3] as const).map((points) => {
                    const key = `${teamSide}-${points}`;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={!canSubmitScore || Boolean(pendingKey)}
                        onClick={() => void addScore(teamSide, points)}
                      >
                        {pendingKey === key ? "Submitting..." : `+${points}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="button-row">
            <a
              className="button-link secondary"
              href={buildPublicScoreboardLink(matchId)}
              onClick={(event) => {
                event.preventDefault();
                navigate(buildPublicScoreboardLink(matchId));
              }}
            >
              Public Scoreboard
            </a>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function PublicScoreboardPage({ matchId }: { matchId: string }) {
  const { api } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const next = await api.getPublicScoreboard(matchId);
        if (!cancelled) {
          setProjection(next);
          setMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(toUiMessage(error));
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [api, matchId]);

  return (
    <section className="panel public-scoreboard">
      <h1>Public Scoreboard</h1>
      <p className="muted">Match ID: {matchId}</p>
      {message ? <Notice {...message} /> : null}
      {projection ? (
        <>
          <div className="score-display large" aria-label="Public score">
            <div>
              <span>Home</span>
              <strong>{projection.homeScore}</strong>
            </div>
            <div>
              <span>Away</span>
              <strong>{projection.awayScore}</strong>
            </div>
          </div>
          <dl className="state-strip">
            <div><dt>Status</dt><dd>{projection.status}</dd></div>
            <div><dt>Period</dt><dd>{projection.periodNumber}</dd></div>
            <div><dt>Seq</dt><dd>{projection.currentSeq}</dd></div>
          </dl>
        </>
      ) : (
        <p>Loading scoreboard...</p>
      )}
    </section>
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
                  <a
                    href={buildAdminMatchLink(match.matchId)}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(buildAdminMatchLink(match.matchId));
                    }}
                  >
                    Officials
                  </a>
                ) : (
                  <a
                    href={buildOperatorMatchScoreLink(match.matchId)}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(buildOperatorMatchScoreLink(match.matchId));
                    }}
                  >
                    Score
                  </a>
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
      case "admin-officials":
        return (
          <ProtectedRoute requireAdmin>
            <AdminOfficialsPage matchId={route.matchId} />
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
      case "public-scoreboard":
        return <PublicScoreboardPage matchId={route.matchId} />;
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
