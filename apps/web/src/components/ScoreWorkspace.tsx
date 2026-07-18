import type { ScoreControlPoint, ScoreControlTeamSide } from "../lib/scoreControl";

export type ScoreWorkspacePanel = {
  buttons: Array<{
    label: string;
    pendingKey: string;
    points: ScoreControlPoint;
  }>;
  fouls: number;
  label: string;
  playerOptions: Array<{ label: string; playerId: string }>;
  score: number;
  selectedPlayerId: string;
  teamName: string;
  teamSide: ScoreControlTeamSide;
};

export type ScoreWorkspaceProps = {
  commandPending: boolean;
  connectionLabel: string;
  controlsEnabled: boolean;
  correctionEntry?: {
    href: string;
    onNavigate: () => void;
  } | null;
  currentSeq: number;
  matchStatus: string;
  onPlayerChange: (teamSide: ScoreControlTeamSide, playerId: string) => void;
  onScore: (teamSide: ScoreControlTeamSide, points: ScoreControlPoint) => void;
  panels: ScoreWorkspacePanel[];
  pendingKey: string | null;
  periodLabel: string;
  queueStatus?: {
    detail: string;
    label: string;
    onDiscard: () => void;
    onResume: () => void;
    onRetry: () => void;
    paused: boolean;
    queuedCount: number;
    retryAvailable: boolean;
  } | null;
};

export function ScoreWorkspace({
  commandPending,
  connectionLabel,
  controlsEnabled,
  correctionEntry,
  currentSeq,
  matchStatus,
  onPlayerChange,
  onScore,
  panels,
  pendingKey,
  periodLabel,
  queueStatus
}: ScoreWorkspaceProps) {
  return (
    <section className="score-workspace" aria-label="Score workspace">
      <header className="score-workspace__heading">
        <div>
          <span className="score-workspace__eyebrow">Supported scoring surface</span>
          <h2>Score Workspace</h2>
        </div>
        <p>Record one, two, or three points for the intended team. Player attribution remains optional.</p>
      </header>

      <div className="score-workspace__domains">
        {panels.map((panel) => {
          const headingId = `score-${panel.teamSide.toLowerCase()}-heading`;
          return (
            <section
              className={`score-workspace__domain score-workspace__domain--${panel.teamSide.toLowerCase()}`}
              data-team-side={panel.teamSide}
              key={panel.teamSide}
              aria-labelledby={headingId}
            >
              <header className="score-workspace__team-header">
                <div>
                  <span className="score-workspace__team-side">{panel.label} team</span>
                  <h3 id={headingId}>{panel.teamName}</h3>
                </div>
                <span className="score-workspace__team-marker" aria-hidden="true">{panel.teamSide === "HOME" ? "H" : "A"}</span>
              </header>

              <div className="score-workspace__score-block">
                <span>Current score</span>
                <output aria-label={`${panel.label} score ${panel.score}`}>{panel.score}</output>
                <small>Team fouls {panel.fouls}</small>
              </div>

              <label className="score-workspace__player-select">
                Optional scoring player
                <select
                  value={panel.selectedPlayerId}
                  onChange={(event) => onPlayerChange(panel.teamSide, event.target.value)}
                >
                  <option value="">No player attribution</option>
                  {panel.playerOptions.map((player) => (
                    <option key={player.playerId} value={player.playerId}>{player.label}</option>
                  ))}
                </select>
              </label>

              <div className="score-workspace__score-actions" aria-label={`${panel.label} scoring controls`}>
                {panel.buttons.map((button) => (
                  <button
                    aria-label={`${panel.label} add ${button.points} point${button.points === 1 ? "" : "s"}`}
                    disabled={!controlsEnabled || commandPending}
                    key={button.pendingKey}
                    type="button"
                    onClick={() => onScore(panel.teamSide, button.points)}
                  >
                    {pendingKey === button.pendingKey ? "Saving..." : button.label}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="score-workspace__operations">
        {queueStatus ? (
          <section
            aria-atomic="true"
            aria-live="polite"
            className={`score-workspace__queue-status${queueStatus.paused ? " score-workspace__queue-status--paused" : ""}`}
            role="status"
          >
            <div>
              <span className="score-workspace__eyebrow">Rapid scoring queue</span>
              <strong>{queueStatus.label}</strong>
              <small>{queueStatus.detail}</small>
            </div>
            <span className="score-workspace__queue-count">Queued {queueStatus.queuedCount}</span>
            {queueStatus.paused ? (
              <div className="score-workspace__queue-actions" aria-label="Paused score queue actions">
                {queueStatus.retryAvailable ? <button type="button" onClick={queueStatus.onRetry}>Retry uncertain action</button> : null}
                <button type="button" onClick={queueStatus.onResume}>Resume queued actions</button>
                <button type="button" onClick={queueStatus.onDiscard}>Discard queued actions</button>
              </div>
            ) : null}
          </section>
        ) : null}
        <dl className="score-workspace__status" aria-label="Score operation status">
          <div><dt>Match status</dt><dd>{matchStatus}</dd></div>
          <div><dt>Period</dt><dd>{periodLabel}</dd></div>
          <div><dt>Current sequence</dt><dd>{currentSeq}</dd></div>
          <div><dt>Synchronization</dt><dd>{connectionLabel}</dd></div>
        </dl>
        {correctionEntry ? (
          <aside className="score-workspace__correction" aria-label="Score correction entry">
            <div>
              <span className="score-workspace__eyebrow">Separate audited workflow</span>
              <h3>Review a scoring correction</h3>
              <p>Corrections target a prior event. They are not negative scoring controls.</p>
            </div>
            <a
              href={correctionEntry.href}
              onClick={(event) => {
                event.preventDefault();
                correctionEntry.onNavigate();
              }}
            >
              Open Corrections
            </a>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
