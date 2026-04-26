// Piece 6 — pure data builder for the small candidate-preview grids
// that show in the auto-scheduler results sidebar. Each candidate
// has a tiny grid (~80×120 px in DOM) showing day-columns and
// time-blocks. The DOM rendering itself happens in index.html; this
// module returns the structured data that renderer consumes.
//
// Pure: no DOM access, no globals, no I/O.

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DEFAULT_RANGE = { start: 8 * 60, end: 20 * 60 }; // 08:00–20:00

function _hhmmToMin(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function _minToHhmm(n) {
  const h = Math.floor(n / 60);
  const m = n % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function _byClassNumber(catalogEffective) {
  const map = new Map();
  for (const c of (catalogEffective && catalogEffective.courses) || []) {
    for (const s of c.sections || []) {
      if (s && s.class_number) {
        map.set(String(s.class_number), { course: c, section: s });
      }
    }
  }
  return map;
}

// Course color lookup. We accept it as a parameter to keep this
// module pure (no import on main_planner.js's hash function would
// be wrong here either since both modules already import from each
// other-style — better to inject).
function _defaultColorFor(_code) {
  return { bg: "#E5DBE9", ink: "#2A2A2A" };
}

/**
 * buildPreviewGrid(candidate, catalogEffective, opts)
 *   → { days, time_range, blocks }
 *
 * Each block: { day, start_min, end_min, course_code, color, label }
 *
 * - days: WEEKDAYS — kept consistent so the renderer can size
 *   day-columns identically across every candidate's preview grid.
 * - time_range: chosen as the bounding box of the candidate's actual
 *   meetings, snapped to half-hour boundaries, with a 30 min margin
 *   above/below. Falls back to DEFAULT_RANGE for empty candidates.
 * - blocks: one entry per (day × meeting). Days outside WEEKDAYS
 *   are dropped (the preview grid only shows weekdays).
 */
export function buildPreviewGrid(candidate, catalogEffective, opts = {}) {
  const colorFor = (typeof opts.colorFor === "function") ? opts.colorFor : _defaultColorFor;
  const byCN = _byClassNumber(catalogEffective);
  const blocks = [];
  let tMin = Infinity;
  let tMax = -Infinity;

  for (const ref of (candidate && candidate.sections) || []) {
    const hit = byCN.get(String(ref.class_number));
    if (!hit) continue;
    const courseCode = hit.course.code;
    const color = colorFor(courseCode);
    const label = (hit.section.component || "").slice(0, 3);
    for (const m of (hit.section.meetings || [])) {
      const start = _hhmmToMin(m.start_time);
      const end = _hhmmToMin(m.end_time);
      if (start == null || end == null || end <= start) continue;
      for (const d of (m.days || [])) {
        if (!WEEKDAYS.includes(d)) continue;
        blocks.push({
          day: d,
          start_min: start,
          end_min: end,
          course_code: courseCode,
          color: color,
          label: label,
        });
        if (start < tMin) tMin = start;
        if (end > tMax) tMax = end;
      }
    }
  }

  if (!isFinite(tMin) || !isFinite(tMax)) {
    return {
      days: WEEKDAYS,
      time_range: { start: _minToHhmm(DEFAULT_RANGE.start), end: _minToHhmm(DEFAULT_RANGE.end) },
      blocks: [],
    };
  }

  // Snap to half-hour and pad by 30 min, but stay within sensible
  // 06:00–22:00 bounds.
  const padded_start = Math.max(6 * 60, Math.floor((tMin - 30) / 30) * 30);
  const padded_end = Math.min(22 * 60, Math.ceil((tMax + 30) / 30) * 30);

  return {
    days: WEEKDAYS,
    time_range: { start: _minToHhmm(padded_start), end: _minToHhmm(padded_end) },
    blocks: blocks.sort((a, b) =>
      WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day) ||
      a.start_min - b.start_min,
    ),
  };
}
