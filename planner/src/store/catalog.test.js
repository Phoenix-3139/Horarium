import { describe, it, expect } from "vitest";
import { createCatalog } from "./catalog.js";

// Minimal parser-output shape for testing. Matches what parse() emits.
function buildParserOutput({ subject = "ENGR-UH", courses } = {}) {
  const section_count = courses.reduce((n, c) => n + c.sections.length, 0);
  return {
    schema_version: "1.1.2",
    header: {
      term: "Fall 2026",
      subject_code: subject,
      results_shown: courses.length,
      total_class_count: section_count,
    },
    courses,
    warnings: [],
    unparsed_lines: [],
  };
}

function buildSection(overrides = {}) {
  return {
    class_number: "20607",
    section_code: "001",
    component: "Lecture",
    session: { code: "AD", start_date: "2026-08-31", end_date: "2026-12-14" },
    status: { raw: "Open", type: "open", count: null },
    requires_consent: false,
    grading: "Ugrd Abu Dhabi Graded",
    instruction_mode: "In-Person",
    location: "Abu Dhabi",
    meetings: [
      {
        days: ["Mon", "Wed"],
        start_time: "17:00",
        end_time: "18:15",
        start_date: "2026-08-31",
        end_date: "2026-12-14",
        room: "West Administration Room 001",
        building: "West Administration",
        room_number: "001",
        instructors: [],
      },
    ],
    linked_components: [],
    notes: null,
    ...overrides,
  };
}

function buildCourse(overrides = {}) {
  return {
    code: "ENGR-UH 1000",
    subject: "ENGR-UH",
    catalog_number: "1000",
    title: "Computer Programming for Engineers",
    title_flags: [],
    description: "Intro to programming.",
    description_truncated: false,
    school: "NYU Abu Dhabi",
    units: 4,
    sections: [buildSection()],
    ...overrides,
  };
}

describe("createCatalog — empty store", () => {
  it("returns an empty effective view", () => {
    const cat = createCatalog();
    const eff = cat.getEffective();
    expect(eff.schema_version).toBe("1.1.2");
    expect(eff.courses).toEqual([]);
    expect(cat.listEdits()).toEqual({
      edits: [],
      auto_pruned: [],
      migration_warnings: [],
    });
    expect(cat.getSubjectMetadata()).toEqual({});
  });
});

describe("createCatalog — ingest and effective view", () => {
  it("shows ingested courses in the effective view", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({ courses: [buildCourse()] }),
    );
    const eff = cat.getEffective();
    expect(eff.courses).toHaveLength(1);
    expect(eff.courses[0].code).toBe("ENGR-UH 1000");
    expect(eff.courses[0].sections).toHaveLength(1);
    expect(eff.courses[0].sections[0].meetings[0].room).toBe(
      "West Administration Room 001",
    );
  });

  it("re-ingesting the same subject last-write-wins on parsed data", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({
        courses: [
          buildCourse({
            sections: [buildSection({ status: { raw: "Open", type: "open", count: null } })],
          }),
        ],
      }),
    );
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({
        courses: [
          buildCourse({
            sections: [
              buildSection({
                status: { raw: "Wait List (3)", type: "waitlist", count: 3 },
              }),
            ],
          }),
        ],
      }),
    );
    const eff = cat.getEffective();
    expect(eff.courses[0].sections[0].status).toEqual({
      raw: "Wait List (3)",
      type: "waitlist",
      count: 3,
    });
  });

  it("does not cross-contaminate subjects: ingesting A preserves B", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({ courses: [buildCourse()] }),
    );
    cat.ingestSubject(
      "PHYED-UH",
      buildParserOutput({
        subject: "PHYED-UH",
        courses: [
          buildCourse({
            code: "PHYED-UH 1004",
            subject: "PHYED-UH",
            catalog_number: "1004",
            title: "Swimming",
            sections: [buildSection({ class_number: "20100" })],
          }),
        ],
      }),
    );
    // Re-ingest ENGR-UH with different data; PHYED-UH should be untouched.
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({
        courses: [
          buildCourse({
            sections: [buildSection({ class_number: "20700" })],
          }),
        ],
      }),
    );
    const eff = cat.getEffective();
    const codes = eff.courses.map((c) => c.code).sort();
    expect(codes).toEqual(["ENGR-UH 1000", "PHYED-UH 1004"]);
    const engr = eff.courses.find((c) => c.code === "ENGR-UH 1000");
    expect(engr.sections[0].class_number).toBe("20700");
    const phyed = eff.courses.find((c) => c.code === "PHYED-UH 1004");
    expect(phyed.sections[0].class_number).toBe("20100");
  });
});

describe("createCatalog — edits overlay", () => {
  it("section edit overrides the parsed value", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({ courses: [buildCourse()] }),
    );
    cat.setEdit({
      class_number: "20607",
      field_path: "meetings[0].room",
      value: "East Admin 003",
    });
    const eff = cat.getEffective();
    expect(eff.courses[0].sections[0].meetings[0].room).toBe("East Admin 003");
  });

  it("user edit survives re-ingest with different parsed room; getParsedValue still exposes the raw parsed value", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({ courses: [buildCourse()] }),
    );
    cat.setEdit({
      class_number: "20607",
      field_path: "meetings[0].room",
      value: "East Admin 003",
    });
    // Re-ingest with a different parsed room. The edit should still win.
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({
        courses: [
          buildCourse({
            sections: [
              buildSection({
                meetings: [
                  {
                    ...buildSection().meetings[0],
                    room: "Social Sciences Room 018",
                    building: "Social Sciences",
                    room_number: "018",
                  },
                ],
              }),
            ],
          }),
        ],
      }),
    );
    const eff = cat.getEffective();
    expect(eff.courses[0].sections[0].meetings[0].room).toBe("East Admin 003");
    expect(cat.getParsedValue("20607", "meetings[0].room")).toBe(
      "Social Sciences Room 018",
    );
  });

  it("auto-prunes an edit when re-ingested parsed value now matches it", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({ courses: [buildCourse()] }),
    );
    cat.setEdit({
      class_number: "20607",
      field_path: "meetings[0].room",
      value: "East Admin 003",
    });
    expect(cat.listEdits().edits).toHaveLength(1);

    // Re-ingest where Albert now publishes the corrected room.
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({
        courses: [
          buildCourse({
            sections: [
              buildSection({
                meetings: [
                  {
                    ...buildSection().meetings[0],
                    room: "East Admin 003",
                    building: "East Admin",
                    room_number: "003",
                  },
                ],
              }),
            ],
          }),
        ],
      }),
    );
    const list = cat.listEdits();
    expect(list.edits).toHaveLength(0);
    expect(list.auto_pruned).toHaveLength(1);
    expect(list.auto_pruned[0]).toMatchObject({
      class_number: "20607",
      field_path: "meetings[0].room",
      reason: "parsed value now matches edit",
    });
  });

  it("setting an edit whose value happens to match parsed does NOT auto-prune (prune fires only on re-ingest)", () => {
    // Rationale: setEdit is an explicit user action; silently pruning it at
    // write time would make the UI look like saves are being dropped.
    // Auto-prune is only ever re-ingest-triggered.
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({ courses: [buildCourse()] }),
    );
    // The parsed value at this path is the exact same string we're about to
    // set — so if the store were pruning on set, this edit would vanish.
    expect(cat.getParsedValue("20607", "meetings[0].room")).toBe(
      "West Administration Room 001",
    );
    cat.setEdit({
      class_number: "20607",
      field_path: "meetings[0].room",
      value: "West Administration Room 001",
    });
    const list = cat.listEdits();
    expect(list.edits).toHaveLength(1);
    expect(list.edits[0].value).toBe("West Administration Room 001");
    expect(list.auto_pruned).toEqual([]);
  });

  it("two edits on the same field: last one wins (no stacking)", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({ courses: [buildCourse()] }),
    );
    cat.setEdit({
      class_number: "20607",
      field_path: "meetings[0].room",
      value: "A1 Room 001",
    });
    cat.setEdit({
      class_number: "20607",
      field_path: "meetings[0].room",
      value: "A1 Room 002",
    });
    expect(cat.listEdits().edits).toHaveLength(1);
    expect(cat.getEffective().courses[0].sections[0].meetings[0].room).toBe(
      "A1 Room 002",
    );
  });

  it("edit with course-level field_path updates the course in effective view", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({ courses: [buildCourse()] }),
    );
    cat.setEdit({
      course_code: "ENGR-UH 1000",
      field_path: "course.title",
      value: "Intro to Programming (Custom Title)",
    });
    const eff = cat.getEffective();
    expect(eff.courses[0].title).toBe("Intro to Programming (Custom Title)");
  });

  it("throws on an invalid section path", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({ courses: [buildCourse()] }),
    );
    expect(() =>
      cat.setEdit({
        class_number: "20607",
        field_path: "not.a.real.field",
        value: "x",
      }),
    ).toThrow(/Invalid section field_path/);
    expect(() =>
      cat.setEdit({
        class_number: "20607",
        field_path: "meetings[0].garbage",
        value: "x",
      }),
    ).toThrow(/Invalid section field_path/);
    expect(() =>
      cat.setEdit({
        course_code: "ENGR-UH 1000",
        field_path: "course.nonexistent",
        value: "x",
      }),
    ).toThrow(/Invalid course field_path/);
  });
});

describe("createCatalog — delete / undelete", () => {
  it("deleted section disappears from effective view but stays in listEdits", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({
        courses: [
          buildCourse({
            sections: [
              buildSection({ class_number: "20607" }),
              buildSection({ class_number: "20608", section_code: "LAB1" }),
            ],
          }),
        ],
      }),
    );
    cat.deleteSection("20607");
    const eff = cat.getEffective();
    expect(eff.courses[0].sections.map((s) => s.class_number)).toEqual(["20608"]);
    const list = cat.listEdits();
    expect(list.edits).toHaveLength(1);
    expect(list.edits[0]).toMatchObject({
      class_number: "20607",
      field_path: "_deleted",
      value: true,
    });
  });

  it("undelete restores the section", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({ courses: [buildCourse()] }),
    );
    cat.deleteSection("20607");
    expect(cat.getEffective().courses[0].sections).toHaveLength(0);
    cat.undelete({ class_number: "20607" });
    expect(cat.getEffective().courses[0].sections).toHaveLength(1);
    expect(cat.listEdits().edits).toHaveLength(0);
  });
});

describe("createCatalog — user-created section (3.3 seed)", () => {
  it("accepts edits on a class_number not in parsed and surfaces a synthetic section", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({ courses: [buildCourse()] }),
    );
    cat.setEdit({
      class_number: "99999",
      field_path: "section_code",
      value: "USER1",
    });
    cat.setEdit({
      class_number: "99999",
      field_path: "meetings[0].room",
      value: "My Room",
    });
    const eff = cat.getEffective();
    // The synthetic course appears at the end
    const synth = eff.courses.find((c) => c.code === "_USER_CREATED");
    expect(synth).toBeDefined();
    expect(synth._user_created).toBe(true);
    expect(synth.sections).toHaveLength(1);
    expect(synth.sections[0].class_number).toBe("99999");
    expect(synth.sections[0]._user_created).toBe(true);
    expect(synth.sections[0].section_code).toBe("USER1");
    expect(synth.sections[0].meetings[0].room).toBe("My Room");
  });
});

describe("createCatalog — clear", () => {
  it("clear parsed-only keeps edits; effective view shows only user-created", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({ courses: [buildCourse()] }),
    );
    cat.setEdit({
      class_number: "99999",
      field_path: "section_code",
      value: "USER1",
    });
    cat.clear({ parsed: true, edits: false });
    expect(cat.getSubjectMetadata()).toEqual({});
    const eff = cat.getEffective();
    // Only the synthetic user-created course survives.
    expect(eff.courses).toHaveLength(1);
    expect(eff.courses[0].code).toBe("_USER_CREATED");
    expect(cat.listEdits().edits).toHaveLength(1);
  });

  it("clear edits-only reverts all overrides but keeps parsed", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({ courses: [buildCourse()] }),
    );
    cat.setEdit({
      class_number: "20607",
      field_path: "meetings[0].room",
      value: "Overridden",
    });
    expect(cat.getEffective().courses[0].sections[0].meetings[0].room).toBe(
      "Overridden",
    );
    cat.clear({ parsed: false, edits: true });
    expect(cat.getEffective().courses[0].sections[0].meetings[0].room).toBe(
      "West Administration Room 001",
    );
    expect(cat.listEdits().edits).toHaveLength(0);
  });

  it("clear both empties the store", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({ courses: [buildCourse()] }),
    );
    cat.setEdit({
      class_number: "20607",
      field_path: "meetings[0].room",
      value: "X",
    });
    cat.clear({ parsed: true, edits: true });
    expect(cat.getEffective().courses).toEqual([]);
    expect(cat.listEdits().edits).toEqual([]);
    expect(cat.getSubjectMetadata()).toEqual({});
  });
});

describe("createCatalog — serialization round-trip", () => {
  it("toJSON → fromJSON preserves parsed, edits, deletes, metadata", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({
        courses: [
          buildCourse({
            sections: [
              buildSection({ class_number: "20607" }),
              buildSection({ class_number: "20608", section_code: "LAB1" }),
            ],
          }),
        ],
      }),
    );
    cat.ingestSubject(
      "PHYED-UH",
      buildParserOutput({
        subject: "PHYED-UH",
        courses: [
          buildCourse({
            code: "PHYED-UH 1004",
            subject: "PHYED-UH",
            catalog_number: "1004",
            title: "Swimming",
            sections: [buildSection({ class_number: "20100" })],
          }),
        ],
      }),
    );
    cat.setEdit({
      class_number: "20607",
      field_path: "meetings[0].room",
      value: "My Room",
    });
    cat.setEdit({
      course_code: "ENGR-UH 1000",
      field_path: "course.title",
      value: "Custom Title",
    });
    cat.deleteSection("20608");
    cat.setEdit({ class_number: "99999", field_path: "section_code", value: "U1" });

    const dumped = cat.toJSON();
    const restored = createCatalog();
    restored.fromJSON(dumped);

    // Effective views match.
    expect(restored.getEffective()).toEqual(cat.getEffective());
    // Edit list matches (ignoring order).
    const sortEdits = (es) =>
      [...es].sort((a, b) =>
        JSON.stringify(a) < JSON.stringify(b) ? -1 : 1,
      );
    expect(sortEdits(restored.listEdits().edits)).toEqual(
      sortEdits(cat.listEdits().edits),
    );
    expect(restored.getSubjectMetadata()).toEqual(cat.getSubjectMetadata());
  });

  it("edits survive a round-trip — spot-check the path", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({ courses: [buildCourse()] }),
    );
    cat.setEdit({
      class_number: "20607",
      field_path: "status.type",
      value: "closed",
    });
    const dumped = cat.toJSON();
    const restored = createCatalog();
    restored.fromJSON(dumped);
    expect(restored.getEffective().courses[0].sections[0].status.type).toBe(
      "closed",
    );
  });
});

describe("createCatalog — migration warnings for stale paths", () => {
  it("fromJSON drops invalid-path edits and surfaces them in migration_warnings", () => {
    const cat = createCatalog();
    // Hand-craft a serialized blob that contains an edit with a path that
    // was valid in some hypothetical future/past schema but isn't now.
    const blob = {
      schema_version: "1.1.2",
      parsed: {
        "ENGR-UH": buildParserOutput({ courses: [buildCourse()] }),
      },
      edits: [
        {
          class_number: "20607",
          course_code: null,
          field_path: "removed_field", // not in the current schema allowlist
          value: "x",
          created_at: "2026-04-20T00:00:00Z",
        },
        {
          class_number: "20607",
          course_code: null,
          field_path: "meetings[0].room",
          value: "Valid Room",
          created_at: "2026-04-20T00:00:00Z",
        },
      ],
      auto_pruned: [],
      migration_warnings: [],
      subject_metadata: {},
    };
    cat.fromJSON(blob);
    const list = cat.listEdits();
    expect(list.edits).toHaveLength(1);
    expect(list.edits[0].field_path).toBe("meetings[0].room");
    expect(list.migration_warnings).toHaveLength(1);
    expect(list.migration_warnings[0]).toMatchObject({
      type: "invalid_path",
      edit: expect.objectContaining({ field_path: "removed_field" }),
    });
  });
});

describe("createCatalog — metadata", () => {
  it("getSubjectMetadata reports last_updated and counts per subject", () => {
    const cat = createCatalog();
    const before = new Date().toISOString();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({
        courses: [
          buildCourse({
            sections: [
              buildSection({ class_number: "20607" }),
              buildSection({ class_number: "20608" }),
            ],
          }),
        ],
      }),
    );
    const meta = cat.getSubjectMetadata();
    expect(Object.keys(meta)).toEqual(["ENGR-UH"]);
    expect(meta["ENGR-UH"].course_count).toBe(1);
    expect(meta["ENGR-UH"].section_count).toBe(2);
    expect(meta["ENGR-UH"].total_class_count).toBe(2);
    expect(meta["ENGR-UH"].last_updated >= before).toBe(true);
  });
});
