import type { CSSProperties, ReactNode } from "react";

export type PublicDisplayShellControls = {
  normalHref: string;
  onNormal: () => void;
  onRefresh: () => void;
  fullscreenSupported: boolean;
  fullscreenActive: boolean;
  onToggleFullscreen: () => void;
};

export function PublicDisplayShell({
  className,
  frameClassName,
  frameStyle,
  frameLabel,
  controls,
  onRevealControls,
  children
}: {
  className: string;
  frameClassName: string;
  frameStyle?: CSSProperties | undefined;
  frameLabel: string;
  controls?: PublicDisplayShellControls;
  onRevealControls?: () => void;
  children: ReactNode;
}) {
  return (
    <main
      className={className}
      onClick={onRevealControls}
      onFocus={onRevealControls}
      onMouseMove={onRevealControls}
      onPointerDown={onRevealControls}
    >
      <section className={frameClassName} style={frameStyle} aria-label={frameLabel}>
        {controls ? (
          <nav className="arena-display-actions" aria-label="Public display actions">
            <a
              className="public-display-control"
              href={controls.normalHref}
              onClick={(event) => {
                event.preventDefault();
                controls.onNormal();
              }}
            >
              Normal
            </a>
            <button className="public-display-control" type="button" onClick={controls.onRefresh}>
              Refresh
            </button>
            {controls.fullscreenSupported ? (
              <button className="public-display-control" type="button" onClick={controls.onToggleFullscreen}>
                {controls.fullscreenActive ? "Exit" : "Fullscreen"}
              </button>
            ) : null}
          </nav>
        ) : null}
        {children}
      </section>
    </main>
  );
}
