import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");
const styles = readFileSync("apps/web/src/styles.css", "utf8");
const displayPageSource = appSource.slice(
  appSource.indexOf("function PublicScoreboardDisplayPage"),
  appSource.indexOf("function PublicDisplayScenePage")
);

describe("public display utility control accessibility", () => {
  test("keeps native semantics, accessible names, and logical DOM order", () => {
    const normalIndex = displayPageSource.indexOf("Normal");
    const refreshIndex = displayPageSource.indexOf("Refresh");
    const fullscreenIndex = displayPageSource.indexOf('{fullscreenActive ? "Exit" : "Fullscreen"}');

    expect(displayPageSource).toContain('<nav className="arena-display-actions" aria-label="Public display actions">');
    expect(displayPageSource).toMatch(/<a[\s\S]*className="public-display-control"[\s\S]*href=\{buildPublicScoreboardLink\(matchId\)\}/);
    expect(displayPageSource).toMatch(/<button className="public-display-control" type="button"[^>]*>[\s\S]*Refresh/);
    expect(displayPageSource).toMatch(/<button className="public-display-control" type="button"[^>]*>[\s\S]*Fullscreen/);
    expect(normalIndex).toBeGreaterThan(-1);
    expect(refreshIndex).toBeGreaterThan(normalIndex);
    expect(fullscreenIndex).toBeGreaterThan(refreshIndex);
    expect(displayPageSource).not.toMatch(/tabIndex|onKeyDown|role="button"/);
  });

  test("uses one non-color-only focus-visible treatment for links and buttons", () => {
    expect(styles).toMatch(/\.arena-display-actions \.public-display-control:focus-visible\s*\{[\s\S]*outline:\s*3px solid #f8fafc/);
    expect(styles).toMatch(/\.arena-display-actions \.public-display-control:focus-visible\s*\{[\s\S]*outline-offset:\s*3px/);
    expect(styles).toMatch(/\.arena-display-actions \.public-display-control:focus-visible\s*\{[\s\S]*box-shadow:\s*0 0 0 2px #020617/);
    expect(styles).not.toMatch(/\.arena-display-actions \.public-display-control:focus-visible\s*\{[\s\S]*outline:\s*none/);
  });

  test("keeps focused controls visible when the utility rail auto-hides", () => {
    expect(styles).toMatch(/\.controls-hidden \.arena-display-actions:focus-within\s*\{[\s\S]*opacity:\s*0\.54[\s\S]*pointer-events:\s*auto[\s\S]*transform:\s*translateY\(0\)/);
    expect(styles).toMatch(/\.kiosk-mode\.controls-hidden \.arena-display-actions:focus-within\s*\{[\s\S]*opacity:\s*0\.42/);
  });

  test("provides a narrow forced-colors fallback without animated focus", () => {
    expect(styles).toMatch(/@media \(forced-colors: active\)\s*\{[\s\S]*\.public-display-control:focus-visible[\s\S]*border-color:\s*Highlight[\s\S]*outline-color:\s*Highlight/);
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.arena-display-actions\s*\{[\s\S]*transition:\s*none/);
    const focusRule = styles.match(/\.arena-display-actions \.public-display-control:focus-visible\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(focusRule).not.toMatch(/animation|transition/);
  });

  test("does not add commands, auth bootstrap, or extra public tab stops", () => {
    expect(displayPageSource.match(/className="public-display-control"/g)).toHaveLength(3);
    expect(displayPageSource).not.toMatch(/\/api\/v1\/auth\/me|commandId|correlationId|csrf|session|operator/i);
    expect(displayPageSource).not.toMatch(/<input|<select|<textarea/);
  });
});
