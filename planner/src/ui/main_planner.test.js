import { describe, it, expect } from "vitest";
import {
  hhmmToMinutes,
  minutesToHhmm,
  resolveStagedSections,
  meetingsConflict,
  sessionsOverlap,
  detectPlanConflicts,
  conflictsWithStaged,
  filterCoursesByQuery,
  colorForCourse,
  COURSE_PALETTE,
  buildLegendRows,
} from "./main_planner.js";

describe("hhmmToMinutes / minutesToHhmm", () => {
  it("round-trips standard times", () => {
    expect(hhmmToMinutes("00:00")).toBe(0);
    expect(hhmmToMinutes("09:55")).toBe(9 * 60 + 55);
    expect(hhmmToMinutes("23:59")).toBe(23 * 60 + 59);
    expect(minutesToHhmm(0)).toBe("00:00");
    expect(minutesToHhmm(9 * 60 + 55)).toBe("09:55");
    expect(minutesToHhmm(23 * 60 + 59)).toBe("23:59");
  });
  it("rejects malformed input", () => {
    expect(hhmmToMinutes("nope")).toBe(null);
    expect(hhmmToMinutes("25:00")).toBe(null);
    expect(hhmmToMinutes(null)).toBe(null);
    expect(minutesToHhmm(-1)).toBe(null);
    expect(minutesToHhmm("not a number")).toBe(null);
  });
});

describe("sessionsOverlap", () => {
  it("AD overlaps with everything", () => {
    expect(sessionsOverlap("AD", "A71")).toBe(true);
    expect(sessionsOverlap("AD", "A72")).toBe(true);
    expect(sessionsOverlap("A71", "AD")).toBe(true);
  });
  it("A71 and A72 never overlap", () => {
    expect(sessionsOverlap("A71", "A72")).toBe(false);
    expect(sessionsOverlap("A72", "A71")).toBe(false);
  });
  it("same code overlaps", () => {
    expect(sessionsOverlap("A71", "A71")).toBe(true);
  });
});

describe("meetingsConflict", () => {
  const m = (days, start, end) => ({ days, start_time: start, end_time: end });
  it("returns true when day + time overlap", () => {
    expect(meetingsConflict(m(["Mon"], "09:00", "10:00"), m(["Mon"], "09:30", "10:30"))).toBe(true);
  });
  it("returns false when no shared day", () => {
    expect(meetingsConflict(m(["Mon"], "09:00", "10:00"), m(["Tue"], "09:30", "10:30"))).toBe(false);
  });
  it("returns false when times are abutting (end == start)", () => {
    expect(meetingsConflict(m(["Mon"], "09:00", "10:00"), m(["Mon"], "10:00", "11:00"))).toBe(false);
  });
  it("returns false when one is a subset of the other (still conflicts in real life)", () => {
    expect(meetingsConflict(m(["Mon"], "09:00", "12:00"), m(["Mon"], "10:00", "11:00"))).toBe(true);
  });
  it("tolerates missing times (no-conflict, since we can't decide)", () => {
    expect(meetingsConflict(m(["Mon"], null, null), m(["Mon"], "09:00", "10:00"))).toBe(false);
  });
});

describe("resolveStagedSections / detectPlanConflicts", () => {
  const effective = {
    courses: [
      {
        code: "ENGR-UH 1000",
        sections: [
          {
            class_number: "20631",
            section_code: "001",
            session: { code: "A71" },
            meetings: [{ days: ["Mon", "Wed"], start_time: "09:55", end_time: "11:10" }],
          },
        ],
      },
      {
        code: "ENGR-UH 2010",
        sections: [
          {
            class_number: "20640",
            section_code: "001",
            session: { code: "A71" },
            meetings: [{ days: ["Mon"], start_time: "10:30", end_time: "11:30" }],
          },
        ],
      },
      {
        code: "ENGR-UH 3000",
        sections: [
          {
            class_number: "20650",
            section_code: "001",
            session: { code: "A72" },
            meetings: [{ days: ["Mon"], start_time: "10:00", end_time: "11:00" }],
          },
        ],
      },
    ],
  };

  it("hydrates plan refs against effective; skips missing class_numbers", () => {
    const plan = {
      sections: [
        { class_number: "20631", subject: "ENGR-UH" },
        { class_number: "99999", subject: "MISSING" },
        { class_number: "20640", subject: "ENGR-UH" },
      ],
    };
    const out = resolveStagedSections(plan, effective);
    expect(out).toHaveLength(2);
    expect(out[0].course_code).toBe("ENGR-UH 1000");
    expect(out[1].course_code).toBe("ENGR-UH 2010");
  });

  it("detects in-plan time conflicts within the same session", () => {
    const plan = {
      sections: [
        { class_number: "20631" }, // Mon 9:55-11:10 A71
        { class_number: "20640" }, // Mon 10:30-11:30 A71 — overlaps
      ],
    };
    const conflicts = detectPlanConflicts(plan, effective);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({ class_number_a: "20631", class_number_b: "20640" });
  });

  it("does NOT flag A71×A72 as a conflict", () => {
    const plan = {
      sections: [
        { class_number: "20631" }, // A71
        { class_number: "20650" }, // A72 — same day/time, but different half
      ],
    };
    expect(detectPlanConflicts(plan, effective)).toEqual([]);
  });
});

describe("conflictsWithStaged", () => {
  const existing = [
    {
      class_number: "20631",
      course_code: "ENGR-UH 1000",
      section: {
        section_code: "001",
        session: { code: "A71" },
        meetings: [{ days: ["Mon"], start_time: "09:00", end_time: "10:00" }],
      },
    },
  ];
  it("flags overlap with an existing staged section", () => {
    const candidate = {
      session: { code: "A71" },
      meetings: [{ days: ["Mon"], start_time: "09:30", end_time: "10:30" }],
    };
    const out = conflictsWithStaged(candidate, existing);
    expect(out).toHaveLength(1);
    expect(out[0].class_number).toBe("20631");
  });
  it("ignores cross-half pairings", () => {
    const candidate = {
      session: { code: "A72" },
      meetings: [{ days: ["Mon"], start_time: "09:30", end_time: "10:30" }],
    };
    expect(conflictsWithStaged(candidate, existing)).toEqual([]);
  });
});

describe("filterCoursesByQuery", () => {
  const courses = [
    { code: "ENGR-UH 2010", subject: "ENGR-UH", catalog_number: "2010", title: "Probability and Statistics" },
    { code: "ENGR-UH 3120", subject: "ENGR-UH", catalog_number: "3120", title: "Engineering Materials" },
    { code: "GERM-UA 9111", subject: "GERM-UA", catalog_number: "9111", title: "Topics in German Literature" },
    { code: "PHYED-UH 1057", subject: "PHYED-UH", catalog_number: "1057", title: "Yoga" },
  ];
  it("empty query returns all", () => {
    expect(filterCoursesByQuery(courses, "")).toHaveLength(4);
    expect(filterCoursesByQuery(courses, "  ")).toHaveLength(4);
  });
  it("matches by subject prefix", () => {
    expect(filterCoursesByQuery(courses, "engr").map((c) => c.code))
      .toEqual(["ENGR-UH 2010", "ENGR-UH 3120"]);
  });
  it("matches by catalog number", () => {
    expect(filterCoursesByQuery(courses, "2010")[0].code).toBe("ENGR-UH 2010");
  });
  it("matches by title fragment", () => {
    expect(filterCoursesByQuery(courses, "yoga")[0].code).toBe("PHYED-UH 1057");
  });
  it("AND semantics across whitespace tokens", () => {
    expect(filterCoursesByQuery(courses, "engr 3120")[0].code).toBe("ENGR-UH 3120");
    expect(filterCoursesByQuery(courses, "engr yoga")).toEqual([]);
  });
});

describe("colorForCourse", () => {
  it("returns a palette entry for any course code", () => {
    const c1 = colorForCourse("ENGR-UH 1000");
    expect(c1).toHaveProperty("bg");
    expect(c1).toHaveProperty("ink");
  });
  it("is deterministic — same code always returns same color", () => {
    expect(colorForCourse("ENGR-UH 1000")).toBe(colorForCourse("ENGR-UH 1000"));
  });
  it("falls back gracefully on null input", () => {
    expect(colorForCourse(null)).toBe(COURSE_PALETTE[0]);
  });
});

describe("buildLegendRows", () => {
  const effective = {
    courses: [
      {
        code: "ENGR-UH 1000",
        title: "Computer Programming",
        sections: [
          {
            class_number: "20631",
            section_code: "001",
            meetings: [{ days: ["Mon", "Wed"], start_time: "09:55", end_time: "11:10" }],
          },
        ],
      },
    ],
  };
  it("produces filter + section rows from a plan", () => {
    const plan = {
      sections: [{ class_number: "20631" }],
      filters: [{ id: "f1", name: "Lunch", days: ["Mon"], visible: true }],
    };
    const out = buildLegendRows(plan, effective);
    expect(out.filters).toHaveLength(1);
    expect(out.filters[0].name).toBe("Lunch");
    expect(out.sections).toHaveLength(1);
    expect(out.sections[0].course_code).toBe("ENGR-UH 1000");
    expect(out.sections[0].course_title).toBe("Computer Programming");
    expect(out.sections[0].meeting_summary).toBe("Mon,Wed 09:55–11:10");
    expect(out.sections[0].color).toHaveProperty("bg");
  });
  it("empty plan yields empty arrays", () => {
    expect(buildLegendRows({ sections: [], filters: [] }, effective))
      .toEqual({ filters: [], sections: [] });
  });
});
