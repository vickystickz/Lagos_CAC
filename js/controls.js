/**
 * controls.js
 * Manages the layer control panel:
 *   • 2020 / 2025 layer visibility toggles
 *   • Swipe reset button
 *   • "Zoom to Lagos" button
 *   • Basemap selector (Light / Satellite)
 *   • Class statistics sidebar (receives data from raster.js via callback)
 */

import { setLayerVisible } from "./raster.js";
import { setBasemap, flyToLagos, getMaps } from "./map.js";
import { resetSwipe } from "./swipe.js";
import { LYR_2020, LYR_2025, PALETTE } from "./config.js";
import { setChangeStats } from "./modal.js";

const state = {
  layer2020: true,
  layer2025: true,
  basemap:   "light",
  stats: { 2020: null, 2025: null },
};

// ─── Public: wire up all controls ────────────────────────────────────────────
export function initControls() {
  _bindBasemapToggle();
  _bindLayerToggles();
  _bindActionButtons();
  _bindSidebarTabs();
  _bindSidebarToggle();
}

// ─── Public: called by raster.js when stats are ready ────────────────────────
export function updateStats(year, stats) {
  state.stats[year] = stats;
  _renderStatsList(year, stats);

  // If both years loaded, render change analysis and feed modal
  if (state.stats[2020] && state.stats[2025]) {
    _renderChangeAnalysis();
    setChangeStats({ 2020: state.stats[2020], 2025: state.stats[2025] });
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
  const toggle2020 = document.getElementById("toggle-2020");
  const toggle2025 = document.getElementById("toggle-2025");

  if (toggle2020) {
    toggle2020.addEventListener("change", e => {
      state.layer2020 = e.target.checked;
      const { mapBefore } = getMaps();
      setLayerVisible(mapBefore, LYR_2020, state.layer2020);
    });
  }

  if (toggle2025) {
    toggle2025.addEventListener("change", e => {
      state.layer2025 = e.target.checked;
      const { mapAfter } = getMaps();
      setLayerVisible(mapAfter, LYR_2025, state.layer2025);
    });
  }
}

// ─── Action buttons ───────────────────────────────────────────────────────────
function _bindActionButtons() {
  document.getElementById("btn-reset-swipe")?.addEventListener("click", resetSwipe);
  document.getElementById("btn-zoom-lagos")?.addEventListener("click", flyToLagos);
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

// ─── Legend visibility (navbar button hides/shows the whole card) ─────────────
function _toggleLegend() {
  const legend = document.getElementById("legend");
  if (!legend) return;
  legend.hidden = !legend.hidden;
  const btn = document.getElementById("btn-toggle-legend");
  if (btn) btn.classList.toggle("active", !legend.hidden);
}

// ─── Legend collapse (chevron expands/collapses the items) ───────────────────
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

// ─── Stats list for a single year ────────────────────────────────────────────
function _renderStatsList(year, stats) {
  const container = document.getElementById(`stats-${year}`);
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
        <div class="stat-bar" style="width:${pct}%; background:${entry.color}"></div>
      </div>
      <div class="stat-pct">${pct}%</div>
    `;
    container.appendChild(row);
  });
}

// ─── Change analysis (delta between 2020 and 2025) ───────────────────────────
function _renderChangeAnalysis() {
  const container = document.getElementById("stats-change");
  if (!container) return;

  container.innerHTML = "";

  const s20 = state.stats[2020];
  const s25 = state.stats[2025];

  const allCls = new Set([...Object.keys(s20), ...Object.keys(s25)]);

  const rows = [];
  allCls.forEach(cls => {
    const pct20 = parseFloat(s20[cls]?.pct || 0);
    const pct25 = parseFloat(s25[cls]?.pct || 0);
    const delta = pct25 - pct20;
    rows.push({ cls, pct20, pct25, delta });
  });

  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  rows.forEach(({ cls, pct20, pct25, delta }) => {
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
          <span class="year-tag">2020: ${pct20.toFixed(1)}%</span>
          <span class="year-tag">2025: ${pct25.toFixed(1)}%</span>
        </div>
      </div>
      <div class="stat-delta ${dir}">${icon} ${sign}${delta.toFixed(1)}%</div>
    `;
    container.appendChild(row);
  });
}
