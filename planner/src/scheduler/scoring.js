// Piece 6 — pure scoring of a candidate schedule against soft user
// preferences. Lower score = better candidate.
//
// All preferences contribute additively with no weighting in v1
// (1:1). The solver calls scoreCandidate() once per fully-assigned
// candidate; the sidebar sorts ascending.
//
// Sections fed into scoreCandidate are expected in their effective
// catalog shape: section.meetings[i].{days, start_time, end_time}
// with day tokens "Mon"/"Tue"/... and HH:MM strings. Anything that
// can't be parsed (no times, weekend-only days, etc.) is silently
// skipped — empty schedules score 0, which is what the user wants
// when they haven't added anything yet.

// Day tokens we score against. Weekend classes don't trigger lunch
// or balance penalties (NYUAD doesn't schedule Sat/Sun normally,
// but we don't crash if they appear).
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function _hhmmToMin(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mn = Number(m[2]);
  if (h < 0 || h > 23 || mn < 0 || mn > 59) return null;
  return h * 60 + mn;
}

// Flatten staged sections into per-day meeting blocks: { day, start, end }.
// One block per (day × meeting). Blocks for unrecognized days or
// invalid times are silently dropped — scoring is best-effort.
function _flattenMeetings(sections) {
  const blocks = [];
  for (const s of sections || []) {
    for (const m of (s.meetings || [])) {
      const start = _hhmmToMin(m.start_time);
      const end = _hhmmToMin(m.end_time);
      if (start == null || end == null || end <= start) continue;
      for (const d of (m.days || [])) {
        if (!WEEKDAYS.includes(d)) continue;
        blocks.push({ day: d, start, end });
      }
    }
  }
  return blocks;
}

// ---- Per-preference scorers --------------------------------------

export function _scoreEarlyStarts(blocks, cutoffHHMM) {
  const cutoff = _hhmmToMin(cutoffHHMM);
  if (cutoff == null) return 0;
  let penalty = 0;
  for (const b of blocks) {
    if (b.start < cutoff) penalty += (cutoff - b.start);
  }
  return penalty;
}

export function _scoreLateEnds(blocks, cutoffHHMM) {
  const cutoff = _hhmmToMin(cutoffHHMM);
  if (cutoff == null) return 0;
  let penalty = 0;
  for (const b of blocks) {
    if (b.end > cutoff) penalty += (b.end - cutoff);
  }
  return penalty;
}

// 60-point penalty for each weekday with classes but no 30+ minute
// lunch gap inside the [11:30, 14:00] window. Days with no classes
// don't penalize. Days with a class spanning the entire window also
// fail the lunch test.
export function _scoreLunchBreak(blocks) {
  const LUNCH_START = 11 * 60 + 30;
  const LUNCH_END = 14 * 60;
  const MIN_GAP = 30;
  const byDay = new Map();
  for (const b of blocks) {
    if (!byDay.has(b.day)) byDay.set(b.day, []);
    byDay.get(b.day).push(b);
  }
  let penalty = 0;
  for (const [, dayBlocks] of byDay) {
    // Sort by start.
    const sorted = dayBlocks.slice().sort((a, b) => a.start - b.start);
    // Walk the timeline within the lunch window and look for any
    // free interval ≥ MIN_GAP.
    let free = LUNCH_START;
    let foundGap = false;
    for (const b of sorted) {
      // Clip block to lunch window.
      const bs = Math.max(b.start, LUNCH_START);
      const be = Math.min(b.end, LUNCH_END);
      if (bs >= LUNCH_END) break;
      if (be <= LUNCH_START) continue;
      if (bs - free >= MIN_GAP) { foundGap = true; break; }
      free = Math.max(free, be);
    }
    if (!foundGap && (LUNCH_END - free) >= MIN_GAP) foundGap = true;
    if (!foundGap) penalty += 60;
  }
  return penalty;
}

// "Balanced": minimize variance of (total class minutes per active
// day) across the active days. Inactive days don't pull the variance
// up. Score = variance / 100, lower is better.
export function _scoreBalanced(blocks) {
  const byDay = new Map();
  for (const b of blocks) {
    byDay.set(b.day, (byDay.get(b.day) || 0) + (b.end - b.start));
  }
  if (byDay.size === 0) return 0;
  const totals = Array.from(byDay.values());
  const mean = totals.reduce((a, x) => a + x, 0) / totals.length;
  const variance = totals.reduce((a, x) => a + (x - mean) * (x - mean), 0) / totals.length;
  return variance / 100;
}

// "Compressed": reward 3-or-fewer active days. Each day above 3
// adds 100 to the score.
export function _scoreCompressed(blocks) {
  const days = new Set();
  for (const b of blocks) days.add(b.day);
  const n = days.size;
  if (n <= 3) return 0;
  return 100 * (n - 3);
}

// ---- Public API --------------------------------------------------

/**
 * scoreCandidate(sections, preferences) → number
 *
 * sections: array of effective-catalog section objects (with
 *   meetings[].{days, start_time, end_time}).
 * preferences: PreferencesObject as described in Piece 6 spec.
 *
 * Returns total score. Lower = better. Empty schedules score 0.
 * Empty/null preferences still score 0; caller can sort safely.
 */
export function scoreCandidate(sections, preferences) {
  const p = preferences || {};
  const blocks = _flattenMeetings(sections);
  if (blocks.length === 0) return 0;
  let total = 0;
  if (p.no_starts_before) total += _scoreEarlyStarts(blocks, p.no_starts_before);
  if (p.no_ends_after)    total += _scoreLateEnds(blocks, p.no_ends_after);
  if (p.lunch_break)      total += _scoreLunchBreak(blocks);
  if (p.day_distribution === "balanced")   total += _scoreBalanced(blocks);
  if (p.day_distribution === "compressed") total += _scoreCompressed(blocks);
  return total;
}
