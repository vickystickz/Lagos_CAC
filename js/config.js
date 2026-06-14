/**
 * config.js
 * Central configuration for the Lagos Coastal Change Monitor.
 * Replace the COG URL constants with your actual Cloud Optimized GeoTIFF endpoints
 * before deploying. URLs can point to:
 *   - Publicly accessible COG files (S3, GCS, Azure Blob)
 *   - A TiTiler server  (e.g. https://titiler.example.com/cog/tiles/{z}/{x}/{y})
 *   - A local dev server serving the file with CORS enabled
 */

// ─── Years registry ───────────────────────────────────────────────────────────
// Add future years here — the UI selectors populate from this object.
export const YEARS = {
  2020: { label: "2020", url: "./data/LCC_2020_cog_4326.tif" },
  2025: { label: "2025", url: "./data/LCC_2025_cog_4326.tif" },
};

// Default year assignment for each map side
export const DEFAULT_YEAR_BEFORE = 2020;
export const DEFAULT_YEAR_AFTER  = 2025;

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
  center: [3.52, 6.45], // Eti-Osa center
  zoom: 12,
  minZoom: 10,
  maxZoom: 18,

  // Restrict panning to Eti-Osa and immediate surroundings
  maxBounds: [
    [3.25, 6.30], // SW [lng, lat]
    [3.75, 6.65]  // NE [lng, lat]
  ],

  // Used by "Zoom to Study Area" button
  fitBounds: [
    [3.35, 6.33],
    [3.68, 6.58]
  ]
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

// ─── Source / layer IDs (side-based, not year-based) ─────────────────────────
export const SRC_BEFORE = "cog-before";
export const LYR_BEFORE = "cog-before-layer";
export const SRC_AFTER  = "cog-after";
export const LYR_AFTER  = "cog-after-layer";

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
