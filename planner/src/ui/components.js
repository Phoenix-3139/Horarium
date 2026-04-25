// Piece 5b — component-aware staging detection.
//
// Pure helpers that read a plan + the catalog's effective view and
// surface "this course has uncovered components" warnings. The UI
// (the floating notification + the modal launched from "View
// details") is wired in planner/index.html and consumes these
// functions read-only.
//
// Why pure: the detection logic is the easiest part of this feature
// to get wrong (off-by-one on what counts as "covered," misclassifying
// single-component courses as incomplete, hash drift between
// equivalent plans). Keeping it isolated lets us test it
// independently and lets the UI just react.

// ---- Internal helpers ------------------------------------------------

// A course's "expected" component set is the distinct set of components
// across all its sections (Lecture, Laboratory, Recitation, etc.). A
// course is incomplete when at least one component is unstaged AND the
// course actually has more than one distinct component overall — a
// course with only Lecture sections is never "incomplete" no matter how
// many of those lectures the user did or didn't stage.
function _distinctComponents(course) {
  const set = new Set();
  for (const s of course.sections || []) {
    if (s && typeof s.component === "string" && s.component.trim()) {
      set.add(s.component);
    }
  }
  return set;
}

function _byClassNumber(effective) {
  const map = new Map();
  for (const c of (effective && effective.courses) || []) {
    for (const s of c.sections || []) {
      if (s && s.class_number) {
        map.set(String(s.class_number), { course: c, section: s });
      }
    }
  }
  return map;
}

// ---- Public API ------------------------------------------------------

/**
 * Walk the staged sections in `plan` and, for each course they
 * represent, decide whether the user has staged at least one section
 * of every distinct component on that course.
 *
 * Returns a Map keyed by course code, valued by:
 *   {
 *     course_code,
 *     course_title,
 *     staged: string[]            // components the user has staged
 *     missing: string[]           // components NOT staged
 *     missing_section_counts: { [component]: number }
 *   }
 *
 * Only courses with at least one missing component are included.
 * Courses whose every component is staged — and courses that only
 * have one component to begin with — are filtered out.
 */
export function detectIncompleteComponents(plan, catalogEffective) {
  const out = new Map();
  if (!plan || !plan.sections || plan.sections.length === 0) return out;
  const byCN = _byClassNumber(catalogEffective);

  // Group staged class_numbers by course_code.
  const staged = new Map(); // course_code → { course, components: Set<string> }
  for (const ref of plan.sections) {
    const hit = byCN.get(String(ref.class_number));
    if (!hit) continue;
    const code = hit.course.code;
    if (!staged.has(code)) {
      staged.set(code, { course: hit.course, components: new Set() });
    }
    if (hit.section.component) {
      staged.get(code).components.add(hit.section.component);
    }
  }

  for (const [code, entry] of staged.entries()) {
    const expected = _distinctComponents(entry.course);
    if (expected.size <= 1) continue; // single-component course — never incomplete
    const stagedComps = entry.components;
    const missing = [];
    const missingCounts = {};
    for (const comp of expected) {
      if (!stagedComps.has(comp)) {
        missing.push(comp);
        // Count available sections of this component for the modal.
        let n = 0;
        for (const s of entry.course.sections || []) {
          if (s.component === comp) n++;
        }
        missingCounts[comp] = n;
      }
    }
    if (missing.length === 0) continue;
    out.set(code, {
      course_code: code,
      course_title: entry.course.title || "",
      staged: Array.from(stagedComps).sort(),
      missing: missing.sort(),
      missing_section_counts: missingCounts,
    });
  }
  return out;
}

/**
 * Stable hash of the incomplete-state map. Used to compare against
 * `plan.dismissed_component_warning_hash` — if it matches, the user
 * has already dismissed THIS exact incomplete state and we shouldn't
 * re-surface the notification.
 *
 * Properties:
 *  - Insertion order in the Map doesn't change the hash (entries are
 *    sorted by course_code first).
 *  - Adding/removing a missing component changes the hash.
 *  - Equivalent maps from differently-ordered plans hash equally.
 *  - Returns "" for empty maps so callers can tell "no incomplete"
 *    from "incomplete with these courses."
 */
export function hashIncompleteState(incompleteMap) {
  if (!incompleteMap || incompleteMap.size === 0) return "";
  const entries = Array.from(incompleteMap.values())
    .map((e) => ({
      code: e.course_code,
      missing: (e.missing || []).slice().sort(),
    }))
    .sort((x, y) => (x.code < y.code ? -1 : x.code > y.code ? 1 : 0));
  // Compact JSON — stable since keys are explicit and order is fixed.
  return JSON.stringify(entries);
}

/**
 * Should the floating notification be visible right now?
 *
 *  - false when there are no incomplete courses
 *  - false when the current incomplete-state hash matches the plan's
 *    dismissed hash (user already X'd this exact state)
 *  - true otherwise
 *
 * Caller still has to render the UI; this is pure boolean logic.
 */
export function shouldShowNotification(plan, catalogEffective) {
  const incomplete = detectIncompleteComponents(plan, catalogEffective);
  if (incomplete.size === 0) return false;
  const currentHash = hashIncompleteState(incomplete);
  const dismissedHash = plan && plan.dismissed_component_warning_hash;
  return currentHash !== dismissedHash;
}

/**
 * Convenience wrapper for the "View details" modal: returns the
 * incomplete map plus a one-line summary line ready to display in the
 * notification banner.
 */
export function summarizeIncomplete(plan, catalogEffective) {
  const incomplete = detectIncompleteComponents(plan, catalogEffective);
  const courseCount = incomplete.size;
  if (courseCount === 0) return { incomplete, line: "" };
  const line = courseCount === 1
    ? "1 course needs additional sections."
    : `${courseCount} courses need additional sections.`;
  return { incomplete, line };
}
