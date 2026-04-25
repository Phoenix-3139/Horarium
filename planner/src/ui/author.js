// User-authored courses (Workshop tab). Lets students create courses
// from scratch — useful when Albert hasn't published a section yet,
// when a course exists outside their catalog (cross-listed, audit
// elsewhere), or when sketching out hypotheticals.
//
// Storage strategy: user-authored courses live in localStorage under
// `horarium.user_courses` as an array. On boot we synthesize a
// parserOutput-shaped object and feed it to catalog.ingestSubject()
// under a reserved subject key 'USER-CREATED'. The catalog store
// already handles re-ingest cleanly, so adding/editing/deleting one
// just rewrites the array and re-ingests.
//
// The reserved subject lets us distinguish authored courses from
// parsed ones in the Browse view — they get a small "user-created"
// badge so the user knows which is which.

const STORAGE_KEY = "horarium.user_courses";
const RESERVED_SUBJECT = "USER-CREATED";
const SCHEMA_VERSION = "1.1.3";

// Read the persisted array. Returns [] when storage is empty / private
// browsing / parse failure — never throws.
export function loadUserCourses() {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

// Persist + re-ingest into the catalog so the new course shows up in
// every dependent view (Browse, picker, Cores, etc.) without a reload.
function _saveAndReingest(catalog, courses) {
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(courses)); }
    catch (_) { /* quota / private mode — fall through to in-memory ingest */ }
  }
  if (catalog && typeof catalog.ingestSubject === "function") {
    catalog.ingestSubject(RESERVED_SUBJECT, {
      schema_version: SCHEMA_VERSION,
      header: {
        term: "User-created",
        subject_code: RESERVED_SUBJECT,
        results_shown: courses.length,
        total_class_count: courses.reduce((n, c) => n + (c.sections || []).length, 0),
      },
      courses,
      warnings: [],
    });
  }
}

// Boot: read whatever is saved and re-ingest. Idempotent — safe to
// call multiple times. Returns the in-storage courses.
export function bootAuthored(catalog) {
  const courses = loadUserCourses();
  _saveAndReingest(catalog, courses);
  return courses;
}

// Build a complete section object from form fields. Fills defaults for
// the schema-required fields the form doesn't expose (linked_components,
// title_flags, etc.) so what we pass to the catalog is a fully-shaped
// section, not a partial.
export function buildSection({
  class_number,
  section_code,
  component,
  session_code,
  status_type,
  days,
  start_time,
  end_time,
  building,
  room_number,
  instructors,
}) {
  const sessionDates = SESSION_DATE_DEFAULTS[session_code] || SESSION_DATE_DEFAULTS.AD;
  const room = (building || room_number)
    ? [building, room_number ? `Room ${room_number}` : ""].filter(Boolean).join(" ")
    : null;
  // Albert uses "Lastname, Firstname" so commas are part of one name.
  // Split on " ; " or " & " for multiple instructors; everything else
  // stays a single string.
  const instructorList = Array.isArray(instructors)
    ? instructors.filter(Boolean)
    : (typeof instructors === "string" && instructors.trim())
      ? instructors.split(/\s*[;&]\s*/).map((s) => s.trim()).filter(Boolean)
      : [];
  const meeting = {
    days: Array.isArray(days) ? days.slice() : [],
    start_time: start_time || null,
    end_time: end_time || null,
    start_date: sessionDates.start_date,
    end_date: sessionDates.end_date,
    room,
    building: building || null,
    room_number: room_number || null,
    instructors: instructorList,
  };
  return {
    class_number: String(class_number),
    section_code: String(section_code || "001"),
    component: component || "Lecture",
    session: {
      code: session_code || "AD",
      start_date: sessionDates.start_date,
      end_date: sessionDates.end_date,
    },
    status: {
      raw: STATUS_RAW[status_type] || "Open",
      type: status_type || "open",
      count: null,
    },
    requires_consent: false,
    title_flags: [],
    grading: null,
    instruction_mode: "In-Person",
    location: "Abu Dhabi",
    meetings: meeting.days.length > 0 ? [meeting] : [],
    linked_components: [],
    notes: null,
    topic: null,
    display_timezone: null,
    last_updated_from_paste: new Date().toISOString(),
    _raw_paste_block: "",
    _user_authored: true,
  };
}

// Defaults so the user doesn't have to fill in session start/end dates;
// these mirror the NYUAD term layout used elsewhere in exports.
export const SESSION_DATE_DEFAULTS = {
  A71: { start_date: "2026-08-31", end_date: "2026-10-16" },
  A72: { start_date: "2026-10-26", end_date: "2026-12-14" },
  AD:  { start_date: "2026-08-31", end_date: "2026-12-14" },
};

const STATUS_RAW = {
  open: "Open",
  closed: "Closed",
  waitlist: "Wait List",
  cancelled: "Cancelled",
  unknown: "Unknown",
};

// Add a new course (or merge a new section into an existing authored
// course with the same code). Returns the updated courses array.
export function authorCourse(catalog, { subject, catalog_number, title, units, section }) {
  const courses = loadUserCourses();
  const code = `${subject} ${catalog_number}`;
  const existing = courses.find((c) => c.code === code);
  if (existing) {
    // Merge: replace any section with the same class_number, else append.
    const i = (existing.sections || []).findIndex((s) => s.class_number === section.class_number);
    if (i >= 0) existing.sections[i] = section;
    else (existing.sections = existing.sections || []).push(section);
  } else {
    courses.push({
      code,
      subject,
      catalog_number: String(catalog_number),
      title: title || code,
      title_flags: [],
      description: null,
      description_truncated: false,
      school: null,
      units: units != null ? Number(units) : null,
      sections: [section],
      _user_authored: true,
    });
  }
  _saveAndReingest(catalog, courses);
  return courses;
}

// Generate a unique class number for new sections. Pulls from the
// catalog's effective view to avoid collisions with parsed Albert data.
// Format: 6-digit numeric string starting from 900000 so it visibly
// reads as "user-created" alongside Albert's 5-digit ones.
export function nextClassNumber(catalog) {
  const used = new Set();
  if (catalog && typeof catalog.getEffective === "function") {
    try {
      for (const c of catalog.getEffective().courses || []) {
        for (const s of c.sections || []) {
          if (s.class_number) used.add(String(s.class_number));
        }
      }
    } catch (_) {}
  }
  for (let i = 900000; i < 999999; i++) {
    const cn = String(i);
    if (!used.has(cn)) return cn;
  }
  return String(Date.now()).slice(-6); // fallback — never expected
}

// Drop one authored course (or just one section of it) and re-ingest.
export function deleteAuthoredCourse(catalog, code) {
  const courses = loadUserCourses().filter((c) => c.code !== code);
  _saveAndReingest(catalog, courses);
  return courses;
}

export function deleteAuthoredSection(catalog, code, class_number) {
  const courses = loadUserCourses();
  const c = courses.find((c) => c.code === code);
  if (!c) return courses;
  c.sections = (c.sections || []).filter((s) => s.class_number !== String(class_number));
  // If the course has no sections left, drop the course shell too.
  const out = c.sections.length === 0
    ? courses.filter((x) => x.code !== code)
    : courses;
  _saveAndReingest(catalog, out);
  return out;
}

// Test helper / inspection.
export const _RESERVED_SUBJECT = RESERVED_SUBJECT;
export const _STORAGE_KEY = STORAGE_KEY;
