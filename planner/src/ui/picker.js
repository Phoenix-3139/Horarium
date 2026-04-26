// Pure helpers for the redesigned Main-tab picker
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

// --- Course-search scoring (Mk II — simple substring matching) ----
// Earlier iterations had three tiers (exact, word-prefix, Levenshtein
// ≤2) plus a separate "structured query" path that returned siblings
// for partial matches. Real usage exposed both as wrong: typing the
// exact code "PHYED-UH 1001" surfaced four sibling courses (noise),
// and Levenshtein matched "1001" against "1011" (also noise).
//
// Replaced with a flat substring matcher with field-weighted scores
// and AND-token semantics for multi-word queries. Predictable,
// debuggable, no fuzzy edit-distance theatre. The cost is that typos
// ("hashikeh" for "hashaikeh") no longer match — that's acceptable
// because the user can see the catalog as they type and self-correct.
//
// Score bands:
//   1000  — query equals course code (after normalize)
//   900   — code starts with query
//   800   — subject equals or starts with query
//   700   — code OR catalog_number contains query as substring
//   600   — title contains query
//   500   — any instructor name contains query
//   400   — multi-word query: every word matches somewhere in the
//           combined haystack
//   0     — no match

function _normForSearch(s) {
  // Lowercase, drop punctuation but KEEP word breaks. "ENGR-UH 3120"
  // becomes "engr uh 3120". Allows "engr 3120" to match by code via
  // substring search.
  return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Kept for backwards compat with tests that exercise the parser.
// No longer used in the search path itself — a structured query is
// just an ordinary substring search now.
const _STRUCTURED_RE = /([A-Za-z]+(?:-[A-Za-z]+)?)\s*[\s-]?\s*(\d{3,4}[A-Za-z]?)/;
export function parseStructuredQuery(query) {
  if (typeof query !== "string") return null;
  const trimmed = query.trim();
  if (trimmed === "") return null;
  const m = trimmed.match(_STRUCTURED_RE);
  if (!m) return null;
  const subj = m[1].toUpperCase();
  const cat = m[2];
  if (subj.length < 2) return null;
  return { subject: subj, catnum: cat };
}

// `opts.fuzzy: true` enables a Levenshtein fallback that runs ONLY
// when the strict substring scorer returns 0. The fallback's max
// score is capped below the lowest non-fuzzy band (300) so fuzzy hits
// always rank below real matches when both surface. Off by default;
// the picker UI exposes a toggle.
export function scoreCourseMatch(course, query, instructorsForCourse, opts) {
  if (!query || !query.trim()) return 1; // sentinel: include all
  const q = _normForSearch(query);
  if (!q) return 1;

  const code = _normForSearch(course.code);
  const subj = _normForSearch(course.subject);
  const cat  = _normForSearch(course.catalog_number);
  const title = _normForSearch(course.title);
  const instructors = Array.isArray(instructorsForCourse) ? instructorsForCourse : [];

  // Compact (no-space) forms so users can type "engruh 3120" or
  // "engruh3120" and still match "ENGR-UH 3120" → "engr uh 3120".
  const codeCompact = code.replace(/\s+/g, "");
  const qCompact    = q.replace(/\s+/g, "");

  // Tier 1: exact code match (with or without spacing).
  if (code === q) return 1000;
  if (codeCompact === qCompact) return 1000;

  // Tier 2: code starts with query (e.g., "engr-uh 312" → ENGR-UH 3120).
  if (code.startsWith(q)) return 900;
  if (codeCompact.startsWith(qCompact)) return 900;

  // Tier 3: subject equality / prefix (e.g., "phyed" → all PHYED-UH).
  if (subj === q || subj.startsWith(q)) return 800;
  const subjCompact = subj.replace(/\s+/g, "");
  if (subjCompact === qCompact || subjCompact.startsWith(qCompact)) return 800;

  // Tier 4: code or catalog-number contains query as substring.
  // "1001" → all 1001-numbered courses; "engr 3120" → ENGR-UH 3120
  // (the space between "engr" and "3120" is preserved by normalize).
  if (code.includes(q)) return 700;
  if (cat === q) return 700;
  if (cat.startsWith(q)) return 650;

  // Tier 5: title substring.
  if (title.includes(q)) return 600;

  // Tier 6: instructor substring.
  for (const name of instructors) {
    if (_normForSearch(name).includes(q)) return 500;
  }

  // Tier 7: multi-word AND across the combined haystack. Each
  // whitespace-separated word in the query must appear somewhere.
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const hay = [code, subj, cat, title].concat(instructors.map(_normForSearch)).join(" ");
    if (words.every(function (w) { return hay.includes(w); })) return 400;
  }

  // Tier 8 (opt-in): fuzzy fallback. Runs only when opts.fuzzy is
  // true AND every strict tier above has missed. Capped at 299 so
  // any future addition of a strict band stays above. Single-field
  // best score wins; the picker's UI surfaces "tolerate typos" as a
  // toggle so the user opts into the looser matching deliberately.
  if (opts && opts.fuzzy) {
    let best = 0;
    for (const f of [course.code, course.subject, course.catalog_number, course.title]) {
      const s = fuzzyMatch(query, f || "");
      if (s > best) best = s;
    }
    for (const name of instructors) {
      const s = fuzzyMatch(query, name || "");
      if (s > best) best = s;
    }
    // fuzzyMatch returns up to 1000 for exact substring; we want fuzzy
    // hits to rank below the strict 400 multi-word tier. Compress.
    if (best > 0) return Math.min(299, Math.round(best * 0.3));
  }

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
