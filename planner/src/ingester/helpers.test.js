import { describe, it, expect } from "vitest";
import {
  parseDate,
  parseTime,
  parseDays,
  parseStatus,
  parseRoom,
  parseSession,
  stripTitleFlags,
  parseInstructors,
  parseUnits,
} from "./helpers.js";

describe("parseDate", () => {
  it("converts MM/DD/YYYY to ISO", () => {
    expect(parseDate("08/31/2026")).toBe("2026-08-31");
    expect(parseDate("12/14/2026")).toBe("2026-12-14");
    expect(parseDate("01/01/2027")).toBe("2027-01-01");
  });
  it("trims whitespace", () => {
    expect(parseDate("  08/31/2026  ")).toBe("2026-08-31");
  });
  it("returns null on malformed input", () => {
    expect(parseDate("2026-08-31")).toBe(null);
    expect(parseDate("8/31/2026")).toBe(null);
    expect(parseDate("")).toBe(null);
    expect(parseDate(null)).toBe(null);
    expect(parseDate(undefined)).toBe(null);
  });
});

describe("parseTime", () => {
  it("converts AM times with leading zero padding", () => {
    expect(parseTime("8.30 AM")).toBe("08:30");
    expect(parseTime("9.55 AM")).toBe("09:55");
    expect(parseTime("11.20 AM")).toBe("11:20");
  });
  it("converts PM times by adding 12", () => {
    expect(parseTime("2.10 PM")).toBe("14:10");
    expect(parseTime("5.00 PM")).toBe("17:00");
    expect(parseTime("6.00 PM")).toBe("18:00");
    expect(parseTime("6.15 PM")).toBe("18:15");
  });
  it("handles the 12 PM noon case", () => {
    expect(parseTime("12.00 PM")).toBe("12:00");
    expect(parseTime("12.30 PM")).toBe("12:30");
    expect(parseTime("12.35 PM")).toBe("12:35");
    expect(parseTime("12.45 PM")).toBe("12:45");
  });
  it("handles the 12 AM midnight case", () => {
    expect(parseTime("12.00 AM")).toBe("00:00");
    expect(parseTime("12.30 AM")).toBe("00:30");
  });
  it("is case-insensitive on meridiem", () => {
    expect(parseTime("5.00 pm")).toBe("17:00");
    expect(parseTime("5.00 Pm")).toBe("17:00");
  });
  it("tolerates extra whitespace", () => {
    expect(parseTime("  5.00 PM  ")).toBe("17:00");
  });
  it("returns null on malformed input", () => {
    expect(parseTime("5:00 PM")).toBe(null); // colon instead of dot
    expect(parseTime("25.00 PM")).toBe(null); // bad hour
    expect(parseTime("5.60 PM")).toBe(null); // bad minute
    expect(parseTime("5.00")).toBe(null); // missing meridiem
    expect(parseTime("")).toBe(null);
    expect(parseTime(null)).toBe(null);
  });
});

describe("parseDays", () => {
  it("splits a comma-separated list", () => {
    expect(parseDays("Mon,Wed")).toEqual({ days: ["Mon", "Wed"], unknown: [] });
    expect(parseDays("Tue,Thu")).toEqual({ days: ["Tue", "Thu"], unknown: [] });
    expect(parseDays("Mon,Wed,Fri")).toEqual({ days: ["Mon", "Wed", "Fri"], unknown: [] });
  });
  it("handles a single day", () => {
    expect(parseDays("Mon")).toEqual({ days: ["Mon"], unknown: [] });
    expect(parseDays("Fri")).toEqual({ days: ["Fri"], unknown: [] });
  });
  it("treats empty/nullish as empty days", () => {
    expect(parseDays("")).toEqual({ days: [], unknown: [] });
    expect(parseDays("   ")).toEqual({ days: [], unknown: [] });
    expect(parseDays(null)).toEqual({ days: [], unknown: [] });
    expect(parseDays(undefined)).toEqual({ days: [], unknown: [] });
  });
  it("tolerates stray spaces around tokens", () => {
    expect(parseDays("Mon, Wed")).toEqual({ days: ["Mon", "Wed"], unknown: [] });
  });
  it("surfaces unknown tokens without dropping them silently", () => {
    expect(parseDays("Mon,Funday")).toEqual({ days: ["Mon"], unknown: ["Funday"] });
    expect(parseDays("MON")).toEqual({ days: [], unknown: ["MON"] }); // case matters
  });
});

describe("parseStatus", () => {
  it("maps Open", () => {
    expect(parseStatus("Open")).toEqual({ raw: "Open", type: "open", count: null });
  });
  it("maps Closed", () => {
    expect(parseStatus("Closed")).toEqual({ raw: "Closed", type: "closed", count: null });
  });
  it("maps Cancelled", () => {
    expect(parseStatus("Cancelled")).toEqual({
      raw: "Cancelled",
      type: "cancelled",
      count: null,
    });
  });
  it("maps Wait List with a count", () => {
    expect(parseStatus("Wait List (5)")).toEqual({
      raw: "Wait List (5)",
      type: "waitlist",
      count: 5,
    });
    expect(parseStatus("Wait List (0)")).toEqual({
      raw: "Wait List (0)",
      type: "waitlist",
      count: 0,
    });
    expect(parseStatus("Wait List (12)")).toEqual({
      raw: "Wait List (12)",
      type: "waitlist",
      count: 12,
    });
  });
  it("trims whitespace", () => {
    expect(parseStatus("  Open  ")).toEqual({ raw: "Open", type: "open", count: null });
  });
  it("classifies unknown status strings as 'unknown' without losing the raw", () => {
    expect(parseStatus("Something Weird")).toEqual({
      raw: "Something Weird",
      type: "unknown",
      count: null,
    });
    expect(parseStatus("")).toEqual({ raw: "", type: "unknown", count: null });
  });
});

describe("parseRoom", () => {
  it("splits on ' Room ' for standard labels", () => {
    expect(parseRoom("West Administration Room 001")).toEqual({
      room: "West Administration Room 001",
      building: "West Administration",
      room_number: "001",
    });
    expect(parseRoom("Social Sciences Room 018")).toEqual({
      room: "Social Sciences Room 018",
      building: "Social Sciences",
      room_number: "018",
    });
    expect(parseRoom("A1 Building Room 002")).toEqual({
      room: "A1 Building Room 002",
      building: "A1 Building",
      room_number: "002",
    });
    expect(parseRoom("East Administration Building Room 003")).toEqual({
      room: "East Administration Building Room 003",
      building: "East Administration Building",
      room_number: "003",
    });
    expect(parseRoom("Campus Center Room E052")).toEqual({
      room: "Campus Center Room E052",
      building: "Campus Center",
      room_number: "E052",
    });
  });
  it("keeps non-numeric PHYED room labels intact", () => {
    for (const label of [
      "DANCE STUD",
      "POOL",
      "TENNIS",
      "ROCK WALL",
      "COMBAT STU",
      "YOGA STUDI",
      "PERF_GYM",
      "FIT_CEN",
      "TRACK1",
      "W103B",
    ]) {
      expect(parseRoom(`Campus Center Room ${label}`)).toEqual({
        room: `Campus Center Room ${label}`,
        building: "Campus Center",
        room_number: label,
      });
    }
  });
  it("returns the No Room Required sentinel", () => {
    expect(parseRoom("No Room Required")).toEqual({
      room: "No Room Required",
      building: null,
      room_number: null,
    });
    expect(parseRoom("  No Room Required  ")).toEqual({
      room: "No Room Required",
      building: null,
      room_number: null,
    });
  });
  it("returns all-null for empty/missing room", () => {
    expect(parseRoom(null)).toEqual({ room: null, building: null, room_number: null });
    expect(parseRoom(undefined)).toEqual({
      room: null,
      building: null,
      room_number: null,
    });
    expect(parseRoom("")).toEqual({ room: null, building: null, room_number: null });
    expect(parseRoom("   ")).toEqual({ room: null, building: null, room_number: null });
  });
  it("preserves an unparseable room verbatim rather than guessing", () => {
    expect(parseRoom("Some unexpected format")).toEqual({
      room: "Some unexpected format",
      building: null,
      room_number: null,
    });
  });
});

describe("parseSession", () => {
  it("parses AD / A71 / A72 with their date ranges", () => {
    expect(parseSession("AD 08/31/2026 - 12/14/2026")).toEqual({
      code: "AD",
      start_date: "2026-08-31",
      end_date: "2026-12-14",
    });
    expect(parseSession("A71 08/31/2026 - 10/16/2026")).toEqual({
      code: "A71",
      start_date: "2026-08-31",
      end_date: "2026-10-16",
    });
    expect(parseSession("A72 10/26/2026 - 12/14/2026")).toEqual({
      code: "A72",
      start_date: "2026-10-26",
      end_date: "2026-12-14",
    });
  });
  it("preserves the code literally even if dates suggest otherwise", () => {
    // The walkthrough says don't rewrite the code from the dates.
    expect(parseSession("X9 08/31/2026 - 12/14/2026")).toEqual({
      code: "X9",
      start_date: "2026-08-31",
      end_date: "2026-12-14",
    });
  });
  it("returns null on malformed input", () => {
    expect(parseSession("AD 08/31/2026")).toBe(null);
    expect(parseSession("08/31/2026 - 12/14/2026")).toBe(null);
    expect(parseSession("")).toBe(null);
    expect(parseSession(null)).toBe(null);
  });
});

describe("stripTitleFlags", () => {
  it("strips a leading WO flag", () => {
    expect(stripTitleFlags("WO Foundations of Middle Eastern Dance")).toEqual({
      title: "Foundations of Middle Eastern Dance",
      flags: ["WO"],
    });
  });
  it("leaves unflagged titles untouched", () => {
    expect(stripTitleFlags("Computer Programming for Engineers")).toEqual({
      title: "Computer Programming for Engineers",
      flags: [],
    });
    expect(stripTitleFlags("Bioengineering Principles")).toEqual({
      title: "Bioengineering Principles",
      flags: [],
    });
  });
  it("does not strip unknown 2-letter prefixes (they might just be acronyms)", () => {
    expect(stripTitleFlags("AI Methods")).toEqual({
      title: "AI Methods",
      flags: [],
    });
  });
  it("handles empty/nullish input safely", () => {
    expect(stripTitleFlags("")).toEqual({ title: "", flags: [] });
    expect(stripTitleFlags(null)).toEqual({ title: "", flags: [] });
    expect(stripTitleFlags(undefined)).toEqual({ title: "", flags: [] });
  });
});

describe("parseUnits", () => {
  it("returns a number for scalar values", () => {
    expect(parseUnits("4")).toBe(4);
    expect(parseUnits("2")).toBe(2);
    expect(parseUnits("0")).toBe(0);
  });
  it("returns a range object for 'N - M'", () => {
    expect(parseUnits("2 - 4")).toEqual({ min: 2, max: 4 });
    expect(parseUnits("2-4")).toEqual({ min: 2, max: 4 });
    expect(parseUnits("1 - 6")).toEqual({ min: 1, max: 6 });
  });
  it("tolerates whitespace", () => {
    expect(parseUnits("  4  ")).toBe(4);
    expect(parseUnits("  2  -  4  ")).toEqual({ min: 2, max: 4 });
  });
  it("accepts decimal values", () => {
    expect(parseUnits("1.5")).toBe(1.5);
    expect(parseUnits("0.5 - 2")).toEqual({ min: 0.5, max: 2 });
  });
  it("returns null on empty or malformed input", () => {
    expect(parseUnits("")).toBe(null);
    expect(parseUnits("   ")).toBe(null);
    expect(parseUnits("four")).toBe(null);
    expect(parseUnits(null)).toBe(null);
    expect(parseUnits(undefined)).toBe(null);
  });
});

describe("parseInstructors", () => {
  it("parses a single instructor", () => {
    expect(parseInstructors("Jabari, Saif Eddin Ghazi")).toEqual([
      "Jabari, Saif Eddin Ghazi",
    ]);
  });
  it("parses a semicolon-separated list", () => {
    expect(parseInstructors("Hashaikeh, Raed; Salim, Wahib")).toEqual([
      "Hashaikeh, Raed",
      "Salim, Wahib",
    ]);
    expect(parseInstructors("Zam, Azhar; Sabah, Shafiya")).toEqual([
      "Zam, Azhar",
      "Sabah, Shafiya",
    ]);
  });
  it("preserves the 'Last, First' comma in each entry", () => {
    // sanity: the commas inside names must not be treated as separators
    expect(parseInstructors("Nadeem, Qurrat-Ul-Ain")).toEqual(["Nadeem, Qurrat-Ul-Ain"]);
  });
  it("returns [] for empty/null input", () => {
    expect(parseInstructors("")).toEqual([]);
    expect(parseInstructors("   ")).toEqual([]);
    expect(parseInstructors(null)).toEqual([]);
    expect(parseInstructors(undefined)).toEqual([]);
  });
  it("tolerates inconsistent semicolon spacing", () => {
    expect(parseInstructors("A, X;B, Y")).toEqual(["A, X", "B, Y"]);
    expect(parseInstructors("A, X ;  B, Y")).toEqual(["A, X", "B, Y"]);
  });
});
