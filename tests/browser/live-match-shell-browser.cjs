const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdirSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { chromium } = require("playwright");

const repositoryRoot = resolve(__dirname, "..", "..");
const viteEntry = resolve(repositoryRoot, "node_modules", "vite", "bin", "vite.js");
const outputDirectory = resolve(repositoryRoot, "output", "playwright");
const port = Number(process.env.RM03_P1_PORT || 4181);
const baseUrl = `http://127.0.0.1:${port}`;
const fixturePath = "/tests/browser/live-match-shell-fixture.html";
const viewports = [
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1536, height: 1024 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 }
];
const states = [
  { name: "ready-long-rail", query: "state=ready&rail=1&names=long&navigation=full", shellState: "ready", rail: true, navigation: "full" },
  { name: "ready-no-rail", query: "state=ready&rail=0&navigation=partial&metadata=none", shellState: "ready", rail: false, navigation: "partial" },
  { name: "ready-zero-navigation", query: "state=ready&rail=0&navigation=zero", shellState: "ready", rail: false, navigation: "zero" },
  { name: "degraded", query: "state=degraded&rail=1", shellState: "degraded", rail: true },
  { name: "offline", query: "state=offline&rail=1", shellState: "offline", rail: true },
  { name: "command-pending", query: "state=ready&rail=0&command=pending", shellState: "ready", rail: false, command: "Saving score" },
  { name: "command-error", query: "state=ready&rail=0&command=error", shellState: "ready", rail: false, command: "Score command rejected." },
  { name: "command-conflict", query: "state=ready&rail=0&command=conflict", shellState: "ready", rail: false, command: "Authoritative state changed." },
  { name: "final", query: "state=final&rail=1", shellState: "read-only", rail: true }
];

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${fixturePath}`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("RM-03-P1 fixture server did not become ready");
}

async function measure(page, viewport, state) {
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}${fixturePath}?${state.query}`, { waitUntil: "networkidle" });
  const firstNavigationLink = page.locator(".live-match-shell__navigation a").first();
  if (await firstNavigationLink.count()) await firstNavigationLink.focus();

  return page.evaluate(({ expectedState, hasRail, compact }) => {
    const documentElement = document.documentElement;
    const shell = document.querySelector(".live-match-shell");
    const navigation = document.querySelector(".live-match-shell__navigation");
    const navigationLink = navigation?.querySelector("a");
    const workspace = document.querySelector(".live-match-shell__workspace");
    const primary = document.querySelector(".live-match-shell__primary");
    const rail = document.querySelector(".live-match-shell__secondary");
    const teamNames = [...document.querySelectorAll(".live-match-shell__team")];
    const primaryRect = primary?.getBoundingClientRect();
    const railRect = rail?.getBoundingClientRect();
    const focusStyle = navigationLink ? getComputedStyle(navigationLink) : null;
    const navigationRect = navigation?.getBoundingClientRect();
    const linkRect = navigationLink?.getBoundingClientRect();

    return {
      compact,
      documentClientWidth: documentElement.clientWidth,
      documentScrollWidth: documentElement.scrollWidth,
      expectedState,
      focusInsideNavigation: Boolean(
        navigationRect && linkRect && linkRect.left >= navigationRect.left && linkRect.right <= navigationRect.right
      ),
      focusOutlineStyle: focusStyle?.outlineStyle ?? null,
      focusOutlineWidth: focusStyle?.outlineWidth ?? null,
      hasRail: Boolean(rail),
      liveNavigationLabel: navigation?.getAttribute("aria-label") ?? null,
      navigationIds: [...document.querySelectorAll(".live-match-shell__navigation a")].map((link) => link.getAttribute("href")),
      currentNavigationCount: document.querySelectorAll('.live-match-shell__navigation a[aria-current="page"]').length,
      commandText: document.querySelector(".ui-command-status")?.textContent ?? "",
      mainCount: document.querySelectorAll("main").length,
      navigationLinkHeight: linkRect?.height ?? 0,
      scoreButtonCount: document.querySelectorAll('[aria-label="Score workspace"] button').length,
      scoreButtonsDisabled: [...document.querySelectorAll('[aria-label="Score workspace"] button')].every((button) => button.disabled),
      railPositionSafe: !hasRail || !primaryRect || !railRect
        ? !hasRail && !rail
        : compact
          ? railRect.top >= primaryRect.bottom - 1
          : railRect.left >= primaryRect.right - 1,
      readOnlyTextVisible: document.body.innerText.includes("Read only"),
      shellStatePresent: shell?.classList.contains(`live-match-shell--${expectedState}`) ?? false,
      teamNamesBounded: teamNames.every((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= documentElement.clientWidth + 1;
      }),
      workspaceColumns: workspace ? getComputedStyle(workspace).gridTemplateColumns : null
    };
  }, { compact: viewport.width <= 1100, expectedState: state.shellState, hasRail: state.rail });
}

async function main() {
  mkdirSync(outputDirectory, { recursive: true });
  const server = spawn(process.execPath, [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let browser;
  const serverErrors = [];
  server.stderr.on("data", (chunk) => serverErrors.push(String(chunk)));

  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleMessages = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on("console", (message) => {
      if (["warning", "error"].includes(message.type())) consoleMessages.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`));

    const matrix = [];
    for (const viewport of viewports) {
      for (const state of states) {
        const result = await measure(page, viewport, state);
        assert.equal(result.documentScrollWidth, result.documentClientWidth, `${viewport.width} ${state.name} overflowed horizontally`);
        assert.equal(result.mainCount, 1, `${viewport.width} ${state.name} must render one main landmark`);
        assert.equal(result.liveNavigationLabel, "Live match controls");
        assert.equal(result.shellStatePresent, true, `${viewport.width} ${state.name} shell state mismatch`);
        assert.equal(result.hasRail, state.rail, `${viewport.width} ${state.name} rail mismatch`);
        assert.equal(result.railPositionSafe, true, `${viewport.width} ${state.name} rail position mismatch`);
        assert.equal(result.teamNamesBounded, true, `${viewport.width} ${state.name} team label overflow`);
        assert.equal(result.scoreButtonCount, 6, `${viewport.width} ${state.name} score controls missing`);
        if (state.command) assert(result.commandText.includes(state.command), `${viewport.width} ${state.name} command status missing`);
        if (state.navigation === "zero") {
          assert.equal(result.navigationIds.length, 0);
          assert.equal(result.currentNavigationCount, 0);
        } else {
          assert(result.navigationLinkHeight >= 44, `${viewport.width} ${state.name} navigation target is below 44px`);
          assert.equal(result.focusInsideNavigation, true, `${viewport.width} ${state.name} focus is clipped`);
          assert.equal(result.focusOutlineStyle, "solid");
          assert.equal(result.focusOutlineWidth, "3px");
          assert.equal(result.currentNavigationCount, 1);
        }
        if (state.navigation === "partial") {
          assert.deepEqual(result.navigationIds, [
            "/operator/matches/fixture-match-1/clock",
            "/operator/matches/fixture-match-1/summary",
            "/operator/matches/fixture-match-1/replay"
          ]);
        }
        if (state.name === "final") {
          assert.equal(result.readOnlyTextVisible, true);
          assert.equal(result.scoreButtonsDisabled, true);
        }
        matrix.push({ viewport, state: state.name, ...result });
      }
    }

    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(`${baseUrl}${fixturePath}?state=degraded&rail=1`, { waitUntil: "networkidle" });
    await page.locator(".live-match-shell__navigation a").first().focus();
    const forcedColors = await page.locator(".live-match-shell__navigation a").first().evaluate((element) => ({
      outlineStyle: getComputedStyle(element).outlineStyle,
      outlineWidth: getComputedStyle(element).outlineWidth
    }));
    assert.equal(forcedColors.outlineStyle, "solid");
    assert.equal(forcedColors.outlineWidth, "3px");

    await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });
    await page.goto(`${baseUrl}${fixturePath}?state=ready&rail=1`, { waitUntil: "networkidle" });
    const reducedMotion = await page.locator(".live-match-shell").evaluate((element) => ({
      transitionDuration: getComputedStyle(element).transitionDuration
    }));
    assert(["0s", "0.001s"].includes(reducedMotion.transitionDuration));

    assert.equal(consoleMessages.length, 0, `Console warnings/errors: ${consoleMessages.join(" | ")}`);
    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(" | ")}`);
    assert.equal(failedRequests.length, 0, `Failed resources: ${failedRequests.join(" | ")}`);

    const result = { consoleMessages, failedRequests, forcedColors, matrix, pageErrors, reducedMotion };
    writeFileSync(resolve(outputDirectory, "rm03-p1-live-match-shell-browser.json"), JSON.stringify(result, null, 2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
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
