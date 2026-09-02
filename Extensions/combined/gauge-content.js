/* SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Zovo
 *
 * DOM-only pre-watch engagement filter. It preserves the upstream project's
 * proven coalesced SPA initialization pattern while replacing network-backed
 * dislike retrieval with metrics already rendered by the page.
 */

import { createInitializationCycleRunner } from "./src/initialization-cycle";
import { buildEngagementMetric, formatCompact, parseAgeDays, parseVisibleCount } from "./src/gauge-metrics";

const CARD_SELECTOR = [
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-reel-item-renderer",
  "yt-lockup-view-model",
].join(",");
const THUMBNAIL_SELECTOR = "a#thumbnail, ytd-thumbnail a, a.yt-lockup-view-model__content-image";
const CHIP_CLASS = "zgqGauge__chip";
const LOW_CLASS = "zgqGauge--low";
const COLLAPSE_CLASS = "zgqGauge--collapse";
const processed = new WeakMap();
let ledger = {};
let settings = { threshold: 2.5, filterMode: "dim" };
let queued = false;

function send(message) {
  return chrome.runtime.sendMessage(message).catch(() => null);
}

function visibleText(element) {
  if (!element || !element.isConnected || element.getClientRects().length === 0) return "";
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return "";
  return (element.textContent || "").replace(/\s+/g, " ").trim();
}

function videoIdFromUrl(raw) {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw, location.origin);
    if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2] || null;
    return url.searchParams.get("v");
  } catch (_) {
    return null;
  }
}

function findVideoId(root) {
  const link = root.querySelector("a[href*='/watch?'], a[href*='/shorts/']");
  return videoIdFromUrl(link?.href || link?.getAttribute("href"));
}

function findLine(root, pattern) {
  const text = root?.innerText || visibleText(root);
  if (!text) return "";
  const chunks = text.split(/(?:\n|•|·)/).map((value) => value.trim());
  return chunks.find((value) => pattern.test(value)) || "";
}

function metricFromCard(card) {
  const likesText = findLine(card, /\blikes?\b/i);
  const viewsText = findLine(card, /\bviews?\b/i);
  const ageText = findLine(card, /\bago\b/i);
  return buildEngagementMetric({
    likes: parseVisibleCount(likesText),
    views: parseVisibleCount(viewsText),
    ageDays: parseAgeDays(ageText),
  });
}

function tooltipFor(metric) {
  if (!metric) return "Open this video once to capture its visible likes and views.";
  const velocity = Number.isFinite(metric.likesPerDay)
    ? `${formatCompact(metric.likesPerDay)} visible likes/day`
    : "Daily velocity unavailable until a visible upload age appears";
  return `${metric.engagement.toFixed(1)}% visible likes per view · ${velocity}`;
}

function ensureChip(card, videoId, metric) {
  const thumbnail = card.querySelector(THUMBNAIL_SELECTOR);
  if (!thumbnail) return;
  let chip = thumbnail.querySelector(`:scope > .${CHIP_CLASS}`);
  if (!chip) {
    chip = document.createElement("span");
    chip.className = CHIP_CLASS;
    chip.setAttribute("role", "status");
    thumbnail.appendChild(chip);
  }
  chip.textContent = metric ? `${metric.engagement.toFixed(1)}%` : "Gauge · —";
  chip.dataset.zgqTooltip = tooltipFor(metric);
  chip.setAttribute("aria-label", chip.dataset.zgqTooltip);
  const below = Boolean(metric && metric.engagement < settings.threshold);
  card.classList.toggle(LOW_CLASS, below);
  card.classList.toggle(COLLAPSE_CLASS, below && settings.filterMode === "collapse");
  card.dataset.zgqGaugeVideo = videoId || "unknown";
}

function processCard(card) {
  const videoId = findVideoId(card);
  const directMetric = metricFromCard(card);
  const metric = directMetric || (videoId ? ledger[videoId] : null);
  const signature = `${videoId}|${metric?.seenAt || metric?.engagement || "none"}|${settings.threshold}|${settings.filterMode}`;
  if (processed.get(card) === signature) return;
  processed.set(card, signature);
  ensureChip(card, videoId, metric);
  if (directMetric && videoId) {
    const title = visibleText(card.querySelector("#video-title, h3, .yt-lockup-metadata-view-model__title"));
    const observed = { videoId, title, ...directMetric };
    ledger[videoId] = { ...observed, seenAt: Date.now() };
    void send({ type: "zgqGauge:observe", metric: observed });
  }
}

function findVisibleCount(selectors) {
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      const text = visibleText(element);
      const count = parseVisibleCount(text);
      if (count !== null) return count;
    }
  }
  return null;
}

function findVisibleAge() {
  const selectors = [
    "#info-strings yt-formatted-string",
    "ytd-watch-info-text #info span",
    "#description-inline-expander #info span",
    "yt-formatted-string.published-time-text",
  ];
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      const text = visibleText(element);
      const days = parseAgeDays(text);
      if (days !== null) return days;
    }
  }
  return null;
}

async function captureWatchMetric() {
  const videoId = videoIdFromUrl(location.href);
  if (!videoId || (!location.pathname.startsWith("/watch") && !location.pathname.startsWith("/shorts/"))) return;
  const likes = findVisibleCount([
    "#segmented-like-button button .yt-spec-button-shape-next__button-text-content",
    "like-button-view-model button .yt-spec-button-shape-next__button-text-content",
    "ytd-toggle-button-renderer#like-button #text",
  ]);
  const views = findVisibleCount([
    "ytd-watch-info-text #info span:first-child",
    "#info #count .view-count",
    "#info #count yt-formatted-string",
    ".view-count",
  ]);
  const metric = buildEngagementMetric({ likes, views, ageDays: findVisibleAge() });
  if (!metric) return;
  const title = visibleText(document.querySelector("h1 yt-formatted-string, h1.ytd-watch-metadata, ytd-watch-metadata h1"));
  const observed = { videoId, title, ...metric };
  ledger[videoId] = { ...observed, seenAt: Date.now() };
  await send({ type: "zgqGauge:observe", metric: observed });
}

async function runPass() {
  document.querySelectorAll(CARD_SELECTOR).forEach(processCard);
  await captureWatchMetric();
}

const cycle = createInitializationCycleRunner(runPass);
function schedulePass() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    void cycle.request();
  });
}

async function refreshState() {
  const state = await send({ type: "zgqGauge:getState" });
  if (state?.ledger) ledger = state.ledger;
  if (state?.settings) settings = state.settings;
  processed.clear?.();
  schedulePass();
}

await refreshState();
const observer = new MutationObserver(schedulePass);
observer.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("yt-navigate-finish", schedulePass);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes["zgqGauge.settings.v1"]) void refreshState();
});
