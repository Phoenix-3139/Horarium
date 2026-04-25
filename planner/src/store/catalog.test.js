import { describe, it, expect } from "vitest";
import { createCatalog } from "./catalog.js";

// Minimal parser-output shape for testing. Matches what parse() emits.
function buildParserOutput({ subject = "ENGR-UH", courses } = {}) {
  const section_count = courses.reduce((n, c) => n + c.sections.length, 0);
  return {
    schema_version: "1.1.3",
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
    expect(eff.schema_version).toBe("1.1.3");
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
      schema_version: "1.1.3",
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

describe("createCatalog — subscribe (pub/sub for UI re-render)", () => {
  it("fires the subscriber on ingestSubject, setEdit, delete, clear, and fromJSON", () => {
    const cat = createCatalog();
    const events = [];
    cat.subscribe((e) => events.push(e));

    cat.ingestSubject("ENGR-UH", buildParserOutput({ courses: [buildCourse()] }));
    cat.setEdit({ class_number: "20607", field_path: "meetings[0].room", value: "X" });
    cat.deleteSection("20607");
    cat.clear({ parsed: true, edits: true });
    cat.fromJSON({ schema_version: "1.1.3" });

    const reasons = events.map((e) => e.reason);
    expect(reasons).toEqual(["ingest", "setEdit", "delete", "clear", "hydrate"]);
    // ingest event carries subject
    expect(events[0].subject).toBe("ENGR-UH");
    // setEdit carries identifying info
    expect(events[1].class_number).toBe("20607");
    expect(events[1].field_path).toBe("meetings[0].room");
  });

  it("unsubscribe stops notifications", () => {
    const cat = createCatalog();
    const events = [];
    const unsub = cat.subscribe((e) => events.push(e));
    cat.ingestSubject("ENGR-UH", buildParserOutput({ courses: [buildCourse()] }));
    expect(events).toHaveLength(1);
    unsub();
    cat.setEdit({ class_number: "20607", field_path: "notes", value: "x" });
    expect(events).toHaveLength(1); // no new events after unsubscribe
  });

  it("multiple subscribers all fire, and one throwing doesn't break others", () => {
    const cat = createCatalog();
    const got = [];
    cat.subscribe(() => { throw new Error("boom"); });
    cat.subscribe((e) => got.push(e.reason));
    cat.subscribe((e) => got.push(e.reason + ":2"));
    cat.ingestSubject("ENGR-UH", buildParserOutput({ courses: [buildCourse()] }));
    expect(got).toEqual(["ingest", "ingest:2"]);
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

describe("createCatalog — plans namespace (Piece 5a)", () => {
  it("seeds a default active plan on construction", () => {
    const cat = createCatalog();
    const plans = cat.plans.list();
    expect(plans).toHaveLength(1);
    expect(plans[0].kind).toBe("active");
    expect(plans[0].name).toBe("My Plan");
    expect(plans[0].sections).toEqual([]);
    expect(plans[0].filters).toEqual([]);
    expect(plans[0].origin).toBe("user");
    expect(cat.plans.getActive().id).toBe(plans[0].id);
  });

  it("create + list + get by id", () => {
    const cat = createCatalog();
    const id = cat.plans.create({ name: "Backup plan", kind: "candidate" });
    expect(cat.plans.list()).toHaveLength(2);
    expect(cat.plans.get(id).name).toBe("Backup plan");
    expect(cat.plans.get(id).kind).toBe("candidate");
    expect(cat.plans.get("no-such")).toBe(null);
  });

  it("creating an active plan demotes the previous active", () => {
    const cat = createCatalog();
    const prevActive = cat.plans.getActive();
    const id = cat.plans.create({ name: "New active", kind: "active" });
    expect(cat.plans.getActive().id).toBe(id);
    expect(cat.plans.get(prevActive.id).kind).toBe("candidate");
  });

  it("promote demotes the previous active and elevates the target", () => {
    const cat = createCatalog();
    const prevActive = cat.plans.getActive();
    const candId = cat.plans.create({ name: "Cand" });
    cat.plans.promote(candId);
    expect(cat.plans.getActive().id).toBe(candId);
    expect(cat.plans.get(prevActive.id).kind).toBe("candidate");
  });

  it("delete refuses the active plan; succeeds on candidates", () => {
    const cat = createCatalog();
    const active = cat.plans.getActive();
    expect(() => cat.plans.delete(active.id)).toThrow(/Cannot delete the active plan/);
    const candId = cat.plans.create({});
    expect(cat.plans.delete(candId)).toBe(true);
    expect(cat.plans.get(candId)).toBe(null);
  });

  it("rename sets a new name and bumps modified_at", () => {
    const cat = createCatalog();
    const active = cat.plans.getActive();
    const before = active.modified_at;
    // Tick time so modified_at moves forward.
    return new Promise((resolve) => setTimeout(() => {
      cat.plans.rename(active.id, "Fall A schedule");
      const after = cat.plans.get(active.id);
      expect(after.name).toBe("Fall A schedule");
      expect(after.modified_at >= before).toBe(true);
      expect(() => cat.plans.rename(active.id, "")).toThrow();
      resolve();
    }, 10));
  });

  it("duplicate creates a candidate copy with same sections/filters", () => {
    const cat = createCatalog();
    const active = cat.plans.getActive();
    cat.plans.stageSection(active.id, { class_number: "20631", subject: "ENGR-UH" });
    cat.plans.addFilter(active.id, { name: "Lunch", days: ["Mon", "Wed"], start_time: "12:00", end_time: "13:00" });
    const dupId = cat.plans.duplicate(active.id);
    const dup = cat.plans.get(dupId);
    expect(dup.kind).toBe("candidate");
    expect(dup.sections).toEqual([{ class_number: "20631", subject: "ENGR-UH" }]);
    expect(dup.filters).toHaveLength(1);
    // Modifying the dup doesn't mutate the source.
    dup.sections.push({ class_number: "99999" });
    expect(cat.plans.get(active.id).sections).toHaveLength(1);
  });

  it("stage / unstage sections (idempotent stage)", () => {
    const cat = createCatalog();
    const active = cat.plans.getActive();
    cat.plans.stageSection(active.id, { class_number: "20631", subject: "ENGR-UH" });
    cat.plans.stageSection(active.id, { class_number: "20631", subject: "ENGR-UH" }); // dup, no-op
    cat.plans.stageSection(active.id, { class_number: "20632", subject: "ENGR-UH" });
    expect(cat.plans.getActive().sections).toHaveLength(2);
    cat.plans.unstageSection(active.id, "20631");
    expect(cat.plans.getActive().sections).toEqual([{ class_number: "20632", subject: "ENGR-UH" }]);
    expect(cat.plans.unstageSection(active.id, "no-such")).toBe(false);
  });

  it("add / update / remove filters", () => {
    const cat = createCatalog();
    const active = cat.plans.getActive();
    const fid = cat.plans.addFilter(active.id, { name: "Gym", days: ["Tue"], visible: true });
    expect(cat.plans.getActive().filters).toHaveLength(1);
    cat.plans.updateFilter(active.id, fid, { name: "Gym & swim", visible: false });
    const f = cat.plans.getActive().filters[0];
    expect(f.name).toBe("Gym & swim");
    expect(f.visible).toBe(false);
    expect(f.id).toBe(fid); // id never reassigned
    cat.plans.removeFilter(active.id, fid);
    expect(cat.plans.getActive().filters).toEqual([]);
  });

  it("clearByOrigin removes only matching plans", () => {
    const cat = createCatalog();
    const userActive = cat.plans.getActive();
    const userCand = cat.plans.create({ name: "Cand", origin: "user" });
    const autoCand = cat.plans.create({ name: "Auto", origin: "auto-scheduler" });
    const removed = cat.plans.clearByOrigin("auto-scheduler");
    expect(removed).toBe(1);
    expect(cat.plans.get(autoCand)).toBe(null);
    expect(cat.plans.get(userCand)).not.toBe(null);
    expect(cat.plans.getActive().id).toBe(userActive.id);
  });

  it("clearByOrigin removing the active plan re-promotes a survivor", () => {
    const cat = createCatalog();
    // Create an auto-scheduler plan as active.
    const autoActive = cat.plans.create({ name: "Auto", kind: "active", origin: "auto-scheduler" });
    cat.plans.clearByOrigin("auto-scheduler");
    // The user's seed plan should be re-promoted.
    const newActive = cat.plans.getActive();
    expect(newActive).not.toBe(null);
    expect(newActive.origin).toBe("user");
  });

  it("plans survive toJSON → fromJSON round-trip", () => {
    const cat1 = createCatalog();
    const active = cat1.plans.getActive();
    cat1.plans.rename(active.id, "Round-trip plan");
    cat1.plans.stageSection(active.id, { class_number: "20631", subject: "ENGR-UH" });
    cat1.plans.addFilter(active.id, { name: "Lunch", days: ["Mon"] });
    const candId = cat1.plans.create({ name: "Cand" });
    const snap = JSON.parse(JSON.stringify(cat1.toJSON()));

    const cat2 = createCatalog();
    cat2.fromJSON(snap);
    expect(cat2.plans.list()).toHaveLength(2);
    const restored = cat2.plans.getActive();
    expect(restored.name).toBe("Round-trip plan");
    expect(restored.sections).toEqual([{ class_number: "20631", subject: "ENGR-UH" }]);
    expect(restored.filters).toHaveLength(1);
    expect(cat2.plans.get(candId).name).toBe("Cand");
  });

  it("subscriber receives plan_mutation events", () => {
    const cat = createCatalog();
    const active = cat.plans.getActive();
    const events = [];
    cat.subscribe((e) => events.push(e));
    cat.plans.stageSection(active.id, { class_number: "20631" });
    cat.plans.rename(active.id, "Renamed");
    const planEvents = events.filter((e) => e.reason === "plan_mutation");
    expect(planEvents.length).toBeGreaterThanOrEqual(2);
    expect(planEvents[0].plan_event).toBe("stage_section");
    expect(planEvents[1].plan_event).toBe("rename");
  });

  it("clear({plans:true}) wipes plans and re-seeds the default", () => {
    const cat = createCatalog();
    cat.plans.create({ name: "Cand1" });
    cat.plans.create({ name: "Cand2" });
    expect(cat.plans.list()).toHaveLength(3);
    cat.clear({ plans: true });
    const after = cat.plans.list();
    expect(after).toHaveLength(1);
    expect(after[0].name).toBe("My Plan");
    expect(after[0].kind).toBe("active");
  });
});

describe("createCatalog — imports namespace (Piece 4)", () => {
  it("addImport stores a pack and surfaces it via listImports", () => {
    const cat = createCatalog();
    const pack = {
      format: "horarium-pack", format_version: 1, schema_version: "1.1.3",
      exported_at: "2026-04-25T10:00:00Z",
      exported_by: { display_name: "Alex", program: "CompE" },
      term: "Fall 2026",
      contents: ["catalog", "edits"],
      data: {
        catalog: {
          "ENGR-UH": { courses: [{ code: "ENGR-UH 1000", sections: [] }] },
        },
        edits: [],
      },
    };
    cat.addImport("alex__2026-04-25", pack);
    const imports = cat.listImports();
    expect(imports).toHaveLength(1);
    expect(imports[0].pack_id).toBe("alex__2026-04-25");
    expect(imports[0].exported_by.display_name).toBe("Alex");
    expect(imports[0].subject_count).toBe(1);
  });

  it("addImport replaces existing pack on duplicate id", () => {
    const cat = createCatalog();
    cat.addImport("p", { exported_at: "1", data: { catalog: {}, edits: [] } });
    cat.addImport("p", { exported_at: "2", data: { catalog: {}, edits: [] } });
    expect(cat.listImports()).toHaveLength(1);
    expect(cat.getImport("p").exported_at).toBe("2");
  });

  it("removeImport drops the pack and returns true; false when missing", () => {
    const cat = createCatalog();
    cat.addImport("p", { exported_at: "1", data: { catalog: {}, edits: [] } });
    expect(cat.removeImport("p")).toBe(true);
    expect(cat.removeImport("missing")).toBe(false);
    expect(cat.listImports()).toEqual([]);
  });

  it("imports survive toJSON → fromJSON round-trip", () => {
    const cat1 = createCatalog();
    cat1.addImport("p", {
      exported_at: "2026-04-25T10:00:00Z",
      exported_by: { display_name: "Alex" },
      data: { catalog: {}, edits: [] },
    });
    const snap = JSON.parse(JSON.stringify(cat1.toJSON()));
    const cat2 = createCatalog();
    cat2.fromJSON(snap);
    expect(cat2.listImports()).toHaveLength(1);
    expect(cat2.getImport("p").exported_by.display_name).toBe("Alex");
  });

  it("clear({imports:true}) wipes only the imports", () => {
    const cat = createCatalog();
    cat.ingestSubject("ENGR-UH", buildParserOutput({
      courses: [buildCourse({ sections: [buildSection()] })],
    }));
    cat.addImport("p", { exported_at: "1", data: { catalog: {}, edits: [] } });
    cat.clear({ imports: true });
    expect(cat.listImports()).toEqual([]);
    expect(cat.getEffective().courses).toHaveLength(1);
  });

  it("copySectionFromImport materializes a section's fields as edits", () => {
    const cat = createCatalog();
    // The section must already exist in parsed for class_number-keyed
    // edits to be meaningful at apply time.
    cat.ingestSubject("ENGR-UH", buildParserOutput({
      courses: [buildCourse({
        sections: [buildSection({ class_number: "20607", section_code: "001" })],
      })],
    }));
    cat.addImport("alex", {
      exported_at: "2026-04-25T10:00:00Z",
      data: {
        catalog: {
          "ENGR-UH": {
            courses: [{
              code: "ENGR-UH 1000", sections: [{
                class_number: "20607",
                section_code: "ALEX-EDITED",
                component: "Lecture",
                session: { code: "AD", start_date: "2026-08-31", end_date: "2026-12-14" },
                status: { type: "open", count: null },
                requires_consent: false,
                meetings: [],
                notes: "From Alex",
              }],
            }],
          },
        },
        edits: [],
      },
    });
    const n = cat.copySectionFromImport("alex", "20607");
    expect(n).toBeGreaterThan(0);
    const eff = cat.getEffective();
    const sec = eff.courses[0].sections.find((s) => s.class_number === "20607");
    expect(sec.section_code).toBe("ALEX-EDITED");
    expect(sec.notes).toBe("From Alex");
  });

  it("copySectionFromImport returns 0 for unknown pack or class_number", () => {
    const cat = createCatalog();
    expect(cat.copySectionFromImport("nope", "20607")).toBe(0);
  });
});

describe("createCatalog — clearEdits()", () => {
  it("wipes all edits, leaves parsed data intact, fires one notify", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({
        courses: [
          buildCourse({ sections: [buildSection({ class_number: "20607" })] }),
        ],
      }),
    );
    cat.setEdit({ class_number: "20607", field_path: "section_code", value: "X" });
    cat.setEdit({ class_number: "20607", field_path: "instruction_mode", value: "Hybrid" });
    expect(cat.listEdits().edits).toHaveLength(2);

    const events = [];
    cat.subscribe((e) => events.push(e));
    cat.clearEdits();
    expect(cat.listEdits().edits).toHaveLength(0);
    // Parsed data still there.
    const eff = cat.getEffective();
    expect(eff.courses).toHaveLength(1);
    expect(eff.courses[0].sections[0].class_number).toBe("20607");
    // One mutation event for the clear, not two-per-edit.
    const clearEvents = events.filter((e) => e.reason === "clear");
    expect(clearEvents).toHaveLength(1);
    expect(clearEvents[0].edits).toBe(true);
    expect(clearEvents[0].parsed).toBe(false);
  });
});

describe("createCatalog — pub/sub fires on setEdit so Browse auto-refreshes", () => {
  it("a subscriber called after setEdit sees the edit reflected in getEffective", () => {
    const cat = createCatalog();
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({
        courses: [
          buildCourse({
            code: "ENGR-UH 1000",
            sections: [buildSection({ class_number: "20607" })],
          }),
        ],
      }),
    );
    const events = [];
    cat.subscribe((e) => {
      events.push(e);
    });
    cat.setEdit({
      class_number: "20607",
      field_path: "meetings[0].room",
      value: "NEW ROOM",
    });
    // The subscriber fired and the effective view reflects the edit.
    expect(events.some((e) => e.reason === "setEdit")).toBe(true);
    const eff = cat.getEffective();
    const sec = eff.courses[0].sections[0];
    expect(sec.meetings[0].room).toBe("NEW ROOM");
  });
});

describe("createCatalog — _raw_paste_block provenance field", () => {
  it("survives ingest → toJSON → fromJSON round-trip unchanged", () => {
    const cat = createCatalog();
    const RAW = "ENGR-UH 1000 | 4 units\nClass#: 20607\nSession: AD\n(etc)";
    cat.ingestSubject(
      "ENGR-UH",
      buildParserOutput({
        courses: [
          buildCourse({
            sections: [buildSection({ _raw_paste_block: RAW })],
          }),
        ],
      }),
    );
    const eff1 = cat.getEffective();
    expect(eff1.courses[0].sections[0]._raw_paste_block).toBe(RAW);

    const snapshot = JSON.parse(JSON.stringify(cat.toJSON()));
    const cat2 = createCatalog();
    cat2.fromJSON(snapshot);
    const eff2 = cat2.getEffective();
    expect(eff2.courses[0].sections[0]._raw_paste_block).toBe(RAW);
  });

  it("is not user-editable: setEdit on section _raw_paste_block throws", () => {
    const cat = createCatalog();
    expect(() =>
      cat.setEdit({
        class_number: "20607",
        field_path: "_raw_paste_block",
        value: "tampered",
      }),
    ).toThrow(/Invalid section field_path/);
  });

  it("is not user-editable: setEdit on meetings[0]._raw_paste_block throws", () => {
    const cat = createCatalog();
    expect(() =>
      cat.setEdit({
        class_number: "20607",
        field_path: "meetings[0]._raw_paste_block",
        value: "tampered",
      }),
    ).toThrow(/Invalid section field_path/);
  });
});
