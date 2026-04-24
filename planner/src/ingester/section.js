// Section-block parser. Consumes the text of one Albert section block and
// produces a Section object matching DATA_SCHEMA.md v1.1.1.
//
// Contract:
//   parseSection(blockText, context) -> { section, warnings, unparsed_lines }
//   - never throws
//   - never drops a line silently (every unmatched line is surfaced)
//   - every weird-but-parsed value emits a warning (not an unparsed_line)
//
// Dedup happens upstream at the course-block layer; this file assumes it is
// handed one block.

import {
  parseDate,
  parseTime,
  parseDays,
  parseStatus,
  parseRoom,
  parseSession,
  parseInstructors,
  parseUnits,
} from "./helpers.js";

// Expected component values on Albert's `Component: <value>` line.
// Confirmed vocabulary, per docs/NOMENCLATURE.md Section 4. "Guided Studies"
// and "Research" added 2026-04-24 after CS-UY Tandon paste evidence.
// Anything outside this set still parses but emits unknown_component so the
// UI can surface new vocabularies NYU introduces.
const KNOWN_COMPONENTS = new Set([
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
]);

function unitsEqual(a, b) {
  if (a == null || b == null) return a === b;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "object" && typeof b === "object")
    return a.min === b.min && a.max === b.max;
  return false;
}

// Pull a meeting line into structured sub-strings. Returns null if the line
// doesn't start with a date range (caller treats it as unparsed).
//
// Strategy: peel layers off the right-hand side in this order —
//   1. date range off the front
//   2. " with <instructors>" off the back
//   3. "No Room Required" (anywhere, possibly with no leading space)
//   4. " at <room>" off the back
//   5. whatever's left is "<days> <start> - <end>" (either field may be absent)
function parseMeetingLine(line) {
  // NOTE: we deliberately do NOT consume the whitespace after the date
  // range, so the " with " / " at " splits downstream have a space to
  // anchor on even when nothing precedes them (e.g. dates-then-room-only).
  const m = line.match(/^(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})(.*)$/);
  if (!m) return null;
  const start_date = parseDate(m[1]);
  const end_date = parseDate(m[2]);
  let rest = m[3];

  let instructor_str = "";
  const withIdx = rest.indexOf(" with ");
  if (withIdx !== -1) {
    instructor_str = rest.slice(withIdx + " with ".length).trim();
    rest = rest.slice(0, withIdx);
  }

  let room_str = null;
  const nrrIdx = rest.indexOf("No Room Required");
  if (nrrIdx !== -1) {
    room_str = "No Room Required";
    rest = rest.slice(0, nrrIdx);
  } else {
    // Match " at " OR a leading "at " (the latter happens when the line has
    // no day/time — e.g. "<dates> at <room>").
    const atMatch = rest.match(/(^\s*|\s+)at\s+/);
    if (atMatch) {
      const atIdx = atMatch.index + atMatch[0].length;
      room_str = rest.slice(atIdx).trim();
      rest = rest.slice(0, atMatch.index);
    }
  }

  rest = rest.trim();

  let days_str = "";
  let start_time_str = null;
  let end_time_str = null;
  if (rest !== "") {
    // "Mon,Wed 5.00 PM - 6.15 PM"
    const timed = rest.match(
      /^(\S+)\s+(\d{1,2}\.\d{2}\s*(?:AM|PM))\s*-\s*(\d{1,2}\.\d{2}\s*(?:AM|PM))\s*$/i,
    );
    if (timed) {
      days_str = timed[1];
      start_time_str = timed[2];
      end_time_str = timed[3];
    } else {
      // Days without time — unusual; keep the raw string so the caller can
      // still pull out days (if any) and emit a warning about missing time.
      days_str = rest;
    }
  }

  return {
    start_date,
    end_date,
    start_date_raw: m[1],
    end_date_raw: m[2],
    days_str,
    start_time_str,
    end_time_str,
    room_str,
    instructor_str,
  };
}

export function parseSection(blockText, context = {}) {
  const warnings = [];
  const unparsed_lines = [];
  const push_warning = (w) => warnings.push(w);

  if (typeof blockText !== "string" || blockText.trim() === "") {
    return { section: null, warnings, unparsed_lines };
  }

  const lines = blockText.split("\n").map((l) => l.replace(/\r$/, ""));
  const fields = Object.create(null);
  const meeting_lines = [];
  let requires_consent = false;
  let notes = null;
  // Albert inserts a single-line timezone disclaimer inside global /
  // study-away section blocks between the metadata and the meeting line.
  // Captured here and attached to the Section; default null for
  // domestic / non-global sections.
  let display_timezone = null;
  let section_units_str = null;
  let header_code = null;

  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;

  // First non-empty line: either "<CODE> | <UNITS> units" (usually the
  // first section of a course restates units) or bare "<CODE>" (every
  // subsequent section omits the units line). Both are valid; the course
  // parser carries course_units in context so the unit-mismatch check
  // still runs when units are present.
  if (i < lines.length) {
    const headerMatch = lines[i].match(
      /^([A-Z][A-Z0-9\-]*\s+\S+)(?:\s*\|\s*(.+?)\s+units?\s*)?\s*$/,
    );
    if (headerMatch) {
      header_code = headerMatch[1].trim();
      if (headerMatch[2] != null) section_units_str = headerMatch[2].trim();
      i++;
    } else {
      push_warning({
        type: "missing_section_header",
        message: `First line did not match "<CODE>" or "<CODE> | N units": ${JSON.stringify(lines[i])}`,
      });
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      i++;
      continue;
    }
    if (trimmed === "Visit the Bookstore") {
      i++;
      continue;
    }
    if (/^Select Class #/.test(trimmed)) {
      i++;
      continue;
    }
    if (trimmed === "Requires Department Consent") {
      requires_consent = true;
      i++;
      continue;
    }
    // Global / study-away timezone disclaimer. Format:
    //   "Class Times are shown in the <city>, <country> time zone.
    //    Make sure you convert to your local time zone, if needed."
    // Everything between "in the " and " time zone." is the location.
    {
      const tz = trimmed.match(/^Class Times are shown in the (.+?)\s+time zone\b/);
      if (tz) {
        display_timezone = tz[1].trim();
        i++;
        continue;
      }
    }
    if (/^\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}/.test(trimmed)) {
      meeting_lines.push({ line_number: i, text: trimmed });
      i++;
      continue;
    }
    if (/^Notes:/.test(trimmed)) {
      const first = trimmed.replace(/^Notes:\s*/, "");
      const parts = first !== "" ? [first] : [];
      i++;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (
          t === "" ||
          t === "Visit the Bookstore" ||
          /^Select Class #/.test(t) ||
          /^\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}/.test(t)
        )
          break;
        // Preserve the line verbatim (no .trim()) so indentation in the
        // note is kept. A final overall .trim() cleans trailing whitespace.
        parts.push(lines[i]);
        i++;
      }
      const joined = parts.join("\n").replace(/\s+$/, "");
      notes = joined === "" ? null : joined;
      continue;
    }
    const kv = line.match(/^([^:]+):\s*(.*)$/);
    if (kv) {
      fields[kv[1].trim()] = kv[2].trim();
      i++;
      continue;
    }
    unparsed_lines.push({ text: line, reason: "unrecognized line in section block" });
    i++;
  }

  const class_number = fields["Class#"] || null;
  const section_code = fields["Section"] || null;

  if (!class_number || !section_code) {
    push_warning({
      type: "incomplete_section",
      class_number,
      message: `Section block missing ${!class_number ? "Class# " : ""}${!section_code ? "Section " : ""}— emitting what we have`,
    });
  }

  // Session
  let session = null;
  if (fields["Session"]) {
    const parsed = parseSession(fields["Session"]);
    if (parsed) {
      session = parsed;
    } else {
      // Salvage the code if possible; leave dates null.
      const codeMatch = fields["Session"].match(/^(\S+)/);
      session = {
        code: codeMatch ? codeMatch[1] : null,
        start_date: null,
        end_date: null,
      };
      push_warning({
        type: "malformed_session",
        class_number,
        raw: fields["Session"],
        message: `Could not parse session dates from: ${JSON.stringify(fields["Session"])}`,
      });
    }
  } else {
    push_warning({
      type: "missing_session",
      class_number,
      message: "Section block had no Session: line",
    });
  }

  // Status
  let status = { raw: "", type: "unknown", count: null };
  if (fields["Class Status"] != null) {
    status = parseStatus(fields["Class Status"]);
    if (status.type === "unknown") {
      push_warning({
        type: "unknown_status",
        class_number,
        raw: status.raw,
        message: `Class Status value "${status.raw}" did not match any known pattern`,
      });
    }
  } else {
    push_warning({
      type: "missing_status",
      class_number,
      message: "Section block had no Class Status: line",
    });
  }

  // Component
  let component = null;
  if (fields["Component"] != null) {
    component = fields["Component"];
    if (!KNOWN_COMPONENTS.has(component)) {
      push_warning({
        type: "unknown_component",
        class_number,
        value: component,
        message: `Component "${component}" is not in the known allowlist; preserving verbatim`,
      });
    }
  }

  // Unit comparison sanity check
  const section_units = parseUnits(section_units_str);
  if (section_units != null && context && context.course_units != null) {
    if (!unitsEqual(section_units, context.course_units)) {
      push_warning({
        type: "units_mismatch",
        class_number,
        course_code: context.course_code || null,
        course_units: context.course_units,
        section_units,
        message: `Section ${class_number || "?"} reports ${JSON.stringify(section_units)} units but course ${context.course_code || "?"} reports ${JSON.stringify(context.course_units)}. Prefer the section's value.`,
      });
    }
  }

  // Header code sanity check (mainly catches concatenation bugs upstream)
  if (header_code && context && context.course_code && header_code !== context.course_code) {
    push_warning({
      type: "header_code_mismatch",
      class_number,
      course_code: context.course_code,
      observed: header_code,
      message: `Section header code "${header_code}" doesn't match course "${context.course_code}"`,
    });
  }

  // Meetings. Cancelled sections always emit meetings: [] with no warning —
  // the walkthrough says don't invent meeting data for them, and a cancelled
  // section with a "dates + No Room Required" ghost line is the documented
  // shape, not an anomaly. Skip the whole processing loop to avoid emitting
  // meeting-shape warnings (missing_time, etc.) for data we're about to drop.
  const is_cancelled = status.type === "cancelled";
  const meetings = [];
  if (!is_cancelled) for (const { text } of meeting_lines) {
    const parsed = parseMeetingLine(text);
    if (!parsed) {
      unparsed_lines.push({ text, reason: "meeting line did not match date-range prefix" });
      continue;
    }
    if (parsed.start_date == null || parsed.end_date == null) {
      push_warning({
        type: "malformed_meeting_dates",
        class_number,
        raw: text,
        message: `Meeting line had a date range we could not parse: "${text}"`,
      });
    }

    const { days, unknown: unknown_days } = parseDays(parsed.days_str);
    if (unknown_days.length > 0) {
      push_warning({
        type: "unknown_days",
        class_number,
        tokens: unknown_days,
        message: `Unrecognized day tokens ${JSON.stringify(unknown_days)} in "${text}"`,
      });
    }

    let start_time = null;
    let end_time = null;
    if (parsed.start_time_str) {
      start_time = parseTime(parsed.start_time_str);
      if (start_time == null) {
        push_warning({
          type: "malformed_time",
          class_number,
          raw: parsed.start_time_str,
          message: `Could not parse start time "${parsed.start_time_str}" in "${text}"`,
        });
      }
    }
    if (parsed.end_time_str) {
      end_time = parseTime(parsed.end_time_str);
      if (end_time == null) {
        push_warning({
          type: "malformed_time",
          class_number,
          raw: parsed.end_time_str,
          message: `Could not parse end time "${parsed.end_time_str}" in "${text}"`,
        });
      }
    }
    if (start_time && end_time && end_time <= start_time) {
      push_warning({
        type: "nonmonotonic_time",
        class_number,
        start_time,
        end_time,
        message: `End time ${end_time} is not after start time ${start_time} in "${text}"`,
      });
    }

    const room = parseRoom(parsed.room_str);
    const instructors = parseInstructors(parsed.instructor_str);

    // Dates-and-room-only (no days, no times) — real case: ENGR-UH 3120 LAB2.
    const has_time = start_time != null && end_time != null;
    const has_days = days.length > 0;
    if (!has_time && !has_days && (room.room != null || instructors.length > 0)) {
      push_warning({
        type: "meeting_missing_time",
        class_number,
        raw: text,
        message: `Meeting has no day/time — only dates + room. Verify this isn't a parse bug.`,
      });
    }

    meetings.push({
      days,
      start_time,
      end_time,
      start_date: parsed.start_date,
      end_date: parsed.end_date,
      room: room.room,
      building: room.building,
      room_number: room.room_number,
      instructors,
    });
  }

  if (!is_cancelled && meetings.length === 0 && meeting_lines.length === 0) {
    push_warning({
      type: "no_meeting",
      class_number,
      message: "Non-cancelled section has no meeting line",
    });
  }
  const final_meetings = meetings;

  const section = {
    class_number,
    section_code,
    component,
    session,
    status,
    requires_consent,
    grading: fields["Grading"] || null,
    instruction_mode: fields["Instruction Mode"] || null,
    location: fields["Course Location"] || null,
    meetings: final_meetings,
    linked_components: [],
    notes,
    topic: null,
    display_timezone,
  };

  return { section, warnings, unparsed_lines };
}
