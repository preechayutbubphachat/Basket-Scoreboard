import React, { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  AlphaCorrectionResponse,
  CommandResult,
  CorrectionEligibleEvent,
  ActiveDisplaySceneResponse,
  DisplaySceneResponse,
  DisplayScreenResponse,
  EffectiveMatchAccess,
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
  OfficialCandidate,
  OperatorMatchSummary,
  PlayerPosition,
  ReplayGroupFilter,
  ReplayItem,
  PublicScoreboardProjection,
  ScoreboardProjection,
  TimeoutRequestedBy,
  TournamentLiveDashboardResponse,
  TournamentScheduleMatch,
  TournamentScheduleResponse,
  TournamentStandingsResponse,
  TournamentStandingsRow,
  TournamentSetupTeam,
  TournamentSummary,
  VenueSummary
} from "@basket-scoreboard/api-contracts";
import { AuthProvider, useCurrentUser } from "./auth/AuthProvider";
import { AuthenticatedDashboardShell, type AuthenticatedDashboardNavigationItem } from "./components/AuthenticatedDashboardShell";
import { ClockWorkspace } from "./components/ClockWorkspace";
import { LiveMatchShell } from "./components/LiveMatchShell";
import { PublicDisplayShell } from "./components/PublicDisplayShell";
import { PublicFinalSummaryDisplayScene } from "./components/PublicFinalSummaryDisplayScene";
import { PublicLiveScoreboard } from "./components/PublicLiveScoreboard";
import { UiCommandSafetyPanel, UiConnectionStatus } from "./components/ui";
import "./styles/authenticated-dashboard.css";
import { ApiClientError, getDefaultApiBaseUrl, type AssignmentRecord } from "./lib/apiClient";
import { shouldBootstrapAuthForPath } from "./lib/authRoutePolicy";
import {
  canManageAssignments,
  createAssignmentCandidateOptions,
  createAssignmentFormState,
  getAssignmentFormLabels,
  getProtectedRouteDecision,
  isAssignmentSubmitDisabled,
  matchOfficialRoleCodes,
  toAssignmentValidationMessage,
  validateAssignmentForm,
  validateRevokeReason,
  type AssignmentFormState
} from "./lib/adminAssignments";
import {
  buildAdminMatchActions,
  buildAdminMatchLink,
  buildOperatorMatchAuditLogLink,
  buildOperatorMatchClockLink,
  buildOperatorMatchCorrectionsLink,
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
  canOperateFoul,
  canOperateGameClock,
  canOperateShotClock,
  canOperateTimeout,
  canOperateLifecycle,
  createEmptyOperatorMatchesMessage,
  getTeamLabel
} from "./lib/operatorMatches";
import {
  buildLiveMatchNavigation,
  buildLiveMatchPresentationContext
} from "./lib/liveMatchPresentation";
import {
  buildOperatorLiveCommandStatus,
  buildOperatorLiveConnection,
  buildOperatorScoreCommandStatus,
  buildOperatorScoreConnection
} from "./lib/operatorScoreShell";
import {
  buildScoreCommandPayload,
  buildScoreControlPanels,
  canUseLiveMatchControls,
  finishedMatchLiveControlWarning,
  getAcceptedScoreProjection,
  getScoreControlFeedback,
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
  type FoulControlTeamSide
} from "./lib/foulControl";
import {
  buildClockControlState,
  buildGameClockSetPayload,
  buildShotClockResetPayload,
  buildShotClockSetPayload,
  getClockControlFeedback
} from "./lib/clockControl";
import {
  buildTimeoutControlPanels,
  buildTimeoutEndPayload,
  buildTimeoutGrantPayload,
  getActiveTimeoutLabel,
  getTimeoutControlFeedback,
  timeoutRequestedByOptions,
  type TimeoutControlTeamSide
} from "./lib/timeoutControl";
import {
  buildLifecycleCommandPayload,
  buildLifecycleControlState,
  buildLifecycleReadinessContext,
  buildMatchStartChecklist,
  getLifecycleActionPlan,
  getLifecycleControlFeedback,
  getLifecycleControlLinks,
  type LifecycleAction
} from "./lib/lifecycleControl";
import {
  buildCreatePlayerPayload,
  buildLineupSetupSummary,
  buildPlayerFoulCommandPayload,
  buildRosterPlayerDisplayLabel,
  buildRosterPlayerLabel,
  buildRosterReadinessLabel,
  buildRosterSetupSummary,
  buildSetupQuickLinks,
  buildScorePlayerOptions,
  createPlayerFormState,
  getRosterPlayersForSide,
  getRosterTeamLabel,
  type CreatePlayerFormState
} from "./lib/rosterControl";
import {
  buildReplayEventGroupOptions,
  buildReplayEventMeta,
  buildReplayCorrectionDetail,
  buildReplayRowClassName,
  getReplayScoreAfterLabel
} from "./lib/replayControl";
import {
  buildAuditCorrectionDetailRows,
  buildAuditLogFilterOptions,
  buildAuditLogRowMeta,
  buildAuditRowClassName,
  getAuditCorrectionRows
} from "./lib/auditLogControl";
import {
  buildCorrectionCommandPayload,
  buildCorrectionEventMeta,
  buildCorrectionNavItems,
  canSubmitCorrectionReason,
  getCorrectionControlFeedback
} from "./lib/correctionControl";
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
  buildSelectedCourtPreview,
  buildScheduleRowMeta,
  buildScheduleStatusFilters,
  buildVenueCourtOptions,
  buildTournamentQuickLinks,
  createCourtFormState,
  createCourtPayload,
  createScheduledMatchFormState,
  createTeamFormState,
  createTeamPayload,
  createTournamentFormState,
  createTournamentMatchPayload,
  createTournamentPayload,
  createVenueFormState,
  createVenuePayload,
  buildStandingsRowMeta,
  getPublicScheduleEmptyState,
  getPublicStandingsEmptyState,
  getPublicScheduleLinks,
  getPublicStandingsLinks,
  getScheduleConflictSummary,
  getScheduledMatchConflictWarning,
  getScheduledMatchFormFeedback,
  getScheduleStatusGroup,
  getTournamentEmptyState,
  type CourtFormState,
  type ScheduledMatchFormState,
  type ScheduleStatusFilter,
  type VenueFormState
} from "./lib/scheduleControl";
import {
  buildAdminTournamentLiveDashboardLink,
  buildLiveDashboardCard,
  buildLiveDashboardFilters,
  buildLiveDashboardSummary,
  buildOperatorTournamentLiveDashboardLink,
  filterLiveDashboardMatches,
  getLiveDashboardEmptyState,
  type LiveDashboardFilter
} from "./lib/liveDashboardControl";
import {
  buildDisplayThemePreviewModel,
  createMatchDisplayOverrideFormState,
  createMatchDisplayOverridePayload,
  createTeamDisplayProfileFormState,
  createTeamDisplayProfilePayload,
  createTournamentDisplayThemeFormState,
  createTournamentDisplayThemePayload,
  displayBackgroundStyleOptions,
  getDisplayThemeSaveState,
  getLogoPreviewState,
  validateMatchDisplayOverrideForm,
  validateTeamDisplayProfileForm,
  validateTournamentDisplayThemeForm,
  type DisplayThemePreviewModel,
  type MatchDisplayOverrideFormState,
  type TeamDisplayProfileFormState,
  type TournamentDisplayThemeFormState
} from "./lib/displayThemeControl";
import {
  buildAdminDisplayScreenDetailLink,
  buildAdminDisplayScreenNewLink,
  buildAdminDisplayScreenPreviewLink,
  buildAdminDisplayScreensLink,
  buildAdminDisplayScreenScenesLink,
  buildDisplaySceneActivationConfirmation,
  buildPublicDisplayScreenLink,
  createDisplaySceneFormState,
  createDisplayScenePayload,
  createDisplaySceneUpdatePayload,
  createDisplayScreenFormState,
  createDisplayScreenPayload,
  createDisplayScreenUpdatePayload,
  displaySceneTypeOptions,
  getDisplaySceneConfigSummary,
  getDisplaySceneMatchId,
  getDisplaySceneSaveState,
  getDisplayScreenSaveState,
  getFinalSummaryMatchReadiness,
  getFinalSummarySceneReadiness,
  getPublicDisplayPreviewSummary,
  getPublicActiveSceneSummary,
  getPublicSchedulePreviewSummary,
  getScheduleSceneHandoff,
  isPublicActiveDisplayScreen,
  publicDisplayPreviewHasPrivateExposure,
  validateDisplaySceneForm,
  validateDisplayScreenForm,
  type DisplaySceneActivationConfirmation,
  type DisplaySceneFormState,
  type DisplayScreenFormState
} from "./lib/displayScreenControl";
import {
  buildPublicDisplaySceneModel,
  formatPublicScheduleDisplayLocation,
  formatPublicScheduleDisplayTime,
  getPublicDisplaySceneRefreshMs,
  type PublicDisplaySceneModel
} from "./lib/publicDisplayScene";
import {
  buildPublicArenaMatchMetadataDisplay,
  buildPublicScoreboardTeamLabels,
  buildPublicScoreboardDisplayLink,
  buildPublicScoreboardClockState,
  buildPublicScoreboardDisplayModel,
  getPublicDisplayControlsClassName,
  isPublicDisplayKioskMode,
  toPublicRecentActionDisplay
} from "./lib/publicScoreboardDisplay";
import { buildSummaryPlayerLabels, getSummaryTeamTotals } from "./lib/summaryControl";
import {
  applyRealtimeProjectionUpdate,
  createPublicProjectionSocket,
  getOperatorPollingIntervalMs,
  getPublicPollingIntervalMs,
  getRealtimeConnectionLabel,
  type RealtimeConnectionState
} from "./lib/realtimeProjectionSync";

type Route =
  | { name: "home" }
  | { name: "login" }
  | { name: "admin" }
  | { name: "admin-matches" }
  | { name: "admin-tournaments" }
  | { name: "admin-tournament-schedule"; tournamentId: string }
  | { name: "admin-tournament-live-dashboard"; tournamentId: string }
  | { name: "admin-tournament-standings"; tournamentId: string }
  | { name: "admin-tournament-display-theme"; tournamentId: string }
  | { name: "admin-team-display-profile"; teamId: string }
  | { name: "admin-match-display-theme"; matchId: string }
  | { name: "admin-display-screens" }
  | { name: "admin-display-screen-new" }
  | { name: "admin-display-screen-detail"; screenId: string }
  | { name: "admin-display-screen-scenes"; screenId: string }
  | { name: "admin-display-screen-preview"; screenId: string }
  | { name: "admin-officials"; matchId: string }
  | { name: "admin-rosters"; matchId: string }
  | { name: "admin-lineup"; matchId: string }
  | { name: "admin-summary"; matchId: string }
  | { name: "admin-replay"; matchId: string }
  | { name: "admin-audit-log"; matchId: string }
  | { name: "operator-matches" }
  | { name: "operator-tournament-live-dashboard"; tournamentId: string }
  | { name: "operator-score"; matchId: string }
  | { name: "operator-fouls"; matchId: string }
  | { name: "operator-clock"; matchId: string }
  | { name: "operator-timeouts"; matchId: string }
  | { name: "operator-lifecycle"; matchId: string }
  | { name: "operator-corrections"; matchId: string }
  | { name: "operator-summary"; matchId: string }
  | { name: "operator-replay"; matchId: string }
  | { name: "operator-audit-log"; matchId: string }
  | { name: "public-display-scene"; screenSlug: string }
  | { name: "public-scoreboard"; matchId: string }
  | { name: "public-scoreboard-display"; matchId: string }
  | { name: "public-tournaments" }
  | { name: "public-tournament-schedule"; tournamentId: string }
  | { name: "public-tournament-standings"; tournamentId: string }
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
  const adminTournamentLiveDashboardMatch = pathname.match(/^\/admin\/tournaments\/([^/]+)\/live-dashboard$/);
  const adminLiveDashboardTournamentId = adminTournamentLiveDashboardMatch?.[1];
  if (adminLiveDashboardTournamentId) {
    return { name: "admin-tournament-live-dashboard", tournamentId: decodeURIComponent(adminLiveDashboardTournamentId) };
  }
  const adminTournamentStandingsMatch = pathname.match(/^\/admin\/tournaments\/([^/]+)\/standings$/);
  const adminStandingsTournamentId = adminTournamentStandingsMatch?.[1];
  if (adminStandingsTournamentId) {
    return { name: "admin-tournament-standings", tournamentId: decodeURIComponent(adminStandingsTournamentId) };
  }
  const adminTournamentDisplayThemeMatch = pathname.match(/^\/admin\/tournaments\/([^/]+)\/display-theme$/);
  const adminDisplayThemeTournamentId = adminTournamentDisplayThemeMatch?.[1];
  if (adminDisplayThemeTournamentId) {
    return { name: "admin-tournament-display-theme", tournamentId: decodeURIComponent(adminDisplayThemeTournamentId) };
  }
  const adminTeamDisplayProfileMatch = pathname.match(/^\/admin\/teams\/([^/]+)\/display-profile$/);
  const adminDisplayProfileTeamId = adminTeamDisplayProfileMatch?.[1];
  if (adminDisplayProfileTeamId) {
    return { name: "admin-team-display-profile", teamId: decodeURIComponent(adminDisplayProfileTeamId) };
  }
  const adminMatchDisplayThemeMatch = pathname.match(/^\/admin\/matches\/([^/]+)\/display-theme$/);
  const adminDisplayThemeMatchId = adminMatchDisplayThemeMatch?.[1];
  if (adminDisplayThemeMatchId) {
    return { name: "admin-match-display-theme", matchId: decodeURIComponent(adminDisplayThemeMatchId) };
  }
  const adminDisplayScreenScenesMatch = pathname.match(/^\/admin\/display-screens\/([^/]+)\/scenes$/);
  const adminDisplayScreenScenesId = adminDisplayScreenScenesMatch?.[1];
  if (adminDisplayScreenScenesId) {
    return { name: "admin-display-screen-scenes", screenId: decodeURIComponent(adminDisplayScreenScenesId) };
  }
  const adminDisplayScreenPreviewMatch = pathname.match(/^\/admin\/display-screens\/([^/]+)\/preview$/);
  const adminDisplayScreenPreviewId = adminDisplayScreenPreviewMatch?.[1];
  if (adminDisplayScreenPreviewId) {
    return { name: "admin-display-screen-preview", screenId: decodeURIComponent(adminDisplayScreenPreviewId) };
  }
  const adminDisplayScreenDetailMatch = pathname.match(/^\/admin\/display-screens\/([^/]+)$/);
  const adminDisplayScreenDetailId = adminDisplayScreenDetailMatch?.[1];
  if (adminDisplayScreenDetailId && adminDisplayScreenDetailId !== "new") {
    return { name: "admin-display-screen-detail", screenId: decodeURIComponent(adminDisplayScreenDetailId) };
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
  const operatorCorrectionsMatch = pathname.match(/^\/operator\/matches\/([^/]+)\/corrections$/);
  const operatorCorrectionsMatchId = operatorCorrectionsMatch?.[1];
  if (operatorCorrectionsMatchId) {
    return { name: "operator-corrections", matchId: decodeURIComponent(operatorCorrectionsMatchId) };
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
  const operatorTournamentLiveDashboardMatch = pathname.match(/^\/operator\/tournaments\/([^/]+)\/live-dashboard$/);
  const operatorLiveDashboardTournamentId = operatorTournamentLiveDashboardMatch?.[1];
  if (operatorLiveDashboardTournamentId) {
    return { name: "operator-tournament-live-dashboard", tournamentId: decodeURIComponent(operatorLiveDashboardTournamentId) };
  }
  const publicDisplaySceneMatch = pathname.match(/^\/public\/display\/([^/]+)$/);
  const publicDisplayScreenSlug = publicDisplaySceneMatch?.[1];
  if (publicDisplayScreenSlug) {
    return { name: "public-display-scene", screenSlug: decodeURIComponent(publicDisplayScreenSlug) };
  }
  const publicScoreboardDisplayMatch = pathname.match(/^\/public\/scoreboard\/([^/]+)\/display$/);
  const publicDisplayMatchId = publicScoreboardDisplayMatch?.[1];
  if (publicDisplayMatchId) {
    return { name: "public-scoreboard-display", matchId: decodeURIComponent(publicDisplayMatchId) };
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
  const publicTournamentStandingsMatch = pathname.match(/^\/public\/tournaments\/([^/]+)\/standings$/);
  const publicStandingsTournamentId = publicTournamentStandingsMatch?.[1];
  if (publicStandingsTournamentId) {
    return { name: "public-tournament-standings", tournamentId: decodeURIComponent(publicStandingsTournamentId) };
  }
  if (pathname === "/login") return { name: "login" };
  if (pathname === "/admin") return { name: "admin" };
  if (pathname === "/admin/matches") return { name: "admin-matches" };
  if (pathname === "/admin/tournaments") return { name: "admin-tournaments" };
  if (pathname === "/admin/display-screens") return { name: "admin-display-screens" };
  if (pathname === "/admin/display-screens/new") return { name: "admin-display-screen-new" };
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
      <h2>Match administration</h2>
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
      <p>
        <a href={buildAdminDisplayScreensLink()} onClick={(event) => { event.preventDefault(); navigate(buildAdminDisplayScreensLink()); }}>
          Manage display screens
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

function AdminDashboardHome() {
  const { currentUser, roleSummary, logout } = useCurrentUser();
  const navigationItems: AuthenticatedDashboardNavigationItem[] = [
    { href: "/admin", label: "Admin", current: true },
    { href: "/admin/tournaments", label: "Tournaments" },
    { href: "/public/tournaments", label: "Public Schedule" },
    ...(currentUser && canAccessOperatorMatches(currentUser)
      ? [{ href: "/operator/matches", label: "Operator Matches" }]
      : [])
  ].map((item) => ({
    ...item,
    onClick: (event) => {
      event.preventDefault();
      navigate(item.href);
    }
  }));
  const displayName = currentUser?.displayName ?? currentUser?.email ?? currentUser?.userId ?? "Authenticated user";

  async function onLogout(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    await logout();
    navigate("/login");
  }

  return (
    <AuthenticatedDashboardShell
      actions={<a href="/login" onClick={onLogout}>Logout</a>}
      brand={{
        href: "/",
        label: "Basketball Scoreboard",
        onClick: (event) => {
          event.preventDefault();
          navigate("/");
        }
      }}
      contextLabel="Tournament operations"
      navigationItems={navigationItems}
      statusContent={<UiConnectionStatus label="Authenticated session" state="connected" />}
      subtitle="Assignments, tournaments, and public display operations"
      title="Admin Dashboard"
      userContent={<><strong>{displayName}</strong><span>{roleSummary}</span></>}
      secondaryRail={(
        <>
          <UiCommandSafetyPanel
            confirmationMessage="Sensitive actions require explicit confirmation when provided by their protected workflow."
            readOnlyMessage="This overview does not submit match commands."
          />
          <section aria-labelledby="admin-workspace-status-heading" className="authenticated-dashboard-workspace-summary">
            <h2 id="admin-workspace-status-heading">Workspace status</h2>
            <dl>
              <div><dt>Access</dt><dd>{roleSummary}</dd></div>
              <div><dt>Surface</dt><dd>Administration</dd></div>
            </dl>
          </section>
        </>
      )}
    >
      <AdminHome />
    </AuthenticatedDashboardShell>
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
  const [form, setForm] = useState(createTournamentFormState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  const emptyState = getTournamentEmptyState();

  async function handleCreateTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage({ tone: "success", text: "Saving tournament..." });
    try {
      await api.createTournament(createTournamentPayload(form));
      setForm(createTournamentFormState());
      await loadTournaments();
      setMessage({ tone: "success", text: "Tournament created." });
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <h1>Tournaments</h1>
      <p className="muted">Create tournament containers and review schedules using projection state.</p>
      {message ? <Notice {...message} /> : null}
      <form className="stacked-form" onSubmit={(event) => void handleCreateTournament(event)}>
        <h2>{emptyState.primaryActionLabel}</h2>
        <label>
          Tournament name
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Alpha Cup"
            required
            maxLength={200}
          />
        </label>
        <label>
          Status
          <select
            value={form.status}
            onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as typeof current.status }))}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="DRAFT">DRAFT</option>
          </select>
        </label>
        <label>
          Starts at
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
          />
        </label>
        <label>
          Ends at
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
          />
        </label>
        <button type="submit" disabled={saving || form.name.trim().length === 0}>
          {saving ? "Saving..." : "Create Tournament"}
        </button>
      </form>
      {loading ? <p>Loading tournaments...</p> : null}
      {!loading && tournaments.length === 0 ? (
        <section className="empty-state">
          <h2>{emptyState.title}</h2>
          <p>{emptyState.description}</p>
          <p className="muted">{emptyState.helperText}</p>
        </section>
      ) : null}
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
                const links = buildTournamentQuickLinks(tournament.tournamentId);
                return (
                  <tr key={tournament.tournamentId}>
                    <td>{tournament.name}</td>
                    <td>{tournament.status}</td>
                    <td>{tournament.matchCount}</td>
                    <td>{tournament.liveMatchCount}</td>
                    <td>{tournament.finishedMatchCount}</td>
                    <td>
                      <span className="inline-actions">
                        {links.map((link) => (
                          <a
                            key={link.href}
                            className={link.private ? undefined : "public-link"}
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
  const [teams, setTeams] = useState<TournamentSetupTeam[]>([]);
  const [venues, setVenues] = useState<VenueSummary[]>([]);
  const [teamForm, setTeamForm] = useState(() => createTeamFormState(tournamentId));
  const [venueForm, setVenueForm] = useState<VenueFormState>(createVenueFormState);
  const [courtForm, setCourtForm] = useState<CourtFormState>(createCourtFormState);
  const [matchForm, setMatchForm] = useState(createScheduledMatchFormState);
  const [filter, setFilter] = useState<ScheduleStatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [savingSetup, setSavingSetup] = useState<"team" | "match" | "venue" | "court" | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  async function loadSchedule() {
    setLoading(true);
    setMessage(null);
    try {
      const [nextSchedule, nextTeams, nextVenues] = await Promise.all([
        api.getTournamentSchedule(tournamentId),
        api.listTeams(),
        api.getVenues()
      ]);
      setSchedule(nextSchedule);
      setTeams(nextTeams);
      setVenues(nextVenues);
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setTeamForm(createTeamFormState(tournamentId));
    setVenueForm(createVenueFormState());
    setCourtForm(createCourtFormState());
    setMatchForm(createScheduledMatchFormState());
    void loadSchedule();
  }, [api, tournamentId]);

  const matches = filterScheduleMatches(schedule?.matches ?? [], filter);
  const tournamentTeams = teams.filter((team) => team.tournamentId === null || team.tournamentId === tournamentId);
  const courtOptions = buildVenueCourtOptions(venues);
  const selectedCourtPreview = buildSelectedCourtPreview(venues, matchForm.courtId);
  const matchFormFeedback = getScheduledMatchFormFeedback(matchForm, tournamentTeams.length, savingSetup === "match");
  const scheduleConflictSummary = getScheduleConflictSummary(schedule?.matches ?? []);
  const matchConflictWarning = getScheduledMatchConflictWarning(matchForm, schedule?.matches ?? [], venues);

  async function handleCreateTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSetup("team");
    setMessage({ tone: "success", text: "Saving team..." });
    try {
      await api.createTeam(createTeamPayload(teamForm));
      setTeamForm(createTeamFormState(tournamentId));
      await loadSchedule();
      setMessage({ tone: "success", text: "Team created." });
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setSavingSetup(null);
    }
  }

  async function handleCreateVenue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSetup("venue");
    setMessage({ tone: "success", text: "Saving venue..." });
    try {
      await api.createVenue(createVenuePayload(venueForm));
      setVenueForm(createVenueFormState());
      await loadSchedule();
      setMessage({ tone: "success", text: "Venue created." });
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setSavingSetup(null);
    }
  }

  async function handleCreateCourt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSetup("court");
    setMessage({ tone: "success", text: "Saving court..." });
    try {
      await api.createCourt(courtForm.venueId, createCourtPayload(courtForm));
      setCourtForm(createCourtFormState());
      await loadSchedule();
      setMessage({ tone: "success", text: "Court created." });
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setSavingSetup(null);
    }
  }

  async function handleCreateMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSetup("match");
    setMessage({ tone: "success", text: "Saving match..." });
    try {
      await api.createTournamentMatch(tournamentId, createTournamentMatchPayload(matchForm));
      setMatchForm(createScheduledMatchFormState());
      await loadSchedule();
      setMessage({ tone: "success", text: "Scheduled match created." });
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setSavingSetup(null);
    }
  }

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
          <a className="button-link secondary" href={buildAdminTournamentStandingsLink(tournamentId)} onClick={(event) => { event.preventDefault(); navigate(buildAdminTournamentStandingsLink(tournamentId)); }}>
            Open Standings
          </a>
          <a className="button-link secondary" href={buildAdminTournamentLiveDashboardLink(tournamentId)} onClick={(event) => { event.preventDefault(); navigate(buildAdminTournamentLiveDashboardLink(tournamentId)); }}>
            Main Live Dashboard
          </a>
          <a className="button-link secondary" href={buildAdminTournamentDisplayThemeLink(tournamentId)} onClick={(event) => { event.preventDefault(); navigate(buildAdminTournamentDisplayThemeLink(tournamentId)); }}>
            Display Theme
          </a>
          <a className="button-link secondary public-link" href={buildPublicTournamentScheduleLink(tournamentId)} onClick={(event) => { event.preventDefault(); navigate(buildPublicTournamentScheduleLink(tournamentId)); }}>
            Public Schedule
          </a>
          <a className="button-link secondary public-link" href={buildPublicTournamentStandingsLink(tournamentId)} onClick={(event) => { event.preventDefault(); navigate(buildPublicTournamentStandingsLink(tournamentId)); }}>
            Public Standings
          </a>
          <button type="button" onClick={() => void loadSchedule()}>Refresh</button>
        </div>
      </div>
      {message ? <Notice {...message} /> : null}
      {schedule ? <TournamentSummaryStrip tournament={schedule.tournament} /> : null}
      {scheduleConflictSummary ? (
        <div className="notice warning" role="status">
          <strong>Schedule warnings found</strong>
          <span>{scheduleConflictSummary}</span>
        </div>
      ) : null}
      <div className="setup-grid">
        <form className="stacked-form" onSubmit={(event) => void handleCreateTeam(event)}>
          <h2>Create Team</h2>
          <label>
            Team name
            <input
              value={teamForm.name}
              onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Bangkok Home"
              required
              maxLength={200}
            />
          </label>
          <label>
            Short name
            <input
              value={teamForm.shortName}
              onChange={(event) => setTeamForm((current) => ({ ...current, shortName: event.target.value }))}
              placeholder="BKK"
              maxLength={40}
            />
          </label>
          <button type="submit" disabled={savingSetup !== null || teamForm.name.trim().length === 0}>
            {savingSetup === "team" ? "Saving..." : "Create Team"}
          </button>
        </form>
        <form className="stacked-form" onSubmit={(event) => void handleCreateVenue(event)}>
          <h2>Create Venue</h2>
          <label>
            Venue name
            <input
              value={venueForm.name}
              onChange={(event) => setVenueForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Main Hall"
              required
              maxLength={200}
            />
          </label>
          <label>
            Short name
            <input
              value={venueForm.shortName}
              onChange={(event) => setVenueForm((current) => ({ ...current, shortName: event.target.value }))}
              placeholder="MH"
              maxLength={80}
            />
          </label>
          <label>
            Address
            <input
              value={venueForm.address}
              onChange={(event) => setVenueForm((current) => ({ ...current, address: event.target.value }))}
              placeholder="Bangkok"
              maxLength={500}
            />
          </label>
          <button type="submit" disabled={savingSetup !== null || venueForm.name.trim().length === 0}>
            {savingSetup === "venue" ? "Saving..." : "Create Venue"}
          </button>
        </form>
        <form className="stacked-form" onSubmit={(event) => void handleCreateCourt(event)}>
          <h2>Create Court</h2>
          <label>
            Venue
            <select
              value={courtForm.venueId}
              onChange={(event) => setCourtForm((current) => ({ ...current, venueId: event.target.value }))}
              required
            >
              <option value="">Select venue</option>
              {venues.map((venue) => <option key={venue.venueId} value={venue.venueId}>{venue.name}</option>)}
            </select>
          </label>
          <label>
            Court label
            <input
              value={courtForm.label}
              onChange={(event) => setCourtForm((current) => ({ ...current, label: event.target.value }))}
              placeholder="Court A"
              required
              maxLength={80}
            />
          </label>
          <label>
            Display name
            <input
              value={courtForm.displayName}
              onChange={(event) => setCourtForm((current) => ({ ...current, displayName: event.target.value }))}
              placeholder="Main Hall / Court A"
              maxLength={120}
            />
          </label>
          <button type="submit" disabled={savingSetup !== null || !courtForm.venueId || courtForm.label.trim().length === 0}>
            {savingSetup === "court" ? "Saving..." : "Create Court"}
          </button>
        </form>
        <form className="stacked-form" onSubmit={(event) => void handleCreateMatch(event)}>
          <h2>Create Scheduled Match</h2>
          {matchFormFeedback.warning ? <p className="muted">{matchFormFeedback.warning}</p> : null}
          {matchConflictWarning ? <p className="schedule-warning">{matchConflictWarning}</p> : null}
          <label>
            Home team
            <select
              value={matchForm.homeTeamId}
              onChange={(event) => setMatchForm((current) => ({ ...current, homeTeamId: event.target.value }))}
              required
            >
              <option value="">Select home team</option>
              {tournamentTeams.map((team) => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}
            </select>
          </label>
          <label>
            Away team
            <select
              value={matchForm.awayTeamId}
              onChange={(event) => setMatchForm((current) => ({ ...current, awayTeamId: event.target.value }))}
              required
            >
              <option value="">Select away team</option>
              {tournamentTeams.map((team) => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}
            </select>
          </label>
          <label>
            Scheduled at
            <input
              type="datetime-local"
              value={matchForm.scheduledAt}
              onChange={(event) => setMatchForm((current) => ({ ...current, scheduledAt: event.target.value }))}
            />
          </label>
          <label>
            Round
            <input
              value={matchForm.roundLabel}
              onChange={(event) => setMatchForm((current) => ({ ...current, roundLabel: event.target.value }))}
              placeholder="Round 1"
              maxLength={80}
            />
          </label>
          <label>
            Court assignment
            <select
              value={matchForm.courtId}
              onChange={(event) => setMatchForm((current) => ({ ...current, courtId: event.target.value }))}
            >
              <option value="">No court selected</option>
              {courtOptions.map((court) => <option key={court.value} value={court.value}>{court.label}</option>)}
            </select>
          </label>
          {selectedCourtPreview ? <p className="muted">{selectedCourtPreview}</p> : null}
          <label>
            Court
            <input
              value={matchForm.courtLabel}
              onChange={(event) => setMatchForm((current) => ({ ...current, courtLabel: event.target.value }))}
              placeholder="Court A"
              maxLength={80}
              disabled={Boolean(matchForm.courtId)}
            />
          </label>
          <label>
            Venue
            <input
              value={matchForm.venueLabel}
              onChange={(event) => setMatchForm((current) => ({ ...current, venueLabel: event.target.value }))}
              placeholder="Main Hall"
              maxLength={200}
              disabled={Boolean(matchForm.courtId)}
            />
          </label>
          <button
            type="submit"
            disabled={matchFormFeedback.disabled}
          >
            {savingSetup === "match" ? "Saving..." : "Create Scheduled Match"}
          </button>
        </form>
      </div>
      {venues.length > 0 ? (
        <section className="panel compact-panel">
          <h2>Venues and Courts</h2>
          <div className="match-grid">
            {venues.map((venue) => (
              <article className="match-card" key={venue.venueId}>
                <h3>{venue.name}</h3>
                <p className="muted">{venue.shortName ?? "No short name"}</p>
                <p className="muted">{venue.address ?? "No address"}</p>
                {venue.courts.length > 0 ? (
                  <ul>
                    {venue.courts.map((court) => (
                      <li key={court.courtId}>{court.displayName ?? court.label}{court.active ? "" : " (inactive)"}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No courts yet.</p>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {tournamentTeams.length > 0 ? (
        <section className="panel compact-panel">
          <h2>Team Display Profiles</h2>
          <p className="muted">Optional public display branding profiles. These settings do not change match scores or event history.</p>
          <div className="inline-actions">
            {tournamentTeams.map((team) => {
              const href = buildAdminTeamDisplayProfileLink(team.teamId);
              return (
                <a
                  key={team.teamId}
                  href={href}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(href);
                  }}
                >
                  {team.name}
                </a>
              );
            })}
          </div>
        </section>
      ) : null}
      <ScheduleFilterBar value={filter} onChange={setFilter} />
      {loading ? <p>Loading schedule...</p> : null}
      {!loading && matches.length === 0 ? (
        <section className="empty-state">
          <h2>No scheduled matches</h2>
          <p>{schedule?.matches.length ? "No matches match the current filter." : "Create a scheduled match to populate this tournament schedule."}</p>
        </section>
      ) : null}
      {matches.length > 0 ? <ScheduleTable matches={matches} mode="admin" /> : null}
    </section>
  );
}

function AdminTournamentDisplayThemePage({ tournamentId }: { tournamentId: string }) {
  const { api } = useCurrentUser();
  const [form, setForm] = useState<TournamentDisplayThemeFormState>(() => createTournamentDisplayThemeFormState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  async function loadTheme() {
    setLoading(true);
    setMessage(null);
    try {
      const theme = await api.getTournamentDisplayTheme(tournamentId);
      setForm(createTournamentDisplayThemeFormState(theme));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTheme();
  }, [api, tournamentId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = validateTournamentDisplayThemeForm(form);
    if (validationMessage) {
      setMessage({ tone: "error", text: validationMessage, code: "VALIDATION_ERROR" });
      return;
    }

    setSaving(true);
    setMessage({ tone: "success", text: "Saving display theme..." });
    try {
      const theme = await api.saveTournamentDisplayTheme(tournamentId, createTournamentDisplayThemePayload(form));
      setForm(createTournamentDisplayThemeFormState(theme));
      setMessage({ tone: "success", text: "Tournament display theme saved." });
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const preview = buildDisplayThemePreviewModel({ tournament: form });
  const validationMessage = validateTournamentDisplayThemeForm(form);
  const saveState = getDisplayThemeSaveState({ saving, routeId: tournamentId, validationMessage });

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin display branding</p>
          <h1>Tournament Display Theme</h1>
          <p className="muted">Tournament ID: {tournamentId}</p>
        </div>
        <div className="button-row">
          <a className="button-link secondary" href={buildAdminTournamentScheduleLink(tournamentId)} onClick={(event) => { event.preventDefault(); navigate(buildAdminTournamentScheduleLink(tournamentId)); }}>
            Schedule
          </a>
          <button type="button" onClick={() => void loadTheme()} disabled={loading || saving}>Refresh</button>
        </div>
      </div>
      {message ? <Notice {...message} /> : null}
      {loading ? <p>Loading display theme...</p> : null}
      {!loading && validationMessage ? <p className="form-validation">{validationMessage}</p> : null}
      <div className="display-theme-grid">
        <form className="stacked-form display-theme-form" onSubmit={(event) => void handleSave(event)}>
          <h2>Theme settings</h2>
          <TextInput label="Display name" value={form.displayName} maxLength={120} onChange={(value) => setForm((current) => ({ ...current, displayName: value }))} />
          <TextInput label="Logo path" value={form.logoUrl} maxLength={500} placeholder="/assets/branding/tournaments/cup.png" onChange={(value) => setForm((current) => ({ ...current, logoUrl: value }))} />
          <ColorInput label="Primary color" value={form.primaryColor} onChange={(value) => setForm((current) => ({ ...current, primaryColor: value }))} />
          <ColorInput label="Secondary color" value={form.secondaryColor} onChange={(value) => setForm((current) => ({ ...current, secondaryColor: value }))} />
          <ColorInput label="Accent color" value={form.accentColor} onChange={(value) => setForm((current) => ({ ...current, accentColor: value }))} />
          <ColorInput label="Text color" value={form.textColor} onChange={(value) => setForm((current) => ({ ...current, textColor: value }))} />
          <label>
            Background style
            <select value={form.backgroundStyle} onChange={(event) => setForm((current) => ({ ...current, backgroundStyle: event.target.value as TournamentDisplayThemeFormState["backgroundStyle"] }))}>
              {displayBackgroundStyleOptions.map((style) => <option key={style} value={style}>{style}</option>)}
            </select>
          </label>
          <CheckboxInput label="Show tournament logo" checked={form.showTournamentLogo} onChange={(value) => setForm((current) => ({ ...current, showTournamentLogo: value }))} />
          <CheckboxInput label="Active" checked={form.active} onChange={(value) => setForm((current) => ({ ...current, active: value }))} />
          <button type="submit" disabled={saveState.disabled}>{saving ? "Saving..." : "Save Theme"}</button>
        </form>
        <DisplayThemePreviewPanel preview={preview} />
      </div>
    </section>
  );
}

function AdminTeamDisplayProfilePage({ teamId }: { teamId: string }) {
  const { api } = useCurrentUser();
  const [form, setForm] = useState<TeamDisplayProfileFormState>(() => createTeamDisplayProfileFormState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  async function loadProfile() {
    setLoading(true);
    setMessage(null);
    try {
      const profile = await api.getTeamDisplayProfile(teamId);
      setForm(createTeamDisplayProfileFormState(profile));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, [api, teamId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = validateTeamDisplayProfileForm(form);
    if (validationMessage) {
      setMessage({ tone: "error", text: validationMessage, code: "VALIDATION_ERROR" });
      return;
    }

    setSaving(true);
    setMessage({ tone: "success", text: "Saving display profile..." });
    try {
      const profile = await api.saveTeamDisplayProfile(teamId, createTeamDisplayProfilePayload(form));
      setForm(createTeamDisplayProfileFormState(profile));
      setMessage({ tone: "success", text: "Team display profile saved." });
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const preview = buildDisplayThemePreviewModel({ home: form });
  const validationMessage = validateTeamDisplayProfileForm(form);
  const saveState = getDisplayThemeSaveState({ saving, routeId: teamId, validationMessage });

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin display branding</p>
          <h1>Team Display Profile</h1>
          <p className="muted">Team ID: {teamId}</p>
        </div>
        <div className="button-row">
          <a className="button-link secondary" href="/admin/tournaments" onClick={(event) => { event.preventDefault(); navigate("/admin/tournaments"); }}>
            Tournaments
          </a>
          <button type="button" onClick={() => void loadProfile()} disabled={loading || saving}>Refresh</button>
        </div>
      </div>
      {message ? <Notice {...message} /> : null}
      {loading ? <p>Loading display profile...</p> : null}
      {!loading && validationMessage ? <p className="form-validation">{validationMessage}</p> : null}
      <div className="display-theme-grid">
        <form className="stacked-form display-theme-form" onSubmit={(event) => void handleSave(event)}>
          <h2>Profile settings</h2>
          <TextInput label="Display name" value={form.displayName} maxLength={80} onChange={(value) => setForm((current) => ({ ...current, displayName: value }))} />
          <TextInput label="Logo path" value={form.logoUrl} maxLength={500} placeholder="/assets/branding/teams/team.png" onChange={(value) => setForm((current) => ({ ...current, logoUrl: value }))} />
          <ColorInput label="Primary color" value={form.primaryColor} onChange={(value) => setForm((current) => ({ ...current, primaryColor: value }))} />
          <ColorInput label="Secondary color" value={form.secondaryColor} onChange={(value) => setForm((current) => ({ ...current, secondaryColor: value }))} />
          <ColorInput label="Accent color" value={form.accentColor} onChange={(value) => setForm((current) => ({ ...current, accentColor: value }))} />
          <ColorInput label="Text color" value={form.textColor} onChange={(value) => setForm((current) => ({ ...current, textColor: value }))} />
          <CheckboxInput label="Show team logo" checked={form.showTeamLogo} onChange={(value) => setForm((current) => ({ ...current, showTeamLogo: value }))} />
          <CheckboxInput label="Active" checked={form.active} onChange={(value) => setForm((current) => ({ ...current, active: value }))} />
          <button type="submit" disabled={saveState.disabled}>{saving ? "Saving..." : "Save Profile"}</button>
        </form>
        <DisplayThemePreviewPanel preview={preview} />
      </div>
    </section>
  );
}

function AdminMatchDisplayThemePage({ matchId }: { matchId: string }) {
  const { api } = useCurrentUser();
  const [form, setForm] = useState<MatchDisplayOverrideFormState>(() => createMatchDisplayOverrideFormState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  async function loadOverride() {
    setLoading(true);
    setMessage(null);
    try {
      const override = await api.getMatchDisplayOverride(matchId);
      setForm(createMatchDisplayOverrideFormState(override));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverride();
  }, [api, matchId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = validateMatchDisplayOverrideForm(form);
    if (validationMessage) {
      setMessage({ tone: "error", text: validationMessage, code: "VALIDATION_ERROR" });
      return;
    }

    setSaving(true);
    setMessage({ tone: "success", text: "Saving match display override..." });
    try {
      const override = await api.saveMatchDisplayOverride(matchId, createMatchDisplayOverridePayload(form));
      setForm(createMatchDisplayOverrideFormState(override));
      setMessage({ tone: "success", text: "Match display override saved." });
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const preview = buildDisplayThemePreviewModel({ match: form });
  const publicDisplayHref = buildPublicScoreboardDisplayLink(matchId);
  const validationMessage = validateMatchDisplayOverrideForm(form);
  const saveState = getDisplayThemeSaveState({ saving, routeId: matchId, validationMessage });

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin display branding</p>
          <h1>Match Display Theme</h1>
          <p className="muted">Match ID: {matchId}</p>
        </div>
        <div className="button-row">
          <a className="button-link secondary" href="/admin/matches" onClick={(event) => { event.preventDefault(); navigate("/admin/matches"); }}>
            Matches
          </a>
          <a className="button-link secondary public-link" href={publicDisplayHref} onClick={(event) => { event.preventDefault(); navigate(publicDisplayHref); }}>
            Public Display
          </a>
          <button type="button" onClick={() => void loadOverride()} disabled={loading || saving}>Refresh</button>
        </div>
      </div>
      {message ? <Notice {...message} /> : null}
      {loading ? <p>Loading match display override...</p> : null}
      {!loading && validationMessage ? <p className="form-validation">{validationMessage}</p> : null}
      <div className="display-theme-grid">
        <form className="stacked-form display-theme-form" onSubmit={(event) => void handleSave(event)}>
          <h2>Match overrides</h2>
          <fieldset className="form-fieldset">
            <legend>Home colors</legend>
            <ColorInput label="Home primary" value={form.homePrimaryColor} onChange={(value) => setForm((current) => ({ ...current, homePrimaryColor: value }))} />
            <ColorInput label="Home secondary" value={form.homeSecondaryColor} onChange={(value) => setForm((current) => ({ ...current, homeSecondaryColor: value }))} />
            <ColorInput label="Home accent" value={form.homeAccentColor} onChange={(value) => setForm((current) => ({ ...current, homeAccentColor: value }))} />
            <ColorInput label="Home text" value={form.homeTextColor} onChange={(value) => setForm((current) => ({ ...current, homeTextColor: value }))} />
          </fieldset>
          <fieldset className="form-fieldset">
            <legend>Away colors</legend>
            <ColorInput label="Away primary" value={form.awayPrimaryColor} onChange={(value) => setForm((current) => ({ ...current, awayPrimaryColor: value }))} />
            <ColorInput label="Away secondary" value={form.awaySecondaryColor} onChange={(value) => setForm((current) => ({ ...current, awaySecondaryColor: value }))} />
            <ColorInput label="Away accent" value={form.awayAccentColor} onChange={(value) => setForm((current) => ({ ...current, awayAccentColor: value }))} />
            <ColorInput label="Away text" value={form.awayTextColor} onChange={(value) => setForm((current) => ({ ...current, awayTextColor: value }))} />
          </fieldset>
          <CheckboxInput label="Show team logos" checked={form.showTeamLogos} onChange={(value) => setForm((current) => ({ ...current, showTeamLogos: value }))} />
          <CheckboxInput label="Text-only fallback" checked={form.textOnlyFallback} onChange={(value) => setForm((current) => ({ ...current, textOnlyFallback: value }))} />
          <CheckboxInput label="Neutral high contrast" checked={form.neutralHighContrast} onChange={(value) => setForm((current) => ({ ...current, neutralHighContrast: value }))} />
          <CheckboxInput label="Emergency override enabled" checked={form.emergencyOverrideEnabled} onChange={(value) => setForm((current) => ({ ...current, emergencyOverrideEnabled: value }))} />
          <TextInput label="Emergency note" value={form.emergencyReason} maxLength={255} onChange={(value) => setForm((current) => ({ ...current, emergencyReason: value }))} />
          <button type="submit" disabled={saveState.disabled}>{saving ? "Saving..." : "Save Override"}</button>
        </form>
        <DisplayThemePreviewPanel preview={preview} />
      </div>
    </section>
  );
}

function AdminDisplayScreensPage() {
  const { api } = useCurrentUser();
  const [screens, setScreens] = useState<DisplayScreenResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  async function loadScreens() {
    setLoading(true);
    setMessage(null);
    try {
      setScreens(await api.listDisplayScreens());
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadScreens();
  }, [api]);

  async function copyPublicLink(screenSlug: string) {
    const publicPath = buildPublicDisplayScreenLink(screenSlug);
    const publicUrl = `${window.location.origin}${publicPath}`;
    try {
      await navigator.clipboard?.writeText(publicUrl);
      setCopyMessage(`Copied ${publicPath}`);
    } catch {
      setCopyMessage(publicPath);
    }
  }

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin display screens</p>
          <h1>Display Screens</h1>
          <p className="muted">Create public display channels and assign safe active scenes.</p>
        </div>
        <div className="button-row">
          <a
            className="button-link"
            href={buildAdminDisplayScreenNewLink()}
            onClick={(event) => { event.preventDefault(); navigate(buildAdminDisplayScreenNewLink()); }}
          >
            Create display screen
          </a>
          <button type="button" disabled={loading} onClick={() => void loadScreens()}>Refresh</button>
        </div>
      </div>
      {message ? <Notice {...message} /> : null}
      {copyMessage ? <Notice tone="success" text={copyMessage} /> : null}
      {loading ? <p>Loading display screens...</p> : null}
      {!loading && screens.length === 0 ? (
        <section className="empty-state">
          <h2>No display screens yet.</h2>
          <p>Create a display screen, add scenes, then publish its public display URL.</p>
        </section>
      ) : null}
      {screens.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Screen</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Active scene</th>
                <th>Public URL</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {screens.map((screen) => {
                const detailLink = buildAdminDisplayScreenDetailLink(screen.screenId);
                const scenesLink = buildAdminDisplayScreenScenesLink(screen.screenId);
                const previewLink = buildAdminDisplayScreenPreviewLink(screen.screenId);
                const publicLink = buildPublicDisplayScreenLink(screen.screenSlug);
                return (
                  <tr key={screen.screenId}>
                    <td>
                      <strong>{screen.displayName}</strong>
                      {screen.description ? <p className="muted">{screen.description}</p> : null}
                    </td>
                    <td><code>{screen.screenSlug}</code></td>
                    <td>{screen.publicEnabled && screen.active ? "Public enabled" : "Private or inactive"}</td>
                    <td className="muted">Use Preview to inspect active scene.</td>
                    <td>
                      <button type="button" onClick={() => void copyPublicLink(screen.screenSlug)}>
                        Copy public URL
                      </button>
                      <p className="muted">{publicLink}</p>
                    </td>
                    <td>
                      <div className="button-row">
                        <a className="button-link secondary" href={detailLink} onClick={(event) => { event.preventDefault(); navigate(detailLink); }}>Edit</a>
                        <a className="button-link secondary" href={scenesLink} onClick={(event) => { event.preventDefault(); navigate(scenesLink); }}>Scenes</a>
                        <a className="button-link secondary" href={previewLink} onClick={(event) => { event.preventDefault(); navigate(previewLink); }}>Preview</a>
                      </div>
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

function AdminDisplayScreenFormPage({ screenId }: { screenId?: string }) {
  const { api } = useCurrentUser();
  const [form, setForm] = useState<DisplayScreenFormState>(() => createDisplayScreenFormState());
  const [loading, setLoading] = useState(Boolean(screenId));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const isEdit = Boolean(screenId);

  async function loadScreen() {
    if (!screenId) return;
    setLoading(true);
    setMessage(null);
    try {
      setForm(createDisplayScreenFormState(await api.getDisplayScreen(screenId)));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadScreen();
  }, [api, screenId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = validateDisplayScreenForm(form);
    if (validationMessage) {
      setMessage({ tone: "error", text: validationMessage, code: "VALIDATION_ERROR" });
      return;
    }

    setSaving(true);
    setMessage({ tone: "success", text: isEdit ? "Saving display screen..." : "Creating display screen..." });
    try {
      const saved = screenId
        ? await api.updateDisplayScreen(screenId, createDisplayScreenUpdatePayload(form))
        : await api.createDisplayScreen(createDisplayScreenPayload(form));
      setForm(createDisplayScreenFormState(saved));
      setMessage({ tone: "success", text: isEdit ? "Display screen saved." : "Display screen created." });
      if (!screenId) {
        navigate(buildAdminDisplayScreenDetailLink(saved.screenId));
      }
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const validationMessage = validateDisplayScreenForm(form);
  const saveState = getDisplayScreenSaveState({ saving, routeId: screenId ?? null, validationMessage });

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin display screens</p>
          <h1>{isEdit ? "Edit Display Screen" : "Create Display Screen"}</h1>
          {screenId ? <p className="muted">Screen ID: {screenId}</p> : null}
        </div>
        <div className="button-row">
          <a className="button-link secondary" href={buildAdminDisplayScreensLink()} onClick={(event) => { event.preventDefault(); navigate(buildAdminDisplayScreensLink()); }}>
            Display Screens
          </a>
          {screenId ? (
            <>
              <a className="button-link secondary" href={buildAdminDisplayScreenScenesLink(screenId)} onClick={(event) => { event.preventDefault(); navigate(buildAdminDisplayScreenScenesLink(screenId)); }}>Scenes</a>
              <a className="button-link secondary" href={buildAdminDisplayScreenPreviewLink(screenId)} onClick={(event) => { event.preventDefault(); navigate(buildAdminDisplayScreenPreviewLink(screenId)); }}>Preview</a>
              <button type="button" onClick={() => void loadScreen()} disabled={loading || saving}>Refresh</button>
            </>
          ) : null}
        </div>
      </div>
      {message ? <Notice {...message} /> : null}
      {loading ? <p>Loading display screen...</p> : null}
      {!loading && validationMessage ? <p className="form-validation">{validationMessage}</p> : null}
      <form className="stacked-form display-screen-form" onSubmit={(event) => void handleSave(event)}>
        <TextInput label="Screen slug" value={form.screenSlug} maxLength={120} placeholder="court-1-main" onChange={(value) => setForm((current) => ({ ...current, screenSlug: value }))} />
        <TextInput label="Display name" value={form.displayName} maxLength={120} placeholder="Court 1 Main Display" onChange={(value) => setForm((current) => ({ ...current, displayName: value }))} />
        <TextInput label="Tournament ID" value={form.tournamentId} maxLength={36} placeholder="Optional tournament UUID" onChange={(value) => setForm((current) => ({ ...current, tournamentId: value }))} />
        <TextInput label="Description" value={form.description} maxLength={255} placeholder="Optional operations note" onChange={(value) => setForm((current) => ({ ...current, description: value }))} />
        <CheckboxInput label="Public enabled" checked={form.publicEnabled} onChange={(value) => setForm((current) => ({ ...current, publicEnabled: value }))} />
        <CheckboxInput label="Active" checked={form.active} onChange={(value) => setForm((current) => ({ ...current, active: value }))} />
        <button type="submit" disabled={saveState.disabled}>{saving ? "Saving..." : "Save Display Screen"}</button>
      </form>
    </section>
  );
}

function AdminDisplayScreenScenesPage({ screenId }: { screenId: string }) {
  const { api } = useCurrentUser();
  const [screen, setScreen] = useState<DisplayScreenResponse | null>(null);
  const [scenes, setScenes] = useState<DisplaySceneResponse[]>([]);
  const [activeScene, setActiveScene] = useState<ActiveDisplaySceneResponse | null>(null);
  const [publicPreview, setPublicPreview] = useState<Awaited<ReturnType<typeof api.getPublicDisplayScreen>> | null>(null);
  const [adminMatches, setAdminMatches] = useState<OperatorMatchSummary[]>([]);
  const [activationConfirmation, setActivationConfirmation] = useState<{
    scene: DisplaySceneResponse;
    details: DisplaySceneActivationConfirmation;
  } | null>(null);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [form, setForm] = useState<DisplaySceneFormState>(() => createDisplaySceneFormState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const activationInFlightRef = useRef(false);

  async function loadScenes() {
    setLoading(true);
    setMessage(null);
    setActivationConfirmation(null);
    try {
      const [loadedScreen, loadedScenes, loadedMatches] = await Promise.all([
        api.getDisplayScreen(screenId),
        api.listDisplayScenes(screenId),
        api.getAdminMatches().catch(() => [])
      ]);
      setScreen(loadedScreen);
      setScenes(loadedScenes);
      setAdminMatches(loadedMatches);
      if (isPublicActiveDisplayScreen(loadedScreen)) {
        try {
          setPublicPreview(await api.getPublicDisplayScreen(loadedScreen.screenSlug));
        } catch {
          setPublicPreview(null);
        }
      } else {
        setPublicPreview(null);
      }
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadScenes();
  }, [api, screenId]);

  function startEdit(scene: DisplaySceneResponse) {
    setEditingSceneId(scene.sceneId);
    setForm(createDisplaySceneFormState(scene));
    setActivationConfirmation(null);
    setMessage(null);
  }

  function resetForm() {
    setEditingSceneId(null);
    setForm(createDisplaySceneFormState());
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = validateDisplaySceneForm(form);
    if (validationMessage) {
      setMessage({ tone: "error", text: validationMessage, code: "VALIDATION_ERROR" });
      return;
    }

    setSaving(true);
    setMessage({ tone: "success", text: editingSceneId ? "Saving display scene..." : "Creating display scene..." });
    try {
      const saved = editingSceneId
        ? await api.updateDisplayScene(screenId, editingSceneId, createDisplaySceneUpdatePayload(form))
        : await api.createDisplayScene(screenId, createDisplayScenePayload(form));
      setScenes((current) => {
        const withoutSaved = current.filter((scene) => scene.sceneId !== saved.sceneId);
        return [...withoutSaved, saved].sort((left, right) => left.sortOrder - right.sortOrder || left.sceneName.localeCompare(right.sceneName));
      });
      setMessage({ tone: "success", text: editingSceneId ? "Display scene saved." : "Display scene created." });
      resetForm();
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function requestSetActive(scene: DisplaySceneResponse) {
    if (!screen) return;
    setActivationConfirmation({
      scene,
      details: buildDisplaySceneActivationConfirmation({
        screen,
        targetScene: scene,
        currentScene: getPublicActiveSceneSummary(publicPreview),
        targetSchedulePreview: getSchedulePreviewForScene(scene),
        targetFinalSummaryReadiness: getFinalSummarySceneReadiness(scene, adminMatches)
      })
    });
    setMessage(null);
  }

  function getSchedulePreviewForScene(scene: DisplaySceneResponse) {
    if (scene.sceneType !== "SCHEDULE") return null;
    const preview = getPublicSchedulePreviewSummary(publicPreview);
    if (!preview || getPublicActiveSceneSummary(publicPreview)?.sceneType !== "SCHEDULE") return null;
    const scheduleScenes = scenes.filter((candidate) => candidate.sceneType === "SCHEDULE");
    const knownActiveSceneId = activeScene?.scene.sceneId ?? null;
    const previewMatchesScene = knownActiveSceneId
      ? knownActiveSceneId === scene.sceneId
      : scheduleScenes.length === 1;
    return previewMatchesScene ? preview : null;
  }

  async function confirmSetActive() {
    if (!activationConfirmation || !screen || activationInFlightRef.current) return;
    activationInFlightRef.current = true;
    const scene = activationConfirmation.scene;
    setSaving(true);
    setActivationConfirmation(null);
    setMessage({ tone: "success", text: `Assigning ${scene.sceneName} as active scene...` });
    try {
      const [latestScreen, latestScenes, latestMatches] = await Promise.all([
        api.getDisplayScreen(screenId),
        api.listDisplayScenes(screenId),
        scene.sceneType === "FINAL_SUMMARY" ? api.getAdminMatches() : Promise.resolve(adminMatches)
      ]);
      const latestScene = latestScenes.find((candidate) => candidate.sceneId === scene.sceneId);
      const originalReadiness = getFinalSummarySceneReadiness(scene, adminMatches);
      const latestReadiness = getFinalSummarySceneReadiness(latestScene, latestMatches);
      const sceneChanged = !latestScene ||
        !latestScene.active ||
        latestScene.sceneType !== scene.sceneType ||
        JSON.stringify(latestScene.sceneConfig) !== JSON.stringify(scene.sceneConfig);
      const readinessChanged = JSON.stringify(latestReadiness) !== JSON.stringify(originalReadiness);
      const screenChanged = latestScreen.screenSlug !== screen.screenSlug ||
        latestScreen.publicEnabled !== screen.publicEnabled ||
        latestScreen.active !== screen.active;
      setScreen(latestScreen);
      setScenes(latestScenes);
      setAdminMatches(latestMatches);
      if (sceneChanged || readinessChanged || screenChanged) {
        setMessage({
          tone: "error",
          code: "STALE_CONFIRMATION",
          text: "Display or match readiness changed after confirmation opened. Review the latest state before activating."
        });
        return;
      }
      const active = await api.setActiveDisplayScene(screenId, scene.sceneId);
      setActiveScene(active);
      if (isPublicActiveDisplayScreen(screen)) {
        try {
          setPublicPreview(await api.getPublicDisplayScreen(screen.screenSlug));
        } catch {
          setPublicPreview(null);
        }
      }
      setMessage({ tone: "success", text: `${scene.sceneName} is now the active scene.` });
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      activationInFlightRef.current = false;
      setSaving(false);
    }
  }

  const validationMessage = validateDisplaySceneForm(form);
  const saveState = getDisplaySceneSaveState({ saving, screenId, validationMessage });
  const currentPublicScene = getPublicActiveSceneSummary(publicPreview);
  const publicSchedulePreview = getPublicSchedulePreviewSummary(publicPreview);
  const scheduleScenes = scenes.filter((scene) => scene.sceneType === "SCHEDULE");
  const currentScheduleScene = currentPublicScene?.sceneType === "SCHEDULE"
    ? activeScene?.scene.sceneType === "SCHEDULE"
      ? activeScene.scene
      : scheduleScenes.length === 1
        ? scheduleScenes[0] ?? null
        : null
    : null;
  const currentScheduleHandoff = currentScheduleScene
    ? getScheduleSceneHandoff(currentScheduleScene, publicSchedulePreview)
    : null;
  const publicPath = screen ? buildPublicDisplayScreenLink(screen.screenSlug) : null;
  const currentFinalScene = currentPublicScene?.sceneType === "FINAL_SUMMARY"
    ? scenes.find((scene) => scene.sceneType === "FINAL_SUMMARY" && getDisplaySceneMatchId(scene) === currentPublicScene.matchId) ?? null
    : null;
  const currentFinalReadiness = getFinalSummarySceneReadiness(currentFinalScene, adminMatches);
  const configuredFinalReadiness = form.sceneType === "FINAL_SUMMARY"
    ? getFinalSummaryMatchReadiness(form.matchId, adminMatches)
    : null;

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin display scenes</p>
          <h1>{screen?.displayName ?? "Display Screen Scenes"}</h1>
          <p className="muted">Screen ID: {screenId}</p>
        </div>
        <div className="button-row">
          <a className="button-link secondary" href={buildAdminDisplayScreensLink()} onClick={(event) => { event.preventDefault(); navigate(buildAdminDisplayScreensLink()); }}>Display Screens</a>
          <a className="button-link secondary" href={buildAdminDisplayScreenDetailLink(screenId)} onClick={(event) => { event.preventDefault(); navigate(buildAdminDisplayScreenDetailLink(screenId)); }}>Edit Screen</a>
          <a className="button-link secondary" href={buildAdminDisplayScreenPreviewLink(screenId)} onClick={(event) => { event.preventDefault(); navigate(buildAdminDisplayScreenPreviewLink(screenId)); }}>Preview</a>
          <button type="button" onClick={() => void loadScenes()} disabled={loading || saving}>Refresh</button>
        </div>
      </div>
      {message ? <Notice {...message} /> : null}
      {isPublicActiveDisplayScreen(screen) ? (
        <Notice tone="error" text="This screen is live on the public display. Changes may be visible immediately." />
      ) : null}
      <section className="display-preview-card">
        <h2>Operator handoff</h2>
        <dl className="detail-list">
          <dt>Screen slug</dt>
          <dd>{screen?.screenSlug ?? "Loading"}</dd>
          <dt>Display name</dt>
          <dd>{screen?.displayName ?? "Loading"}</dd>
          <dt>Public enabled</dt>
          <dd>{screen?.publicEnabled ? "ON" : "OFF"}</dd>
          <dt>Active</dt>
          <dd>{screen?.active ? "ON" : "OFF"}</dd>
          <dt>Current active scene type</dt>
          <dd>{currentPublicScene?.sceneType ?? activeScene?.scene.sceneType ?? "Unavailable"}</dd>
          <dt>Current active match ID</dt>
          <dd>{currentPublicScene?.matchId ?? getDisplaySceneMatchId(activeScene?.scene) ?? "None"}</dd>
          {currentPublicScene?.sceneType === "SCHEDULE" ? (
            <>
              <dt>Schedule tournament</dt>
              <dd>{currentScheduleHandoff?.tournamentLabel ?? publicSchedulePreview?.tournamentLabel ?? "Unavailable"}</dd>
              <dt>Schedule limit</dt>
              <dd>{currentScheduleHandoff?.limit ?? "Unavailable"}</dd>
              <dt>Court filter</dt>
              <dd>{currentScheduleHandoff?.courtFilter ?? (currentScheduleHandoff ? "All courts" : "Unavailable")}</dd>
              <dt>Qualifying rows</dt>
              <dd>{publicSchedulePreview?.rowCount ?? "Unavailable"}</dd>
            </>
          ) : null}
          {currentPublicScene?.sceneType === "FINAL_SUMMARY" ? (
            <>
              <dt>Selected match</dt>
              <dd>{currentFinalReadiness?.matchLabel ?? currentPublicScene.matchId ?? "Unavailable"}</dd>
              <dt>Matchup</dt>
              <dd>{currentFinalReadiness?.matchupLabel ?? "Match details unavailable"}</dd>
              <dt>Result readiness</dt>
              <dd>{currentFinalReadiness?.statusLabel ?? "Unavailable - Final result cannot be published yet"}</dd>
            </>
          ) : null}
          <dt>Public URL</dt>
          <dd>{publicPath ?? "Unavailable"}</dd>
        </dl>
        {currentPublicScene?.sceneType === "SCHEDULE" && publicSchedulePreview?.empty ? (
          <Notice tone="error" text="No public schedule entries are currently available for this scene." />
        ) : null}
      </section>
      {activeScene ? <Notice tone="success" text={`Active scene: ${activeScene.scene.sceneName} (${activeScene.scene.sceneType})`} /> : null}
      {activationConfirmation ? (
        <section className="display-preview-card">
          <h2>{activationConfirmation.details.title}</h2>
          {activationConfirmation.details.publicWarning ? <Notice tone="error" text={activationConfirmation.details.publicWarning} /> : null}
          <dl className="detail-list">
            {activationConfirmation.details.summaryRows.map((row) => (
              <React.Fragment key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </React.Fragment>
            ))}
          </dl>
          {activationConfirmation.details.messages.map((text) => (
            <p className="muted" key={text}>{text}</p>
          ))}
          {activationConfirmation.details.warnings.map((text) => (
            <Notice tone="error" text={text} key={text} />
          ))}
          <div className="button-row">
            <button type="button" onClick={() => void confirmSetActive()} disabled={saving}>
              {activationConfirmation.details.confirmLabel}
            </button>
            <button type="button" onClick={() => setActivationConfirmation(null)} disabled={saving}>
              {activationConfirmation.details.cancelLabel}
            </button>
          </div>
        </section>
      ) : null}
      {loading ? <p>Loading display scenes...</p> : null}
      {!loading && scenes.length === 0 ? <p className="muted">No scenes yet. Add a scene before enabling the public display.</p> : null}
      {scenes.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Scene</th>
                <th>Type</th>
                <th>Config</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {scenes.map((scene) => (
                <tr key={scene.sceneId}>
                  <td>
                    <strong>{scene.sceneName}</strong>
                    <p className="muted">Sort {scene.sortOrder}</p>
                  </td>
                  <td>{scene.sceneType}</td>
                  <td>
                    {getDisplaySceneConfigSummary(scene)}
                    {scene.sceneType === "FINAL_SUMMARY" ? (
                      <small className={`final-summary-readiness ${getFinalSummarySceneReadiness(scene, adminMatches)?.resultAvailable ? "ready" : "unavailable"}`}>
                        {getFinalSummarySceneReadiness(scene, adminMatches)?.statusLabel ?? "Unavailable - Final result cannot be published yet"}
                      </small>
                    ) : null}
                  </td>
                  <td>{scene.active ? "Enabled" : "Disabled"}{activeScene?.scene.sceneId === scene.sceneId ? " / Active" : ""}</td>
                  <td>
                    <div className="button-row">
                      <button type="button" onClick={() => startEdit(scene)} disabled={saving}>Edit</button>
                      <button type="button" onClick={() => requestSetActive(scene)} disabled={saving || !scene.active}>Set Active</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!loading && validationMessage ? <p className="form-validation">{validationMessage}</p> : null}
      <form className="stacked-form display-scene-form" onSubmit={(event) => void handleSave(event)}>
        <h2>{editingSceneId ? "Edit Scene" : "Add Scene"}</h2>
        <label>
          Scene type
          <select
            value={form.sceneType}
            onChange={(event) => setForm((current) => ({ ...current, sceneType: event.target.value as DisplaySceneFormState["sceneType"] }))}
          >
            {displaySceneTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <TextInput label="Scene name" value={form.sceneName} maxLength={120} onChange={(value) => setForm((current) => ({ ...current, sceneName: value }))} />
        {form.sceneType === "LIVE_SCOREBOARD" || form.sceneType === "FINAL_SUMMARY" ? (
          <TextInput label="Match ID" value={form.matchId} maxLength={36} placeholder="Match UUID" onChange={(value) => setForm((current) => ({ ...current, matchId: value }))} />
        ) : null}
        {form.sceneType === "FINAL_SUMMARY" && configuredFinalReadiness ? (
          <section className={`final-summary-config-status ${configuredFinalReadiness.resultAvailable ? "ready" : "unavailable"}`} aria-label="Final summary result readiness">
            <strong>{configuredFinalReadiness.statusLabel}</strong>
            <span>{configuredFinalReadiness.matchLabel}</span>
            <span>{configuredFinalReadiness.matchupLabel}</span>
            <small>Public activation uses authoritative finalized data only.</small>
          </section>
        ) : null}
        {form.sceneType === "SCHEDULE" ? (
          <>
            <TextInput label="Tournament ID" value={form.tournamentId} maxLength={36} placeholder="Tournament UUID" onChange={(value) => setForm((current) => ({ ...current, tournamentId: value }))} />
            <TextInput label="Court ID" value={form.courtId} maxLength={36} placeholder="Optional court UUID" onChange={(value) => setForm((current) => ({ ...current, courtId: value }))} />
            <TextInput label="Limit" value={form.limit} maxLength={2} onChange={(value) => setForm((current) => ({ ...current, limit: value }))} />
          </>
        ) : null}
        {form.sceneType === "BLANK" ? (
          <TextInput label="Standby message" value={form.message} maxLength={120} placeholder="Standby" onChange={(value) => setForm((current) => ({ ...current, message: value }))} />
        ) : null}
        <TextInput label="Sort order" value={form.sortOrder} maxLength={4} onChange={(value) => setForm((current) => ({ ...current, sortOrder: value }))} />
        <CheckboxInput label="Scene enabled" checked={form.active} onChange={(value) => setForm((current) => ({ ...current, active: value }))} />
        <div className="button-row">
          <button type="submit" disabled={saveState.disabled}>{saving ? "Saving..." : editingSceneId ? "Save Scene" : "Add Scene"}</button>
          {editingSceneId ? <button type="button" onClick={resetForm} disabled={saving}>Cancel edit</button> : null}
        </div>
      </form>
    </section>
  );
}

function AdminDisplayScreenPreviewPage({ screenId }: { screenId: string }) {
  const { api } = useCurrentUser();
  const [screen, setScreen] = useState<DisplayScreenResponse | null>(null);
  const [publicPreview, setPublicPreview] = useState<Awaited<ReturnType<typeof api.getPublicDisplayScreen>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  async function loadPreview() {
    setLoading(true);
    setMessage(null);
    setPublicPreview(null);
    try {
      const loadedScreen = await api.getDisplayScreen(screenId);
      setScreen(loadedScreen);
      try {
        setPublicPreview(await api.getPublicDisplayScreen(loadedScreen.screenSlug));
      } catch (error) {
        setMessage(toUiMessage(error));
      }
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPreview();
  }, [api, screenId]);

  const publicPath = screen ? buildPublicDisplayScreenLink(screen.screenSlug) : null;
  const hasExposure = publicDisplayPreviewHasPrivateExposure(publicPreview);

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <p className="eyebrow">Admin display preview</p>
          <h1>{screen?.displayName ?? "Display Screen Preview"}</h1>
          <p className="muted">Protected admin preview for the public scene assignment.</p>
        </div>
        <div className="button-row">
          <a className="button-link secondary" href={buildAdminDisplayScreensLink()} onClick={(event) => { event.preventDefault(); navigate(buildAdminDisplayScreensLink()); }}>Display Screens</a>
          <a className="button-link secondary" href={buildAdminDisplayScreenScenesLink(screenId)} onClick={(event) => { event.preventDefault(); navigate(buildAdminDisplayScreenScenesLink(screenId)); }}>Scenes</a>
          <button type="button" onClick={() => void loadPreview()} disabled={loading}>Refresh</button>
        </div>
      </div>
      {message ? <Notice {...message} /> : null}
      {loading ? <p>Loading display preview...</p> : null}
      {screen ? (
        <div className="display-preview-admin-grid">
          <section className="display-preview-card">
            <h2>Screen metadata</h2>
            <dl className="detail-list">
              <dt>Slug</dt>
              <dd>{screen.screenSlug}</dd>
              <dt>Public route</dt>
              <dd>{publicPath}</dd>
              <dt>Status</dt>
              <dd>{screen.publicEnabled && screen.active ? "Public enabled" : "Public endpoint should return 404"}</dd>
              <dt>Tournament</dt>
              <dd>{screen.tournamentId ?? "Not scoped"}</dd>
            </dl>
          </section>
          <section className="display-preview-card">
            <h2>Public endpoint preview</h2>
            <p className="muted">{getPublicDisplayPreviewSummary(publicPreview)}</p>
            {hasExposure ? <Notice tone="error" code="PUBLIC_EXPOSURE" text="Public preview contains private metadata." /> : null}
            <pre className="json-preview">{publicPreview ? JSON.stringify(publicPreview, null, 2) : "No public preview available."}</pre>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function TextInput({
  label,
  value,
  onChange,
  maxLength,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} placeholder={placeholder} />
    </label>
  );
}

function ColorInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const textValue = value ?? "";
  return (
    <label>
      {label}
      <span className="color-input-row">
        <input
          aria-label={`${label} value`}
          value={textValue}
          onChange={(event) => onChange(event.target.value || null)}
          placeholder="#111827"
          maxLength={7}
        />
        <span className="color-swatch" style={{ background: /^#[0-9a-fA-F]{6}$/.test(textValue) ? textValue : "#e5e7eb" }} />
      </span>
    </label>
  );
}

function CheckboxInput({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="checkbox-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function DisplayThemePreviewPanel({ preview }: { preview: DisplayThemePreviewModel }) {
  return (
    <section className="display-preview-card" aria-label="Display theme preview">
      <div className="display-preview-header">
        <div>
          <p className="eyebrow">Preview only</p>
          <h2>{preview.title}</h2>
        </div>
        {preview.showTournamentLogo && preview.tournamentLogoUrl ? (
          <SafePreviewLogo className="display-preview-logo small" src={preview.tournamentLogoUrl} fallbackLabel="T" />
        ) : null}
      </div>
      <div className={`display-preview-arena ${preview.backgroundStyle.toLowerCase().replaceAll("_", "-")}`}>
        <DisplayPreviewTeam side="HOME" team={preview.home} />
        <div className="display-preview-center">
          <span>PREVIEW</span>
          <strong>10:00</strong>
          <span>REG P1</span>
          <b>24</b>
        </div>
        <DisplayPreviewTeam side="AWAY" team={preview.away} />
      </div>
      <p className="muted">Static admin preview. The live public display keeps using the current default layout until theme application is implemented.</p>
    </section>
  );
}

function DisplayPreviewTeam({ side, team }: { side: "HOME" | "AWAY"; team: DisplayThemePreviewModel["home"] }) {
  const style = {
    "--preview-primary": team.colors.primaryColor ?? "#111827",
    "--preview-secondary": team.colors.secondaryColor ?? "#334155",
    "--preview-accent": team.colors.accentColor ?? "#f59e0b",
    "--preview-text": team.colors.textColor ?? "#f8fafc"
  } as React.CSSProperties;
  return (
    <div className="display-preview-team" style={style}>
      <span>{side}</span>
      {team.showLogo && team.logoUrl ? (
        <SafePreviewLogo className="display-preview-logo" src={team.logoUrl} fallbackLabel={side.slice(0, 1)} />
      ) : (
        <div className="display-preview-logo placeholder">{side.slice(0, 1)}</div>
      )}
      <strong>{team.label}</strong>
      <b>00</b>
    </div>
  );
}

function SafePreviewLogo({
  src,
  className,
  fallbackLabel
}: {
  src: string;
  className: string;
  fallbackLabel: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    setFailedSrc(null);
  }, [src]);

  const previewState = getLogoPreviewState(src, failedSrc);

  if (previewState.showFallback) {
    return <div className={`${className} placeholder`}>{fallbackLabel}</div>;
  }

  return (
    <img
      className={className}
      src={src}
      alt=""
      onError={() => setFailedSrc(src)}
    />
  );
}

function TournamentLiveDashboardPage({
  tournamentId,
  mode
}: {
  tournamentId: string;
  mode: "admin" | "operator";
}) {
  const { api } = useCurrentUser();
  const [dashboard, setDashboard] = useState<TournamentLiveDashboardResponse | null>(null);
  const [filter, setFilter] = useState<LiveDashboardFilter>("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  async function loadDashboard(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setLoading(true);
      setMessage(null);
    }
    try {
      const nextDashboard = await api.getTournamentLiveDashboard(tournamentId);
      setDashboard(nextDashboard);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      if (!options.silent) {
        setMessage(toUiMessage(error));
      }
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, [api, tournamentId]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadDashboard({ silent: true }), 5000);
    return () => window.clearInterval(timer);
  }, [api, tournamentId]);

  const matches = dashboard?.matches ?? [];
  const filteredMatches = filterLiveDashboardMatches(matches, filter);
  const summary = buildLiveDashboardSummary(matches);
  const emptyState = getLiveDashboardEmptyState(matches.length, filteredMatches.length, filter);
  const scheduleHref = buildAdminTournamentScheduleLink(tournamentId);

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <p className="eyebrow">{mode === "admin" ? "Admin" : "Operator"}</p>
          <h1>Main Live Dashboard</h1>
          <p className="muted">{dashboard ? dashboard.tournament.name : `Tournament ID: ${tournamentId}`}</p>
        </div>
        <div className="button-row">
          <a className="button-link secondary" href={mode === "admin" ? "/admin/tournaments" : "/operator/matches"} onClick={(event) => { event.preventDefault(); navigate(mode === "admin" ? "/admin/tournaments" : "/operator/matches"); }}>
            Back
          </a>
          {mode === "admin" ? (
            <a className="button-link secondary" href={scheduleHref} onClick={(event) => { event.preventDefault(); navigate(scheduleHref); }}>
              Schedule
            </a>
          ) : null}
          <button type="button" onClick={() => void loadDashboard()}>Refresh</button>
        </div>
      </div>
      {message ? <Notice {...message} /> : null}
      {dashboard ? (
        <dl className="state-strip">
          <div><dt>Total</dt><dd>{summary.total}</dd></div>
          <div><dt>Live</dt><dd>{summary.live}</dd></div>
          <div><dt>Scheduled</dt><dd>{summary.scheduled}</dd></div>
          <div><dt>Finished</dt><dd>{summary.finished}</dd></div>
          <div><dt>Warnings</dt><dd>{summary.warnings}</dd></div>
          <div><dt>Last updated</dt><dd>{lastUpdatedAt ? formatDate(lastUpdatedAt) : formatDate(dashboard.generatedAt)}</dd></div>
        </dl>
      ) : null}
      <div className="button-row" role="group" aria-label="Live dashboard filter">
        {buildLiveDashboardFilters().map((item) => (
          <button
            key={item.value}
            type="button"
            className={filter === item.value ? "active" : undefined}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {loading ? <p>Loading live dashboard...</p> : null}
      {!loading && message && !dashboard ? <p className="muted">Live dashboard data unavailable. Refresh to retry.</p> : null}
      {!loading && emptyState ? <section className="empty-state"><p>{emptyState}</p></section> : null}
      {filteredMatches.length > 0 ? (
        <div className="live-dashboard-grid" aria-label="Tournament live dashboard matches">
          {filteredMatches.map((match) => (
            <LiveDashboardMatchCard key={match.matchId} match={match} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function LiveDashboardMatchCard({ match }: { match: TournamentLiveDashboardResponse["matches"][number] }) {
  const card = buildLiveDashboardCard(match);
  const hasCriticalWarning = match.warnings.some((warning) => warning.severity === "CRITICAL");
  const hasWarning = match.warnings.some((warning) => warning.severity === "WARNING");
  const cardClassName = ["live-dashboard-card", hasCriticalWarning ? "critical" : hasWarning ? "warning" : ""]
    .filter(Boolean)
    .join(" ");
  const links = [
    { href: match.links.score, label: "Score" },
    { href: match.links.fouls, label: "Fouls" },
    { href: match.links.clock, label: "Clock" },
    { href: match.links.timeouts, label: "Timeouts" },
    { href: match.links.corrections, label: "Corrections" },
    { href: match.links.summary, label: "Summary" },
    { href: match.links.replay, label: "Replay" },
    { href: match.links.auditLog, label: "Audit Log" },
    { href: match.links.publicScoreboard, label: "Public Scoreboard" }
  ];

  return (
    <article className={cardClassName}>
      <div className="live-dashboard-card-header">
        <div>
          <p className="eyebrow">{card.locationLabel}</p>
          <h2>{card.matchupLabel}</h2>
          <p className="muted">{card.scheduleLabel}</p>
        </div>
        <div className="score-display compact" aria-label="Dashboard score">
          {card.scoreLabel}
        </div>
      </div>
      <dl className="state-strip compact">
        <div><dt>Status</dt><dd>{match.status}</dd></div>
        <div><dt>Period</dt><dd>{card.periodLabel}</dd></div>
        <div><dt>Game clock</dt><dd>{card.gameClockLabel}</dd></div>
        <div><dt>Shot clock</dt><dd>{card.shotClockLabel}</dd></div>
        <div><dt>Seq</dt><dd>{card.seqLabel}</dd></div>
      </dl>
      <div className="readiness-badges" aria-label="Live dashboard warnings">
        {match.warnings.length > 0 ? match.warnings.map((warning) => (
          <span className={`readiness-badge ${warning.severity.toLowerCase()}`} key={warning.code}>
            {warning.label}
          </span>
        )) : <span className="readiness-badge">No dashboard warnings</span>}
      </div>
      {match.readiness ? (
        <dl className="setup-readiness compact" aria-label="Dashboard readiness">
          <div><dt>Officials</dt><dd>{match.readiness.officials.state}</dd></div>
          <div><dt>Roster</dt><dd>{match.readiness.roster.state}</dd></div>
          <div><dt>Lineup</dt><dd>{match.readiness.lineup.state}</dd></div>
          <div><dt>Checklist</dt><dd>{match.warnings.some((warning) => warning.code === "CHECKLIST_INCOMPLETE") ? "INCOMPLETE" : "READY"}</dd></div>
        </dl>
      ) : null}
      <div className="inline-actions">
        {links.map((link) => (
          <a
            key={link.href}
            className={link.label === "Public Scoreboard" ? "public-link" : undefined}
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
    </article>
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
      {!loading && tournaments.length === 0 ? (
        <section className="empty-state">
          <h2>No public tournaments</h2>
          <p>No active tournament schedule is available yet.</p>
        </section>
      ) : null}
      <div className="match-grid">
        {tournaments.map((tournament) => {
          const scheduleHref = buildPublicTournamentScheduleLink(tournament.tournamentId);
          const standingsHref = buildPublicTournamentStandingsLink(tournament.tournamentId);
          return (
            <article className="match-card" key={tournament.tournamentId}>
              <h2>{tournament.name}</h2>
              <dl>
                <div><dt>Status</dt><dd>{tournament.status}</dd></div>
                <div><dt>Matches</dt><dd>{tournament.matchCount}</dd></div>
                <div><dt>Live</dt><dd>{tournament.liveMatchCount}</dd></div>
                <div><dt>Finished</dt><dd>{tournament.finishedMatchCount}</dd></div>
              </dl>
              <div className="button-row">
                <a className="button-link" href={scheduleHref} onClick={(event) => { event.preventDefault(); navigate(scheduleHref); }}>
                  Open Schedule
                </a>
                <a className="button-link secondary" href={standingsHref} onClick={(event) => { event.preventDefault(); navigate(standingsHref); }}>
                  Open Standings
                </a>
              </div>
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
  const publicScheduleEmptyState = getPublicScheduleEmptyState(schedule?.matches.length ?? 0);

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <h1>Public Schedule</h1>
          <p className="muted">{schedule ? schedule.tournament.name : `Tournament ID: ${tournamentId}`}</p>
        </div>
        <div className="button-row">
          <a className="button-link secondary" href={buildPublicTournamentStandingsLink(tournamentId)} onClick={(event) => { event.preventDefault(); navigate(buildPublicTournamentStandingsLink(tournamentId)); }}>
            Open Standings
          </a>
          <button type="button" onClick={() => void loadSchedule()}>Refresh</button>
        </div>
      </div>
      {message ? <Notice {...message} /> : null}
      <ScheduleFilterBar value={filter} onChange={setFilter} />
      {loading ? <p>Loading public schedule...</p> : null}
      {!loading && matches.length === 0 ? (
        <section className="empty-state">
          <h2>{publicScheduleEmptyState?.title ?? "No matches for this filter"}</h2>
          <p>{publicScheduleEmptyState?.description ?? "Try another schedule filter."}</p>
        </section>
      ) : null}
      {matches.length > 0 ? <ScheduleTable matches={matches} mode="public" /> : null}
    </section>
  );
}

function AdminTournamentStandingsPage({ tournamentId }: { tournamentId: string }) {
  const { api } = useCurrentUser();
  const [standings, setStandings] = useState<TournamentStandingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  async function loadStandings() {
    setLoading(true);
    setMessage(null);
    try {
      setStandings(await api.getTournamentStandings(tournamentId));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStandings();
  }, [api, tournamentId]);

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <h1>Tournament Standings</h1>
          <p className="muted">{standings ? standings.tournamentName : `Tournament ID: ${tournamentId}`}</p>
        </div>
        <div className="button-row">
          <a className="button-link secondary" href={buildAdminTournamentScheduleLink(tournamentId)} onClick={(event) => { event.preventDefault(); navigate(buildAdminTournamentScheduleLink(tournamentId)); }}>
            Open Schedule
          </a>
          <a className="button-link secondary" href={buildPublicTournamentScheduleLink(tournamentId)} onClick={(event) => { event.preventDefault(); navigate(buildPublicTournamentScheduleLink(tournamentId)); }}>
            Public Schedule
          </a>
          <button type="button" onClick={() => void loadStandings()}>Refresh</button>
        </div>
      </div>
      {message ? <Notice {...message} /> : null}
      {standings ? <StandingsContent standings={standings} mode="admin" /> : null}
      {loading ? <p>Loading standings...</p> : null}
    </section>
  );
}

function PublicTournamentStandingsPage({ tournamentId }: { tournamentId: string }) {
  const { api } = useCurrentUser();
  const [standings, setStandings] = useState<TournamentStandingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  async function loadStandings() {
    setLoading(true);
    setMessage(null);
    try {
      setStandings(await api.getPublicTournamentStandings(tournamentId));
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStandings();
  }, [api, tournamentId]);

  return (
    <section className="panel">
      <div className="page-header">
        <div>
          <h1>Public Standings</h1>
          <p className="muted">{standings ? standings.tournamentName : `Tournament ID: ${tournamentId}`}</p>
        </div>
        <button type="button" onClick={() => void loadStandings()}>Refresh</button>
      </div>
      {message ? <Notice {...message} /> : null}
      {standings ? <StandingsContent standings={standings} mode="public" /> : null}
      {loading ? <p>Loading public standings...</p> : null}
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
                  <div><dt>Tournament</dt><dd>{card.tournamentLabel}</dd></div>
                  <div><dt>Status</dt><dd>{card.statusLabel}</dd></div>
                  <div><dt>Scheduled</dt><dd>{card.scheduledLabel}</dd></div>
                  <div><dt>Venue</dt><dd>{card.venueLabel}</dd></div>
                  <div><dt>Roles</dt><dd>{card.assignedRolesLabel}</dd></div>
                  <div><dt>Readiness</dt><dd>{card.readinessLabel}</dd></div>
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
  _projection: ScoreboardProjection | PublicScoreboardProjection | null,
  setProjection: React.Dispatch<React.SetStateAction<ScoreboardProjection | null>> | React.Dispatch<React.SetStateAction<PublicScoreboardProjection | null>>,
  onProjectionReceived?: () => void,
  onSequenceGap?: () => void | Promise<void>,
  visibility: "PROTECTED" | "PUBLIC" = "PROTECTED"
) {
  const [realtimeState, setRealtimeState] = useState<RealtimeConnectionState>("POLLING_FALLBACK");
  const onProjectionReceivedRef = useRef(onProjectionReceived);
  const onSequenceGapRef = useRef(onSequenceGap);
  const fallbackTimerRef = useRef<number | null>(null);

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
        view: "PUBLIC_SCOREBOARD"
      });
    };

    const applyProjection = (next: PublicScoreboardProjection) => {
      if (visibility === "PROTECTED") {
        void onSequenceGapRef.current?.();
        return;
      }

      const publicSetter = setProjection as React.Dispatch<React.SetStateAction<PublicScoreboardProjection | null>>;
      publicSetter((current) => applyRealtimeProjectionUpdate(current, next));
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

type OperatorLiveMatchFrameProps = {
  children: React.ReactNode;
  commandLabel: string;
  currentView: "fouls" | "clock" | "timeouts";
  effectiveAccess: EffectiveMatchAccess | null;
  matchId: string;
  message: { tone: "success" | "error"; text: string; code?: string } | null;
  pendingKey: string | null;
  projection: ScoreboardProjection | null;
  realtimeState: RealtimeConnectionState;
  subtitle: string;
  title: string;
};

function OperatorLiveMatchFrame({
  children,
  commandLabel,
  currentView,
  effectiveAccess,
  matchId,
  message,
  pendingKey,
  projection,
  realtimeState,
  subtitle,
  title
}: OperatorLiveMatchFrameProps) {
  const { currentUser, roleSummary, logout } = useCurrentUser();
  const readOnly = projection ? isFinishedMatchStatus(projection.status) : false;
  const match = buildLiveMatchPresentationContext({
    awayTeamName: projection?.awayTeamName ?? null,
    homeTeamName: projection?.homeTeamName ?? null,
    matchId,
    periodLabel: projection
      ? `${projection.periodType === "OVERTIME" ? "OT" : "P"}${projection.periodNumber}`
      : null,
    status: projection?.status ?? "LOADING"
  });
  const navigation = buildLiveMatchNavigation({ currentView, effectiveAccess, matchId });
  const connection = buildOperatorLiveConnection(realtimeState, readOnly);
  const commandStatus = buildOperatorLiveCommandStatus(pendingKey, message, commandLabel);
  const displayName = currentUser?.displayName ?? currentUser?.email ?? currentUser?.userId ?? "Authenticated user";

  async function onLogout(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    await logout();
    navigate("/login");
  }

  return (
    <AuthenticatedDashboardShell
      actions={<a href="/login" onClick={onLogout}>Logout</a>}
      brand={{
        href: "/",
        label: "Basketball Scoreboard",
        onClick: (event) => {
          event.preventDefault();
          navigate("/");
        }
      }}
      contentMode="wide"
      contextLabel="Match operations"
      navigationItems={[{
        href: "/operator/matches",
        label: "Operator Matches",
        onClick: (event) => {
          event.preventDefault();
          navigate("/operator/matches");
        }
      }]}
      statusContent={<UiConnectionStatus label="Authenticated session" state="connected" />}
      subtitle={subtitle}
      title={title}
      userContent={<><strong>{displayName}</strong><span>{roleSummary}</span></>}
    >
      <LiveMatchShell
        {...(commandStatus ? { commandStatus } : {})}
        connection={connection}
        match={match}
        navigation={navigation}
      >
        {children}
      </LiveMatchShell>
    </AuthenticatedDashboardShell>
  );
}

function OperatorScorePage({ matchId }: { matchId: string }) {
  const { api, currentUser, roleSummary, logout } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [rosters, setRosters] = useState<MatchRostersResponse | null>(null);
  const [effectiveAccess, setEffectiveAccess] = useState<EffectiveMatchAccess | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<Record<ScoreControlTeamSide, string>>({ HOME: "", AWAY: "" });
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const canSubmitScore = canOperateScore(currentUser, matchId);
  const realtimeState = usePublicProjectionRealtime(matchId, projection, setProjection, undefined, refreshProjectionSilently);

  async function loadState() {
    setLoading(true);
    setMessage(null);
    setEffectiveAccess(null);
    try {
      const [nextProjection, nextRosters, nextEffectiveAccess] = await Promise.all([
        api.getMatchProjection(matchId),
        api.getMatchRosters(matchId).catch(() => null),
        api.getEffectiveMatchAccess(matchId).catch((error) => {
          setMessage(toUiMessage(error));
          return null;
        })
      ]);
      setProjection(nextProjection);
      setRosters(nextRosters);
      setEffectiveAccess(nextEffectiveAccess?.matchId === matchId ? nextEffectiveAccess : null);
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

  const isReadOnly = projection ? isFinishedMatchStatus(projection.status) : false;
  const liveMatchContext = buildLiveMatchPresentationContext({
    awayTeamName: projection?.awayTeamName ?? null,
    homeTeamName: projection?.homeTeamName ?? null,
    matchId,
    periodLabel: projection ? `${projection.periodType === "OVERTIME" ? "OT" : "P"}${projection.periodNumber}` : null,
    status: projection?.status ?? "LOADING"
  });
  const liveMatchNavigation = buildLiveMatchNavigation({
    currentView: "score",
    effectiveAccess,
    matchId
  });
  const connection = buildOperatorScoreConnection(realtimeState, isReadOnly);
  const commandStatus = buildOperatorScoreCommandStatus(pendingKey, message);
  const displayName = currentUser?.displayName ?? currentUser?.email ?? currentUser?.userId ?? "Authenticated user";

  async function onLogout(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    await logout();
    navigate("/login");
  }

  return (
    <AuthenticatedDashboardShell
      actions={<a href="/login" onClick={onLogout}>Logout</a>}
      brand={{
        href: "/",
        label: "Basketball Scoreboard",
        onClick: (event) => {
          event.preventDefault();
          navigate("/");
        }
      }}
      contentMode="wide"
      contextLabel="Match operations"
      navigationItems={[{
        href: "/operator/matches",
        label: "Operator Matches",
        onClick: (event) => {
          event.preventDefault();
          navigate("/operator/matches");
        }
      }]}
      statusContent={<UiConnectionStatus label="Authenticated session" state="connected" />}
      subtitle="Authoritative score controls and live match state"
      title="Score Control"
      userContent={<><strong>{displayName}</strong><span>{roleSummary}</span></>}
    >
      <LiveMatchShell
        {...(commandStatus ? { commandStatus } : {})}
        connection={connection}
        match={liveMatchContext}
        navigation={liveMatchNavigation}
      >
        <section className="stack" aria-label="Score workspace">
          {!canSubmitScore ? <ErrorMessage code="FORBIDDEN" message="Score operation permission is required." /> : null}
          {pendingKey ? <Notice tone="success" text="Saving..." /> : null}
          {message ? <Notice {...message} /> : null}
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
            </section>
          ) : null}
        </section>
      </LiveMatchShell>
    </AuthenticatedDashboardShell>
  );
}

function OperatorFoulPage({ matchId }: { matchId: string }) {
  const { api, currentUser } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [rosters, setRosters] = useState<MatchRostersResponse | null>(null);
  const [effectiveAccess, setEffectiveAccess] = useState<EffectiveMatchAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [foulType, setFoulType] = useState<FoulType>("PERSONAL");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const canSubmitFoul = canOperateFoul(currentUser, matchId);
  const realtimeState = usePublicProjectionRealtime(matchId, projection, setProjection, undefined, refreshProjectionSilently);

  async function loadState() {
    setLoading(true);
    setMessage(null);
    setEffectiveAccess(null);
    try {
      const [nextProjection, nextRosters, nextEffectiveAccess] = await Promise.all([
        api.getMatchProjection(matchId),
        api.getMatchRosters(matchId).catch(() => null),
        api.getEffectiveMatchAccess(matchId).catch((error) => {
          setMessage(toUiMessage(error));
          return null;
        })
      ]);
      setProjection(nextProjection);
      setRosters(nextRosters);
      setEffectiveAccess(nextEffectiveAccess?.matchId === matchId ? nextEffectiveAccess : null);
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
    <OperatorLiveMatchFrame
      commandLabel="Saving foul"
      currentView="fouls"
      effectiveAccess={effectiveAccess}
      matchId={matchId}
      message={message}
      pendingKey={pendingKey}
      projection={projection}
      realtimeState={realtimeState}
      subtitle="Authoritative team and player foul controls"
      title="Foul Control"
    >
      <section className="stack" aria-label="Foul workspace">
      <div className="panel">
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
        </section>
      ) : null}
      </section>
    </OperatorLiveMatchFrame>
  );
}

function OperatorClockPage({ matchId }: { matchId: string }) {
  const { api, currentUser } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [effectiveAccess, setEffectiveAccess] = useState<EffectiveMatchAccess | null>(null);
  const [projectionReceivedAtMs, setProjectionReceivedAtMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [gameMinutes, setGameMinutes] = useState(10);
  const [gameSeconds, setGameSeconds] = useState(0);
  const [shotSeconds, setShotSeconds] = useState(24);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const canSubmitGameClock = canOperateGameClock(currentUser, matchId);
  const canSubmitShotClock = canOperateShotClock(currentUser, matchId);
  const nowMs = useLiveClockNow(Boolean(projection?.gameClock?.running || projection?.shotClock?.running));
  const realtimeState = usePublicProjectionRealtime(matchId, projection, setProjection, () => {
    setProjectionReceivedAtMs(Date.now());
  }, refreshProjectionSilently);

  async function loadState() {
    setLoading(true);
    setMessage(null);
    setEffectiveAccess(null);
    try {
      const [nextProjection, nextEffectiveAccess] = await Promise.all([
        api.getMatchProjection(matchId),
        api.getEffectiveMatchAccess(matchId).catch((error) => {
          setMessage(toUiMessage(error));
          return null;
        })
      ]);
      setProjection(nextProjection);
      setEffectiveAccess(nextEffectiveAccess?.matchId === matchId ? nextEffectiveAccess : null);
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

  async function runClockCommand(key: string, permitted: boolean, command: () => Promise<CommandResult>) {
    if (!projection || !permitted) return;
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
    <OperatorLiveMatchFrame
      commandLabel="Saving clock"
      currentView="clock"
      effectiveAccess={effectiveAccess}
      matchId={matchId}
      message={message}
      pendingKey={pendingKey}
      projection={projection}
      realtimeState={realtimeState}
      subtitle="Authoritative game and shot clock controls"
      title="Clock Control"
    >
      <section className="stack" aria-label="Clock workspace">
      <div className="panel">
        {!canSubmitGameClock && !canSubmitShotClock ? <ErrorMessage code="FORBIDDEN" message="Clock operation permission is required." /> : null}
        {pendingKey ? <Notice tone="success" text="Saving..." /> : null}
        {message ? <Notice {...message} /> : null}
      </div>
      {loading ? <section className="panel"><p>Loading match state...</p></section> : null}
      {!loading && !projection ? (
        <section className="panel"><p className="muted">No scoreboard projection found for this match.</p></section>
      ) : null}
      {projection && clockState ? (
        <ClockWorkspace
          controls={{
            gameEnabled: canSubmitGameClock,
            onGameMinutesChange: (event) => setGameMinutes(Number(event.target.value)),
            onGameSecondsChange: (event) => setGameSeconds(Number(event.target.value)),
            onGameSet: () => void runClockCommand("game-set", canSubmitGameClock, () => api.setGameClock(matchId, buildGameClockSetPayload(projection, { minutes: gameMinutes, seconds: gameSeconds, reason }))),
            onGameStart: () => void runClockCommand("game-start", canSubmitGameClock, () => api.startGameClock(matchId, { expectedSeq: projection.currentSeq })),
            onGameStop: () => void runClockCommand("game-stop", canSubmitGameClock, () => api.stopGameClock(matchId, { expectedSeq: projection.currentSeq })),
            onReasonChange: (event) => setReason(event.target.value),
            onShotReset14: () => void runClockCommand("shot-14", canSubmitShotClock, () => api.resetShotClock(matchId, buildShotClockResetPayload(projection, 14000, reason))),
            onShotReset24: () => void runClockCommand("shot-24", canSubmitShotClock, () => api.resetShotClock(matchId, buildShotClockResetPayload(projection, 24000, reason))),
            onShotSecondsChange: (event) => setShotSeconds(Number(event.target.value)),
            onShotSet: () => void runClockCommand("shot-set", canSubmitShotClock, () => api.setShotClock(matchId, buildShotClockSetPayload(projection, { seconds: shotSeconds, reason }))),
            pending: Boolean(pendingKey),
            shotEnabled: canSubmitShotClock
          }}
          gameClock={{ label: clockState.gameClockLabel, running: clockState.gameClockRunning }}
          shotClock={{ label: clockState.shotClockLabel, running: clockState.shotClockRunning }}
          status={{ connection: getRealtimeConnectionLabel(realtimeState), match: projection.status, period: projection.periodNumber }}
          values={{ gameMinutes, gameSeconds, reason, shotSeconds }}
        />
      ) : null}
      </section>
    </OperatorLiveMatchFrame>
  );
}

function OperatorTimeoutPage({ matchId }: { matchId: string }) {
  const { api, currentUser } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [effectiveAccess, setEffectiveAccess] = useState<EffectiveMatchAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [requestedBy, setRequestedBy] = useState<TimeoutRequestedBy>("HEAD_COACH");
  const [durationSeconds, setDurationSeconds] = useState(60);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const canSubmitTimeout = canOperateTimeout(currentUser, matchId);
  const realtimeState = usePublicProjectionRealtime(matchId, projection, setProjection, undefined, refreshProjectionSilently);

  async function loadState() {
    setLoading(true);
    setMessage(null);
    setEffectiveAccess(null);
    try {
      const [nextProjection, nextEffectiveAccess] = await Promise.all([
        api.getMatchProjection(matchId),
        api.getEffectiveMatchAccess(matchId).catch((error) => {
          setMessage(toUiMessage(error));
          return null;
        })
      ]);
      setProjection(nextProjection);
      setEffectiveAccess(nextEffectiveAccess?.matchId === matchId ? nextEffectiveAccess : null);
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
    <OperatorLiveMatchFrame
      commandLabel="Saving timeout"
      currentView="timeouts"
      effectiveAccess={effectiveAccess}
      matchId={matchId}
      message={message}
      pendingKey={pendingKey}
      projection={projection}
      realtimeState={realtimeState}
      subtitle="Authoritative timeout controls and live match state"
      title="Timeout Control"
    >
      <section className="stack" aria-label="Timeout workspace">
      <div className="panel">
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
        </section>
      ) : null}
      </section>
    </OperatorLiveMatchFrame>
  );
}

function OperatorLifecyclePage({ matchId }: { matchId: string }) {
  const { api, currentUser } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [readiness, setReadiness] = useState<OperatorMatchSummary["readiness"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<LifecycleAction | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const canSubmitLifecycle = canOperateLifecycle(currentUser, matchId);
  const realtimeState = usePublicProjectionRealtime(matchId, projection, setProjection, undefined, refreshProjectionSilently);

  async function loadState() {
    setLoading(true);
    setMessage(null);
    try {
      setProjection(await api.getMatchProjection(matchId));
      try {
        const matches = await api.getOperatorMatches();
        setReadiness(matches.find((match) => match.matchId === matchId)?.readiness ?? null);
      } catch {
        setReadiness(null);
      }
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
  const readinessContext = buildLifecycleReadinessContext(readiness);
  const startChecklist = projection ? buildMatchStartChecklist(projection, readiness) : null;

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
          {readinessContext ? (
            <div className="setup-readiness" aria-label="Setup readiness context">
              <h2>Setup Readiness</h2>
              {readinessContext.warning ? <Notice tone="error" text={readinessContext.warning} /> : null}
              <dl className="state-strip">
                {readinessContext.items.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.state}</dd>
                    <small>{item.detail}</small>
                  </div>
                ))}
              </dl>
              <p className="muted">Alpha readiness is advisory here; lifecycle command policy remains enforced by the backend.</p>
            </div>
          ) : null}
          {startChecklist ? (
            <div className="setup-readiness" aria-label="Match start checklist">
              <h2>Match Start Checklist</h2>
              {startChecklist.advisoryWarning ? <Notice tone="error" text={startChecklist.advisoryWarning} /> : null}
              <dl className="state-strip">
                <div><dt>Checklist</dt><dd>{startChecklist.state}</dd></div>
                <div><dt>Ready</dt><dd>{startChecklist.readyCount}</dd></div>
                <div><dt>Warnings</dt><dd>{startChecklist.warningCount}</dd></div>
                <div><dt>Missing</dt><dd>{startChecklist.missingCount}</dd></div>
              </dl>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Status</th>
                      <th>Message</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {startChecklist.items.map((item) => (
                      <tr key={item.key}>
                        <td>{item.label}</td>
                        <td>{item.status}</td>
                        <td>{item.message}</td>
                        <td>
                          {item.actionUrl && item.actionLabel ? (
                            <a
                              href={item.actionUrl}
                              onClick={(event) => {
                                event.preventDefault();
                                navigate(item.actionUrl!);
                              }}
                            >
                              {item.actionLabel}
                            </a>
                          ) : (
                            <span className="muted">No action</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted">This Alpha checklist is advisory and is not official certification or scoresheet approval.</p>
            </div>
          ) : null}
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

function OperatorCorrectionsPage({ matchId }: { matchId: string }) {
  const { api } = useCurrentUser();
  const [projection, setProjection] = useState<ScoreboardProjection | null>(null);
  const [events, setEvents] = useState<CorrectionEligibleEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CorrectionEligibleEvent | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);

  async function loadCorrections() {
    setLoading(true);
    setMessage(null);
    try {
      const [nextProjection, eligible] = await Promise.all([
        api.getMatchProjection(matchId),
        api.getEligibleCorrectionEvents(matchId, { limit: 20 })
      ]);
      setProjection(nextProjection);
      setEvents(eligible.events);
      setSelectedEvent((current) =>
        current ? eligible.events.find((event) => event.seqNo === current.seqNo) ?? null : eligible.events[0] ?? null
      );
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCorrections();
  }, [matchId]);

  async function applyCorrection() {
    if (!projection || !selectedEvent || !canSubmitCorrectionReason(reason)) {
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const result = await api.applyAlphaCorrection(
        matchId,
        buildCorrectionCommandPayload(projection, selectedEvent, reason)
      );
      setMessage(getCorrectionControlFeedback(result));
      if ("ok" in result && result.projection) {
        setProjection(result.projection);
      }
      setReason("");
      await loadCorrections();
    } catch (error) {
      setMessage(toUiMessage(error));
    } finally {
      setPending(false);
    }
  }

  const correctionLinks = buildCorrectionNavItems(matchId, "Corrections");

  return (
    <section className="stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Operator</p>
          <h1>Corrections</h1>
        </div>
        <div className="quick-links">
          {correctionLinks.map((link) => (
            <a
              key={link.href}
              className={`${link.className}${link.current ? " current" : ""}`}
              href={link.href}
              aria-current={link.current ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate(link.href);
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
      {message ? <Notice tone={message.tone} text={message.code ? `${message.code}: ${message.text}` : message.text} /> : null}
      {loading ? <p className="muted">Loading corrections...</p> : null}
      {projection ? (
        <dl className="state-strip">
          <div><dt>Current Seq</dt><dd>{projection.currentSeq}</dd></div>
          <div><dt>Status</dt><dd>{projection.status}</dd></div>
          <div><dt>Score</dt><dd>{projection.homeScore} - {projection.awayScore}</dd></div>
        </dl>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Seq</th>
              <th>Type</th>
              <th>Summary</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const meta = buildCorrectionEventMeta(event);
              return (
                <tr key={event.seqNo}>
                  <td>{meta.seqLabel}</td>
                  <td>{meta.typeLabel}</td>
                  <td>{meta.summary}</td>
                  <td>{meta.statusLabel}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => setSelectedEvent(event)}
                      disabled={!event.eligible}
                    >
                      {meta.actionLabel}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && events.length === 0 ? <p className="muted">No eligible recent events.</p> : null}
      {selectedEvent ? (
        <div className="control-panel">
          <h2>Selected Event</h2>
          <p>{selectedEvent.summary}</p>
          <label className="form-grid compact">
            Reason
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button
            type="button"
            disabled={!canSubmitCorrectionReason(reason) || pending}
            onClick={() => void applyCorrection()}
          >
            {pending ? "Saving..." : "Append Correction"}
          </button>
          <p className="muted">Original event remains in replay and audit log.</p>
        </div>
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
  const correctionDetails = buildReplayCorrectionDetail(item);
  const playerLabel = item.player
    ? `${item.player.jerseyNumber ? `#${item.player.jerseyNumber} ` : ""}${item.player.displayName}`
    : null;
  return (
    <tr className={buildReplayRowClassName(item)}>
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
        {correctionDetails.length > 0 ? (
          <dl className="detail-list compact">
            {correctionDetails.map((detail) => (
              <div key={detail}>
                <dt>Correction</dt>
                <dd>{detail}</dd>
              </div>
            ))}
          </dl>
        ) : null}
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
  const correctionDetails = buildAuditCorrectionDetailRows(row);
  return (
    <tr className={buildAuditRowClassName(row)}>
      <td>{row.seq ?? "-"}</td>
      <td>{meta.timestamp}</td>
      <td>{meta.badge}</td>
      <td>
        <strong>{meta.title}</strong>
        <div className="muted">{row.eventType}</div>
        <div className="muted">{row.description}</div>
        {row.group === "CORRECTION" ? (
          <dl className="detail-list compact">
            {correctionDetails.map((detail) => (
              <div key={detail.label}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
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
  const [projection, setProjection] = useState<PublicScoreboardProjection | null>(null);
  const [projectionReceivedAtMs, setProjectionReceivedAtMs] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const nowMs = useLiveClockNow(Boolean(projection?.gameClock?.running || projection?.shotClock?.running));
  const realtimeState = usePublicProjectionRealtime(matchId, projection, setProjection, () => {
    setProjectionReceivedAtMs(Date.now());
    setMessage(null);
  }, refreshPublicScoreboard, "PUBLIC");

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
      <div className="button-row">
        <a
          className="button-link"
          href={buildPublicScoreboardDisplayLink(matchId)}
          onClick={(event) => {
            event.preventDefault();
            navigate(buildPublicScoreboardDisplayLink(matchId));
          }}
        >
          Display Mode
        </a>
      </div>
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
              <strong>{buildPublicScoreboardClockState(projection, { nowMs, receivedAtMs: projectionReceivedAtMs }).gameClockLabel}</strong>
              <small>{buildPublicScoreboardClockState(projection, { nowMs, receivedAtMs: projectionReceivedAtMs }).gameClockRunning ? "Running" : "Stopped"}</small>
            </div>
            <div>
              <span>Shot Clock</span>
              <strong>{buildPublicScoreboardClockState(projection, { nowMs, receivedAtMs: projectionReceivedAtMs }).shotClockLabel}</strong>
              <small>{buildPublicScoreboardClockState(projection, { nowMs, receivedAtMs: projectionReceivedAtMs }).shotClockRunning ? "Running" : "Stopped"}</small>
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

function PublicScoreboardDisplayPage({ matchId }: { matchId: string }) {
  const { api } = useCurrentUser();
  const kioskMode = isPublicDisplayKioskMode(window.location.search);
  const [projection, setProjection] = useState<PublicScoreboardProjection | null>(null);
  const [projectionReceivedAtMs, setProjectionReceivedAtMs] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const [controlsVisible, setControlsVisible] = useState(() => !kioskMode);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const nowMs = useLiveClockNow(Boolean(projection?.gameClock?.running || projection?.shotClock?.running));
  const realtimeState = usePublicProjectionRealtime(matchId, projection, setProjection, () => {
    setProjectionReceivedAtMs(Date.now());
    setMessage(null);
  }, refreshPublicScoreboard, "PUBLIC");

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

  useEffect(() => {
    const supportsFullscreen = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
    setFullscreenSupported(supportsFullscreen);
    const updateFullscreenState = () => setFullscreenActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  useEffect(() => {
    if (!controlsVisible) return;
    const timeout = window.setTimeout(() => setControlsVisible(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [controlsVisible]);

  useEffect(() => {
    const revealControls = () => setControlsVisible(true);
    window.addEventListener("keydown", revealControls);
    return () => window.removeEventListener("keydown", revealControls);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
        return;
      }
      await document.documentElement.requestFullscreen?.();
    } catch {
      setFullscreenSupported(false);
    }
  }

  const matchMetadata = useMemo(
    () => buildPublicArenaMatchMetadataDisplay(projection?.matchMetadata),
    [projection?.matchMetadata]
  );
  const teamLabels = useMemo(
    () => projection ? buildPublicScoreboardTeamLabels(projection) : null,
    [projection?.displayTheme, projection?.homeTeamName, projection?.awayTeamName]
  );
  const recentActionDisplay = useMemo(
    () => teamLabels ? toPublicRecentActionDisplay(projection?.recentActions, teamLabels) : null,
    [projection?.recentActions, teamLabels]
  );
  const display = projection
    ? buildPublicScoreboardDisplayModel(projection, {
      nowMs,
      receivedAtMs: projectionReceivedAtMs,
      realtimeState,
      matchMetadata,
      recentActionDisplay
    })
    : null;

  return (
    <PublicDisplayShell
      className={getPublicDisplayControlsClassName({ kioskMode, controlsVisible })}
      frameClassName={display?.arenaFrameClassName ?? "public-display-frame arena-layout"}
      frameStyle={display?.arenaFrameStyle as CSSProperties | undefined}
      frameLabel="16:9 public scoreboard display"
      onRevealControls={() => setControlsVisible(true)}
      controls={{
        normalHref: buildPublicScoreboardLink(matchId),
        onNormal: () => navigate(buildPublicScoreboardLink(matchId)),
        onRefresh: () => void refreshPublicScoreboard(),
        fullscreenSupported,
        fullscreenActive,
        onToggleFullscreen: () => void toggleFullscreen()
      }}
    >
      {message ? <Notice {...message} /> : null}
      {!display ? <p className="public-display-loading">Loading scoreboard...</p> : null}
      {display ? <PublicLiveScoreboard display={display} /> : null}
    </PublicDisplayShell>
  );
}

function PublicDisplayScenePage({ screenSlug }: { screenSlug: string }) {
  const { api } = useCurrentUser();
  const [sceneModel, setSceneModel] = useState<PublicDisplaySceneModel | null>(null);
  const [refreshAfterMs, setRefreshAfterMs] = useState(30000);

  async function refreshDisplayScene(cancelled?: () => boolean) {
    try {
      const data = await api.getPublicDisplayScreen(screenSlug);
      if (!cancelled?.()) {
        const nextModel = buildPublicDisplaySceneModel(data);
        setSceneModel(nextModel);
        setRefreshAfterMs(nextModel.refreshAfterMs);
      }
    } catch (error) {
      if (!cancelled?.()) {
        const status = error instanceof ApiClientError ? error.status : 500;
        const nextModel = buildPublicDisplaySceneModel(null, { unavailableState: status === 404 ? "NOT_FOUND" : "ERROR" });
        setSceneModel(nextModel);
        setRefreshAfterMs(nextModel.refreshAfterMs);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    void refreshDisplayScene(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [api, screenSlug]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setInterval(
      () => void refreshDisplayScene(() => cancelled),
      getPublicDisplaySceneRefreshMs(refreshAfterMs)
    );
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [api, screenSlug, refreshAfterMs]);

  if (sceneModel?.status === "READY" && sceneModel.sceneType === "LIVE_SCOREBOARD") {
    return <PublicScoreboardDisplayPage matchId={sceneModel.matchId} />;
  }

  return (
    <PublicDisplayShell
      className="public-display-shell kiosk-mode controls-hidden"
      frameClassName="public-display-frame arena-layout public-display-scene-frame"
      frameLabel="Public display scene"
    >
      <PublicDisplaySceneCard model={sceneModel} fallbackSlug={screenSlug} />
    </PublicDisplayShell>
  );
}

function PublicDisplaySceneCard({
  model,
  fallbackSlug
}: {
  model: PublicDisplaySceneModel | null;
  fallbackSlug: string;
}) {
  if (model?.status === "READY" && model.sceneType === "SCHEDULE") {
    return <PublicScheduleDisplayScene model={model} />;
  }

  if (model?.status === "READY" && model.sceneType === "FINAL_SUMMARY") {
    return <PublicFinalSummaryDisplayScene model={model} />;
  }

  const displayName = model?.displayName ?? fallbackSlug;
  const sceneType = model?.sceneType ?? "BLANK";
  const status = model?.status ?? "ERROR";
  const title = getPublicDisplaySceneCardTitle(model);
  const message = getPublicDisplaySceneCardMessage(model);

  return (
    <div className={`public-display-scene-card public-display-standby scene-${String(sceneType).toLowerCase().replace(/_/g, "-")}`}>
      <p className="eyebrow">Public Display</p>
      <h1>{displayName}</h1>
      <div className="public-display-scene-status">
        <span>{status === "READY" ? sceneType : status}</span>
      </div>
      <h2>{title}</h2>
      <p>{message}</p>
      <small>Read-only public scene</small>
    </div>
  );
}

function PublicScheduleDisplayScene({
  model
}: {
  model: Extract<PublicDisplaySceneModel, { status: "READY"; sceneType: "SCHEDULE" }>;
}) {
  const densityClassName = model.rows.length <= 1
    ? "schedule-density-single"
    : model.rows.length <= 4
      ? "schedule-density-low"
      : "schedule-density-full";

  return (
    <div className="public-display-schedule-card">
      <header className="public-display-schedule-header">
        <div>
          <p className="eyebrow">Public Schedule</p>
          <h1>{model.tournamentLabel}</h1>
        </div>
        <span className="public-display-scene-status">Schedule</span>
      </header>
      {model.rows.length === 0 ? (
        <div className="public-display-schedule-empty">
          <h2>Schedule unavailable</h2>
          <p>{model.emptyMessage ?? "No public schedule entries available."}</p>
        </div>
      ) : (
        <div className={`public-display-schedule-grid ${densityClassName}`} aria-label="Public schedule entries">
          {model.rows.map((row) => (
            <article className={`public-display-schedule-row schedule-row-${row.status.toLowerCase()}`} key={row.matchId}>
              <time className="public-display-schedule-time" dateTime={row.scheduledAt ?? undefined}>
                {formatPublicScheduleDisplayTime(row.scheduledAt)}
              </time>
              <div className="public-display-schedule-matchup">
                <strong>{row.homeTeamName}</strong>
                <span className="public-display-schedule-versus">vs</span>
                <strong>{row.awayTeamName}</strong>
                <small className="public-display-schedule-location">
                  {formatPublicScheduleDisplayLocation(row.venueLabel, row.courtLabel)}
                </small>
              </div>
              <div className="public-display-schedule-meta">
                <span className="public-display-schedule-stage">{row.stageLabel ?? row.roundLabel ?? "Match"}</span>
                <b className={`schedule-status status-${row.status.toLowerCase()}`}>{row.status}</b>
              </div>
            </article>
          ))}
        </div>
      )}
      <small className="public-display-schedule-readonly">Read-only public scene</small>
    </div>
  );
}

function getPublicDisplaySceneCardTitle(model: PublicDisplaySceneModel | null) {
  return model && "title" in model ? model.title : "Loading Display";
}

function getPublicDisplaySceneCardMessage(model: PublicDisplaySceneModel | null) {
  return model && "message" in model ? model.message : "Loading active display scene.";
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

function StandingsContent({ standings, mode }: { standings: TournamentStandingsResponse; mode: "admin" | "public" }) {
  const publicEmptyState = mode === "public"
    ? getPublicStandingsEmptyState(standings.summary.finishedMatchCount, standings.rows.length)
    : null;

  return (
    <>
      <Notice
        tone="success"
        text="Alpha standings are provisional. Official tiebreak rules are not implemented."
      />
      <p className="muted">{standings.rulesNotice}</p>
      <dl className="state-strip">
        <div><dt>Teams</dt><dd>{standings.summary.teamCount}</dd></div>
        <div><dt>Finished counted</dt><dd>{standings.summary.finishedMatchCount}</dd></div>
        <div><dt>Excluded matches</dt><dd>{standings.summary.excludedMatchCount}</dd></div>
        <div><dt>Official</dt><dd>{standings.isOfficial ? "Yes" : "No"}</dd></div>
      </dl>
      <div className="button-row">
        {mode === "public" ? (
          <PublicStandingsLinks tournamentId={standings.tournamentId} />
        ) : (
          <>
            <a className="button-link secondary" href={buildAdminTournamentScheduleLink(standings.tournamentId)} onClick={(event) => { event.preventDefault(); navigate(buildAdminTournamentScheduleLink(standings.tournamentId)); }}>
              Open Schedule
            </a>
            <a className="button-link secondary" href={buildPublicTournamentScheduleLink(standings.tournamentId)} onClick={(event) => { event.preventDefault(); navigate(buildPublicTournamentScheduleLink(standings.tournamentId)); }}>
              Public Schedule
            </a>
          </>
        )}
      </div>
      {standings.rows.length === 0 ? (
        <section className="empty-state">
          <h2>{publicEmptyState?.title ?? "No standings rows"}</h2>
          <p>{publicEmptyState?.description ?? "Standings unavailable because no tournament match data has teams yet."}</p>
        </section>
      ) : null}
      {standings.rows.length > 0 ? <StandingsTable rows={standings.rows} /> : null}
    </>
  );
}

function StandingsTable({ rows }: { rows: TournamentStandingsRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Team</th>
            <th>Played</th>
            <th>W</th>
            <th>L</th>
            <th>PF</th>
            <th>PA</th>
            <th>Diff</th>
            <th>Tie status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const meta = buildStandingsRowMeta(row, index + 1);
            return (
              <tr key={row.teamId}>
                <td>{meta.provisionalRank}</td>
                <td>{row.teamName}</td>
                <td>{row.played}</td>
                <td>{row.wins}</td>
                <td>{row.losses}</td>
                <td>{row.pointsFor}</td>
                <td>{row.pointsAgainst}</td>
                <td>{meta.pointDifferentialLabel}</td>
                <td>{meta.tieLabel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PublicStandingsLinks({ tournamentId }: { tournamentId: string }) {
  const links = getPublicStandingsLinks(tournamentId);
  return (
    <a
      className="button-link secondary"
      href={links.schedule.href}
      onClick={(event) => {
        event.preventDefault();
        navigate(links.schedule.href);
      }}
    >
      {links.schedule.label}
    </a>
  );
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
            const checklistBadge = buildScheduleChecklistBadge(match);
            return (
              <tr key={match.matchId}>
                <td>{meta.scheduleLabel}</td>
                <td>{meta.locationLabel}</td>
                <td>
                  {meta.matchupLabel}
                  {mode === "admin" ? (
                    <div className="readiness-badges" aria-label="Match readiness derived from current setup data">
                      {buildReadinessBadges(match).map((badge) => (
                        <span className="readiness-badge" key={badge.label} title={badge.title}>
                          {badge.label}
                        </span>
                      ))}
                      {checklistBadge ? (
                        <span className="readiness-badge" title={checklistBadge.title}>
                          {checklistBadge.label}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {mode === "admin" && meta.conflictBadgeLabel ? (
                    <div className="schedule-warning">
                      <strong>{meta.conflictBadgeLabel}</strong>
                      {meta.conflictDetail ? <span> {meta.conflictDetail}</span> : null}
                    </div>
                  ) : null}
                </td>
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
  const operations = match.operations;
  const links = [
    { href: operations?.operatorScoreUrl ?? buildOperatorMatchScoreLink(match.matchId), label: "Open Match Ops" },
    { href: operations?.officialsUrl ?? buildAdminMatchLink(match.matchId), label: "Assign Officials" },
    { href: operations?.rostersUrl ?? `/admin/matches/${encodeURIComponent(match.matchId)}/rosters`, label: "Setup Roster" },
    { href: operations?.lineupUrl ?? `/admin/matches/${encodeURIComponent(match.matchId)}/lineup`, label: "Setup Lineup" },
    { href: buildAdminMatchDisplayThemeLink(match.matchId), label: "Display Theme" },
    { href: match.publicScoreboardPath, label: "Public Scoreboard" },
    { href: operations?.operatorFoulsUrl ?? buildOperatorMatchFoulsLink(match.matchId), label: "Fouls" },
    { href: operations?.operatorClockUrl ?? buildOperatorMatchClockLink(match.matchId), label: "Clock" },
    { href: operations?.operatorTimeoutsUrl ?? buildOperatorMatchTimeoutsLink(match.matchId), label: "Timeouts" },
    { href: operations?.operatorLifecycleUrl ?? buildOperatorMatchLifecycleLink(match.matchId), label: "Start / Lifecycle" },
    { href: operations?.summaryUrl ?? buildOperatorMatchSummaryLink(match.matchId), label: "Summary" },
    { href: operations?.replayUrl ?? buildOperatorMatchReplayLink(match.matchId), label: "Replay" },
    { href: operations?.auditLogUrl ?? buildOperatorMatchAuditLogLink(match.matchId), label: "Audit Log" }
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
      {[links.scoreboard, links.display].map((link) => (
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
                    {match.tournamentId ? (
                      <a
                        href={buildOperatorTournamentLiveDashboardLink(match.tournamentId)}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate(buildOperatorTournamentLiveDashboardLink(match.tournamentId!));
                        }}
                      >
                        Live Dashboard
                      </a>
                    ) : null}
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
  const [candidates, setCandidates] = useState<OfficialCandidate[]>([]);
  const [form, setForm] = useState<AssignmentFormState>(() => createAssignmentFormState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; code?: string } | null>(null);
  const isAdmin = canManageAssignments(currentUser);
  const formLabels = getAssignmentFormLabels();
  const candidateOptions = createAssignmentCandidateOptions(candidates);

  async function loadOfficials() {
    setLoading(true);
    setMessage(null);
    try {
      const [nextOfficials, nextCandidates] = await Promise.all([
        api.listOfficials(matchId),
        isAdmin ? api.listOfficialCandidates() : Promise.resolve([])
      ]);
      setOfficials(nextOfficials);
      setCandidates(nextCandidates);
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
    const validation = validateAssignmentForm(form);
    if (!validation.ok) {
      setMessage({ tone: "error", text: validation.message, code: validation.reasonCode });
      return;
    }
    setSaving(true);
    try {
      await api.assignOfficial(matchId, {
        userId: form.userId.trim(),
        roleCode: form.roleCode as MatchOfficialRoleCode
      });
      setMessage({ tone: "success", text: "Official assigned." });
      setForm(createAssignmentFormState());
      await loadOfficials();
    } catch (error) {
      setMessage(toAssignmentUiMessage(error));
    } finally {
      setSaving(false);
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
              {formLabels.official}
              <select
                value={form.userId}
                onChange={(event) => setForm({ ...form, userId: event.target.value })}
              >
                <option value="">{formLabels.officialPlaceholder}</option>
                {candidateOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {formLabels.role}
              <select
                value={form.roleCode}
                onChange={(event) =>
                  setForm({ ...form, roleCode: event.target.value as MatchOfficialRoleCode })
                }
              >
                <option value="">Select role</option>
                {matchOfficialRoleCodes.map((roleCode) => (
                  <option key={roleCode} value={roleCode}>
                    {roleCode}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={isAssignmentSubmitDisabled(form, saving)}>
              {saving ? "Assigning..." : "Assign official"}
            </button>
          </form>
          {!loading && candidateOptions.length === 0 ? <p className="muted">No assignable users found.</p> : null}
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
                  <th>Official</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Assigned</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {officials.map((official) => (
                  <tr key={official.id}>
                    <td>{official.displayName ?? official.userId}</td>
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
  const rosterSummary = buildRosterSetupSummary(rosters);
  const setupLinks = buildSetupQuickLinks(matchId);

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
        <section className="panel">
          <h2>Roster Readiness</h2>
          <dl className="state-strip">
            <div><dt>Status</dt><dd>{rosterSummary.state}</dd></div>
            <div><dt>HOME players</dt><dd>{rosterSummary.homeCount}</dd></div>
            <div><dt>AWAY players</dt><dd>{rosterSummary.awayCount}</dd></div>
          </dl>
          <p className="muted">{rosterSummary.nextAction}</p>
          <div className="button-row">
            {[setupLinks.lineup, setupLinks.lifecycle].map((link) => (
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
  const lineupSummary = buildLineupSetupSummary(lineup);
  const setupLinks = buildSetupQuickLinks(matchId);

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
        <section className="panel">
          <h2>Lineup Readiness</h2>
          <dl className="state-strip">
            <div><dt>Status</dt><dd>{lineupSummary.state}</dd></div>
            <div><dt>HOME starters</dt><dd>{lineupSummary.homeStarters}/5</dd></div>
            <div><dt>AWAY starters</dt><dd>{lineupSummary.awayStarters}/5</dd></div>
            <div><dt>HOME confirmed</dt><dd>{lineupSummary.homeConfirmed ? "YES" : "NO"}</dd></div>
            <div><dt>AWAY confirmed</dt><dd>{lineupSummary.awayConfirmed ? "YES" : "NO"}</dd></div>
          </dl>
          <p className="muted">{lineupSummary.nextAction}</p>
          <div className="button-row">
            {[setupLinks.rosters, setupLinks.lifecycle].map((link) => (
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

function toAssignmentUiMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return {
      tone: "error" as const,
      code: error.reasonCode,
      text: toAssignmentValidationMessage(error.reasonCode) ?? error.message
    };
  }
  return toUiMessage(error);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function RoutedApp({ route }: { route: Route }) {
  const content = useMemo(() => {
    switch (route.name) {
      case "login":
        return <LoginPage />;
      case "admin":
        return (
          <ProtectedRoute requireAdmin>
            <AdminDashboardHome />
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
      case "admin-tournament-live-dashboard":
        return (
          <ProtectedRoute requireAdmin>
            <TournamentLiveDashboardPage tournamentId={route.tournamentId} mode="admin" />
          </ProtectedRoute>
        );
      case "admin-tournament-standings":
        return (
          <ProtectedRoute requireAdmin>
            <AdminTournamentStandingsPage tournamentId={route.tournamentId} />
          </ProtectedRoute>
        );
      case "admin-tournament-display-theme":
        return (
          <ProtectedRoute requireAdmin>
            <AdminTournamentDisplayThemePage tournamentId={route.tournamentId} />
          </ProtectedRoute>
        );
      case "admin-team-display-profile":
        return (
          <ProtectedRoute requireAdmin>
            <AdminTeamDisplayProfilePage teamId={route.teamId} />
          </ProtectedRoute>
        );
      case "admin-match-display-theme":
        return (
          <ProtectedRoute requireAdmin>
            <AdminMatchDisplayThemePage matchId={route.matchId} />
          </ProtectedRoute>
        );
      case "admin-display-screens":
        return (
          <ProtectedRoute requireAdmin>
            <AdminDisplayScreensPage />
          </ProtectedRoute>
        );
      case "admin-display-screen-new":
        return (
          <ProtectedRoute requireAdmin>
            <AdminDisplayScreenFormPage />
          </ProtectedRoute>
        );
      case "admin-display-screen-detail":
        return (
          <ProtectedRoute requireAdmin>
            <AdminDisplayScreenFormPage screenId={route.screenId} />
          </ProtectedRoute>
        );
      case "admin-display-screen-scenes":
        return (
          <ProtectedRoute requireAdmin>
            <AdminDisplayScreenScenesPage screenId={route.screenId} />
          </ProtectedRoute>
        );
      case "admin-display-screen-preview":
        return (
          <ProtectedRoute requireAdmin>
            <AdminDisplayScreenPreviewPage screenId={route.screenId} />
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
      case "operator-tournament-live-dashboard":
        return (
          <ProtectedRoute requireOperator>
            <TournamentLiveDashboardPage tournamentId={route.tournamentId} mode="operator" />
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
      case "operator-corrections":
        return (
          <ProtectedRoute requireOperator>
            <OperatorCorrectionsPage matchId={route.matchId} />
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
      case "public-display-scene":
        return <PublicDisplayScenePage screenSlug={route.screenSlug} />;
      case "public-scoreboard":
        return <PublicScoreboardPage matchId={route.matchId} />;
      case "public-scoreboard-display":
        return <PublicScoreboardDisplayPage matchId={route.matchId} />;
      case "public-tournaments":
        return <PublicTournamentsPage />;
      case "public-tournament-schedule":
        return <PublicTournamentSchedulePage tournamentId={route.tournamentId} />;
      case "public-tournament-standings":
        return <PublicTournamentStandingsPage tournamentId={route.tournamentId} />;
      case "unauthorized":
        return <UnauthorizedPage />;
      case "home":
        return <HomePage />;
    }
  }, [route]);

  if (
    route.name === "admin" ||
    route.name === "operator-score" ||
    route.name === "operator-fouls" ||
    route.name === "operator-clock" ||
    route.name === "operator-timeouts" ||
    route.name === "public-scoreboard-display" ||
    route.name === "public-display-scene"
  ) {
    return content;
  }

  return <Shell>{content}</Shell>;
}

export default function App() {
  const route = useRoute();
  const bootstrapCurrentUser = shouldBootstrapAuthForPath(window.location.pathname);

  return (
    <AuthProvider
      key={bootstrapCurrentUser ? "protected" : "public"}
      bootstrapCurrentUser={bootstrapCurrentUser}
    >
      <RoutedApp route={route} />
    </AuthProvider>
  );
}
