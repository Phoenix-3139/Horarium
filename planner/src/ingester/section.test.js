import { describe, it, expect } from "vitest";
import { parseSection } from "./section.js";

// Shape of a canonical section block, for reference:
//
//   <CODE> | <UNITS> units
//   Class#: 20607
//   Session: AD 08/31/2026 - 12/14/2026
//   Section: 001
//   Requires Department Consent      (optional)
//   Class Status: Open
//   Grading: Ugrd Abu Dhabi Graded
//   Instruction Mode: In-Person
//   Course Location: Abu Dhabi
//   Component: Lecture
//
//   <MEETING LINE>
//   Notes: ...                       (optional, may span lines)
//
//   Visit the Bookstore
//   Select Class #20607              (optional, ignored)

describe("parseSection — happy path", () => {
  it("parses a complete LEC block with one meeting and one instructor", () => {
    const blockText = `ENGR-UH 2011 | 4 units
Class#: 20612
Session: A71 08/31/2026 - 10/16/2026
Section: 001
Class Status: Open
Grading: Ugrd Abu Dhabi Graded
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Lecture

08/31/2026 - 10/16/2026 Mon,Wed 9.55 AM - 11.10 AM at East Administration Building Room 003 with Sousa, Rita Leal

Visit the Bookstore
Select Class #20612
`;
    const { section, warnings, unparsed_lines } = parseSection(blockText, {
      course_code: "ENGR-UH 2011",
      course_units: 4,
    });

    expect(warnings).toEqual([]);
    expect(unparsed_lines).toEqual([]);
    expect(section).toEqual({
      class_number: "20612",
      section_code: "001",
      component: "Lecture",
      session: { code: "A71", start_date: "2026-08-31", end_date: "2026-10-16" },
      status: { raw: "Open", type: "open", count: null },
      requires_consent: false,
      grading: "Ugrd Abu Dhabi Graded",
      instruction_mode: "In-Person",
      location: "Abu Dhabi",
      meetings: [
        {
          days: ["Mon", "Wed"],
          start_time: "09:55",
          end_time: "11:10",
          start_date: "2026-08-31",
          end_date: "2026-10-16",
          room: "East Administration Building Room 003",
          building: "East Administration Building",
          room_number: "003",
          instructors: ["Sousa, Rita Leal"],
        },
      ],
      linked_components: [],
      notes: null,
      topic: null,
      display_timezone: null,
    });
  });
});

describe("parseSection — timezone disclaimer (Global / study-away)", () => {
  it("captures display_timezone from the Class-Times-in-X line and emits zero unparsed lines", () => {
    // Real shape: Albert inserts the disclaimer between Component: and the
    // meeting line for Global study-away sections (e.g. CS-UY Paris).
    const blockText = `CS-UY 1134 | 4 units
Class#: 15000
Session: G0C 08/31/2026 - 12/14/2026
Section: P01
Class Status: Open
Grading: Ugrd Tandon Graded
Instruction Mode: In-Person
Course Location: Paris
Component: Lecture

Class Times are shown in the Paris, France time zone. Make sure you convert to your local time zone, if needed.
08/31/2026 - 12/14/2026 Mon,Wed 9.00 AM - 10.30 AM at Paris Campus Room 201 with Dupont, Marie

Visit the Bookstore
`;
    const { section, warnings, unparsed_lines } = parseSection(blockText, {
      course_code: "CS-UY 1134",
      course_units: 4,
    });
    expect(unparsed_lines).toEqual([]);
    expect(warnings).toEqual([]);
    expect(section.display_timezone).toBe("Paris, France");
    // Meeting line after the disclaimer still parses normally.
    expect(section.meetings).toHaveLength(1);
    expect(section.meetings[0].days).toEqual(["Mon", "Wed"]);
    expect(section.meetings[0].start_time).toBe("09:00");
  });

  it("handles a multi-word city like Berlin or Washington DC", () => {
    const blockText = `GERM-UA 9111 | 4 units
Class#: 16000
Session: 1 08/31/2026 - 12/14/2026
Section: B01
Class Status: Open
Grading: Ugrd CAS Graded
Instruction Mode: In-Person
Course Location: Berlin
Component: Lecture

Class Times are shown in the Berlin, Germany time zone. Make sure you convert to your local time zone, if needed.
08/31/2026 - 12/14/2026 Tue,Thu 10.00 AM - 11.30 AM at Berlin Campus Room 101 with Mueller, Hans

Visit the Bookstore
`;
    const { section, warnings } = parseSection(blockText, {
      course_code: "GERM-UA 9111",
      course_units: 4,
    });
    expect(warnings).toEqual([]);
    expect(section.display_timezone).toBe("Berlin, Germany");
  });

  it("leaves display_timezone null for a domestic / non-Global section", () => {
    // No disclaimer line → null.
    const blockText = `ENGR-UH 2011 | 4 units
Class#: 20612
Session: A71 08/31/2026 - 10/16/2026
Section: 001
Class Status: Open
Grading: Ugrd Abu Dhabi Graded
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Lecture

08/31/2026 - 10/16/2026 Mon,Wed 9.55 AM - 11.10 AM at East Administration Building Room 003 with Sousa, Rita Leal

Visit the Bookstore
`;
    const { section, warnings } = parseSection(blockText, {
      course_code: "ENGR-UH 2011",
      course_units: 4,
    });
    expect(warnings).toEqual([]);
    expect(section.display_timezone).toBe(null);
  });
});

describe("parseSection — waitlist status", () => {
  it("captures Wait List (5) with count 5", () => {
    const blockText = `ENGR-UH 2010 | 2 units
Class#: 20668
Session: A71 08/31/2026 - 10/16/2026
Section: 001
Class Status: Wait List (5)
Grading: Ugrd Abu Dhabi Graded
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Lecture

08/31/2026 - 10/16/2026 Mon,Wed 9.55 AM - 11.10 AM at Social Sciences Room 018 with Jabari, Saif Eddin Ghazi

Visit the Bookstore
`;
    const { section, warnings, unparsed_lines } = parseSection(blockText, {
      course_code: "ENGR-UH 2010",
      course_units: 2,
    });
    expect(warnings).toEqual([]);
    expect(unparsed_lines).toEqual([]);
    expect(section.status).toEqual({ raw: "Wait List (5)", type: "waitlist", count: 5 });
  });
});

describe("parseSection — cancelled", () => {
  // Design choice: cancelled sections always emit meetings: [] and NO warning.
  // A cancelled section with no real meeting is the documented/expected
  // shape; warning would be noise. See DATA_SCHEMA.md §Status.
  it("returns meetings: [] for a cancelled section even if a 'dates + No Room Required' line is present", () => {
    const blockText = `PHYED-UH 1006 | 0 units
Class#: 20900
Session: A71 08/31/2026 - 10/16/2026
Section: 001
Class Status: Cancelled
Grading: Pass/Fail
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Studio

08/31/2026 - 10/16/2026 No Room Required

Visit the Bookstore
`;
    const { section, warnings, unparsed_lines } = parseSection(blockText, {
      course_code: "PHYED-UH 1006",
      course_units: 0,
    });
    expect(unparsed_lines).toEqual([]);
    expect(warnings).toEqual([]);
    expect(section.status.type).toBe("cancelled");
    expect(section.meetings).toEqual([]);
  });
});

describe("parseSection — 'No Room Required' with no preceding space", () => {
  it("extracts No Room Required from '6.00 PMNo Room Required' without swallowing the M", () => {
    // Real case: ENGR-UH 4020 section 001.
    const blockText = `ENGR-UH 4020 | 4 units
Class#: 20780
Session: AD 08/31/2026 - 12/14/2026
Section: 001
Class Status: Open
Grading: Ugrd Abu Dhabi Graded
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Lecture

08/31/2026 - 12/14/2026 Thu 3.20 PM - 6.00 PMNo Room Required with Khan, Farooq

Visit the Bookstore
`;
    const { section, warnings, unparsed_lines } = parseSection(blockText, {
      course_code: "ENGR-UH 4020",
      course_units: 4,
    });
    expect(unparsed_lines).toEqual([]);
    expect(warnings).toEqual([]);
    expect(section.meetings).toHaveLength(1);
    const m = section.meetings[0];
    expect(m.days).toEqual(["Thu"]);
    expect(m.start_time).toBe("15:20");
    expect(m.end_time).toBe("18:00");
    expect(m.room).toBe("No Room Required");
    expect(m.building).toBe(null);
    expect(m.room_number).toBe(null);
    expect(m.instructors).toEqual(["Khan, Farooq"]);
  });
});

describe("parseSection — no-time meeting", () => {
  it("emits meeting with empty days, null times, room parsed, and a warning", () => {
    // Real case: ENGR-UH 3120 section LAB2.
    const blockText = `ENGR-UH 3120 | 4 units
Class#: 20710
Session: A72 10/26/2026 - 12/14/2026
Section: LAB2
Class Status: Open
Grading: Ugrd Abu Dhabi Graded
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Laboratory

10/26/2026 - 12/14/2026 at Campus Center Room E047

Visit the Bookstore
`;
    const { section, warnings, unparsed_lines } = parseSection(blockText, {
      course_code: "ENGR-UH 3120",
      course_units: 4,
    });
    expect(unparsed_lines).toEqual([]);
    expect(section.meetings).toHaveLength(1);
    const m = section.meetings[0];
    expect(m.days).toEqual([]);
    expect(m.start_time).toBe(null);
    expect(m.end_time).toBe(null);
    expect(m.room).toBe("Campus Center Room E047");
    expect(m.building).toBe("Campus Center");
    expect(m.room_number).toBe("E047");
    expect(m.instructors).toEqual([]);
    expect(warnings).toEqual([
      {
        type: "meeting_missing_time",
        class_number: "20710",
        raw: "10/26/2026 - 12/14/2026 at Campus Center Room E047",
        message:
          "Meeting has no day/time — only dates + room. Verify this isn't a parse bug.",
      },
    ]);
  });
});

describe("parseSection — missing instructor clause", () => {
  it("sets instructors to [] with no warning (this is valid per the walkthrough)", () => {
    // Real case: ENGR-UH 1000 section 001 — no ' with ' clause.
    const blockText = `ENGR-UH 1000 | 4 units
Class#: 20607
Session: AD 08/31/2026 - 12/14/2026
Section: 001
Class Status: Open
Grading: Ugrd Abu Dhabi Graded
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Lecture

08/31/2026 - 12/14/2026 Mon,Wed 5.00 PM - 6.15 PM at West Administration Room 001

Visit the Bookstore
Select Class #20607
`;
    const { section, warnings, unparsed_lines } = parseSection(blockText, {
      course_code: "ENGR-UH 1000",
      course_units: 4,
    });
    expect(warnings).toEqual([]);
    expect(unparsed_lines).toEqual([]);
    expect(section.meetings[0].instructors).toEqual([]);
  });
});

describe("parseSection — multiple instructors", () => {
  it("splits a ';'-separated instructor list", () => {
    const blockText = `ENGR-UH 2012 | 4 units
Class#: 20720
Session: AD 08/31/2026 - 12/14/2026
Section: 001
Class Status: Open
Grading: Ugrd Abu Dhabi Graded
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Lecture

08/31/2026 - 12/14/2026 Tue,Thu 12.45 PM - 2.00 PM at A1 Building Room 002 with Hashaikeh, Raed; Salim, Wahib

Visit the Bookstore
`;
    const { section, warnings } = parseSection(blockText, {
      course_code: "ENGR-UH 2012",
      course_units: 4,
    });
    expect(warnings).toEqual([]);
    expect(section.meetings[0].instructors).toEqual(["Hashaikeh, Raed", "Salim, Wahib"]);
    expect(section.meetings[0].instructors).toHaveLength(2);
  });
});

describe("parseSection — requires_consent flag", () => {
  it("sets requires_consent: true when the flag line is present, without disturbing other fields", () => {
    const blockText = `PHYED-UH 1050 | 0 units
Class#: 20931
Session: AD 08/31/2026 - 12/14/2026
Section: 001
Requires Department Consent
Class Status: Open
Grading: Pass/Fail
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Studio

08/31/2026 - 12/14/2026 Mon 5.00 PM - 6.15 PM at Campus Center Room DANCE STUD with Lee, Mina

Visit the Bookstore
`;
    const { section, warnings, unparsed_lines } = parseSection(blockText, {
      course_code: "PHYED-UH 1050",
      course_units: 0,
    });
    expect(unparsed_lines).toEqual([]);
    expect(warnings).toEqual([]);
    expect(section.requires_consent).toBe(true);
    expect(section.status).toEqual({ raw: "Open", type: "open", count: null });
    expect(section.meetings[0].building).toBe("Campus Center");
    expect(section.meetings[0].room_number).toBe("DANCE STUD");
    expect(section.meetings[0].instructors).toEqual(["Lee, Mina"]);
  });

  it("leaves requires_consent: false when the flag line is absent", () => {
    const blockText = `ENGR-UH 2011 | 4 units
Class#: 20612
Session: A71 08/31/2026 - 10/16/2026
Section: 001
Class Status: Open
Grading: Ugrd Abu Dhabi Graded
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Lecture

08/31/2026 - 10/16/2026 Mon,Wed 9.55 AM - 11.10 AM at East Administration Building Room 003 with Sousa, Rita Leal

Visit the Bookstore
`;
    const { section } = parseSection(blockText, {
      course_code: "ENGR-UH 2011",
      course_units: 4,
    });
    expect(section.requires_consent).toBe(false);
  });
});

describe("parseSection — notes block", () => {
  it("captures the full multi-line Notes: content verbatim", () => {
    const blockText = `PHYED-UH 1004 | 0 units
Class#: 20137
Session: A71 08/31/2026 - 10/16/2026
Section: 001
Class Status: Open
Grading: Pass/Fail
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Studio

08/31/2026 - 10/16/2026 Tue,Thu 6.30 PM - 7.45 PM at Campus Center Room POOL with Morales, Diego
Notes: Enrollment Priority: Students who still need to fulfill their PHYED
requirement. Email pequestions@nyu.edu to obtain a permission number.

Visit the Bookstore
`;
    const { section, warnings, unparsed_lines } = parseSection(blockText, {
      course_code: "PHYED-UH 1004",
      course_units: 0,
    });
    expect(unparsed_lines).toEqual([]);
    expect(warnings).toEqual([]);
    expect(section.notes).toBe(
      "Enrollment Priority: Students who still need to fulfill their PHYED\nrequirement. Email pequestions@nyu.edu to obtain a permission number.",
    );
  });
});

describe("parseSection — section code preserved literally", () => {
  it("keeps '02' as '02' (not padded to '002')", () => {
    const blockText = `PHYED-UH 1122 | 0 units
Class#: 20501
Session: AD 08/31/2026 - 12/14/2026
Section: 02
Class Status: Open
Grading: Pass/Fail
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Studio

08/31/2026 - 12/14/2026 Fri 2.00 PM - 3.15 PM at Campus Center Room YOGA STUDI with Singh, Priya

Visit the Bookstore
`;
    const { section } = parseSection(blockText, {
      course_code: "PHYED-UH 1122",
      course_units: 0,
    });
    expect(section.section_code).toBe("02");
  });
});

describe("parseSection — unit disagreement", () => {
  it("warns when section units differ from course units and includes all identifying info", () => {
    const blockText = `ENGR-UH 9999 | 3 units
Class#: 29999
Session: AD 08/31/2026 - 12/14/2026
Section: 001
Class Status: Open
Grading: Ugrd Abu Dhabi Graded
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Lecture

08/31/2026 - 12/14/2026 Mon 9.55 AM - 11.10 AM at Social Sciences Room 018 with Doe, Jane

Visit the Bookstore
`;
    const { warnings } = parseSection(blockText, {
      course_code: "ENGR-UH 9999",
      course_units: 2,
    });
    expect(warnings).toHaveLength(1);
    const w = warnings[0];
    // Payload is rich enough to debug from alone:
    expect(w.type).toBe("units_mismatch");
    expect(w.class_number).toBe("29999");
    expect(w.course_code).toBe("ENGR-UH 9999");
    expect(w.course_units).toBe(2);
    expect(w.section_units).toBe(3);
    expect(w.message).toMatch(/29999/);
    expect(w.message).toMatch(/ENGR-UH 9999/);
    expect(w.message).toMatch(/3/);
    expect(w.message).toMatch(/2/);
  });

  it("no warning when units match, including for unit ranges", () => {
    const block = `ENGR-UH 4560 | 2 - 4 units
Class#: 20800
Session: AD 08/31/2026 - 12/14/2026
Section: 001
Class Status: Open
Grading: Ugrd Abu Dhabi Graded
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Project

08/31/2026 - 12/14/2026 Fri 2.00 PM - 3.15 PM at Engineering Building Room 101 with Adviser, Faculty

Visit the Bookstore
`;
    const { warnings } = parseSection(block, {
      course_code: "ENGR-UH 4560",
      course_units: { min: 2, max: 4 },
    });
    expect(warnings).toEqual([]);
  });
});

describe("parseSection — unknown component", () => {
  it("preserves the component verbatim and emits a warning", () => {
    const block = `ENGR-UH 9999 | 4 units
Class#: 28888
Session: AD 08/31/2026 - 12/14/2026
Section: 001
Class Status: Open
Grading: Ugrd Abu Dhabi Graded
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Gym Class

08/31/2026 - 12/14/2026 Mon 9.55 AM - 11.10 AM at Social Sciences Room 018 with Doe, Jane

Visit the Bookstore
`;
    const { section, warnings } = parseSection(block, {
      course_code: "ENGR-UH 9999",
      course_units: 4,
    });
    expect(section.component).toBe("Gym Class");
    expect(warnings).toEqual([
      {
        type: "unknown_component",
        class_number: "28888",
        value: "Gym Class",
        message: 'Component "Gym Class" is not in the known allowlist; preserving verbatim',
      },
    ]);
  });
});

describe("parseSection — unknown status", () => {
  it("sets status.type='unknown', preserves raw, and warns", () => {
    const block = `ENGR-UH 9999 | 4 units
Class#: 27777
Session: AD 08/31/2026 - 12/14/2026
Section: 001
Class Status: Tentative
Grading: Ugrd Abu Dhabi Graded
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Lecture

08/31/2026 - 12/14/2026 Mon 9.55 AM - 11.10 AM at Social Sciences Room 018 with Doe, Jane

Visit the Bookstore
`;
    const { section, warnings } = parseSection(block, {
      course_code: "ENGR-UH 9999",
      course_units: 4,
    });
    expect(section.status).toEqual({ raw: "Tentative", type: "unknown", count: null });
    expect(warnings).toEqual([
      {
        type: "unknown_status",
        class_number: "27777",
        raw: "Tentative",
        message: 'Class Status value "Tentative" did not match any known pattern',
      },
    ]);
  });
});

describe("parseSection — malformed session", () => {
  it("keeps the code but nulls the dates and emits a warning", () => {
    const block = `ENGR-UH 9999 | 4 units
Class#: 26666
Session: AD 08-31-2026 through 12-14-2026
Section: 001
Class Status: Open
Grading: Ugrd Abu Dhabi Graded
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Lecture

08/31/2026 - 12/14/2026 Mon 9.55 AM - 11.10 AM at Social Sciences Room 018 with Doe, Jane

Visit the Bookstore
`;
    const { section, warnings } = parseSection(block, {
      course_code: "ENGR-UH 9999",
      course_units: 4,
    });
    expect(section.session).toEqual({
      code: "AD",
      start_date: null,
      end_date: null,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("malformed_session");
    expect(warnings[0].class_number).toBe("26666");
    expect(warnings[0].raw).toBe("AD 08-31-2026 through 12-14-2026");
  });
});
