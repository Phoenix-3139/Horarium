import { describe, it, expect } from "vitest";
import {
  buildPack,
  buildPackFilename,
  validatePackPayload,
  parseAndValidatePack,
  compareSemver,
  packId,
  PACK_FORMAT,
  PACK_FORMAT_VERSION,
  PACK_MAX_BYTES,
} from "./pack.js";

// Minimal valid catalog snapshot (mirrors catalog.toJSON() output shape).
function makeCatalogJSON({ subjects = ["ENGR-UH"], schemaVersion = "1.1.3", edits = [] } = {}) {
  const parsed = {};
  for (const s of subjects) {
    parsed[s] = {
      schema_version: schemaVersion,
      header: { term: "Fall 2026", subject_code: s, results_shown: 1, total_class_count: 1 },
      courses: [
        {
          code: `${s} 1000`,
          subject: s,
          catalog_number: "1000",
          title: "Test Course",
          title_flags: [],
          description: "A description.",
          school: "NYU Abu Dhabi",
          units: 4,
          no_sections_offered: false,
          has_topics: false,
          sections: [
            {
              class_number: "20607",
              section_code: "001",
              component: "Lecture",
              session: { code: "AD", start_date: "2026-08-31", end_date: "2026-12-14" },
              status: { raw: "Open", type: "open", count: null },
              requires_consent: false,
              meetings: [],
              linked_components: [],
              notes: null,
            },
          ],
        },
      ],
      warnings: [],
      unparsed_lines: [],
    };
  }
  return { schema_version: schemaVersion, parsed, edits };
}

describe("buildPack", () => {
  it("produces a well-formed pack with envelope + data", () => {
    const cat = makeCatalogJSON();
    const pack = buildPack({
      catalogJSON: cat,
      identity: { name: "Alex Chen", program: "CompE" },
      term: "Fall 2026",
      contents: ["catalog", "edits"],
      now: "2026-04-25T15:30:00Z",
    });
    expect(pack.format).toBe("horarium-pack");
    expect(pack.format_version).toBe(1);
    expect(pack.schema_version).toBe("1.1.3");
    expect(pack.exported_at).toBe("2026-04-25T15:30:00.000Z");
    expect(pack.exported_by.display_name).toBe("Alex Chen");
    expect(pack.exported_by.program).toBe("CompE");
    expect(pack.term).toBe("Fall 2026");
    expect(pack.contents).toEqual(["catalog", "edits"]);
    expect(pack.data.catalog["ENGR-UH"].courses).toHaveLength(1);
    expect(pack.data.edits).toEqual([]);
  });
  it("anonymizes when identity is missing or empty", () => {
    const pack = buildPack({ catalogJSON: makeCatalogJSON(), identity: null });
    expect(pack.exported_by.display_name).toBe(null);
    expect(pack.exported_by.program).toBe(null);
  });
  it("trims display_name / program whitespace", () => {
    const pack = buildPack({
      catalogJSON: makeCatalogJSON(),
      identity: { name: "  Alex  ", program: "  CompE " },
    });
    expect(pack.exported_by.display_name).toBe("Alex");
    expect(pack.exported_by.program).toBe("CompE");
  });
});

describe("buildPackFilename", () => {
  const now = new Date("2026-04-25T12:00:00Z");
  it("uses display name + term + date", () => {
    expect(buildPackFilename({ displayName: "Alex Chen", term: "Fall 2026", now }))
      .toBe("Alex_Chen_horarium-pack_Fall_2026_2026-04-25.json");
  });
  it("falls back gracefully when bits are missing", () => {
    expect(buildPackFilename({ displayName: "", term: "", now }))
      .toBe("horarium-pack_2026-04-25.json");
    expect(buildPackFilename({ displayName: "Alex", now }))
      .toBe("Alex_horarium-pack_2026-04-25.json");
  });
});

describe("validatePackPayload — valid", () => {
  it("accepts a roundtripped pack", () => {
    const cat = makeCatalogJSON();
    const pack = buildPack({ catalogJSON: cat, identity: { name: "Alex" } });
    const r = validatePackPayload(pack, { currentSchemaVersion: "1.1.3" });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.pack.data.catalog["ENGR-UH"].courses[0].sections[0].class_number).toBe("20607");
  });
  it("export → JSON.stringify → parseAndValidatePack round-trips identity", () => {
    const cat = makeCatalogJSON({
      edits: [
        { class_number: "20607", course_code: null, field_path: "section_code", value: "X", created_at: "2026-04-25T10:00:00Z" },
      ],
    });
    const pack = buildPack({ catalogJSON: cat, identity: { name: "Alex" } });
    const json = JSON.stringify(pack);
    const r = parseAndValidatePack(json, { currentSchemaVersion: "1.1.3" });
    expect(r.ok).toBe(true);
    expect(r.pack.data.edits).toHaveLength(1);
    expect(r.pack.data.edits[0].field_path).toBe("section_code");
  });
});

describe("validatePackPayload — rejection paths", () => {
  it("rejects non-object root", () => {
    expect(validatePackPayload(null).ok).toBe(false);
    expect(validatePackPayload([]).ok).toBe(false);
    expect(validatePackPayload("string").ok).toBe(false);
  });
  it("rejects when format !== 'horarium-pack'", () => {
    const r = validatePackPayload({
      format: "schedule-export", format_version: 1, schema_version: "1.1.3",
      exported_at: "2026-04-25T00:00:00Z", data: { catalog: {} },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === "format")).toBe(true);
  });
  it("rejects format_version > current", () => {
    const r = validatePackPayload({
      format: "horarium-pack", format_version: 99, schema_version: "1.1.3",
      exported_at: "2026-04-25T00:00:00Z", data: { catalog: {} },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === "format_version")).toBe(true);
  });
  it("rejects newer schema_version with a clear message", () => {
    const r = validatePackPayload({
      format: "horarium-pack", format_version: 1, schema_version: "1.5.0",
      exported_at: "2026-04-25T00:00:00Z", data: { catalog: {} },
    }, { currentSchemaVersion: "1.1.3" });
    expect(r.ok).toBe(false);
    const err = r.errors.find((e) => e.path === "schema_version");
    expect(err.message).toMatch(/only understands up to/i);
    expect(err.message).toMatch(/Update your copy/i);
  });
  it("accepts older or equal schema_version (additive migration)", () => {
    const cat = makeCatalogJSON({ schemaVersion: "1.1.0" });
    const pack = buildPack({ catalogJSON: cat });
    const r = validatePackPayload(pack, { currentSchemaVersion: "1.1.3" });
    expect(r.ok).toBe(true);
  });
  it("rejects malformed schema_version string", () => {
    const r = validatePackPayload({
      format: "horarium-pack", format_version: 1, schema_version: "not-a-version",
      exported_at: "2026-04-25T00:00:00Z", data: { catalog: {} },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === "schema_version")).toBe(true);
  });
  it("rejects when data is missing", () => {
    const r = validatePackPayload({
      format: "horarium-pack", format_version: 1, schema_version: "1.1.3",
      exported_at: "2026-04-25T00:00:00Z",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === "data")).toBe(true);
  });
  it("collects multiple errors rather than failing fast", () => {
    const r = validatePackPayload({
      format: "wrong-format",
      format_version: "not-a-number",
      schema_version: "garbage",
      data: "also-wrong",
    });
    expect(r.ok).toBe(false);
    // At least format, format_version, schema_version, data — four
    // distinct error paths.
    const paths = new Set(r.errors.map((e) => e.path));
    expect(paths.size).toBeGreaterThanOrEqual(4);
  });
  it("rejects oversized files via parseAndValidatePack", () => {
    const huge = "x".repeat(PACK_MAX_BYTES + 1);
    const r = parseAndValidatePack(huge, { currentSchemaVersion: "1.1.3" });
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toMatch(/larger than/i);
  });
  it("rejects malformed JSON", () => {
    const r = parseAndValidatePack("{ this is not: json,", { currentSchemaVersion: "1.1.3" });
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toMatch(/JSON parse failed/);
  });
  it("rejects malformed catalog substructure", () => {
    const r = validatePackPayload({
      format: "horarium-pack", format_version: 1, schema_version: "1.1.3",
      exported_at: "2026-04-25T00:00:00Z",
      data: {
        catalog: {
          "ENGR-UH": {
            courses: [{ /* missing code, sections */ }],
          },
        },
      },
    }, { currentSchemaVersion: "1.1.3" });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /code/.test(e.path))).toBe(true);
    expect(r.errors.some((e) => /sections/.test(e.path))).toBe(true);
  });
  it("rejects strings exceeding length caps", () => {
    const cat = makeCatalogJSON();
    cat.parsed["ENGR-UH"].courses[0].title = "x".repeat(1000); // > 500
    const pack = buildPack({ catalogJSON: cat });
    const r = validatePackPayload(pack, { currentSchemaVersion: "1.1.3" });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /title/.test(e.path) && /limit/.test(e.message))).toBe(true);
  });
});

describe("validatePackPayload — hostile content tolerated, sanitization is renderer's job", () => {
  it("accepts <script> in a course title (length-bounded text is fine)", () => {
    const cat = makeCatalogJSON();
    cat.parsed["ENGR-UH"].courses[0].title = "<script>alert(1)</script>";
    const pack = buildPack({ catalogJSON: cat });
    const r = validatePackPayload(pack, { currentSchemaVersion: "1.1.3" });
    // Validator accepts — strings with HTML are valid JSON. The
    // renderer is expected to use textContent (never innerHTML) so the
    // <script> renders as literal text. This test pins the contract.
    expect(r.ok).toBe(true);
    expect(r.pack.data.catalog["ENGR-UH"].courses[0].title).toBe("<script>alert(1)</script>");
  });
  it("ignores unknown top-level fields (forward-compat)", () => {
    const cat = makeCatalogJSON();
    const pack = buildPack({ catalogJSON: cat });
    pack.future_field = { will_be_dropped: true };
    const r = validatePackPayload(pack, { currentSchemaVersion: "1.1.3" });
    expect(r.ok).toBe(true);
    expect(r.pack.future_field).toBeUndefined();
  });
});

describe("compareSemver", () => {
  it("compares correctly", () => {
    expect(compareSemver("1.1.3", "1.1.3")).toBe(0);
    expect(compareSemver("1.1.3", "1.1.4")).toBeLessThan(0);
    expect(compareSemver("1.2.0", "1.1.99")).toBeGreaterThan(0);
    expect(compareSemver("2.0.0", "1.99.99")).toBeGreaterThan(0);
  });
});

describe("packId", () => {
  it("uses display_name + exported_at to make stable ids", () => {
    const a = packId({ exported_by: { display_name: "Alex Chen" }, exported_at: "2026-04-25T15:30:00Z" });
    const b = packId({ exported_by: { display_name: "Alex Chen" }, exported_at: "2026-04-25T15:30:00Z" });
    expect(a).toBe(b);
    expect(a).toMatch(/Alex/);
    expect(a).toMatch(/2026-04-25/);
  });
  it("falls back to anon when display_name is missing", () => {
    const id = packId({ exported_by: { display_name: null }, exported_at: "2026-04-25T15:30:00Z" });
    expect(id.startsWith("anon")).toBe(true);
  });
});
