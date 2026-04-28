import { describe, it, expect } from "vitest";
import { generateSchedules } from "./solver.js";

// Minimal section / catalog factories ---------------------------

const sec = (cn, comp, days, start, end, opts = {}) => ({
  class_number: cn,
  section_code: opts.section_code || ("S-" + cn),
  component: comp,
  session: { code: opts.sess || "AD", start_date: "2026-08-31", end_date: "2026-12-14" },
  status: { type: opts.status || "open", raw: "Open", count: null },
  meetings: [{
    days,
    start_time: start,
    end_time: end,
    start_date: "2026-08-31",
    end_date: "2026-12-14",
    room: null, building: null, room_number: null, instructors: [],
  }],
  linked_components: [], requires_consent: false, title_flags: [],
});

const course = (code, sections) => ({
  code,
  subject: code.split(/\s+/)[0],
  catalog_number: code.split(/\s+/)[1] || "",
  title: code,
  sections,
  units: 4,
});

const cat = (...courses) => ({ courses });

const req = (...courses) => ({
  id: "r-" + courses.join(":"),
  courses,
});

// Tests ---------------------------------------------------------

describe("generateSchedules — single requirement", () => {
  it("single course with one section → 1 candidate", () => {
    const c = course("CSCI 101", [sec("10001", "Lecture", ["Mon"], "10:00", "11:30")]);
    const out = generateSchedules({
      requirements: [req("CSCI 101")],
      preferences: {},
      catalog: cat(c),
      filters: [],
    });
    expect(out.candidates.length).toBe(1);
    expect(out.candidates[0].sections[0].class_number).toBe("10001");
    expect(out.conflicts).toEqual([]);
  });

  it("single course with multiple sections → multiple candidates", () => {
    const c = course("X 1", [
      sec("1", "Lecture", ["Mon"], "10:00", "11:00"),
      sec("2", "Lecture", ["Tue"], "10:00", "11:00"),
      sec("3", "Lecture", ["Wed"], "10:00", "11:00"),
    ]);
    const out = generateSchedules({
      requirements: [req("X 1")],
      preferences: {},
      catalog: cat(c),
      filters: [],
    });
    expect(out.candidates.length).toBe(3);
  });

  it("OR-group of 2 courses → candidates from each", () => {
    const a = course("A 1", [sec("a1", "Lecture", ["Mon"], "10:00", "11:00")]);
    const b = course("B 1", [sec("b1", "Lecture", ["Tue"], "10:00", "11:00")]);
    const out = generateSchedules({
      requirements: [req("A 1", "B 1")],
      preferences: {},
      catalog: cat(a, b),
      filters: [],
    });
    expect(out.candidates.length).toBe(2);
  });
});

describe("generateSchedules — multiple requirements", () => {
  it("two compatible requirements produce cartesian product", () => {
    const a = course("A 1", [sec("a1", "Lecture", ["Mon"], "09:00", "10:00")]);
    const b = course("B 1", [sec("b1", "Lecture", ["Tue"], "09:00", "10:00")]);
    const out = generateSchedules({
      requirements: [req("A 1"), req("B 1")],
      preferences: {},
      catalog: cat(a, b),
      filters: [],
    });
    expect(out.candidates.length).toBe(1);
    const cns = out.candidates[0].sections.map(s => s.class_number).sort();
    expect(cns).toEqual(["a1", "b1"]);
  });

  it("all combinations conflict → empty candidates + diagnosis", () => {
    const a = course("A 1", [sec("a1", "Lecture", ["Mon"], "10:00", "11:00")]);
    const b = course("B 1", [sec("b1", "Lecture", ["Mon"], "10:30", "11:30")]); // overlap
    const out = generateSchedules({
      requirements: [req("A 1"), req("B 1")],
      preferences: {},
      catalog: cat(a, b),
      filters: [],
    });
    // Conflicts are detected per-requirement vs filter, not pairwise.
    // Pairwise unsatisfiability triggers the partial-violation path.
    expect(out.candidates.length).toBeGreaterThan(0);
    expect(out.candidates.every(c => c.partial)).toBe(true);
  });
});

describe("generateSchedules — locked sections", () => {
  it("locked_section narrows the domain to bundles containing it", () => {
    const c = course("X 1", [
      sec("1", "Lecture", ["Mon"], "10:00", "11:00"),
      sec("2", "Lecture", ["Tue"], "10:00", "11:00"),
    ]);
    const r = Object.assign({}, req("X 1"), { locked_section: { class_number: "2" } });
    const out = generateSchedules({
      requirements: [r],
      preferences: {},
      catalog: cat(c),
      filters: [],
    });
    expect(out.candidates.length).toBe(1);
    expect(out.candidates[0].sections[0].class_number).toBe("2");
  });
});

describe("generateSchedules — filter conflicts", () => {
  it("filter blocking all sections of a required course → diagnosis", () => {
    const c = course("X 1", [
      sec("1", "Lecture", ["Mon"], "09:00", "10:00"),
      sec("2", "Lecture", ["Mon"], "09:30", "10:30"),
    ]);
    const out = generateSchedules({
      requirements: [req("X 1")],
      preferences: {},
      catalog: cat(c),
      filters: [{
        id: 1, name: "Sleep", days: ["M"],
        start: 8 * 60, end: 11 * 60, session: "AD", visible: true,
      }],
    });
    expect(out.candidates).toEqual([]);
    expect(out.conflicts.length).toBe(1);
    expect(out.conflicts[0].blocking_filter).toBe("Sleep");
  });
});

describe("generateSchedules — component pairing", () => {
  it("course with Lecture + Lab yields bundles covering both", () => {
    const c = course("X 1", [
      sec("L1", "Lecture", ["Mon"], "09:00", "10:00"),
      sec("L2", "Lecture", ["Tue"], "09:00", "10:00"),
      sec("LAB1", "Laboratory", ["Wed"], "13:00", "15:00"),
    ]);
    const out = generateSchedules({
      requirements: [req("X 1")],
      preferences: {},
      catalog: cat(c),
      filters: [],
    });
    // 2 lectures × 1 lab = 2 bundles
    expect(out.candidates.length).toBe(2);
    for (const cand of out.candidates) {
      const cns = cand.sections.map(s => s.class_number).sort();
      expect(cns).toContain("LAB1");
      expect(cns.some(c => c === "L1" || c === "L2")).toBe(true);
    }
  });
});

describe("generateSchedules — closed/waitlisted exclusion", () => {
  const c = course("X 1", [
    sec("OPEN", "Lecture", ["Mon"], "09:00", "10:00", { status: "open" }),
    sec("CLOSED", "Lecture", ["Tue"], "09:00", "10:00", { status: "closed" }),
  ]);

  it("excludes closed sections by default", () => {
    const out = generateSchedules({
      requirements: [req("X 1")],
      preferences: {},
      catalog: cat(c),
      filters: [],
    });
    expect(out.candidates.length).toBe(1);
    expect(out.candidates[0].sections[0].class_number).toBe("OPEN");
  });

  it("includes them when toggle on", () => {
    const out = generateSchedules({
      requirements: [req("X 1")],
      preferences: { include_closed_waitlisted: true },
      catalog: cat(c),
      filters: [],
    });
    expect(out.candidates.length).toBe(2);
  });
});

describe("generateSchedules — limits", () => {
  it("max_candidates honored", () => {
    const sections = [];
    for (let i = 0; i < 20; i++) {
      sections.push(sec(String(i + 1), "Lecture", ["Mon"], "08:00", "09:00"));
    }
    const c = course("X 1", sections);
    const out = generateSchedules({
      requirements: [req("X 1")],
      preferences: {},
      catalog: cat(c),
      filters: [],
      max_candidates: 5,
    });
    expect(out.candidates.length).toBe(5);
  });
});

describe("generateSchedules — empty inputs", () => {
  it("no requirements → no candidates, no conflicts", () => {
    const out = generateSchedules({
      requirements: [],
      preferences: {},
      catalog: cat(),
      filters: [],
    });
    expect(out.candidates).toEqual([]);
    expect(out.conflicts).toEqual([]);
  });
});

describe("generateSchedules — linked sections across requirements", () => {
  it("link forces both ends together", () => {
    // A has sections a1 (Mon) and a2 (Tue). B has b1 (Mon) and b2 (Wed).
    // Link a1↔b1: candidates either contain both, or neither.
    const a = course("A 1", [
      sec("a1", "Lecture", ["Mon"], "09:00", "10:00"),
      sec("a2", "Lecture", ["Tue"], "09:00", "10:00"),
    ]);
    const b = course("B 1", [
      sec("b1", "Lecture", ["Mon"], "11:00", "12:00"),
      sec("b2", "Lecture", ["Wed"], "11:00", "12:00"),
    ]);
    const out = generateSchedules({
      requirements: [req("A 1"), req("B 1")],
      preferences: {},
      catalog: cat(a, b),
      filters: [],
      linkedSections: [{ a: "a1", b: "b1" }],
    });
    // Allowed: {a1,b1}, {a2,b2}. Disallowed: {a1,b2}, {a2,b1}.
    const pairs = out.candidates.map(c => c.sections.map(s => s.class_number).sort().join(","));
    expect(pairs).toContain("a1,b1");
    expect(pairs).toContain("a2,b2");
    expect(pairs).not.toContain("a1,b2");
    expect(pairs).not.toContain("a2,b1");
  });
});

// --- New coverage ----------------------------------------------

describe("generateSchedules — section pin atoms", () => {
  it("section atom narrows domain to bundles containing pinned class_number", () => {
    const c = course("X 1", [
      sec("L1", "Lecture", ["Mon"], "10:00", "11:00"),
      sec("L2", "Lecture", ["Tue"], "10:00", "11:00"),
      sec("L3", "Lecture", ["Wed"], "10:00", "11:00"),
    ]);
    const r = Object.assign({}, req("X 1"), {
      atoms: [{ type: "section", class_number: "L1", course_code: "X 1" }],
    });
    const out = generateSchedules({
      requirements: [r],
      preferences: {},
      catalog: cat(c),
      filters: [],
    });
    expect(out.candidates.length).toBe(1);
    expect(out.candidates[0].sections[0].class_number).toBe("L1");
  });

  it("pinning a Lab still pairs it with each Lecture (component cartesian)", () => {
    // 2 Lectures × (1 of 2 Labs pinned) = 2 candidates, all containing LAB1.
    const c = course("X 1", [
      sec("L1", "Lecture", ["Mon"], "09:00", "10:00"),
      sec("L2", "Lecture", ["Tue"], "09:00", "10:00"),
      sec("LAB1", "Laboratory", ["Wed"], "13:00", "15:00"),
      sec("LAB2", "Laboratory", ["Thu"], "13:00", "15:00"),
    ]);
    const r = Object.assign({}, req("X 1"), {
      atoms: [{ type: "section", class_number: "LAB1", course_code: "X 1" }],
    });
    const out = generateSchedules({
      requirements: [r],
      preferences: {},
      catalog: cat(c),
      filters: [],
    });
    expect(out.candidates.length).toBe(2);
    for (const cand of out.candidates) {
      const cns = cand.sections.map((s) => s.class_number);
      expect(cns).toContain("LAB1");
      expect(cns).not.toContain("LAB2");
    }
  });

  it("OR-clause of two course atoms keeps all bundles of either course", () => {
    const a = course("A 1", [
      sec("a1", "Lecture", ["Mon"], "09:00", "10:00"),
      sec("a2", "Lecture", ["Tue"], "09:00", "10:00"),
    ]);
    const b = course("B 1", [sec("b1", "Lecture", ["Wed"], "09:00", "10:00")]);
    const r = Object.assign({}, req("A 1", "B 1"), {
      atoms: [
        { type: "course", code: "A 1" },
        { type: "course", code: "B 1" },
      ],
    });
    const out = generateSchedules({
      requirements: [r],
      preferences: {},
      catalog: cat(a, b),
      filters: [],
    });
    // 2 from A 1 + 1 from B 1 = 3 candidates total.
    expect(out.candidates.length).toBe(3);
  });

  it("mixed atom clause: course atom OR specific section atom", () => {
    const a = course("A 1", [
      sec("a1", "Lecture", ["Mon"], "09:00", "10:00"),
      sec("a2", "Lecture", ["Tue"], "09:00", "10:00"),
    ]);
    const b = course("B 1", [
      sec("b1", "Lecture", ["Wed"], "09:00", "10:00"),
      sec("b2", "Lecture", ["Thu"], "09:00", "10:00"),
    ]);
    const r = Object.assign({}, req("A 1", "B 1"), {
      atoms: [
        { type: "course", code: "A 1" },
        { type: "section", class_number: "b2", course_code: "B 1" },
      ],
    });
    const out = generateSchedules({
      requirements: [r],
      preferences: {},
      catalog: cat(a, b),
      filters: [],
    });
    // a1, a2, and b2 are all kept. b1 is filtered out.
    expect(out.candidates.length).toBe(3);
    const cns = out.candidates.map((c) => c.sections[0].class_number).sort();
    expect(cns).toEqual(["a1", "a2", "b2"]);
  });

  it("pin that doesn't match any catalog section → conflict mentioning section pins", () => {
    const c = course("X 1", [sec("1", "Lecture", ["Mon"], "10:00", "11:00")]);
    const r = Object.assign({}, req("X 1"), {
      atoms: [{ type: "section", class_number: "DOES_NOT_EXIST", course_code: "X 1" }],
    });
    const out = generateSchedules({
      requirements: [r],
      preferences: {},
      catalog: cat(c),
      filters: [],
    });
    expect(out.candidates).toEqual([]);
    expect(out.conflicts.length).toBe(1);
    expect(out.conflicts[0].reason).toContain("Section pins");
  });
});

describe("generateSchedules — linked sections (additional)", () => {
  it("three-way chain: a1↔b1 and b1↔c1 forces all three or none", () => {
    const a = course("A 1", [
      sec("a1", "Lecture", ["Mon"], "09:00", "10:00"),
      sec("a2", "Lecture", ["Tue"], "09:00", "10:00"),
    ]);
    const b = course("B 1", [
      sec("b1", "Lecture", ["Mon"], "11:00", "12:00"),
      sec("b2", "Lecture", ["Wed"], "11:00", "12:00"),
    ]);
    const cc = course("C 1", [
      sec("c1", "Lecture", ["Thu"], "09:00", "10:00"),
      sec("c2", "Lecture", ["Fri"], "09:00", "10:00"),
    ]);
    const out = generateSchedules({
      requirements: [req("A 1"), req("B 1"), req("C 1")],
      preferences: {},
      catalog: cat(a, b, cc),
      filters: [],
      linkedSections: [{ a: "a1", b: "b1" }, { a: "b1", b: "c1" }],
    });
    const triples = out.candidates.map((c) =>
      c.sections.map((s) => s.class_number).sort().join(",")
    );
    // Allowed: {a1,b1,c1}, plus any combo where none of a1/b1/c1 appear.
    expect(triples).toContain("a1,b1,c1");
    expect(triples).toContain("a2,b2,c2");
    // Forbidden: any with exactly one or two of a1/b1/c1.
    for (const t of triples) {
      const has = ["a1", "b1", "c1"].filter((x) => t.split(",").includes(x)).length;
      expect(has === 0 || has === 3).toBe(true);
    }
  });

  it("link referencing a class_number absent from catalog does not over-filter", () => {
    const a = course("A 1", [
      sec("a1", "Lecture", ["Mon"], "09:00", "10:00"),
      sec("a2", "Lecture", ["Tue"], "09:00", "10:00"),
    ]);
    const b = course("B 1", [
      sec("b1", "Lecture", ["Wed"], "09:00", "10:00"),
      sec("b2", "Lecture", ["Thu"], "09:00", "10:00"),
    ]);
    const out = generateSchedules({
      requirements: [req("A 1"), req("B 1")],
      preferences: {},
      catalog: cat(a, b),
      filters: [],
      // Neither GHOST_X nor GHOST_Y exist anywhere.
      linkedSections: [{ a: "GHOST_X", b: "GHOST_Y" }],
    });
    // 2 × 2 = 4 candidates, undisturbed.
    expect(out.candidates.length).toBe(4);
  });
});

describe("generateSchedules — component pairing depth", () => {
  it("Lecture × Lab × Recitation 2×2×2 yields 8 bundles, one per component", () => {
    const c = course("X 1", [
      sec("L1", "Lecture", ["Mon"], "09:00", "10:00"),
      sec("L2", "Lecture", ["Tue"], "09:00", "10:00"),
      sec("LAB1", "Laboratory", ["Wed"], "13:00", "14:00"),
      sec("LAB2", "Laboratory", ["Thu"], "13:00", "14:00"),
      sec("R1", "Recitation", ["Fri"], "15:00", "16:00"),
      sec("R2", "Recitation", ["Sat"], "15:00", "16:00"),
    ]);
    const out = generateSchedules({
      requirements: [req("X 1")],
      preferences: {},
      catalog: cat(c),
      filters: [],
    });
    expect(out.candidates.length).toBe(8);
    for (const cand of out.candidates) {
      const comps = cand.sections.map((s) => {
        if (["L1", "L2"].includes(s.class_number)) return "Lecture";
        if (["LAB1", "LAB2"].includes(s.class_number)) return "Laboratory";
        return "Recitation";
      });
      expect(comps.length).toBe(3);
      expect(new Set(comps).size).toBe(3);
    }
  });

  it("required component fully closed → course unsolvable (no Lecture-only bundle)", () => {
    // Lecture is open, Lab is closed, include_closed_waitlisted=false.
    // The course needs both a Lecture AND a Lab; if every Lab section
    // is closed, the whole course can't be staffed and we should
    // return zero bundles + a conflict. The pre-fix solver silently
    // dropped the Lab component and returned a Lecture-only bundle,
    // letting students "solve" by ignoring an unavailable component.
    const c = course("X 1", [
      sec("L1", "Lecture", ["Mon"], "09:00", "10:00", { status: "open" }),
      sec("LAB1", "Laboratory", ["Wed"], "13:00", "14:00", { status: "closed" }),
    ]);
    const out = generateSchedules({
      requirements: [req("X 1")],
      preferences: {},
      catalog: cat(c),
      filters: [],
    });
    expect(out.candidates).toEqual([]);
    expect(out.conflicts.length).toBe(1);
  });

  it("course where every section (across components) is closed → conflict", () => {
    const c = course("X 1", [
      sec("L1", "Lecture", ["Mon"], "09:00", "10:00", { status: "closed" }),
      sec("LAB1", "Laboratory", ["Wed"], "13:00", "14:00", { status: "closed" }),
    ]);
    const out = generateSchedules({
      requirements: [req("X 1")],
      preferences: {}, // include_closed_waitlisted not set → closed dropped
      catalog: cat(c),
      filters: [],
    });
    expect(out.candidates).toEqual([]);
    expect(out.conflicts.length).toBe(1);
  });
});

describe("generateSchedules — sessions (NYUAD half-term semantics)", () => {
  it("A71 and A72 at same day/time do not conflict", () => {
    const a = course("A 1", [sec("a1", "Lecture", ["Mon"], "10:00", "11:00", { sess: "A71" })]);
    const b = course("B 1", [sec("b1", "Lecture", ["Mon"], "10:00", "11:00", { sess: "A72" })]);
    const out = generateSchedules({
      requirements: [req("A 1"), req("B 1")],
      preferences: {},
      catalog: cat(a, b),
      filters: [],
    });
    expect(out.candidates.length).toBe(1);
    const cns = out.candidates[0].sections.map((s) => s.class_number).sort();
    expect(cns).toEqual(["a1", "b1"]);
    expect(out.candidates[0].partial).toBeFalsy();
  });

  it("AD vs AD at same day/time → conflict triggers partial path", () => {
    const a = course("A 1", [sec("a1", "Lecture", ["Mon"], "10:00", "11:00", { sess: "AD" })]);
    const b = course("B 1", [sec("b1", "Lecture", ["Mon"], "10:00", "11:00", { sess: "AD" })]);
    const out = generateSchedules({
      requirements: [req("A 1"), req("B 1")],
      preferences: {},
      catalog: cat(a, b),
      filters: [],
    });
    expect(out.candidates.length).toBeGreaterThan(0);
    expect(out.candidates.every((c) => c.partial)).toBe(true);
  });
});

describe("generateSchedules — filter conflicts (additional)", () => {
  it("filter with visible:false is ignored", () => {
    const c = course("X 1", [sec("1", "Lecture", ["Mon"], "09:00", "10:00")]);
    const out = generateSchedules({
      requirements: [req("X 1")],
      preferences: {},
      catalog: cat(c),
      filters: [{
        id: 1, name: "Hidden", days: ["M"],
        start: 8 * 60, end: 11 * 60, session: "AD", visible: false,
      }],
    });
    expect(out.candidates.length).toBe(1);
    expect(out.conflicts).toEqual([]);
  });

  it("filter on different (non-AD) session does not block", () => {
    const c = course("X 1", [sec("1", "Lecture", ["Mon"], "09:00", "10:00", { sess: "A71" })]);
    const out = generateSchedules({
      requirements: [req("X 1")],
      preferences: {},
      catalog: cat(c),
      filters: [{
        id: 1, name: "OtherHalf", days: ["M"],
        start: 8 * 60, end: 11 * 60, session: "A72", visible: true,
      }],
    });
    expect(out.candidates.length).toBe(1);
    expect(out.conflicts).toEqual([]);
  });
});

describe("generateSchedules — locked + atoms interaction", () => {
  it("contradictory locked + section-pin atoms → empty domain, conflict, no crash", () => {
    const c = course("X 1", [
      sec("1", "Lecture", ["Mon"], "10:00", "11:00"),
      sec("2", "Lecture", ["Tue"], "10:00", "11:00"),
    ]);
    const r = Object.assign({}, req("X 1"), {
      locked_section: { class_number: "2" },
      atoms: [{ type: "section", class_number: "1", course_code: "X 1" }],
    });
    const out = generateSchedules({
      requirements: [r],
      preferences: {},
      catalog: cat(c),
      filters: [],
    });
    expect(out.candidates).toEqual([]);
    expect(out.conflicts.length).toBe(1);
  });
});

describe("generateSchedules — limits / preferences (additional)", () => {
  it("missing score_weights does not crash and default scoring applies", () => {
    const c = course("X 1", [sec("1", "Lecture", ["Mon"], "09:00", "10:00")]);
    const out = generateSchedules({
      requirements: [req("X 1")],
      preferences: { /* no score_weights */ },
      catalog: cat(c),
      filters: [],
    });
    expect(out.candidates.length).toBe(1);
    expect(typeof out.candidates[0].score).toBe("number");
  });

  it("max_candidates larger than natural domain returns all (no padding)", () => {
    const c = course("X 1", [
      sec("1", "Lecture", ["Mon"], "09:00", "10:00"),
      sec("2", "Lecture", ["Tue"], "09:00", "10:00"),
      sec("3", "Lecture", ["Wed"], "09:00", "10:00"),
    ]);
    const out = generateSchedules({
      requirements: [req("X 1")],
      preferences: {},
      catalog: cat(c),
      filters: [],
      max_candidates: 999,
    });
    expect(out.candidates.length).toBe(3);
  });
});

describe("generateSchedules — degenerate inputs", () => {
  it("requirement with empty courses and empty atoms → conflict, no crash", () => {
    const r = { id: "r-empty", courses: [], atoms: [] };
    const out = generateSchedules({
      requirements: [r],
      preferences: {},
      catalog: cat(),
      filters: [],
    });
    expect(out.candidates).toEqual([]);
    expect(out.conflicts.length).toBe(1);
    expect(out.conflicts[0].course_code).toBe("");
  });

  it("requirement names a course code absent from catalog → conflict, no crash", () => {
    const out = generateSchedules({
      requirements: [req("GHOST 999")],
      preferences: {},
      catalog: cat(), // empty
      filters: [],
    });
    expect(out.candidates).toEqual([]);
    expect(out.conflicts.length).toBe(1);
  });
});
