import { useId, type ReactNode } from "react";
import {
  UiBadge,
  UiCommandSafetyPanel,
  UiCommandStatus,
  UiConnectionStatus,
  type UiCommandState,
  type UiConnectionState
} from "./ui";

export type LiveMatchNavigationItem = {
  current?: boolean;
  href: string;
  id: string;
  label: ReactNode;
};

export type LiveMatchShellProps = {
  actions?: ReactNode;
  children: ReactNode;
  commandStatus?: {
    detail?: string;
    label?: string;
    state: UiCommandState;
  };
  connection: {
    label?: string;
    lastSyncedAt?: string | null;
    state: UiConnectionState;
  };
  match: {
    awayTeamName: string;
    courtLabel?: string | null;
    homeTeamName: string;
    matchId: string;
    periodLabel?: string | null;
    readOnly?: boolean;
    status: string;
    tournamentLabel?: string | null;
  };
  navigation: LiveMatchNavigationItem[];
  safetyGuidance?: ReactNode;
  secondaryRail?: ReactNode;
};

function presentationState(connectionState: UiConnectionState, readOnly: boolean) {
  if (readOnly || connectionState === "read-only") return "read-only";
  if (connectionState === "offline") return "offline";
  if (connectionState === "reconnecting" || connectionState === "sync-required") return "degraded";
  return "ready";
}

export function LiveMatchShell({
  actions,
  children,
  commandStatus,
  connection,
  match,
  navigation,
  safetyGuidance,
  secondaryRail
}: LiveMatchShellProps) {
  const headingId = useId();
  const readOnly = match.readOnly === true || connection.state === "read-only";
  const state = presentationState(connection.state, readOnly);
  const workspaceClassName = [
    "live-match-shell__workspace",
    secondaryRail ? "live-match-shell__workspace--with-secondary" : null
  ].filter(Boolean).join(" ");
  const connectionDetail = connection.lastSyncedAt ? (
    <>Last synchronized <time dateTime={connection.lastSyncedAt}>{connection.lastSyncedAt}</time></>
  ) : undefined;

  return (
    <section
      aria-labelledby={headingId}
      className={`live-match-shell live-match-shell--${state}`}
    >
      <header className="live-match-shell__context">
        <div className="live-match-shell__identity">
          <span className="live-match-shell__eyebrow">Live match</span>
          <h2 id={headingId}>
            <span className="live-match-shell__team live-match-shell__team--home">{match.homeTeamName}</span>
            <span aria-hidden="true" className="live-match-shell__versus">vs</span>
            <span className="live-match-shell__team live-match-shell__team--away">{match.awayTeamName}</span>
          </h2>
        </div>
        <div className="live-match-shell__context-actions">
          <UiBadge variant={readOnly ? "offline" : "info"}>{match.status}</UiBadge>
          {readOnly ? <UiBadge variant="warning">Read only</UiBadge> : null}
          {actions}
        </div>
        <dl className="live-match-shell__metadata">
          <div className="live-match-shell__metadata-item live-match-shell__metadata-item--match">
            <dt>Match</dt>
            <dd>{match.matchId}</dd>
          </div>
          {match.tournamentLabel ? (
            <div className="live-match-shell__metadata-item live-match-shell__metadata-item--tournament">
              <dt>Tournament</dt>
              <dd>{match.tournamentLabel}</dd>
            </div>
          ) : null}
          {match.courtLabel ? (
            <div className="live-match-shell__metadata-item live-match-shell__metadata-item--court">
              <dt>Court</dt>
              <dd>{match.courtLabel}</dd>
            </div>
          ) : null}
          {match.periodLabel ? (
            <div className="live-match-shell__metadata-item live-match-shell__metadata-item--period">
              <dt>Period</dt>
              <dd>{match.periodLabel}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <nav className="live-match-shell__navigation" aria-label="Live match controls">
        <ul>
          {navigation.map((item) => (
            <li key={item.id}>
              <a aria-current={item.current ? "page" : undefined} href={item.href}>{item.label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="live-match-shell__status-bar">
        <UiConnectionStatus
          announce={connection.state !== "connected"}
          detail={connectionDetail}
          label={connection.label}
          state={connection.state}
        />
        {commandStatus ? (
          <UiCommandStatus
            detail={commandStatus.detail}
            label={commandStatus.label}
            state={commandStatus.state}
          />
        ) : null}
      </div>

      {safetyGuidance || readOnly ? (
        <UiCommandSafetyPanel
          heading="Live match safety"
          readOnlyMessage={readOnly ? "This match is read only. Feature controls must not submit commands." : undefined}
          syncMessage={safetyGuidance}
        />
      ) : null}

      <div className={workspaceClassName}>
        <div className="live-match-shell__primary">{children}</div>
        {secondaryRail ? (
          <aside className="live-match-shell__secondary" aria-label="Live match supporting information">
            {secondaryRail}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
