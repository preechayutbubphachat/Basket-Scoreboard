const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { resolve } = require("node:path");
const { chromium } = require("playwright");

const repositoryRoot = resolve(__dirname, "..", "..");
const viteEntry = resolve(repositoryRoot, "node_modules", "vite", "bin", "vite.js");
const port = Number(process.env.RM08_ROSTER_BROWSER_PORT || 4192);
const baseUrl = `http://127.0.0.1:${port}`;
const fixturePath = "/tests/browser/roster-baseline-fixture.html";

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${fixturePath}`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("RM-08 roster fixture server did not become ready");
}

async function main() {
  const server = spawn(process.execPath, [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const serverErrors = [];
  server.stderr.on("data", (chunk) => serverErrors.push(String(chunk)));
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, forcedColors: "active" });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on("console", (message) => { if (["warning", "error"].includes(message.type())) consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));

    await page.goto(`${baseUrl}${fixturePath}?state=not-initialized`, { waitUntil: "networkidle" });
    await page.getByText("ROSTER_NOT_INITIALIZED", { exact: true }).first().waitFor();
    const initial = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("button")];
      const rects = buttons.map((button) => button.getBoundingClientRect());
      return {
        states: [...document.querySelectorAll("dd")].map((element) => element.textContent?.trim()),
        importButtons: buttons.filter((button) => /^Import (HOME|AWAY) baseline$/.test(button.textContent?.trim() ?? "")).length,
        touchSafe: rects.filter((rect) => rect.width > 0).every((rect) => rect.height >= 40),
        statusText: document.querySelector("[role=alert], [role=status]")?.textContent ?? ""
      };
    });
    assert.equal(initial.importButtons, 2);
    assert.equal(initial.touchSafe, true);
    assert.equal(initial.states.filter((state) => state === "ROSTER_NOT_INITIALIZED").length, 2);

    await page.getByRole("button", { name: "Import HOME baseline", exact: true }).click();
    await page.getByRole("button", { name: "Importing baseline...", exact: true }).waitFor();
    const pending = await page.evaluate(() => ({
      disabled: [...document.querySelectorAll("button")].filter((button) => /Import (HOME|AWAY) baseline|Importing baseline/.test(button.textContent ?? "")).every((button) => button.disabled),
      snapshot: window.__rosterFixture.getSnapshot()
    }));
    assert.equal(pending.disabled, true);
    assert.equal(pending.snapshot.commandAttempts, 1);
    await page.getByText("HOME authoritative baseline imported.").waitFor();

    const states = {
      "not-evaluated": "NOT_EVALUATED",
      "blocking-eligibility": "BLOCKING_ELIGIBILITY_REVIEW",
      "not-confirmed": "ROSTER_NOT_CONFIRMED",
      "starters-incomplete": "STARTERS_INCOMPLETE",
      ready: "READY"
    };
    const renderedStates = {};
    for (const [variant, expected] of Object.entries(states)) {
      await page.goto(`${baseUrl}${fixturePath}?state=${variant}`, { waitUntil: "networkidle" });
      await page.getByText(expected, { exact: true }).first().waitFor();
      renderedStates[variant] = await page.locator("dd").allTextContents();
    }

    const contrast = await page.evaluate(() => {
      const status = document.querySelector("dd");
      return { text: status?.textContent?.trim() ?? "", visible: Boolean(status && status.getBoundingClientRect().height > 0), forcedColorAdjust: status ? getComputedStyle(status).forcedColorAdjust : null };
    });
    assert.equal(contrast.visible, true);
    assert.notEqual(contrast.text, "");
    await page.emulateMedia({ forcedColors: "none" });

    await page.goto(`${baseUrl}${fixturePath}?state=sync-required`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Import HOME baseline", exact: true }).click();
    await page.getByText("Authoritative sequence changed.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Import HOME baseline", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Resync authoritative state", exact: true }).click();
    await page.getByText("Authoritative roster baseline state resynchronized.", { exact: true }).waitFor();
    const resync = await page.evaluate(() => window.__rosterFixture.getSnapshot());
    assert.equal(resync.resyncRequests, 1, "resync rehydrates from an observable authoritative read");
    assert.equal(await page.getByRole("button", { name: "Import HOME baseline", exact: true }).isDisabled(), false);

    const authorizationErrors = {};
    for (const [variant, expected] of Object.entries({ unauthorized: "UNAUTHORIZED", "assignment-revoked": "ASSIGNMENT_REVOKED" })) {
      await page.goto(`${baseUrl}${fixturePath}?state=${variant}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Import HOME baseline", exact: true }).click();
      await page.getByText(expected, { exact: true }).waitFor();
      authorizationErrors[variant] = await page.evaluate(() => ({
        alert: document.querySelector("[role=alert]")?.textContent?.trim() ?? "",
        snapshot: window.__rosterFixture.getSnapshot()
      }));
      assert.equal(authorizationErrors[variant].snapshot.commandAttempts, 1);
      assert.match(authorizationErrors[variant].alert, new RegExp(expected));
    }

    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failedRequests, []);
    process.stdout.write(`${JSON.stringify({ initial, pending, renderedStates, contrast, resync, authorizationErrors, consoleErrors, pageErrors, failedRequests })}\n`);
  } finally {
    if (browser) await browser.close();
    server.kill();
    if (serverErrors.length > 0 && server.exitCode && server.exitCode !== 0) process.stderr.write(serverErrors.join(""));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
