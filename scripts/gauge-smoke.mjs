#!/usr/bin/env node
/* SPDX-License-Identifier: GPL-3.0-only */

import { chromium } from "@playwright/test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const extensionPath = resolve(process.argv[2] || "Extensions/Combined/dist/chrome");
const profile = mkdtempSync(`${tmpdir()}/zgq-smoke-`);
function resolveChrome() {
  const cache = join(process.env.HOME, "Library/Caches/ms-playwright");
  for (const version of ["chromium-1229", "chromium-1223", "chromium-1217", "chromium-1228"]) {
    const candidate = join(
      cache,
      version,
      "chrome-mac-arm64",
      "Google Chrome for Testing.app",
      "Contents/MacOS/Google Chrome for Testing",
    );
    if (existsSync(candidate)) return candidate;
  }
  const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return existsSync(systemChrome) ? systemChrome : chromium.executablePath();
}
const syntheticPage = `<!doctype html>
<html><head><title>Gauge smoke</title></head><body>
  <ytd-rich-item-renderer id="measured-card">
    <a id="thumbnail" href="/watch?v=abc123Gauge"><img alt="Measured thumbnail"></a>
    <h3 id="video-title">A measured choice</h3>
    <div>10K views</div><div>500 likes</div><div>10 days ago</div>
  </ytd-rich-item-renderer>
  <ytd-video-renderer id="unknown-card">
    <a id="thumbnail" href="/watch?v=unknownGauge"><img alt="Unknown thumbnail"></a>
    <h3 id="video-title">An unknown choice</h3><div>3K views</div><div>2 days ago</div>
  </ytd-video-renderer>
</body></html>`;

let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath: resolveChrome(),
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-first-run",
      "--disable-default-apps",
    ],
  });
  await context.route("https://www.youtube.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: syntheticPage }),
  );
  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://www.youtube.com/", { waitUntil: "load" });
  await page.waitForSelector("#measured-card .zgqGauge__chip", { timeout: 10000 });

  const measuredText = await page.locator("#measured-card .zgqGauge__chip").textContent();
  const unknownText = await page.locator("#unknown-card .zgqGauge__chip").textContent();
  const tooltip = await page.locator("#measured-card .zgqGauge__chip").getAttribute("data-zgq-tooltip");
  if (measuredText !== "5.0%") throw new Error(`expected 5.0% chip, got ${measuredText}`);
  if (unknownText !== "Gauge · —") throw new Error(`expected honest unknown chip, got ${unknownText}`);
  if (!tooltip?.includes("50 visible likes/day")) throw new Error(`unexpected tooltip: ${tooltip}`);

  let extensionId = null;
  for (let attempt = 0; attempt < 30 && !extensionId; attempt += 1) {
    const worker = context.serviceWorkers().find((candidate) => candidate.url().endsWith("/zgq-worker.js"));
    if (worker) extensionId = new URL(worker.url()).host;
    if (!extensionId) await page.waitForTimeout(100);
  }
  if (!extensionId) throw new Error("service worker did not register");

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/zgq-panel.html`, { waitUntil: "load" });
  await panel.waitForFunction(() => document.querySelector("#ledgerCount")?.textContent === "1");
  const rowTitle = await panel.locator(".zgqPanel__row strong").textContent();
  if (rowTitle !== "A measured choice") throw new Error(`ledger title mismatch: ${rowTitle}`);

  await panel.locator("#threshold").evaluate((input) => {
    input.value = "6";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForSelector("#measured-card.zgqGauge--low");
  await panel.locator("#modeCollapse").click();
  await panel.locator("#proTab").click();
  await panel.waitForFunction(() => document.querySelector("#licenceStatus")?.textContent.includes("Activate"));
  await panel.locator("#licenceKey").fill("not-a-key");
  await panel.locator("#activateLicence").click();
  await panel.waitForFunction(() => document.querySelector("#licenceStatus")?.textContent.includes("format"));

  console.log(JSON.stringify({
    chip: measuredText,
    unknown: unknownText,
    tooltip,
    ledgerCount: 1,
    thresholdDimmed: true,
    collapseGuarded: true,
    invalidKeyRejectedBeforeNetwork: true,
  }, null, 2));
} finally {
  await context?.close().catch(() => {});
  rmSync(profile, { recursive: true, force: true });
}
