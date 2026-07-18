import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CorrectionEligibleEvent, ScoreboardProjection } from "@basket-scoreboard/api-contracts";
import { ScoreCorrectionWorkspace } from "../../apps/web/src/components/ScoreCorrectionWorkspace";
import { buildScoreCorrectionReview, canSubmitCorrectionReason, type ScoreCorrectionReview } from "../../apps/web/src/lib/correctionControl";
import "../../apps/web/src/styles/tokens.css";
import "../../apps/web/src/styles/primitives.css";
import "../../apps/web/src/styles/score-correction-workspace.css";
import "../../apps/web/src/styles.css";

const projection = { homeScore: 72, awayScore: 68, homeTeamName: "Bangkok Tigers", awayTeamName: "Phuket Sharks", currentSeq: 44, periodNumber: 4 } as ScoreboardProjection;
const target = { seqNo: 41, eventType: "SCORE_ADDED", occurredAt: new Date().toISOString(), actorDisplayName: null, summary: "HOME +2 · #12 Kittipong", eligible: true, ineligibleReason: null, correctionKind: "SCORE_UNDO", currentValue: { teamSide: "HOME", points: 2, playerName: "Kittipong", jerseyNumber: "12" }, proposedCompensation: { teamSide: "HOME", points: -2 } } satisfies CorrectionEligibleEvent;

function Fixture() {
  const [stage, setStage] = useState<"closed" | "edit" | "confirm">("closed");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<ScoreCorrectionReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dispatchCount, setDispatchCount] = useState(0);
  const [status, setStatus] = useState("Ready");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dispatchGuard = useRef(false);

  function open() { setReason(""); setReview(null); setError(null); setStage("edit"); }
  function close() { if (!pending) { setStage("closed"); setReview(null); setError(null); } }
  function requestReview() {
    if (!canSubmitCorrectionReason(reason)) { setError("Enter a correction reason using 5–500 characters before continuing."); return; }
    setReview(buildScoreCorrectionReview(projection, target, reason)); setError(null); setStage("confirm");
  }
  function confirm() {
    if (dispatchGuard.current) return;
    if (new URLSearchParams(window.location.search).get("invalidated") === "1") {
      setStatus("INVALID_EXPECTED_SEQ: Match or correction target changed");
      setStage("closed");
      return;
    }
    if (dispatchCount > 0) { setStatus("DUPLICATE_COMMAND: This event has already been corrected"); setStage("closed"); return; }
    dispatchGuard.current = true; setPending(true);
    window.setTimeout(() => { setDispatchCount(1); setPending(false); setStage("closed"); setStatus("Correction appended at seq 45"); dispatchGuard.current = false; }, 250);
  }

  return <main style={{ margin: "0 auto", maxWidth: 1100, padding: 24 }}>
    <h1>Score correction safety fixture</h1>
    <p>Match: Bangkok Tigers 72 - 68 Phuket Sharks · Period 4</p>
    <button ref={triggerRef} type="button" onClick={open}>Correct HOME +2 event #41</button>
    <output data-testid="status" role="status">{status}</output>
    <output data-testid="dispatch-count">{dispatchCount}</output>
    <ScoreCorrectionWorkspace error={error} onCancel={close} onConfirm={confirm} onFocusReturn={() => triggerRef.current?.focus()} onReasonChange={(value) => { setReason(value); setError(null); }} onReview={requestReview} pending={pending} reason={reason} review={review} selectedSummary={target.summary} stage={stage} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
