import { describe, it, expect } from "vitest";
import {
  fuzzyMatch,
  scoreCourseMatch,
  parseStructuredQuery,
  buildInstructorIndex,
  bucketByLevel,
  sectionPassesFilters,
  isFilterActive,
  DEFAULT_FILTERS,
  distinctComponents,
  statusDot,
  stageActionLabel,
  colorForCourse,
  COURSE_PALETTE,
} from "./picker.js";

describe("fuzzyMatch", () => {
  it("matches exact substrings (highest tier)", () => {
    expect(fuzzyMatch("eng", "Engineering Materials")).toBeGreaterThan(900);
    expect(fuzzyMatch("3120", "ENGR-UH 3120")).toBeGreaterThan(900);
    expect(fuzzyMatch("hashaikeh", "Hashaikeh, Rashid")).toBeGreaterThan(900);
  });
  it("returns 0 when no relationship", () => {
    expect(fuzzyMatch("zzzzzz", "Engineering Materials")).toBe(0);
    expect(fuzzyMatch("bonjour", "ENGR-UH 3120")).toBe(0);
  });
  it("returns 0 for empty inputs", () => {
    expect(fuzzyMatch("", "anything")).toBe(0);
    expect(fuzzyMatch("anything", "")).toBe(0);
  });
  it("matches word-prefix when no substring (mid tier)", () => {
    // "eng mat" — both words are prefixes of haystack words.
    const score = fuzzyMatch("eng mat", "Engineering Materials");
    expect(score).toBeGreaterThanOrEqual(700);
    expect(score).toBeLessThan(1000);
  });
  it("tolerates 1-2 character typos (lowest tier)", () => {
    const score = fuzzyMatch("hashikeh", "hashaikeh");  // 1 deletion
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(700);
  });
  it("is case- and punctuation-insensitive", () => {
    expect(fuzzyMatch("ENGR-UH", "engr-uh 3120")).toBeGreaterThan(900);
    expect(fuzzyMatch("engruh", "ENGR-UH")).toBeGreaterThan(0);
  });
  it("scores earlier matches higher than later matches", () => {
    // "math" appears at index 0 in "Mathematics" but at index 21 in "Engineering Mathematics".
    expect(fuzzyMatch("math", "Mathematics")).toBeGreaterThan(fuzzyMatch("math", "Engineering Mathematics"));
  });
});

describe("parseStructuredQuery", () => {
  it("detects subject + catnum patterns", () => {
    expect(parseStructuredQuery("PHYED-UH 1001")).toEqual({ subject: "PHYED-UH", catnum: "1001" });
    expect(parseStructuredQuery("engr-uh 3120")).toEqual({ subject: "ENGR-UH", catnum: "3120" });
    expect(parseStructuredQuery("ENGR3120")).toEqual({ subject: "ENGR", catnum: "3120" });
    expect(parseStructuredQuery("germ-ua 9111")).toEqual({ subject: "GERM-UA", catnum: "9111" });
  });
  it("rejects non-structured queries", () => {
    expect(parseStructuredQuery("hashaikeh")).toBe(null);
    expect(parseStructuredQuery("3120")).toBe(null); // number alone — unstructured
    expect(parseStructuredQuery("engineering")).toBe(null);
    expect(parseStructuredQuery("")).toBe(null);
    expect(parseStructuredQuery(null)).toBe(null);
  });
});

describe("scoreCourseMatch — structured queries (Bug 1 fix)", () => {
  const courses = [
    { subject: "PHYED-UH", catalog_number: "1001", code: "PHYED-UH 1001", title: "Yoga" },
    { subject: "PHYED-UH", catalog_number: "1057", code: "PHYED-UH 1057", title: "Volleyball" },
    { subject: "PSYCH-UA", catalog_number: "1011", code: "PSYCH-UA 1011", title: "Cognitive Neuroscience" },
    { subject: "ENGR-UH",  catalog_number: "1001", code: "ENGR-UH 1001", title: "Programming" },
    { subject: "ENGR-UH",  catalog_number: "3120", code: "ENGR-UH 3120", title: "Engineering Materials" },
    { subject: "GERM-UA",  catalog_number: "1001", code: "GERM-UA 1001", title: "Beginning German I" },
  ];

  function rankedFor(query) {
    return courses
      .map((c) => ({ c, s: scoreCourseMatch(c, query) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.c.code);
  }

  it("'PHYED-UH 1001' bullseye ranks first; sibling subjects rank below", () => {
    const ranked = rankedFor("PHYED-UH 1001");
    expect(ranked[0]).toBe("PHYED-UH 1001");
    // Other matches should be siblings (same subject OR same catnum).
    expect(ranked).toContain("PHYED-UH 1057"); // same subject
    expect(ranked).toContain("ENGR-UH 1001");  // same catnum
    expect(ranked).toContain("GERM-UA 1001");  // same catnum
    // PSYCH-UA 1011 (Lev=1 against 1001 in old fuzzy) MUST NOT appear.
    expect(ranked).not.toContain("PSYCH-UA 1011");
  });

  it("'PHYED-UH 1001' caps at 5-ish results — only structured tiers contribute", () => {
    const ranked = rankedFor("PHYED-UH 1001");
    expect(ranked.length).toBeLessThanOrEqual(5);
  });

  it("'engruh 3120' (no dash, no space) still hits ENGR-UH 3120 as bullseye", () => {
    const ranked = rankedFor("engruh 3120");
    expect(ranked[0]).toBe("ENGR-UH 3120");
  });

  it("unstructured number-only query '1001' falls through to fuzzy and matches everything with 1001 in code/catnum", () => {
    // Single number without subject prefix is NOT structured — uses
    // the fuzzy path. Expect at least the 1001 courses to surface.
    const ranked = rankedFor("1001");
    expect(ranked).toContain("PHYED-UH 1001");
    expect(ranked).toContain("ENGR-UH 1001");
    expect(ranked).toContain("GERM-UA 1001");
  });

  it("title / instructor fuzzy still works for unstructured queries", () => {
    expect(scoreCourseMatch(courses[4], "engineering materials")).toBeGreaterThan(0);
    expect(scoreCourseMatch(courses[3], "")).toBe(1); // empty-query sentinel
  });
});

describe("scoreCourseMatch", () => {
  const c = {
    subject: "ENGR-UH",
    catalog_number: "3120",
    code: "ENGR-UH 3120",
    title: "Engineering Materials",
  };
  it("matches subject prefix", () => {
    expect(scoreCourseMatch(c, "engr")).toBeGreaterThan(0);
  });
  it("matches catalog number alone", () => {
    expect(scoreCourseMatch(c, "3120")).toBeGreaterThan(0);
  });
  it("matches title fragment", () => {
    expect(scoreCourseMatch(c, "engineering mat")).toBeGreaterThan(0);
  });
  it("matches instructor name when passed", () => {
    expect(scoreCourseMatch(c, "hashaikeh", ["Hashaikeh, Rashid"])).toBeGreaterThan(0);
  });
  it("returns include-all sentinel when query is empty", () => {
    expect(scoreCourseMatch(c, "")).toBe(1);
    expect(scoreCourseMatch(c, "  ")).toBe(1);
  });
  it("returns 0 when no field matches", () => {
    expect(scoreCourseMatch(c, "philosophy")).toBe(0);
  });
});

describe("buildInstructorIndex", () => {
  const effective = {
    courses: [
      {
        code: "ENGR-UH 3120",
        sections: [
          {
            class_number: "20631",
            meetings: [
              { instructors: ["Hashaikeh, Rashid"] },
              { instructors: ["Hashaikeh, Rashid"] }, // dup
            ],
          },
          {
            class_number: "20632",
            meetings: [{ instructors: ["Jabari, Hamouda"] }],
          },
        ],
      },
      {
        code: "PHYS-UH 1000",
        sections: [
          {
            class_number: "30001",
            meetings: [{ instructors: ["Hashaikeh, Rashid"] }],
          },
        ],
      },
      {
        code: "_USER_CREATED",
        _user_created: true,
        sections: [{ class_number: "9999", meetings: [{ instructors: ["Should Skip"] }] }],
      },
    ],
  };
  it("builds the byInstructor map across all sections, skipping user-created", () => {
    const { byInstructor } = buildInstructorIndex(effective);
    expect(byInstructor.has("hashaikeh, rashid")).toBe(true);
    expect(byInstructor.get("hashaikeh, rashid")).toHaveLength(3);
    expect(byInstructor.has("should skip")).toBe(false);
  });
  it("dedupes instructor list per course", () => {
    const { byCourseCode } = buildInstructorIndex(effective);
    expect(byCourseCode.get("ENGR-UH 3120")).toEqual(["Hashaikeh, Rashid", "Jabari, Hamouda"]);
  });
  it("tolerates empty / malformed input", () => {
    expect(buildInstructorIndex(null).byInstructor.size).toBe(0);
    expect(buildInstructorIndex({}).byInstructor.size).toBe(0);
  });
});

describe("bucketByLevel", () => {
  it("groups courses by leading digit; orders levels numerically", () => {
    const courses = [
      { catalog_number: "3120", code: "X 3120" },
      { catalog_number: "1000", code: "X 1000" },
      { catalog_number: "2010", code: "X 2010" },
      { catalog_number: "9111", code: "X 9111" },
      { catalog_number: "1001", code: "X 1001" },
    ];
    const out = bucketByLevel(courses);
    expect(out.map((b) => b.level)).toEqual(["1", "2", "3", "9"]);
    expect(out[0].courses.map((c) => c.catalog_number)).toEqual(["1000", "1001"]);
    expect(out[3].label).toMatch(/Topics/);
  });
  it("places non-numeric catalog_numbers into 'other' last", () => {
    const out = bucketByLevel([
      { catalog_number: "1000" },
      { catalog_number: "GR" },
    ]);
    expect(out[0].level).toBe("1");
    expect(out[1].level).toBe("other");
  });
});

describe("sectionPassesFilters / isFilterActive", () => {
  const sec = (overrides = {}) => Object.assign({
    status: { type: "open" },
    component: "Lecture",
    meetings: [{ days: ["Mon", "Wed"], start_time: "14:00", end_time: "15:30" }],
  }, overrides);

  it("returns true for default filters", () => {
    expect(isFilterActive(DEFAULT_FILTERS)).toBe(false);
    expect(sectionPassesFilters(sec(), DEFAULT_FILTERS)).toBe(true);
  });
  it("filters by status", () => {
    const f = { ...DEFAULT_FILTERS, status: "open" };
    expect(sectionPassesFilters(sec(), f)).toBe(true);
    expect(sectionPassesFilters(sec({ status: { type: "closed" } }), f)).toBe(false);
    const f2 = { ...DEFAULT_FILTERS, status: "open_or_waitlist" };
    expect(sectionPassesFilters(sec({ status: { type: "waitlist" } }), f2)).toBe(true);
    expect(sectionPassesFilters(sec({ status: { type: "closed" } }), f2)).toBe(false);
  });
  it("filters by component (set membership)", () => {
    const f = { ...DEFAULT_FILTERS, components: new Set(["Laboratory"]) };
    expect(sectionPassesFilters(sec(), f)).toBe(false);
    expect(sectionPassesFilters(sec({ component: "Laboratory" }), f)).toBe(true);
  });
  it("filters by days (intersection)", () => {
    const f = { ...DEFAULT_FILTERS, days: new Set(["Fri"]) };
    expect(sectionPassesFilters(sec(), f)).toBe(false);
    expect(sectionPassesFilters(sec({ meetings: [{ days: ["Fri"], start_time: "09:00", end_time: "10:00" }] }), f)).toBe(true);
  });
  it("filters by start_after_min — excludes sections starting earlier", () => {
    const cutoff = 9 * 60; // 09:00
    const early = sec({ meetings: [{ days: ["Mon"], start_time: "08:00", end_time: "09:00" }] });
    const later = sec({ meetings: [{ days: ["Mon"], start_time: "09:30", end_time: "10:30" }] });
    const exact = sec({ meetings: [{ days: ["Mon"], start_time: "09:00", end_time: "10:00" }] });
    const f = { ...DEFAULT_FILTERS, start_after_min: cutoff };
    expect(sectionPassesFilters(early, f)).toBe(false);
    expect(sectionPassesFilters(later, f)).toBe(true);
    // Boundary: starting AT exactly the cutoff passes (>= cutoff).
    expect(sectionPassesFilters(exact, f)).toBe(true);
  });
  it("filters by end_before_min — excludes sections ending later", () => {
    const cutoff = 18 * 60; // 18:00
    const late = sec({ meetings: [{ days: ["Mon"], start_time: "17:00", end_time: "19:00" }] });
    const ok = sec({ meetings: [{ days: ["Mon"], start_time: "16:00", end_time: "17:30" }] });
    const exact = sec({ meetings: [{ days: ["Mon"], start_time: "16:30", end_time: "18:00" }] });
    const f = { ...DEFAULT_FILTERS, end_before_min: cutoff };
    expect(sectionPassesFilters(late, f)).toBe(false);
    expect(sectionPassesFilters(ok, f)).toBe(true);
    expect(sectionPassesFilters(exact, f)).toBe(true);
  });
  it("any single meeting outside the bound disqualifies the whole section", () => {
    const mixed = sec({ meetings: [
      { days: ["Mon"], start_time: "10:00", end_time: "11:00" },
      { days: ["Wed"], start_time: "08:00", end_time: "09:00" }, // < 09:00
    ]});
    const f = { ...DEFAULT_FILTERS, start_after_min: 9 * 60 };
    expect(sectionPassesFilters(mixed, f)).toBe(false);
  });
  it("composes status + component + days + start/end bounds (AND)", () => {
    const f = {
      status: "open",
      components: new Set(["Lecture"]),
      days: new Set(["Mon"]),
      start_after_min: 12 * 60,
      end_before_min: 18 * 60,
    };
    expect(sectionPassesFilters(sec(), f)).toBe(true); // 14:00–15:30 fits
    expect(sectionPassesFilters(sec({ status: { type: "closed" } }), f)).toBe(false);
    expect(sectionPassesFilters(sec({ component: "Laboratory" }), f)).toBe(false);
    expect(sectionPassesFilters(
      sec({ meetings: [{ days: ["Mon"], start_time: "10:00", end_time: "11:00" }] }), f
    )).toBe(false); // before 12:00 cutoff
  });
});

describe("distinctComponents", () => {
  it("collects + counts distinct components from the effective catalog", () => {
    const eff = {
      courses: [
        {
          sections: [
            { component: "Lecture" },
            { component: "Lecture" },
            { component: "Laboratory" },
          ],
        },
        {
          sections: [
            { component: "Lecture" },
            { component: "Studio" },
            { component: "" }, // empty skipped
            { component: undefined }, // missing skipped
          ],
        },
      ],
    };
    const out = distinctComponents(eff);
    expect(out).toEqual([
      { value: "Lecture", count: 3 },
      { value: "Laboratory", count: 1 },
      { value: "Studio", count: 1 },
    ]);
  });
  it("skips _user_created courses and tolerates empty input", () => {
    expect(distinctComponents({ courses: [{ _user_created: true, sections: [{ component: "Lecture" }] }] }))
      .toEqual([]);
    expect(distinctComponents(null)).toEqual([]);
    expect(distinctComponents({})).toEqual([]);
  });
});

describe("statusDot / stageActionLabel", () => {
  it("statusDot returns a color + label per status type", () => {
    expect(statusDot({ status: { type: "open" } }).label).toBe("Open");
    expect(statusDot({ status: { type: "waitlist" } }).label).toBe("Waitlist");
    expect(statusDot({ status: { type: "closed" } }).label).toBe("Closed");
    expect(statusDot({ status: { type: "cancelled" } }).label).toBe("Cancelled");
    expect(statusDot({}).label).toBe("Unknown");
  });
  it("stageActionLabel needs no confirmation when open", () => {
    expect(stageActionLabel({ status: { type: "open" } }).needsConfirm).toBe(false);
  });
  it("stageActionLabel surfaces waitlist count + needs confirm", () => {
    const a = stageActionLabel({ status: { type: "waitlist", count: 5 } });
    expect(a.needsConfirm).toBe(true);
    expect(a.label).toMatch(/5 waitlisted/);
    expect(a.confirmReason).toBe("waitlist");
  });
  it("closed and cancelled both need confirm", () => {
    expect(stageActionLabel({ status: { type: "closed" } }).needsConfirm).toBe(true);
    expect(stageActionLabel({ status: { type: "cancelled" } }).needsConfirm).toBe(true);
  });
});

describe("colorForCourse re-export", () => {
  it("returns one of the palette entries deterministically", () => {
    const c = colorForCourse("ENGR-UH 3120");
    expect(COURSE_PALETTE).toContainEqual(c);
    expect(colorForCourse("ENGR-UH 3120")).toBe(c);
  });
});
