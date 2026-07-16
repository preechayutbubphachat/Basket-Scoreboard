const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdirSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { chromium } = require("playwright");

const repositoryRoot = resolve(__dirname, "..", "..");
const webRoot = resolve(repositoryRoot, "apps", "web");
const viteEntry = resolve(repositoryRoot, "node_modules", "vite", "bin", "vite.js");
const outputDirectory = resolve(repositoryRoot, "output", "playwright");
const port = Number(process.env.RM02_P4_PORT || 4179);
const baseUrl = `http://127.0.0.1:${port}`;
const viewports = [
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1024, height: 576 },
  { width: 960, height: 540 }
];

const finalized = {
  matchId: "final-summary-fixture",
  status: "FINAL",
  homeTeamName: "Bangkok Thunder",
  awayTeamName: "Chiang Mai Falcons",
  homeScore: 88,
  awayScore: 84,
  winnerSide: "HOME",
  winnerDisplayName: "Bangkok Thunder",
  tournamentLabel: "National Invitational",
  roundLabel: "Semi Final",
  venueLabel: "Main Arena",
  courtLabel: "Court 1",
  completedAt: "2026-07-16T12:00:00.000Z"
};

const fixtures = {
  finalized,
  nullable: {
    ...finalized,
    homeScore: 88,
    awayScore: 88,
    winnerSide: null,
    winnerDisplayName: null,
    tournamentLabel: null,
    roundLabel: null,
    venueLabel: null,
    courtLabel: null,
    completedAt: null
  },
  unavailable: {
    matchId: "final-summary-fixture",
    status: "UNAVAILABLE",
    message: "Final summary is not available."
  },
  "long-en": {
    ...finalized,
    homeTeamName: "Bangkok Metropolitan Thunder Basketball Academy Championship Club",
    awayTeamName: "Chiang Mai International Falcons Basketball Development Selection",
    winnerDisplayName: "Bangkok Metropolitan Thunder Basketball Academy Championship Club",
    tournamentLabel: "National Invitational Basketball Championship for Regional Development Academies",
    venueLabel: "Bangkok Metropolitan International Sports and Convention Arena"
  },
  "long-thai": {
    ...finalized,
    homeTeamName: "ทีมบาสเกตบอลเยาวชนกรุงเทพมหานครสายฟ้าชิงแชมป์ประเทศไทย",
    awayTeamName: "สโมสรบาสเกตบอลเยาวชนเชียงใหม่ฟอลคอนส์นานาชาติ",
    winnerDisplayName: "ทีมบาสเกตบอลเยาวชนกรุงเทพมหานครสายฟ้าชิงแชมป์ประเทศไทย",
    tournamentLabel: "การแข่งขันบาสเกตบอลเยาวชนชิงแชมป์แห่งประเทศไทยระดับประเทศ",
    venueLabel: "สนามกีฬานานาชาติกรุงเทพมหานครศูนย์การแข่งขันหลัก"
  }
};

const liveProjection = {
  matchId: "rm02-p4-live-regression",
  homeTeamName: "Bangkok Thunder",
  awayTeamName: "Chiang Mai Falcons",
  homeScore: 88,
  awayScore: 84,
  teamFouls: { home: 4, away: 3 },
  timeouts: { home: { used: 1, remaining: 2 }, away: { used: 2, remaining: 1 } },
  periodType: "REGULATION",
  periodNumber: 4,
  gameClockRemainingMs: 134000,
  shotClockRemainingMs: 14000,
  gameClock: { remainingMs: 134000, running: false, lastStartedAt: null },
  shotClock: { remainingMs: 14000, running: false, lastStartedAt: null },
  status: "LIVE",
  serverTime: "2026-07-16T12:00:00.000Z",
  matchMetadata: { roundLabel: "Semi Final", courtLabel: "Court 1", venueLabel: "Main Arena" },
  recentActions: [],
  displayTheme: {
    tournament: {
      displayName: "National Invitational",
      logoUrl: null,
      showLogo: false,
      backgroundStyle: "DARK_GRADIENT",
      colors: { primaryColor: "#07101d", secondaryColor: "#111827", accentColor: "#facc15", textColor: "#f8fafc" }
    },
    home: {
      displayName: null,
      logoUrl: null,
      showLogo: false,
      colors: { primaryColor: "#b91c1c", secondaryColor: "#180707", accentColor: "#ef4444", textColor: "#f8fafc" }
    },
    away: {
      displayName: null,
      logoUrl: null,
      showLogo: false,
      colors: { primaryColor: "#075985", secondaryColor: "#06131d", accentColor: "#38bdf8", textColor: "#f8fafc" }
    },
    flags: { textOnlyFallback: false, neutralHighContrast: false }
  }
};

const privateKeys = new Set([
  "actor", "role", "device", "session", "token", "csrf", "commandid", "correlationid",
  "causationid", "reason", "internalreason", "audit", "correctionreason", "expectedseq",
  "lasteventseq", "currentseq", "projectionversion", "sourceeventseq", "initializedatseq"
]);

function displayResponse(slug) {
  const publicData = fixtures[slug] || finalized;
  return {
    ok: true,
    data: {
      screen: { screenSlug: slug, displayName: slug === "unavailable" ? "Arena Final" : "National Invitational" },
      activeScene: { sceneType: "FINAL_SUMMARY", publicData, refreshAfterMs: 30000 },
      serverTime: "2026-07-16T12:01:00.000Z"
    }
  };
}

function assertPublicPayload(value, path = "payload") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPublicPayload(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    assert(!privateKeys.has(key.toLowerCase()), `Forbidden private key ${path}.${key}`);
    assertPublicPayload(nested, `${path}.${key}`);
  }
}

async function waitForServer(server) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Vite exited before readiness with code ${server.exitCode}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw lastError || new Error("Timed out waiting for Vite");
}

async function inspect(page, state) {
  return page.evaluate(({ state, privateKeyList }) => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return Object.fromEntries(
        ["x", "y", "width", "height", "top", "right", "bottom", "left"].map((key) => [key, Math.round(bounds[key] * 100) / 100])
      );
    };
    const text = document.body.innerText;
    const exposedPrivateTerms = privateKeyList.filter((key) => {
      if (key === "role") return false;
      return new RegExp(`(^|[^a-z])${key.toLowerCase()}([^a-z]|$)`, "i").test(text.toLowerCase());
    });
    const scores = [...document.querySelectorAll(".public-display-final-score")].map((element) => ({
      rect: (() => {
        const bounds = element.getBoundingClientRect();
        return { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left };
      })(),
      text: element.textContent,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      whiteSpace: getComputedStyle(element).whiteSpace,
      color: getComputedStyle(element).color,
      visibility: getComputedStyle(element).visibility,
      opacity: getComputedStyle(element).opacity
    }));
    const headings = [...document.querySelectorAll("h1, h2")].map((element) => ({
      ...(() => {
        const style = getComputedStyle(element);
        return { overflow: style.overflow, textOverflow: style.textOverflow };
      })(),
      level: Number(element.tagName.slice(1)),
      text: element.textContent,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight
    }));
    return {
      state,
      viewport: [innerWidth, innerHeight],
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientHeight: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight
      },
      frame: rect(".public-display-frame"),
      content: rect(state === "unavailable" ? ".public-display-final-unavailable" : ".public-display-final-card"),
      result: rect(state === "unavailable" ? ".public-display-final-unavailable > strong" : ".public-display-final-scoreboard"),
      metadata: rect(".public-display-final-meta"),
      message: rect(".public-display-final-unavailable > p:not(.eyebrow)"),
      utility: rect(".arena-display-actions"),
      scores,
      headings,
      mainCount: document.querySelectorAll("main").length,
      authenticatedShellCount: document.querySelectorAll(".app-shell, .authenticated-dashboard-shell").length,
      focusableCount: document.querySelectorAll("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])").length,
      activeIntervals: window.__rm02P4ActiveIntervals?.size ?? -1,
      animations: document.getAnimations().length,
      exposedPrivateTerms,
      bodyText: text.replace(/\s+/g, " ").trim(),
      initialStatePresent: Object.prototype.hasOwnProperty.call(window, "__INITIAL_STATE__")
    };
  }, { state, privateKeyList: [...privateKeys] });
}

function assertLayout(measurement) {
  assert.equal(measurement.document.scrollWidth, measurement.document.clientWidth, `${measurement.state} ${measurement.viewport.join("x")} horizontal overflow`);
  assert(measurement.frame && measurement.content, `${measurement.state} frame/content missing`);
  assert(measurement.content.left >= measurement.frame.left - 1, `${measurement.state} content escapes frame left`);
  assert(measurement.content.right <= measurement.frame.right + 1, `${measurement.state} content escapes frame right`);
  assert(measurement.content.top >= measurement.frame.top - 1, `${measurement.state} content escapes frame top`);
  assert(measurement.content.bottom <= measurement.frame.bottom + 1, `${measurement.state} content escapes frame bottom`);
  assert.equal(measurement.mainCount, 1, `${measurement.state} must have one main landmark`);
  assert.equal(measurement.authenticatedShellCount, 0, `${measurement.state} exposed authenticated shell DOM`);
  assert.equal(measurement.focusableCount, 0, `${measurement.state} introduced an unnecessary focus target`);
  assert.equal(measurement.utility, null, `${measurement.state} kiosk scene unexpectedly rendered utility controls`);
  assert.equal(measurement.exposedPrivateTerms.length, 0, `${measurement.state} exposed private DOM terms: ${measurement.exposedPrivateTerms.join(", ")}`);
  assert.equal(measurement.initialStatePresent, false, `${measurement.state} serialized page state unexpectedly exists`);
}

async function openFinalState(page, slug, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}/public/display/${slug}`, { waitUntil: "networkidle" });
  await page.waitForSelector(slug === "unavailable" ? ".public-display-final-unavailable" : ".public-display-final-card");
  await page.evaluate(() => new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint))));
  return inspect(page, slug);
}

async function main() {
  mkdirSync(outputDirectory, { recursive: true });
  Object.values(fixtures).forEach((fixture) => assertPublicPayload(fixture));

  const server = spawn(process.execPath, [viteEntry, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: webRoot,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  const serverErrors = [];
  server.stderr.on("data", (chunk) => serverErrors.push(String(chunk)));

  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await context.addInitScript(() => {
      const nativeSetInterval = window.setInterval.bind(window);
      const nativeClearInterval = window.clearInterval.bind(window);
      const active = new Set();
      window.__rm02P4ActiveIntervals = active;
      window.setInterval = (...args) => {
        const id = nativeSetInterval(...args);
        active.add(id);
        return id;
      };
      window.clearInterval = (id) => {
        active.delete(id);
        return nativeClearInterval(id);
      };
    });

    const mockedPayloads = [];
    await context.route("**/api/v1/public/display/**", async (route) => {
      const slug = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1));
      const payload = slug === "live-regression"
        ? {
            ok: true,
            data: {
              screen: { screenSlug: slug, displayName: "National Invitational" },
              activeScene: { sceneType: "LIVE_SCOREBOARD", publicData: { matchId: liveProjection.matchId }, refreshAfterMs: 30000 },
              serverTime: "2026-07-16T12:01:00.000Z"
            }
          }
        : displayResponse(slug);
      mockedPayloads.push(payload);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
    });
    await context.route("**/api/v1/public/matches/**/scoreboard", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(liveProjection) })
    );
    await context.route("**/socket.io/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === "POST") {
        await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
        return;
      }
      const body = url.searchParams.has("sid")
        ? "40"
        : '0{"sid":"rm02-p4-fixture","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}';
      await route.fulfill({ status: 200, contentType: "text/plain", body });
    });

    const page = await context.newPage();
    const requests = [];
    const consoleMessages = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") consoleMessages.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "failed"}`));

    const matrix = [];
    for (const viewport of viewports) {
      const finalizedMeasurement = await openFinalState(page, "finalized", viewport);
      assertLayout(finalizedMeasurement);
      assert.match(finalizedMeasurement.bodyText, /Bangkok Thunder/);
      assert.match(finalizedMeasurement.bodyText, /Chiang Mai Falcons/);
      assert.match(finalizedMeasurement.bodyText, /Bangkok Thunder wins/);
      assert.match(finalizedMeasurement.bodyText, /National Invitational/);
      assert.match(finalizedMeasurement.bodyText, /Semi Final/i);
      assert.match(finalizedMeasurement.bodyText, /Main Arena \/ Court 1/);
      assert.equal(finalizedMeasurement.scores.map((score) => score.text).join("-"), "88-84");
      finalizedMeasurement.scores.forEach((score) => {
        assert(score.scrollWidth <= score.clientWidth + 1, `${viewport.width}x${viewport.height} score clipped`);
        assert.equal(score.whiteSpace, "nowrap");
        assert.equal(score.color, "rgb(248, 250, 252)");
      });
      assert(finalizedMeasurement.metadata, `${viewport.width}x${viewport.height} finalized metadata missing`);
      assert.equal(finalizedMeasurement.activeIntervals, 1, `${viewport.width}x${viewport.height} unexpected FINAL_SUMMARY polling owners`);
      if ([1920, 1024, 960].includes(viewport.width)) {
        await page.screenshot({ path: resolve(outputDirectory, `rm02-p4-finalized-${viewport.width}x${viewport.height}.png`) });
      }
      matrix.push(finalizedMeasurement);

      const unavailableMeasurement = await openFinalState(page, "unavailable", viewport);
      assertLayout(unavailableMeasurement);
      assert.match(unavailableMeasurement.bodyText, /Final Result/i);
      assert.match(unavailableMeasurement.bodyText, /Result not available/i);
      assert.match(unavailableMeasurement.bodyText, /Final summary is not available\./);
      assert.equal(unavailableMeasurement.scores.length, 0);
      assert(!/Bangkok Thunder wins|88|84|internal reason/i.test(unavailableMeasurement.bodyText));
      assert(unavailableMeasurement.message, `${viewport.width}x${viewport.height} unavailable message missing`);
      assert.equal(unavailableMeasurement.activeIntervals, 1, `${viewport.width}x${viewport.height} unexpected unavailable polling owners`);
      if ([1920, 1024, 960].includes(viewport.width)) {
        await page.screenshot({ path: resolve(outputDirectory, `rm02-p4-unavailable-${viewport.width}x${viewport.height}.png`) });
      }
      matrix.push(unavailableMeasurement);
    }

    const nullableMeasurement = await openFinalState(page, "nullable", { width: 1024, height: 576 });
    assertLayout(nullableMeasurement);
    assert.match(nullableMeasurement.bodyText, /Tied game/);
    assert(!/null|undefined|Venue TBD|Time TBD| wins/i.test(nullableMeasurement.bodyText));
    assert.equal(nullableMeasurement.metadata, null);

    const longText = [];
    for (const slug of ["long-en", "long-thai"]) {
      const measurement = await openFinalState(page, slug, { width: 960, height: 540 });
      assertLayout(measurement);
      await page.screenshot({ path: resolve(outputDirectory, `rm02-p4-${slug}-960x540.png`) });
      measurement.scores.forEach((score) => assert(score.scrollWidth <= score.clientWidth + 1, `${slug} score clipped`));
      measurement.scores.forEach((score) => {
        assert(score.rect.top >= measurement.content.top && score.rect.bottom <= measurement.content.bottom, `${slug} score escapes content frame`);
        assert.equal(score.visibility, "visible");
        assert.notEqual(score.opacity, "0");
      });
      measurement.headings.forEach((heading) => {
        const fits = heading.scrollWidth <= heading.clientWidth + 1;
        const safelyTruncated = heading.overflow === "hidden";
        assert(fits || safelyTruncated, `${slug} heading escapes without safe truncation: ${heading.text}`);
      });
      longText.push(measurement);
    }

    await page.emulateMedia({ forcedColors: "active" });
    const forcedColorsFinalized = await openFinalState(page, "finalized", { width: 1024, height: 576 });
    const forcedColorsUnavailable = await openFinalState(page, "unavailable", { width: 1024, height: 576 });
    assertLayout(forcedColorsFinalized);
    assertLayout(forcedColorsUnavailable);
    await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });
    const reducedMotionFinalized = await openFinalState(page, "finalized", { width: 1024, height: 576 });
    const reducedMotionUnavailable = await openFinalState(page, "unavailable", { width: 1024, height: 576 });
    assert.equal(reducedMotionFinalized.animations, 0);
    assert.equal(reducedMotionUnavailable.animations, 0);
    await page.emulateMedia({ reducedMotion: "no-preference" });

    const requestsBeforeLiveRegression = requests.length;
    const failedRequestsBeforeLiveRegression = failedRequests.length;
    const liveRegression = [];
    for (const viewport of [
      { width: 1672, height: 941 },
      { width: 1024, height: 576 },
      { width: 960, height: 540 }
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`${baseUrl}/public/display/live-regression`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".arena-scoreboard-grid");
      const measurement = await page.evaluate(() => ({
        viewport: [innerWidth, innerHeight],
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scoreTexts: [...document.querySelectorAll(".public-display-score-value")].map((element) => element.textContent),
        scoreColors: [...document.querySelectorAll(".public-display-score-value")].map((element) => getComputedStyle(element).color),
        gameClockColor: getComputedStyle(document.querySelector(".public-display-game-clock strong")).color,
        shotClockColor: getComputedStyle(document.querySelector(".public-display-shot-clock strong")).color,
        metadataText: document.querySelector(".arena-match-metadata")?.textContent || "",
        tickerText: document.querySelector(".recent-event-ticker")?.textContent || "",
        utilityLabels: [...document.querySelectorAll(".arena-display-actions a, .arena-display-actions button")].map((element) => element.textContent),
        focusRulePresent: [...document.styleSheets].some((sheet) => {
          try {
            return [...sheet.cssRules].some((rule) => rule.cssText.includes("public-display-control:focus-visible") && rule.cssText.includes("3px"));
          } catch {
            return false;
          }
        })
      }));
      assert.equal(measurement.scrollWidth, measurement.clientWidth);
      assert.deepEqual(measurement.scoreTexts, ["88", "84"]);
      assert.deepEqual(measurement.scoreColors, ["rgb(248, 250, 252)", "rgb(248, 250, 252)"]);
      assert.equal(measurement.gameClockColor, "rgb(103, 232, 249)");
      assert.equal(measurement.shotClockColor, "rgb(239, 68, 68)");
      assert.match(measurement.metadataText, /Semi Final/);
      assert.match(measurement.tickerText, /No public play updates available\./);
      assert.deepEqual(measurement.utilityLabels, ["Normal", "Refresh", "Fullscreen"]);
      assert.equal(measurement.focusRulePresent, true);
      liveRegression.push(measurement);
    }

    await page.goto(`${baseUrl}/public/display/finalized`, { waitUntil: "networkidle" });
    await page.waitForSelector(".public-display-final-card");
    assert.equal(await page.locator(".recent-event-ticker").count(), 0);
    assert.equal(await page.locator(".arena-scoreboard-grid").count(), 0);
    assert.equal(await page.locator(".arena-match-metadata").count(), 0);
    await page.evaluate(() => {
      history.pushState({}, "", "/public/display/unavailable");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await page.waitForSelector(".public-display-final-unavailable");
    assert.equal(await page.locator(".public-display-final-score").count(), 0);
    assert.equal(await page.getByText("Bangkok Thunder wins").count(), 0);
    assert.equal(await page.locator(".public-display-final-meta").count(), 0);

    mockedPayloads.forEach((payload) => assertPublicPayload(payload));
    const authRequests = requests.filter((request) => new URL(request.url).pathname.includes("/api/v1/auth/"));
    const protectedWrites = requests
      .slice(0, requestsBeforeLiveRegression)
      .filter((request) => ["POST", "PUT", "PATCH", "DELETE"].includes(request.method));
    const finalSummarySocketRequests = requests
      .slice(0, requestsBeforeLiveRegression)
      .filter((request) => new URL(request.url).pathname.includes("/socket.io"));
    assert.equal(authRequests.length, 0, "Public FINAL_SUMMARY requested authentication");
    assert.equal(protectedWrites.length, 0, "Public FINAL_SUMMARY generated a protected write");
    assert.equal(finalSummarySocketRequests.length, 0, "FINAL_SUMMARY created a socket connection");
    assert.equal(consoleMessages.length, 0, `Console warnings/errors: ${consoleMessages.join(" | ")}`);
    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(" | ")}`);
    assert.equal(failedRequestsBeforeLiveRegression, 0, "FINAL_SUMMARY had a failed resource");
    const unexpectedFailedRequests = failedRequests.filter(
      (entry) => !entry.includes("/socket.io/") || !entry.includes("net::ERR_ABORTED")
    );
    assert.equal(unexpectedFailedRequests.length, 0, `Unexpected failed resources: ${unexpectedFailedRequests.join(" | ")}`);

    const result = {
      browserVersion: browser.version(),
      fixtureMechanism: "Playwright route interception for GET /api/v1/public/display/:screenSlug",
      matrix,
      nullable: nullableMeasurement,
      longText,
      forcedColors: { finalized: forcedColorsFinalized, unavailable: forcedColorsUnavailable },
      reducedMotion: { finalized: reducedMotionFinalized, unavailable: reducedMotionUnavailable },
      liveRegression,
      mockedPayloadCount: mockedPayloads.length,
      authRequests: authRequests.length,
      protectedWrites: protectedWrites.length,
      finalSummarySocketRequests: finalSummarySocketRequests.length,
      consoleMessages,
      pageErrors,
      failedRequests,
      expectedLiveSocketNavigationAborts: failedRequests.length - unexpectedFailedRequests.length,
      requestCount: requests.length
    };
    writeFileSync(resolve(outputDirectory, "rm02-p4-final-summary-browser.json"), JSON.stringify(result, null, 2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    if (browser) await browser.close();
    server.kill();
    if (serverErrors.length > 0 && server.exitCode && server.exitCode !== 0) {
      process.stderr.write(serverErrors.join(""));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
