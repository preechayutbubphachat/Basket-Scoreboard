import React from "react";
import { createRoot } from "react-dom/client";
import { AuthenticatedDashboardShell } from "../../apps/web/src/components/AuthenticatedDashboardShell";
import { LiveMatchShell, type LiveMatchShellProps } from "../../apps/web/src/components/LiveMatchShell";
import { ClockWorkspace } from "../../apps/web/src/components/ClockWorkspace";
import { validateGameClockSetInput } from "../../apps/web/src/lib/clockControl";
import type { EffectiveMatchAccess } from "@basket-scoreboard/api-contracts";
import {
  buildLiveMatchNavigation,
  buildLiveMatchPresentationContext
} from "../../apps/web/src/lib/liveMatchPresentation";
import "../../apps/web/src/styles/tokens.css";
import "../../apps/web/src/styles/primitives.css";
import "../../apps/web/src/styles/authenticated-dashboard.css";
import "../../apps/web/src/styles/live-match-shell.css";
import "../../apps/web/src/styles/clock-workspace.css";
import "../../apps/web/src/styles.css";

const parameters = new URLSearchParams(window.location.search);
const fixtureState = parameters.get("state") ?? "ready";
const showRail = parameters.get("rail") !== "0";
const useLongNames = parameters.get("names") === "long";
const navigationState = parameters.get("navigation") ?? "full";
const omitMetadata = parameters.get("metadata") === "none";
const commandState = parameters.get("command") ?? "idle";
const workspace = parameters.get("workspace") ?? "score";

const connectionByState: Record<string, LiveMatchShellProps["connection"]> = {
  degraded: { label: "Arena link degraded", state: "reconnecting" },
  final: { label: "Final result", state: "read-only" },
  offline: { label: "Arena link offline", state: "offline" },
  ready: { label: "Arena link connected", state: "connected" }
};

const match = buildLiveMatchPresentationContext({
  awayTeamName: useLongNames
    ? "สโมสรบาสเกตบอลเยาวชนเชียงใหม่ฟอลคอนส์นานาชาติชิงแชมป์ประเทศไทย"
    : "Chiang Mai Falcons",
  courtLabel: omitMetadata ? null : "Court 1",
  homeTeamName: useLongNames
    ? "Bangkok Metropolitan Youth Basketball Academy Championship Selection"
    : "Bangkok Thunder",
  matchId: "fixture-match-1",
  periodLabel: omitMetadata ? null : fixtureState === "final" ? "Final" : "Q4",
  status: fixtureState === "final" ? "FINAL" : "LIVE",
  tournamentLabel: omitMetadata ? null : useLongNames
    ? "การแข่งขัน National Arena Invitational กรุงเทพมหานคร 2026"
    : "National Arena Invitational"
});

const fullCapabilities: EffectiveMatchAccess["capabilities"] = {
  matchRead: true,
  scoreOperate: true,
  foulOperate: true,
  gameClockOperate: true,
  shotClockOperate: true,
  timeoutOperate: true,
  lifecycleOperate: true,
  correctionRequest: true,
  correctionApply: true,
  correctionReject: true,
  auditRead: true
};
const effectiveAccess: EffectiveMatchAccess | null = navigationState === "zero" ? null : {
  matchId: match.matchId,
  capabilities: navigationState === "partial"
    ? { ...fullCapabilities, scoreOperate: false, foulOperate: false, timeoutOperate: false, lifecycleOperate: false, correctionRequest: false, auditRead: false }
    : fullCapabilities
};
const navigation = buildLiveMatchNavigation({
  matchId: match.matchId,
  currentView: workspace,
  effectiveAccess
});
const workspaceLabel = `${workspace[0]?.toUpperCase()}${workspace.slice(1)} workspace`;
const commandStatus: LiveMatchShellProps["commandStatus"] = commandState === "pending"
  ? { label: `Saving ${workspace}`, state: "pending" }
  : commandState === "conflict"
    ? { detail: "Authoritative state changed. Refresh before retrying.", state: "sync-required" }
    : commandState === "error"
      ? { detail: `${workspaceLabel} command rejected.`, state: "rejected" }
      : undefined;

function ClockFixtureWorkspace() {
  const [stage, setStage] = React.useState<"closed" | "edit" | "confirm">("closed");
  const [minutes, setMinutes] = React.useState(2);
  const [seconds, setSeconds] = React.useState(41);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [dispatchCount, setDispatchCount] = React.useState(0);
  const pending = commandState === "pending";

  function requestConfirmation() {
    const result = validateGameClockSetInput({ minutes, seconds, reason });
    if (!result.valid) {
      setError(result.error);
      return;
    }
    setReason(result.reason);
    setError(null);
    setStage("confirm");
  }

  return <>
    <output data-testid="game-set-dispatch-count" aria-live="polite">Game corrections dispatched: {dispatchCount}</output>
    <ClockWorkspace
      controls={{
        gameEnabled: fixtureState !== "final",
        onGameMinutesChange: (event) => setMinutes(Number(event.currentTarget.value)),
        onGameSecondsChange: (event) => setSeconds(Number(event.currentTarget.value)),
        onGameSet: () => {
          if (pending) return;
          setDispatchCount((count) => count + 1);
          setStage("closed");
        },
        onGameStart: () => {}, onGameStop: () => {},
        onReasonChange: (event) => setReason(event.currentTarget.value),
        onShotReset14: () => {}, onShotReset24: () => {}, onShotSecondsChange: () => {}, onShotSet: () => {},
        pending, shotEnabled: fixtureState !== "final"
      }}
      gameClock={{ label: "02:41", running: true }}
      gameSetFlow={{
        error,
        onCancel: () => { setError(null); setStage("closed"); },
        onOpen: () => { setError(null); setStage("edit"); },
        onRequestConfirmation: requestConfirmation,
        stage
      }}
      shotClock={{ label: "14", running: false }}
      status={{ connection: connectionByState[fixtureState]?.label ?? "Arena link connected", match: fixtureState === "final" ? "Final" : "Live", period: 4 }}
      values={{ gameMinutes: minutes, gameSeconds: seconds, reason, shotSeconds: 14 }}
    />
  </>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Fixture root was not found");

createRoot(root).render(
  <React.StrictMode>
    <AuthenticatedDashboardShell
      brand={{ href: "#home", label: "Basketball Scoreboard" }}
      contentMode="wide"
      contextLabel="Authenticated fixture"
      navigationItems={[{ current: true, href: "#matches", label: "Matches" }]}
      statusContent={<span>Test session</span>}
      title="Live match operations"
      userContent={<strong>Assigned operator</strong>}
    >
      <LiveMatchShell
        actions={<button type="button">Open match details</button>}
        {...(commandStatus
          ? { commandStatus }
          : fixtureState === "degraded"
            ? { commandStatus: { detail: "Waiting for authoritative state", state: "sync-required" as const } }
            : {})}
        connection={connectionByState[fixtureState] ?? connectionByState.ready}
        match={match}
        navigation={navigation}
        safetyGuidance={fixtureState === "degraded" ? "Refresh authoritative state before continuing." : undefined}
        secondaryRail={showRail ? (
          <section>
            <h2>Match context</h2>
            <p>Consumer-owned supporting information stays in this rail.</p>
          </section>
        ) : undefined}
      >
        {workspace === "clock" ? <ClockFixtureWorkspace /> : <section aria-label={workspaceLabel} className="panel score-control">
          <h2>{workspaceLabel}</h2>
          <div className="score-display" aria-label="Current score">
            <div><span>{workspace === "clock" ? "GAME CLOCK" : "HOME"}</span><strong>{workspace === "clock" ? "02:41" : "72"}</strong><small>{match.homeTeamName}</small></div>
            <div><span>{workspace === "clock" ? "SHOT CLOCK" : "AWAY"}</span><strong>{workspace === "clock" ? "14" : "68"}</strong><small>{match.awayTeamName}</small></div>
          </div>
          <div className="score-actions">
            {[match.homeTeamName, match.awayTeamName].map((teamName) => (
              <div key={teamName}>
                <h3>{teamName}</h3>
                <div className="button-row">
                  {(workspace === "score"
                    ? ["+1", "+2", "+3"]
                    : workspace === "clock"
                      ? ["Start", "Stop"]
                      : workspace === "timeouts"
                        ? ["Grant timeout"]
                        : ["Add team foul", "Add player foul"]
                  ).map((action) => (
                    <button
                      className="score-button"
                      disabled={fixtureState === "final" || commandState === "pending"}
                      key={action}
                      type="button"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>}
      </LiveMatchShell>
    </AuthenticatedDashboardShell>
  </React.StrictMode>
);
