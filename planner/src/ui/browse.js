// Pure helpers for the Browse module (Piece 3b). The DOM-rendering
// glue lives inline in planner/index.html; this file is just the bits
// that can be unit-tested without a DOM.

/**
 * Given a parser output (from parse()) for one subject, classify its
 * warnings into three buckets:
 *   - byClass:  Map<class_number, Warning[]>   (section-level)
 *   - byCourse: Map<course_code,  Warning[]>   (course-level)
 *   - global:   Warning[]                      (subject-wide)
 *
 * Classification rule: if `class_number` is truthy the warning is
 * section-level (even when it also carries a `course_code`, as in
 * units_mismatch). Else if `course_code` is truthy it's course-level.
 * Else it's global.
 */
export function classifyWarnings(parserOutput) {
  const byClass = new Map();
  const byCourse = new Map();
  const global = [];
  const list = (parserOutput && parserOutput.warnings) || [];
  for (const w of list) {
    if (w && w.class_number) {
      const arr = byClass.get(w.class_number) || [];
      arr.push(w);
      byClass.set(w.class_number, arr);
    } else if (w && w.course_code) {
      const arr = byCourse.get(w.course_code) || [];
      arr.push(w);
      byCourse.set(w.course_code, arr);
    } else {
      global.push(w);
    }
  }
  return { byClass, byCourse, global };
}

/**
 * One-row summary for a subject in the Browse subject list. Counts how
 * many distinct sections and courses have at least one warning; the
 * "flagged" number shown on the row is the sum (sections + courses).
 */
export function subjectSummary(subjectCode, subjectMetadata, parserOutput) {
  const meta = subjectMetadata || {};
  const { byClass, byCourse, global } = classifyWarnings(parserOutput);
  return {
    code: subjectCode,
    courseCount: meta.course_count || 0,
    sectionCount: meta.section_count || 0,
    flaggedSections: byClass.size,
    flaggedCourses: byCourse.size,
    flaggedTotal: byClass.size + byCourse.size,
    globalInfo: [...global],
    lastUpdatedISO: meta.last_updated || null,
  };
}

/**
 * Format an ISO timestamp as "Nm ago" / "Nh ago" / "N days ago" /
 * "N weeks ago" / "N mo ago" / "N yr ago". Caller passes `now` so the
 * function is fully deterministic for tests.
 */
export function humanRelativeTime(iso, now) {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const nowMs = now instanceof Date ? now.getTime() : (typeof now === "number" ? now : Date.now());
  const deltaSec = Math.max(0, Math.round((nowMs - then) / 1000));
  if (deltaSec < 60) return "just now";
  const m = Math.floor(deltaSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} week${w === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} mo ago`;
  const y = Math.floor(d / 365);
  return `${y} yr${y === 1 ? "" : "s"} ago`;
}

/**
 * Parse a location.hash string into the Browse module's selection state.
 * Shape: "#browse/<subject>/<catalog_number>" — both optional after the
 * "browse" segment. Returns { subject, catnum } with missing parts as null.
 * Non-browse hashes return { subject: null, catnum: null }.
 */
export function parseBrowseHash(hash) {
  const empty = { subject: null, catnum: null };
  if (typeof hash !== "string") return empty;
  const clean = hash.replace(/^#/, "");
  if (!clean.startsWith("browse")) return empty;
  const parts = clean.split("/").slice(1); // drop the leading "browse"
  if (parts.length === 0) return empty;
  const subject = parts[0] ? decodeURIComponent(parts[0]) : null;
  const catnum = parts[1] ? decodeURIComponent(parts[1]) : null;
  return { subject, catnum };
}

/**
 * Build a location.hash string from a selection. Input matches the
 * output of parseBrowseHash. Null fields are omitted.
 */
export function formatBrowseHash({ subject, catnum } = {}) {
  if (!subject) return "#browse";
  const s = encodeURIComponent(subject);
  if (!catnum) return `#browse/${s}`;
  return `#browse/${s}/${encodeURIComponent(catnum)}`;
}

/**
 * Helper for the course list: per-course flagged-sections count, given
 * a course object and the byClass Map from classifyWarnings. Excludes
 * course-level warnings — those are surfaced on the detail panel, not
 * the list row.
 */
export function countFlaggedSectionsInCourse(course, byClass) {
  if (!course || !course.sections) return 0;
  let n = 0;
  for (const s of course.sections) {
    if (s.class_number && byClass.has(s.class_number)) n++;
  }
  return n;
}
