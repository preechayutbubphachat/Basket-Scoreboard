import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { PublicDisplayShell } from "../../apps/web/src/components/PublicDisplayShell";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");
const shellSource = readFileSync("apps/web/src/components/PublicDisplayShell.tsx", "utf8");

describe("PublicDisplayShell", () => {
  test("renders the existing frame hierarchy and scene content slot without an extra wrapper", () => {
    const html = renderToStaticMarkup(createElement(PublicDisplayShell, {
      className: "public-display-shell kiosk-mode controls-hidden",
      frameClassName: "public-display-frame arena-layout public-display-scene-frame",
      frameLabel: "Public display scene"
    }, createElement("div", { className: "scene-content" }, "Standby")));

    expect(html).toMatch(/^<main class="public-display-shell kiosk-mode controls-hidden"><section class="public-display-frame arena-layout public-display-scene-frame" aria-label="Public display scene">/);
    expect(html).toContain('<div class="scene-content">Standby</div>');
    expect(html).toMatch(/<\/section><\/main>$/);
  });

  test("keeps utility controls native, ordered, and optional", () => {
    const onNormal = vi.fn();
    const onRefresh = vi.fn();
    const onToggleFullscreen = vi.fn();
    const html = renderToStaticMarkup(createElement(PublicDisplayShell, {
      className: "public-display-shell",
      frameClassName: "public-display-frame arena-layout",
      frameLabel: "16:9 public scoreboard display",
      controls: {
        normalHref: "/public/scoreboard/match-1",
        onNormal,
        onRefresh,
        fullscreenSupported: true,
        fullscreenActive: false,
        onToggleFullscreen
      }
    }, createElement("div", null, "LIVE")));

    expect(html).toContain('<nav class="arena-display-actions" aria-label="Public display actions">');
    expect(html).toContain('<a class="public-display-control" href="/public/scoreboard/match-1">Normal</a>');
    expect(html).toContain('<button class="public-display-control" type="button">Refresh</button>');
    expect(html).toContain('<button class="public-display-control" type="button">Fullscreen</button>');
    expect(html.indexOf("Normal")).toBeLessThan(html.indexOf("Refresh"));
    expect(html.indexOf("Refresh")).toBeLessThan(html.indexOf("Fullscreen"));
    expect(onNormal).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onToggleFullscreen).not.toHaveBeenCalled();
  });

  test("is presentation-only and leaves public data and lifecycle ownership in App", () => {
    expect(shellSource).not.toMatch(/fetch\(|axios|socket|setInterval|localStorage|sessionStorage|auth\/me|expectedSeq|currentSeq|lastEventSeq/i);
    expect(shellSource).not.toMatch(/actor|role|permission|device|session|token|csrf|commandId|correlationId|causationId|audit|correctionReason/i);
    expect(appSource).toContain("<PublicDisplayShell");
    expect(appSource).toContain("refreshPublicScoreboard");
    expect(appSource).toContain("usePublicProjectionRealtime");
    expect(appSource).toContain("getPublicDisplaySceneRefreshMs(refreshAfterMs)");
  });

  test("keeps BLANK, SCHEDULE, and FINAL_SUMMARY scene renderers outside the shell", () => {
    expect(shellSource).not.toMatch(/PublicLiveScoreboard|PublicScheduleDisplayScene|PublicFinalSummaryDisplayScene|PublicDisplaySceneModel/);
    expect(appSource).toContain("<PublicDisplaySceneCard model={sceneModel} fallbackSlug={screenSlug} />");
    expect(appSource).toContain("<PublicScheduleDisplayScene model={model} />");
    expect(appSource).toContain("<PublicFinalSummaryDisplayScene model={model} />");
  });
});
