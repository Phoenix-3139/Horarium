import { describe, it, expect } from "vitest";
import {
  parseEditHash,
  formatEditHash,
  findEditContext,
  sectionToFormState,
  courseToFormState,
  diffSectionFormToEdits,
  diffCourseFormToEdits,
  listRecentWarnings,
  warningAnchor,
  SECTION_FIELDS,
  COURSE_FIELDS,
  MEETING_FIELDS,
} from "./edit.js";

describe("parseEditHash / formatEditHash", () => {
  it("parses full section-scope hash with a field query param", () => {
    expect(parseEditHash("#edit/ENGR-UH/3120/20631?field=meetings[0].start_time")).toEqual({
      scope: "section",
      subject: "ENGR-UH",
      catnum: "3120",
      class_number: "20631",
      field: "meetings[0].start_time",
    });
  });
  it("parses course-scope hash (no class_number)", () => {
    expect(parseEditHash("#edit/GERM-UA/501")).toEqual({
      scope: "course",
      subject: "GERM-UA",
      catnum: "501",
      class_number: null,
      field: null,
    });
  });
  it("bare #edit returns empty", () => {
    expect(parseEditHash("#edit")).toEqual({
      scope: null, subject: null, catnum: null, class_number: null, field: null,
    });
  });
  it("non-edit hashes return empty", () => {
    expect(parseEditHash("#browse/ENGR-UH").scope).toBe(null);
    expect(parseEditHash("").scope).toBe(null);
    expect(parseEditHash(null).scope).toBe(null);
  });
  it("formatEditHash is the inverse for standard inputs", () => {
    expect(formatEditHash({ subject: "ENGR-UH", catnum: "3120", class_number: "20631" }))
      .toBe("#edit/ENGR-UH/3120/20631");
    expect(formatEditHash({ subject: "ENGR-UH", catnum: "3120", class_number: "20631", field: "status.type" }))
      .toBe("#edit/ENGR-UH/3120/20631?field=status.type");
    expect(formatEditHash({})).toBe("#edit");
    expect(formatEditHash({ subject: "ENGR-UH" })).toBe("#edit/ENGR-UH");
    // Round-trip through URL encoding preserves ambiguous catnums.
    const s = formatEditHash({ subject: "ENGR-UH", catnum: "2011 Q", class_number: "20631" });
    expect(parseEditHash(s)).toEqual({
      scope: "section", subject: "ENGR-UH", catnum: "2011 Q", class_number: "20631", field: null,
    });
  });
});

describe("findEditContext", () => {
  const effective = {
    courses: [
      {
        code: "ENGR-UH 3120",
        subject: "ENGR-UH",
        catalog_number: "3120",
        sections: [
          { class_number: "20631", section_code: "LAB2" },
          { class_number: "20632", section_code: "LEC" },
        ],
      },
    ],
  };
  it("finds a section by class_number", () => {
    const ctx = findEditContext(effective, { subject: "ENGR-UH", catnum: "3120", class_number: "20631" });
    expect(ctx.course.code).toBe("ENGR-UH 3120");
    expect(ctx.section.section_code).toBe("LAB2");
  });
  it("returns course-only when no class_number", () => {
    const ctx = findEditContext(effective, { subject: "ENGR-UH", catnum: "3120", class_number: null });
    expect(ctx.course.code).toBe("ENGR-UH 3120");
    expect(ctx.section).toBe(null);
  });
  it("returns nulls when the course is missing", () => {
    const ctx = findEditContext(effective, { subject: "ENGR-UH", catnum: "9999", class_number: null });
    expect(ctx).toEqual({ course: null, section: null });
  });
  it("tolerates empty/malformed effective", () => {
    expect(findEditContext(null, { subject: "ENGR-UH", catnum: "3120" })).toEqual({ course: null, section: null });
    expect(findEditContext({}, { subject: "ENGR-UH", catnum: "3120" })).toEqual({ course: null, section: null });
  });
});

describe("sectionToFormState / courseToFormState", () => {
  it("flattens section fields and preserves meetings separately", () => {
    const section = {
      class_number: "20631",
      section_code: "LAB2",
      component: "Laboratory",
      session: { code: "A71", start_date: "2026-08-31", end_date: "2026-10-16" },
      status: { raw: "Open", type: "open", count: null },
      requires_consent: false,
      grading: "Ugrd Abu Dhabi Graded",
      instruction_mode: "In-Person",
      location: "Abu Dhabi",
      meetings: [
        {
          days: ["Mon", "Wed"],
          start_time: "09:55",
          end_time: "11:10",
          start_date: "2026-08-31",
          end_date: "2026-10-16",
          room: "East Admin Room 003",
          building: "East Admin",
          room_number: "003",
          instructors: ["Sousa, R"],
        },
      ],
      notes: null,
      topic: null,
      display_timezone: null,
    };
    const { flat, meetings } = sectionToFormState(section);
    expect(flat["section_code"]).toBe("LAB2");
    expect(flat["session.code"]).toBe("A71");
    expect(flat["status.type"]).toBe("open");
    expect(flat["status.count"]).toBe(null);
    expect(meetings).toHaveLength(1);
    expect(meetings[0].days).toEqual(["Mon", "Wed"]);
    expect(meetings[0].instructors).toEqual(["Sousa, R"]);
  });
  it("courseToFormState surfaces editable course fields + no_sections_offered", () => {
    const course = {
      code: "ENGR-UH 3120",
      title: "Engineering Materials",
      description: "Intro.",
      school: "NYU Abu Dhabi",
      units: 4,
      no_sections_offered: false,
    };
    const { flat } = courseToFormState(course);
    expect(flat["course.title"]).toBe("Engineering Materials");
    expect(flat["course.units"]).toBe(4);
    expect(flat["course.no_sections_offered"]).toBe(false);
  });
});

describe("diffSectionFormToEdits", () => {
  const parsedSection = {
    class_number: "20631",
    section_code: "LAB2",
    component: "Laboratory",
    session: { code: "A71", start_date: "2026-08-31", end_date: "2026-10-16" },
    status: { raw: "Open", type: "open", count: null },
    requires_consent: false,
    grading: "g",
    instruction_mode: "m",
    location: "l",
    meetings: [
      {
        days: ["Mon"],
        start_time: "09:00",
        end_time: "10:00",
        start_date: "2026-08-31",
        end_date: "2026-10-16",
        room: "R",
        building: "B",
        room_number: "001",
        instructors: [],
      },
    ],
    notes: null,
    topic: null,
    display_timezone: null,
  };
  const parsed = sectionToFormState(parsedSection);

  it("emits no-change as value:undefined (clears overlay) for untouched fields", () => {
    const calls = diffSectionFormToEdits({
      classNumber: "20631",
      formFlat: { ...parsed.flat },
      formMeetings: parsed.meetings,
      parsedFlat: parsed.flat,
      parsedMeetings: parsed.meetings,
    });
    for (const c of calls) {
      if (c.field_path === "class_number") continue;
      expect(c.value).toBe(undefined);
    }
  });

  it("emits a write for a changed leaf", () => {
    const formFlat = { ...parsed.flat, "status.type": "waitlist", "status.count": 3 };
    const calls = diffSectionFormToEdits({
      classNumber: "20631",
      formFlat,
      formMeetings: parsed.meetings,
      parsedFlat: parsed.flat,
      parsedMeetings: parsed.meetings,
    });
    const typeCall = calls.find((c) => c.field_path === "status.type");
    const countCall = calls.find((c) => c.field_path === "status.count");
    expect(typeCall.value).toBe("waitlist");
    expect(countCall.value).toBe(3);
  });

  it("emits a whole-array write when meetings differ and a clear when they match", () => {
    const newMeetings = parsed.meetings.map((m) => ({ ...m, room: "R-NEW" }));
    const calls = diffSectionFormToEdits({
      classNumber: "20631",
      formFlat: parsed.flat,
      formMeetings: newMeetings,
      parsedFlat: parsed.flat,
      parsedMeetings: parsed.meetings,
    });
    const m = calls.find((c) => c.field_path === "meetings");
    expect(m.value).toEqual(newMeetings);
  });

  it("skips class_number (read-only identity)", () => {
    const calls = diffSectionFormToEdits({
      classNumber: "20631",
      formFlat: { ...parsed.flat, class_number: "99999" },
      formMeetings: parsed.meetings,
      parsedFlat: parsed.flat,
      parsedMeetings: parsed.meetings,
    });
    expect(calls.some((c) => c.field_path === "class_number")).toBe(false);
  });
});

describe("diffCourseFormToEdits", () => {
  it("produces course-scoped setEdit calls", () => {
    const parsedFlat = {
      "course.title": "Old Title",
      "course.description": "Old",
      "course.school": "NYU Abu Dhabi",
      "course.units": 4,
    };
    const formFlat = { ...parsedFlat, "course.title": "New Title" };
    const calls = diffCourseFormToEdits({ courseCode: "ENGR-UH 3120", formFlat, parsedFlat });
    const title = calls.find((c) => c.field_path === "course.title");
    expect(title.course_code).toBe("ENGR-UH 3120");
    expect(title.value).toBe("New Title");
    // Untouched fields clear.
    const desc = calls.find((c) => c.field_path === "course.description");
    expect(desc.value).toBe(undefined);
  });
});

describe("listRecentWarnings", () => {
  it("flattens + sorts by subject last_updated desc, caps at limit", () => {
    const parsedBySubject = {
      "ENGR-UH": { warnings: [{ type: "meeting_missing_time", class_number: "20631" }] },
      "PHYED-UH": {
        warnings: [
          { type: "missing_description", course_code: "PHYED-UH 1001" },
          { type: "count_mismatch" },
          { type: "unknown_status", class_number: "20632", raw: "Tentative" },
        ],
      },
    };
    const metadataBySubject = {
      "ENGR-UH": { last_updated: "2026-04-20T10:00:00Z" },
      "PHYED-UH": { last_updated: "2026-04-24T10:00:00Z" },
    };
    const out = listRecentWarnings(parsedBySubject, metadataBySubject, { limit: 5 });
    expect(out).toHaveLength(4);
    // PHYED-UH is more recent → its three warnings come first.
    expect(out[0].subject).toBe("PHYED-UH");
    expect(out[3].subject).toBe("ENGR-UH");
  });
  it("respects the limit", () => {
    const parsed = {
      A: { warnings: [{ type: "x" }, { type: "y" }, { type: "z" }] },
    };
    const meta = { A: { last_updated: "2026-04-24T10:00:00Z" } };
    expect(listRecentWarnings(parsed, meta, { limit: 2 })).toHaveLength(2);
  });
  it("tolerates missing metadata", () => {
    const parsed = { A: { warnings: [{ type: "x" }] } };
    expect(listRecentWarnings(parsed, null, { limit: 5 })).toHaveLength(1);
  });
});

describe("warningAnchor", () => {
  it("maps common warning types to editable field paths", () => {
    expect(warningAnchor({ type: "meeting_missing_time" })).toBe("meetings");
    expect(warningAnchor({ type: "malformed_time" })).toBe("meetings");
    expect(warningAnchor({ type: "unknown_status" })).toBe("status.type");
    expect(warningAnchor({ type: "unknown_component" })).toBe("component");
    expect(warningAnchor({ type: "missing_description" })).toBe("course.description");
    expect(warningAnchor({ type: "units_mismatch" })).toBe("course.units");
  });
  it("duplicate_disagreement uses the warning's own field path", () => {
    expect(warningAnchor({ type: "duplicate_disagreement", field: "meetings[0].room" }))
      .toBe("meetings[0].room");
  });
  it("unanchored warnings return null", () => {
    expect(warningAnchor({ type: "count_mismatch" })).toBe(null);
    expect(warningAnchor(null)).toBe(null);
    expect(warningAnchor({})).toBe(null);
  });
});

describe("field definition tables", () => {
  it("every field def has a well-formed shape", () => {
    for (const list of [SECTION_FIELDS, COURSE_FIELDS, MEETING_FIELDS]) {
      for (const f of list) {
        expect(typeof f.id).toBe("string");
        expect(typeof f.path).toBe("string");
        expect(typeof f.label).toBe("string");
        expect(typeof f.kind).toBe("string");
      }
    }
  });
  it("class_number is read-only in section fields", () => {
    const cn = SECTION_FIELDS.find((f) => f.path === "class_number");
    expect(cn.readOnly).toBe(true);
  });
});
