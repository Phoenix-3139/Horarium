// Piece 6 — pure helpers for the auto-scheduler's requirements list.
//
// A "requirement" is a single must-have slot the user is asking the
// solver to fill — either with one specific course (single chip) or
// with one of several alternatives (an OR-group). The user can also
// pin a specific section (`locked_section`) to force that exact class
// number into any candidate the solver produces.
//
// All functions in this file are pure: they take a plan + arguments
// and return a NEW plan object (or new requirement object) without
// touching the input. The catalog store wraps them so plan_mutation
// notifications fire correctly; the UI layer reads the result.

// Stable ID generator. Not cryptographic — just unique enough that
// React-style keyed list updates don't get confused. Hex timestamp +
// short random suffix keeps debugging output readable too.
function _newRequirementId() {
  return "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function _normCode(code) {
  return typeof code === "string" ? code.trim() : "";
}

// Return a *new* plan object with `requirements` updated. We
// intentionally do NOT mutate the input plan or its requirements
// array: callers chain these helpers and rely on the new array
// reference for change detection.
function _withRequirements(plan, nextRequirements) {
  return Object.assign({}, plan, { requirements: nextRequirements });
}

function _ensureRequirements(plan) {
  return Array.isArray(plan && plan.requirements) ? plan.requirements : [];
}

/**
 * Add a new requirement to the plan. `courses` is either a single
 * course code string or an array of course codes (OR-group).
 *
 * If a requirement with the same exact set of course codes already
 * exists, the plan is returned unchanged — no duplicate requirements.
 */
export function addRequirement(plan, courses) {
  const incoming = (Array.isArray(courses) ? courses : [courses])
    .map(_normCode)
    .filter(Boolean);
  if (incoming.length === 0) return plan;
  const existing = _ensureRequirements(plan);
  const incomingKey = incoming.slice().sort().join("|");
  for (const r of existing) {
    if ((r.courses || []).slice().sort().join("|") === incomingKey) {
      return plan; // already present
    }
  }
  const next = existing.slice();
  next.push({
    id: _newRequirementId(),
    courses: incoming.slice(),
  });
  return _withRequirements(plan, next);
}

export function removeRequirement(plan, requirementId) {
  const existing = _ensureRequirements(plan);
  const next = existing.filter((r) => r.id !== requirementId);
  if (next.length === existing.length) return plan;
  return _withRequirements(plan, next);
}

/**
 * Append `courseCode` to a single-course requirement, turning it
 * into an OR-group. If the requirement already contains the course,
 * no change.
 */
export function addAlternativeToRequirement(plan, requirementId, courseCode) {
  const code = _normCode(courseCode);
  if (!code) return plan;
  const existing = _ensureRequirements(plan);
  const idx = existing.findIndex((r) => r.id === requirementId);
  if (idx === -1) return plan;
  const r = existing[idx];
  if ((r.courses || []).includes(code)) return plan;
  const next = existing.slice();
  next[idx] = Object.assign({}, r, { courses: (r.courses || []).concat([code]) });
  return _withRequirements(plan, next);
}

/**
 * Remove `courseCode` from an OR-group requirement. If only one
 * alternative remains afterwards, the requirement collapses back to
 * a single-course requirement (the array becomes [theLastCourse]).
 * If removing would empty the requirement, the requirement itself is
 * removed.
 *
 * Locked-section is also dropped if the locked section's course was
 * the one being removed.
 */
export function removeAlternativeFromRequirement(plan, requirementId, courseCode) {
  const code = _normCode(courseCode);
  if (!code) return plan;
  const existing = _ensureRequirements(plan);
  const idx = existing.findIndex((r) => r.id === requirementId);
  if (idx === -1) return plan;
  const r = existing[idx];
  const remaining = (r.courses || []).filter((c) => c !== code);
  if (remaining.length === r.courses.length) return plan; // course wasn't in the group
  if (remaining.length === 0) {
    return removeRequirement(plan, requirementId);
  }
  const updated = Object.assign({}, r, { courses: remaining });
  // If the locked section's course is no longer one of the
  // requirement's alternatives, drop the lock.
  if (updated.locked_section && updated.locked_section._course_code &&
      !remaining.includes(updated.locked_section._course_code)) {
    delete updated.locked_section;
  }
  const next = existing.slice();
  next[idx] = updated;
  return _withRequirements(plan, next);
}

/**
 * Pin a specific class_number to a requirement. The optional
 * `courseCode` is stored alongside on `_course_code` for the
 * remove-alternative cleanup above; callers should supply it when
 * they know it (typically derived from catalog.getEffective()).
 */
export function lockSectionToRequirement(plan, requirementId, classNumber, courseCode) {
  if (!classNumber) return plan;
  const existing = _ensureRequirements(plan);
  const idx = existing.findIndex((r) => r.id === requirementId);
  if (idx === -1) return plan;
  const r = existing[idx];
  const lock = { class_number: String(classNumber) };
  if (courseCode) lock._course_code = _normCode(courseCode);
  const next = existing.slice();
  next[idx] = Object.assign({}, r, { locked_section: lock });
  return _withRequirements(plan, next);
}

export function unlockSectionFromRequirement(plan, requirementId) {
  const existing = _ensureRequirements(plan);
  const idx = existing.findIndex((r) => r.id === requirementId);
  if (idx === -1) return plan;
  const r = existing[idx];
  if (!r.locked_section) return plan;
  const updated = Object.assign({}, r);
  delete updated.locked_section;
  const next = existing.slice();
  next[idx] = updated;
  return _withRequirements(plan, next);
}

// Default preferences — used when a plan loads without a stored
// scheduler_preferences object, or when the user hits "reset."
export const DEFAULT_PREFERENCES = Object.freeze({
  no_starts_before: null,
  no_ends_after: null,
  lunch_break: false,
  day_distribution: "ignore", // "ignore" | "balanced" | "compressed"
  include_closed_waitlisted: false,
});

// Defensive: read preferences off a plan, filling in defaults for
// any missing field. Returns a fresh object.
export function preferencesFor(plan) {
  const p = (plan && plan.scheduler_preferences) || {};
  return {
    no_starts_before: typeof p.no_starts_before === "string" ? p.no_starts_before : null,
    no_ends_after: typeof p.no_ends_after === "string" ? p.no_ends_after : null,
    lunch_break: !!p.lunch_break,
    day_distribution: p.day_distribution === "balanced" || p.day_distribution === "compressed"
      ? p.day_distribution : "ignore",
    include_closed_waitlisted: !!p.include_closed_waitlisted,
  };
}

// Update preferences and return a new plan. Fields not in `partial`
// are preserved; pass null to clear a string field.
export function updatePreferences(plan, partial) {
  const current = preferencesFor(plan);
  const next = Object.assign({}, current, partial || {});
  return Object.assign({}, plan, { scheduler_preferences: next });
}
