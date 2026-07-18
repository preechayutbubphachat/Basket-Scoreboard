import type { ChangeEventHandler } from "react";

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
    onReasonChange: ChangeEventHandler<HTMLInputElement>;
    onShotReset14: () => void;
    onShotReset24: () => void;
    onShotSecondsChange: ChangeEventHandler<HTMLInputElement>;
    onShotSet: () => void;
    pending: boolean;
    shotEnabled: boolean;
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

export function ClockWorkspace({ controls, gameClock, shotClock, status, values }: ClockWorkspaceProps) {
  const gameDisabled = !controls.gameEnabled || controls.pending;
  const shotDisabled = !controls.shotEnabled || controls.pending;

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
          <p>Manual set behavior remains unchanged in this slice. Confirmation and required-reason enforcement are reserved for the approved follow-up slices.</p>
        </header>
        <label className="clock-workspace__reason">Reason<input value={values.reason} onChange={controls.onReasonChange} /></label>
        <div className="clock-workspace__adjustment-grid">
          <fieldset>
            <legend>Game Clock</legend>
            <label>Minutes<input type="number" min="0" max="10" value={values.gameMinutes} onChange={controls.onGameMinutesChange} /></label>
            <label>Seconds<input type="number" min="0" max="59" value={values.gameSeconds} onChange={controls.onGameSecondsChange} /></label>
            <button type="button" disabled={gameDisabled} onClick={controls.onGameSet}>Set Game Clock</button>
          </fieldset>
          <fieldset>
            <legend>Shot Clock</legend>
            <label>Seconds<input type="number" min="0" max="24" value={values.shotSeconds} onChange={controls.onShotSecondsChange} /></label>
            <button type="button" disabled={shotDisabled} onClick={controls.onShotSet}>Set Shot Clock</button>
          </fieldset>
        </div>
      </section>
    </section>
  );
}
