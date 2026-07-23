import type { HTMLAttributes, ReactNode } from "react";

export type UiCommandState = "idle" | "pending" | "accepted" | "rejected" | "sync-required" | "duplicate";

const commandLabels: Record<UiCommandState, string> = {
  idle: "Ready",
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  "sync-required": "Sync required",
  duplicate: "Duplicate accepted"
};

export type UiCommandStatusProps = HTMLAttributes<HTMLSpanElement> & {
  detail?: ReactNode;
  icon?: ReactNode;
  label?: ReactNode;
  state: UiCommandState;
};

export function UiCommandStatus({ className, detail, icon, label, state, ...props }: UiCommandStatusProps) {
  return (
    <span
      {...props}
      aria-busy={state === "pending"}
      className={["ui-command-status", `ui-command-status--${state}`, className].filter(Boolean).join(" ")}
    >
      <span aria-hidden="true" className="ui-command-status__mark">{icon}</span>
      <span className="ui-command-status__content">
        <strong>{label ?? commandLabels[state]}</strong>
        {detail === undefined ? null : <span>{detail}</span>}
      </span>
    </span>
  );
}
