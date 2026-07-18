const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { resolve } = require("node:path");
const { chromium } = require("playwright");

const repositoryRoot = resolve(__dirname, "..", "..");
const viteEntry = resolve(repositoryRoot, "node_modules", "vite", "bin", "vite.js");
const port = Number(process.env.RM05_P2_PORT || 4186);
const baseUrl = `http://127.0.0.1:${port}`;
const fixturePath = "/tests/browser/score-workspace-fixture.html";
const viewports = [
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1024, height: 576 }
];

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${fixturePath}`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("RM-05-P2 fixture server did not become ready");
}

async function measure(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}${fixturePath}`, { waitUntil: "networkidle" });
  const homeOne = page.getByRole("button", { name: "HOME add 1 point", exact: true });
  await homeOne.focus();
  const result = await page.evaluate(() => {
    const visible = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const buttons = [...document.querySelectorAll(".score-workspace__score-actions button")];
    const buttonLabels = buttons.map((button) => button.getAttribute("aria-label"));
    const buttonRects = buttons.map((button) => button.getBoundingClientRect());
    const home = document.querySelector('[data-team-side="HOME"]')?.getBoundingClientRect();
    const away = document.querySelector('[data-team-side="AWAY"]')?.getBoundingClientRect();
    const focused = document.activeElement;
    const focusStyle = focused ? getComputedStyle(focused) : null;
    return {
      awayScoreVisible: visible('[aria-label="AWAY score 84"]'),
      buttonLabels,
      controlsReachable: buttonRects.length === 6 && buttonRects.every((rect) => rect.width > 0 && rect.height >= 44),
      correctionSeparated: Boolean(home && away && document.querySelector(".score-workspace__correction")),
      focusOutlineStyle: focusStyle?.outlineStyle,
      focusOutlineWidth: focusStyle?.outlineWidth,
      homeScoreVisible: visible('[aria-label="HOME score 88"]'),
      noHorizontalOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
      teamIdentityUnambiguous: Boolean(
        document.querySelector('[data-team-side="HOME"] h3')?.textContent?.trim()
        && document.querySelector('[data-team-side="AWAY"] h3')?.textContent?.trim()
      )
    };
  });

  assert.equal(result.noHorizontalOverflow, true, `${viewport.width} overflowed horizontally`);
  assert.equal(result.homeScoreVisible, true, `${viewport.width} HOME score missing`);
  assert.equal(result.awayScoreVisible, true, `${viewport.width} AWAY score missing`);
  assert.equal(result.controlsReachable, true, `${viewport.width} controls unreachable`);
  assert.equal(result.teamIdentityUnambiguous, true, `${viewport.width} team identity ambiguous`);
  assert.equal(result.correctionSeparated, true, `${viewport.width} correction entry missing`);
  assert.equal(result.focusOutlineStyle, "solid", `${viewport.width} focus outline missing`);
  assert.equal(result.focusOutlineWidth, "3px", `${viewport.width} focus outline width`);
  assert.deepEqual(result.buttonLabels, [
    "HOME add 1 point", "HOME add 2 points", "HOME add 3 points",
    "AWAY add 1 point", "AWAY add 2 points", "AWAY add 3 points"
  ]);

  return { viewport, ...result };
}

async function zoomEquivalent(page, percent) {
  const scale = percent / 100;
  const viewport = { width: Math.floor(1280 / scale), height: Math.floor(720 / scale) };
  const result = await measure(page, viewport);
  return { percent, ...result };
}

async function verifyRapidQueue(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}${fixturePath}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "HOME add 1 point", exact: true }).click();
  await page.getByRole("button", { name: "HOME add 2 points", exact: true }).click();
  await page.getByRole("button", { name: "AWAY add 3 points", exact: true }).click();
  await page.getByRole("button", { name: "HOME add 1 point", exact: true }).click();
  await page.getByRole("button", { name: "AWAY add 2 points", exact: true }).press("Enter");
  await page.getByTestId("projection-seq").getByText("1289").waitFor();
  const dispatches = await page.getByTestId("dispatches").textContent();
  assert.equal(dispatches, "HOME:1:none:1284,HOME:2:none:1285,AWAY:3:none:1286,HOME:1:none:1287,AWAY:2:none:1288");
  assert.equal(await page.getByTestId("max-network-active").textContent(), "1");
  assert.equal(await page.getByTestId("queue-state").textContent(), "RUNNING:0:IDLE");
  const layout = await page.evaluate(() => ({
    noHorizontalOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
    scoresVisible: document.querySelectorAll(".score-workspace__score-block output").length === 2,
    controlsReachable: [...document.querySelectorAll(".score-workspace__score-actions button")].every((button) => button.getBoundingClientRect().height >= 44)
  }));
  assert.equal(layout.noHorizontalOverflow, true);
  assert.equal(layout.scoresVisible, true);
  assert.equal(layout.controlsReachable, true);
  return { viewport, dispatches, maxNetworkActive: 1, ...layout };
}

async function verifySyncPause(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}${fixturePath}?failure=sync`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "HOME add 1 point", exact: true }).click();
  await page.getByRole("button", { name: "HOME add 2 points", exact: true }).click();
  await page.getByRole("button", { name: "AWAY add 3 points", exact: true }).click();
  await page.getByText("Synchronization required — queued actions paused").waitFor();
  assert.equal(await page.getByTestId("dispatches").textContent(), "");
  assert.equal(await page.getByTestId("queue-state").textContent(), "SYNC_REQUIRED:2:ACTIVE");
  assert.equal(await page.getByRole("button", { name: "HOME add 1 point", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Resume queued actions" }).click();
  await page.getByTestId("projection-seq").getByText("1286").waitFor();
  assert.equal(await page.getByTestId("dispatches").textContent(), "HOME:2:none:1284,AWAY:3:none:1285");
  assert.equal(await page.getByTestId("max-network-active").textContent(), "1");

  await page.goto(`${baseUrl}${fixturePath}?failure=sync`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "HOME add 1 point", exact: true }).click();
  await page.getByRole("button", { name: "AWAY add 1 point", exact: true }).click();
  await page.getByText("Synchronization required — queued actions paused").waitFor();
  await page.getByRole("button", { name: "Discard queued actions" }).click();
  assert.equal(await page.getByTestId("queue-state").textContent(), "RUNNING:0:IDLE");
  assert.equal(await page.getByTestId("dispatches").textContent(), "");
  return { viewport, paused: true, noAutoReplay: true, resume: true, discard: true };
}

async function main() {
  const server = spawn(process.execPath, [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let browser;
  const serverErrors = [];
  server.stderr.on("data", (chunk) => serverErrors.push(String(chunk)));
  try {
    await waitForServer();
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {})
    });
    const page = await browser.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on("console", (message) => { if (["warning", "error"].includes(message.type())) consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
    const matrix = [];
    for (const viewport of viewports) matrix.push(await measure(page, viewport));
    const zoom = [];
    for (const percent of [125, 150, 200]) zoom.push(await zoomEquivalent(page, percent));
    const rapid = [];
    for (const viewport of [viewports[0], viewports[2], viewports[4]]) rapid.push(await verifyRapidQueue(page, viewport));
    const syncPause = [];
    for (const viewport of [viewports[0], viewports[2], viewports[4]]) syncPause.push(await verifySyncPause(page, viewport));
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failedRequests, []);
    process.stdout.write(`${JSON.stringify({ matrix, zoom, rapid, syncPause, consoleErrors, pageErrors, failedRequests })}\n`);
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
