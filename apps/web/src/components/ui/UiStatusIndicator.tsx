import type { HTMLAttributes, ReactNode } from "react";

type UiStatusIndicatorVariant = "neutral" | "info" | "success" | "warning" | "danger" | "offline";

export type UiStatusIndicatorProps = HTMLAttributes<HTMLSpanElement> & {
  icon?: ReactNode;
  label: ReactNode;
  variant?: UiStatusIndicatorVariant;
};

export function UiStatusIndicator({ className, icon, label, variant = "neutral", ...props }: UiStatusIndicatorProps) {
  return (
    <span {...props} className={["ui-status-indicator", `ui-status-indicator--${variant}`, className].filter(Boolean).join(" ")}>
      {icon === undefined
        ? <span aria-hidden="true" className="ui-status-indicator__dot" />
        : <span aria-hidden="true" className="ui-status-indicator__icon">{icon}</span>}
      <span className="ui-status-indicator__label">{label}</span>
    </span>
  );
}
