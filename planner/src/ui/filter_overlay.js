// Pure positioning math for the filter-overlay layer in the schedule grid.
// The browser-side buildGrid wrap in index.html feeds this function the
// current grid geometry and the active filter set; it returns a list of
// rectangles to draw inside a .filter-overlay-layer. No DOM dependencies —
// the caller does the element creation.
//
// The function enforces the edge cases from the overlay feature spec:
//   - invisible filters don't produce blocks
//   - filters whose session doesn't match `half` are skipped
//   - filter times are clipped to the grid's [minTime, maxTime] window;
//     wholly-outside filters produce zero blocks
//   - filters that apply to days the grid doesn't show produce no block
//     for those days

/**
 * @typedef {Object} Filter
 * @property {string|number} id
 * @property {string} name
 * @property {string[]} days - e.g. ["M","W","F"]
 * @property {number} start - minutes since midnight
 * @property {number} end - minutes since midnight
 * @property {string} session - "AD" | "A71" | "A72"
 * @property {boolean} visible
 * @property {string} pattern - "solid" | "stripes" | "dots" | "grid"
 * @property {string} color - hex or named
 */

/**
 * @typedef {Object} DayBound
 * @property {string} day
 * @property {number} left
 * @property {number} width
 */

/**
 * @typedef {Object} GridState
 * @property {number} minTime - start of earliest rendered slot row, in minutes
 * @property {number} maxTime - end of latest rendered slot row, in minutes
 * @property {number} axisTopPx - pixel y of the top of the first slot row
 * @property {number} axisBottomPx - pixel y of the bottom of the last slot row
 * @property {DayBound[]} dayBounds - one per visible day column in source order
 * @property {string} half - "A71" | "A72"
 */

/**
 * @typedef {Object} OverlayBlock
 * @property {string|number} filterId
 * @property {string} day
 * @property {number} top
 * @property {number} height
 * @property {number} left
 * @property {number} width
 * @property {string} pattern
 * @property {string} color
 * @property {string} name
 */

export function computeOverlayBlocks(filters, gridState) {
  const out = [];
  if (!Array.isArray(filters) || filters.length === 0) return out;
  if (!gridState) return out;
  const { minTime, maxTime, axisTopPx, axisBottomPx, dayBounds, half } = gridState;
  const timeSpan = maxTime - minTime;
  const axisHeightPx = axisBottomPx - axisTopPx;
  if (!isFinite(timeSpan) || timeSpan <= 0) return out;
  if (!isFinite(axisHeightPx) || axisHeightPx <= 0) return out;

  for (const f of filters) {
    if (!f || !f.visible) continue;
    if (f.session !== "AD" && f.session !== half) continue;
    // Clip to grid time window.
    const clippedStart = Math.max(f.start, minTime);
    const clippedEnd = Math.min(f.end, maxTime);
    if (clippedEnd <= clippedStart) continue;

    const topPx = axisTopPx + ((clippedStart - minTime) / timeSpan) * axisHeightPx;
    const heightPx = ((clippedEnd - clippedStart) / timeSpan) * axisHeightPx;

    for (const d of f.days || []) {
      const bounds = dayBounds.find((b) => b.day === d);
      if (!bounds) continue; // day not shown in grid
      out.push({
        filterId: f.id,
        day: d,
        top: topPx,
        height: heightPx,
        left: bounds.left,
        width: bounds.width,
        pattern: f.pattern,
        color: f.color,
        name: f.name,
      });
    }
  }
  return out;
}
