import { describe, it, expect } from "vitest";
import {
  classifyWarnings,
  subjectSummary,
  humanRelativeTime,
  parseBrowseHash,
  formatBrowseHash,
  countFlaggedSectionsInCourse,
} from "./browse.js";

describe("classifyWarnings", () => {
  it("routes warnings to byClass / byCourse / global correctly", () => {
    const out = {
      warnings: [
        { type: "meeting_missing_time", class_number: "20631" },
        { type: "unknown_status", class_number: "20632", raw: "Tentative" },
        // units_mismatch has BOTH class_number and course_code → section-level
        { type: "units_mismatch", class_number: "29999", course_code: "ENGR-UH 9999" },
        { type: "missing_description", course_code: "GERM-UA 501" },
        { type: "count_mismatch", expected: 141, actual: 125 },
        { type: "term_not_found" },
      ],
    };
    const c = classifyWarnings(out);
    expect([...c.byClass.keys()].sort()).toEqual(["20631", "20632", "29999"]);
    expect([...c.byCourse.keys()]).toEqual(["GERM-UA 501"]);
    expect(c.global.map((w) => w.type).sort()).toEqual(["count_mismatch", "term_not_found"]);
  });

  it("multiple warnings on the same class_number stack in the same array", () => {
    const out = {
      warnings: [
        { type: "meeting_missing_time", class_number: "20631" },
        { type: "malformed_time", class_number: "20631" },
      ],
    };
    const c = classifyWarnings(out);
    expect(c.byClass.get("20631")).toHaveLength(2);
  });

  it("returns empty maps/arrays for empty input", () => {
    expect(classifyWarnings(null)).toEqual({
      byClass: new Map(),
      byCourse: new Map(),
      global: [],
    });
    expect(classifyWarnings({ warnings: [] }).global).toEqual([]);
  });
});

describe("subjectSummary", () => {
  it("aggregates metadata + warning classification into a display row", () => {
    const meta = {
      course_count: 56,
      section_count: 125,
      last_updated: "2026-04-24T10:00:00Z",
      total_class_count: 141,
    };
    const out = {
      warnings: [
        { type: "meeting_missing_time", class_number: "20631" },
        { type: "meeting_missing_time", class_number: "20632" },
        { type: "meeting_missing_time", class_number: "20634" },
        { type: "missing_description", course_code: "ENGR-UH 2010" },
        { type: "count_mismatch", expected: 141, actual: 125, delta: -16 },
      ],
    };
    const s = subjectSummary("ENGR-UH", meta, out);
    expect(s.code).toBe("ENGR-UH");
    expect(s.courseCount).toBe(56);
    expect(s.sectionCount).toBe(125);
    expect(s.flaggedSections).toBe(3);
    expect(s.flaggedCourses).toBe(1);
    expect(s.flaggedTotal).toBe(4);
    expect(s.globalInfo).toHaveLength(1);
    expect(s.globalInfo[0].type).toBe("count_mismatch");
    expect(s.lastUpdatedISO).toBe("2026-04-24T10:00:00Z");
  });

  it("tolerates missing metadata and missing parser output", () => {
    const s = subjectSummary("PHYED-UH", null, null);
    expect(s.courseCount).toBe(0);
    expect(s.sectionCount).toBe(0);
    expect(s.flaggedTotal).toBe(0);
  });
});

describe("humanRelativeTime", () => {
  const base = Date.parse("2026-04-24T12:00:00Z");

  it("minute-scale", () => {
    expect(humanRelativeTime("2026-04-24T11:59:30Z", base)).toBe("just now"); // 30s
    expect(humanRelativeTime("2026-04-24T11:58:00Z", base)).toBe("2m ago");
    expect(humanRelativeTime("2026-04-24T11:00:00Z", base)).toBe("1h ago");
  });
  it("hour-scale", () => {
    expect(humanRelativeTime("2026-04-24T10:00:00Z", base)).toBe("2h ago");
  });
  it("day-scale", () => {
    expect(humanRelativeTime("2026-04-23T12:00:00Z", base)).toBe("1 day ago");
    expect(humanRelativeTime("2026-04-20T12:00:00Z", base)).toBe("4 days ago");
  });
  it("week-scale", () => {
    expect(humanRelativeTime("2026-04-10T12:00:00Z", base)).toBe("2 weeks ago");
  });
  it("month-scale", () => {
    expect(humanRelativeTime("2026-01-20T12:00:00Z", base)).toBe("3 mo ago");
  });
  it("year-scale", () => {
    expect(humanRelativeTime("2024-04-24T12:00:00Z", base)).toBe("2 yrs ago");
    expect(humanRelativeTime("2025-04-24T12:00:00Z", base)).toBe("1 yr ago");
  });
  it("empty/invalid returns empty string", () => {
    expect(humanRelativeTime("", base)).toBe("");
    expect(humanRelativeTime(null, base)).toBe("");
    expect(humanRelativeTime("not a date", base)).toBe("");
  });
});

describe("parseBrowseHash / formatBrowseHash", () => {
  it("parses both subject and catnum from the full form", () => {
    expect(parseBrowseHash("#browse/ENGR-UH/2011")).toEqual({
      subject: "ENGR-UH",
      catnum: "2011",
    });
  });
  it("parses subject-only form", () => {
    expect(parseBrowseHash("#browse/PHYED-UH")).toEqual({
      subject: "PHYED-UH",
      catnum: null,
    });
  });
  it("returns empty for the bare #browse hash", () => {
    expect(parseBrowseHash("#browse")).toEqual({ subject: null, catnum: null });
  });
  it("returns empty for non-browse hashes", () => {
    expect(parseBrowseHash("#main")).toEqual({ subject: null, catnum: null });
    expect(parseBrowseHash("")).toEqual({ subject: null, catnum: null });
    expect(parseBrowseHash(null)).toEqual({ subject: null, catnum: null });
  });
  it("decodes URL-encoded segments", () => {
    expect(parseBrowseHash("#browse/ENGR-UH/2011%20Q")).toEqual({
      subject: "ENGR-UH",
      catnum: "2011 Q",
    });
  });

  it("formatBrowseHash is inverse of parse for standard inputs", () => {
    expect(formatBrowseHash({ subject: "ENGR-UH", catnum: "2011" })).toBe("#browse/ENGR-UH/2011");
    expect(formatBrowseHash({ subject: "PHYED-UH", catnum: null })).toBe("#browse/PHYED-UH");
    expect(formatBrowseHash({})).toBe("#browse");
    // URL-encoding round-trip
    const round = parseBrowseHash(formatBrowseHash({ subject: "ENGR-UH", catnum: "2011 Q" }));
    expect(round).toEqual({ subject: "ENGR-UH", catnum: "2011 Q" });
  });
});

describe("countFlaggedSectionsInCourse", () => {
  it("counts sections with at least one warning; ignores unflagged", () => {
    const course = {
      sections: [
        { class_number: "20631" },
        { class_number: "20632" },
        { class_number: "20633" },
      ],
    };
    const byClass = new Map([
      ["20631", [{ type: "meeting_missing_time" }]],
      ["20633", [{ type: "meeting_missing_time" }, { type: "malformed_time" }]],
    ]);
    expect(countFlaggedSectionsInCourse(course, byClass)).toBe(2);
  });
  it("returns 0 for empty course or empty byClass", () => {
    expect(countFlaggedSectionsInCourse({ sections: [] }, new Map())).toBe(0);
    expect(countFlaggedSectionsInCourse(null, new Map())).toBe(0);
  });
});
