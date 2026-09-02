/* SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Zovo
 *
 * DOM-number normalization for the Gauge fork. The original project remains
 * available in this repository; this module adds the pre-watch filter.
 */

const MULTIPLIERS = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
};

function parseVisibleCount(raw) {
  if (typeof raw !== "string") return null;
  const normalized = raw
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/,/g, "")
    .trim();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const multiplier = MULTIPLIERS[match[2]?.toLowerCase()] || 1;
  return Math.round(value * multiplier);
}

function parseAgeDays(raw, now = Date.now()) {
  if (typeof raw !== "string") return null;
  const normalized = raw.toLowerCase().trim();
  const relative = normalized.match(
    /(\d+)\s*(minute|hour|day|week|month|year)s?\s+ago/,
  );
  if (relative) {
    const amount = Number(relative[1]);
    const unitDays = {
      minute: 1 / 1440,
      hour: 1 / 24,
      day: 1,
      week: 7,
      month: 30.4375,
      year: 365.25,
    };
    return Math.max(amount * unitDays[relative[2]], 1 / 1440);
  }
  const dateText = normalized.replace(/^premiered\s+|^streamed live on\s+|^published on\s+/, "");
  const timestamp = Date.parse(dateText);
  if (!Number.isFinite(timestamp) || timestamp > now) return null;
  return Math.max((now - timestamp) / 86_400_000, 1 / 1440);
}

function buildEngagementMetric({ likes, views, ageDays }) {
  if (!Number.isFinite(likes) || likes < 0 || !Number.isFinite(views) || views <= 0) return null;
  const engagement = (likes / views) * 100;
  const likesPerDay = Number.isFinite(ageDays) && ageDays > 0 ? likes / ageDays : null;
  return {
    likes: Math.round(likes),
    views: Math.round(views),
    ageDays: Number.isFinite(ageDays) ? ageDays : null,
    engagement,
    likesPerDay,
  };
}

function formatCompact(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: value < 100 ? 1 : 0,
  }).format(value);
}

export { buildEngagementMetric, formatCompact, parseAgeDays, parseVisibleCount };
