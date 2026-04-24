// Temporary scaffolding. Exposes the legacy SCHED_DATA catalog shape on
// top of the new createCatalog() store so the Phase 2 planner can swap
// its read sites one at a time without the UI breaking.
//
// When the store is empty (fresh open, no paste yet), every adapter
// method returns an empty value. The UI sees empty-state instead of
// crashing. Once Piece 3a ships and the user pastes an Albert subject,
// the adapter starts returning real data derived from catalog.getEffective().
//
// This file disappears after the plan-state extraction phase lifts the
// remaining plan-shaped reads (SCHED_DATA.options / .conflicts / .analysis)
// into their own module. At that point the UI will read catalog.getEffective()
// directly; no translation layer needed. See docs/MIGRATION_NOTES.md.

// --- Day-code translation (new "Mon"/"Tue" → legacy "M"/"T") -----------
const DAYS_NEW_TO_LEGACY = {
  Mon: "M",
  Tue: "T",
  Wed: "W",
  Thu: "Th",
  Fri: "F",
  Sat: "S",
  Sun: "Su",
};

// --- Time translation ("HH:MM" → minutes-since-midnight) ---------------
function hhmmToMin(hhmm) {
  if (typeof hhmm !== "string") return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// Subjects the legacy "Cores" picker covers. Filter the store's courses
// down to these when answering getCoresList().
const ELECTIVE_SUBJECT_PREFIXES = [
  "CADT-UH",
  "CCOL-UH",
  "CCOS-UH",
  "CDAD-UH",
  "CDES-UH",
  "CEDI-UH",
  "CEXP-UH",
  "CHEM-UH",
  "CHIN-UH",
  "CINE-UH",
  "CITE-UH",
  "CMUS-UH",
  "COM-UH",
  "CSTS-UH",
  "PHYED-UH",
];

// Legacy "cat" codes used in the picker. Mapped from subject for now.
function legacyCatFor(subject) {
  if (subject === "PHYED-UH") return "PHYED";
  if (subject === "CADT-UH") return "CADT";
  if (subject === "CSTS-UH") return "CSTS";
  return subject.replace(/-UH$/, "");
}

function sectionToLegacyMeeting(section) {
  // Each Section.meetings[i] becomes one legacy tuple
  // [ days[], startMin, endMin, sessionCode, component ]
  return section.meetings
    .map((m) => {
      const days = (m.days || [])
        .map((d) => DAYS_NEW_TO_LEGACY[d])
        .filter(Boolean);
      const start = hhmmToMin(m.start_time);
      const end = hhmmToMin(m.end_time);
      if (start == null || end == null) return null;
      return [days, start, end, section.session.code, section.component];
    })
    .filter(Boolean);
}

export function createLegacyAdapter(catalog) {
  // Convert the store's courses into legacy "core" entries. One course
  // becomes one or more entries (one per non-auxiliary section). For
  // Phase 2 we collapse down to the primary lecture-like section.
  function deriveCoresList() {
    const eff = catalog.getEffective();
    const out = [];
    for (const course of eff.courses) {
      if (course._user_created) continue;
      const inElectives = ELECTIVE_SUBJECT_PREFIXES.some((p) => course.subject === p);
      if (!inElectives) continue;
      const primary =
        course.sections.find((s) => s.component !== "Laboratory" && s.component !== "Recitation") ||
        course.sections[0];
      if (!primary) continue;
      const instructors = primary.meetings[0] && primary.meetings[0].instructors;
      out.push({
        id: `${course.subject}-${course.catalog_number}`,
        code: course.code,
        cat: legacyCatFor(course.subject),
        name: course.title,
        prof: instructors && instructors[0] ? instructors[0] : "—",
        status: primary.status && primary.status.type === "open" ? "Open" : "Closed",
        class_num: primary.class_number,
        desc: course.description || "",
        meetings: sectionToLegacyMeeting(primary),
      });
    }
    return out;
  }

  return {
    getCoresList() {
      return deriveCoresList();
    },

    getCoreById(id) {
      return deriveCoresList().find((c) => c.id === id) || null;
    },

    // Legacy: ROOM_DATA[shortKey][componentLabel] -> { bldg, room, dates }.
    // Store is keyed by class_number, not plan-local short keys, so for
    // Phase 2 we return the "—" fallback unconditionally. When the plan-
    // state extraction phase lifts the short-key → class_number mapping
    // out of placeholder_user_plan.js, the adapter can join through that
    // map and return real room data from the store.
    getRoomFor(shortKey, componentLabel) {
      const sessionCode =
        componentLabel === "Seminar" ||
        componentLabel === "PE" ||
        componentLabel === "LAB" ||
        componentLabel === "Lecture" ||
        componentLabel === "Recitation"
          ? null
          : null;
      const datesFallback = (sess) => {
        if (sess === "A71") return "Aug 31 – Oct 16";
        if (sess === "A72") return "Oct 26 – Dec 14";
        return "Aug 31 – Dec 14";
      };
      return {
        bldg: "—",
        room: "—",
        dates: datesFallback(sessionCode),
      };
    },

    // Used by exportAsJSON to emit the full picker catalog. Returns the
    // same shape the legacy code iterates over. Empty when store empty.
    exportCatalog() {
      return deriveCoresList().map((core) => ({
        id: core.id,
        code: core.code,
        cat: core.cat,
        name: core.name,
        prof: core.prof,
        status: core.status,
        class_num: core.class_num,
      }));
    },
  };
}
