/**
 * map.js
 * Initialises and synchronises the two MapLibre GL instances:
 *   mapBefore  – renders the 2020 classification (always full-width beneath)
 *   mapAfter   – renders the 2025 classification (clipped on the right side)
 *
 * Synchronisation is bi-directional but guarded by a `syncing` flag to
 * prevent event feedback loops.
 */

import { MAP_CONFIG, BASEMAPS } from "./config.js";

let mapBefore = null;
let mapAfter  = null;
let syncing   = false;

// ─── Public: initialise both maps ─────────────────────────────────────────────
export function initMaps() {
  const sharedOptions = {
    center:      MAP_CONFIG.center,
    zoom:        MAP_CONFIG.zoom,
    minZoom:     MAP_CONFIG.minZoom,
    maxZoom:     MAP_CONFIG.maxZoom,
    maxBounds:   MAP_CONFIG.maxBounds,
    attributionControl: false,
    logoPosition: "bottom-left",
  };

  mapBefore = new maplibregl.Map({
    container: "map-before",
    style:     BASEMAPS.light.style,
    ...sharedOptions,
  });

  mapAfter = new maplibregl.Map({
    container: "map-after",
    style:     BASEMAPS.light.style,
    ...sharedOptions,
  });

  // Navigation + scale only on the "before" map to avoid duplication
  mapBefore.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
  mapBefore.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
  mapBefore.addControl(new maplibregl.FullscreenControl(), "top-right");

  // Attribution on both (legally required)
  mapBefore.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
  mapAfter.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

  // Bidirectional sync
  _bindSync(mapBefore, mapAfter);
  _bindSync(mapAfter,  mapBefore);

  return { mapBefore, mapAfter };
}

// ─── Public: get map instances (after init) ────────────────────────────────────
export function getMaps() {
  return { mapBefore, mapAfter };
}

// ─── Public: swap basemap style on both maps ─────────────────────────────────
export function setBasemap(styleKey) {
  const style = BASEMAPS[styleKey]?.style;
  if (!style) return;

  // MapLibre re-loads all sources/layers on setStyle; we re-add rasters after.
  // The raster module listens for 'styledata' to re-add layers.
  mapBefore.setStyle(style);
  mapAfter.setStyle(style);
}

// ─── Public: fly both maps to Lagos study area ────────────────────────────────
export function flyToLagos() {
  const [sw, ne] = MAP_CONFIG.fitBounds;
  mapBefore.fitBounds([sw, ne], { padding: 40, duration: 1200 });
  // mapAfter will follow via sync
}

// ─── Internal: one-directional camera sync ────────────────────────────────────
function _bindSync(source, target) {
  source.on("move", () => {
    if (syncing) return;
    syncing = true;
    target.jumpTo({
      center:  source.getCenter(),
      zoom:    source.getZoom(),
      bearing: source.getBearing(),
      pitch:   source.getPitch(),
    });
    syncing = false;
  });
}
