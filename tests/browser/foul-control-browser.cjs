const assert = require("node:assert/strict");
const http = require("node:http");
const { resolve } = require("node:path");
const { chromium } = require("playwright");
const { Server: SocketServer } = require("socket.io");

const repositoryRoot = resolve(__dirname, "..", "..");
const port = Number(process.env.RM06_BROWSER_PORT || 4188);
const baseUrl = `http://127.0.0.1:${port}`;
const fixturePath = "/tests/browser/foul-control-fixture.html";
const viewports = [
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1536, height: 1024 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1024, height: 576 }
];
const zoomPercents = [125, 150, 200];
const failClosedStates = ["loading", "error", "denied", "malformed", "mismatch", "finished", "final"];
const rosterStates = ["home-empty", "away-empty", "both-empty", "large-roster", "long-names"];

const unexpectedConsoleMessages = [];
const unexpectedPageErrors = [];
const unexpectedFailedRequests = [];
const unexpectedHttpFailures = [];
const expectedFailedRequests = [];
const expectedHttpFailures = [];

function isExpectedHttpFailure(response) {
  const url = new URL(response.url());
  return response.status() === 503 && (
    url.pathname.endsWith("/projection") ||
    url.pathname.endsWith("/rosters") ||
    url.pathname.endsWith("/effective-access") ||
    url.pathname.endsWith("/sync")
  );
}

function attachRuntimeGuards(page) {
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      unexpectedConsoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => unexpectedPageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const entry = `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`;
    if (request.url().includes("/socket.io/") || request.url().endsWith("/__fixture/socket-drop")) expectedFailedRequests.push(entry);
    else unexpectedFailedRequests.push(entry);
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const entry = `${response.status()} ${response.request().method()} ${response.url()}`;
    if (isExpectedHttpFailure(response)) expectedHttpFailures.push(entry);
    else unexpectedHttpFailures.push(entry);
  });
}

async function openFixture(page, state = "ready", extra = "") {
  if (page.url().startsWith(baseUrl)) {
    await page.evaluate(() => window.sessionStorage.clear());
  }
  const query = new URLSearchParams({ state });
  if (extra) {
    for (const [key, value] of new URLSearchParams(extra)) query.set(key, value);
  }
  await page.goto(`${baseUrl}${fixturePath}?${query}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Foul Control", exact: true }).waitFor();
  if (state !== "loading") {
    await page.waitForFunction(() => !document.body.innerText.includes("Loading match state..."));
  }
}

async function measureMountedLayout(page, viewport, state = "ready") {
  await page.setViewportSize(viewport);
  await openFixture(page, state);
  const hasCommandSurface = ["ready", "large-roster", "long-names"].includes(state);
  if (hasCommandSurface) await page.getByRole("heading", { name: "Player Fouls" }).waitFor();
  const measurements = await page.evaluate(() => {
    const playerButtons = [...document.querySelectorAll(".score-button")];
    const rects = playerButtons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    });
    const overlaps = [];
    for (let first = 0; first < rects.length; first += 1) {
      for (let second = first + 1; second < rects.length; second += 1) {
        if (
          rects[first].left < rects[second].right - 1 &&
          rects[first].right > rects[second].left + 1 &&
          rects[first].top < rects[second].bottom - 1 &&
          rects[first].bottom > rects[second].top + 1
        ) overlaps.push([first, second]);
      }
    }
    const contentFits = (element) => {
      const container = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const content = range.getBoundingClientRect();
      return content.left >= container.left - 1 && content.right <= container.right + 1 &&
        content.top >= container.top - 1 && content.bottom <= container.bottom + 1;
    };
    const playerLabelsBounded = playerButtons.every((button) =>
      button.scrollWidth <= button.clientWidth + 1 &&
      button.scrollHeight <= button.clientHeight + 1 &&
      contentFits(button)
    );
    const teamHeadings = [...document.querySelectorAll(".score-actions h2,.score-actions h3")];
    return {
      controlSizes: rects.map(({ width, height }) => ({ width, height })),
      controlsReachable: rects.length > 0 && rects.every((rect) => rect.width > 0 && rect.height >= 44),
      criticalOverlaps: overlaps,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      headingsBounded: [...document.querySelectorAll("h1,h2,h3")].every((heading) => {
        const rect = heading.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= document.documentElement.clientWidth + 1 && contentFits(heading);
      }),
      playerLabelsBounded,
      playerButtonCount: playerButtons.length,
      sideHeadings: [...document.querySelectorAll(".score-actions h3")].map((heading) => heading.textContent?.trim()),
      teamLabelsBounded: teamHeadings.every((heading) => contentFits(heading))
    };
  });
  assert.equal(
    measurements.documentScrollWidth <= measurements.documentClientWidth + 1,
    true,
    `${viewport.width}x${viewport.height} ${state} has document horizontal overflow`
  );
  if (hasCommandSurface) {
    assert.equal(
      measurements.controlsReachable,
      true,
      `${viewport.width} controls are not reachable: ${JSON.stringify(measurements.controlSizes)}`
    );
    assert.deepEqual(measurements.criticalOverlaps, [], `${viewport.width} player controls overlap`);
    assert.equal(measurements.headingsBounded, true, `${viewport.width} headings are clipped`);
    assert.equal(measurements.playerLabelsBounded, true, `${viewport.width} ${state} player labels are clipped`);
    assert.equal(measurements.teamLabelsBounded, true, `${viewport.width} ${state} team labels are clipped`);
    assert.equal(measurements.sideHeadings.filter(Boolean).length, 2);
  }
  return { state, viewport, ...measurements };
}

async function verifyZoomWorkflowReachability(page, percent, viewport) {
  await page.setViewportSize(viewport);
  await openFixture(page);
  await page.getByRole("button", { name: /^Select HOME #01\b/ }).click();
  const review = page.getByRole("heading", { name: "Review personal foul" }).locator("..");
  await review.waitFor();
  const reviewReachable = await review.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 &&
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
  });
  assert.equal(reviewReachable, true, `${percent}% review state is not reachable`);
  await page.getByRole("button", { name: "Cancel review" }).click();

  await openFixture(page, "ready", "command=network-ambiguous");
  await selectAndConfirm(page, "HOME", 1);
  const retry = page.getByRole("button", { name: "Retry exact foul envelope" });
  const discard = page.getByRole("button", { name: "Discard active foul" });
  await retry.waitFor();
  const queueControlEvidence = await page.getByRole("button", {
    name: /Retry exact foul envelope|Discard active foul|Discard all foul intents/
  }).evaluateAll((buttons) => ({
    count: buttons.length,
    controls: buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { height: rect.height, label: button.textContent?.trim(), width: rect.width };
    })
  }));
  const queueControlsReachable = queueControlEvidence.count === 3 && queueControlEvidence.controls.every((control) => {
    const rect = control;
    return rect.width > 0 && rect.height > 0;
  }) && await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  assert.equal(queueControlsReachable, true, `${percent}% queue-resolution controls are not reachable: ${JSON.stringify(queueControlEvidence)}`);
  assert.equal(await page.getByRole("link", { name: "Corrections", exact: true }).count(), 0);
  await page.getByRole("link", { name: "Basketball Scoreboard" }).click();
  assert.equal(new URL(page.url()).pathname, "/operator/matches/fixture-match/fouls");
  await discard.click();
  const correction = page.getByRole("link", { name: "Corrections", exact: true });
  await correction.waitFor();
  const correctionReachable = await correction.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 &&
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
  });
  assert.equal(correctionReachable, true, `${percent}% correction navigation is not reachable after safe resolution`);
  return { percent, viewport, reviewReachable, queueControlEvidence, queueControlsReachable, correctionReachable, navigationLocked: true };
}

async function selectAndConfirm(page, teamSide, index) {
  const number = String(index).padStart(2, "0");
  await page.getByRole("button", { name: new RegExp(`^Select ${teamSide} #${number}\\b`) }).click();
  await page.getByRole("heading", { name: "Review personal foul" }).waitFor();
  await page.getByRole("button", { name: "Confirm personal foul" }).click();
}

async function verifyMountedFailClosedStates(page, viewport) {
  const evidence = [];
  for (const state of failClosedStates) {
    await page.setViewportSize(viewport);
    await openFixture(page, state);
    const result = await page.evaluate(() => {
      const commandButtons = [...document.querySelectorAll(".score-button")];
      return {
        actionableButtons: commandButtons.filter((button) => !button.disabled).length,
        commandButtons: commandButtons.length,
        confirmButtons: [...document.querySelectorAll("button")].filter((button) =>
          button.textContent?.includes("Confirm personal foul") && !button.disabled
        ).length,
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        text: document.body.innerText
      };
    });
    assert.equal(result.noHorizontalOverflow, true, `${state} overflowed`);
    assert.equal(result.actionableButtons, 0, `${state} exposed actionable foul buttons`);
    assert.equal(result.confirmButtons, 0, `${state} exposed an actionable confirmation`);
    if (state === "finished" || state === "final") {
      assert(result.commandButtons > 0, `${state} did not preserve read-only roster context`);
      assert(result.text.includes("Match is finished. Use correction workflow for post-game edits."));
    }
    evidence.push({ state, ...result });
  }
  return evidence;
}

async function verifyMountedRosterVariants(page, viewport) {
  const evidence = [];
  for (const state of rosterStates) {
    await page.setViewportSize(viewport);
    await openFixture(page, state);
    await page.getByRole("heading", { name: "Player Fouls" }).waitFor();
    const result = await page.evaluate(() => ({
      buttons: document.querySelectorAll(".score-button").length,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      sideIdentity: [...document.querySelectorAll(".score-actions h2,.score-actions h3")].map((heading) => heading.textContent?.trim()),
      text: document.body.innerText
    }));
    assert.equal(result.noHorizontalOverflow, true, `${state} overflowed`);
    assert(result.sideIdentity.some((label) => label?.length));
    if (state === "home-empty" || state === "away-empty") {
      assert.equal(result.buttons, 4);
      assert(result.text.includes("No players assigned."));
    }
    if (state === "both-empty") {
      assert.equal(result.buttons, 0);
      assert(result.text.includes("No active roster players are available"));
    }
    if (state === "large-roster") assert.equal(result.buttons, 36);
    if (state === "long-names") {
      assert.equal(result.buttons, 8);
      assert(result.text.includes("International Youth Academy"));
      assert(result.text.includes("ภาษาไทย"));
    }
    evidence.push({ state, ...result });
  }
  return evidence;
}

async function verifyMountedQueueLifecycle(page, viewport) {
  await page.setViewportSize(viewport);
  await openFixture(page);
  await page.evaluate(() => {
    window.__observedFoulLifecycles = [];
    const capture = () => {
      const text = document.querySelector("#foul-queue-status")?.parentElement?.textContent?.trim();
      if (text) window.__observedFoulLifecycles.push(text);
    };
    new MutationObserver(capture).observe(document.body, { childList: true, subtree: true, characterData: true });
    capture();
  });

  await page.getByRole("button", { name: /^Select HOME #01\b/ }).click();
  await page.getByRole("heading", { name: "Review personal foul" }).waitFor();
  await page.getByRole("button", { name: "Cancel review" }).click();
  assert.equal((await page.evaluate(() => window.__foulFixture.getSnapshot().commandAttempts)), 0);

  await page.evaluate(() => window.__foulFixture.setAuthorityDelay(1200));
  await selectAndConfirm(page, "HOME", 1);
  await page.getByText("Corrections are blocked while foul intents are unresolved.").waitFor();
  assert.equal(await page.getByRole("link", { name: "Corrections", exact: true }).count(), 0);
  await page.getByRole("link", { name: "Basketball Scoreboard" }).click();
  assert.equal(new URL(page.url()).pathname, "/operator/matches/fixture-match/fouls");
  await page.evaluate(() => window.__foulFixture.setAuthorityDelay(0));

  await selectAndConfirm(page, "HOME", 2);
  await selectAndConfirm(page, "AWAY", 1);
  await selectAndConfirm(page, "AWAY", 2);
  await page.waitForFunction(() => {
    const snapshot = window.__foulFixture.getSnapshot();
    return snapshot.commandAttempts === 4 && Boolean(document.querySelector('.live-match-shell__navigation a[href$="/corrections"]'));
  });

  const snapshot = await page.evaluate(() => window.__foulFixture.getSnapshot());
  const lifecycles = await page.evaluate(() => window.__observedFoulLifecycles);
  assert.equal(snapshot.maxConcurrentCommands, 1);
  assert.deepEqual(snapshot.commandBodies.map((body) => body.payload.playerId), [
    "home-player-1", "home-player-2", "away-player-1", "away-player-2"
  ]);
  assert.deepEqual(snapshot.commandBodies.map((body) => body.expectedSeq), [40, 41, 42, 43]);
  for (const body of snapshot.commandBodies) {
    assert.deepEqual(Object.keys(body.payload).sort(), ["foulType", "playerId", "reason", "teamSide"]);
    assert.equal(body.payload.foulType, "PERSONAL");
    assert.equal("teamFouls" in body.payload, false);
    assert.equal("playerFouls" in body.payload, false);
  }
  assert.deepEqual(snapshot.projection.teamFouls, { home: 5, away: 4 });
  assert(lifecycles.some((entry) => entry.includes("REVALIDATING") || entry.includes("READY_TO_DISPATCH")));
  assert(lifecycles.some((entry) => entry.includes("RECONCILING")));
  assert.equal(await page.getByRole("link", { name: "Corrections", exact: true }).count(), 1);
  return { lifecycles, maxConcurrentCommands: snapshot.maxConcurrentCommands, order: snapshot.commandBodies.map((body) => body.payload.playerId) };
}

async function verifyMountedAmbiguousRetry(page, viewport) {
  await page.setViewportSize(viewport);
  await openFixture(page, "ready", "command=network-ambiguous");
  await selectAndConfirm(page, "HOME", 1);
  const retry = page.getByRole("button", { name: "Retry exact foul envelope" });
  await retry.waitFor();
  const beforeRetry = await page.evaluate(() => window.__foulFixture.getSnapshot());
  await page.waitForTimeout(500);
  assert.equal((await page.evaluate(() => window.__foulFixture.getSnapshot().commandAttempts)), 1, "ambiguous outcome auto-retried");
  assert.equal(await page.getByRole("link", { name: "Corrections", exact: true }).count(), 0);
  await retry.click();
  await page.waitForFunction(() => {
    const snapshot = window.__foulFixture.getSnapshot();
    return snapshot.commandAttempts === 2 && Boolean(document.querySelector('.live-match-shell__navigation a[href$="/corrections"]'));
  });
  const afterRetry = await page.evaluate(() => window.__foulFixture.getSnapshot());
  assert.deepEqual(afterRetry.commandBodies[1], beforeRetry.commandBodies[0]);
  assert.equal(afterRetry.projection.teamFouls.home, 4);
  return { attempts: afterRetry.commandAttempts, exactEnvelope: true, noAutoRetry: true };
}

async function verifyPauseMode(page, commandMode, expectedText) {
  await openFixture(page, "ready", `command=${commandMode}`);
  await selectAndConfirm(page, "HOME", 1);
  const discardActive = page.getByRole("button", { name: "Discard active foul" });
  await discardActive.waitFor();
  if (expectedText) await page.getByText(expectedText, { exact: false }).first().waitFor();
  await page.waitForFunction(() =>
    document.querySelector("#foul-queue-status")?.parentElement?.textContent?.includes("PAUSED")
  );
  const queueText = await page.locator("#foul-queue-status").locator("..").innerText();
  assert(queueText.includes("PAUSED"), `${commandMode} did not enter a paused recovery state`);
  const attempts = await page.evaluate(() => window.__foulFixture.getSnapshot().commandAttempts);
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() => window.__foulFixture.getSnapshot().commandAttempts), attempts);
  assert.equal(await page.getByRole("link", { name: "Corrections", exact: true }).count(), 0);
  await discardActive.click();
  await page.getByRole("link", { name: "Corrections", exact: true }).waitFor();
  return { commandMode, attempts, noAutoReplay: true, discarded: true };
}

async function verifyMountedReconnectSafety(page, viewport) {
  await page.setViewportSize(viewport);
  await openFixture(page, "ready", "command=network-ambiguous");
  await page.getByText("Realtime connected", { exact: false }).first().waitFor();
  await selectAndConfirm(page, "HOME", 1);
  await page.getByRole("button", { name: "Retry exact foul envelope" }).waitFor();
  await page.evaluate(() => {
    window.__foulFixture.setProjectionStatus("FINISHED");
    window.__foulFixture.setRosterVariant("home-empty");
    window.__foulFixture.setAccessMode("readonly");
  });
  await page.evaluate(async () => {
    await fetch("/__fixture/socket-drop", { method: "POST" });
  });
  await page.getByText("Connection changed. Explicit review is required", { exact: false }).waitFor();
  await page.waitForFunction(() =>
    document.body.innerText.includes("FINISHED") &&
    document.body.innerText.includes("No players assigned.")
  );
  await page.waitForTimeout(500);
  const snapshot = await page.evaluate(() => window.__foulFixture.getSnapshot());
  assert.equal(snapshot.commandAttempts, 1, "reconnect replayed the ambiguous foul");
  assert.equal(await page.getByRole("link", { name: "Corrections", exact: true }).count(), 0);
  return {
    authoritativeAccessRefreshed: true,
    authoritativeProjectionRefreshed: snapshot.projection.status === "FINISHED",
    authoritativeRosterRefreshed: true,
    noAutoReplay: true
  };
}

async function verifyMountedCorrectionNavigation(page, viewport) {
  await page.setViewportSize(viewport);
  await openFixture(page, "ready", "command=sync-required");
  await page.evaluate(() => window.__foulFixture.setAuthorityDelay(1200));
  await selectAndConfirm(page, "HOME", 1);
  await selectAndConfirm(page, "AWAY", 1);
  await page.getByText("Authoritative state changed", { exact: false }).first().waitFor();
  await page.getByRole("button", { name: "Discard active foul" }).click();
  const resumeWaiting = page.getByRole("button", { name: "Review and resume waiting fouls" });
  await resumeWaiting.waitFor();
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() => window.__foulFixture.getSnapshot().commandAttempts), 1, "waiting intent auto-drained");
  await page.evaluate(() => {
    window.__foulFixture.setAuthorityDelay(0);
    window.__foulFixture.setCommandMode("accepted");
  });
  await resumeWaiting.click();
  await page.waitForFunction(() => {
    const snapshot = window.__foulFixture.getSnapshot();
    return snapshot.commandAttempts === 2 && Boolean(document.querySelector('.live-match-shell__navigation a[href$="/corrections"]'));
  });
  const waitingReview = { noAutoDrain: true, explicitResume: true };

  const pauseEvidence = [
    await verifyPauseMode(page, "sync-required", "Authoritative state changed"),
    await verifyPauseMode(page, "rejected", "The foul was rejected"),
    await verifyPauseMode(page, "accepted-refresh-fail", null)
  ];

  await openFixture(page);
  await page.evaluate(() => window.__foulFixture.setPersistenceBlocked(true));
  await selectAndConfirm(page, "HOME", 1);
  await page.getByText("Unable to preserve the unresolved foul safely. No action was sent.").first().waitFor();
  assert.equal(await page.evaluate(() => window.__foulFixture.getSnapshot().commandAttempts), 0);
  assert.equal(await page.getByRole("link", { name: "Corrections", exact: true }).count(), 1);

  await openFixture(page);
  await page.evaluate(() => window.__foulFixture.setAuthorityDelay(700));
  await page.getByRole("button", { name: /^Select HOME #01\b/ }).click();
  await page.getByRole("button", { name: "Confirm personal foul" }).click();
  await page.evaluate(() => window.__foulFixture.setAccessMode("readonly"));
  await page.getByText(/Foul access (changed|is no longer available)/).first().waitFor();
  assert.equal(await page.evaluate(() => window.__foulFixture.getSnapshot().commandAttempts), 0);
  const statusFocused = await page.getByText("Foul operation permission is required.").evaluate((element) =>
    element.closest(".panel")?.contains(document.activeElement) ?? false
  );
  if (!statusFocused) await page.keyboard.press("Tab");
  const focusRecovered = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return false;
    const style = getComputedStyle(active);
    return style.outlineStyle !== "none" && style.outlineWidth !== "0px";
  });
  assert.equal(focusRecovered, true, "focus was not recoverable after foul access loss");
  return { pauseEvidence, persistenceBlocked: true, accessLost: true, statusFocused, focusRecovered, waitingReview };
}

async function verifyMountedProjectionAuthority(page, viewport) {
  await page.setViewportSize(viewport);
  await openFixture(page);
  const before = await page.evaluate(() => window.__foulFixture.getSnapshot().projection);
  await selectAndConfirm(page, "HOME", 1);
  await page.getByText("Saving...", { exact: true }).first().waitFor();
  const pending = await page.getByText("Saving...", { exact: true }).count();
  const whilePending = await page.evaluate(() => {
    const label = [...document.querySelectorAll(".foul-count")].find((node) => node.textContent?.includes("HOME team fouls"));
    return label?.querySelector("strong")?.textContent;
  });
  assert.equal(whilePending, String(before.teamFouls.home), "client mutated the foul count before acceptance");
  await page.waitForFunction((expected) => {
    const label = [...document.querySelectorAll(".foul-count")].find((node) => node.textContent?.includes("HOME team fouls"));
    return label?.querySelector("strong")?.textContent === String(expected);
  }, before.teamFouls.home + 1);
  await page.getByText(`Foul added. Current seq ${before.currentSeq + 1}.`, { exact: true }).first().waitFor();
  const after = await page.evaluate(() => window.__foulFixture.getSnapshot());
  assert.equal(after.projection.teamFouls.home, before.teamFouls.home + 1);
  assert.equal(after.projection.currentSeq, before.currentSeq + 1);
  assert.equal(after.commandBodies[0].payload.foulType, "PERSONAL");
  return { before: before.teamFouls.home, after: after.projection.teamFouls.home, pendingVisible: pending > 0 };
}

async function verifyKeyboardAndMedia(page, viewport) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openFixture(page);
  const firstHome = page.getByRole("button", { name: /^Select HOME #01\b/ });
  await firstHome.focus();
  const focus = await firstHome.evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      forcedColors: matchMedia("(forced-colors: active)").matches,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches
    };
  });
  assert.equal(focus.forcedColors, true);
  assert.equal(focus.reducedMotion, true);
  assert.notEqual(focus.outlineStyle, "none");
  assert.notEqual(focus.outlineWidth, "0px");

  await firstHome.press("Enter");
  await page.getByRole("heading", { name: "Review personal foul" }).waitFor();
  const reviewText = await page.getByRole("heading", { name: "Review personal foul" }).locator("..").innerText();
  assert(reviewText.includes("HOME / Bangkok Thunder"));
  assert(reviewText.includes("PERSONAL"));
  await page.getByRole("button", { name: "Cancel review" }).focus();
  await page.keyboard.press("Enter");

  const order = await page.locator(".score-button").evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim())
  );
  assert(order.slice(0, 4).every((label) => label?.startsWith("Select HOME")));
  assert(order.slice(4).every((label) => label?.startsWith("Select AWAY")));

  await openFixture(page, "ready", "command=network-ambiguous");
  const keyboardPlayer = page.getByRole("button", { name: /^Select HOME #01\b/ });
  await keyboardPlayer.focus();
  await keyboardPlayer.press("Enter");
  const confirm = page.getByRole("button", { name: "Confirm personal foul" });
  await confirm.focus();
  await confirm.press("Enter");
  const retry = page.getByRole("button", { name: "Retry exact foul envelope" });
  await retry.waitFor();
  await retry.focus();
  await page.keyboard.press("Tab");
  const firstPausedTab = await page.evaluate(() => document.activeElement?.textContent?.trim());
  assert.equal(firstPausedTab, "Discard active foul");
  await page.keyboard.press("Tab");
  const secondPausedTab = await page.evaluate(() => document.activeElement?.textContent?.trim());
  assert.equal(secondPausedTab, "Discard all foul intents");
  const brand = page.getByRole("link", { name: "Basketball Scoreboard" });
  await brand.focus();
  await brand.press("Enter");
  assert.equal(new URL(page.url()).pathname, "/operator/matches/fixture-match/fouls");
  const discard = page.getByRole("button", { name: "Discard active foul" });
  await discard.focus();
  const pausedFocusVisible = await discard.evaluate((button) => {
    const style = getComputedStyle(button);
    return style.outlineStyle !== "none" && style.outlineWidth !== "0px";
  });
  assert.equal(pausedFocusVisible, true);
  await discard.press("Enter");
  const correction = page.getByRole("link", { name: "Corrections", exact: true });
  await correction.waitFor();
  await correction.focus();
  const correctionFocusVisible = await correction.evaluate((link) => {
    const style = getComputedStyle(link);
    return style.outlineStyle !== "none" && style.outlineWidth !== "0px";
  });
  assert.equal(correctionFocusVisible, true);
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  return {
    focus,
    keyboardOrder: order,
    nonColorReviewCues: true,
    pausedQueueTabOrder: [firstPausedTab, secondPausedTab],
    pausedFocusVisible,
    correctionFocusVisible,
    navigationLockedByKeyboard: true
  };
}

async function createMountedServer() {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root: repositoryRoot,
    appType: "spa",
    logLevel: "error",
    server: { middlewareMode: true }
  });
  let io;
  const server = http.createServer((request, response) => {
    if (request.url === "/__fixture/socket-drop" && request.method === "POST") {
      for (const socket of io.sockets.sockets.values()) socket.conn.close();
      response.writeHead(204);
      response.end();
      return;
    }
    vite.middlewares(request, response, () => {
      response.writeHead(404);
      response.end("Not found");
    });
  });
  io = new SocketServer(server, {
    path: "/socket.io",
    cors: { origin: baseUrl, credentials: true },
    transports: ["polling", "websocket"]
  });
  io.on("connection", (socket) => {
    socket.on("match:join", () => {});
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  return {
    close: async () => {
      await new Promise((resolveClose) => io.close(resolveClose));
      await vite.close();
      if (server.listening) await new Promise((resolveClose) => server.close(resolveClose));
    }
  };
}

async function main() {
  const mountedServer = await createMountedServer();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {})
    });
    const page = await browser.newPage();
    attachRuntimeGuards(page);

    const matrix = [];
    for (const viewport of viewports) {
      for (const state of ["ready", "long-names", "large-roster"]) {
        matrix.push(await measureMountedLayout(page, viewport, state));
      }
    }
    const zoom = [];
    const zoomWorkflows = [];
    for (const percent of zoomPercents) {
      const scale = percent / 100;
      const viewport = { width: Math.floor(1280 / scale), height: Math.floor(720 / scale) };
      zoom.push({ percent, ...(await measureMountedLayout(page, viewport)) });
      zoom.push({ percent, ...(await measureMountedLayout(page, viewport, "long-names")) });
      zoomWorkflows.push(await verifyZoomWorkflowReachability(page, percent, viewport));
    }
    const failClosed = await verifyMountedFailClosedStates(page, viewports.at(-1));
    const rosters = await verifyMountedRosterVariants(page, viewports.at(-1));
    const queue = await verifyMountedQueueLifecycle(page, viewports[3]);
    const ambiguousRetry = await verifyMountedAmbiguousRetry(page, viewports[3]);
    const reconnect = await verifyMountedReconnectSafety(page, viewports[3]);
    const correction = await verifyMountedCorrectionNavigation(page, viewports[3]);
    const projectionAuthority = await verifyMountedProjectionAuthority(page, viewports[3]);
    const accessibility = await verifyKeyboardAndMedia(page, viewports.at(-1));

    assert.deepEqual(unexpectedConsoleMessages, []);
    assert.deepEqual(unexpectedPageErrors, []);
    assert.deepEqual(unexpectedFailedRequests, []);
    assert.deepEqual(unexpectedHttpFailures, []);

    process.stdout.write(`${JSON.stringify({
      matrix,
      zoom,
      zoomWorkflows,
      failClosed,
      rosters,
      queue,
      ambiguousRetry,
      reconnect,
      correction,
      projectionAuthority,
      accessibility,
      runtime: {
        expectedFailedRequests,
        expectedHttpFailures,
        unexpectedConsoleMessages,
        unexpectedPageErrors,
        unexpectedFailedRequests,
        unexpectedHttpFailures
      }
    })}\n`);
  } finally {
    if (browser) await browser.close();
    await mountedServer.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
