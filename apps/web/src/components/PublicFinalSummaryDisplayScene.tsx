import type { PublicDisplaySceneModel } from "../lib/publicDisplayScene";

type FinalSummaryModel = Extract<PublicDisplaySceneModel, {
  status: "READY";
  sceneType: "FINAL_SUMMARY";
}>;

export function PublicFinalSummaryDisplayScene({ model }: { model: FinalSummaryModel }) {
  const summary = model.summary;
  if (summary.status === "UNAVAILABLE") {
    return (
      <div className="public-display-final-unavailable" role="status" aria-label="Final result not available">
        <div className="public-display-final-unavailable-mark" aria-hidden="true">F</div>
        <p className="eyebrow">{model.displayName}</p>
        <h1>Final Result</h1>
        <strong>Result not available</strong>
        <p>{summary.message}</p>
        <small>Read-only public scene</small>
      </div>
    );
  }

  const location = [summary.venueLabel, summary.courtLabel].filter(Boolean).join(" / ");
  const context = [summary.tournamentLabel, summary.roundLabel].filter(Boolean).join(" / ");
  const hasWinner = summary.winnerSide !== null;
  const resultLabel = hasWinner && summary.winnerDisplayName ? `${summary.winnerDisplayName} wins` : hasWinner ? "Final result" : "Tied game";
  const resultClassName = summary.winnerSide === "HOME"
    ? "public-display-final-card winner-home"
    : summary.winnerSide === "AWAY"
      ? "public-display-final-card winner-away"
      : "public-display-final-card final-tie";

  return (
    <div className={resultClassName}>
      <header className="public-display-final-header">
        <div>
          <p className="eyebrow">{context || "Final Summary"}</p>
          <h1>{model.displayName}</h1>
        </div>
        <span className="public-display-final-badge">Final</span>
      </header>
      <div className="public-display-final-scoreboard" aria-label="Final score">
        <section className={`public-display-final-team home-final-team${summary.winnerSide === "HOME" ? " final-winner" : ""}`}>
          <span>Home</span>
          <h2>{summary.homeTeamName}</h2>
          <strong className="public-display-final-score">{summary.homeScore}</strong>
        </section>
        <div className="public-display-final-result">
          <span className="public-display-final-result-label">Result</span>
          <b>{resultLabel}</b>
          {location || summary.completedAt ? (
            <div className="public-display-final-meta">
              {location ? <span>{location}</span> : null}
              {summary.completedAt ? <time dateTime={summary.completedAt}>{formatCompletedAt(summary.completedAt)}</time> : null}
            </div>
          ) : null}
        </div>
        <section className={`public-display-final-team away-final-team${summary.winnerSide === "AWAY" ? " final-winner" : ""}`}>
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
