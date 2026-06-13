/**
 * legend.js
 * Renders the floating classification legend using the Figma design tokens.
 * The legend is injected into #legend and displays all palette classes
 * with their colour swatches and labels.
 */

import { PALETTE } from "./config.js";

// ─── Public: build and render the legend ─────────────────────────────────────
export function initLegend() {
  const container = document.getElementById("legend-items");
  if (!container) return;

  Object.entries(PALETTE).forEach(([cls, { color, label }]) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `
      <span class="legend-swatch" style="background:${color}"></span>
      <span class="legend-label">${label}</span>
    `;
    container.appendChild(item);
  });
}
