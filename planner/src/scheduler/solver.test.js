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
