/* SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Zovo
 *
 * Session ledger, settings, and licence service worker for Gauge.
 * The paid convenience is not a technical restriction under the GPL: anyone
 * may rebuild the complete source with different defaults.
 */

const SETTINGS_KEY = "zgqGauge.settings.v1";
const LICENCE_KEY = "zgqGauge.licence.v1";
const LEDGER_KEY = "zgqGauge.sessionLedger.v1";
const VERIFY_URL = "https://zgubxqomnbmxgbdhvwja.supabase.co/functions/v1/verify-extension-license";
const LICENSE_KEY_RE = /^ZOVO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const ANON_KEY = typeof __ZGQ_SUPABASE_ANON_KEY__ === "string" ? __ZGQ_SUPABASE_ANON_KEY__ : "";
const DEFAULT_SETTINGS = Object.freeze({ threshold: 2.5, filterMode: "dim" });
const MAX_LEDGER_ITEMS = 150;

const localGet = (key) => chrome.storage.local.get(key).then((result) => result[key]);
const localSet = (value) => chrome.storage.local.set(value);
const sessionGet = (key) => chrome.storage.session.get(key).then((result) => result[key]);
const sessionSet = (value) => chrome.storage.session.set(value);

function normalizeLicenseKey(raw) {
  if (typeof raw !== "string" || raw.length > 64) return null;
  const normalized = raw.trim().toUpperCase();
  return LICENSE_KEY_RE.test(normalized) ? normalized : null;
}

async function getLicenceState() {
  const record = await localGet(LICENCE_KEY);
  if (!record || record.valid !== true || !normalizeLicenseKey(record.key)) return { valid: false };
  return { valid: true, activatedAt: record.activatedAt };
}

async function getSettings() {
  const stored = await localGet(SETTINGS_KEY);
  const threshold = Number(stored?.threshold);
  const filterMode = stored?.filterMode === "collapse" ? "collapse" : "dim";
  const licence = await getLicenceState();
  return {
    threshold: Number.isFinite(threshold) && threshold >= 0 && threshold <= 20 ? threshold : DEFAULT_SETTINGS.threshold,
    filterMode: filterMode === "collapse" && !licence.valid ? "dim" : filterMode,
  };
}

async function setSettings(input) {
  const threshold = Number(input?.threshold);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 20) {
    return { ok: false, error: "threshold" };
  }
  const licence = await getLicenceState();
  const requestedMode = input?.filterMode === "collapse" ? "collapse" : "dim";
  if (requestedMode === "collapse" && !licence.valid) return { ok: false, error: "licence" };
  const settings = { threshold: Math.round(threshold * 10) / 10, filterMode: requestedMode };
  await localSet({ [SETTINGS_KEY]: settings });
  return { ok: true, settings };
}

async function readLedger() {
  const ledger = await sessionGet(LEDGER_KEY);
  return ledger && typeof ledger === "object" ? ledger : {};
}

async function observeMetric(metric) {
  if (!metric || typeof metric.videoId !== "string" || !/^[\w-]{6,32}$/.test(metric.videoId)) return false;
  if (!Number.isFinite(metric.engagement) || !Number.isFinite(metric.likes) || !Number.isFinite(metric.views)) return false;
  const ledger = await readLedger();
  ledger[metric.videoId] = {
    videoId: metric.videoId,
    title: typeof metric.title === "string" ? metric.title.slice(0, 180) : "Untitled video",
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(metric.videoId)}`,
    likes: Math.max(0, Math.round(metric.likes)),
    views: Math.max(1, Math.round(metric.views)),
    engagement: Math.max(0, Math.min(100, Number(metric.engagement))),
    likesPerDay: Number.isFinite(metric.likesPerDay) ? Math.max(0, Number(metric.likesPerDay)) : null,
    ageDays: Number.isFinite(metric.ageDays) ? Math.max(0, Number(metric.ageDays)) : null,
    seenAt: Date.now(),
  };
  const trimmed = Object.fromEntries(
    Object.entries(ledger)
      .sort(([, left], [, right]) => right.seenAt - left.seenAt)
      .slice(0, MAX_LEDGER_ITEMS),
  );
  await sessionSet({ [LEDGER_KEY]: trimmed });
  return true;
}

async function activateLicense(raw) {
  const key = normalizeLicenseKey(raw);
  if (!key) return { valid: false, error: "shape" };
  if (!ANON_KEY) return { valid: false, error: "configuration" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: ANON_KEY,
        authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ license_key: key, extension: "gauge" }),
      signal: controller.signal,
    });
    if (!response.ok) return { valid: false, error: "rejected" };
    const verdict = await response.json().catch(() => null);
    if (!verdict || verdict.valid !== true) return { valid: false, error: "rejected" };
    await localSet({
      [LICENCE_KEY]: {
        key,
        valid: true,
        activatedAt: Date.now(),
      },
    });
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error?.name === "AbortError" ? "timeout" : "offline" };
  } finally {
    clearTimeout(timer);
  }
}

async function getState() {
  const [ledger, settings, licence] = await Promise.all([readLedger(), getSettings(), getLicenceState()]);
  return { ledger, settings, licence };
}

chrome.runtime.onInstalled.addListener(async () => {
  if (!(await localGet(SETTINGS_KEY))) await localSet({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const task = (async () => {
    switch (message?.type) {
      case "zgqGauge:getState":
        return getState();
      case "zgqGauge:observe":
        return { ok: await observeMetric(message.metric) };
      case "zgqGauge:setSettings":
        return setSettings(message.settings);
      case "zgqGauge:activate":
        return activateLicense(message.key);
      case "zgqGauge:open":
        if (typeof message.url === "string" && /^https:\/\/(?:www\.)?youtube\.com\//.test(message.url)) {
          await chrome.tabs.create({ url: message.url });
          return { ok: true };
        }
        return { ok: false };
      default:
        return { ok: false, error: "unknown" };
    }
  })();
  task.then(sendResponse).catch(() => sendResponse({ ok: false, error: "internal" }));
  return true;
});

export { getLicenceState, normalizeLicenseKey };
