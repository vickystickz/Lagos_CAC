/**
 * controls.js
 * Manages all UI controls:
 *   • Year selectors (left / right map)
 *   • Layer visibility toggles
 *   • Basemap selector
 *   • Sidebar tabs / collapse
 *   • Class statistics (side-based, year-aware)
 *   • Change analysis
 */

import { setLayerVisible, swapYear } from "./raster.js";
import { setBasemap, flyToLagos, getMaps } from "./map.js";
import { resetSwipe } from "./swipe.js";
import { LYR_BEFORE, LYR_AFTER, PALETTE, YEARS,
         DEFAULT_YEAR_BEFORE, DEFAULT_YEAR_AFTER } from "./config.js";
import { setChangeStats } from "./modal.js";

const state = {
  layerVisible: { before: true, after: true },
  basemap:      "light",
  stats:        { before: null, after: null },
  years:        { before: DEFAULT_YEAR_BEFORE, after: DEFAULT_YEAR_AFTER },
};

// ─── Public: wire up all controls ────────────────────────────────────────────
export function initControls() {
  _buildYearSelectors();
  _bindYearSelectors();
  _bindBasemapToggle();
  _bindLayerToggles();
  _bindActionButtons();
  _bindSidebarTabs();
  _bindSidebarToggle();
}

// ─── Public: called by raster.js when stats are ready ────────────────────────
// side = "before" | "after",  year = number
export function updateStats(side, year, stats) {
  state.stats[side] = stats;
  state.years[side] = year;

  _renderStatsList(side, year, stats);

  if (state.stats.before && state.stats.after) {
    _renderChangeAnalysis();
    setChangeStats({
      before:      state.stats.before,
      after:       state.stats.after,
      yearBefore:  state.years.before,
      yearAfter:   state.years.after,
    });
  }
}

// ─── Year selectors ───────────────────────────────────────────────────────────

function _buildYearSelectors() {
  const yearKeys = Object.keys(YEARS);

  ["before", "after"].forEach(side => {
    const sel = document.getElementById(`select-year-${side}`);
    if (!sel) return;
    sel.innerHTML = "";
    yearKeys.forEach(yr => {
      const opt = document.createElement("option");
      opt.value       = yr;
      opt.textContent = YEARS[yr].label;
      if (Number(yr) === state.years[side]) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

function _bindYearSelectors() {
  const selBefore = document.getElementById("select-year-before");
  const selAfter  = document.getElementById("select-year-after");

  selBefore?.addEventListener("change", async () => {
    const newYear = Number(selBefore.value);
    const { mapBefore, mapAfter } = getMaps();

    // Auto-swap: if the other side already has this year, swap it
    if (newYear === state.years.after) {
      const displaced = state.years.before;
      selAfter.value = displaced;
      state.years.after = displaced;
      await swapYear(mapAfter, "after", displaced);
    }

    state.years.before = newYear;
    _updateSideLabels();
    await swapYear(mapBefore, "before", newYear);
  });

  selAfter?.addEventListener("change", async () => {
    const newYear = Number(selAfter.value);
    const { mapBefore, mapAfter } = getMaps();

    if (newYear === state.years.before) {
      const displaced = state.years.after;
      selBefore.value = displaced;
      state.years.before = displaced;
      await swapYear(mapBefore, "before", displaced);
    }

    state.years.after = newYear;
    _updateSideLabels();
    await swapYear(mapAfter, "after", newYear);
  });
}

// Update sidebar tab text and panel labels to reflect selected years
function _updateSideLabels() {
  const tabBefore = document.getElementById("tab-before");
  const tabAfter  = document.getElementById("tab-after");
  if (tabBefore) tabBefore.textContent = state.years.before;
  if (tabAfter)  tabAfter.textContent  = state.years.after;

  const lblBefore = document.getElementById("label-stats-before");
  const lblAfter  = document.getElementById("label-stats-after");
  if (lblBefore) lblBefore.textContent = `Land Cover — ${state.years.before}`;
  if (lblAfter)  lblAfter.textContent  = `Land Cover — ${state.years.after}`;

  const changeLbl = document.getElementById("label-change-analysis");
  if (changeLbl) changeLbl.textContent =
    `Class Change (${state.years.before} → ${state.years.after})`;

  // Update accuracy button labels and data-attribute
  const btnBefore = document.getElementById("btn-accuracy-before");
  const btnAfter  = document.getElementById("btn-accuracy-after");
  if (btnBefore) {
    btnBefore.dataset.accuracyYear = state.years.before;
    btnBefore.querySelector(".acc-btn-yr").textContent = state.years.before;
  }
  if (btnAfter) {
    btnAfter.dataset.accuracyYear = state.years.after;
    btnAfter.querySelector(".acc-btn-yr").textContent = state.years.after;
  }
}

// ─── Basemap toggle ───────────────────────────────────────────────────────────
function _bindBasemapToggle() {
  const btns = document.querySelectorAll("[data-basemap]");
  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.basemap;
      if (state.basemap === key) return;
      state.basemap = key;
      btns.forEach(b => b.classList.toggle("active", b.dataset.basemap === key));
      setBasemap(key);
    });
  });
}

// ─── Layer visibility toggles ─────────────────────────────────────────────────
function _bindLayerToggles() {
  const t1 = document.getElementById("toggle-before");
  const t2 = document.getElementById("toggle-after");

  t1?.addEventListener("change", e => {
    state.layerVisible.before = e.target.checked;
    const { mapBefore } = getMaps();
    setLayerVisible(mapBefore, LYR_BEFORE, state.layerVisible.before);
  });

  t2?.addEventListener("change", e => {
    state.layerVisible.after = e.target.checked;
    const { mapAfter } = getMaps();
    setLayerVisible(mapAfter, LYR_AFTER, state.layerVisible.after);
  });
}

// ─── Action buttons ───────────────────────────────────────────────────────────
function _bindActionButtons() {
  document.getElementById("btn-reset-swipe")?.addEventListener("click", resetSwipe);
  document.getElementById("btn-zoom-lagos-panel")?.addEventListener("click", flyToLagos);
  document.getElementById("btn-toggle-legend")?.addEventListener("click", _toggleLegend);
  document.getElementById("btn-legend-chevron")?.addEventListener("click", _collapseExpandLegend);
}

// ─── Sidebar tabs ─────────────────────────────────────────────────────────────
function _bindSidebarTabs() {
  const tabs = document.querySelectorAll("[data-tab]");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === target));
      document.querySelectorAll("[data-panel]").forEach(panel => {
        panel.hidden = panel.dataset.panel !== target;
      });
    });
  });
}

// ─── Legend visibility ────────────────────────────────────────────────────────
function _toggleLegend() {
  const legend = document.getElementById("legend");
  if (!legend) return;
  legend.hidden = !legend.hidden;
  const btn = document.getElementById("btn-toggle-legend");
  if (btn) btn.classList.toggle("active", !legend.hidden);
}

function _collapseExpandLegend() {
  const legend  = document.getElementById("legend");
  const chevron = document.getElementById("btn-legend-chevron");
  if (!legend || !chevron) return;
  const collapsed = legend.classList.toggle("legend-collapsed");
  chevron.setAttribute("aria-expanded", String(!collapsed));
  chevron.setAttribute("aria-label", collapsed ? "Expand legend" : "Collapse legend");
}

// ─── Sidebar collapse / expand ────────────────────────────────────────────────
function _bindSidebarToggle() {
  const sidebar  = document.getElementById("sidebar");
  const btnClose = document.getElementById("btn-sidebar-close");
  const btnOpen  = document.getElementById("btn-sidebar-open");
  if (!sidebar || !btnClose || !btnOpen) return;

  btnClose.addEventListener("click", () => {
    sidebar.classList.add("collapsed");
    btnOpen.hidden = false;
  });
  btnOpen.addEventListener("click", () => {
    sidebar.classList.remove("collapsed");
    btnOpen.hidden = true;
  });
}

// ─── Stats list for one side ──────────────────────────────────────────────────
function _renderStatsList(side, year, stats) {
  const container = document.getElementById(`stats-${side}`);
  if (!container) return;

  container.innerHTML = "";
  const sorted = Object.entries(stats).sort((a, b) => b[1].count - a[1].count);

  sorted.forEach(([cls, { pct }]) => {
    const entry = PALETTE[cls];
    if (!entry) return;
    const row = document.createElement("div");
    row.className = "stat-row";
    row.innerHTML = `
      <div class="stat-swatch" style="background:${entry.color}"></div>
      <div class="stat-label">${entry.label}</div>
      <div class="stat-bar-wrap">
        <div class="stat-bar" style="width:${pct}%;background:${entry.color}"></div>
      </div>
      <div class="stat-pct">${pct}%</div>`;
    container.appendChild(row);
  });

  // Keep labels / buttons in sync with the selected year
  _updateSideLabels();
}

// ─── Change analysis ──────────────────────────────────────────────────────────
function _renderChangeAnalysis() {
  const container = document.getElementById("stats-change");
  if (!container) return;

  container.innerHTML = "";

  const sBefore = state.stats.before;
  const sAfter  = state.stats.after;

  const allCls = new Set([...Object.keys(sBefore), ...Object.keys(sAfter)]);
  const rows = [];

  allCls.forEach(cls => {
    const pct1  = parseFloat(sBefore[cls]?.pct || 0);
    const pct2  = parseFloat(sAfter[cls]?.pct  || 0);
    const delta = pct2 - pct1;
    rows.push({ cls, pct1, pct2, delta });
  });

  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  rows.forEach(({ cls, pct1, pct2, delta }) => {
    const entry = PALETTE[cls];
    if (!entry) return;
    const sign  = delta >= 0 ? "+" : "";
    const dir   = delta >= 0 ? "change-gain" : "change-loss";
    const icon  = delta >= 0 ? "▲" : "▼";

    const row = document.createElement("div");
    row.className = "stat-row change-row";
    row.innerHTML = `
      <div class="stat-swatch" style="background:${entry.color}"></div>
      <div class="stat-info">
        <div class="stat-label">${entry.label}</div>
        <div class="stat-years">
          <span class="year-tag">${state.years.before}: ${pct1.toFixed(1)}%</span>
          <span class="year-tag">${state.years.after}: ${pct2.toFixed(1)}%</span>
        </div>
      </div>
      <div class="stat-delta ${dir}">${icon} ${sign}${delta.toFixed(1)}%</div>`;
    container.appendChild(row);
  });

  // Also update the panel section label
  const changeLbl = document.getElementById("label-change-analysis");
  if (changeLbl) changeLbl.textContent =
    `Class Change (${state.years.before} → ${state.years.after})`;
}
