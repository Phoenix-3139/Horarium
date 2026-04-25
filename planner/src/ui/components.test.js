import { describe, it, expect } from "vitest";
import {
  detectIncompleteComponents,
  hashIncompleteState,
  shouldShowNotification,
  summarizeIncomplete,
} from "./components.js";

// --- Fixtures ---------------------------------------------------------
//
// A compact catalog snippet covering:
//  - A multi-component course: CSCI-UA 102 (Lecture + Recitation + Lab)
//  - A two-component course: ENGR-UH 1000 (Lecture + Lab)
//  - A single-component course: HUM-UH 1100 (Lecture only) — never
//    counted as incomplete regardless of staging.

const makeSection = (cn, code, comp, sectionCode = "001") => ({
  class_number: cn,
  section_code: sectionCode,
  component: comp,
});

const CATALOG = {
  courses: [
    {
      code: "CSCI-UA 102",
      title: "Data Structures",
      sections: [
        makeSection("10001", "CSCI-UA 102", "Lecture"),
        makeSection("10002", "CSCI-UA 102", "Lecture"),
        makeSection("10101", "CSCI-UA 102", "Recitation"),
        makeSection("10102", "CSCI-UA 102", "Recitation"),
        makeSection("10201", "CSCI-UA 102", "Laboratory"),
        makeSection("10202", "CSCI-UA 102", "Laboratory"),
      ],
    },
    {
      code: "ENGR-UH 1000",
      title: "Programming for Engineers",
      sections: [
        makeSection("20001", "ENGR-UH 1000", "Lecture"),
        makeSection("20101", "ENGR-UH 1000", "Laboratory"),
        makeSection("20102", "ENGR-UH 1000", "Laboratory"),
      ],
    },
    {
      code: "HUM-UH 1100",
      title: "Foundations of Humanity",
      sections: [
        makeSection("30001", "HUM-UH 1100", "Lecture"),
        makeSection("30002", "HUM-UH 1100", "Lecture"),
      ],
    },
  ],
};

const planWith = (...cns) => ({
  id: "p",
  sections: cns.map((cn) => ({ class_number: cn, subject: null })),
  dismissed_component_warning_hash: null,
});

// --- detectIncompleteComponents ---------------------------------------

describe("detectIncompleteComponents", () => {
  it("returns an empty map for an empty plan", () => {
    expect(detectIncompleteComponents(planWith(), CATALOG).size).toBe(0);
  });

  it("excludes single-component courses no matter how they're staged", () => {
    // HUM-UH 1100 has only Lecture — staging zero or many lectures
    // never makes it incomplete.
    const m = detectIncompleteComponents(planWith("30001"), CATALOG);
    expect(m.size).toBe(0);
  });

  it("flags a multi-component course with only a lecture staged", () => {
    const m = detectIncompleteComponents(planWith("10001"), CATALOG);
    expect(m.size).toBe(1);
    const e = m.get("CSCI-UA 102");
    expect(e.staged).toEqual(["Lecture"]);
    expect(e.missing.sort()).toEqual(["Laboratory", "Recitation"]);
    expect(e.missing_section_counts.Recitation).toBe(2);
    expect(e.missing_section_counts.Laboratory).toBe(2);
  });

  it("doesn't flag a course where all components are staged", () => {
    const m = detectIncompleteComponents(
      planWith("10001", "10101", "10201"),
      CATALOG,
    );
    expect(m.has("CSCI-UA 102")).toBe(false);
  });

  it("returns multiple incomplete courses together", () => {
    const m = detectIncompleteComponents(
      planWith("10001", "20001"),
      CATALOG,
    );
    expect(m.size).toBe(2);
    expect(m.get("CSCI-UA 102").missing).toContain("Recitation");
    expect(m.get("ENGR-UH 1000").missing).toEqual(["Laboratory"]);
  });

  it("ignores staged class numbers that don't appear in the catalog", () => {
    // A staged user-authored or stale section: just skip it; don't crash.
    const m = detectIncompleteComponents(planWith("99999"), CATALOG);
    expect(m.size).toBe(0);
  });
});

// --- hashIncompleteState ----------------------------------------------

describe("hashIncompleteState", () => {
  it("returns '' for an empty map", () => {
    expect(hashIncompleteState(new Map())).toBe("");
  });

  it("is stable across equivalent inputs regardless of insertion order", () => {
    const a = detectIncompleteComponents(planWith("10001", "20001"), CATALOG);
    const b = detectIncompleteComponents(planWith("20001", "10001"), CATALOG);
    expect(hashIncompleteState(a)).toBe(hashIncompleteState(b));
  });

  it("changes when the missing set changes", () => {
    const a = detectIncompleteComponents(planWith("10001"), CATALOG);
    const b = detectIncompleteComponents(planWith("10001", "10101"), CATALOG);
    // a is missing Recitation+Lab, b is missing only Lab → different hash.
    expect(hashIncompleteState(a)).not.toBe(hashIncompleteState(b));
  });

  it("changes when a different course becomes incomplete", () => {
    const a = detectIncompleteComponents(planWith("10001"), CATALOG);
    const b = detectIncompleteComponents(
      planWith("10001", "20001"),
      CATALOG,
    );
    expect(hashIncompleteState(a)).not.toBe(hashIncompleteState(b));
  });
});

// --- shouldShowNotification -------------------------------------------

describe("shouldShowNotification", () => {
  it("false when nothing is incomplete", () => {
    const plan = planWith("30001"); // single-component course
    expect(shouldShowNotification(plan, CATALOG)).toBe(false);
  });

  it("true when incomplete state exists and no dismissal recorded", () => {
    const plan = planWith("10001");
    expect(shouldShowNotification(plan, CATALOG)).toBe(true);
  });

  it("false when dismissed hash matches current incomplete state", () => {
    const plan = planWith("10001");
    const m = detectIncompleteComponents(plan, CATALOG);
    plan.dismissed_component_warning_hash = hashIncompleteState(m);
    expect(shouldShowNotification(plan, CATALOG)).toBe(false);
  });

  it("true again when state changes after dismissal", () => {
    const plan = planWith("10001");
    plan.dismissed_component_warning_hash = hashIncompleteState(
      detectIncompleteComponents(plan, CATALOG),
    );
    expect(shouldShowNotification(plan, CATALOG)).toBe(false);
    // Stage a Lab — recitation is still missing, so still incomplete,
    // but the hash has changed.
    plan.sections.push({ class_number: "10201", subject: null });
    expect(shouldShowNotification(plan, CATALOG)).toBe(true);
  });
});

// --- summarizeIncomplete ----------------------------------------------

describe("summarizeIncomplete", () => {
  it("singular line when exactly one incomplete course", () => {
    const r = summarizeIncomplete(planWith("10001"), CATALOG);
    expect(r.line).toBe("1 course needs additional sections.");
  });

  it("plural line when more than one incomplete course", () => {
    const r = summarizeIncomplete(planWith("10001", "20001"), CATALOG);
    expect(r.line).toBe("2 courses need additional sections.");
  });

  it("empty line when nothing is incomplete", () => {
    const r = summarizeIncomplete(planWith(), CATALOG);
    expect(r.line).toBe("");
    expect(r.incomplete.size).toBe(0);
  });
});
