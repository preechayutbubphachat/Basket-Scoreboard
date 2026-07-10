import type { PublicDisplaySceneModel } from "../lib/publicDisplayScene";

type FinalSummaryModel = Extract<PublicDisplaySceneModel, {
  status: "READY";
  sceneType: "FINAL_SUMMARY";
}>;

export function PublicFinalSummaryDisplayScene({ model }: { model: FinalSummaryModel }) {
  const summary = model.summary;
  if (summary.status === "UNAVAILABLE") {
    return (
      <div className="public-display-scene-card public-display-standby scene-final-summary">
        <p className="eyebrow">Final Summary</p>
        <h1>{model.displayName}</h1>
        <div className="public-display-scene-status"><span>Unavailable</span></div>
        <h2>Final result unavailable</h2>
        <p>{summary.message}</p>
        <small>Read-only public scene</small>
      </div>
    );
  }

  const location = [summary.venueLabel, summary.courtLabel].filter(Boolean).join(" / ");
  const context = [summary.tournamentLabel, summary.roundLabel].filter(Boolean).join(" / ");
  const resultLabel = summary.winnerDisplayName ? `${summary.winnerDisplayName} wins` : "Final tie";

  return (
    <div className="public-display-final-card">
      <header className="public-display-final-header">
        <div>
          <p className="eyebrow">{context || "Final Summary"}</p>
          <h1>{model.displayName}</h1>
        </div>
        <span className="public-display-final-badge">Final</span>
      </header>
      <div className="public-display-final-scoreboard" aria-label="Final score">
        <section className="public-display-final-team home-final-team">
          <span>Home</span>
          <h2>{summary.homeTeamName}</h2>
          <strong className="public-display-final-score">{summary.homeScore}</strong>
        </section>
        <div className="public-display-final-result">
          <b>{resultLabel}</b>
          {location ? <span>{location}</span> : null}
          {summary.completedAt ? <time dateTime={summary.completedAt}>{formatCompletedAt(summary.completedAt)}</time> : null}
        </div>
        <section className="public-display-final-team away-final-team">
          <span>Away</span>
          <h2>{summary.awayTeamName}</h2>
          <strong className="public-display-final-score">{summary.awayScore}</strong>
        </section>
      </div>
      <small className="public-display-final-readonly">Read-only public scene</small>
    </div>
  );
}

function formatCompletedAt(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
