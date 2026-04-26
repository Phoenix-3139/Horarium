import { describe, it, expect } from "vitest";
import {
  scoreCandidate,
  _scoreEarlyStarts,
  _scoreLateEnds,
  _scoreLunchBreak,
  _scoreBalanced,
  _scoreCompressed,
} from "./scoring.js";

// Convenience: build a section with one meeting block.
function s(day, startHHMM, endHHMM, code = "X") {
  return {
    class_number: code + "-" + day + startHHMM,
    component: "Lecture",
    meetings: [{ days: [day], start_time: startHHMM, end_time: endHHMM }],
  };
}

describe("scoreCandidate — empty/edge cases", () => {
  it("empty section list scores 0", () => {
    expect(scoreCandidate([], {})).toBe(0);
  });
  it("empty preferences with sections still scores 0", () => {
    expect(scoreCandidate([s("Mon", "09:00", "10:30")], {})).toBe(0);
  });
  it("no_starts_before='HH:MM' but no early classes scores 0", () => {
    expect(scoreCandidate([s("Mon", "10:00", "11:00")], { no_starts_before: "09:00" })).toBe(0);
  });
});

describe("_scoreEarlyStarts", () => {
  it("counts minutes-before-cutoff for each early block", () => {
    const blocks = [
      { day: "Mon", start: 8 * 60, end: 9 * 60 },     // 60 min early
      { day: "Tue", start: 7 * 60 + 30, end: 9 * 60 }, // 90 min early
      { day: "Wed", start: 10 * 60, end: 11 * 60 },   // not early
    ];
    expect(_scoreEarlyStarts(blocks, "09:00")).toBe(150);
  });
  it("invalid cutoff scores 0", () => {
    expect(_scoreEarlyStarts([{ day: "Mon", start: 0, end: 60 }], "not-a-time")).toBe(0);
  });
});

describe("_scoreLateEnds", () => {
  it("counts minutes-past-cutoff for each late block", () => {
    const blocks = [
      { day: "Mon", start: 17 * 60, end: 18 * 60 + 30 }, // 30 min late
      { day: "Tue", start: 17 * 60, end: 19 * 60 },      // 60 min late
      { day: "Wed", start: 14 * 60, end: 15 * 60 },      // not late
    ];
    expect(_scoreLateEnds(blocks, "18:00")).toBe(90);
  });
});

describe("_scoreLunchBreak", () => {
  it("no penalty when there's a gap inside 11:30-14:00", () => {
    // 09-10:30 (Mon), 13:00-14:30 (Mon) — 11:30→13:00 free, 90min gap.
    const blocks = [
      { day: "Mon", start: 9 * 60,           end: 10 * 60 + 30 },
      { day: "Mon", start: 13 * 60,          end: 14 * 60 + 30 },
    ];
    expect(_scoreLunchBreak(blocks)).toBe(0);
  });
  it("penalizes 60 per day fully booked through the lunch window", () => {
    // Mon: 11:00-14:30 (covers entire 11:30-14:00 window).
    const blocks = [{ day: "Mon", start: 11 * 60, end: 14 * 60 + 30 }];
    expect(_scoreLunchBreak(blocks)).toBe(60);
  });
  it("counts each booked day independently", () => {
    const blocks = [
      { day: "Mon", start: 11 * 60, end: 14 * 60 + 30 },
      { day: "Tue", start: 11 * 60, end: 14 * 60 + 30 },
    ];
    expect(_scoreLunchBreak(blocks)).toBe(120);
  });
  it("days with no classes don't penalize", () => {
    expect(_scoreLunchBreak([])).toBe(0);
  });
});

describe("_scoreBalanced", () => {
  it("returns 0 when single active day", () => {
    const blocks = [{ day: "Mon", start: 9 * 60, end: 10 * 60 }];
    expect(_scoreBalanced(blocks)).toBe(0);
  });
  it("returns 0 when all days have equal load", () => {
    const blocks = [
      { day: "Mon", start: 9 * 60, end: 10 * 60 },
      { day: "Tue", start: 9 * 60, end: 10 * 60 },
    ];
    expect(_scoreBalanced(blocks)).toBe(0);
  });
  it("non-zero penalty when days are imbalanced", () => {
    const blocks = [
      { day: "Mon", start: 9 * 60, end: 12 * 60 },   // 180 min
      { day: "Tue", start: 9 * 60, end: 10 * 60 },   // 60 min
    ];
    const score = _scoreBalanced(blocks);
    expect(score).toBeGreaterThan(0);
  });
});

describe("_scoreCompressed", () => {
  it("0 when 3 or fewer active days", () => {
    const blocks = [
      { day: "Mon", start: 9 * 60, end: 10 * 60 },
      { day: "Tue", start: 9 * 60, end: 10 * 60 },
      { day: "Wed", start: 9 * 60, end: 10 * 60 },
    ];
    expect(_scoreCompressed(blocks)).toBe(0);
  });
  it("100 per day above 3", () => {
    const blocks = [
      { day: "Mon", start: 9 * 60, end: 10 * 60 },
      { day: "Tue", start: 9 * 60, end: 10 * 60 },
      { day: "Wed", start: 9 * 60, end: 10 * 60 },
      { day: "Thu", start: 9 * 60, end: 10 * 60 },
      { day: "Fri", start: 9 * 60, end: 10 * 60 },
    ];
    expect(_scoreCompressed(blocks)).toBe(200);
  });
});

describe("scoreCandidate — combined preferences", () => {
  it("each preference contributes additively", () => {
    const sections = [
      s("Mon", "08:00", "09:00"),  // 60 min early
      s("Tue", "18:30", "19:30"),  // 90 min late
    ];
    const prefs = { no_starts_before: "09:00", no_ends_after: "18:00" };
    expect(scoreCandidate(sections, prefs)).toBe(60 + 90);
  });
  it("lunch + early + compressed stack", () => {
    const sections = [
      s("Mon", "08:00", "09:00"),                  // early: 60
      s("Mon", "11:00", "14:30"),                  // covers lunch window: +60
      s("Tue", "08:00", "09:00"),                  // early: 60
      s("Wed", "08:00", "09:00"),                  // early: 60
      s("Thu", "08:00", "09:00"),                  // early: 60
    ];
    const prefs = {
      no_starts_before: "09:00",
      lunch_break: true,
      day_distribution: "compressed",
    };
    // 4 active days → 100 over 3
    // Note: Mon's lunch class also adds 0 minutes early so no double-count.
    const score = scoreCandidate(sections, prefs);
    expect(score).toBe(60 + 60 + 60 + 60 + 60 + 100);
  });
});
