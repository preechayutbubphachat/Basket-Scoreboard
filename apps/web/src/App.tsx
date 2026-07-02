import React, { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  CommandResult,
  FoulType,
  MatchOfficialRoleCode,
  OperatorMatchSummary,
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
  buildAdminMatchActions,
  buildAdminMatchLink,
  buildOperatorMatchClockLink,
  buildOperatorMatchScoreLink,
  buildOperatorMatchFoulsLink,
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
  getScoreControlFeedback,
  getScoreControlLinks,
  getScoreControlPendingLabel,
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

type Route =
  | { name: "home" }
  | { name: "login" }
  | { name: "admin" }
  | { name: "admin-matches" }
  | { name: "admin-officials"; matchId: string }
  | { name: "operator-matches" }
  | { name: "operator-score"; matchId: string }
  | { name: "operator-fouls"; matchId: string }
  | { name: "operator-clock"; matchId: string }
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

  async function refreshAfterCommand(lastSeq: number) {
    const sync = await api.syncMatch(matchId, lastSeq);
    if (sync.projection) {
      setProjection(sync.projection);
      return;
    }
    setProjection(await api.getMatchProjection(matchId));
  }

  async function addScore(teamSide: ScoreControlTeamSide, points: ScoreControlPoint) {
    if (!projection || !canSubmitScore) return;
    const key = `${teamSide}-${points}`;
    setPendingKey(key);
    setMessage(null);
    const previousSeq = projection.currentSeq;

    try {
      const result = await api.addScore(matchId, buildScoreCommandPayload(projection, teamSide, points));

      if (result.status === "SYNC_REQUIRED" || result.reasonCode === "INVALID_EXPECTED_SEQ") {
        setMessage(getScoreControlFeedback(result));
        await refreshAfterCommand(previousSeq);
        return;
      }

      await refreshAfterCommand(previousSeq);
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
          </dl>
          <div className="score-actions">
            {buildScoreControlPanels(projection).map((panel) => (
              <div key={panel.teamSide}>
                <h2>{panel.teamName}</h2>
                <div className="button-row">
                  {panel.buttons.map((button) => {
                    return (
                      <button
                        key={button.pendingKey}
                        type="button"
                        className="score-button"
                        disabled={!canSubmitScore || Boolean(pendingKey)}
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
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [foulType, setFoulType] = useState<FoulType>("PERSONAL");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const canSubmitFoul = canOperateScore(currentUser);

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

  async function refreshAfterCommand(lastSeq: number) {
    const sync = await api.syncMatch(matchId, lastSeq);
    if (sync.projection) {
      setProjection(sync.projection);
      return;
    }
    setProjection(await api.getMatchProjection(matchId));
  }

  async function addTeamFoul(teamSide: FoulControlTeamSide) {
    if (!projection || !canSubmitFoul) return;
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
          <dl className="state-strip">
            <div><dt>Status</dt><dd>{projection.status}</dd></div>
            <div><dt>Period</dt><dd>{projection.periodNumber}</dd></div>
            <div><dt>Seq</dt><dd>{projection.currentSeq}</dd></div>
            <div><dt>Expected Seq</dt><dd>{projection.currentSeq}</dd></div>
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
                  disabled={!canSubmitFoul || Boolean(pendingKey)}
                  onClick={() => void addTeamFoul(panel.teamSide)}
                >
                  {pendingKey === panel.pendingKey ? "Saving..." : "Add Team Foul"}
                </button>
              </div>
            ))}
          </div>
          <section className="inline-panel">
            <h2>Player Fouls</h2>
            <p className="muted">Player foul controls require roster data. Team foul control is available.</p>
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

function PublicScoreboardPage({ matchId }: { matchId: string }) {
  const { api } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [projectionReceivedAtMs, setProjectionReceivedAtMs] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const nowMs = useLiveClockNow(Boolean(projection?.gameClock?.running || projection?.shotClock?.running));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const next = await api.getPublicScoreboard(matchId);
        if (!cancelled) {
          setProjection(next);
          setProjectionReceivedAtMs(Date.now());
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
