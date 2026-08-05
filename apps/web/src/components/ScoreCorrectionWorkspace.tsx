import { useEffect, useRef } from "react";
import type { ScoreCorrectionReview } from "../lib/correctionControl";

export type ScoreCorrectionWorkspaceProps = {
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  onFocusReturn: () => void;
  onReasonChange: (reason: string) => void;
  onReview: () => void;
  pending: boolean;
  reason: string;
  review: ScoreCorrectionReview | null;
  selectedSummary: string;
  stage: "closed" | "edit" | "confirm";
};

export function ScoreCorrectionWorkspace(props: ScoreCorrectionWorkspaceProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (props.stage !== "closed" && !dialog.open) dialog.showModal();
    else if (props.stage === "closed" && dialog.open) {
      dialog.close();
      props.onFocusReturn();
    }
  }, [props.stage]);

  return (
    <dialog
      aria-labelledby="score-correction-dialog-title"
      className="score-correction-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!props.pending) props.onCancel();
      }}
      ref={dialogRef}
    >
      {props.stage === "edit" ? (
        <form className="score-correction-dialog__content" onSubmit={(event) => { event.preventDefault(); props.onReview(); }}>
          <header>
            <span className="score-correction-dialog__eyebrow">Append-only score correction</span>
            <h2 id="score-correction-dialog-title">Prepare score correction</h2>
            <p>The original score event remains in replay and audit history.</p>
          </header>
          <dl className="score-correction-dialog__summary">
            <div><dt>Selected target</dt><dd>{props.selectedSummary}</dd></div>
          </dl>
          <label>Correction reason<textarea autoFocus maxLength={500} required value={props.reason} onChange={(event) => props.onReasonChange(event.currentTarget.value)} /></label>
          <p className="score-correction-dialog__help">Required: 5–500 characters. Whitespace is trimmed.</p>
          {props.error ? <p className="score-correction-dialog__error" role="alert">{props.error}</p> : null}
          <div className="score-correction-dialog__actions">
            <button type="button" className="secondary" onClick={props.onCancel}>Cancel</button>
            <button type="submit">Review correction</button>
          </div>
        </form>
      ) : props.stage === "confirm" && props.review ? (
        <section className="score-correction-dialog__content">
          <header>
            <span className="score-correction-dialog__eyebrow">Explicit confirmation</span>
            <h2 id="score-correction-dialog-title">Confirm score correction</h2>
            <p>Verify the exact event and projected effect. The server remains authoritative.</p>
          </header>
          <dl className="score-correction-dialog__summary">
            <div><dt>Target event</dt><dd>#{props.review.seqNo} · {props.review.eventType}</dd></div>
            <div><dt>Scoring action</dt><dd>{props.review.summary}</dd></div>
            <div><dt>Team</dt><dd>{props.review.teamLabel}</dd></div>
            <div><dt>Player</dt><dd>{props.review.playerLabel}</dd></div>
            <div><dt>Score effect</dt><dd>{props.review.effectLabel}</dd></div>
            <div><dt>Reason</dt><dd>{props.review.reason}</dd></div>
            <div><dt>Match context</dt><dd>{props.review.matchContext}</dd></div>
          </dl>
          <p className="score-correction-dialog__warning"><strong>Warning:</strong> confirmation appends one compensating event; it never deletes or rewrites the original score.</p>
          <div className="score-correction-dialog__actions">
            <button type="button" className="secondary" disabled={props.pending} onClick={props.onCancel}>Cancel correction</button>
            <button autoFocus type="button" className="danger" disabled={props.pending} onClick={props.onConfirm}>
              {props.pending ? "Confirming correction…" : "Confirm score correction"}
            </button>
          </div>
        </section>
      ) : null}
    </dialog>
  );
}
