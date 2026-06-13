/**
 * swipe.js
 * Implements the before/after comparison swipe handle.
 *
 * Technique:
 *   - Two MapLibre containers are stacked absolutely in #comparison-wrapper.
 *   - The "after" (2025) container's clip-path is updated on drag, revealing
 *     or hiding the layer behind the handle line.
 *   - The handle itself is a thin vertical bar with a circular drag button.
 *   - Touch events are fully supported for mobile.
 */

const DEFAULT_POSITION = 50; // percent from left

let position = DEFAULT_POSITION; // current handle position in %
let isDragging = false;
let wrapper = null;
let afterEl  = null;
let handleEl = null;

// ─── Public: wire up swipe interaction ────────────────────────────────────────
export function initSwipe() {
  wrapper  = document.getElementById("comparison-wrapper");
  afterEl  = document.getElementById("map-after");
  handleEl = document.getElementById("swipe-handle");

  if (!wrapper || !afterEl || !handleEl) return;

  _applyPosition(DEFAULT_POSITION);

  // Mouse events
  handleEl.addEventListener("mousedown",  _onStart);
  document.addEventListener("mousemove",  _onMove);
  document.addEventListener("mouseup",    _onEnd);

  // Touch events
  handleEl.addEventListener("touchstart", _onStart, { passive: true });
  document.addEventListener("touchmove",  _onMove,  { passive: false });
  document.addEventListener("touchend",   _onEnd);

  // Allow clicking anywhere on the dividing line to drag from there
  wrapper.addEventListener("click", _onWrapperClick);
}

// ─── Public: reset swipe to 50% ───────────────────────────────────────────────
export function resetSwipe() {
  _applyPosition(DEFAULT_POSITION);
  _animateTo(DEFAULT_POSITION);
}

// ─── Public: get current position ─────────────────────────────────────────────
export function getSwipePosition() { return position; }

// ─── Internal: handle drag start ──────────────────────────────────────────────
function _onStart(e) {
  isDragging = true;
  handleEl.classList.add("dragging");
  e.preventDefault?.();
}

// ─── Internal: handle drag move ───────────────────────────────────────────────
function _onMove(e) {
  if (!isDragging) return;
  if (e.cancelable) e.preventDefault();

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const rect     = wrapper.getBoundingClientRect();
  const pct      = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100));

  _applyPosition(pct);
}

// ─── Internal: handle drag end ────────────────────────────────────────────────
function _onEnd() {
  if (!isDragging) return;
  isDragging = false;
  handleEl.classList.remove("dragging");
}

// ─── Internal: click on wrapper repositions handle ───────────────────────────
function _onWrapperClick(e) {
  if (isDragging) return;
  // Only respond to direct clicks on the wrapper or the swipe line (not on map controls)
  if (e.target !== wrapper && e.target.id !== "swipe-line") return;
  const rect = wrapper.getBoundingClientRect();
  const pct  = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
  _animateTo(pct);
}

// ─── Internal: instantly apply position ───────────────────────────────────────
function _applyPosition(pct) {
  position = pct;

  // Clip the "after" map: show only the RIGHT portion
  afterEl.style.clipPath = `inset(0 0 0 ${pct}%)`;

  // Move the handle bar
  handleEl.style.left = `${pct}%`;

  // Update year label positions (keep them slightly inside their half)
  const labelBefore = document.getElementById("label-before");
  const labelAfter  = document.getElementById("label-after");
  if (labelBefore) labelBefore.style.right = `${100 - pct + 1}%`;
  if (labelAfter)  labelAfter.style.left   = `${pct + 1}%`;
}

// ─── Internal: smooth animation to a target position (CSS transition trick) ───
function _animateTo(targetPct) {
  afterEl.style.transition  = "clip-path 0.35s cubic-bezier(0.4,0,0.2,1)";
  handleEl.style.transition = "left 0.35s cubic-bezier(0.4,0,0.2,1)";

  _applyPosition(targetPct);

  // Remove transition after animation completes so drag feels instant
  setTimeout(() => {
    afterEl.style.transition  = "";
    handleEl.style.transition = "";
  }, 380);
}
