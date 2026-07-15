import { useId, type HTMLAttributes, type ReactNode } from "react";

type UiPanelVariant = "default" | "elevated" | "muted" | "warning" | "danger";
type UiPanelElement = "section" | "article" | "aside" | "div";

export type UiPanelProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  as?: UiPanelElement;
  heading?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  variant?: UiPanelVariant;
};

export function UiPanel({
  as: Element = "section",
  children,
  className,
  heading,
  headingLevel = 2,
  variant = "default",
  ...props
}: UiPanelProps) {
  const generatedId = useId();
  const headingId = heading === undefined ? null : `${generatedId}-heading`;
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const existingLabelledBy = props["aria-labelledby"];
  const labelledBy = [existingLabelledBy, headingId].filter(Boolean).join(" ") || undefined;

  return (
    <Element
      {...props}
      {...(labelledBy ? { "aria-labelledby": labelledBy } : {})}
      className={["ui-panel", `ui-panel--${variant}`, className].filter(Boolean).join(" ")}
    >
      {headingId ? <Heading className="ui-panel__heading" id={headingId}>{heading}</Heading> : null}
      {children}
    </Element>
  );
}
