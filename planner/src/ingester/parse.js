// Top-level orchestration. Consumes a full Albert subject-search paste,
// discovers the header and term, splits the document into course blocks,
// and hands each one off to parseCourse.
//
// Contract:
//   parse(pasteText) -> { schema_version, header, courses, warnings, unparsed_lines }
//   - never throws
//   - degrades gracefully on partial pastes (missing header, missing term,
//     no courses) — each shortfall becomes a structured warning
//
// Disambiguating course-header vs section-start boundaries is the
// trickiest bit. Both shapes begin with "<SUBJECT> <CATNUM>". The
// distinguishing marker is the "|":
//
//   ENGR-UH 1000 Computer Programming for Engineers   ← course header (no pipe)
//   ENGR-UH 1000 | 4 units                            ← section start (pipe)
//
// A course header also always has a blank line immediately after it and
// a "School:" line within ~40 lines downstream. We additionally require
// the preceding non-blank line to be a known section terminator
// ("Visit the Bookstore", "Select Class #...", the results-for header,
// or start-of-document) to rule out false positives from mid-description
// prose that happens to mention another course code.

import { parseCourse } from "./course.js";

const SCHEMA_VERSION = "1.1.2";

// Prefer the "Course Search" form when present (it's the unambiguous term
// header). Fall back to a bare "<Season> <Year>" anywhere in the preamble,
// which some pages (CAS, for example) render inside a year-dropdown block
// without the "Course Search" suffix.
const TERM_RE_STRICT = /^(Fall|Spring|Summer|January)\s+(\d{4})\s+Course Search\s*$/;
const TERM_RE_LOOSE = /^(Fall|Spring|Summer|January)\s+(\d{4})\b/;
const HEADER_RE =
  /^(\d+)\s*-\s*(\d+)\s+results for:\s+(\S+)\s*\|\s*Total Class Count:\s+(\d+)\s*$/;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Precursor = the closest non-blank line above `i`. A course header's
// precursor is one of a fixed set of terminators, or nothing (we're at
// the start of the document / scan region).
function validCourseHeaderPrecursor(lines, i, boundaryIdx) {
  for (let k = i - 1; k >= boundaryIdx; k--) {
    const t = lines[k].trim();
    if (t === "") continue;
    if (t === "Visit the Bookstore") return true;
    if (/^Select Class #/.test(t)) return true;
    if (HEADER_RE.test(t)) return true;
    // "No Classes Scheduled for the Terms Offered" terminates a course
    // block that has no sections (no "Visit the Bookstore"). The next
    // course header follows immediately. Treat the marker as a valid
    // precursor so we don't lose the following course.
    if (t === "No Classes Scheduled for the Terms Offered") return true;
    return false;
  }
  return true;
}

function hasSchoolWithin(lines, i, lookahead = 40) {
  const end = Math.min(lines.length, i + lookahead);
  for (let j = i + 1; j < end; j++) {
    if (lines[j].trim() === "School:") return true;
  }
  return false;
}

function isCourseHeader(lines, i, subject, boundaryIdx, strict) {
  const line = lines[i];
  if (line.includes("|")) return false; // section-start has a pipe; course header doesn't
  const pattern = subject
    ? new RegExp(`^${escapeRegex(subject)}\\s+\\S+\\s+[^|]+$`)
    : /^[A-Z][A-Z0-9]*-[A-Z]+\s+\S+\s+[^|]+$/;
  if (!pattern.test(line)) return false;
  // A course header is followed by a blank line within the next ~3 lines.
  // Usually the blank is immediate, but multi-line-title courses (e.g.
  // `GERM-UA 9111 Composition/Conversation` with a subtitle on the next
  // line, then blank) interpose 1–2 subtitle lines before the blank.
  // Require a blank within a small window to allow both shapes while
  // still rejecting mid-description prose that mentions another code.
  let blankFound = false;
  for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
    if (lines[j].trim() === "") { blankFound = true; break; }
  }
  if (!blankFound) return false;
  if (!hasSchoolWithin(lines, i)) return false;
  // The precursor check rules out mid-description false positives when we
  // have a header anchor. Without a header (degraded paste), skip it —
  // otherwise the first candidate will always be rejected because the
  // chrome text above it isn't a known terminator.
  if (strict && !validCourseHeaderPrecursor(lines, i, boundaryIdx)) return false;
  return true;
}

export function parse(pasteText) {
  const warnings = [];
  const unparsed_lines = [];

  if (typeof pasteText !== "string" || pasteText.trim() === "") {
    warnings.push({ type: "empty_input", message: "Input paste text was empty" });
    return {
      schema_version: SCHEMA_VERSION,
      header: null,
      courses: [],
      warnings,
      unparsed_lines,
    };
  }

  const lines = pasteText.split("\n").map((l) => l.replace(/\r$/, ""));

  // --- Header line (the results-for trigger) ---------------------------
  // Find the header first so term detection can prefer the term string
  // nearest to (and before) the header.
  let header = null;
  let headerLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(HEADER_RE);
    if (m) {
      header = {
        term: null,
        subject_code: m[3],
        results_shown: parseInt(m[2], 10),
        total_class_count: parseInt(m[4], 10),
      };
      headerLineIdx = i;
      break;
    }
  }

  // --- Term (preamble only; prefer strict-form match, fall back to loose) --
  // The CAS search page renders year-dropdown noise above the selected term
  // ("2024-2025 / 2025-2026 / 2026-2027" followed by "Fall 2026" on a bare
  // line). If the strict "<Season> <Year> Course Search" form is present,
  // use that. Otherwise scan the preamble (everything before the header
  // line) and take the `<Season> <Year>` line nearest the header.
  const termScanEnd = headerLineIdx === -1 ? lines.length : headerLineIdx;
  let term = null;
  // Pass 1: strict.
  for (let i = 0; i < termScanEnd; i++) {
    const m = lines[i].trim().match(TERM_RE_STRICT);
    if (m) {
      term = `${m[1]} ${m[2]}`;
      break;
    }
  }
  // Pass 2: loose, walking backward from just above the header so the
  // nearest match wins over any year-dropdown noise at the top.
  if (!term) {
    for (let i = termScanEnd - 1; i >= 0; i--) {
      const m = lines[i].trim().match(TERM_RE_LOOSE);
      if (m) {
        term = `${m[1]} ${m[2]}`;
        break;
      }
    }
  }
  if (header) header.term = term || null;
  if (!term) {
    warnings.push({
      type: "term_not_found",
      message:
        "Could not find a '<Season> <Year>' line in the preamble (neither the strict 'Course Search' form nor a bare match)",
    });
  }
  if (headerLineIdx === -1) {
    warnings.push({
      type: "header_not_found",
      message:
        "Could not find 'N - M results for: SUBJECT | Total Class Count: K' line",
    });
  }

  // --- Course-block boundaries -----------------------------------------
  const scanStart = headerLineIdx === -1 ? 0 : headerLineIdx + 1;
  const subject = header ? header.subject_code : null;
  const strict = header !== null;
  const courseHeaderIdx = [];
  for (let i = scanStart; i < lines.length; i++) {
    if (isCourseHeader(lines, i, subject, scanStart, strict)) courseHeaderIdx.push(i);
  }

  const courses = [];
  for (let k = 0; k < courseHeaderIdx.length; k++) {
    const start = courseHeaderIdx[k];
    const end = k + 1 < courseHeaderIdx.length ? courseHeaderIdx[k + 1] : lines.length;
    const courseText = lines.slice(start, end).join("\n");
    const result = parseCourse(courseText);
    if (result.course) {
      courses.push(result.course);
      if (header && result.course.subject !== header.subject_code) {
        warnings.push({
          type: "subject_mismatch",
          course_code: result.course.code,
          header_subject: header.subject_code,
          course_subject: result.course.subject,
          message: `Course ${result.course.code} has subject "${result.course.subject}" but header reports "${header.subject_code}"`,
        });
      }
    }
    for (const w of result.warnings) warnings.push(w);
    for (const u of result.unparsed_lines) unparsed_lines.push(u);
  }

  // --- Cross-course class_number collisions (paranoia) -----------------
  const seenClassNumbers = new Map();
  for (const c of courses) {
    for (const s of c.sections) {
      if (!s.class_number) continue;
      if (seenClassNumbers.has(s.class_number)) {
        const prev = seenClassNumbers.get(s.class_number);
        if (prev !== c.code) {
          warnings.push({
            type: "cross_course_class_number_collision",
            class_number: s.class_number,
            courses: [prev, c.code],
            message: `Class number ${s.class_number} appears in both ${prev} and ${c.code}; preserving both (no merge)`,
          });
        }
      } else {
        seenClassNumbers.set(s.class_number, c.code);
      }
    }
  }

  // --- Doc-level sanity checks (only when header was found) ------------
  if (header) {
    if (courses.length === 0) {
      warnings.push({
        type: "no_courses_parsed",
        message: "Header was found but no course blocks were parsed",
      });
    }
    const totalSections = courses.reduce((n, c) => n + c.sections.length, 0);
    if (
      header.total_class_count != null &&
      totalSections !== header.total_class_count
    ) {
      warnings.push({
        type: "count_mismatch",
        expected: header.total_class_count,
        actual: totalSections,
        delta: totalSections - header.total_class_count,
        message: `Parsed ${totalSections} sections across ${courses.length} courses; header said Total Class Count: ${header.total_class_count} (delta ${totalSections - header.total_class_count})`,
      });
    }
    if (header.results_shown != null && courses.length !== header.results_shown) {
      warnings.push({
        type: "results_mismatch",
        expected: header.results_shown,
        actual: courses.length,
        delta: courses.length - header.results_shown,
        message: `Parsed ${courses.length} courses; header said ${header.results_shown} results shown (delta ${courses.length - header.results_shown})`,
      });
    }
  }

  return {
    schema_version: SCHEMA_VERSION,
    header,
    courses,
    warnings,
    unparsed_lines,
  };
}
