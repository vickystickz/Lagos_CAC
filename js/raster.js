/**
 * raster.js
 * Loads COGs with geotiff.js, applies the classification palette, and injects
 * the result into MapLibre GL as an 'image' source.
 *
 * Rendering pipeline (matches the approach proven in coastal-classification-map.html):
 *  1. GeoTIFF.fromUrl()         – open COG, reads only the index block
 *  2. tiff.getImage()           – always image 0 (full-res); the ONLY IFD that
 *                                  carries ModelTiepoint / ModelPixelScale tags
 *  3. _getBbox()                – robust bbox with raw-tag fallbacks
 *  4. readRasters({width, height, resampleMethod:"nearest"})
 *                               – geotiff.js selects the right overview level
 *                                  internally; "nearest" preserves integer class IDs
 *  5. Pixel loop → RGBA canvas  – map class int → hex palette → Uint8ClampedArray
 *  6. canvas.toDataURL()        – data URI added as MapLibre 'image' source
 */

import {
  PALETTE,
  RASTER_OPACITY,
  RASTER_FADE_MS,
  hexToRgb,
  COG_2020_URL,
  COG_2025_URL,
  SRC_2020, LYR_2020,
  SRC_2025, LYR_2025,
} from "./config.js";

// Max pixel dimension for the display canvas (keeps memory reasonable)
const MAX_DIM = 1600;

// Track whether each year has successfully loaded
const loaded = { 2020: false, 2025: false };

// Callbacks invoked with (year, stats) once pixel data is processed
const statsCallbacks = [];
export function onStatsReady(cb) { statsCallbacks.push(cb); }

// Cache data-URIs + coords so layers survive a basemap style swap
const _sourceCache = {};

// ─── Public ──────────────────────────────────────────────────────────────────

export async function loadAllRasters(mapBefore, mapAfter) {
  await Promise.allSettled([
    _loadRasterLayer(COG_2020_URL, mapBefore, SRC_2020, LYR_2020, 2020),
    _loadRasterLayer(COG_2025_URL, mapAfter,  SRC_2025, LYR_2025, 2025),
  ]);
}

export function setLayerVisible(map, layerId, visible) {
  if (!map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

export function reattachLayers(mapBefore, mapAfter) {
  if (loaded[2020]) _readdSource(mapBefore, SRC_2020, LYR_2020);
  if (loaded[2025]) _readdSource(mapAfter,  SRC_2025, LYR_2025);
}

// ─── Core loader ─────────────────────────────────────────────────────────────

async function _loadRasterLayer(url, map, sourceId, layerId, year) {
  if (url.startsWith("REPLACE_")) {
    _showDemoMode(map, sourceId, layerId, year);
    return;
  }

  _setLoadingState(year, true);

  try {
    // ── Step 1: open COG (only fetches the index block, not the pixels) ──────
    const tiff = await GeoTIFF.fromUrl(url, { allowFullFile: true });

    // ── Step 2: always use image 0 ────────────────────────────────────────────
    // Overview IFDs (index 1, 2 …) don't carry geo-referencing tags.
    // Calling getImage() with no argument is equivalent to getImage(0).
    const image = await tiff.getImage();
    const W0 = image.getWidth();
    const H0 = image.getHeight();

    // ── Step 3: bbox + CRS ────────────────────────────────────────────────────
    const bbox = _getBbox(image);
    const [minX, minY, maxX, maxY] = bbox;

    const gk            = image.geoKeys || {};
    const epsg          = gk.ProjectedCSTypeGeoKey || gk.GeographicTypeGeoKey || null;
    const isGeographic  = gk.GTModelTypeGeoKey === 2 ||
                          (minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90);

    // ── Step 4: display resolution (cap longest side at MAX_DIM) ─────────────
    const scale = Math.min(1, MAX_DIM / Math.max(W0, H0));
    const W     = Math.max(1, Math.round(W0 * scale));
    const H     = Math.max(1, Math.round(H0 * scale));

    // ── Step 5: read pixels ───────────────────────────────────────────────────
    // Passing width/height lets geotiff.js pick the best overview internally.
    // resampleMethod:"nearest" is critical — it preserves integer class IDs.
    const rasters = await image.readRasters({
      width:          W,
      height:         H,
      resampleMethod: "nearest",
      interleave:     false,
      samples:        [0],
    });
    const data = rasters[0];

    // ── Step 6: palette → RGBA canvas ─────────────────────────────────────────
    const dataUri = _renderToCanvas(data, W, H);

    // ── Step 7: build WGS84 corner coordinates for MapLibre ──────────────────
    const coords = _toWGS84Coords(minX, minY, maxX, maxY, isGeographic, epsg);
    if (!coords) {
      throw new Error(`Could not reproject EPSG:${epsg} to WGS84. Add proj4.js or reproject the file to EPSG:4326 first.`);
    }

    // ── Step 8: add to map ────────────────────────────────────────────────────
    _injectImageSource(map, sourceId, layerId, dataUri, coords);
    _sourceCache[sourceId] = { dataUri, coords };
    loaded[year] = true;

    // ── Step 9: stats ─────────────────────────────────────────────────────────
    const stats = _computeStats(data);
    statsCallbacks.forEach(cb => cb(year, stats));

    _setLoadingState(year, false);

  } catch (err) {
    _setLoadingState(year, false);
    _showError(year, err.message);
    console.error(`[raster] ${year} load failed:`, err);
  }
}

// ─── Bbox extraction (with raw-tag fallbacks) ─────────────────────────────────

function _getBbox(image) {
  // Standard geotiff.js method
  try { return image.getBoundingBox(); } catch (_) {}

  const fd = image.fileDirectory;
  const W  = image.getWidth();
  const H  = image.getHeight();

  // ModelPixelScale + ModelTiepoint (most GDAL/QGIS output)
  const scale    = fd.ModelPixelScale;
  const tiepoint = fd.ModelTiepoint;
  if (scale && tiepoint && tiepoint.length >= 6) {
    const [scaleX, scaleY] = scale;
    const originX = tiepoint[3]; // model X at pixel col 0
    const originY = tiepoint[4]; // model Y at pixel row 0 (top-left)
    return [originX, originY - scaleY * H, originX + scaleX * W, originY];
  }

  // ModelTransformation (4×4 affine matrix)
  const mt = fd.ModelTransformation;
  if (mt && mt.length >= 16) {
    const a = mt[0], b = mt[1], d = mt[4], e = mt[5];
    const ox = mt[3], oy = mt[7];
    const corners = [[ox, oy], [ox + a*W + b*H, oy + d*W + e*H]];
    const xs = corners.map(c => c[0]);
    const ys = corners.map(c => c[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  throw new Error(
    "GeoTIFF has no affine transformation tags. " +
    "Re-export with: gdal_translate -of COG -a_srs EPSG:4326 input.tif output.tif"
  );
}

// ─── Coordinate reprojection → MapLibre corner array ─────────────────────────
// Returns [[TL], [TR], [BR], [BL]] in WGS84, or null if unable to reproject.

function _toWGS84Coords(minX, minY, maxX, maxY, isGeographic, epsg) {
  let toWGS;

  if (isGeographic || !epsg || epsg === 4326) {
    // Already lon/lat — pass through
    toWGS = (x, y) => [x, y];

  } else if (typeof proj4 !== "undefined") {
    // proj4.js is loaded (add <script src="proj4.js"> if you need non-4326 files)
    try {
      toWGS = (x, y) => proj4(`EPSG:${epsg}`, "EPSG:4326", [x, y]);
    } catch (_) { return null; }

  } else if (epsg === 32631 || epsg === 32632) {
    // Lightweight built-in UTM fallback for zone 31N / 32N
    const zone = epsg === 32631 ? 31 : 32;
    toWGS = (x, y) => { const r = _utmToWGS84(x, y, zone); return [r.lng, r.lat]; };

  } else {
    return null; // unknown CRS, no reprojection available
  }

  const TL = toWGS(minX, maxY);
  const TR = toWGS(maxX, maxY);
  const BR = toWGS(maxX, minY);
  const BL = toWGS(minX, minY);

  // Sanity check
  if (![TL, TR, BR, BL].flat().every(Number.isFinite)) return null;

  return [TL, TR, BR, BL];
}

// Simplified UTM → WGS84 (accurate to ~1 m; covers West Africa UTM zones)
function _utmToWGS84(easting, northing, zone) {
  const k0=0.9996, a=6378137, e=0.0818192;
  const e2=e*e, e4=e2*e2, e6=e4*e2;
  const lon0=((zone-1)*6-180+3)*(Math.PI/180);
  const x=easting-500000, y=northing;
  const M=y/k0;
  const mu=M/(a*(1-e2/4-3*e4/64-5*e6/256));
  const p1=(3*e/2-27*e**3/32)*Math.sin(2*mu);
  const p2=(21*e2/16-55*e4/32)*Math.sin(4*mu);
  const p3=(151*e**3/96)*Math.sin(6*mu);
  const phi1=mu+p1+p2+p3;
  const N1=a/Math.sqrt(1-e2*Math.sin(phi1)**2);
  const T1=Math.tan(phi1)**2;
  const C1=e2*Math.cos(phi1)**2/(1-e2);
  const R1=a*(1-e2)/(1-e2*Math.sin(phi1)**2)**1.5;
  const D=x/(N1*k0);
  const lat=phi1-(N1*Math.tan(phi1)/R1)*(D*D/2-(5+3*T1+10*C1-4*C1**2-9*e2)*D**4/24+(61+90*T1+298*C1+45*T1**2-252*e2-3*C1**2)*D**6/720);
  const lon=lon0+(D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1**2+8*e2+24*T1**2)*D**5/120)/Math.cos(phi1);
  return { lat: lat*(180/Math.PI), lng: lon*(180/Math.PI) };
}

// ─── Palette rendering ────────────────────────────────────────────────────────

function _renderToCanvas(data, W, H) {
  const canvas  = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx     = canvas.getContext("2d");
  const imgData = ctx.createImageData(W, H);
  const buf     = imgData.data;

  for (let i = 0, n = data.length; i < n; i++) {
    const entry  = PALETTE[data[i]];
    const offset = i * 4;
    if (entry) {
      const { r, g, b } = hexToRgb(entry.color);
      buf[offset]     = r;
      buf[offset + 1] = g;
      buf[offset + 2] = b;
      buf[offset + 3] = 230;
    } else {
      buf[offset + 3] = 0; // no-data → transparent
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

// ─── MapLibre source/layer management ────────────────────────────────────────

function _injectImageSource(map, sourceId, layerId, dataUri, coords) {
  if (map.getLayer(layerId))   map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);

  map.addSource(sourceId, { type: "image", url: dataUri, coordinates: coords });
  map.addLayer({
    id: layerId, type: "raster", source: sourceId,
    paint: {
      "raster-opacity":       RASTER_OPACITY,
      "raster-fade-duration": RASTER_FADE_MS,
      "raster-resampling":    "nearest",
    },
  });
}

function _readdSource(map, sourceId, layerId) {
  const cache = _sourceCache[sourceId];
  if (cache) _injectImageSource(map, sourceId, layerId, cache.dataUri, cache.coords);
}

// ─── Class statistics ─────────────────────────────────────────────────────────

function _computeStats(data) {
  const counts = {};
  const total  = data.length;
  for (let i = 0; i < total; i++) {
    const c = data[i];
    if (PALETTE[c]) counts[c] = (counts[c] || 0) + 1;
  }
  const stats = {};
  for (const [cls, count] of Object.entries(counts)) {
    stats[cls] = { count, pct: ((count / total) * 100).toFixed(1) };
  }
  return stats;
}

// ─── Demo mode (placeholder URLs) ────────────────────────────────────────────

function _showDemoMode(map, sourceId, layerId, year) {
  const W = 256, H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  const blocks = [
    { cls: 4, x:0,   y:0,   w:256, h:80  },
    { cls: 3, x:0,   y:80,  w:100, h:100 },
    { cls: 2, x:100, y:80,  w:100, h:80  },
    { cls: 7, x:200, y:80,  w:56,  h:80  },
    { cls: 1, x:0,   y:180, w:256, h:76  },
  ];
  if (year === 2025) { blocks[2].w = 130; blocks[1].w = 70; }
  blocks.forEach(({ cls, x, y, w, h }) => {
    ctx.fillStyle = PALETTE[cls].color;
    ctx.fillRect(x, y, w, h);
  });

  const coords  = [[3.30,6.65],[3.60,6.65],[3.60,6.40],[3.30,6.40]];
  const dataUri = canvas.toDataURL("image/png");
  _injectImageSource(map, sourceId, layerId, dataUri, coords);
  _sourceCache[sourceId] = { dataUri, coords };
  loaded[year] = true;

  const demoStats = {
    1: { count:4864,  pct:"7.4"  },
    2: { count:18432, pct: year===2025 ? "28.1" : "23.2" },
    3: { count:16384, pct: year===2025 ? "24.9" : "30.1" },
    4: { count:20480, pct:"31.2" },
    7: { count:5120,  pct: year===2025 ? "7.8"  : "4.1"  },
  };
  statsCallbacks.forEach(cb => cb(year, demoStats));
  _setLoadingState(year, false);
  _showDemoBanner();
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

const _loadingDone = { 2020: false, 2025: false };

function _setLoadingState(year, loading) {
  const el = document.getElementById(`loading-${year}`);
  if (el) el.hidden = !loading;
  _loadingDone[year] = !loading;
  if (_loadingDone[2020] && _loadingDone[2025]) {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.hidden = true;
  }
}

function _showError(year, msg) {
  const c = document.getElementById("toast-container");
  if (!c) return;
  const t = document.createElement("div");
  t.className = "toast toast-error";
  t.textContent = `Error loading ${year} layer: ${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 8000);
}

function _showDemoBanner() {
  const c = document.getElementById("toast-container");
  if (!c || document.getElementById("demo-banner")) return;
  const b = document.createElement("div");
  b.id = "demo-banner";
  b.className = "toast toast-info";
  b.innerHTML = "<strong>Demo mode</strong> – replace COG URLs in config.js with real file paths.";
  c.appendChild(b);
}
