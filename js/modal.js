/**
 * modal.js
 * Manages two analysis modals:
 *   • Accuracy Assessment  – confusion matrix + producer's/user's accuracy bars
 *   • Class Change Chart   – grouped horizontal bar chart (2020 vs 2025)
 */

import { PALETTE } from "./config.js";

let _accuracyData = null;
let _statsCache   = null; // { 2020: {cls:{count,pct},...}, 2025: {...} }

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function initModals() {
  try {
    const r = await fetch("./data/accuracy.json");
    _accuracyData = await r.json();
  } catch (e) {
    console.warn("[modal] Could not load accuracy.json:", e);
  }
  _bindHandlers();
}

// Called by controls.js when both years' pixel stats are ready
export function setChangeStats(stats) {
  _statsCache = stats;
}

// ─── Triggers (public) ────────────────────────────────────────────────────────
export function openAccuracyModal(year = "2020") {
  if (_accuracyData) _renderAccuracyPanels();
  const modal = document.getElementById("modal-accuracy");
  // Switch to the requested year tab
  const tabKey = `acc-${year}`;
  modal.querySelectorAll("[data-modal-tab]").forEach(t =>
    t.classList.toggle("active", t.dataset.modalTab === tabKey));
  modal.querySelectorAll("[data-modal-panel]").forEach(p => {
    p.hidden = p.dataset.modalPanel !== tabKey;
  });
  modal.hidden = false;
}

export function openChangeModal() {
  _renderChangeChart();
  document.getElementById("modal-change").hidden = false;
}

// ─── Internal handlers ────────────────────────────────────────────────────────
function _bindHandlers() {
  // Per-year accuracy buttons inside the 2020 / 2025 sidebar panels
  document.querySelectorAll("[data-accuracy-year]").forEach(btn => {
    btn.addEventListener("click", () => openAccuracyModal(btn.dataset.accuracyYear));
  });
  document.getElementById("btn-open-change")?.addEventListener("click", openChangeModal);

  // Close on Escape
  document.addEventListener("keydown", e => { if (e.key === "Escape") _closeAll(); });

  // Close on backdrop click
  document.querySelectorAll(".modal-backdrop").forEach(el => {
    el.addEventListener("click", e => { if (e.target === el) _closeAll(); });
  });

  // Close buttons inside modals
  document.querySelectorAll(".modal-close").forEach(el => el.addEventListener("click", _closeAll));

  // Inner modal tab switching
  document.querySelectorAll("[data-modal-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
      const modal  = tab.closest(".modal-backdrop");
      const target = tab.dataset.modalTab;
      modal.querySelectorAll("[data-modal-tab]").forEach(t =>
        t.classList.toggle("active", t.dataset.modalTab === target));
      modal.querySelectorAll("[data-modal-panel]").forEach(p => {
        p.hidden = p.dataset.modalPanel !== target;
      });
    });
  });
}

function _closeAll() {
  document.querySelectorAll(".modal-backdrop").forEach(m => { m.hidden = true; });
}

// ─── Accuracy modal ───────────────────────────────────────────────────────────
function _renderAccuracyPanels() {
  const data = _accuracyData.accuracy_assessment;
  ["2020", "2025"].forEach(yr => {
    const acc   = data[yr];
    const panel = document.getElementById(`acc-panel-${yr}`);
    if (!panel || !acc) return;

    panel.querySelector(".acc-overall").textContent = `${(acc.overall_accuracy * 100).toFixed(1)}%`;
    panel.querySelector(".acc-kappa").textContent   = acc.kappa.toFixed(3);

    _renderMatrix(panel.querySelector(".confusion-matrix"), acc);
    _renderAccBars(panel.querySelector(".accuracy-bars"), acc);
  });
}

function _renderMatrix(el, acc) {
  const classes  = acc.classes;
  const matrix   = acc.confusion_matrix;
  const rowSums  = matrix.map(r => r.reduce((a, b) => a + b, 0));
  const shortLbl = classes.map(c => c.split(" ")[0]);

  let html = `<div class="cm-scroll"><table class="cm-table">
    <thead><tr>
      <th class="cm-corner">Pred →<br><small>Actual ↓</small></th>
      ${shortLbl.map(l => `<th class="cm-head">${l}</th>`).join("")}
      <th class="cm-total-head">Total</th>
    </tr></thead><tbody>`;

  matrix.forEach((row, i) => {
    const sum = rowSums[i];
    html += `<tr>
      <th class="cm-row-head">${shortLbl[i]}</th>
      ${row.map((v, j) => {
        const frac  = sum > 0 ? v / sum : 0;
        const diag  = i === j;
        const bg    = diag
          ? `rgba(26,93,173,${(0.12 + frac * 0.78).toFixed(2)})`   /* Lagos blue */
          : frac > 0 ? `rgba(204,27,27,${(frac * 0.55).toFixed(2)})` : "transparent"; /* Lagos red */
        const color = diag && frac > 0.5 ? "#fff" : "var(--text-primary)";
        return `<td class="cm-cell${diag ? " cm-diag" : ""}" style="background:${bg};color:${color}">${v}</td>`;
      }).join("")}
      <td class="cm-row-total">${sum}</td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  el.innerHTML = html;
}

function _renderAccBars(el, acc) {
  const pa      = acc.producers_accuracy;
  const ua      = acc.users_accuracy;
  const classes = acc.classes;

  let html = `<div class="acc-bar-legend">
    <span><span class="acc-leg-dot prod"></span>Producer's Accuracy</span>
    <span><span class="acc-leg-dot user"></span>User's Accuracy</span>
  </div>`;

  classes.forEach(cls => {
    const pVal = pa[cls] ?? 0;
    const uVal = ua[cls] ?? 0;
    html += `<div class="acc-bar-row">
      <div class="acc-bar-label">${cls.replace(/&/g, "&amp;")}</div>
      <div class="acc-bar-tracks">
        <div class="acc-track-wrap">
          <div class="acc-track-bg">
            <div class="acc-bar-fill prod" style="width:${pVal}%"></div>
          </div>
          <span class="acc-track-val">${pVal.toFixed(1)}%</span>
        </div>
        <div class="acc-track-wrap">
          <div class="acc-track-bg">
            <div class="acc-bar-fill user" style="width:${uVal}%"></div>
          </div>
          <span class="acc-track-val">${uVal.toFixed(1)}%</span>
        </div>
      </div>
    </div>`;
  });

  el.innerHTML = html;
}

// ─── Change chart ─────────────────────────────────────────────────────────────
function _renderChangeChart() {
  const container = document.getElementById("change-chart-container");
  if (!container) return;

  if (!_statsCache?.before || !_statsCache?.after) {
    container.innerHTML = `<p class="modal-empty">Load both classification layers first to view change analysis.</p>`;
    return;
  }

  const sBefore     = _statsCache.before;
  const sAfter      = _statsCache.after;
  const yearBefore  = _statsCache.yearBefore ?? "Left";
  const yearAfter   = _statsCache.yearAfter  ?? "Right";
  const classes     = Object.keys(PALETTE);

  // Update modal title and legend to reflect actual selected years
  const modalTitle = document.querySelector("#modal-change .modal-title");
  if (modalTitle) modalTitle.textContent = `Land Cover Change (${yearBefore} → ${yearAfter})`;

  const legBefore = document.getElementById("change-leg-before");
  const legAfter  = document.getElementById("change-leg-after");
  if (legBefore) legBefore.textContent = `${yearBefore} (Left)`;
  if (legAfter)  legAfter.textContent  = `${yearAfter} (Right)`;

  let html = `<div class="cc-chart">`;

  classes.forEach(cls => {
    const entry  = PALETTE[cls];
    const pct1   = parseFloat(sBefore[cls]?.pct || 0);
    const pct2   = parseFloat(sAfter[cls]?.pct  || 0);
    const delta  = pct2 - pct1;
    const sign   = delta >= 0 ? "+" : "";
    const dClass = delta >= 0 ? "cc-gain" : "cc-loss";

    html += `<div class="cc-row">
      <div class="cc-row-label">
        <span class="cc-swatch" style="background:${entry.color}"></span>
        <span class="cc-name">${entry.label}</span>
      </div>
      <div class="cc-row-bars">
        <div class="cc-bar-line">
          <span class="cc-year-tag y20">${yearBefore}</span>
          <div class="cc-bar-track">
            <div class="cc-bar y20" style="width:${Math.min(pct1, 100)}%"></div>
          </div>
          <span class="cc-bar-pct">${pct1.toFixed(1)}%</span>
        </div>
        <div class="cc-bar-line">
          <span class="cc-year-tag y25">${yearAfter}</span>
          <div class="cc-bar-track">
            <div class="cc-bar y25" style="width:${Math.min(pct2, 100)}%"></div>
          </div>
          <span class="cc-bar-pct">${pct2.toFixed(1)}%</span>
        </div>
      </div>
      <div class="cc-delta ${dClass}">${sign}${delta.toFixed(1)}%</div>
    </div>`;
  });

  html += `</div>`;
  container.innerHTML = html;
}
