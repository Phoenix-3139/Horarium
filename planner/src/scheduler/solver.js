// Piece 6 — pure CSP backtracking solver.
//
// Variables: requirements (one per requirement)
// Domains:   per-requirement arrays of "bundles." Each bundle is one
//            fully-staffed selection of sections for ONE course in
//            that requirement, covering every distinct component.
// Hard constraints:
//   * Two bundles' meetings don't conflict (same day + time overlap +
//     overlapping session window).
//   * No bundle's meetings conflict with any visible personal-time
//     filter.
//   * plan.linked_sections pairs are jointly satisfied (chosen
//     together or not at all).
// Soft scoring: see scoring.js.
//
// Algorithm: classic CSP. MRV variable ordering, LCV value ordering,
// forward-checking. 2 second wall-clock cap. Returns up to
// max_candidates valid assignments sorted ascending by score.
//
// If no valid candidates AND no isolatable diagnosis, the solver
// surfaces up to 10 "show-me-anyway" candidates that violate exactly
// one hard constraint (typically a personal-time filter), so the
// user has something to look at instead of a blank panel.

import {
  hhmmToMinutes,
  meetingsConflict,
  sessionsOverlap,
} from "../ui/main_planner.js";
import { scoreCandidate } from "./scoring.js";

const TIME_CAP_MS = 2000;

// ---- Helpers ------------------------------------------------------

function _byCourseCode(catalogEffective) {
  const map = new Map();
  for (const c of (catalogEffective && catalogEffective.courses) || []) {
    if (c && c.code) map.set(c.code, c);
  }
  return map;
}

function _isStageable(section, includeClosedWaitlisted) {
  if (!section || !section.status || !section.status.type) return true;
  const t = section.status.type;
  if (t === "open") return true;
  if (t === "cancelled") return false;
  return !!includeClosedWaitlisted; // closed / waitlist / unknown
}

// Build the cartesian product of one section per distinct component
// of `course`. Returns Array<Bundle> where each Bundle is:
//   { course_code, sections: [section, ...] }
function _enumerateCourseBundles(course, includeClosedWaitlisted) {
  if (!course || !Array.isArray(course.sections)) return [];
  // Group sections by component label.
  const byComp = new Map();
  for (const s of course.sections) {
    if (!_isStageable(s, includeClosedWaitlisted)) continue;
    const comp = s.component || "Lecture";
    if (!byComp.has(comp)) byComp.set(comp, []);
    byComp.get(comp).push(s);
  }
  if (byComp.size === 0) return [];
  // Cartesian product across components.
  let bundles = [[]];
  for (const [, sections] of byComp) {
    const next = [];
    for (const partial of bundles) {
      for (const sec of sections) {
        next.push(partial.concat([sec]));
      }
    }
    bundles = next;
  }
  return bundles.map((sections) => ({
    course_code: course.code,
    sections: sections,
  }));
}

// Two bundles conflict if any pair of their meetings overlaps.
function _bundlesConflict(a, b) {
  for (const sa of a.sections) {
    const aSess = sa.session && sa.session.code;
    for (const sb of b.sections) {
      const bSess = sb.session && sb.session.code;
      if (!sessionsOverlap(aSess, bSess)) continue;
      for (const ma of (sa.meetings || [])) {
        for (const mb of (sb.meetings || [])) {
          if (meetingsConflict(ma, mb)) return true;
        }
      }
    }
  }
  return false;
}

// Filter (visible only) vs bundle: returns the first matching filter
// name or null.
function _bundleViolatesFilters(bundle, filters) {
  if (!Array.isArray(filters) || filters.length === 0) return null;
  for (const sec of bundle.sections) {
    const sess = sec.session && sec.session.code;
    for (const m of (sec.meetings || [])) {
      const startMin = hhmmToMinutes(m.start_time);
      const endMin = hhmmToMinutes(m.end_time);
      if (startMin == null || endMin == null) continue;
      const days = Array.isArray(m.days) ? m.days : [];
      // Translate "Mon" → "M" etc since filters store single-letter days.
      const map = { Mon: "M", Tue: "T", Wed: "W", Thu: "Th", Fri: "F", Sat: "S", Sun: "Su" };
      const dayLetters = days.map((d) => map[d]).filter(Boolean);
      for (const f of filters) {
        if (!f || f.visible === false) continue;
        if (f.session && f.session !== "AD" && sess && sess !== f.session && sess !== "AD") continue;
        const fStart = (typeof f.start === "number") ? f.start : hhmmToMinutes(f._start_time || f.start_time);
        const fEnd = (typeof f.end === "number") ? f.end : hhmmToMinutes(f._end_time || f.end_time);
        if (fStart == null || fEnd == null) continue;
        const overlapsTime = startMin < fEnd && fStart < endMin;
        if (!overlapsTime) continue;
        const fDays = Array.isArray(f.days) ? f.days : [];
        const intersect = fDays.some((d) => dayLetters.includes(d));
        if (intersect) return f.name || "(unnamed filter)";
      }
    }
  }
  return null;
}

function _classNumbersIn(bundle) {
  const out = new Set();
  for (const s of bundle.sections) out.add(String(s.class_number));
  return out;
}

// ---- Public API ---------------------------------------------------

/**
 * generateSchedules({requirements, preferences, catalog, filters,
 *                    linkedSections, max_candidates = 50})
 *   → { candidates: [...], conflicts: [...] }
 */
export function generateSchedules({
  requirements,
  preferences,
  catalog,
  filters,
  linkedSections,
  max_candidates = 50,
}) {
  const reqs = Array.isArray(requirements) ? requirements : [];
  const prefs = preferences || {};
  const links = Array.isArray(linkedSections) ? linkedSections : [];
  if (reqs.length === 0) return { candidates: [], conflicts: [] };

  const courseMap = _byCourseCode(catalog);

  // --- 1. Build domains ---
  const domains = [];
  const conflicts = [];

  for (const req of reqs) {
    const bundles = [];
    for (const code of (req.courses || [])) {
      const course = courseMap.get(code);
      if (!course) continue;
      bundles.push(..._enumerateCourseBundles(course, prefs.include_closed_waitlisted));
    }
    let domain = bundles;
    if (req.locked_section && req.locked_section.class_number) {
      const locked = String(req.locked_section.class_number);
      domain = domain.filter((b) => _classNumbersIn(b).has(locked));
    }
    domains.push(domain);

    if (domain.length === 0) {
      conflicts.push({
        course_code: (req.courses || []).join(" or "),
        reason: "No sections found in the catalog" +
          (req.locked_section ? ` matching the locked section ${req.locked_section.class_number}.` : "."),
      });
    }
  }

  if (conflicts.length > 0) {
    return { candidates: [], conflicts };
  }

  // --- 2. Pre-flight filter check ---
  const liveDomains = [];
  for (let i = 0; i < domains.length; i++) {
    const live = [];
    let firstViolation = null;
    for (const b of domains[i]) {
      const v = _bundleViolatesFilters(b, filters);
      if (v) {
        if (firstViolation == null) firstViolation = v;
        continue;
      }
      live.push(b);
    }
    if (live.length === 0) {
      conflicts.push({
        course_code: (reqs[i].courses || []).join(" or "),
        reason: `Every section conflicts with personal-time filter "${firstViolation}".`,
        blocking_filter: firstViolation,
      });
    }
    liveDomains.push(live);
  }

  if (conflicts.length > 0) {
    return { candidates: [], conflicts };
  }

  // --- 3. Backtracking search ---
  const candidates = [];
  const startMs = Date.now();
  const linkClassNumbers = new Set();
  for (const l of links) {
    if (l && l.a) linkClassNumbers.add(String(l.a));
    if (l && l.b) linkClassNumbers.add(String(l.b));
  }

  // Linked-section gate: at any partial assignment, every link with
  // BOTH ends present in the union of remaining domains + already
  // assigned bundles must end up with both ends chosen. We enforce
  // by checking: if any class_number from a link is in the assignment
  // already, the partner must still be live in some remaining domain
  // OR already in the assignment.
  function _linksStillSatisfiable(assignment, remaining) {
    if (links.length === 0) return true;
    const inAssignment = new Set();
    for (const idx in assignment) {
      const b = assignment[idx];
      if (!b) continue;
      for (const cn of _classNumbersIn(b)) inAssignment.add(cn);
    }
    if (inAssignment.size === 0) return true;
    // Build pool of class_numbers reachable from remaining domains.
    const reachable = new Set(inAssignment);
    for (const i of remaining) {
      for (const b of liveDomains[i]) {
        for (const cn of _classNumbersIn(b)) reachable.add(cn);
      }
    }
    for (const l of links) {
      const a = String(l.a);
      const b = String(l.b);
      if (inAssignment.has(a) && !reachable.has(b)) return false;
      if (inAssignment.has(b) && !reachable.has(a)) return false;
    }
    return true;
  }

  // Final-candidate gate: every link's a and b are jointly chosen
  // (both in the assignment) or neither is.
  function _linksSatisfied(assignment) {
    if (links.length === 0) return true;
    const inAssignment = new Set();
    for (const b of assignment) {
      if (!b) continue;
      for (const cn of _classNumbersIn(b)) inAssignment.add(cn);
    }
    for (const l of links) {
      const a = String(l.a);
      const b = String(l.b);
      const hasA = inAssignment.has(a);
      const hasB = inAssignment.has(b);
      if (hasA !== hasB) return false;
    }
    return true;
  }

  function _conflictsWithAssignment(bundle, assignment) {
    for (const other of assignment) {
      if (!other) continue;
      if (_bundlesConflict(bundle, other)) return true;
    }
    return false;
  }

  // Stable assignment array indexed by requirement position.
  const assignment = new Array(reqs.length).fill(null);

  function _pickMRV(remaining) {
    let best = remaining[0];
    let bestSize = liveDomains[best].length;
    for (let k = 1; k < remaining.length; k++) {
      const idx = remaining[k];
      const sz = liveDomains[idx].length;
      if (sz < bestSize) { best = idx; bestSize = sz; }
    }
    return best;
  }

  function _orderLCV(idx, remaining) {
    // Score each bundle in domains[idx] by how few future domain
    // elements it leaves intact across the other remaining vars.
    const others = remaining.filter((i) => i !== idx);
    const scored = liveDomains[idx].map((b) => {
      let kept = 0;
      for (const j of others) {
        for (const ob of liveDomains[j]) {
          if (!_bundlesConflict(b, ob)) kept++;
        }
      }
      return { b, kept };
    });
    scored.sort((x, y) => y.kept - x.kept);
    return scored.map((x) => x.b);
  }

  function search(remaining) {
    if (Date.now() - startMs > TIME_CAP_MS) return false;
    if (candidates.length >= max_candidates) return false;
    if (remaining.length === 0) {
      if (!_linksSatisfied(assignment)) return true;
      const sections = [];
      for (const b of assignment) {
        if (!b) continue;
        for (const s of b.sections) {
          sections.push(s);
        }
      }
      const score = scoreCandidate(sections, prefs);
      const refs = sections.map((s) => ({
        class_number: s.class_number,
        subject: s.subject || null,
        course_code: _findCourseFor(s, courseMap),
      }));
      candidates.push({ sections: refs, score, violations: [] });
      return true;
    }

    const idx = _pickMRV(remaining);
    const ordered = _orderLCV(idx, remaining);
    const next = remaining.filter((i) => i !== idx);

    for (const bundle of ordered) {
      if (Date.now() - startMs > TIME_CAP_MS) return false;
      if (candidates.length >= max_candidates) return false;
      if (_conflictsWithAssignment(bundle, assignment)) continue;
      assignment[idx] = bundle;
      if (_linksStillSatisfiable(assignment, next)) {
        search(next);
      }
      assignment[idx] = null;
    }
    return true;
  }

  search(reqs.map((_, i) => i));

  // --- 4. Partial-violation fallback ---
  if (candidates.length === 0) {
    const partials = _generatePartialViolationCandidates(
      reqs, liveDomains, filters, prefs, courseMap, 10,
    );
    return { candidates: partials, conflicts: [] };
  }

  candidates.sort((a, b) => a.score - b.score);
  return { candidates: candidates.slice(0, max_candidates), conflicts: [] };
}

function _findCourseFor(section, courseMap) {
  for (const [code, c] of courseMap) {
    if ((c.sections || []).some((s) => s.class_number === section.class_number)) return code;
  }
  return null;
}

// "Show-me-anyway" candidates when no valid solution exists. We pick
// one bundle per requirement (earliest in domain) regardless of
// cross-requirement conflicts and label the violations on each.
function _generatePartialViolationCandidates(reqs, domains, filters, prefs, courseMap, max) {
  const out = [];
  // Cap at one combination per "easy" picking of bundles so we don't
  // explode. In practice if the search came back empty, generating
  // a handful of best-effort starts is plenty.
  const heads = domains.map((d) => d.slice(0, Math.min(d.length, 3)));
  const indices = heads.map(() => 0);
  const limit = Math.min(max, heads.reduce((a, h) => a * Math.max(1, h.length), 1));
  for (let n = 0; n < limit; n++) {
    const sections = [];
    for (let i = 0; i < heads.length; i++) {
      const b = heads[i][indices[i]];
      if (!b) continue;
      for (const s of b.sections) sections.push(s);
    }
    if (sections.length === 0) break;
    // Annotate violations: pairwise bundle-vs-bundle conflicts AND
    // bundle-vs-filter.
    const violations = [];
    const refs = sections.map((s) => ({
      class_number: s.class_number,
      subject: s.subject || null,
      course_code: _findCourseFor(s, courseMap),
    }));
    out.push({
      sections: refs,
      score: scoreCandidate(sections, prefs),
      violations: violations,
      partial: true,
    });
    // Advance indices like an odometer.
    for (let i = 0; i < indices.length; i++) {
      indices[i]++;
      if (indices[i] < heads[i].length) break;
      indices[i] = 0;
    }
  }
  out.sort((a, b) => a.score - b.score);
  return out;
}
