// Pure helpers for the Main-tab planner UI DOM rendering
// and event wiring live in planner/index.html; this module owns the
// testable bits — picker filtering, conflict detection, color
// assignment, legend row construction, time conversions.
//
// Everything here is referentially transparent: same inputs → same
// output. The controller passes in the plan + the effective catalog
// view; we project them into the shapes Main renders.

// --- Time helpers ---------------------------------------------------
// The store / parser uses "HH:MM" 24-hour strings. The grid render
// uses minutes-since-midnight integers. These two converters are the
// boundary.

export function hhmmToMinutes(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mn = Number(m[2]);
  if (h < 0 || h > 23 || mn < 0 || mn > 59) return null;
  return h * 60 + mn;
}

export function minutesToHhmm(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// --- Section resolution --------------------------------------------
// Given a plan's staged section refs and the catalog's effective view,
// produce hydrated sections — full section objects with their parent
// course code attached. Refs whose class_number isn't found are
// silently skipped (the section was deleted from the catalog after
// staging; the plan still tracks the ref but we don't crash).

export function resolveStagedSections(plan, effective) {
  const refs = (plan && plan.sections) || [];
  if (refs.length === 0) return [];
  const byCN = new Map();
  for (const c of (effective && effective.courses) || []) {
    for (const s of c.sections) {
      if (s.class_number) byCN.set(s.class_number, { section: s, course: c });
    }
  }
  const out = [];
  for (const ref of refs) {
    const hit = byCN.get(ref.class_number);
    if (!hit) continue;
    out.push({
      class_number: ref.class_number,
      section: hit.section,
      course: hit.course,
      // Convenience surfaces.
      course_code: hit.course.code,
      course_title: hit.course.title || "",
    });
  }
  return out;
}

// --- Conflict detection --------------------------------------------
// Two meetings conflict when they overlap in time AND share at least
// one day AND share session window (A71/A72 conflict only with the
// same code or AD; A71×A72 NEVER conflict).

export function sessionsOverlap(a, b) {
  if (a == null || b == null) return false;
  if (a === "AD" || b === "AD") return true;
  return a === b;
}

export function meetingsConflict(m1, m2) {
  if (!m1 || !m2) return false;
  // Must share at least one day.
  const d1 = Array.isArray(m1.days) ? m1.days : [];
  const d2 = Array.isArray(m2.days) ? m2.days : [];
  if (!d1.some((d) => d2.includes(d))) return false;
  const a1 = hhmmToMinutes(m1.start_time);
  const b1 = hhmmToMinutes(m1.end_time);
  const a2 = hhmmToMinutes(m2.start_time);
  const b2 = hhmmToMinutes(m2.end_time);
  if (a1 == null || b1 == null || a2 == null || b2 == null) return false;
  // Time intervals overlap iff a1 < b2 AND a2 < b1.
  return a1 < b2 && a2 < b1;
}

// Given a plan + effective view, find all in-plan conflicts. Returns
// an array of { class_number_a, class_number_b } pairs (sorted so the
// pair is canonical regardless of stage order).
export function detectPlanConflicts(plan, effective) {
  const hydrated = resolveStagedSections(plan, effective);
  const out = [];
  for (let i = 0; i < hydrated.length; i++) {
    for (let j = i + 1; j < hydrated.length; j++) {
      const a = hydrated[i];
      const b = hydrated[j];
      const aSess = a.section.session && a.section.session.code;
      const bSess = b.section.session && b.section.session.code;
      if (!sessionsOverlap(aSess, bSess)) continue;
      const aMs = (a.section.meetings || []);
      const bMs = (b.section.meetings || []);
      for (const ma of aMs) {
        for (const mb of bMs) {
          if (meetingsConflict(ma, mb)) {
            const [first, second] = [a.class_number, b.class_number].sort();
            out.push({ class_number_a: first, class_number_b: second });
          }
        }
      }
    }
  }
  return dedupePairs(out);
}

function dedupePairs(arr) {
  const seen = new Set();
  const out = [];
  for (const p of arr) {
    const k = p.class_number_a + "|" + p.class_number_b;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

// Does staging `candidate` (a section object) into a plan that already
// holds `existing` (array of hydrated staged) introduce conflicts?
// Returns array of { class_number, course_code } for each existing
// section that conflicts with the candidate.
export function conflictsWithStaged(candidate, existing) {
  const out = [];
  if (!candidate) return out;
  const cSess = candidate.session && candidate.session.code;
  for (const e of existing) {
    const eSess = e.section.session && e.section.session.code;
    if (!sessionsOverlap(cSess, eSess)) continue;
    let conflict = false;
    for (const ma of (candidate.meetings || [])) {
      for (const mb of (e.section.meetings || [])) {
        if (meetingsConflict(ma, mb)) { conflict = true; break; }
      }
      if (conflict) break;
    }
    if (conflict) {
      out.push({
        class_number: e.class_number,
        course_code: e.course_code,
        section_code: e.section.section_code,
      });
    }
  }
  return out;
}

// --- Course picker filter ------------------------------------------
// Filter courses by a free-text query. Matches on subject prefix,
// catalog number, course code, and title (all case-insensitive).
// Empty query returns all courses unchanged (caller decides whether to
// show them all or paginate).

export function filterCoursesByQuery(courses, query) {
  if (!Array.isArray(courses)) return [];
  const q = (query || "").trim().toLowerCase();
  if (q === "") return courses.slice();
  // Tokenize on whitespace; every token must match somewhere in the
  // searchable surface for the course to qualify (AND semantics).
  const tokens = q.split(/\s+/);
  return courses.filter((c) => {
    const hay = [
      c.subject || "",
      c.catalog_number || "",
      c.code || "",
      c.title || "",
    ].join(" ").toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}

// --- Color allocator ------------------------------------------------
// Assign deterministic palette colors to courses so the same course
// always gets the same color across renders. Uses the course code as
// the key so the same course in different plans renders the same hue.
//
// Palette tuned to be UNAMBIGUOUSLY visible against the cream paper
// background (~L:92%). The previous palette sat around L:90% — only
// 2 units darker than the page, which read as "no color at all" on
// most displays. New palette targets L:78–82% with substantially
// higher chroma. Each tile is now obviously coloured at a glance.

export const COURSE_PALETTE = [
  { bg: "#E5B89A", ink: "#5C2A0F" },  // ochre / peach
  { bg: "#B8D4AB", ink: "#284A28" },  // sage
  { bg: "#C8B5E0", ink: "#352060" },  // lavender
  { bg: "#E8B5C5", ink: "#6E1F39" },  // rose
  { bg: "#A8C0DC", ink: "#1B3658" },  // slate-blue
  { bg: "#E8D585", ink: "#5E480E" },  // mustard
  { bg: "#D2B8A2", ink: "#4A2E1F" },  // taupe
  // Was a muted teal (#9CCDC4) — read too close to the slate-blue at
  // small tile sizes. Pushed toward green-pigmented seafoam so it
  // reads as its own hue against the cool blue.
  { bg: "#7DC4A8", ink: "#163E2E" },  // seafoam
  { bg: "#E0AAA4", ink: "#5C1F1F" },  // brick
  { bg: "#B0CFAB", ink: "#2D4F30" },  // moss
  { bg: "#D8B8DC", ink: "#502E5C" },  // mauve
  { bg: "#C5C8A0", ink: "#3F4520" },  // olive
];

function _hashCode(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export function colorForCourse(courseCode) {
  if (!courseCode) return COURSE_PALETTE[0];
  const idx = _hashCode(String(courseCode)) % COURSE_PALETTE.length;
  return COURSE_PALETTE[idx];
}

// --- Legend builder -------------------------------------------------
// Produces the rows the legend renders: one per staged section, plus
// a separate filters list. Pure transformation; the renderer handles
// HTML output with proper escaping.

export function buildLegendRows(plan, effective) {
  const filters = (plan && plan.filters) ? plan.filters.slice() : [];
  const sections = resolveStagedSections(plan, effective).map((h) => {
    const meetingSummary = (h.section.meetings || []).map((m) => {
      const days = (m.days || []).join(",");
      const t = (m.start_time && m.end_time) ? `${m.start_time}–${m.end_time}` : "";
      return [days, t].filter(Boolean).join(" ");
    }).filter(Boolean).join(" · ");
    return {
      class_number: h.class_number,
      course_code: h.course_code,
      course_title: h.course_title,
      section_code: h.section.section_code || "",
      meeting_summary: meetingSummary,
      color: colorForCourse(h.course_code),
      user_authored: !!(h.course._user_authored || h.section._user_authored),
    };
  });
  return { filters, sections };
}
