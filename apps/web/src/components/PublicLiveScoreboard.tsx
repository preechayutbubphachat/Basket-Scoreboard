import type { CSSProperties } from "react";
import type { PublicScoreboardDisplayModel } from "../lib/publicScoreboardDisplay";
import { PublicBrandAsset } from "./PublicBrandAsset";

export function PublicLiveScoreboard({ display }: { display: PublicScoreboardDisplayModel }) {
  const hasMatchMetadata = Boolean(display.matchMetadata.round || display.matchMetadata.court || display.matchMetadata.venue);

  return <>
    <header className={`arena-header${hasMatchMetadata ? " has-match-metadata" : ""}`}>
      <div className="arena-brand-lockup">
        {display.tournament.showLogo ? <PublicBrandAsset className="arena-tournament-logo" src={display.tournament.logoUrl} alt={`${display.tournament.displayName ?? "Tournament"} logo`} fallbackLabel="T" /> : null}
        <div className="arena-title-lockup"><span>Live arena scoreboard</span><h1 className="arena-tournament-title">{display.tournament.displayName ?? "Public Scoreboard"}</h1></div>
      </div>
      <div className="arena-header-meta" aria-label="Match display metadata"><span>Period <strong>{display.periodLabel}</strong></span></div>
      <div className={display.statusClassName}>{display.statusLabel}</div>
      <ArenaMatchMetadata metadata={display.matchMetadata} />
    </header>
    <div className="arena-scoreboard-grid">
      <Team side="home" team={display.home} />
      <section className="central-clock-panel" aria-label="Game timing">
        <div className="arena-period-chip"><span>Period</span><strong>{display.periodLabel}</strong></div>
        <div className="public-display-game-clock"><span>Game Clock</span><strong>{display.gameClock.label}</strong><small>{display.gameClock.stateLabel}</small></div>
        <div className={display.shotClock.className}><span>Shot Clock</span><strong>{display.shotClock.label}</strong><small>{display.shotClock.stateLabel}</small></div>
      </section>
      <Team side="away" team={display.away} />
    </div>
    <div className="recent-event-ticker" aria-label="Recent event ticker"><span>Recent play</span><strong role="status" aria-live="polite" aria-atomic="true">{display.recentEventTicker}</strong></div>
    <dl className="compact-system-strip" aria-label="Compact system status">{display.systemStatus.map((item) => <div key={item.label}><dt aria-hidden="true">{item.icon}</dt><dd><span>{item.label}</span><strong>{item.value}</strong></dd></div>)}</dl>
    {display.finalLabel ? <div className="public-display-final" role="status">{display.finalLabel}</div> : null}
  </>;
}

function ArenaMatchMetadata({ metadata }: { metadata: PublicScoreboardDisplayModel["matchMetadata"] }) {
  const items = [
    metadata.round ? { label: "Round", value: metadata.round } : null,
    metadata.court ? { label: "Court", value: metadata.court } : null,
    metadata.venue ? { label: "Venue", value: metadata.venue } : null
  ].filter((item): item is { label: string; value: string } => item !== null);

  if (items.length === 0) {
    return null;
  }

  return <dl className="arena-match-metadata" aria-label="Match details">
    {items.map((item) => <div key={item.label}>
      <dt>{item.label}</dt>
      <dd>{item.value}</dd>
    </div>)}
  </dl>;
}

function Team({ side, team }: { side: "home" | "away"; team: PublicScoreboardDisplayModel["home"] }) {
  const hasLogo = team.showLogo && Boolean(team.logoUrl);
  const dotCount = Math.min(Math.max(0, team.timeouts), 3);
  return <article className={`${team.panelClassName} ${side} ${hasLogo ? "has-team-logo" : "no-team-logo"}`} style={team.style as CSSProperties}>
    <div className="public-display-team-badge"><span>{team.label}</span></div>
    <div className="public-display-team-watermark">{hasLogo ? <PublicBrandAsset className="public-display-team-watermark-logo" src={team.logoUrl} alt={`${team.teamName} logo`} fallbackLabel={team.monogram} /> : <span aria-hidden="true">{team.monogram}</span>}</div>
    <h2>{team.teamName}</h2>
    <strong key={`${side}-${team.score}`} className={team.scoreClassName}>{team.score}</strong>
    <dl className="public-display-team-metrics" aria-label={`${team.label} public game metrics`}>
      <div><dt>Timeouts</dt><dd className="arena-timeout-value">{team.timeouts <= 3 ? <span className="arena-timeout-dots" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <i className={index < dotCount ? "is-filled" : ""} key={index} />)}</span> : null}<b>{team.timeouts}</b></dd></div>
      <div><dt>Team Fouls</dt><dd>{team.fouls}</dd></div>
      <div><dt>Bonus</dt><dd className="arena-neutral-value">--</dd></div>
    </dl>
  </article>;
}
