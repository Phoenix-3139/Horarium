import { describe, it, expect } from "vitest";
import {
  humanBytes,
  subjectStaleness,
  STALENESS_THRESHOLD_DAYS,
  sanitizeFilename,
  buildEditsExport,
  buildEditsExportFilename,
  summarizeStorage,
} from "./manage.js";

describe("humanBytes", () => {
  it("renders bytes / KB / MB / GB at 1024 step", () => {
    expect(humanBytes(0)).toBe("0 B");
    expect(humanBytes(1023)).toBe("1023 B");
    expect(humanBytes(1024)).toBe("1.0 KB");
    expect(humanBytes(1500)).toBe("1.5 KB");
    expect(humanBytes(10 * 1024)).toBe("10 KB");
    expect(humanBytes(237 * 1024)).toBe("237 KB");
    // 1.4 MB → 1.4 * 1024 * 1024 ≈ 1468006
    expect(humanBytes(1468006)).toBe("1.4 MB");
    expect(humanBytes(15 * 1024 * 1024)).toBe("15 MB");
  });
  it("rejects non-numeric / negative inputs", () => {
    expect(humanBytes(null)).toBe("—");
    expect(humanBytes(undefined)).toBe("—");
    expect(humanBytes(-1)).toBe("—");
    expect(humanBytes(NaN)).toBe("—");
    expect(humanBytes("100")).toBe("—");
  });
});

describe("subjectStaleness", () => {
  const now = Date.parse("2026-04-25T12:00:00Z");
  it("returns hasTimestamp:false for missing/invalid metadata", () => {
    expect(subjectStaleness(null, now)).toEqual({ ageDays: null, isStale: false, hasTimestamp: false });
    expect(subjectStaleness({}, now)).toEqual({ ageDays: null, isStale: false, hasTimestamp: false });
    expect(subjectStaleness({ last_updated: "garbage" }, now).hasTimestamp).toBe(false);
  });
  it("computes ageDays from last_updated", () => {
    const out = subjectStaleness({ last_updated: "2026-04-22T12:00:00Z" }, now);
    expect(out.ageDays).toBe(3);
    expect(out.isStale).toBe(false);
    expect(out.hasTimestamp).toBe(true);
  });
  it("flags stale at the 30-day threshold (default)", () => {
    expect(subjectStaleness({ last_updated: "2026-03-26T12:00:00Z" }, now).isStale).toBe(true); // 30 days
    expect(subjectStaleness({ last_updated: "2026-03-27T12:00:00Z" }, now).isStale).toBe(false); // 29 days
    expect(STALENESS_THRESHOLD_DAYS).toBe(30);
  });
  it("respects a custom threshold", () => {
    const out = subjectStaleness({ last_updated: "2026-04-18T12:00:00Z" }, now, 5);
    expect(out.isStale).toBe(true); // 7 days >= 5
  });
});

describe("sanitizeFilename", () => {
  it("strips filesystem-hostile chars", () => {
    expect(sanitizeFilename('foo/bar:baz?<>"|')).toBe("foobarbaz");
  });
  it("collapses whitespace to underscores", () => {
    expect(sanitizeFilename("Tarun A I")).toBe("Tarun_A_I");
  });
  it("returns empty for blank / non-string input", () => {
    expect(sanitizeFilename("")).toBe("");
    expect(sanitizeFilename("   ")).toBe("");
    expect(sanitizeFilename(null)).toBe("");
  });
  it("clamps to 60 chars", () => {
    const out = sanitizeFilename("x".repeat(200));
    expect(out.length).toBe(60);
  });
});

describe("buildEditsExport", () => {
  it("wraps the edits list in the documented envelope", () => {
    const editsList = [
      { class_number: "20631", field_path: "meetings", value: [], created_at: "2026-04-25T10:00:00Z" },
    ];
    const out = buildEditsExport({
      editsList,
      schemaVersion: "1.1.3",
      now: "2026-04-25T12:34:56Z",
    });
    expect(out.format).toBe("horarium-edits-export");
    expect(out.version).toBe(1);
    expect(out.schema_version).toBe("1.1.3");
    expect(out.exported_at).toBe("2026-04-25T12:34:56.000Z");
    expect(out.edits).toEqual(editsList);
  });
  it("tolerates a Date instance for `now`", () => {
    const d = new Date("2026-04-25T12:00:00Z");
    const out = buildEditsExport({ editsList: [], schemaVersion: "1.1.3", now: d });
    expect(out.exported_at).toBe("2026-04-25T12:00:00.000Z");
  });
  it("normalizes missing/invalid editsList to []", () => {
    expect(buildEditsExport({ editsList: null, schemaVersion: "1.1.3" }).edits).toEqual([]);
    expect(buildEditsExport({ editsList: undefined, schemaVersion: "1.1.3" }).edits).toEqual([]);
  });
});

describe("buildEditsExportFilename", () => {
  const now = new Date("2026-04-25T12:00:00Z");
  it("uses sanitized display name when present", () => {
    expect(buildEditsExportFilename({ displayName: "Tarun A I", now }))
      .toBe("Tarun_A_I_horarium-edits_2026-04-25.json");
  });
  it("falls back to anonymous filename when display name is blank", () => {
    expect(buildEditsExportFilename({ displayName: "", now }))
      .toBe("horarium-edits_2026-04-25.json");
    expect(buildEditsExportFilename({ displayName: null, now }))
      .toBe("horarium-edits_2026-04-25.json");
  });
});

describe("summarizeStorage", () => {
  it("rolls up subjects/courses/sections/edits/bytes from snapshot+stats", () => {
    const catalogSnapshot = {
      parsed: {
        "ENGR-UH": {
          courses: [
            { code: "ENGR-UH 1000", sections: [{ class_number: "1" }, { class_number: "2" }] },
            { code: "ENGR-UH 2010", sections: [{ class_number: "3" }] },
          ],
        },
        "PHYED-UH": {
          courses: [{ code: "PHYED-UH 1001", sections: [] }],
        },
      },
      edits: [{ class_number: "1", field_path: "section_code", value: "X" }],
    };
    const storageStats = { bytes_used: 1500, last_saved_at: "2026-04-25T10:00:00Z" };
    const out = summarizeStorage({ catalogSnapshot, storageStats });
    expect(out).toEqual({
      subjects: 2,
      courses: 3,
      sections: 3,
      edits: 1,
      bytes: 1500,
      last_saved_at: "2026-04-25T10:00:00Z",
    });
  });
  it("returns zeros / nulls when snapshot+stats are empty", () => {
    expect(summarizeStorage({ catalogSnapshot: {}, storageStats: null })).toEqual({
      subjects: 0, courses: 0, sections: 0, edits: 0, bytes: 0, last_saved_at: null,
    });
  });
});
