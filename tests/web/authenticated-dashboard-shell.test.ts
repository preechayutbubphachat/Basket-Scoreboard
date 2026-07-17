import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { AuthenticatedDashboardShell } from "../../apps/web/src/components/AuthenticatedDashboardShell";

const appSource = readFileSync("apps/web/src/App.tsx", "utf8");
const shellSource = readFileSync("apps/web/src/components/AuthenticatedDashboardShell.tsx", "utf8");
const styles = readFileSync("apps/web/src/styles/authenticated-dashboard.css", "utf8");

function renderShell(options: { secondary?: boolean } = {}) {
  const onAdmin = vi.fn();
  const html = renderToStaticMarkup(createElement(AuthenticatedDashboardShell, {
    actions: createElement("a", { href: "/login" }, "Logout"),
    brand: { href: "/", label: "Basketball Scoreboard" },
    contextLabel: "Tournament operations",
    navigationItems: [
      { href: "/admin", label: "Admin", current: true, onClick: onAdmin },
      { href: "/admin/tournaments", label: "Tournaments" }
    ],
    secondaryRail: options.secondary ? createElement("p", null, "Ready") : undefined,
    statusContent: createElement("span", null, "Authenticated"),
    subtitle: "Assignments and tournaments",
    title: "Admin Dashboard",
    userContent: createElement("strong", null, "Admin User")
  }, createElement("section", null, createElement("h2", null, "Dashboard content"))));

  return { html, onAdmin };
}

describe("AuthenticatedDashboardShell", () => {
  test("renders semantic header, named navigation, and exactly one labelled main landmark", () => {
    const { html } = renderShell();

    expect(html).toContain('<header class="authenticated-dashboard-header">');
    expect(html).toContain('<nav class="authenticated-dashboard-navigation" aria-label="Authenticated dashboard navigation">');
    expect(html.match(/<main\b/g)).toHaveLength(1);
    const titleId = html.match(/<h1 id="([^"]+)">Admin Dashboard<\/h1>/)?.[1];
    expect(titleId).toBeTruthy();
    expect(html).toContain(`<main aria-labelledby="${titleId}"`);
    expect(html).not.toMatch(/aria-live|role="status"/);
  });

  test("keeps navigation native, ordered, current-route aware, and free of synthetic controls", () => {
    const { html, onAdmin } = renderShell();

    expect(html).toContain('<a aria-current="page" href="/admin">Admin</a>');
    expect(html).toContain('<a href="/admin/tournaments">Tournaments</a>');
    expect(html.indexOf('href="/admin"')).toBeLessThan(html.indexOf('href="/admin/tournaments"'));
    expect(html).not.toMatch(/tabindex="[1-9]|role="button"/i);
    expect(onAdmin).not.toHaveBeenCalled();
  });

  test("supports an optional secondary region without creating another main landmark", () => {
    const { html } = renderShell({ secondary: true });

    expect(html).toContain("authenticated-dashboard-body--with-secondary");
    expect(html).toContain('<aside class="authenticated-dashboard-secondary" aria-label="Dashboard status and context">');
    expect(html.match(/<main\b/g)).toHaveLength(1);
  });

  test("is presentation-only and owns no auth, network, socket, storage, timer, or domain behavior", () => {
    expect(shellSource).not.toMatch(/useCurrentUser|AuthProvider|fetch\(|axios|socket|io\(|setInterval|localStorage|sessionStorage|document\.cookie|expectedSeq|correctionReason/i);
    expect(shellSource).not.toMatch(/canManageAssignments|canAccessOperatorMatches|user\.role|permission|csrf|token/i);
    expect(shellSource).not.toMatch(/onKeyDown|onKeyUp|tabIndex|role="button"|dangerouslySetInnerHTML/);
  });

  test("provides visible focus, forced-colors, reduced-motion, long-label, and responsive safeguards", () => {
    expect(styles).toMatch(/\.authenticated-dashboard-navigation a:focus-visible[\s\S]*outline:/);
    expect(styles).toMatch(/@media \(forced-colors: active\)[\s\S]*outline-color:\s*Highlight/);
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration:\s*1ms/);
    expect(styles).toMatch(/\.authenticated-dashboard-heading h1[\s\S]*overflow-wrap:\s*anywhere/);
    expect(styles).toMatch(/\.authenticated-dashboard-navigation[\s\S]*overflow-x:\s*auto/);
    expect(styles).toMatch(/@media \(max-width: 1100px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  });

  test("adopts the admin landing and authorized Score route while keeping public display composition separate", () => {
    expect(appSource).toContain("<AdminDashboardHome />");
    expect(appSource).toContain('route.name === "admin" || route.name === "operator-score" || route.name === "public-scoreboard-display" || route.name === "public-display-scene"');
    expect(appSource).toContain("<OperatorScorePage matchId={route.matchId} />");
    expect(appSource).toContain("<PublicDisplayShell");
    expect(shellSource).not.toMatch(/PublicDisplayShell|PublicLiveScoreboard|PublicDisplayScene/);
  });
});
