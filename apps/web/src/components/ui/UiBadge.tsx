import type { HTMLAttributes, ReactNode } from "react";

type UiBadgeVariant = "neutral" | "info" | "success" | "warning" | "danger" | "offline";

export type UiBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  icon?: ReactNode;
  variant?: UiBadgeVariant;
};

export function UiBadge({ children, className, icon, variant = "neutral", ...props }: UiBadgeProps) {
  return (
    <span {...props} className={["ui-badge", `ui-badge--${variant}`, className].filter(Boolean).join(" ")}>
      {icon === undefined ? null : <span aria-hidden="true" className="ui-badge__icon">{icon}</span>}
      <span className="ui-badge__label">{children}</span>
    </span>
  );
}
