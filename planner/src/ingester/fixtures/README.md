# Parser Fixtures

This directory contains real Albert paste text and the expected parser output
for each. The parser is tested by `parse(fixture_txt) ≡ expected_json`.

## Files

- `engr-uh-fall2026.txt` — full ENGR-UH subject search results, Fall 2026,
  as copied from Albert on Apr 23, 2026. 56 results shown, 141 total class
  count per header. Covers: AD/A71/A72 sessions, Lecture/Lab/Rec/Seminar/Project
  components, 2-4 unit courses, unit ranges ("2 - 4 units" in ENGR-UH 4560),
  multi-instructor sections, "No Room Required" rows, missing-instructor
  rows, missing-time rows, duplicate section blocks.

- `phyed-uh-fall2026.txt` — full PHYED-UH subject search results, Fall 2026,
  as copied from Albert on Apr 23, 2026. 41 results shown, 62 total class
  count. Covers: WO (women-only) title prefix, "Requires Department Consent"
  flag, "Cancelled" status rows with no meeting data, 0-unit courses,
  Pass/Fail grading, non-standard room labels (DANCE STUD, POOL, ROCK WALL,
  TENNIS, COMBAT STU, YOGA STUDI, PERF_GYM, etc.), "Notes:" blocks with
  enrollment priority info, "02" section code (not "002").

- `expected_engr_uh_first3.json` — ground-truth parser output for the first
  three ENGR-UH courses (1000, 1801, 2010). Use this as the primary test
  target when implementing the parser.

- `EXPECTED_OUTPUT_WALKTHROUGH.md` — annotated explanation of every parsing
  decision. Read before writing the parser.

## How to add more fixtures

1. Copy the full text of an Albert subject search page (e.g., MATH-UH, CS-UH).
2. Save as `<subject-lowercased>-<term>.txt` in this directory.
3. Hand-write an expected JSON for at least the first 2-3 courses, or the
   full thing if the subject has weird edge cases.
4. Add a row to the "Files" section above describing what's covered.

## When tests break

Parser failures on real fixtures mean one of:
- Albert changed their output format (see `unparsed_lines` in output)
- A new edge case emerged not covered by existing fixtures
- Parser regression

Fix by: updating fixture + expected JSON + parser together in a single commit.
Never update expected JSON alone to make a test pass — that hides the bug.
