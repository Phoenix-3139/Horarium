import { describe, it, expect } from "vitest";
import {
  addRequirement,
  removeRequirement,
  addAlternativeToRequirement,
  removeAlternativeFromRequirement,
  lockSectionToRequirement,
  unlockSectionFromRequirement,
  DEFAULT_PREFERENCES,
  preferencesFor,
  updatePreferences,
} from "./requirements.js";

const emptyPlan = () => ({ id: "p", requirements: [] });

describe("addRequirement", () => {
  it("appends a single-course requirement and assigns an id", () => {
    const p = addRequirement(emptyPlan(), "CSCI-UA 102");
    expect(p.requirements).toHaveLength(1);
    expect(p.requirements[0].courses).toEqual(["CSCI-UA 102"]);
    expect(typeof p.requirements[0].id).toBe("string");
  });

  it("appends an OR-group when given an array", () => {
    const p = addRequirement(emptyPlan(), ["MATH-UH 1010", "MATH-UH 1011"]);
    expect(p.requirements[0].courses).toEqual(["MATH-UH 1010", "MATH-UH 1011"]);
  });

  it("returns the same plan for empty/whitespace input", () => {
    const p0 = emptyPlan();
    expect(addRequirement(p0, "")).toBe(p0);
    expect(addRequirement(p0, [])).toBe(p0);
    expect(addRequirement(p0, ["   "])).toBe(p0);
  });

  it("doesn't add a duplicate (same set of course codes)", () => {
    let p = addRequirement(emptyPlan(), ["A", "B"]);
    const p2 = addRequirement(p, ["B", "A"]); // order-insensitive equality
    expect(p2.requirements).toHaveLength(1);
  });

  it("treats different sets as distinct requirements", () => {
    let p = addRequirement(emptyPlan(), ["A"]);
    p = addRequirement(p, ["B"]);
    p = addRequirement(p, ["A", "B"]);
    expect(p.requirements).toHaveLength(3);
  });

  it("does not mutate the input plan", () => {
    const p = emptyPlan();
    const before = p.requirements;
    addRequirement(p, "X");
    expect(p.requirements).toBe(before);
    expect(p.requirements).toEqual([]);
  });
});

describe("removeRequirement", () => {
  it("drops by id and leaves siblings", () => {
    let p = addRequirement(emptyPlan(), "A");
    p = addRequirement(p, "B");
    const targetId = p.requirements[0].id;
    p = removeRequirement(p, targetId);
    expect(p.requirements).toHaveLength(1);
    expect(p.requirements[0].courses).toEqual(["B"]);
  });

  it("is a no-op for an unknown id", () => {
    const p = addRequirement(emptyPlan(), "A");
    const p2 = removeRequirement(p, "no-such-id");
    expect(p2).toBe(p);
  });
});

describe("addAlternativeToRequirement", () => {
  it("turns a single chip into an OR-group", () => {
    let p = addRequirement(emptyPlan(), "A");
    const id = p.requirements[0].id;
    p = addAlternativeToRequirement(p, id, "B");
    expect(p.requirements[0].courses).toEqual(["A", "B"]);
  });

  it("doesn't double-add an existing alternative", () => {
    let p = addRequirement(emptyPlan(), "A");
    const id = p.requirements[0].id;
    p = addAlternativeToRequirement(p, id, "A");
    expect(p.requirements[0].courses).toEqual(["A"]);
  });

  it("is a no-op for an unknown requirement id", () => {
    const p = addRequirement(emptyPlan(), "A");
    const p2 = addAlternativeToRequirement(p, "nope", "B");
    expect(p2).toBe(p);
  });
});

describe("removeAlternativeFromRequirement", () => {
  it("collapses to single-course when one alternative remains", () => {
    let p = addRequirement(emptyPlan(), ["A", "B"]);
    const id = p.requirements[0].id;
    p = removeAlternativeFromRequirement(p, id, "A");
    expect(p.requirements[0].courses).toEqual(["B"]);
  });

  it("removes the requirement entirely when last alternative is removed", () => {
    let p = addRequirement(emptyPlan(), ["A"]);
    const id = p.requirements[0].id;
    p = removeAlternativeFromRequirement(p, id, "A");
    expect(p.requirements).toHaveLength(0);
  });

  it("drops a locked section whose course is being removed", () => {
    let p = addRequirement(emptyPlan(), ["A", "B"]);
    const id = p.requirements[0].id;
    p = lockSectionToRequirement(p, id, "12345", "A");
    p = removeAlternativeFromRequirement(p, id, "A");
    expect(p.requirements[0].courses).toEqual(["B"]);
    expect(p.requirements[0].locked_section).toBeUndefined();
  });

  it("keeps a locked section whose course is unaffected", () => {
    let p = addRequirement(emptyPlan(), ["A", "B"]);
    const id = p.requirements[0].id;
    p = lockSectionToRequirement(p, id, "12345", "A");
    p = removeAlternativeFromRequirement(p, id, "B");
    expect(p.requirements[0].locked_section.class_number).toBe("12345");
  });
});

describe("lock / unlockSectionFromRequirement", () => {
  it("locks a section to a requirement", () => {
    let p = addRequirement(emptyPlan(), "A");
    const id = p.requirements[0].id;
    p = lockSectionToRequirement(p, id, "12345", "A");
    expect(p.requirements[0].locked_section.class_number).toBe("12345");
  });

  it("unlocks", () => {
    let p = addRequirement(emptyPlan(), "A");
    const id = p.requirements[0].id;
    p = lockSectionToRequirement(p, id, "12345", "A");
    p = unlockSectionFromRequirement(p, id);
    expect(p.requirements[0].locked_section).toBeUndefined();
  });

  it("unlock is a no-op when nothing is locked", () => {
    let p = addRequirement(emptyPlan(), "A");
    const id = p.requirements[0].id;
    const p2 = unlockSectionFromRequirement(p, id);
    expect(p2).toBe(p);
  });
});

describe("immutability", () => {
  it("returns new plan objects, never mutates inputs", () => {
    const p0 = emptyPlan();
    const p1 = addRequirement(p0, "A");
    expect(p1).not.toBe(p0);
    expect(p0.requirements).toEqual([]);
    const p2 = addAlternativeToRequirement(p1, p1.requirements[0].id, "B");
    expect(p2).not.toBe(p1);
    expect(p2.requirements).not.toBe(p1.requirements);
    expect(p1.requirements[0].courses).toEqual(["A"]);
  });
});

describe("preferences", () => {
  it("preferencesFor returns defaults for an empty plan", () => {
    const got = preferencesFor({});
    expect(got).toEqual(DEFAULT_PREFERENCES);
  });

  it("preferencesFor coerces unknown distribution to 'ignore'", () => {
    const got = preferencesFor({ scheduler_preferences: { day_distribution: "weird" } });
    expect(got.day_distribution).toBe("ignore");
  });

  it("updatePreferences merges and returns a new plan", () => {
    const p1 = updatePreferences({}, { lunch_break: true });
    expect(p1.scheduler_preferences.lunch_break).toBe(true);
    expect(p1.scheduler_preferences.day_distribution).toBe("ignore");
    const p2 = updatePreferences(p1, { day_distribution: "balanced" });
    expect(p2.scheduler_preferences.lunch_break).toBe(true);
    expect(p2.scheduler_preferences.day_distribution).toBe("balanced");
  });

  it("DEFAULT_PREFERENCES is frozen", () => {
    expect(() => { DEFAULT_PREFERENCES.lunch_break = true; }).toThrow();
  });
});
