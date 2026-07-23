import type { ButtonHTMLAttributes, ReactNode } from "react";

type UiButtonVariant = "primary" | "secondary" | "success" | "warning" | "danger" | "ghost";
type UiButtonSize = "compact" | "default" | "large";

export type UiButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  busyLabel?: ReactNode;
  size?: UiButtonSize;
  variant?: UiButtonVariant;
};

export function UiButton({
  busy = false,
  busyLabel = "Working",
  children,
  className,
  disabled = false,
  size = "default",
  type = "button",
  variant = "primary",
  ...props
}: UiButtonProps) {
  return (
    <button
      {...props}
      aria-busy={busy}
      className={["ui-button", `ui-button--${variant}`, `ui-button--${size}`, className].filter(Boolean).join(" ")}
      disabled={disabled || busy}
      type={type}
    >
      {busy ? <span aria-hidden="true" className="ui-button__busy-mark" /> : null}
      <span className="ui-button__label">{busy ? busyLabel : children}</span>
    </button>
  );
}
