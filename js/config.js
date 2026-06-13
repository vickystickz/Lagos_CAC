/**
 * config.js
 * Central configuration for the Lagos Coastal Change Monitor.
 * Replace the COG URL constants with your actual Cloud Optimized GeoTIFF endpoints
 * before deploying. URLs can point to:
 *   - Publicly accessible COG files (S3, GCS, Azure Blob)
 *   - A TiTiler server  (e.g. https://titiler.example.com/cog/tiles/{z}/{x}/{y})
 *   - A local dev server serving the file with CORS enabled
 */

// ─── COG source URLs ──────────────────────────────────────────────────────────
// Local files served from the data/ folder (relative to index.html).
// These are COGs already projected to EPSG:4326 (WGS84).
export const COG_2020_URL = "./data/LCC_2020_cog_4326.tif";
export const COG_2025_URL = "./data/LCC_2025_cog_4326.tif";

// ─── Classification palette ──────────────────────────────────────────────────
export const PALETTE = {
  1: { color: "#f5e2a3", label: "Beach & Intertidal Zone" },
  2: { color: "#e31a1c", label: "Built-up"                },
  3: { color: "#41ab5d", label: "Vegetation"              },
  4: { color: "#1f78b4", label: "Water"                   },
  7: { color: "#a6a6a6", label: "Bare / Reclaimed Land"   },
};

// ─── Map initial view ─────────────────────────────────────────────────────────
export const MAP_CONFIG = {
  center:    [3.45, 6.50],  // Lagos coastal study area [lng, lat]
  zoom:      11,
  minZoom:   9,             // prevent zooming out past regional scale
  maxZoom:   18,
  // Hard geographic limit: map cannot be panned or zoomed outside this box
  maxBounds: [[2.50, 5.80], [4.80, 7.50]], // [SW, NE] — Lagos + buffer
  // Bounding box for "Zoom to Lagos" control
  fitBounds: [[3.20, 6.30], [3.70, 6.70]],
};

// ─── Basemap styles ───────────────────────────────────────────────────────────
// Using inline raster-tile style objects (not remote style JSON URLs) so the
// maps initialise immediately without an extra network round-trip that can hang.
export const BASEMAPS = {
  light: {
    label: "Light",
    style: {
      version: 8,
      sources: {
        "carto-light": {
          type: "raster",
          tiles: ["https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors, © CARTO",
          maxzoom: 19,
        },
      },
      layers: [{ id: "carto-light-layer", type: "raster", source: "carto-light" }],
    },
  },
  satellite: {
    label: "Satellite",
    style: {
      version: 8,
      sources: {
        satellite: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "Esri",
          maxzoom: 19,
        },
      },
      layers: [{ id: "satellite-layer", type: "raster", source: "satellite" }],
    },
  },
};

// ─── Raster layer opacity ─────────────────────────────────────────────────────
export const RASTER_OPACITY   = 0.88;
export const RASTER_FADE_MS   = 400;

// ─── Source / layer ID prefixes ───────────────────────────────────────────────
export const SRC_2020  = "cog-2020";
export const LYR_2020  = "cog-2020-layer";
export const SRC_2025  = "cog-2025";
export const LYR_2025  = "cog-2025-layer";

// ─── Utility: parse hex colour → { r, g, b } ─────────────────────────────────
export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// ─── Utility: build MapLibre image-source coordinate ring from bbox ───────────
// bbox = [west, south, east, north]  (all in WGS84 degrees)
export function bboxToCoords([west, south, east, north]) {
  return [
    [west, north], // top-left
    [east, north], // top-right
    [east, south], // bottom-right
    [west, south], // bottom-left
  ];
}
