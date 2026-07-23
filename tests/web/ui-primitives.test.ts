import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { UiBadge, UiButton, UiPanel, UiStatusIndicator } from "../../apps/web/src/components/ui";

const styles = readFileSync("apps/web/src/styles/primitives.css", "utf8");
const buttonSource = readFileSync("apps/web/src/components/ui/UiButton.tsx", "utf8");
const primitiveSources = ["UiPanel", "UiBadge", "UiButton", "UiStatusIndicator"]
  .map((name) => readFileSync(`apps/web/src/components/ui/${name}.tsx`, "utf8"))
  .join("\n");

describe("shared UI primitives", () => {
  test.each(["default", "elevated", "muted", "warning", "danger"] as const)("UiPanel renders the %s variant with heading association", (variant) => {
    const html = renderToStaticMarkup(createElement(UiPanel, { as: "article", heading: "Arena status", headingLevel: 3, variant }, "Ready"));

    expect(html).toContain(`<article aria-labelledby=`);
    expect(html).toContain(`class="ui-panel ui-panel--${variant}"`);
    expect(html).toMatch(/<h3 class="ui-panel__heading" id="[^"]+">Arena status<\/h3>/);
    expect(html).toContain("Ready</article>");
  });

  test.each(["neutral", "info", "success", "warning", "danger", "offline"] as const)("UiBadge renders the %s variant with a visible label", (variant) => {
    const html = renderToStaticMarkup(createElement(UiBadge, { icon: "!", variant }, "Connection state"));

    expect(html).toContain(`ui-badge--${variant}`);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<span class="ui-badge__label">Connection state</span>');
    expect(html).not.toContain('role="status"');
  });

  test("UiButton uses native semantics and defaults to type button", () => {
    const html = renderToStaticMarkup(createElement(UiButton, null, "Open panel"));

    expect(html).toMatch(/^<button/);
    expect(html).toContain('type="button"');
    expect(html).toContain("Open panel");
    expect(buttonSource).not.toMatch(/onKeyDown|onKeyUp|tabIndex|role="button"/);
  });

  test("UiButton preserves native disabled behavior", () => {
    const handler = vi.fn();
    const html = renderToStaticMarkup(createElement(UiButton, { disabled: true, onClick: handler }, "Unavailable"));

    expect(html).toContain('disabled=""');
    expect(handler).not.toHaveBeenCalled();
  });

  test("UiButton exposes an accessible busy state and prevents activation", () => {
    const html = renderToStaticMarkup(createElement(UiButton, { busy: true, busyLabel: "Saving" }, "Save"));

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Saving");
    expect(html).not.toContain(">Save<");
  });

  test.each(["neutral", "info", "success", "warning", "danger", "offline"] as const)("UiStatusIndicator renders the %s variant with visible non-live text", (variant) => {
    const html = renderToStaticMarkup(createElement(UiStatusIndicator, { label: "Projection connected", variant }));

    expect(html).toContain(`ui-status-indicator--${variant}`);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Projection connected");
    expect(html).not.toMatch(/aria-live|role="status"/);
  });

  test("focus styling uses outline and halo without changing layout geometry", () => {
    const focusRule = styles.match(/\.ui-button:focus-visible\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(focusRule).toContain("box-shadow: var(--focus-separation-halo");
    expect(focusRule).toContain("outline: var(--focus-outline-width");
    expect(focusRule).toContain("outline-offset: var(--focus-outline-offset");
    expect(focusRule).not.toMatch(/border-width|padding|margin|animation|transition/);
  });

  test("supports forced colors and reduced motion", () => {
    expect(styles).toMatch(/@media \(forced-colors: active\)[\s\S]*\.ui-button:focus-visible[\s\S]*border-color:\s*Highlight[\s\S]*outline-color:\s*Highlight/);
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ui-button\s*\{\s*transition:\s*none/);
  });

  test("fixture stays non-polymorphic and free of extra tab stops or private behavior", () => {
    const html = renderToStaticMarkup(
      createElement(
        UiPanel,
        { heading: "Compact fixture" },
        createElement(UiBadge, { variant: "info" }, "Informational"),
        createElement(UiStatusIndicator, { label: "Offline", variant: "offline" }),
        createElement(UiButton, { size: "large" }, "Long primary command label wraps safely")
      )
    );

    expect(html).not.toMatch(/tabindex="[1-9]/i);
    expect(primitiveSources).not.toMatch(/fetch\(|axios|socket\.emit|localStorage|sessionStorage|dangerouslySetInnerHTML|setInterval|expectedSeq|correctionReason/i);
    expect(primitiveSources).not.toMatch(/actor|audit|commandId|correlationId|csrf|session|token/i);
  });
});
