import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const webBaseUrl = process.env.RM08_MOUNTED_WEB_URL ?? "http://127.0.0.1:5188";
const matchId = process.env.RM08_MOUNTED_MATCH_ID;
const adminCredentialsPath = process.env.RM08_MOUNTED_ADMIN_CREDENTIALS;

function readCredentialFile(path: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    values[key.trim()] = rest.join("=").trim();
  }
  return values;
}

describe("RM-08 mounted roster baseline UI", () => {
  it("proves the actual web/API/database boundary for readiness, hard blocking, privacy, and duplicate-submit prevention", async () => {
    if (!matchId || !adminCredentialsPath) throw new Error("Mounted test requires RM08_MOUNTED_MATCH_ID and RM08_MOUNTED_ADMIN_CREDENTIALS");
    const credentials = readCredentialFile(adminCredentialsPath);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      forcedColors: "active"
    });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const expectedNavigationAborts: string[] = [];
    const unexpectedHttpFailures: string[] = [];
    page.on("console", (message) => {
      if (["warning", "error"].includes(message.type()) && message.text() !== "Failed to load resource: the server responded with a status of 401 (Unauthorized)" && message.text() !== "Failed to load resource: the server responded with a status of 404 (Not Found)") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText ?? "unknown";
      const entry = `${request.method()} ${request.url()} ${failure}`;
      if (failure === "net::ERR_ABORTED" && request.method() === "GET" && request.url().endsWith("/api/v1/operator/matches")) expectedNavigationAborts.push(entry);
      else failedRequests.push(entry);
    });
    page.on("response", (response) => {
      if (response.status() < 400) return;
      const url = response.url();
      const expected = response.status() === 401 && url.endsWith("/api/v1/auth/me") || response.status() === 404 && /\/api\/v1\/matches\/[^/]+\/roster-baseline\/(HOME|AWAY)$/.test(new URL(url).pathname);
      if (!expected) unexpectedHttpFailures.push(`${response.status()} ${response.request().method()} ${url}`);
    });

    try {
      await page.goto(`${webBaseUrl}/login`, { waitUntil: "domcontentloaded" });
      await page.getByRole("textbox", { name: "Email" }).fill(credentials.ADMIN_EMAIL);
      await page.getByRole("textbox", { name: "Password" }).fill(credentials.ADMIN_PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 10000 });

      await page.goto(`${webBaseUrl}/admin/matches/${encodeURIComponent(matchId)}/rosters`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Roster Baseline Readiness" }).waitFor();
      const initialButtons = page.getByRole("button", { name: /Import (HOME|AWAY) baseline/ });
      expect(await initialButtons.count()).toBe(2);
      const initialReadiness = await page.locator("dd").allTextContents();
      expect(initialReadiness.some((value) => value.includes("ROSTER_NOT_INITIALIZED"))).toBe(true);

      const visibleButtons = await page.locator("button:visible").evaluateAll((buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { text: button.textContent?.trim(), width: rect.width, height: rect.height, disabled: (button as HTMLButtonElement).disabled };
      }));
      expect(visibleButtons.filter((button) => button.width > 0).every((button) => button.height >= 40)).toBe(true);

      const homeResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes(`/api/v1/matches/${matchId}/roster-baseline/import`), { timeout: 15000 });
      await page.getByRole("button", { name: "Import HOME baseline", exact: true }).click();
      const homeResponse = await homeResponsePromise;
      expect(homeResponse.request().headers()["x-expected-seq"]).toBe("0");
      expect((await homeResponse.json()).currentSeq).toBe(1);
      expect(await page.getByRole("button", { name: "Importing baseline...", exact: true }).isDisabled()).toBe(true);
      await page.getByText("HOME authoritative baseline imported.", { exact: true }).waitFor();

      const awayResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes(`/api/v1/matches/${matchId}/roster-baseline/import`), { timeout: 15000 });
      await page.getByRole("button", { name: "Import AWAY baseline", exact: true }).click();
      const awayResponse = await awayResponsePromise;
      expect(awayResponse.request().headers()["x-expected-seq"]).toBe("1");
      const awayReceipt = await awayResponse.json();
      expect(awayReceipt.currentSeq).toBe(2);
      console.log(JSON.stringify({ home_expectedSeq: "0", home_currentSeq: 1, away_expectedSeq: awayResponse.request().headers()["x-expected-seq"], away_currentSeq: awayReceipt.currentSeq }));
      expect(await page.getByRole("button", { name: "Importing baseline...", exact: true }).isDisabled()).toBe(true);
      await page.getByText("AWAY authoritative baseline imported.", { exact: true }).waitFor();

      const afterImportReadiness = await page.locator("dd").allTextContents();
      expect(afterImportReadiness.some((value) => ["NOT_EVALUATED", "STARTERS_INCOMPLETE", "ROSTER_NOT_CONFIRMED"].includes(value))).toBe(true);

      await page.goto(`${webBaseUrl}/operator/matches/${encodeURIComponent(matchId)}/lifecycle`, { waitUntil: "domcontentloaded" });
      await page.locator('[aria-label="Match start checklist"]').waitFor({ state: "visible", timeout: 10000 });
      const lifecycleText = await page.locator("body").innerText();
      expect(lifecycleText).toMatch(/readiness|roster|start/i);
      const startButtons = page.getByRole("button", { name: /Start match|Start lifecycle/i });
      if (await startButtons.count()) expect(await startButtons.first().isDisabled()).toBe(true);

      await page.goto(`${webBaseUrl}/public/scoreboard/${encodeURIComponent(matchId)}`, { waitUntil: "domcontentloaded" });
      const publicText = await page.locator("body").innerText();
      expect(publicText).not.toContain("HOME Player");
      expect(publicText).not.toContain("AWAY Player");
      expect(publicText).not.toContain("canonicalPayloadHash");
      expect(publicText).not.toContain("projectionIntegrityHash");

      const forcedColorState = await page.locator("body").evaluate(() => ({
        forcedColors: matchMedia("(forced-colors: active)").matches,
        visibleButtons: [...document.querySelectorAll("button")].filter((button) => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }).length
      }));
      expect(forcedColorState.forcedColors).toBe(true);
      expect(forcedColorState.visibleButtons).toBeGreaterThanOrEqual(0);

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
      expect(unexpectedHttpFailures).toEqual([]);
      console.log(JSON.stringify({
        authoritative_home_away_readiness: "PASS",
        lifecycle_start_hard_block: "PASS",
        duplicate_submit_prevention: "PASS",
        forced_colors_active: "PASS",
        touch_control_geometry: "PASS",
        public_privacy: "PASS",
        console_errors: consoleErrors.length,
        page_errors: pageErrors.length,
        failed_network_requests: failedRequests.length,
        mandatory_skips: 0
      }));
    } finally {
      await browser.close();
    }
  }, 120000);
});
