import { describe, it, expect } from "vitest";
import { WARNING_COPY, translateWarning } from "./warning_copy.js";

describe("translateWarning — known types", () => {
  it("meeting_missing_time is info-severity", () => {
    const t = translateWarning({ type: "meeting_missing_time", class_number: "20631" });
    expect(t.severity).toBe("info");
    expect(t.short).toMatch(/No scheduled time/);
  });

  it("units_mismatch interpolates both unit values, is attention-severity", () => {
    const t = translateWarning({
      type: "units_mismatch",
      class_number: "29999",
      course_code: "ENGR-UH 9999",
      section_units: 3,
      course_units: 2,
    });
    expect(t.severity).toBe("attention");
    expect(t.full).toMatch(/section: 3/);
    expect(t.full).toMatch(/course: 2/);
  });

  it("units_mismatch handles range objects", () => {
    const t = translateWarning({
      type: "units_mismatch",
      section_units: { min: 2, max: 4 },
      course_units: 4,
    });
    expect(t.full).toMatch(/section: 2–4/);
    expect(t.full).toMatch(/course: 4/);
  });

  it("unknown_status quotes the raw Albert value", () => {
    const t = translateWarning({ type: "unknown_status", raw: "Tentative" });
    expect(t.severity).toBe("attention");
    expect(t.full).toMatch(/"Tentative"/);
  });

  it("unknown_component quotes the raw value", () => {
    const t = translateWarning({ type: "unknown_component", value: "Gym Class" });
    expect(t.full).toMatch(/"Gym Class"/);
  });

  it("duplicate_disagreement shows both conflicting values at the leaf path", () => {
    const t = translateWarning({
      type: "duplicate_disagreement",
      field: "meetings[0].room",
      values: ["West Admin Room 001", "East Admin Building Room 200"],
    });
    expect(t.severity).toBe("attention");
    expect(t.full).toMatch(/meetings\[0\]\.room/);
    expect(t.full).toMatch(/West Admin Room 001/);
    expect(t.full).toMatch(/East Admin Building Room 200/);
  });

  it("count_mismatch shows expected/actual/delta", () => {
    const t = translateWarning({
      type: "count_mismatch",
      expected: 141,
      actual: 125,
      delta: -16,
    });
    expect(t.severity).toBe("info");
    expect(t.full).toMatch(/141/);
    expect(t.full).toMatch(/125/);
    expect(t.full).toMatch(/-16/);
  });

  it("missing_description is info (courses can legitimately lack text)", () => {
    const t = translateWarning({ type: "missing_description", course_code: "GERM-UA 501" });
    expect(t.severity).toBe("info");
  });

  it("nonmonotonic_time surfaces both times", () => {
    const t = translateWarning({
      type: "nonmonotonic_time",
      start_time: "14:00",
      end_time: "12:00",
    });
    expect(t.full).toMatch(/14:00/);
    expect(t.full).toMatch(/12:00/);
  });

  it("unknown_subject_suffix names the subject", () => {
    const t = translateWarning({ type: "unknown_subject_suffix", subject: "FAKE-ZZ" });
    expect(t.full).toMatch(/FAKE-ZZ/);
  });
});

describe("translateWarning — fallback for unknown types", () => {
  it("emits a 'Not yet translated' message for unknown warning types", () => {
    const t = translateWarning({ type: "brand_new_type_42", message: "something happened" });
    expect(t.short).toBe("Not yet translated");
    expect(t.full).toMatch(/Not yet translated/);
    expect(t.full).toMatch(/something happened/);
  });

  it("handles a malformed warning (missing type)", () => {
    const t = translateWarning({});
    expect(t.severity).toBe("attention");
    expect(t.short).toBe("Malformed warning");
  });

  it("handles null input", () => {
    const t = translateWarning(null);
    expect(t.severity).toBe("attention");
    expect(t.short).toBe("Malformed warning");
  });
});

describe("WARNING_COPY — coverage", () => {
  it("every current ingester warning type has a translation", () => {
    // Pinning the known set here so we notice at test time when the parser
    // adds a new type without adding copy. Update this list when a new
    // warning type is introduced.
    const KNOWN_TYPES = [
      "meeting_missing_time",
      "missing_description",
      "no_sections",
      "unknown_subject_suffix",
      "units_parse_failed",
      "units_mismatch",
      "unknown_status",
      "unknown_component",
      "duplicate_disagreement",
      "malformed_session",
      "malformed_meeting_dates",
      "malformed_time",
      "nonmonotonic_time",
      "no_meeting",
      "incomplete_section",
      "missing_session",
      "missing_status",
      "missing_section_header",
      "unknown_days",
      "header_code_mismatch",
      "duplicate_class_number_post_dedup",
      "count_mismatch",
      "results_mismatch",
      "subject_mismatch",
      "cross_course_class_number_collision",
      "term_not_found",
      "header_not_found",
      "no_courses_parsed",
      "empty_input",
      "invalid_path",
      "auto_pruned",
    ];
    for (const t of KNOWN_TYPES) {
      expect(WARNING_COPY[t], `copy for ${t}`).toBeDefined();
      const translated = translateWarning({ type: t });
      expect(translated.severity === "info" || translated.severity === "attention").toBe(true);
      expect(typeof translated.short).toBe("string");
      expect(translated.short.length).toBeGreaterThan(0);
      expect(typeof translated.full).toBe("string");
      expect(translated.full.length).toBeGreaterThan(0);
    }
  });
});
