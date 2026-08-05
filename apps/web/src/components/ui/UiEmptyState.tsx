import { useId, type HTMLAttributes, type ReactNode } from "react";

export type UiEmptyStateKind = "empty" | "loading" | "error" | "unavailable";

export type UiEmptyStateProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  action?: ReactNode;
  description?: ReactNode;
  state: UiEmptyStateKind;
  title: ReactNode;
};

export function UiEmptyState({ action, className, description, state, title, ...props }: UiEmptyStateProps) {
  const titleId = useId();

  return (
    <section
      {...props}
      aria-busy={state === "loading"}
      aria-labelledby={titleId}
      className={["ui-empty-state", `ui-empty-state--${state}`, className].filter(Boolean).join(" ")}
    >
      <span aria-hidden="true" className="ui-empty-state__mark" />
      <h2 id={titleId}>{title}</h2>
      {description === undefined ? null : <p>{description}</p>}
      {action === undefined ? null : <div className="ui-empty-state__action">{action}</div>}
    </section>
  );
}
