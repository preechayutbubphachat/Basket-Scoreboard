import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");
const shellSource = readFileSync("apps/web/src/components/PublicDisplayShell.tsx", "utf8");
const styles = readFileSync("apps/web/src/styles.css", "utf8");
const displayPageSource = appSource.slice(
  appSource.indexOf("function PublicScoreboardDisplayPage"),
  appSource.indexOf("function PublicDisplayScenePage")
);

describe("public display utility control accessibility", () => {
  test("keeps native semantics, accessible names, and logical DOM order", () => {
    const normalIndex = shellSource.indexOf("Normal");
    const refreshIndex = shellSource.indexOf("Refresh");
    const fullscreenIndex = shellSource.indexOf('{controls.fullscreenActive ? "Exit" : "Fullscreen"}');

    expect(shellSource).toContain('<nav className="arena-display-actions" aria-label="Public display actions">');
    expect(shellSource).toMatch(/<a[\s\S]*className="public-display-control"[\s\S]*href=\{controls\.normalHref\}/);
    expect(shellSource).toMatch(/<button className="public-display-control" type="button"[^>]*>[\s\S]*Refresh/);
    expect(shellSource).toMatch(/<button className="public-display-control" type="button"[^>]*>[\s\S]*Fullscreen/);
    expect(normalIndex).toBeGreaterThan(-1);
    expect(refreshIndex).toBeGreaterThan(normalIndex);
    expect(fullscreenIndex).toBeGreaterThan(refreshIndex);
    expect(shellSource).not.toMatch(/tabIndex|onKeyDown|role="button"/);
  });

  test("uses one non-color-only focus-visible treatment for links and buttons", () => {
    expect(styles).toMatch(/\.arena-display-actions \.public-display-control:focus-visible\s*\{[\s\S]*outline:\s*var\(--focus-outline-width, 3px\) solid var\(--color-focus, #f8fafc\)/);
    expect(styles).toMatch(/\.arena-display-actions \.public-display-control:focus-visible\s*\{[\s\S]*outline-offset:\s*var\(--focus-outline-offset, 3px\)/);
    expect(styles).toMatch(/\.arena-display-actions \.public-display-control:focus-visible\s*\{[\s\S]*box-shadow:\s*var\(--focus-separation-halo, 0 0 0 2px #020617\)/);
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

  test("compacts the utility rail inside the short arena header without changing control semantics", () => {
    expect(styles).toMatch(
      /@media \(max-height: 620px\) and \(min-aspect-ratio: 16 \/ 10\)[\s\S]*\.arena-display-actions\s*\{[\s\S]*gap:\s*3px[\s\S]*padding:\s*2px[\s\S]*right:\s*9px[\s\S]*top:\s*8px/
    );
    expect(styles).toMatch(
      /@media \(max-height: 620px\) and \(min-aspect-ratio: 16 \/ 10\)[\s\S]*\.arena-display-actions (?:a|\.public-display-control),[\s\S]*\.arena-display-actions (?:button|\.public-display-control)\s*\{[\s\S]*align-items:\s*center[\s\S]*display:\s*inline-flex[\s\S]*min-height:\s*30px[\s\S]*padding:\s*5px 7px/
    );
    expect(styles).toMatch(
      /@media \(max-height: 620px\) and \(min-aspect-ratio: 16 \/ 10\)[\s\S]*\.arena-header\s*\{\s*padding-inline:\s*6px 232px/
    );
    expect(styles).toMatch(
      /@media \(max-width: 1100px\) and \(min-width: 761px\) and \(max-height: 620px\)[\s\S]*\.arena-header\s*\{\s*padding-right:\s*232px/
    );
  });

  test("does not add commands, auth bootstrap, or extra public tab stops", () => {
    expect(shellSource.match(/className="public-display-control"/g)).toHaveLength(3);
    expect(shellSource).not.toMatch(/\/api\/v1\/auth\/me|commandId|correlationId|csrf|session|operator/i);
    expect(shellSource).not.toMatch(/<input|<select|<textarea/);
    expect(displayPageSource).toContain("document.documentElement.requestFullscreen");
    expect(displayPageSource).toContain("document.exitFullscreen");
  });
});
