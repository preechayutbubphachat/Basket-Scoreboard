import type { HTMLAttributes, ReactNode } from "react";

export type UiConnectionState = "connected" | "reconnecting" | "offline" | "sync-required" | "read-only";

const connectionLabels: Record<UiConnectionState, string> = {
  connected: "Connected",
  reconnecting: "Reconnecting",
  offline: "Offline",
  "sync-required": "Sync required",
  "read-only": "Read only"
};

export type UiConnectionStatusProps = Omit<HTMLAttributes<HTMLSpanElement>, "aria-label"> & {
  announce?: boolean;
  detail?: ReactNode;
  icon?: ReactNode;
  label?: ReactNode;
  state: UiConnectionState;
};

export function UiConnectionStatus({
  announce = false,
  className,
  detail,
  icon,
  label,
  state,
  ...props
}: UiConnectionStatusProps) {
  return (
    <span
      {...props}
      {...(announce ? { "aria-atomic": true, "aria-live": "polite", role: "status" } : {})}
      className={["ui-connection-status", `ui-connection-status--${state}`, className].filter(Boolean).join(" ")}
    >
      <span aria-hidden="true" className="ui-connection-status__mark">{icon}</span>
      <span className="ui-connection-status__content">
        <strong>{label ?? connectionLabels[state]}</strong>
        {detail === undefined ? null : <span>{detail}</span>}
      </span>
    </span>
  );
}
