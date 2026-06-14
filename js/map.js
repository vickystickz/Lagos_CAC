/**
 * map.js
 * Initialises and synchronises the two MapLibre GL instances for Eti-Osa LGA
 * coastal change monitoring:
 *   mapBefore  – left map (full-width beneath), year selectable
 *   mapAfter   – right map (clipped on the right side by swipe handle), year selectable
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
  mapBefore.addControl(new _HomeControl(), "top-right");
  mapBefore.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

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

// ─── Internal: home/reset control ────────────────────────────────────────────
class _HomeControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = "Zoom to Eti-Osa study area";
    btn.setAttribute("aria-label", "Zoom to Eti-Osa study area");
    btn.innerHTML = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"
        style="width:18px;height:18px;display:block;margin:auto">
      <path d="M3 9.5L10 3L17 9.5V17H13V13H7V17H3V9.5Z"
            stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`;
    btn.addEventListener("click", flyToLagos);

    this._container.appendChild(btn);
    return this._container;
  }

  onRemove() {
    this._container.parentNode?.removeChild(this._container);
    this._map = undefined;
  }
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
