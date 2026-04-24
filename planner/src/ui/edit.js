// Pure helpers for the Edit module (Piece 3c). All DOM-rendering glue is
// in planner/index.html; this file owns the bits that can be unit-tested
// without a DOM: hash routing, field-definition tables, parsed-vs-effective
// derivation, and the form-to-edits diff that produces store.setEdit calls
// on save.
//
// The field-definition tables are the single source of truth for what the
// form renders — the controller iterates them. Adding a new editable field
// should require only a new row in SECTION_FIELDS / COURSE_FIELDS (and a
// corresponding store-side path whitelist entry in catalog.js, which stays
// the security boundary).

// --- Known-vocabulary options. Mirrors ingester allowlists so dropdowns
// match what the parser recognizes. Anything outside these still works via
// the "Other (specify)" escape hatch, so adding a new value here is just a
// convenience, not a gate.

export const COMPONENT_OPTIONS = [
  "Lecture",
  "Laboratory",
  "Recitation",
  "Seminar",
  "Studio",
  "Workshop",
  "Clinic",
  "Independent Study",
  "Project",
  "Field Instruction/Field Superv",
  "Guided Studies",
  "Research",
];

export const SESSION_OPTIONS = ["A71", "A72", "AD"];

export const STATUS_OPTIONS = ["open", "closed", "waitlist", "cancelled", "unknown"];

export const DAY_OPTIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// --- Section field definitions ----------------------------------------
// Each field: { id, path, label, kind, options?, allowOther?, readOnly?,
//               visibleWhen? }
// `kind` controls the control: text|textarea|checkbox|select|number|time|
// date. `meetings` and `instructors` are handled out-of-band by the
// controller because they're repeatable/nested.

export const SECTION_FIELDS = [
  { id: "class_number", path: "class_number", label: "Class #", kind: "text", readOnly: true },
  { id: "section_code", path: "section_code", label: "Section", kind: "text" },
  { id: "component", path: "component", label: "Component", kind: "select", options: COMPONENT_OPTIONS, allowOther: true },
  { id: "session_code", path: "session.code", label: "Session", kind: "select", options: SESSION_OPTIONS, allowOther: true },
  { id: "session_start_date", path: "session.start_date", label: "Session start", kind: "date" },
  { id: "session_end_date", path: "session.end_date", label: "Session end", kind: "date" },
  { id: "status_type", path: "status.type", label: "Status", kind: "select", options: STATUS_OPTIONS },
  { id: "status_count", path: "status.count", label: "Waitlist count", kind: "number", visibleWhen: { path: "status.type", equals: "waitlist" } },
  { id: "requires_consent", path: "requires_consent", label: "Requires department consent", kind: "checkbox" },
  { id: "grading", path: "grading", label: "Grading", kind: "text" },
  { id: "instruction_mode", path: "instruction_mode", label: "Instruction mode", kind: "text" },
  { id: "location", path: "location", label: "Course location", kind: "text" },
  { id: "topic", path: "topic", label: "Topic", kind: "text" },
  { id: "display_timezone", path: "display_timezone", label: "Display timezone", kind: "text" },
  { id: "notes", path: "notes", label: "Notes", kind: "textarea" },
];

export const MEETING_FIELDS = [
  { id: "days", path: "days", label: "Days", kind: "days" },
  { id: "start_time", path: "start_time", label: "Start time", kind: "time" },
  { id: "end_time", path: "end_time", label: "End time", kind: "time" },
  { id: "start_date", path: "start_date", label: "Start date", kind: "date" },
  { id: "end_date", path: "end_date", label: "End date", kind: "date" },
  { id: "room", path: "room", label: "Room", kind: "text" },
  { id: "building", path: "building", label: "Building", kind: "text" },
  { id: "room_number", path: "room_number", label: "Room number", kind: "text" },
  { id: "instructors", path: "instructors", label: "Instructors", kind: "instructors" },
];

export const COURSE_FIELDS = [
  { id: "title", path: "course.title", label: "Title", kind: "text" },
  { id: "description", path: "course.description", label: "Description", kind: "textarea" },
  { id: "school", path: "course.school", label: "School", kind: "text" },
  { id: "units", path: "course.units", label: "Units", kind: "units" },
];

// --- Path walk helpers (re-implemented here so edit.js stays independent
// of the store; the logic is intentionally symmetric to catalog.js's
// parsePath/getAtPath).

export function parseFieldPath(path) {
  const tokens = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === "[") {
      const close = path.indexOf("]", i);
      if (close === -1) throw new Error(`Malformed path: ${path}`);
      tokens.push({ type: "index", i: Number(path.slice(i + 1, close)) });
      i = close + 1;
      if (path[i] === ".") i++;
    } else {
      let end = i;
      while (end < path.length && path[end] !== "." && path[end] !== "[") end++;
      tokens.push({ type: "prop", name: path.slice(i, end) });
      i = end;
      if (path[i] === ".") i++;
    }
  }
  return tokens;
}

export function getAtFieldPath(obj, path) {
  if (obj == null) return undefined;
  const tokens = parseFieldPath(path);
  let node = obj;
  for (const t of tokens) {
    if (node == null) return undefined;
    node = t.type === "prop" ? node[t.name] : node[t.i];
  }
  return node;
}

// --- Hash routing -----------------------------------------------------

// "#edit/ENGR-UH/3120/20631?field=meetings[0].start_time"
//   → { scope:'section', subject, catnum, class_number, field }
// "#edit/ENGR-UH/3120" (no class_number) → scope:'course'
// Bare "#edit" → empty selection
export function parseEditHash(hash) {
  const empty = { scope: null, subject: null, catnum: null, class_number: null, field: null };
  if (typeof hash !== "string") return empty;
  const clean = hash.replace(/^#/, "");
  if (!clean.startsWith("edit")) return empty;
  const afterEdit = clean.slice(4);
  if (afterEdit === "") return empty;
  if (!afterEdit.startsWith("/")) return empty;
  const [pathPart, queryPart] = afterEdit.slice(1).split("?");
  const parts = pathPart.split("/");
  const subject = parts[0] ? decodeURIComponent(parts[0]) : null;
  const catnum = parts[1] ? decodeURIComponent(parts[1]) : null;
  const class_number = parts[2] ? decodeURIComponent(parts[2]) : null;
  let field = null;
  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    const raw = params.get("field");
    if (raw) field = raw;
  }
  const scope = class_number ? "section" : catnum ? "course" : null;
  return { scope, subject, catnum, class_number, field };
}

export function formatEditHash({ subject, catnum, class_number, field } = {}) {
  if (!subject) return "#edit";
  const s = encodeURIComponent(subject);
  if (!catnum) return `#edit/${s}`;
  const c = encodeURIComponent(catnum);
  if (!class_number) return `#edit/${s}/${c}`;
  const n = encodeURIComponent(class_number);
  const base = `#edit/${s}/${c}/${n}`;
  if (!field) return base;
  return `${base}?field=${encodeURIComponent(field)}`;
}

// --- Context lookup in an effective catalog view ----------------------

// Given the catalog's effective view and a selection, return the matching
// course and (if section-scope) section. Missing lookups return null so
// the caller can render an empty/404 state.
export function findEditContext(effective, { subject, catnum, class_number }) {
  if (!effective || !Array.isArray(effective.courses)) return { course: null, section: null };
  const code = subject && catnum ? `${subject} ${catnum}` : null;
  const course = code ? effective.courses.find((c) => c.code === code) || null : null;
  if (!class_number) return { course, section: null };
  if (!course) return { course: null, section: null };
  const section = course.sections.find((s) => s.class_number === class_number) || null;
  return { course, section };
}

// --- Form state <-> edits diff ---------------------------------------

// Build a flat form state from a section object, respecting field defs.
// Meetings are returned as a separate array so the controller can bind
// them to the repeatable UI.
export function sectionToFormState(section) {
  const flat = {};
  for (const f of SECTION_FIELDS) {
    flat[f.path] = getAtFieldPath(section, f.path);
    if (flat[f.path] === undefined) flat[f.path] = null;
  }
  const meetings = (section && section.meetings ? section.meetings : []).map((m) => ({
    days: Array.isArray(m.days) ? [...m.days] : [],
    start_time: m.start_time || null,
    end_time: m.end_time || null,
    start_date: m.start_date || null,
    end_date: m.end_date || null,
    room: m.room || null,
    building: m.building || null,
    room_number: m.room_number || null,
    instructors: Array.isArray(m.instructors) ? [...m.instructors] : [],
  }));
  return { flat, meetings };
}

export function courseToFormState(course) {
  const flat = {};
  for (const f of COURSE_FIELDS) {
    // Course-scoped edit paths are stored with a "course." prefix (matching
    // the store's key format); strip it for the object lookup.
    const lookupPath = f.path.replace(/^course\./, "");
    flat[f.path] = getAtFieldPath(course, lookupPath);
    if (flat[f.path] === undefined) flat[f.path] = null;
  }
  // Course-level flags surfaced alongside the edit paths.
  flat["course.no_sections_offered"] = !!(course && course.no_sections_offered);
  return { flat };
}

// Deep-equality for the value types we store on edits (JSON-serializable).
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === "object") {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

// Given form state, the parsed-baseline values at the same paths, and the
// section-identity, produce the list of setEdit calls to bring the store
// in sync. An edit whose value matches parsed is emitted as a "delete"
// (value: undefined) so the overlay sheds the now-redundant override.
//
// Paths are whatever keys appear in formFlat; they're validated by the
// store at setEdit time.
export function diffSectionFormToEdits({ classNumber, formFlat, formMeetings, parsedFlat, parsedMeetings }) {
  const calls = [];
  for (const key of Object.keys(formFlat)) {
    if (key === "class_number") continue; // identity, read-only
    const formVal = formFlat[key];
    const parsedVal = parsedFlat ? parsedFlat[key] : undefined;
    if (deepEqual(formVal, parsedVal)) {
      calls.push({ class_number: classNumber, field_path: key, value: undefined });
    } else {
      calls.push({ class_number: classNumber, field_path: key, value: formVal });
    }
  }
  // Meetings: we edit the whole array at once (path "meetings") rather
  // than per-index — simpler, and matches the store's path regex which
  // accepts "meetings" as a full-array write.
  // TODO(meetings): per-meeting edits rather than array-rewrite. Surfaces
  // as a problem only when a section has multiple meetings with
  // independent edits (e.g. MW in room A + F in room B, edit just F's
  // room) — today that rewrites both entries as a single blob, losing
  // the granularity. Defer until real user data exposes the limitation.
  if (formMeetings !== undefined) {
    const parsed = parsedMeetings || [];
    if (deepEqual(formMeetings, parsed)) {
      calls.push({ class_number: classNumber, field_path: "meetings", value: undefined });
    } else {
      calls.push({ class_number: classNumber, field_path: "meetings", value: formMeetings });
    }
  }
  return calls;
}

export function diffCourseFormToEdits({ courseCode, formFlat, parsedFlat }) {
  const calls = [];
  for (const key of Object.keys(formFlat)) {
    const formVal = formFlat[key];
    const parsedVal = parsedFlat ? parsedFlat[key] : undefined;
    if (deepEqual(formVal, parsedVal)) {
      calls.push({ course_code: courseCode, field_path: key, value: undefined });
    } else {
      calls.push({ course_code: courseCode, field_path: key, value: formVal });
    }
  }
  return calls;
}

// --- Recent warnings for the empty state ------------------------------

// Flatten warnings from every subject's parser output into one list,
// attaching subject + last_updated so the UI can sort by recency and
// group by source. Returns at most `limit` entries (default 5).
export function listRecentWarnings(parsedBySubject, metadataBySubject, { limit = 5 } = {}) {
  const rows = [];
  const subjects = parsedBySubject instanceof Map
    ? Array.from(parsedBySubject.entries())
    : Object.entries(parsedBySubject || {});
  for (const [subject, parsed] of subjects) {
    const meta = metadataBySubject instanceof Map
      ? metadataBySubject.get(subject)
      : (metadataBySubject || {})[subject];
    const last = (meta && meta.last_updated) || null;
    const warnings = (parsed && parsed.warnings) || [];
    for (const w of warnings) {
      rows.push({
        subject,
        last_updated: last,
        warning: w,
        class_number: w.class_number || null,
        course_code: w.course_code || null,
      });
    }
  }
  rows.sort((a, b) => {
    const ta = a.last_updated ? Date.parse(a.last_updated) : 0;
    const tb = b.last_updated ? Date.parse(b.last_updated) : 0;
    return tb - ta; // most recent first
  });
  return rows.slice(0, limit);
}

// --- Warning → anchor field path --------------------------------------
// Map a warning to the form field that should receive focus + inline
// repair copy. Returns null when the warning has no single clear
// field-level anchor (e.g. count_mismatch is document-level).
export function warningAnchor(w) {
  if (!w || typeof w.type !== "string") return null;
  switch (w.type) {
    case "meeting_missing_time":
    case "malformed_time":
    case "nonmonotonic_time":
    case "malformed_meeting_dates":
    case "no_meeting":
    case "unknown_days":
      return "meetings";
    case "unknown_status":
    case "missing_status":
      return "status.type";
    case "unknown_component":
      return "component";
    case "missing_session":
    case "malformed_session":
      return "session.code";
    case "missing_description":
      return "course.description";
    case "units_mismatch":
    case "units_parse_failed":
      return "course.units"; // lives in course-scope
    case "duplicate_disagreement":
      return w.field || null; // the disagreement itself identifies the path
    default:
      return null;
  }
}
