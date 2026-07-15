import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { AuthenticatedDashboardShell } from "../../apps/web/src/components/AuthenticatedDashboardShell";
import {
  UiCommandSafetyPanel,
  UiCommandStatus,
  UiConnectionStatus,
  UiDataTable,
  UiEmptyState
} from "../../apps/web/src/components/ui";

const styles = readFileSync("apps/web/src/styles/primitives.css", "utf8");
const appSource = readFileSync("apps/web/src/App.tsx", "utf8");
const primitiveSources = [
  "UiCommandSafetyPanel",
  "UiCommandStatus",
  "UiConnectionStatus",
  "UiDataTable",
  "UiEmptyState"
].map((name) => readFileSync(`apps/web/src/components/ui/${name}.tsx`, "utf8")).join("\n");

describe("shared status, command, safety, table, and empty-state primitives", () => {
  test.each([
    ["connected", "Connected"],
    ["reconnecting", "Reconnecting"],
    ["offline", "Offline"],
    ["sync-required", "Sync required"],
    ["read-only", "Read only"]
  ] as const)("UiConnectionStatus renders visible %s text without relying on color", (state, label) => {
    const html = renderToStaticMarkup(createElement(UiConnectionStatus, { state }));

    expect(html).toContain(`ui-connection-status--${state}`);
    expect(html).toContain(label);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/aria-live|role="status"/);
  });

  test("UiConnectionStatus announces politely only when explicitly requested", () => {
    const quiet = renderToStaticMarkup(createElement(UiConnectionStatus, { state: "connected" }));
    const announced = renderToStaticMarkup(createElement(UiConnectionStatus, { announce: true, state: "reconnecting" }));

    expect(quiet).not.toMatch(/aria-live|role="status"/);
    expect(announced).toContain('role="status"');
    expect(announced).toContain('aria-live="polite"');
    expect(announced).toContain('aria-atomic="true"');
  });

  test.each([
    ["idle", "Ready"],
    ["pending", "Pending"],
    ["accepted", "Accepted"],
    ["rejected", "Rejected"],
    ["sync-required", "Sync required"],
    ["duplicate", "Duplicate accepted"]
  ] as const)("UiCommandStatus renders the %s lifecycle supplied by its consumer", (state, label) => {
    const html = renderToStaticMarkup(createElement(UiCommandStatus, { detail: "Consumer supplied detail", state }));

    expect(html).toContain(label);
    expect(html).toContain("Consumer supplied detail");
    expect(html).toContain(`aria-busy="${state === "pending"}"`);
    expect(html).not.toMatch(/aria-live|role="status"/);
  });

  test("UiCommandSafetyPanel displays safety context and leaves actions consumer-owned", () => {
    const onReview = vi.fn();
    const action = createElement("button", { onClick: onReview, type: "button" }, "Review command");
    const html = renderToStaticMarkup(createElement(UiCommandSafetyPanel, {
      actions: action,
      commandState: "sync-required",
      confirmationMessage: "Confirmation is required before submission.",
      connectionState: "reconnecting",
      correctionWarning: "Corrections use the protected workflow.",
      readOnlyMessage: "This summary is read only.",
      syncMessage: "Refresh authoritative state before continuing."
    }));

    expect(html).toContain("Command safety");
    expect(html).toContain("Reconnecting");
    expect(html).toContain("Sync required");
    expect(html).toContain("Confirmation is required before submission.");
    expect(html).toContain("Corrections use the protected workflow.");
    expect(html).toContain("This summary is read only.");
    expect(html).toContain("Review command");
    expect(onReview).not.toHaveBeenCalled();
    action.props.onClick();
    expect(onReview).toHaveBeenCalledOnce();
  });

  test("UiDataTable renders a caption, scoped headers, row headers, and long bilingual cells", () => {
    const rows = [{ id: "row-1", name: "สถานะการแข่งขันและรายละเอียดการดำเนินงานที่ยาวมาก / Long operational status detail" }];
    const html = renderToStaticMarkup(createElement(UiDataTable, {
      caption: "Arena operations",
      columns: [
        { key: "name", header: "รายการ / Item", rowHeader: true, render: (row: typeof rows[number]) => row.name },
        { key: "state", header: "Status", render: () => "Ready" }
      ],
      getRowKey: (row: typeof rows[number]) => row.id,
      rows
    }));

    expect(html).toContain("<caption>Arena operations</caption>");
    expect(html.match(/<th[^>]*scope="col"/g)).toHaveLength(2);
    expect(html).toMatch(/<th[^>]*scope="row"/);
    expect(html).toContain(rows[0].name);
    expect(html).toContain('class="ui-data-table-region"');
    expect(html).toContain('tabindex="0"');
  });

  test("UiDataTable exposes explicit loading and empty states without fetching or calculating", () => {
    const columns = [{ key: "item", header: "Item", render: (row: { item: string }) => row.item }];
    const loadingHtml = renderToStaticMarkup(createElement(UiDataTable, {
      caption: "Loading table",
      columns,
      loading: true,
      rows: []
    }));
    const emptyHtml = renderToStaticMarkup(createElement(UiDataTable, {
      caption: "Empty table",
      columns,
      emptyState: createElement(UiEmptyState, { description: "No rows match the current view.", state: "empty", title: "No rows" }),
      rows: []
    }));

    expect(loadingHtml).toContain('aria-busy="true"');
    expect(loadingHtml).toContain("Loading data");
    expect(emptyHtml).toContain("No rows");
    expect(emptyHtml).toContain("No rows match the current view.");
    expect(emptyHtml).toMatch(/colspan="1"/i);
  });

  test.each([
    ["empty", "Nothing here"],
    ["loading", "Loading data"],
    ["error", "Unable to load"],
    ["unavailable", "Unavailable"]
  ] as const)("UiEmptyState renders the %s variant without a default live region", (state, title) => {
    const html = renderToStaticMarkup(createElement(UiEmptyState, { description: "Consumer supplied description", state, title }));

    expect(html).toContain(`ui-empty-state--${state}`);
    expect(html).toContain(title);
    expect(html).toContain("Consumer supplied description");
    expect(html).toContain(`aria-busy="${state === "loading"}"`);
    expect(html).not.toMatch(/aria-live|role="alert"|role="status"/);
  });

  test("primitive styles contain local table overflow, focus, forced-colors, and reduced-motion safeguards", () => {
    expect(styles).toMatch(/\.ui-data-table-region\s*\{[\s\S]*overflow-x:\s*auto/);
    expect(styles).toMatch(/\.ui-data-table-region:focus-visible[\s\S]*outline:/);
    expect(styles).toMatch(/\.ui-data-table__cell[\s\S]*overflow-wrap:\s*anywhere/);
    expect(styles).toMatch(/@media \(forced-colors: active\)[\s\S]*\.ui-command-safety-panel/);
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ui-connection-status/);
  });

  test("new primitives own no network, socket, storage, authorization, domain calculation, or private metadata", () => {
    expect(primitiveSources).not.toMatch(/fetch\(|axios|socket\.emit|io\(|new Socket|localStorage|sessionStorage|document\.cookie|setInterval|setTimeout/);
    expect(primitiveSources).not.toMatch(/expectedSeq|correlationId|causationId|commandId|actor|device|csrf|token|audit|correctionReason|sourceEventSeq/);
    expect(primitiveSources).not.toMatch(/score\s*[+\-*/]=|foul\s*[+\-*/]=|standings|tiebreak|possession|timeoutLimit|retry\s*\(/i);
    expect(primitiveSources).not.toMatch(/tabIndex\s*=\s*[{"']?[1-9]|role="button"|onKeyDown|onKeyUp/);
  });

  test("adopts status and safety presentation only on the low-risk authenticated admin landing", () => {
    const adminHome = appSource.slice(appSource.indexOf("function AdminDashboardHome"), appSource.indexOf("function AdminMatchesPage"));

    expect(appSource).toContain("UiCommandSafetyPanel");
    expect(appSource).toContain("UiConnectionStatus");
    expect(adminHome).toContain('<UiConnectionStatus label="Authenticated session" state="connected" />');
    expect(adminHome).toContain("<UiCommandSafetyPanel");
    expect(adminHome).not.toMatch(/fetch\(|socket|expectedSeq|correlationId|commandId|onConfirm|onRetry/);
  });

  test("composes a safety rail and locally scrollable table inside the authenticated shell", () => {
    const html = renderToStaticMarkup(createElement(AuthenticatedDashboardShell, {
      brand: { href: "/", label: "Basketball Scoreboard" },
      navigationItems: [{ current: true, href: "/admin", label: "Admin" }],
      secondaryRail: createElement(UiCommandSafetyPanel, { readOnlyMessage: "Fixture only" }),
      statusContent: createElement(UiConnectionStatus, { state: "connected" }),
      title: "Primitive composition fixture"
    }, createElement(UiDataTable, {
      caption: "Status records",
      columns: [{ key: "status", header: "Status", render: (row: { status: string }) => row.status }],
      rows: [{ status: "Ready" }]
    })));

    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toContain("authenticated-dashboard-body--with-secondary");
    expect(html).toContain("ui-command-safety-panel");
    expect(html).toContain("ui-data-table-region");
    expect(html).not.toMatch(/<main[\s\S]*<main|<nav[\s\S]*<nav/);
  });
});
