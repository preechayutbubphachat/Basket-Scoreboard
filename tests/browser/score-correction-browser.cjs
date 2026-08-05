const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { resolve } = require("node:path");
const { chromium } = require("playwright");
const root = resolve(__dirname, "..", "..");
const vite = resolve(root, "node_modules", "vite", "bin", "vite.js");
const port = Number(process.env.RM05_P3_PORT || 4187);
const base = `http://127.0.0.1:${port}/tests/browser/score-correction-fixture.html`;
const viewports = [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1024, height: 576 }];
async function ready() { for (let i=0;i<60;i+=1) { try { if ((await fetch(base)).ok) return; } catch {} await new Promise(r=>setTimeout(r,250)); } throw new Error("P3 fixture unavailable"); }
async function exercise(page, viewport) {
  await page.setViewportSize(viewport); await page.goto(base, { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: "Correct HOME +2 event #41" });
  await trigger.click(); await page.getByRole("button", { name: "Cancel" }).click(); assert.equal(await trigger.evaluate(e=>e===document.activeElement), true);
  await trigger.click(); await page.getByLabel("Correction reason").fill("table operator correction"); await page.getByRole("button", { name: "Review correction" }).click();
  const dialog = page.getByRole("dialog", { name: "Confirm score correction" });
  for (const text of ["#41", "SCORE_ADDED", "HOME - Bangkok Tigers", "#12 Kittipong", "72 to 70", "table operator correction"]) assert((await dialog.textContent()).includes(text));
  await page.getByRole("button", { name: "Cancel correction" }).click(); assert.equal(await page.getByTestId("dispatch-count").textContent(), "0");
  await trigger.click(); await page.getByLabel("Correction reason").fill("table operator correction"); await page.getByRole("button", { name: "Review correction" }).click(); await page.keyboard.press("Escape"); assert.equal(await page.getByTestId("dispatch-count").textContent(), "0");
  await trigger.click(); await page.getByLabel("Correction reason").fill("table operator correction"); await page.getByRole("button", { name: "Review correction" }).click(); await page.getByRole("button", { name: "Confirm score correction" }).dblclick(); await page.getByText("Correction appended at seq 45").waitFor(); assert.equal(await page.getByTestId("dispatch-count").textContent(), "1"); assert.equal(await trigger.evaluate(e=>e===document.activeElement), true);
  await trigger.click(); await page.getByLabel("Correction reason").fill("duplicate target check"); await page.getByRole("button", { name: "Review correction" }).click(); await page.getByRole("button", { name: "Confirm score correction" }).click(); await page.getByText(/DUPLICATE_COMMAND/).waitFor(); assert.equal(await page.getByTestId("dispatch-count").textContent(), "1");
  await page.goto(`${base}?invalidated=1`, { waitUntil: "networkidle" });
  const invalidatedTrigger = page.getByRole("button", { name: "Correct HOME +2 event #41" });
  await invalidatedTrigger.click(); await page.getByLabel("Correction reason").fill("stale target check"); await page.getByRole("button", { name: "Review correction" }).click(); await page.getByRole("button", { name: "Confirm score correction" }).click(); await page.getByText(/INVALID_EXPECTED_SEQ/).waitFor(); assert.equal(await page.getByTestId("dispatch-count").textContent(), "0");
  const layout = await page.evaluate(() => ({ noOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth, dialogReachable: !document.querySelector("dialog[open]") || document.querySelector("dialog[open]").getBoundingClientRect().bottom <= innerHeight + 1 }));
  assert.equal(layout.noOverflow, true); assert.equal(layout.dialogReachable, true); return { viewport, ...layout, dispatchCount: 1, focusReturn: true };
}
async function capabilityLoss(page, viewport, mode) {
  await page.setViewportSize(viewport); await page.goto(base, { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: "Correct HOME +2 event #41" });
  await trigger.click(); await page.getByLabel("Correction reason").fill("capability transition check"); await page.getByRole("button", { name: "Review correction" }).click();
  await page.getByTestId(mode === "mismatch" ? "mismatch-correction" : "revoke-correction").evaluate((element) => element.click());
  await page.getByText(mode === "mismatch" ? /access mismatch/ : /access revoked/).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.getByTestId("dispatch-count").textContent(), "0");
  assert.equal(await page.getByTestId("status").evaluate((element) => element === document.activeElement), true);
  return { viewport, mode, dialogClosed: true, dispatchBlocked: true, stableFocus: true };
}
async function main() { const server=spawn(process.execPath,[vite,"--host","127.0.0.1","--port",String(port),"--strictPort"],{cwd:root,stdio:["ignore","pipe","pipe"]}); let browser; try { await ready(); browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})}); const page=await browser.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message)); const results=[]; for(const viewport of viewports) results.push(await exercise(page,viewport)); const capabilityLossResults=[]; for(const viewport of viewports) { capabilityLossResults.push(await capabilityLoss(page,viewport,"revoked")); capabilityLossResults.push(await capabilityLoss(page,viewport,"mismatch")); } assert.deepEqual(errors,[]); process.stdout.write(`${JSON.stringify({results,capabilityLossResults,errors})}\n`); } finally { if(browser) await browser.close(); server.kill(); } }
main().catch(e=>{console.error(e);process.exitCode=1;});
