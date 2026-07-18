import React, { useEffect, useReducer, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ScoreWorkspace } from "../../apps/web/src/components/ScoreWorkspace";
import { buildScoreControlPanels, type ScoreControlPoint, type ScoreControlTeamSide } from "../../apps/web/src/lib/scoreControl";
import {
  buildScoreQueuePresentation,
  createScoreIntent,
  initialScoreIntentQueueState,
  scoreIntentQueueReducer
} from "../../apps/web/src/lib/scoreIntentQueue";
import "../../apps/web/src/styles/tokens.css";
import "../../apps/web/src/styles/primitives.css";
import "../../apps/web/src/styles/score-workspace.css";
import "../../apps/web/src/styles.css";

function Fixture() {
  const [selectedPlayers, setSelectedPlayers] = useState<Record<ScoreControlTeamSide, string>>({ HOME: "", AWAY: "" });
  const [dispatches, setDispatches] = useState<string[]>([]);
  const [correctionNavigations, setCorrectionNavigations] = useState(0);
  const [projectionSeq, setProjectionSeq] = useState(1284);
  const [queue, dispatchQueue] = useReducer(scoreIntentQueueReducer, initialScoreIntentQueueState);
  const identityRef = useRef(0);
  const networkActiveRef = useRef(0);
  const [maxNetworkActive, setMaxNetworkActive] = useState(0);
  const failedOnceRef = useRef(false);
  const failureMode = new URLSearchParams(window.location.search).get("failure");
  const [accessMode, setAccessMode] = useState(new URLSearchParams(window.location.search).get("access") ?? "both");
  const accessStatusRef = useRef<HTMLElement>(null);
  const previousScoreAccessRef = useRef(false);
  const canRead = !["denied", "loading", "error", "mismatch"].includes(accessMode);
  const canScore = accessMode === "both" || accessMode === "score";
  const canCorrect = accessMode === "both" || accessMode === "correction";
  const panels = buildScoreControlPanels({
    awayScore: 84,
    awayTeamName: "Phuket Sharks Academy",
    homeScore: 88,
    homeTeamName: "Bangkok Tigers Youth"
  }).map((panel) => ({
    ...panel,
    fouls: panel.teamSide === "HOME" ? 4 : 3,
    playerOptions: panel.teamSide === "HOME"
      ? [{ label: "#12 Kittipong", playerId: "home-player" }]
      : [{ label: "#9 Thanawat", playerId: "away-player" }],
    selectedPlayerId: selectedPlayers[panel.teamSide]
  }));

  function score(teamSide: ScoreControlTeamSide, points: ScoreControlPoint) {
    if (!canScore || queue.pauseReason) return;
    identityRef.current += 1;
    const suffix = String(identityRef.current).padStart(12, "0");
    dispatchQueue({
      type: "ENQUEUE",
      intent: createScoreIntent({
        commandId: `00000000-0000-4000-8000-${suffix}`,
        correlationId: `10000000-0000-4000-8000-${suffix}`,
        localIntentId: `20000000-0000-4000-8000-${suffix}`,
        playerId: selectedPlayers[teamSide] || null,
        points,
        projection: { gameClockRemainingMs: 134000, periodNumber: 4 },
        teamSide
      })
    });
  }

  useEffect(() => {
    if (canScore && !queue.activeIntent && !queue.pauseReason && queue.queuedIntents.length > 0) dispatchQueue({ type: "START_NEXT" });
  }, [canScore, queue.activeIntent, queue.pauseReason, queue.queuedIntents.length]);

  useEffect(() => {
    if (previousScoreAccessRef.current && !canScore) {
      if (queue.activeIntent || queue.queuedIntents.length > 0) {
        dispatchQueue({ type: "PAUSE", reason: "ACCESS_LOST", detail: "Score access changed. Remaining actions require review." });
      }
      window.setTimeout(() => accessStatusRef.current?.focus(), 0);
    }
    previousScoreAccessRef.current = canScore;
  }, [canScore, queue.activeIntent, queue.queuedIntents.length]);

  useEffect(() => {
    const active = queue.activeIntent;
    if (!active || queue.pauseReason) return;
    networkActiveRef.current += 1;
    setMaxNetworkActive((current) => Math.max(current, networkActiveRef.current));
    const timer = window.setTimeout(() => {
      networkActiveRef.current -= 1;
      if (failureMode === "sync" && !failedOnceRef.current) {
        failedOnceRef.current = true;
        dispatchQueue({ type: "PAUSE", reason: "SYNC_REQUIRED", detail: "Fixture authoritative refresh complete; failed action will not replay." });
        return;
      }
      setDispatches((current) => [...current, `${active.teamSide}:${active.points}:${active.playerId ?? "none"}:${projectionSeq}`]);
      setProjectionSeq((current) => current + 1);
      dispatchQueue({ type: "ACCEPT_ACTIVE" });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [failureMode, projectionSeq, queue.activeIntent, queue.pauseReason, queue.retryNonce]);

  const queuePresentation = buildScoreQueuePresentation(queue);

  return (
    <main style={{ margin: "0 auto", maxWidth: 1560, padding: 16 }}>
      <section aria-atomic="true" aria-live="polite" className="panel" ref={accessStatusRef} role="status" tabIndex={-1}>
        <strong>Score access</strong>
        <p>{accessMode === "loading" ? "Checking match access…" : accessMode === "error" ? "Match access is unavailable. Commands are disabled." : accessMode === "mismatch" ? "Match access could not be verified for this route. Commands are disabled." : accessMode === "denied" ? "This match is not available for operation." : canScore ? "Scoring controls are available." : "Scores are available read-only."}</p>
      </section>
      <button data-testid="revoke-score" type="button" onClick={() => setAccessMode("read-only")}>Revoke score access</button>
      {canRead ? (
      <ScoreWorkspace
        commandPending={false}
        connectionLabel="Realtime connected"
        controlsEnabled={canScore && !queue.pauseReason}
        scoreControlsVisible={canScore}
        correctionEntry={canCorrect ? {
          blocked: Boolean(queue.activeIntent || queue.queuedIntents.length > 0 || queue.pauseReason),
          href: "#corrections",
          onNavigate: () => setCorrectionNavigations((count) => count + 1)
        } : null}
        currentSeq={1284}
        matchStatus="LIVE"
        onPlayerChange={(teamSide, playerId) => setSelectedPlayers((current) => ({ ...current, [teamSide]: playerId }))}
        onScore={score}
        panels={panels}
        pendingKey={queue.activeIntent ? `${queue.activeIntent.teamSide}-${queue.activeIntent.points}` : null}
        periodLabel="P4"
        queueStatus={queuePresentation ? {
          ...queuePresentation,
          resumeAvailable: canScore,
          onDiscard: () => dispatchQueue({ type: "DISCARD_ALL" }),
          onResume: () => dispatchQueue({ type: "RESUME_QUEUED" }),
          onRetry: () => dispatchQueue({ type: "RETRY_ACTIVE" })
        } : null}
      />
      ) : null}
      <output data-testid="dispatches">{dispatches.join(",")}</output>
      <output data-testid="correction-navigations">{correctionNavigations}</output>
      <output data-testid="max-network-active">{maxNetworkActive}</output>
      <output data-testid="projection-seq">{projectionSeq}</output>
      <output data-testid="queue-state">{queue.pauseReason ?? "RUNNING"}:{queue.queuedIntents.length}:{queue.activeIntent ? "ACTIVE" : "IDLE"}</output>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
