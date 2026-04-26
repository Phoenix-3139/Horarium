// Human-readable translations for the structured warnings that the
// ingester emits. Each entry takes a warning object and returns:
//   { severity: 'info' | 'attention', short: string, full: string }
//
// `info` is for routine artefacts users should know about but don't need
// to act on (independent-study sections with no time, Albert's dedup-vs-
// header count mismatches). `attention` is for data-consistency issues
// that may indicate a parse issue or a real Albert inconsistency worth
// investigating (unit mismatches, duplicate-disagreement, unrecognized
// vocabulary, malformed times).
//
// Unknown warning types fall through to translateWarning's default,
// which surfaces the raw message with a "Not yet translated" prefix so
// new warning types become visible immediately rather than silently
// rendering as raw type strings.
//
// Shared by Browse and the Paste preview. New warning surfaces should
// import from here — don't duplicate copy.

export const WARNING_COPY = {
  // --- section-level, routine ---
  meeting_missing_time: () => ({
    severity: "info",
    short: "No scheduled time",
    full:
      "No scheduled time on this section. Typical for independent study, research, or by-arrangement courses where day/time are set with the instructor.",
  }),

  // --- course-level, routine ---
  missing_description: () => ({
    severity: "info",
    short: "No description",
    full:
      "Course has no description text in the paste. Some catalog entries are placeholders for topics courses or cross-listings and lack dedicated descriptions.",
  }),
  no_sections: (w) => ({
    severity: "attention",
    short: "No sections parsed",
    full: `Course ${w.course_code || ""} has no sections this term, but Albert didn't mark it "No Classes Scheduled." This may indicate a parse issue — try re-pasting the subject.`,
  }),
  unknown_subject_suffix: (w) => ({
    severity: "info",
    short: "New subject prefix",
    full: `Subject "${w.subject || ""}" isn't in Horarium's known-prefix list. Still parsed normally; likely a new prefix NYU added — update docs/NOMENCLATURE.md.`,
  }),
  units_parse_failed: (w) => ({
    severity: "attention",
    short: "Units unreadable",
    full: `Could not parse the units value "${w.raw || ""}" for ${w.course_code || "this course"}. Course units set to null.`,
  }),

  // --- section-level, data-worthy ---
  units_mismatch: (w) => {
    const sec = typeof w.section_units === "object"
      ? `${w.section_units.min}–${w.section_units.max}`
      : String(w.section_units);
    const crs = typeof w.course_units === "object"
      ? `${w.course_units.min}–${w.course_units.max}`
      : String(w.course_units);
    return {
      severity: "attention",
      short: "Unit mismatch",
      full: `Section and course disagree on credit units (section: ${sec}, course: ${crs}). Using the section's value.`,
    };
  },
  unknown_status: (w) => ({
    severity: "attention",
    short: "New status vocabulary",
    full: `Albert reported a class status Horarium doesn't recognize: "${w.raw || ""}". Treated as unknown; displayed verbatim on the section card.`,
  }),
  unknown_component: (w) => ({
    severity: "attention",
    short: "New component",
    full: `Albert reported a component Horarium doesn't recognize: "${w.value || ""}". Section is included in the catalog; rendering may be rough until the allowlist is updated.`,
  }),
  duplicate_disagreement: (w) => {
    const vals = Array.isArray(w.values) ? w.values : [];
    const a = JSON.stringify(vals[0]);
    const b = JSON.stringify(vals[1]);
    return {
      severity: "attention",
      short: "Duplicate disagrees",
      full: `Two copies of this section in the paste reported different ${w.field || "values"}. First occurrence kept: ${a}. Second reported: ${b}.`,
    };
  },
  malformed_session: (w) => ({
    severity: "attention",
    short: "Session dates malformed",
    full: `Couldn't parse the session date range from "${w.raw || ""}". Code preserved; start_date and end_date set to null.`,
  }),
  malformed_meeting_dates: (w) => ({
    severity: "attention",
    short: "Meeting dates malformed",
    full: `A meeting line had a date range Horarium couldn't parse: "${w.raw || ""}". Meeting preserved where possible.`,
  }),
  malformed_time: (w) => ({
    severity: "attention",
    short: "Time malformed",
    full: `A meeting time couldn't be parsed ("${w.raw || ""}"). Start or end time set to null.`,
  }),
  nonmonotonic_time: (w) => ({
    severity: "attention",
    short: "End ≤ start",
    full: `A meeting's end time (${w.end_time}) is not after its start time (${w.start_time}). Likely an Albert-side typo; verify against the source.`,
  }),
  no_meeting: () => ({
    severity: "attention",
    short: "No meeting line",
    full:
      "Non-cancelled section has no meeting line at all. Rare enough to suspect a parse miss — check the paste.",
  }),
  incomplete_section: () => ({
    severity: "attention",
    short: "Missing required fields",
    full:
      "Parser couldn't find Class# or Section for a section block. Data is incomplete; re-pasting may help.",
  }),
  missing_session: () => ({
    severity: "attention",
    short: "Missing session",
    full: "Section block had no Session: line. Dates unknown.",
  }),
  missing_status: () => ({
    severity: "attention",
    short: "Missing status",
    full: "Section block had no Class Status: line. Displayed as unknown.",
  }),
  missing_section_header: () => ({
    severity: "info",
    short: "Missing section header",
    full: 'First line of a section block didn\'t match "<CODE>" or "<CODE> | N units".',
  }),
  unknown_days: (w) => ({
    severity: "attention",
    short: "Unrecognized days",
    full: `Day token(s) outside Mon–Sun were seen and dropped: ${JSON.stringify(w.tokens || [])}.`,
  }),
  header_code_mismatch: (w) => ({
    severity: "info",
    short: "Header code mismatch",
    full: `Section header code "${w.observed || ""}" doesn't match the enclosing course code "${w.course_code || ""}". Usually harmless.`,
  }),
  duplicate_class_number_post_dedup: (w) => ({
    severity: "attention",
    short: "Duplicate survived dedup",
    full: `Invariant violation: class number ${w.class_number} survived dedup inside ${w.course_code || "a course"}. Please file a bug.`,
  }),

  // --- document-level (attached to the subject, not individual courses) ---
  count_mismatch: (w) => ({
    severity: "info",
    short: "Count differs from Albert",
    full: `Albert's header reported ${w.expected} classes total; the parser found ${w.actual} after de-duplication (delta ${w.delta >= 0 ? "+" : ""}${w.delta}). Usually just means Albert's count includes duplicate rows.`,
  }),
  results_mismatch: (w) => ({
    severity: "info",
    short: "Results-shown mismatch",
    full: `Albert's header reported ${w.expected} results shown; parser found ${w.actual} courses. Usually informational — occasionally a cross-listed course is counted twice.`,
  }),
  subject_mismatch: (w) => ({
    severity: "attention",
    short: "Subject mismatch inside paste",
    full: `A course's subject (${w.course_subject || ""}) differs from the paste header's subject (${w.header_subject || ""}). Possibly a mixed paste.`,
  }),
  cross_course_class_number_collision: (w) => ({
    severity: "attention",
    short: "Class number in two courses",
    full: `Class number ${w.class_number} appears in both ${(w.courses || [])[0]} and ${(w.courses || [])[1]}. Both preserved.`,
  }),
  term_not_found: () => ({
    severity: "info",
    short: "Term not detected",
    full:
      "Couldn't find a term line in the paste preamble. Courses still parse if present; the header term field is null.",
  }),
  header_not_found: () => ({
    severity: "info",
    short: "Results header missing",
    full:
      'Couldn\'t find the "N - M results for: SUBJECT | Total Class Count: K" line. Paste may be truncated. Courses still parse if present.',
  }),
  no_courses_parsed: () => ({
    severity: "attention",
    short: "No courses parsed",
    full:
      "Header was found but no course blocks were parsed. The paste may be corrupted or Albert's format may have changed.",
  }),
  empty_input: () => ({
    severity: "info",
    short: "Empty input",
    full: "Paste text was empty.",
  }),
  invalid_path: (w) => ({
    severity: "attention",
    short: "Stale edit path",
    full: `A saved edit referenced a field path ("${w.edit && w.edit.field_path}") that isn't valid in the current schema. Edit was dropped on load.`,
  }),
  auto_pruned: () => ({
    severity: "info",
    short: "Edit auto-pruned",
    full: "An edit whose value now matches Albert's data was silently removed on re-ingest.",
  }),
};

// Human-readable copy for the Edit module's warning-anchored repair view.
// Shown inline above the affected form field. Shorter and more directive
// than `full` — tells the user what to do, not just what happened. Unknown
// warning types fall back to `full` text.
export const REPAIR_HINTS = {
  meeting_missing_time:
    "Parser couldn't find a meeting time in the source. Albert sometimes omits times for independent study or by-arrangement courses. If you know the actual meeting times, fill them in below.",
  malformed_time:
    "A meeting time in the source was unreadable. Correct the start/end times below; the rest of the meeting will stay as parsed.",
  nonmonotonic_time:
    "The parser saw an end time not after the start time — likely an Albert typo. Fix whichever is wrong below.",
  malformed_meeting_dates:
    "A meeting's date range was unreadable. Enter the correct start/end dates below.",
  no_meeting:
    "This section has no meeting line at all. If it should meet, add a meeting below.",
  unknown_days:
    "Day tokens outside Mon–Sun were dropped. Re-select the correct days below.",
  unknown_status:
    "Albert reported a status Horarium doesn't recognize. Select the closest match below — or leave it as 'unknown' and the section still appears in your catalog.",
  missing_status:
    "This section had no Class Status line. Pick a status below or leave it as 'unknown'.",
  unknown_component:
    "Albert used a component value Horarium's allowlist doesn't cover. Pick the closest standard match, or use 'Other (specify)' to keep the original verbatim.",
  missing_session:
  "This section had no Session line. Pick a session code and dates below.",
  malformed_session:
    "The session's date range was unreadable. Fill in the correct start/end dates below.",
  units_mismatch:
    "This section and its course disagreed on credit units. Fixing the course's units (not the section's) resolves the mismatch — use the 'Edit course' link below to go to course scope.",
  units_parse_failed:
    "The course's units value was unreadable. Set the correct units on the course (switch to course scope).",
  missing_description:
    "The course block had no description text. Add one below if you'd like Horarium to display it.",
  duplicate_disagreement:
    "Two occurrences of this section in the paste reported different values at this field. Pick whichever is correct, or type your own value.",
};

export function translateWarning(w) {
  if (!w || typeof w.type !== "string") {
    return {
      severity: "attention",
      short: "Malformed warning",
      full: "A warning object was missing its type field.",
    };
  }
  const entry = WARNING_COPY[w.type];
  const base = entry
    ? entry(w)
    : {
        severity: "info",
        short: "Not yet translated",
        full: `Not yet translated: ${w.message || w.type}`,
      };
  const repair_hint = REPAIR_HINTS[w.type] || null;
  return { ...base, repair_hint };
}
