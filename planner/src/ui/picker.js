// Pure helpers for the redesigned Main-tab picker (Piece 5a/3 polish).
// Covers fuzzy search, instructor indexing, filter composition, level
// bucketing, and (re-exported) deterministic course coloring.

import { colorForCourse, COURSE_PALETTE } from "./main_planner.js";
export { colorForCourse, COURSE_PALETTE };

// --- Fuzzy match ----------------------------------------------------
// Tolerant text matching across course / instructor / catalog-number
// fields. Returns a score: 0 = no match, larger = better. The caller
// sorts descending. Hand-written, no dependency.
//
// Strategy:
//   1. Normalize both strings (lowercase, strip non-alphanumeric).
//   2. Exact-substring → highest score, weighted by position
//      (earlier matches score higher).
//   3. Word-prefix match → next tier — every query word is a prefix of
//      some haystack word.
//   4. Levenshtein within edit-distance threshold → low-tier match.
//   5. Otherwise 0.
//
// Score ranges chosen so the natural sort order is:
//   exact substring > word-prefix > distance-1 > distance-2 > nothing.

const EDIT_DIST_MAX = 2;

function _normalize(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9 ]/g, "");
}

// Levenshtein distance, capped at `cap` for early exit. Returns
// Infinity when distance would exceed cap.
function _editDistance(a, b, cap) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > cap) return Infinity;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > cap) return Infinity;
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

export function fuzzyMatch(query, haystack) {
  const q = _normalize(query);
  const h = _normalize(haystack);
  if (q === "" || h === "") return 0;
  // Tier 1: exact substring. Score is high, with a bonus for matching
  // near the start of the haystack.
  const subIdx = h.indexOf(q);
  if (subIdx !== -1) {
    return 1000 - Math.min(subIdx, 100); // 900..1000
  }
  // Tier 2: word-prefix. Split haystack on spaces; if every word in
  // the query is a prefix of some haystack word, mid-tier match.
  const qWords = q.split(/\s+/).filter(Boolean);
  const hWords = h.split(/\s+/).filter(Boolean);
  if (qWords.length > 0 && qWords.every((qw) =>
    hWords.some((hw) => hw.startsWith(qw)))) {
    return 700;
  }
  // Tier 3: edit-distance on the whole compact strings (spaces
  // stripped) — catches typos like "engreneer" → "engineer".
  const qC = q.replace(/\s+/g, "");
  const hC = h.replace(/\s+/g, "");
  // Try the query as a substring of haystack at edit distances 1..MAX.
  // For long haystacks this is fast because we check each position
  // independently with a small cap.
  if (qC.length >= 3 && qC.length <= hC.length + EDIT_DIST_MAX) {
    let bestDist = Infinity;
    for (let i = 0; i <= hC.length - qC.length + EDIT_DIST_MAX; i++) {
      const slice = hC.slice(i, i + qC.length + EDIT_DIST_MAX);
      const d = _editDistance(qC, slice, EDIT_DIST_MAX);
      if (d < bestDist) bestDist = d;
      if (bestDist === 0) break;
    }
    if (bestDist <= EDIT_DIST_MAX) {
      return 400 - bestDist * 50; // dist 1 → 350; dist 2 → 300
    }
  }
  return 0;
}

// --- Structured-query detection ------------------------------------
// A "structured course identifier" query contains BOTH a recognizable
// subject prefix (UPPERCASE letters with optional dash + suffix) AND a
// catalog-number-shaped digit run. When detected, the scorer skips
// fuzzy / Levenshtein matching entirely — those tiers add noise on
// queries the user has typed deliberately ("PHYED-UH 1001" vs Lev=1
// match "PSYCH-UA 1011" is the kind of thing they're complaining
// about). Only exact matches qualify.
const _STRUCTURED_RE = /([A-Za-z]+(?:-[A-Za-z]+)?)\s*[\s-]?\s*(\d{3,4}[A-Za-z]?)/;
export function parseStructuredQuery(query) {
  if (typeof query !== "string") return null;
  const trimmed = query.trim();
  if (trimmed === "") return null;
  const m = trimmed.match(_STRUCTURED_RE);
  if (!m) return null;
  const subj = m[1].toUpperCase();
  const cat = m[2];
  // Both pieces must be present; the regex enforces that. Reject when
  // the subject is suspiciously short (1 char) — a stray letter next
  // to a number isn't a real prefix. NYU prefixes are 2+ chars.
  if (subj.length < 2) return null;
  return { subject: subj, catnum: cat };
}

// --- Course-search scoring -----------------------------------------
// Given a course and a search query, return the best match score
// across the searchable fields (subject, code, title, catalog number,
// instructors). 0 means "doesn't match — exclude."
//
// Structured queries (subject + catnum together) use a stricter
// match: only exact-prefix subject matches and exact catnum matches
// score, with the bullseye <subject> <catnum> getting the highest
// possible score. Levenshtein/fuzzy is suppressed for these queries.
//
// Score ranges for structured queries:
//   2000  — exact <subject> <catnum> bullseye (one course)
//   1500  — same subject prefix, exact catnum (cross-suffix)
//   1200  — same subject prefix, any catnum (sibling courses)
//   1100  — same catnum, different subject (cross-subject sibling)
//   0     — no match
export function scoreCourseMatch(course, query, instructorsForCourse) {
  if (!query || !query.trim()) return 1; // sentinel: include all when no query
  const struct = parseStructuredQuery(query);
  if (struct) {
    return _scoreStructured(course, struct);
  }
  let best = 0;
  const fields = [
    course.subject || "",
    course.catalog_number || "",
    course.code || "",
    course.title || "",
  ];
  for (const f of fields) {
    const s = fuzzyMatch(query, f);
    if (s > best) best = s;
  }
  if (Array.isArray(instructorsForCourse)) {
    for (const name of instructorsForCourse) {
      const s = fuzzyMatch(query, name);
      if (s > best) best = s;
    }
  }
  return best;
}

function _scoreStructured(course, struct) {
  const cSubj = String(course.subject || "").toUpperCase();
  const cCat  = String(course.catalog_number || "");
  const qSubj = struct.subject;
  const qCat  = struct.catnum;
  // Subject equality: exact OR prefix-match (e.g., query "ENGR" matches
  // ENGR-UH as a prefix). The dash-stripped form lets users type
  // "engruh" and still hit the right subject.
  const subjEqual =
    cSubj === qSubj ||
    cSubj.replace(/-/g, "") === qSubj.replace(/-/g, "") ||
    cSubj.startsWith(qSubj) ||
    cSubj.replace(/-/g, "").startsWith(qSubj.replace(/-/g, ""));
  const catEqual = cCat === qCat;
  if (subjEqual && catEqual) return 2000;
  if (subjEqual && cCat.startsWith(qCat)) return 1500; // catnum prefix (e.g., "100" → 1001/1002)
  if (subjEqual) return 1200;
  if (catEqual) return 1100;
  return 0;
}

// --- Instructor index ----------------------------------------------
// Walk the effective catalog and produce two structures:
//   byInstructor: Map<normalizedName, Array<{class_number, course_code}>>
//   byCourseCode: Map<courseCode, string[]>  // distinct instructor names per course
// The latter is what the picker uses for fast per-course "do these
// instructors match the query" checks.

export function buildInstructorIndex(effective) {
  const byInstructor = new Map();
  const byCourseCode = new Map();
  if (!effective || !Array.isArray(effective.courses)) {
    return { byInstructor, byCourseCode };
  }
  for (const c of effective.courses) {
    if (c._user_created) continue;
    const seenForCourse = new Set();
    for (const s of (c.sections || [])) {
      for (const m of (s.meetings || [])) {
        for (const raw of (m.instructors || [])) {
          if (typeof raw !== "string") continue;
          const trimmed = raw.trim();
          if (!trimmed) continue;
          if (!seenForCourse.has(trimmed)) {
            seenForCourse.add(trimmed);
          }
          const norm = trimmed.toLowerCase();
          let arr = byInstructor.get(norm);
          if (!arr) { arr = []; byInstructor.set(norm, arr); }
          arr.push({
            class_number: s.class_number,
            course_code: c.code,
          });
        }
      }
    }
    if (seenForCourse.size > 0) {
      byCourseCode.set(c.code, Array.from(seenForCourse));
    }
  }
  return { byInstructor, byCourseCode };
}

// --- Catalog level bucketing ---------------------------------------
// Groups courses within a subject by the leading digit of their
// catalog number ("1xxx" / "2xxx" / etc.). Returns an array of
// { level, label, courses } in ascending level order. Courses whose
// catalog number doesn't start with a digit fall into "other".

const LEVEL_LABELS = {
  "1": "1xxx — Foundation",
  "2": "2xxx — Intermediate",
  "3": "3xxx — Advanced",
  "4": "4xxx — Capstone",
  "5": "5xxx — Graduate",
  "6": "6xxx — Graduate",
  "7": "7xxx — Graduate",
  "8": "8xxx — Graduate",
  "9": "9xxx — Topics / Special",
};

export function bucketByLevel(courses) {
  const buckets = new Map();
  for (const c of courses) {
    const first = (c.catalog_number || "").charAt(0);
    const key = /\d/.test(first) ? first : "other";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(c);
  }
  // Sort each bucket by catalog_number lex.
  for (const arr of buckets.values()) {
    arr.sort((a, b) => String(a.catalog_number || "").localeCompare(String(b.catalog_number || "")));
  }
  // Order: numeric levels ascending, then "other" last.
  const orderedKeys = Array.from(buckets.keys()).sort((a, b) => {
    if (a === "other") return 1;
    if (b === "other") return -1;
    return Number(a) - Number(b);
  });
  return orderedKeys.map((k) => ({
    level: k,
    label: k === "other" ? "Other" : (LEVEL_LABELS[k] || `${k}xxx`),
    courses: buckets.get(k),
  }));
}

// --- Filter composition ---------------------------------------------
// All filter predicates are checked with AND semantics. A section
// passes if every active filter predicate returns true.
//
// Filter shape:
//   {
//     status: 'all' | 'open' | 'open_or_waitlist',
//     components: Set<string> | null,  // null = any; otherwise membership in set
//     days: Set<string> | null,        // null = any; set = require at least one match
//     // Time bounds are concrete cutoffs, not subjective buckets like
//     // "morning"/"evening". start_after_min: every meeting on the
//     // section must start at or after this minute-of-day. end_before_min:
//     // every meeting must end at or before. null on either = no bound.
//     // Default thresholds (09:00 / 18:00) are exposed as the canonical
//     // chip presets in the UI; future work can let users edit them.
//     start_after_min: number | null,
//     end_before_min: number | null,
//   }

export const DEFAULT_FILTERS = Object.freeze({
  status: "all",
  components: null,
  days: null,
  start_after_min: null,
  end_before_min: null,
});

export function isFilterActive(f) {
  if (!f) return false;
  if (f.status && f.status !== "all") return true;
  if (f.components && f.components.size > 0) return true;
  if (f.days && f.days.size > 0) return true;
  if (f.start_after_min != null) return true;
  if (f.end_before_min != null) return true;
  return false;
}

// Discover the set of component values actually used in the catalog.
// Returns an array of { value, count } sorted by count descending.
// The picker uses this to render component chips dynamically — handles
// new vocabulary added by NYU and user-edited overrides automatically.
export function distinctComponents(effective) {
  const counts = new Map();
  if (!effective || !Array.isArray(effective.courses)) return [];
  for (const c of effective.courses) {
    if (c._user_created) continue;
    for (const s of (c.sections || [])) {
      const v = (s.component || "").trim();
      if (!v) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
  }
  const out = Array.from(counts.entries()).map(([value, count]) => ({ value, count }));
  out.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return out;
}

function _hhmmToMin(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function sectionPassesFilters(section, filters) {
  if (!isFilterActive(filters)) return true;
  // Status.
  const t = section.status && section.status.type;
  if (filters.status === "open" && t !== "open") return false;
  if (filters.status === "open_or_waitlist" && t !== "open" && t !== "waitlist") return false;
  // Component.
  if (filters.components && filters.components.size > 0) {
    if (!filters.components.has(section.component || "")) return false;
  }
  // Days — any meeting day must intersect the filter's selected days.
  if (filters.days && filters.days.size > 0) {
    const meetings = section.meetings || [];
    const allDays = new Set();
    for (const m of meetings) for (const d of (m.days || [])) allDays.add(d);
    let hit = false;
    for (const d of filters.days) if (allDays.has(d)) { hit = true; break; }
    if (!hit) return false;
  }
  // Concrete time bounds — applied to every meeting on the section
  // (not "any" / "some"). If even one meeting starts before
  // start_after_min, the section is excluded. Same for end_before_min.
  // Sections with no meetings pass (vacuously true) — they're filtered
  // by other criteria like status if the user wants to exclude them.
  const meetings = section.meetings || [];
  if (filters.start_after_min != null) {
    for (const m of meetings) {
      const sm = _hhmmToMin(m.start_time);
      if (sm != null && sm < filters.start_after_min) return false;
    }
  }
  if (filters.end_before_min != null) {
    for (const m of meetings) {
      const em = _hhmmToMin(m.end_time);
      if (em != null && em > filters.end_before_min) return false;
    }
  }
  return true;
}

// --- Status helpers -------------------------------------------------

export function statusDot(section) {
  const t = (section && section.status && section.status.type) || "unknown";
  switch (t) {
    case "open": return { color: "#5b8c5a", label: "Open" };
    case "waitlist": return { color: "#c98a3d", label: "Waitlist" };
    case "closed": return { color: "#8c4a4a", label: "Closed" };
    case "cancelled": return { color: "#7a2929", label: "Cancelled" };
    default: return { color: "#8c8c8c", label: "Unknown" };
  }
}

export function stageActionLabel(section) {
  const t = (section && section.status && section.status.type) || "unknown";
  const cnt = section && section.status && section.status.count;
  switch (t) {
    case "open": return { label: "Stage", needsConfirm: false };
    case "waitlist":
      return { label: cnt != null ? `Stage anyway (${cnt} waitlisted)` : "Stage anyway (waitlisted)", needsConfirm: true, confirmReason: "waitlist" };
    case "closed":
      return { label: "Stage anyway (closed)", needsConfirm: true, confirmReason: "closed" };
    case "cancelled":
      return { label: "Stage anyway (cancelled)", needsConfirm: true, confirmReason: "cancelled" };
    default:
      return { label: "Stage", needsConfirm: false };
  }
}
