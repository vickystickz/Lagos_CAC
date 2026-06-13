/**
 * raster.js
 * Loads COGs with geotiff.js, applies the classification palette, and injects
 * the result into MapLibre GL as an 'image' source.
 *
 * Source / layer IDs are SIDE-based ("before" / "after"), not year-based,
 * so any year can be loaded on either side at runtime.
 */

import {
  PALETTE, RASTER_OPACITY, RASTER_FADE_MS, hexToRgb,
  YEARS, DEFAULT_YEAR_BEFORE, DEFAULT_YEAR_AFTER,
  SRC_BEFORE, LYR_BEFORE,
  SRC_AFTER,  LYR_AFTER,
} from "./config.js";

const MAX_DIM = 1600;

// Loaded state keyed by side
const loaded = { before: false, after: false };

// Callbacks: (side, year, stats)
const statsCallbacks = [];
export function onStatsReady(cb) { statsCallbacks.push(cb); }

// Cache data-URIs + coords so layers survive a basemap style swap
const _sourceCache = {};

// ─── Public ──────────────────────────────────────────────────────────────────

export async function loadAllRasters(mapBefore, mapAfter) {
  await Promise.allSettled([
    _loadRasterLayer(
      YEARS[DEFAULT_YEAR_BEFORE].url, mapBefore,
      SRC_BEFORE, LYR_BEFORE, "before", DEFAULT_YEAR_BEFORE
    ),
    _loadRasterLayer(
      YEARS[DEFAULT_YEAR_AFTER].url, mapAfter,
      SRC_AFTER, LYR_AFTER, "after", DEFAULT_YEAR_AFTER
    ),
  ]);
}

// Swap the raster on one side to a different year
export async function swapYear(map, side, year) {
  const src   = side === "before" ? SRC_BEFORE : SRC_AFTER;
  const lyr   = side === "before" ? LYR_BEFORE : LYR_AFTER;
  const entry = YEARS[year];
  if (!entry) return;
  loaded[side] = false;
  await _loadRasterLayer(entry.url, map, src, lyr, side, year);
}

export function setLayerVisible(map, layerId, visible) {
  if (!map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

export function reattachLayers(mapBefore, mapAfter) {
  if (loaded.before) _readdSource(mapBefore, SRC_BEFORE, LYR_BEFORE);
  if (loaded.after)  _readdSource(mapAfter,  SRC_AFTER,  LYR_AFTER);
}

// ─── Core loader ─────────────────────────────────────────────────────────────

async function _loadRasterLayer(url, map, sourceId, layerId, side, year) {
  if (url.startsWith("REPLACE_")) {
    _showDemoMode(map, sourceId, layerId, side, year);
    return;
  }

  _setLoadingState(side, true);

  try {
    const tiff  = await GeoTIFF.fromUrl(url, { allowFullFile: true });
    const image = await tiff.getImage();
    const W0    = image.getWidth();
    const H0    = image.getHeight();

    const bbox = _getBbox(image);
    const [minX, minY, maxX, maxY] = bbox;

    const gk           = image.geoKeys || {};
    const epsg         = gk.ProjectedCSTypeGeoKey || gk.GeographicTypeGeoKey || null;
    const isGeographic = gk.GTModelTypeGeoKey === 2 ||
                         (minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90);

    const scale = Math.min(1, MAX_DIM / Math.max(W0, H0));
    const W     = Math.max(1, Math.round(W0 * scale));
    const H     = Math.max(1, Math.round(H0 * scale));

    const rasters = await image.readRasters({
      width: W, height: H, resampleMethod: "nearest",
      interleave: false, samples: [0],
    });
    const data = rasters[0];

    const dataUri = _renderToCanvas(data, W, H);
    const coords  = _toWGS84Coords(minX, minY, maxX, maxY, isGeographic, epsg);
    if (!coords) throw new Error(`Could not reproject EPSG:${epsg} to WGS84.`);

    _injectImageSource(map, sourceId, layerId, dataUri, coords);
    _sourceCache[sourceId] = { dataUri, coords };
    loaded[side] = true;

    const stats = _computeStats(data);
    statsCallbacks.forEach(cb => cb(side, year, stats));
    _setLoadingState(side, false);

  } catch (err) {
    _setLoadingState(side, false);
    _showError(side, year, err.message);
    console.error(`[raster] ${year} (${side}) load failed:`, err);
  }
}

// ─── Bbox extraction ─────────────────────────────────────────────────────────

function _getBbox(image) {
  try { return image.getBoundingBox(); } catch (_) {}

  const fd = image.fileDirectory;
  const W  = image.getWidth();
  const H  = image.getHeight();

  const scale    = fd.ModelPixelScale;
  const tiepoint = fd.ModelTiepoint;
  if (scale && tiepoint && tiepoint.length >= 6) {
    const [scaleX, scaleY] = scale;
    const originX = tiepoint[3];
    const originY = tiepoint[4];
    return [originX, originY - scaleY * H, originX + scaleX * W, originY];
  }

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

// ─── Coordinate reprojection ─────────────────────────────────────────────────

function _toWGS84Coords(minX, minY, maxX, maxY, isGeographic, epsg) {
  let toWGS;

  if (isGeographic || !epsg || epsg === 4326) {
    toWGS = (x, y) => [x, y];
  } else if (typeof proj4 !== "undefined") {
    try { toWGS = (x, y) => proj4(`EPSG:${epsg}`, "EPSG:4326", [x, y]); }
    catch (_) { return null; }
  } else if (epsg === 32631 || epsg === 32632) {
    const zone = epsg === 32631 ? 31 : 32;
    toWGS = (x, y) => { const r = _utmToWGS84(x, y, zone); return [r.lng, r.lat]; };
  } else {
    return null;
  }

  const TL = toWGS(minX, maxY);
  const TR = toWGS(maxX, maxY);
  const BR = toWGS(maxX, minY);
  const BL = toWGS(minX, minY);
  if (![TL, TR, BR, BL].flat().every(Number.isFinite)) return null;
  return [TL, TR, BR, BL];
}

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
      buf[offset + 3] = 0;
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

// ─── Demo mode ───────────────────────────────────────────────────────────────

function _showDemoMode(map, sourceId, layerId, side, year) {
  const W = 256, H = 256;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  const isAfter = side === "after";
  const blocks = [
    { cls: 4, x:0,   y:0,   w:256, h:80  },
    { cls: 3, x:0,   y:80,  w:100, h:100 },
    { cls: 2, x:100, y:80,  w: isAfter ? 130 : 100, h:80 },
    { cls: 7, x:200, y:80,  w:56,  h:80  },
    { cls: 1, x:0,   y:180, w:256, h:76  },
  ];
  blocks.forEach(({ cls, x, y, w, h }) => {
    ctx.fillStyle = PALETTE[cls].color;
    ctx.fillRect(x, y, w, h);
  });

  const coords  = [[3.30,6.65],[3.60,6.65],[3.60,6.40],[3.30,6.40]];
  const dataUri = canvas.toDataURL("image/png");
  _injectImageSource(map, sourceId, layerId, dataUri, coords);
  _sourceCache[sourceId] = { dataUri, coords };
  loaded[side] = true;

  const demoStats = {
    1: { count:4864,  pct:"7.4"  },
    2: { count:18432, pct: isAfter ? "28.1" : "23.2" },
    3: { count:16384, pct: isAfter ? "24.9" : "30.1" },
    4: { count:20480, pct:"31.2" },
    7: { count:5120,  pct: isAfter ? "7.8"  : "4.1"  },
  };
  statsCallbacks.forEach(cb => cb(side, year, demoStats));
  _setLoadingState(side, false);
  _showDemoBanner();
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

const _loadingDone = { before: false, after: false };

function _setLoadingState(side, loading) {
  const el = document.getElementById(`loading-${side}`);
  if (el) el.hidden = !loading;
  _loadingDone[side] = !loading;
  if (_loadingDone.before && _loadingDone.after) {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.hidden = true;
  }
}

function _showError(side, year, msg) {
  const c = document.getElementById("toast-container");
  if (!c) return;
  const t = document.createElement("div");
  t.className = "toast toast-error";
  t.textContent = `Error loading ${year} (${side}) layer: ${msg}`;
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
