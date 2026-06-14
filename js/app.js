/**
 * app.js
 * Main orchestrator. Initialises all modules in the correct order and
 * wires the inter-module data flow (e.g. raster stats → controls sidebar).
 *
 * Dependency order:
 *   config.js  (no deps)
 *   map.js     → config.js
 *   raster.js  → config.js
 *   swipe.js   (no deps)
 *   legend.js  → config.js
 *   controls.js → raster.js, map.js, swipe.js, config.js
 */

import { initMaps, getMaps } from "./map.js";
import { loadAllRasters, onStatsReady, reattachLayers } from "./raster.js";
import { initBoundaries, reattachBoundaries } from "./boundaries.js";
import { initSwipe } from "./swipe.js";
import { initLegend } from "./legend.js";
import { initControls, updateStats } from "./controls.js";
import { initModals } from "./modal.js";

async function main() {
  // 1. Legend (pure DOM, no map needed)
  initLegend();

  // 2. Controls + modals (pure DOM, no map state needed yet)
  initControls();
  await initModals();

  // 3. Maps
  const { mapBefore, mapAfter } = initMaps();

  // 4. Swipe handle
  initSwipe();

  // 5. Register stats callback before loading rasters
  onStatsReady((side, year, stats) => updateStats(side, year, stats));

  // 6. Wait for both maps to finish their initial style load, then add rasters
  await Promise.all([
    _mapLoaded(mapBefore),
    _mapLoaded(mapAfter),
  ]);

  // Hide the full-page loading overlay
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    // Give raster loading a moment to kick off before hiding the map-level spinner
    setTimeout(() => { overlay.hidden = true; }, 200);
  }

  // 7. Load COG layers (async – demo placeholders render immediately)
  await loadAllRasters(mapBefore, mapAfter);

  // 8. Load boundary overlays on top of rasters
  await initBoundaries(mapBefore, mapAfter);

  // 9. Re-attach rasters then boundaries after basemap style changes.
  // "style.load" fires once per setStyle() call, after the style is fully parsed.
  mapBefore.on("style.load", () => { reattachLayers(mapBefore, mapAfter); reattachBoundaries(); });
  mapAfter.on("style.load",  () => { reattachLayers(mapBefore, mapAfter); reattachBoundaries(); });
}

// Resolves when the map's initial style has loaded
function _mapLoaded(map) {
  return new Promise(resolve => {
    if (map.isStyleLoaded()) { resolve(); return; }
    map.once("load", resolve);
  });
}

main().catch(err => {
  console.error("[app] Initialisation failed:", err);
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.innerHTML = `<div class="loading-content">
      <p class="loading-error">Application failed to start.<br>${err.message}</p>
    </div>`;
    overlay.hidden = false;
  }
});
