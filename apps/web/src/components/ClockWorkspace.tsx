import { useEffect, useRef, type ChangeEventHandler } from "react";

export type ClockWorkspaceProps = {
  gameClock: {
    label: string;
    running: boolean;
  };
  shotClock: {
    label: string;
    running: boolean;
  };
  status: {
    connection: string;
    match: string;
    period: number;
  };
  controls: {
    gameEnabled: boolean;
    onGameMinutesChange: ChangeEventHandler<HTMLInputElement>;
    onGameSecondsChange: ChangeEventHandler<HTMLInputElement>;
    onGameSet: () => void;
    onGameStart: () => void;
    onGameStop: () => void;
    onReasonChange: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
    onShotReset14: () => void;
    onShotReset24: () => void;
    onShotSecondsChange: ChangeEventHandler<HTMLInputElement>;
    onShotSet: () => void;
    pending: boolean;
    shotEnabled: boolean;
  };
  gameSetFlow: {
    error: string | null;
    onCancel: () => void;
    onOpen: () => void;
    onRequestConfirmation: () => void;
    stage: "closed" | "edit" | "confirm";
  };
  shotSetFlow: {
    error: string | null;
    onCancel: () => void;
    onOpen: () => void;
    onRequestConfirmation: () => void;
    stage: "closed" | "edit" | "confirm";
  };
  values: {
    gameMinutes: number;
    gameSeconds: number;
    reason: string;
    shotSeconds: number;
  };
};

function ClockState({ running }: { running: boolean }) {
  return <span className={`clock-workspace__state clock-workspace__state--${running ? "running" : "stopped"}`}>{running ? "Running" : "Stopped"}</span>;
}

export function ClockWorkspace({ controls, gameClock, gameSetFlow, shotClock, shotSetFlow, status, values }: ClockWorkspaceProps) {
  const gameDisabled = !controls.gameEnabled || controls.pending;
  const shotDisabled = !controls.shotEnabled || controls.pending;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const gameSetTriggerRef = useRef<HTMLButtonElement>(null);
  const shotDialogRef = useRef<HTMLDialogElement>(null);
  const shotSetTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (gameSetFlow.stage !== "closed" && !dialog.open) {
      dialog.showModal();
    } else if (gameSetFlow.stage === "closed" && dialog.open) {
      dialog.close();
      gameSetTriggerRef.current?.focus();
    }
  }, [gameSetFlow.stage]);

  useEffect(() => {
    const dialog = shotDialogRef.current;
    if (!dialog) return;
    if (shotSetFlow.stage !== "closed" && !dialog.open) dialog.showModal();
    else if (shotSetFlow.stage === "closed" && dialog.open) {
      dialog.close();
      shotSetTriggerRef.current?.focus();
    }
  }, [shotSetFlow.stage]);

  function cancelGameSet() {
    gameSetFlow.onCancel();
  }

  return (
    <section className="clock-workspace" aria-label="Clock workspace">
      <dl className="clock-workspace__status-rail" aria-label="Authoritative clock status">
        <div><dt>Match status</dt><dd>{status.match}</dd></div>
        <div><dt>Period</dt><dd>{status.period}</dd></div>
        <div><dt>Synchronization</dt><dd>{status.connection}</dd></div>
      </dl>

      <div className="clock-workspace__domains">
        <section className="clock-workspace__domain clock-workspace__domain--game" aria-labelledby="game-clock-heading">
          <header className="clock-workspace__domain-header">
            <div>
              <span className="clock-workspace__eyebrow">Authoritative match time</span>
              <h2 id="game-clock-heading">Game Clock</h2>
            </div>
            <ClockState running={gameClock.running} />
          </header>
          <output className="clock-workspace__timer clock-workspace__timer--game" aria-label={`Game clock ${gameClock.label}, ${gameClock.running ? "running" : "stopped"}`}>{gameClock.label}</output>
          <div className="clock-workspace__primary-actions" aria-label="Game clock controls">
            <button type="button" disabled={gameDisabled} onClick={controls.onGameStart}>Start Game Clock</button>
            <button type="button" className="clock-workspace__secondary-action" disabled={gameDisabled} onClick={controls.onGameStop}>Stop Game Clock</button>
          </div>
        </section>

        <section className="clock-workspace__domain clock-workspace__domain--shot" aria-labelledby="shot-clock-heading">
          <header className="clock-workspace__domain-header">
            <div>
              <span className="clock-workspace__eyebrow">Operator-selected reset</span>
              <h2 id="shot-clock-heading">Shot Clock</h2>
            </div>
            <ClockState running={shotClock.running} />
          </header>
          <output className="clock-workspace__timer clock-workspace__timer--shot" aria-label={`Shot clock ${shotClock.label}, ${shotClock.running ? "running" : "stopped"}`}>{shotClock.label}</output>
          <div className="clock-workspace__reset-actions" aria-label="Shot clock reset controls">
            <button type="button" disabled={shotDisabled} onClick={controls.onShotReset24}>Reset Shot 24</button>
            <button type="button" disabled={shotDisabled} onClick={controls.onShotReset14}>Reset Shot 14</button>
          </div>
          <p className="clock-workspace__note">Select 14 or 24 explicitly. This interface does not determine a contextual reset.</p>
        </section>
      </div>

      <section className="clock-workspace__adjustments" aria-labelledby="clock-adjustments-heading">
        <header>
          <span className="clock-workspace__eyebrow">Manual adjustment</span>
          <h2 id="clock-adjustments-heading">Set Clock Values</h2>
          <p>Game-clock corrections require a reason and explicit confirmation. Shot-clock behavior remains separate.</p>
        </header>
        <div className="clock-workspace__adjustment-grid">
          <fieldset>
            <legend>Game Clock</legend>
            <p>Open the guarded correction flow to adjust authoritative match time.</p>
            <button ref={gameSetTriggerRef} type="button" disabled={gameDisabled} onClick={gameSetFlow.onOpen}>Set / Adjust Game Clock</button>
          </fieldset>
          <fieldset>
            <legend>Shot Clock</legend>
            <p>Open the guarded correction flow to adjust authoritative shot time.</p>
            <button ref={shotSetTriggerRef} type="button" disabled={shotDisabled} onClick={shotSetFlow.onOpen}>Set / Adjust Shot Clock</button>
          </fieldset>
        </div>
      </section>

      <dialog
        aria-labelledby="game-clock-correction-title"
        className="clock-workspace__dialog"
        onCancel={(event) => {
          event.preventDefault();
          cancelGameSet();
        }}
        ref={dialogRef}
      >
        {gameSetFlow.stage === "edit" ? (
          <form
            className="clock-workspace__dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              gameSetFlow.onRequestConfirmation();
            }}
          >
            <header>
              <span className="clock-workspace__eyebrow">Correction workflow</span>
              <h2 id="game-clock-correction-title">Set / Adjust Game Clock</h2>
              <p>Enter the authoritative target and document why match time is being corrected.</p>
            </header>
            <div className="clock-workspace__dialog-time">
              <label>Minutes<input autoFocus inputMode="numeric" type="number" min="0" max="10" value={values.gameMinutes} onChange={controls.onGameMinutesChange} /></label>
              <label>Seconds<input inputMode="numeric" type="number" min="0" max="59" value={values.gameSeconds} onChange={controls.onGameSecondsChange} /></label>
            </div>
            <label>Correction reason<textarea maxLength={500} required value={values.reason} onChange={controls.onReasonChange} /></label>
            <p className="clock-workspace__field-help">Required. Maximum 500 characters.</p>
            {gameSetFlow.error ? <p className="clock-workspace__form-error" role="alert">{gameSetFlow.error}</p> : null}
            <div className="clock-workspace__dialog-actions">
              <button type="button" className="clock-workspace__secondary-action" onClick={cancelGameSet}>Cancel</button>
              <button type="submit">Review correction</button>
            </div>
          </form>
        ) : gameSetFlow.stage === "confirm" ? (
          <section className="clock-workspace__dialog-form">
            <header>
              <span className="clock-workspace__eyebrow">Explicit confirmation</span>
              <h2 id="game-clock-correction-title">Confirm Game Clock Correction</h2>
              <p>Verify this match context before changing authoritative time.</p>
            </header>
            <dl className="clock-workspace__confirmation-summary">
              <div><dt>Target clock</dt><dd>{values.gameMinutes}:{String(values.gameSeconds).padStart(2, "0")}</dd></div>
              <div><dt>Reason</dt><dd>{values.reason.trim()}</dd></div>
              <div><dt>Match context</dt><dd>{status.match}, period {status.period}</dd></div>
            </dl>
            <div className="clock-workspace__dialog-actions">
              <button type="button" className="clock-workspace__secondary-action" disabled={controls.pending} onClick={cancelGameSet}>Cancel correction</button>
              <button type="button" className="clock-workspace__confirm-action" disabled={controls.pending} onClick={controls.onGameSet}>
                {controls.pending ? "Applying correction..." : "Confirm clock correction"}
              </button>
            </div>
          </section>
        ) : null}
      </dialog>

      <dialog
        aria-labelledby="shot-clock-correction-title"
        className="clock-workspace__dialog"
        onCancel={(event) => { event.preventDefault(); shotSetFlow.onCancel(); }}
        ref={shotDialogRef}
      >
        {shotSetFlow.stage === "edit" ? (
          <form className="clock-workspace__dialog-form" onSubmit={(event) => { event.preventDefault(); shotSetFlow.onRequestConfirmation(); }}>
            <header>
              <span className="clock-workspace__eyebrow">Correction workflow</span>
              <h2 id="shot-clock-correction-title">Set / Adjust Shot Clock</h2>
              <p>Enter the authoritative target and document why shot time is being corrected.</p>
            </header>
            <label>Seconds<input autoFocus inputMode="numeric" type="number" min="0" max="24" value={values.shotSeconds} onChange={controls.onShotSecondsChange} /></label>
            <label>Correction reason<textarea maxLength={500} required value={values.reason} onChange={controls.onReasonChange} /></label>
            <p className="clock-workspace__field-help">Required. Maximum 500 characters.</p>
            {shotSetFlow.error ? <p className="clock-workspace__form-error" role="alert">{shotSetFlow.error}</p> : null}
            <div className="clock-workspace__dialog-actions">
              <button type="button" className="clock-workspace__secondary-action" onClick={shotSetFlow.onCancel}>Cancel</button>
              <button type="submit">Review correction</button>
            </div>
          </form>
        ) : shotSetFlow.stage === "confirm" ? (
          <section className="clock-workspace__dialog-form">
            <header>
              <span className="clock-workspace__eyebrow">Explicit confirmation</span>
              <h2 id="shot-clock-correction-title">Confirm Shot Clock Correction</h2>
              <p>Verify this match context before changing authoritative shot time.</p>
            </header>
            <dl className="clock-workspace__confirmation-summary">
              <div><dt>Target clock</dt><dd>{values.shotSeconds} seconds</dd></div>
              <div><dt>Reason</dt><dd>{values.reason.trim()}</dd></div>
              <div><dt>Match context</dt><dd>{status.match}, period {status.period}</dd></div>
            </dl>
            <div className="clock-workspace__dialog-actions">
              <button type="button" className="clock-workspace__secondary-action" disabled={controls.pending} onClick={shotSetFlow.onCancel}>Cancel correction</button>
              <button type="button" className="clock-workspace__confirm-action" disabled={controls.pending} onClick={controls.onShotSet}>
                {controls.pending ? "Applying correction..." : "Confirm shot clock correction"}
              </button>
            </div>
          </section>
        ) : null}
      </dialog>
    </section>
  );
}
