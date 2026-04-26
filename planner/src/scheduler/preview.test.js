import { describe, it, expect } from "vitest";
import { buildPreviewGrid } from "./preview.js";

const sec = (cn, comp, days, start, end, code = "X-1") => ({
  class_number: cn,
  component: comp,
  meetings: [{ days, start_time: start, end_time: end }],
});

const cat = (...sections) => ({
  courses: [
    {
      code: "CSCI-UA 102",
      title: "Data Structures",
      sections: sections.filter(s => s._course === "CSCI-UA 102").map(s => s.s),
    },
    {
      code: "ENGR-UH 1000",
      title: "Programming",
      sections: sections.filter(s => s._course === "ENGR-UH 1000").map(s => s.s),
    },
  ],
});

const tagged = (course, s) => ({ _course: course, s });

describe("buildPreviewGrid", () => {
  it("empty candidate returns default range and no blocks", () => {
    const r = buildPreviewGrid({ sections: [] }, { courses: [] });
    expect(r.days).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(r.time_range.start).toBe("08:00");
    expect(r.time_range.end).toBe("20:00");
    expect(r.blocks).toEqual([]);
  });

  it("single staged class produces one block per day", () => {
    const sections = [
      tagged("CSCI-UA 102", sec("10001", "Lecture", ["Mon", "Wed"], "10:00", "11:30")),
    ];
    const r = buildPreviewGrid(
      { sections: [{ class_number: "10001" }] },
      cat(...sections),
    );
    expect(r.blocks).toHaveLength(2);
    expect(r.blocks[0].day).toBe("Mon");
    expect(r.blocks[0].course_code).toBe("CSCI-UA 102");
    expect(r.blocks[0].start_min).toBe(10 * 60);
    expect(r.blocks[0].end_min).toBe(11 * 60 + 30);
  });

  it("computes a snapped time range from the candidate's actual blocks", () => {
    const sections = [
      tagged("CSCI-UA 102", sec("10001", "Lecture", ["Mon"], "10:30", "11:30")),
    ];
    const r = buildPreviewGrid(
      { sections: [{ class_number: "10001" }] },
      cat(...sections),
    );
    // 10:30 - 30 min margin → 10:00 (snapped to half-hour)
    // 11:30 + 30 min margin → 12:00
    expect(r.time_range.start).toBe("10:00");
    expect(r.time_range.end).toBe("12:00");
  });

  it("multiple sections produce sorted (day, time) blocks", () => {
    const sections = [
      tagged("CSCI-UA 102", sec("10001", "Lecture", ["Mon", "Wed"], "13:00", "14:00")),
      tagged("ENGR-UH 1000", sec("20001", "Lecture", ["Tue", "Thu"], "10:00", "11:30")),
    ];
    const r = buildPreviewGrid(
      { sections: [{ class_number: "10001" }, { class_number: "20001" }] },
      cat(...sections),
    );
    // Sorted Mon, Tue, Wed, Thu
    expect(r.blocks.map(b => b.day)).toEqual(["Mon", "Tue", "Wed", "Thu"]);
  });

  it("ignores weekend days and unknown class numbers", () => {
    const sections = [
      tagged("CSCI-UA 102", sec("10001", "Lecture", ["Sat", "Sun"], "09:00", "10:30")),
    ];
    const r = buildPreviewGrid(
      { sections: [{ class_number: "10001" }, { class_number: "99999" }] },
      cat(...sections),
    );
    expect(r.blocks).toEqual([]);
  });

  it("uses injected colorFor when provided", () => {
    const sections = [
      tagged("CSCI-UA 102", sec("10001", "Lecture", ["Mon"], "10:00", "11:00")),
    ];
    const r = buildPreviewGrid(
      { sections: [{ class_number: "10001" }] },
      cat(...sections),
      { colorFor: () => ({ bg: "#FF0000", ink: "#000000" }) },
    );
    expect(r.blocks[0].color.bg).toBe("#FF0000");
  });
});
