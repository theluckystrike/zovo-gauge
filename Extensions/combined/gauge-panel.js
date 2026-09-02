/* SPDX-License-Identifier: GPL-3.0-only */

const $ = (selector) => document.querySelector(selector);
let state = { ledger: {}, settings: { threshold: 2.5, filterMode: "dim" }, licence: { valid: false } };

function send(message) {
  return chrome.runtime.sendMessage(message).catch(() => null);
}

function formatCompact(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value)
    : "—";
}

function sortedLedger() {
  const sort = $("#sortBy").value;
  const items = Object.values(state.ledger || {});
  return items.sort((left, right) => {
    if (sort === "velocity") return (right.likesPerDay || 0) - (left.likesPerDay || 0);
    if (sort === "recent") return right.seenAt - left.seenAt;
    return right.engagement - left.engagement;
  });
}

function renderLedger() {
  const items = sortedLedger();
  $("#ledgerCount").textContent = String(items.length);
  $("#heroSummary").textContent = items.length
    ? `Best visible engagement: ${items[0].engagement.toFixed(1)}%`
    : "Scores appear as visible numbers are encountered.";
  $("#emptyState").hidden = items.length > 0;
  const list = $("#ledgerList");
  list.replaceChildren();
  for (const item of items.slice(0, 12)) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "zgqPanel__row";
    row.innerHTML = `<span><strong></strong><small></small></span><span class="zgqPanel__score"></span>`;
    row.querySelector("strong").textContent = item.title || "Untitled video";
    row.querySelector("small").textContent = `${formatCompact(item.likes)} likes · ${formatCompact(item.likesPerDay)} / day`;
    row.querySelector(".zgqPanel__score").textContent = `${item.engagement.toFixed(1)}%`;
    row.setAttribute("aria-label", `Open ${item.title || "video"}, ${item.engagement.toFixed(1)} percent engagement`);
    row.addEventListener("click", () => send({ type: "zgqGauge:open", url: item.url }));
    const listItem = document.createElement("li");
    listItem.appendChild(row);
    list.appendChild(listItem);
  }
}

function renderSettings() {
  const { threshold, filterMode } = state.settings;
  $("#threshold").value = String(threshold);
  $("#thresholdOutput").textContent = `${threshold.toFixed(1)}%`;
  $("#modeDim").setAttribute("aria-checked", String(filterMode === "dim"));
  $("#modeCollapse").setAttribute("aria-checked", String(filterMode === "collapse"));
  $("#settingsStatus").textContent = filterMode === "collapse"
    ? "Below-floor choices are removed from the current feed."
    : "Below-floor choices stay visible but quiet.";
}

function renderLicence() {
  const active = state.licence?.valid === true;
  $("#licenceBadge").textContent = active ? "ACTIVE" : "OPTIONAL";
  $("#licenceBadge").classList.toggle("is-active", active);
  $("#licenceForm").hidden = active;
  $("#licenceStatus").textContent = active
    ? "Collapse mode is unlocked on this device, including while offline."
    : "Dim is free. Activate a key to remove low-signal choices completely.";
}

async function saveSettings(next) {
  const result = await send({ type: "zgqGauge:setSettings", settings: next });
  if (result?.ok) {
    state.settings = result.settings;
  } else if (result?.error === "licence") {
    $("#licenceStatus").textContent = "Activate a valid key before using collapse mode.";
  }
  renderSettings();
}

$("#threshold").addEventListener("input", (event) => {
  $("#thresholdOutput").textContent = `${Number(event.target.value).toFixed(1)}%`;
});
$("#threshold").addEventListener("change", (event) => {
  void saveSettings({ ...state.settings, threshold: Number(event.target.value) });
});
$("#modeDim").addEventListener("click", () => saveSettings({ ...state.settings, filterMode: "dim" }));
$("#modeCollapse").addEventListener("click", () => saveSettings({ ...state.settings, filterMode: "collapse" }));
$("#sortBy").addEventListener("change", renderLedger);
function selectTab(name) {
  const ranking = name === "ranking";
  $("#rankingTab").setAttribute("aria-selected", String(ranking));
  $("#proTab").setAttribute("aria-selected", String(!ranking));
  $("#rankingPanel").hidden = !ranking;
  $("#proPanel").hidden = ranking;
}
$("#rankingTab").addEventListener("click", () => selectTab("ranking"));
$("#proTab").addEventListener("click", () => selectTab("pro"));
$("#pricing").addEventListener("click", () => chrome.tabs.create({ url: "https://zovo.one/pricing" }));
$("#activateLicence").addEventListener("click", async () => {
  const button = $("#activateLicence");
  button.disabled = true;
  button.textContent = "Checking…";
  const result = await send({ type: "zgqGauge:activate", key: $("#licenceKey").value });
  button.disabled = false;
  button.textContent = "Activate";
  if (result?.valid === true) {
    state.licence = { valid: true };
    renderLicence();
  } else {
    $("#licenceStatus").textContent = result?.error === "shape"
      ? "That key does not match the format in your receipt."
      : "The key could not be verified. Check your connection and try again.";
  }
});

async function initializePanel() {
  const initial = await send({ type: "zgqGauge:getState" });
  if (initial) state = initial;
  renderLedger();
  renderSettings();
  renderLicence();
  selectTab(document.body.dataset.initialTab === "pro" ? "pro" : "ranking");
}

void initializePanel();
