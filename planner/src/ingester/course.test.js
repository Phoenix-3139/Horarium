import { describe, it, expect } from "vitest";
import { parseCourse } from "./course.js";

// Helper to assemble a canonical section block without repeating the
// 10-ish field lines in every test. `extra` is injected verbatim between
// the "Component:" line and the meeting line.
function sectionBlock({
  code,
  units = "4 units",
  classNum,
  session,
  sectionCode,
  requiresConsent = false,
  status = "Open",
  grading = "Ugrd Abu Dhabi Graded",
  mode = "In-Person",
  location = "Abu Dhabi",
  component = "Lecture",
  meeting,
  notes = null,
}) {
  const consentLine = requiresConsent ? "Requires Department Consent\n" : "";
  const meetingLine = meeting === null ? "" : `\n${meeting}\n`;
  const notesBlock = notes ? `Notes: ${notes}\n` : "";
  return (
    `${code} | ${units}\n` +
    `Class#: ${classNum}\n` +
    `Session: ${session}\n` +
    `Section: ${sectionCode}\n` +
    consentLine +
    `Class Status: ${status}\n` +
    `Grading: ${grading}\n` +
    `Instruction Mode: ${mode}\n` +
    `Course Location: ${location}\n` +
    `Component: ${component}\n` +
    meetingLine +
    notesBlock +
    `Visit the Bookstore\n` +
    `Select Class #${classNum}\n`
  );
}

function courseBlock({ header, description, sections }) {
  return (
    `${header}\n` +
    `\n` +
    (description === null ? "" : `${description}\n\n`) +
    `School:\n` +
    `NYU Abu Dhabi\n` +
    `Term:\n` +
    `Fall 2026\n` +
    sections.join("")
  );
}

describe("parseCourse — happy path ENGR-UH 1000", () => {
  it("parses 5 sections (Lec + 4 Labs) with clean warnings and exact structure", () => {
    const blockText = courseBlock({
      header: "ENGR-UH 1000 Computer Programming for Engineers",
      description:
        "The objective of the course is for students to acquire the fundamental knowledge of computer programming... more description for ENGR-UH 1000 »",
      sections: [
        sectionBlock({
          code: "ENGR-UH 1000",
          classNum: "20607",
          session: "AD 08/31/2026 - 12/14/2026",
          sectionCode: "001",
          component: "Lecture",
          meeting:
            "08/31/2026 - 12/14/2026 Mon,Wed 5.00 PM - 6.15 PM at West Administration Room 001",
        }),
        sectionBlock({
          code: "ENGR-UH 1000",
          classNum: "20609",
          session: "AD 08/31/2026 - 12/14/2026",
          sectionCode: "LAB1",
          component: "Laboratory",
          meeting:
            "08/31/2026 - 12/14/2026 Wed 11.20 AM - 2.00 PM at A1 Building Room 002 with Negoiu, Elena",
        }),
        sectionBlock({
          code: "ENGR-UH 1000",
          classNum: "20608",
          session: "AD 08/31/2026 - 12/14/2026",
          sectionCode: "LAB2",
          component: "Laboratory",
          meeting:
            "08/31/2026 - 12/14/2026 Tue 3.20 PM - 6.00 PM at A1 Building Room 002 with Melouk, Mouad",
        }),
        sectionBlock({
          code: "ENGR-UH 1000",
          classNum: "20610",
          session: "AD 08/31/2026 - 12/14/2026",
          sectionCode: "LAB3",
          component: "Laboratory",
          meeting:
            "08/31/2026 - 12/14/2026 Thu 3.20 PM - 6.00 PM at A1 Building Room 002 with Negoiu, Elena",
        }),
        sectionBlock({
          code: "ENGR-UH 1000",
          classNum: "20611",
          session: "AD 08/31/2026 - 12/14/2026",
          sectionCode: "LAB4",
          component: "Laboratory",
          meeting:
            "08/31/2026 - 12/14/2026 Fri 2.20 PM - 5.00 PM at A1 Building Room 002 with Melouk, Mouad",
        }),
      ],
    });

    const { course, warnings, unparsed_lines } = parseCourse(blockText);
    expect(warnings).toEqual([]);
    expect(unparsed_lines).toEqual([]);
    expect(course.code).toBe("ENGR-UH 1000");
    expect(course.subject).toBe("ENGR-UH");
    expect(course.catalog_number).toBe("1000");
    expect(course.title).toBe("Computer Programming for Engineers");
    expect(course.title_flags).toEqual([]);
    expect(course.school).toBe("NYU Abu Dhabi");
    expect(course.units).toBe(4);
    expect(course.description_truncated).toBe(true);
    expect(course.description).toMatch(/^The objective of the course/);
    expect(course.description.endsWith("...")).toBe(true);
    expect(course.description).not.toMatch(/more description for/);

    expect(course.sections).toHaveLength(5);
    expect(course.sections.map((s) => s.class_number)).toEqual([
      "20607",
      "20609",
      "20608",
      "20610",
      "20611",
    ]);
    expect(course.sections[0].section_code).toBe("001");
    expect(course.sections[0].component).toBe("Lecture");
    expect(course.sections[0].meetings[0].room_number).toBe("001");
    expect(course.sections[1].section_code).toBe("LAB1");
    expect(course.sections[1].meetings[0].instructors).toEqual(["Negoiu, Elena"]);
    expect(course.sections[4].meetings[0].days).toEqual(["Fri"]);
  });
});

describe("parseCourse — description truncation", () => {
  it("strips the 'more description for <CODE> »' trailer and sets description_truncated", () => {
    const block = courseBlock({
      header: "ENGR-UH 2010 Probability and Statistics for Engineers",
      description:
        "Introductory course in probability and statistics... NOTE: This course may be rep... more description for ENGR-UH 2010 »",
      sections: [
        sectionBlock({
          code: "ENGR-UH 2010",
          units: "2 units",
          classNum: "20668",
          session: "A71 08/31/2026 - 10/16/2026",
          sectionCode: "001",
          component: "Lecture",
          meeting:
            "08/31/2026 - 10/16/2026 Mon,Wed 9.55 AM - 11.10 AM at Social Sciences Room 018 with Jabari, Saif Eddin Ghazi",
        }),
      ],
    });
    const { course, warnings } = parseCourse(block);
    expect(course.description_truncated).toBe(true);
    expect(course.description).toMatch(/^Introductory course in probability/);
    expect(course.description.endsWith("...")).toBe(true);
    expect(course.description).not.toMatch(/more description for/);
    expect(course.description).not.toMatch(/»/);
    expect(warnings).toEqual([]);
  });

  it("preserves a full description unchanged when no trailer is present", () => {
    const block = courseBlock({
      header: "ENGR-UH 2017 Digital Logic Design",
      description:
        "This course covers the design of combinational and sequential digital circuits. It is a fully published description with no truncation.",
      sections: [
        sectionBlock({
          code: "ENGR-UH 2017",
          classNum: "20721",
          session: "A71 08/31/2026 - 10/16/2026",
          sectionCode: "001",
          component: "Lecture",
          meeting:
            "08/31/2026 - 10/16/2026 Mon,Wed 2.10 PM - 3.25 PM at East Administration Building Room 003 with Faculty, Member",
        }),
      ],
    });
    const { course, warnings } = parseCourse(block);
    expect(course.description_truncated).toBe(false);
    expect(course.description).toBe(
      "This course covers the design of combinational and sequential digital circuits. It is a fully published description with no truncation.",
    );
    expect(warnings).toEqual([]);
  });
});

describe("parseCourse — WO title flag", () => {
  it("strips 'WO ' from the title and records it in title_flags", () => {
    const block = courseBlock({
      header: "PHYED-UH 1068 WO Foundations of Middle Eastern Dance",
      description: "Women-only physical education class covering fundamentals of the form.",
      sections: [
        sectionBlock({
          code: "PHYED-UH 1068",
          units: "0 units",
          classNum: "20401",
          session: "A71 08/31/2026 - 10/16/2026",
          sectionCode: "001",
          component: "Studio",
          grading: "Pass/Fail",
          meeting:
            "08/31/2026 - 10/16/2026 Tue,Thu 6.00 PM - 7.15 PM at Campus Center Room DANCE STUD with Instructor, Name",
        }),
      ],
    });
    const { course, warnings } = parseCourse(block);
    expect(course.title).toBe("Foundations of Middle Eastern Dance");
    expect(course.title_flags).toEqual(["WO"]);
    expect(warnings).toEqual([]);
  });
});

describe("parseCourse — unit range (variable credit)", () => {
  it("emits units as { min, max } when the header is 'N - M units'", () => {
    const block = courseBlock({
      header: "ENGR-UH 4560 Independent Study",
      description: "Variable-credit independent study.",
      sections: [
        sectionBlock({
          code: "ENGR-UH 4560",
          units: "2 - 4 units",
          classNum: "20800",
          session: "AD 08/31/2026 - 12/14/2026",
          sectionCode: "001",
          component: "Independent Study",
          meeting:
            "08/31/2026 - 12/14/2026 Fri 2.00 PM - 3.15 PM at Engineering Building Room 101 with Adviser, Faculty",
        }),
      ],
    });
    const { course, warnings } = parseCourse(block);
    expect(course.units).toEqual({ min: 2, max: 4 });
    expect(warnings).toEqual([]);
  });
});

describe("parseCourse — duplicate sections in source", () => {
  it("dedupes identical duplicate section blocks silently", () => {
    // ENGR-UH 1801: 20700 and 20701 each appear twice in the real paste.
    const s1 = sectionBlock({
      code: "ENGR-UH 1801",
      units: "2 units",
      classNum: "20700",
      session: "A71 08/31/2026 - 10/16/2026",
      sectionCode: "001",
      component: "Seminar",
      meeting:
        "08/31/2026 - 10/16/2026 Mon,Wed 12.45 PM - 2.00 PM at Social Sciences Room 005 with Zam, Azhar",
    });
    const s2 = sectionBlock({
      code: "ENGR-UH 1801",
      units: "2 units",
      classNum: "20701",
      session: "A71 08/31/2026 - 10/16/2026",
      sectionCode: "LAB",
      component: "Laboratory",
      meeting:
        "08/31/2026 - 10/16/2026 Fri 2.20 PM - 5.00 PM at Social Sciences Room 018 with Zam, Azhar; Sabah, Shafiya",
    });
    const block = courseBlock({
      header: "ENGR-UH 1801 Bioengineering Principles",
      description: "Introductory bioengineering... more description for ENGR-UH 1801 »",
      sections: [s1, s2, s1, s2], // each duplicated
    });
    const { course, warnings } = parseCourse(block);
    expect(course.sections).toHaveLength(2);
    expect(course.sections.map((s) => s.class_number)).toEqual(["20700", "20701"]);
    // Zero duplicate_disagreement warnings — they are pure copies.
    const disagreements = warnings.filter((w) => w.type === "duplicate_disagreement");
    expect(disagreements).toEqual([]);
  });
});

describe("parseCourse — A71 + A72 sessions in one course", () => {
  it("keeps both sessions in sections[] with correct session codes", () => {
    const block = courseBlock({
      header: "ENGR-UH 2010 Probability and Statistics for Engineers",
      description: "Stats intro.",
      sections: [
        sectionBlock({
          code: "ENGR-UH 2010",
          units: "2 units",
          classNum: "20668",
          session: "A71 08/31/2026 - 10/16/2026",
          sectionCode: "001",
          component: "Lecture",
          meeting:
            "08/31/2026 - 10/16/2026 Mon,Wed 9.55 AM - 11.10 AM at Social Sciences Room 018 with Jabari, Saif Eddin Ghazi",
        }),
        sectionBlock({
          code: "ENGR-UH 2010",
          units: "2 units",
          classNum: "20670",
          session: "A72 10/26/2026 - 12/14/2026",
          sectionCode: "002",
          component: "Lecture",
          meeting:
            "10/26/2026 - 12/14/2026 Tue,Thu 9.55 AM - 11.10 AM at Social Sciences Room 018 with Nadeem, Qurrat-Ul-Ain",
        }),
      ],
    });
    const { course, warnings } = parseCourse(block);
    expect(warnings).toEqual([]);
    expect(course.sections).toHaveLength(2);
    expect(course.sections[0].session.code).toBe("A71");
    expect(course.sections[1].session.code).toBe("A72");
    expect(course.sections[0].session.end_date).toBe("2026-10-16");
    expect(course.sections[1].session.start_date).toBe("2026-10-26");
  });
});

describe("parseCourse — section-level unit mismatch bubbles up", () => {
  it("surfaces parseSection's units_mismatch warning in the aggregated output", () => {
    // Course header says "| 4 units". Section restates "| 3 units".
    const s = sectionBlock({
      code: "ENGR-UH 9999",
      units: "3 units", // disagrees with the course's 4
      classNum: "29999",
      session: "AD 08/31/2026 - 12/14/2026",
      sectionCode: "001",
      component: "Lecture",
      meeting:
        "08/31/2026 - 12/14/2026 Mon 9.55 AM - 11.10 AM at Social Sciences Room 018 with Doe, Jane",
    });
    const block = courseBlock({
      header: "ENGR-UH 9999 Experimental",
      description: "A course with mismatched units across its sections.",
      sections: [
        sectionBlock({
          // provides the course-level "| 4 units" anchor for parseCourse
          code: "ENGR-UH 9999",
          units: "4 units",
          classNum: "29900",
          session: "AD 08/31/2026 - 12/14/2026",
          sectionCode: "000",
          component: "Lecture",
          meeting:
            "08/31/2026 - 12/14/2026 Tue 9.55 AM - 11.10 AM at Social Sciences Room 018 with Doe, Jane",
        }),
        s,
      ],
    });

    const { course, warnings } = parseCourse(block);
    expect(course.units).toBe(4);
    const mismatches = warnings.filter((w) => w.type === "units_mismatch");
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].class_number).toBe("29999");
    expect(mismatches[0].course_code).toBe("ENGR-UH 9999");
    expect(mismatches[0].course_units).toBe(4);
    expect(mismatches[0].section_units).toBe(3);
  });
});

describe("parseCourse — cancelled section mixed with active sections", () => {
  it("parses active sections normally and produces meetings: [] for the cancelled one", () => {
    const block = courseBlock({
      header: "PHYED-UH 1006 Swimming",
      description: "Basic swimming skills and conditioning.",
      sections: [
        sectionBlock({
          code: "PHYED-UH 1006",
          units: "0 units",
          classNum: "20900",
          session: "A71 08/31/2026 - 10/16/2026",
          sectionCode: "001",
          component: "Studio",
          status: "Cancelled",
          grading: "Pass/Fail",
          meeting: "08/31/2026 - 10/16/2026 No Room Required",
        }),
        sectionBlock({
          code: "PHYED-UH 1006",
          units: "0 units",
          classNum: "20901",
          session: "A72 10/26/2026 - 12/14/2026",
          sectionCode: "002",
          component: "Studio",
          grading: "Pass/Fail",
          meeting:
            "10/26/2026 - 12/14/2026 Mon,Wed 7.00 AM - 8.15 AM at Campus Center Room POOL with Coach, Swim",
        }),
      ],
    });
    const { course, warnings } = parseCourse(block);
    expect(warnings).toEqual([]);
    expect(course.sections).toHaveLength(2);
    expect(course.sections[0].status.type).toBe("cancelled");
    expect(course.sections[0].meetings).toEqual([]);
    expect(course.sections[1].status.type).toBe("open");
    expect(course.sections[1].meetings).toHaveLength(1);
    expect(course.sections[1].meetings[0].room_number).toBe("POOL");
  });
});

describe("parseCourse — catalog-number suffix classes", () => {
  // One row per distinct suffix class from docs/NOMENCLATURE.md Section 2.
  // Verifies the header regex accepts each shape cleanly (empty suffix + 1-2
  // trailing uppercase letters) and preserves the catalog_number verbatim —
  // no normalization, no padding, no stripping. The parser is suffix-
  // agnostic by design; this test pins that.
  const cases = [
    { suffix: "(none)", subject: "ENGR-UH", catnum: "2010" },
    { suffix: "X",      subject: "ACS-UH",  catnum: "1010X" },
    { suffix: "J",      subject: "CCOL-UH", catnum: "2002J" },
    { suffix: "Q",      subject: "CCOL-UH", catnum: "1015Q" },
    { suffix: "G",      subject: "CS-UY",   catnum: "1134G" },
    { suffix: "W",      subject: "CAM-UY",  catnum: "2014W" },
    { suffix: "T",      subject: "BUSF-SHU", catnum: "209T" },
    { suffix: "A",      subject: "ART-SHU", catnum: "225A" },
    { suffix: "E",      subject: "CADT-UH", catnum: "1016E" },
    { suffix: "S",      subject: "CHIN-SHU", catnum: "101S" },
    { suffix: "L",      subject: "DHYG1-UD", catnum: "114L" },
    { suffix: "B",      subject: "ART-SHU", catnum: "225B" },
    { suffix: "D",      subject: "BUSF-SHU", catnum: "200D" },
    { suffix: "C",      subject: "SCIEN-UH", catnum: "1124C" },
    { suffix: "F",      subject: "BUSF-SHU", catnum: "200F" },
    { suffix: "P",      subject: "SCIEN-UH", catnum: "1124P" },
    { suffix: "H",      subject: "EAP-SHU", catnum: "100H" },
    { suffix: "I",      subject: "EAP-SHU", catnum: "100I" },
    { suffix: "K",      subject: "EAP-SHU", catnum: "100K" },
    { suffix: "M",      subject: "EAP-SHU", catnum: "100M" },
    { suffix: "N",      subject: "EAP-SHU", catnum: "100N" },
    { suffix: "R",      subject: "EAP-SHU", catnum: "100R" },
    { suffix: "U",      subject: "EAP-SHU", catnum: "100U" },
    { suffix: "V",      subject: "EAP-SHU", catnum: "100V" },
    { suffix: "Y",      subject: "EAP-SHU", catnum: "100Y" },
    { suffix: "EQ",     subject: "CADT-UH", catnum: "1008EQ" },
    { suffix: "AQ",     subject: "MATH-UH", catnum: "1000AQ" },
    { suffix: "BQ",     subject: "MATH-UH", catnum: "1000BQ" },
    { suffix: "BE",     subject: "SCIEN-UH", catnum: "1344BE" },
    { suffix: "CE",     subject: "SCIEN-UH", catnum: "1344CE" },
    { suffix: "EJ",     subject: "CCOL-UH", catnum: "2001EJ" },
    { suffix: "EP",     subject: "SCIEN-UH", catnum: "1564EP" },
    { suffix: "GX",     subject: "CSTS-UH", catnum: "1059GX" },
    { suffix: "JX",     subject: "CCOL-UH", catnum: "2045JX" },
    { suffix: "XG",     subject: "CP-UY",   catnum: "200XG" },
  ];

  it.each(cases)(
    "parses catalog number with suffix $suffix ($subject $catnum) verbatim",
    ({ subject, catnum }) => {
      const code = `${subject} ${catnum}`;
      const block = courseBlock({
        header: `${code} Test Course`,
        description: "Test description for suffix coverage.",
        sections: [
          sectionBlock({
            code,
            units: "4 units",
            classNum: "30000",
            session: "AD 08/31/2026 - 12/14/2026",
            sectionCode: "001",
            component: "Lecture",
            meeting:
              "08/31/2026 - 12/14/2026 Mon 9.55 AM - 11.10 AM at Social Sciences Room 018 with Doe, Jane",
          }),
        ],
      });
      const { course, warnings } = parseCourse(block);
      expect(course).not.toBe(null);
      expect(course.code).toBe(code);
      expect(course.subject).toBe(subject);
      expect(course.catalog_number).toBe(catnum); // verbatim — no stripping
      // No unknown_subject_suffix warning — all subjects in the table are in
      // the 685-entry allowlist.
      const suffixWarn = warnings.filter((w) => w.type === "unknown_subject_suffix");
      expect(suffixWarn).toEqual([]);
      // The test course has exactly one valid section, so no course-structure warnings.
      expect(course.sections).toHaveLength(1);
      expect(course.sections[0].class_number).toBe("30000");
    },
  );
});

describe('parseCourse — "No Classes Scheduled" suppresses no_sections', () => {
  it("sets no_sections_offered:true and emits zero warnings when the marker is present", () => {
    // Minimal course block with the marker, zero section blocks. Simulates
    // the bulletin state for a course that exists but isn't offered this term.
    const block =
      `ENGR-UH 9000 Special Topics (unoffered this term)\n` +
      `\n` +
      `This course is in the catalog but not running this term.\n` +
      `\n` +
      `School:\n` +
      `NYU Abu Dhabi\n` +
      `Term:\n` +
      `Fall 2026\n` +
      `No Classes Scheduled for the Terms Offered\n`;
    const { course, warnings } = parseCourse(block);
    expect(course.no_sections_offered).toBe(true);
    expect(course.has_topics).toBe(false);
    expect(course.sections).toEqual([]);
    const noSecWarnings = warnings.filter((w) => w.type === "no_sections");
    expect(noSecWarnings).toEqual([]);
  });

  it("still emits no_sections when neither marker nor sections are present", () => {
    // Preserves the existing behavior for genuinely-broken blocks.
    const block =
      `ENGR-UH 9001 Another course\n` +
      `\n` +
      `Description.\n` +
      `\n` +
      `School:\n` +
      `NYU Abu Dhabi\n` +
      `Term:\n` +
      `Fall 2026\n`;
    const { course, warnings } = parseCourse(block);
    expect(course.no_sections_offered).toBe(false);
    expect(course.sections).toEqual([]);
    const noSecWarnings = warnings.filter((w) => w.type === "no_sections");
    expect(noSecWarnings).toHaveLength(1);
  });
});

describe("parseCourse — topics courses", () => {
  // Build a section block where the units line uses the enclosing course code.
  function topicSection(classNum, sectionCode) {
    return (
      `CS-UY 3943 | 3 units\n` +
      `Class#: ${classNum}\n` +
      `Session: 1 08/31/2026 - 12/14/2026\n` +
      `Section: ${sectionCode}\n` +
      `Class Status: Open\n` +
      `Grading: Ugrd Tandon Graded\n` +
      `Instruction Mode: In-Person\n` +
      `Course Location: Brooklyn\n` +
      `Component: Lecture\n` +
      `\n` +
      `08/31/2026 - 12/14/2026 Mon,Wed 9.00 AM - 10.30 AM at Tandon Rogers Hall Room 311 with Doe, Jane\n` +
      `\n` +
      `Visit the Bookstore\n` +
      `Select Class #${classNum}\n`
    );
  }

  it("captures Topic lines, attaches each to its following section, and sets has_topics:true", () => {
    const block =
      `CS-UY 3943 Special Topics in Computer Science\n` +
      `\n` +
      `Rotating-topic seminar covering advanced CS subjects.\n` +
      `\n` +
      `School:\n` +
      `Tandon School of Engineering\n` +
      `Term:\n` +
      `Fall 2026\n` +
      `Topic: Graph Neural Networks\n` +
      topicSection("15001", "A") +
      `Topic: Differential Privacy\n` +
      topicSection("15002", "B") +
      `Topic: Compilers\n` +
      topicSection("15003", "C") +
      `Topic: Verified Software\n` +
      topicSection("15004", "D");

    const { course, warnings, unparsed_lines } = parseCourse(block);
    expect(course.code).toBe("CS-UY 3943");
    expect(course.has_topics).toBe(true);
    expect(course.no_sections_offered).toBe(false);
    expect(course.sections).toHaveLength(4);
    expect(course.sections.map((s) => s.topic)).toEqual([
      "Graph Neural Networks",
      "Differential Privacy",
      "Compilers",
      "Verified Software",
    ]);
    // All four sections share one course.code / title.
    const codes = new Set(course.sections.map((s) => s.class_number));
    expect(codes.size).toBe(4);
    // No topic-related unparsed lines — Topic: prefixes are consumed upstream.
    const topicishUnparsed = unparsed_lines.filter((u) =>
      /^Topic:/.test(u.text),
    );
    expect(topicishUnparsed).toEqual([]);
  });

  it("leaves section.topic as null and course.has_topics as false when the block has no Topic lines", () => {
    const block =
      `ENGR-UH 2011 Statics\n` +
      `\n` +
      `Intro statics.\n` +
      `\n` +
      `School:\n` +
      `NYU Abu Dhabi\n` +
      `Term:\n` +
      `Fall 2026\n` +
      sectionBlock({
        code: "ENGR-UH 2011",
        classNum: "20612",
        session: "A71 08/31/2026 - 10/16/2026",
        sectionCode: "001",
        component: "Lecture",
        meeting:
          "08/31/2026 - 10/16/2026 Mon,Wed 9.55 AM - 11.10 AM at East Administration Building Room 003 with Sousa, Rita Leal",
      });
    const { course } = parseCourse(block);
    expect(course.has_topics).toBe(false);
    expect(course.sections[0].topic).toBe(null);
  });
});

describe("parseCourse — unknown subject suffix", () => {
  it("parses the course anyway and warns about the unknown suffix", () => {
    const block = courseBlock({
      header: "FAKE-ZZ 1000 Test Course",
      description: "Synthetic course for testing the suffix allowlist.",
      sections: [
        sectionBlock({
          code: "FAKE-ZZ 1000",
          classNum: "29000",
          session: "AD 08/31/2026 - 12/14/2026",
          sectionCode: "001",
          component: "Lecture",
          meeting:
            "08/31/2026 - 12/14/2026 Mon 9.55 AM - 11.10 AM at Social Sciences Room 018 with Doe, Jane",
        }),
      ],
    });
    const { course, warnings } = parseCourse(block);
    expect(course.subject).toBe("FAKE-ZZ");
    expect(course.catalog_number).toBe("1000");
    expect(course.title).toBe("Test Course");
    expect(course.sections).toHaveLength(1);
    const suffixWarnings = warnings.filter((w) => w.type === "unknown_subject_suffix");
    expect(suffixWarnings).toHaveLength(1);
    expect(suffixWarnings[0].subject).toBe("FAKE-ZZ");
    expect(suffixWarnings[0].course_code).toBe("FAKE-ZZ 1000");
  });
});

describe("parseCourse — missing description", () => {
  it("sets description: null and emits missing_description when no text precedes 'School:'", () => {
    const block =
      `ENGR-UH 3999 Ghost Course\n` +
      `\n` +
      `School:\n` +
      `NYU Abu Dhabi\n` +
      `Term:\n` +
      `Fall 2026\n` +
      sectionBlock({
        code: "ENGR-UH 3999",
        classNum: "28000",
        session: "AD 08/31/2026 - 12/14/2026",
        sectionCode: "001",
        component: "Lecture",
        meeting:
          "08/31/2026 - 12/14/2026 Mon 9.55 AM - 11.10 AM at Social Sciences Room 018 with Doe, Jane",
      });
    const { course, warnings } = parseCourse(block);
    expect(course.description).toBe(null);
    expect(course.description_truncated).toBe(false);
    const missing = warnings.filter((w) => w.type === "missing_description");
    expect(missing).toHaveLength(1);
    expect(missing[0].course_code).toBe("ENGR-UH 3999");
  });
});

describe("parseCourse — duplicate disagreement", () => {
  it("recurses to leaf paths and emits one warning per disagreeing primitive", () => {
    // Same class_number, same section_code, different room in the meeting line.
    // The two meetings only differ on the room string, which splits into three
    // leaf fields (room / building / room_number), so we expect three warnings.
    const first = sectionBlock({
      code: "ENGR-UH 1000",
      classNum: "20607",
      session: "AD 08/31/2026 - 12/14/2026",
      sectionCode: "001",
      component: "Lecture",
      meeting:
        "08/31/2026 - 12/14/2026 Mon,Wed 5.00 PM - 6.15 PM at West Administration Room 001",
    });
    const second = sectionBlock({
      code: "ENGR-UH 1000",
      classNum: "20607",
      session: "AD 08/31/2026 - 12/14/2026",
      sectionCode: "001",
      component: "Lecture",
      meeting:
        "08/31/2026 - 12/14/2026 Mon,Wed 5.00 PM - 6.15 PM at East Administration Building Room 200",
    });
    const block = courseBlock({
      header: "ENGR-UH 1000 Computer Programming for Engineers",
      description: "Short description.",
      sections: [first, second],
    });
    const { course, warnings } = parseCourse(block);
    expect(course.sections).toHaveLength(1);
    expect(course.sections[0].meetings[0].room).toBe("West Administration Room 001");

    const disagreements = warnings.filter((w) => w.type === "duplicate_disagreement");
    const byPath = Object.fromEntries(disagreements.map((w) => [w.field, w]));
    expect(Object.keys(byPath).sort()).toEqual([
      "meetings[0].building",
      "meetings[0].room",
      "meetings[0].room_number",
    ]);
    expect(byPath["meetings[0].room"].values).toEqual([
      "West Administration Room 001",
      "East Administration Building Room 200",
    ]);
    expect(byPath["meetings[0].building"].values).toEqual([
      "West Administration",
      "East Administration Building",
    ]);
    expect(byPath["meetings[0].room_number"].values).toEqual(["001", "200"]);
    for (const w of disagreements) {
      expect(w.class_number).toBe("20607");
      expect(w.message).toMatch(/20607/);
      expect(w.message).toMatch(w.field);
    }
  });

  it("emits a separate warning per leaf when disagreements span multiple fields", () => {
    // Differ on: status (Wait List (5) vs Open), room_number, and instructors list.
    const first = sectionBlock({
      code: "ENGR-UH 1000",
      classNum: "20700",
      session: "A71 08/31/2026 - 10/16/2026",
      sectionCode: "001",
      component: "Lecture",
      status: "Wait List (5)",
      meeting:
        "08/31/2026 - 10/16/2026 Mon 9.55 AM - 11.10 AM at Social Sciences Room 018 with Alpha, A",
    });
    const second = sectionBlock({
      code: "ENGR-UH 1000",
      classNum: "20700",
      session: "A71 08/31/2026 - 10/16/2026",
      sectionCode: "001",
      component: "Lecture",
      status: "Open",
      meeting:
        "08/31/2026 - 10/16/2026 Mon 9.55 AM - 11.10 AM at Social Sciences Room 020 with Beta, B",
    });
    const block = courseBlock({
      header: "ENGR-UH 1000 Computer Programming for Engineers",
      description: "Short description.",
      sections: [first, second],
    });
    const { course, warnings } = parseCourse(block);
    expect(course.sections).toHaveLength(1);

    const disagreements = warnings.filter((w) => w.type === "duplicate_disagreement");
    const paths = disagreements.map((w) => w.field).sort();
    expect(paths).toContain("status.raw");
    expect(paths).toContain("status.type");
    expect(paths).toContain("status.count");
    expect(paths).toContain("meetings[0].room");
    expect(paths).toContain("meetings[0].room_number");
    // instructors is an array of one string that differs → leaf path includes index
    expect(paths).toContain("meetings[0].instructors[0]");

    // Spot-check the values payload:
    const statusRaw = disagreements.find((w) => w.field === "status.raw");
    expect(statusRaw.values).toEqual(["Wait List (5)", "Open"]);
    const count = disagreements.find((w) => w.field === "status.count");
    expect(count.values).toEqual([5, null]);
    const instructor = disagreements.find(
      (w) => w.field === "meetings[0].instructors[0]",
    );
    expect(instructor.values).toEqual(["Alpha, A", "Beta, B"]);
  });

  it("surfaces array length mismatches at '<path>.length'", () => {
    // One meeting vs two meetings on the same class_number.
    const oneMeeting = sectionBlock({
      code: "ENGR-UH 1000",
      classNum: "20800",
      session: "A71 08/31/2026 - 10/16/2026",
      sectionCode: "001",
      component: "Lecture",
      meeting:
        "08/31/2026 - 10/16/2026 Mon 9.55 AM - 11.10 AM at Social Sciences Room 018 with Alpha, A",
    });
    const twoMeetings =
      `ENGR-UH 1000 | 4 units\n` +
      `Class#: 20800\n` +
      `Session: A71 08/31/2026 - 10/16/2026\n` +
      `Section: 001\n` +
      `Class Status: Open\n` +
      `Grading: Ugrd Abu Dhabi Graded\n` +
      `Instruction Mode: In-Person\n` +
      `Course Location: Abu Dhabi\n` +
      `Component: Lecture\n` +
      `\n` +
      `08/31/2026 - 10/16/2026 Mon 9.55 AM - 11.10 AM at Social Sciences Room 018 with Alpha, A\n` +
      `08/31/2026 - 10/16/2026 Fri 9.55 AM - 11.10 AM at Social Sciences Room 018 with Alpha, A\n` +
      `\n` +
      `Visit the Bookstore\n` +
      `Select Class #20800\n`;
    const block = courseBlock({
      header: "ENGR-UH 1000 Computer Programming for Engineers",
      description: "Short description.",
      sections: [oneMeeting, twoMeetings],
    });
    const { warnings } = parseCourse(block);
    const lengthWarning = warnings.find(
      (w) => w.type === "duplicate_disagreement" && w.field === "meetings.length",
    );
    expect(lengthWarning).toBeDefined();
    expect(lengthWarning.values).toEqual([1, 2]);
  });
});

describe("parseCourse — _raw_paste_block provenance", () => {
  it("every section carries a _raw_paste_block equal to its source slice", () => {
    const sec1 = sectionBlock({
      code: "ENGR-UH 1000",
      classNum: "20800",
      session: "A71 08/31/2026 - 10/16/2026",
      sectionCode: "001",
      meeting: "08/31/2026 - 10/16/2026 Mon 9.55 AM - 11.10 AM at SS 018 with A, A",
    });
    const sec2 = sectionBlock({
      code: "ENGR-UH 1000",
      classNum: "20801",
      session: "A71 08/31/2026 - 10/16/2026",
      sectionCode: "LAB1",
      component: "Laboratory",
      meeting: "08/31/2026 - 10/16/2026 Wed 2.00 PM - 3.15 PM at SS 019 with B, B",
    });
    const block = courseBlock({
      header: "ENGR-UH 1000 Test",
      description: "Desc.",
      sections: [sec1, sec2],
    });
    const { course } = parseCourse(block);
    expect(course.sections).toHaveLength(2);
    for (const s of course.sections) {
      expect(typeof s._raw_paste_block).toBe("string");
      expect(s._raw_paste_block.length).toBeGreaterThan(0);
      expect(s._raw_paste_block).toContain(`Class#: ${s.class_number}`);
      expect(s._raw_paste_block.startsWith("ENGR-UH 1000")).toBe(true);
      // trailing blank lines trimmed
      expect(/\s$/.test(s._raw_paste_block)).toBe(false);
    }
    // Blocks should not overlap: class numbers stay inside their own block.
    expect(course.sections[0]._raw_paste_block).not.toContain("20801");
    expect(course.sections[1]._raw_paste_block).not.toContain("20800");
  });

  it("Topics course: Topic: line is included in the block of the section it prefixes, not the previous section", () => {
    const sec1 = sectionBlock({
      code: "GERM-UA 9111",
      classNum: "30001",
      session: "AD 08/31/2026 - 12/14/2026",
      sectionCode: "001",
      meeting: "08/31/2026 - 12/14/2026 Mon 10.00 AM - 11.15 AM at Room 1 with Prof, A",
    });
    const sec2 = sectionBlock({
      code: "GERM-UA 9111",
      classNum: "30002",
      session: "AD 08/31/2026 - 12/14/2026",
      sectionCode: "002",
      meeting: "08/31/2026 - 12/14/2026 Tue 10.00 AM - 11.15 AM at Room 2 with Prof, B",
    });
    const block = courseBlock({
      header: "GERM-UA 9111 Topics in German",
      description: "Varies.",
      sections: [
        "Topic: Kafka and Modernity\n" + sec1,
        "Topic: Weimar Cinema\n" + sec2,
      ],
    });
    const { course } = parseCourse(block);
    expect(course.has_topics).toBe(true);
    expect(course.sections[0].topic).toBe("Kafka and Modernity");
    expect(course.sections[1].topic).toBe("Weimar Cinema");
    // Each section's raw block starts with its own Topic: line.
    expect(course.sections[0]._raw_paste_block.startsWith("Topic: Kafka and Modernity")).toBe(true);
    expect(course.sections[1]._raw_paste_block.startsWith("Topic: Weimar Cinema")).toBe(true);
    // Boundaries are clean — each Topic line appears in exactly one block.
    expect(course.sections[0]._raw_paste_block).not.toContain("Weimar Cinema");
    expect(course.sections[1]._raw_paste_block).not.toContain("Kafka and Modernity");
  });
});
