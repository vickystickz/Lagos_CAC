/**
 * boundaries.js
 * Loads Eti-Osa LGA boundary GeoJSON files and renders them as line layers
 * on top of both map instances. Survives basemap style swaps via reattachBoundaries().
 */

const BOUNDARIES = {
  "eti-osa": {
    url:   "./data/eti_osa.geojson",
    srcId: "src-eti-osa",
    lyrId: "lyr-eti-osa",
    color: "#CC1B1B",  // Lagos red — main LGA boundary
    width: 2.5,
    dash:  null,
  },
  "eti-osa-ext": {
    url:   "./data/eti_osa_ext.geojson",
    srcId: "src-eti-osa-ext",
    lyrId: "lyr-eti-osa-ext",
    color: "#CC1B1B",  // Lagos yellow — extended study area
    width: 2.8,
    dash:  [5, 3],
  },
};

let _maps    = { before: null, after: null };
const _cache   = {}; // srcId → GeoJSON FeatureCollection
const _visible = { "eti-osa": false, "eti-osa-ext": false };

// ─── Public ───────────────────────────────────────────────────────────────────

export async function initBoundaries(mapBefore, mapAfter) {
  _maps.before = mapBefore;
  _maps.after  = mapAfter;

  await Promise.allSettled(
    Object.entries(BOUNDARIES).map(([key, cfg]) => _loadBoundary(key, cfg))
  );
}

// Call after a basemap setStyle() wipes the map's sources/layers
export function reattachBoundaries() {
  Object.entries(BOUNDARIES).forEach(([key, cfg]) => {
    const data = _cache[cfg.srcId];
    if (!data) return;
    [_maps.before, _maps.after].forEach(map => {
      if (!map) return;
      _addToMap(map, cfg, data);
      if (!_visible[key]) {
        map.setLayoutProperty(cfg.lyrId, "visibility", "none");
      }
    });
  });
}

export function setBoundaryVisible(key, visible) {
  _visible[key] = visible;
  const cfg = BOUNDARIES[key];
  if (!cfg) return;
  [_maps.before, _maps.after].forEach(map => {
    if (!map || !map.getLayer(cfg.lyrId)) return;
    map.setLayoutProperty(cfg.lyrId, "visibility", visible ? "visible" : "none");
  });
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function _loadBoundary(key, cfg) {
  try {
    const r    = await fetch(cfg.url);
    const data = await r.json();
    _cache[cfg.srcId] = data;
    [_maps.before, _maps.after].forEach(map => {
      if (!map) return;
      _addToMap(map, cfg, data);
      if (!_visible[key]) {
        map.setLayoutProperty(cfg.lyrId, "visibility", "none");
      }
    });
  } catch (e) {
    console.warn(`[boundaries] Failed to load ${cfg.url}:`, e);
  }
}

function _addToMap(map, cfg, data) {
  if (map.getLayer(cfg.lyrId))  map.removeLayer(cfg.lyrId);
  if (map.getSource(cfg.srcId)) map.removeSource(cfg.srcId);

  map.addSource(cfg.srcId, { type: "geojson", data });

  const paint = {
    "line-color":   cfg.color,
    "line-width":   cfg.width,
    "line-opacity": 0.9,
  };
  if (cfg.dash) paint["line-dasharray"] = cfg.dash;

  map.addLayer({ id: cfg.lyrId, type: "line", source: cfg.srcId, paint });
}
