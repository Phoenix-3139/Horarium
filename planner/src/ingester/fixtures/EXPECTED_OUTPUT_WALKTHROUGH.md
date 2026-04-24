# Parser Output Walkthrough

Companion doc to `expected_engr_uh_first3.json`. For every non-obvious field,
this explains what to extract, where to find it in the source, and how to
handle the weird cases. Read this before writing the parser.

The parser takes raw text pasted from an Albert subject-search page and
produces a JSON object matching the expected fixture. Tests compare parser
output to the fixture — any diff is a bug.

## Document-level structure

The paste is one `<subject>` page of results. Top-level:

```
Skip to Main Content
Fall 2026 Course Search             ← term name, capture
Return to Add Classes
...lots of filter UI noise...
1 - 56 results for: ENGR-UH | Total Class Count: 141    ← header line
<COURSE BLOCK>
<COURSE BLOCK>
...
```

Ignore everything before the `N - M results for: SUBJECT | Total Class Count: K`
line. That line is the parse trigger — nothing useful comes before it. Extract
from it: the subject code, `results_shown` (N), and `total_class_count` (K).

Term name comes from the `"Fall 2026 Course Search"` line near the top.

## Course block structure

Each course block looks like:

```
<SUBJECT> <CATALOG_NUMBER> <TITLE>

<DESCRIPTION PARAGRAPH>... more description for <CODE> »    ← truncation marker

School:
NYU Abu Dhabi
Term:
Fall 2026
<SECTION BLOCK>
<SECTION BLOCK>
...
```

### Header line

`ENGR-UH 1000 Computer Programming for Engineers`

Split on first whitespace-then-digit to get subject and catalog number.
Everything after the catalog number and its trailing space is the title.
Anchor: the subject always matches the header line's subject (`ENGR-UH` in
this paste). A new course block starts whenever a line matches this pattern
AND the next line is non-empty (description starts immediately).

### Title flags

If the title starts with `WO ` (literal "WO" + space), strip it and add `"WO"`
to `title_flags`. Means "Women Only." Example from PHYED: `WO Foundations of
Middle Eastern Dance` → title = `Foundations of Middle Eastern Dance`,
`title_flags = ["WO"]`.

Leave `title_flags` as `[]` when none present.

### Description

Everything between the header line and the first `School:` line. Often ends
with `... more description for <CODE> »` when Albert truncates it. When you
see that suffix:

- Set `description_truncated: true`
- Strip the `... more description for <CODE> »` from the captured text
- Keep the trailing `...` to signal truncation to human readers

When no truncation marker, set `description_truncated: false`.

### School / Term / Units

`School: NYU Abu Dhabi` is the literal — capture to `course.school`.

`Term: Fall 2026` — redundant with the doc-level term. Assert equal; warn if
they disagree (shouldn't happen in practice but catches pasted-the-wrong-term
mistakes).

Units come from the FIRST section line right after the Term:

```
ENGR-UH 1000 | 4 units
```

Take the `4`. All sections of a course share the same unit count in practice,
but if you see disagreement, capture the max and emit a warning.

**Unit ranges:** ENGR-UH 4560 shows `2 - 4 units`. When you see `N - M units`,
store as `{ "min": N, "max": M }` instead of a number. Schema allows
`number | { min, max }`.

## Section block structure

After `Term: Fall 2026`, sections follow. Each section block:

```
<CODE> | <UNITS> units       ← sometimes shows units again; ignore if matches course
Class#: 20607
Session: AD 08/31/2026 - 12/14/2026
Section: 001
Requires Department Consent  ← OPTIONAL flag line
Class Status: Open
Grading: Ugrd Abu Dhabi Graded
Instruction Mode: In-Person
Course Location: Abu Dhabi
Component: Lecture

<MEETING LINE>
Notes: <...>                 ← OPTIONAL

Visit the Bookstore          ← block terminator
Select Class #20607          ← OPTIONAL, means lecture/primary section (skip)
```

Or the `Select Class` line may appear BEFORE `Visit the Bookstore`. Either
way, parser ignores both — they're UI noise.

### class_number

`Class#: 20607` — always 5 digits, capture as **string** (not number, to
preserve any future leading-zero cases).

### Section code

`Section: 001` — the string after `Section: `, up to end of line. Can be any
of: `001`, `002`, `LAB`, `LAB1`, `LAB2`, `LAB3`, `LAB4`, `REC`, `REC1`,
`REC2`, `PR1`, `PR2`, `LEC`, `02` (one real case in the PHYED data — don't
normalize to `002`, preserve exactly what's there).

### Session

`Session: AD 08/31/2026 - 12/14/2026`

Three codes expected at NYUAD:

| Code | Meaning              | Typical dates                 |
| ---- | -------------------- | ----------------------------- |
| A71  | First-half semester  | Aug 31 – Oct 16 (Fall 2026)  |
| A72  | Second-half semester | Oct 26 – Dec 14 (Fall 2026)  |
| AD   | Full term            | Aug 31 – Dec 14 (Fall 2026)  |

Parse dates as `MM/DD/YYYY` → ISO `YYYY-MM-DD`. Preserve the code literally;
do not rewrite even if dates hint otherwise. The code and dates become the
`session` object.

### Requires Department Consent

Optional flag line between `Section:` and `Class Status:`. If present, set
`requires_consent: true`. Otherwise `false`. Do not include the flag in any
other field.

### Class Status

`Class Status: <value>` where `<value>` is one of:

- `Open` → `{ raw: "Open", type: "open", count: null }`
- `Closed` → `{ raw: "Closed", type: "closed", count: null }`
- `Wait List (N)` → `{ raw: "Wait List (N)", type: "waitlist", count: N }` (N may be 0)
- `Cancelled` → `{ raw: "Cancelled", type: "cancelled", count: null }`

The raw string is preserved so the UI can display exactly what Albert said.
If a new status vocabulary appears, parser emits a warning with the raw string
and defaults `type: "unknown"`. Don't silently drop.

### Grading / Instruction Mode / Course Location / Component

Direct captures, one line each. Component maps to the canonical values:

- `Lecture`, `Laboratory`, `Recitation`, `Seminar`, `Studio`, `Workshop`,
  `Clinic`, `Independent Study`, `Project`, `Field Instruction/Field Superv`

Preserve exactly as shown. If a new value appears, capture verbatim and
emit a warning.

## Meeting line

The meeting line is the most variable part. Expected shape:

```
<START_DATE> - <END_DATE> <DAYS> <START_TIME> - <END_TIME> at <ROOM> with <INSTRUCTORS>
```

Example:

```
08/31/2026 - 12/14/2026 Mon,Wed 5.00 PM - 6.15 PM at West Administration Room 001
```

### Date range

`MM/DD/YYYY - MM/DD/YYYY` → two ISO dates. Should match the session dates —
denormalize to the meeting anyway (schema says so; simplifies conflict checks).

### Days

Comma-separated, no spaces: `Mon,Wed` or `Tue,Thu` or `Mon,Wed,Fri`. Single
day is just `Mon`, `Tue`, etc. Valid values: `Mon`, `Tue`, `Wed`, `Thu`,
`Fri`, `Sat`, `Sun`. Output as a string array.

### Times

**Albert uses `.` instead of `:`** for times — `5.00 PM`, `9.55 AM`. Parser
must normalize to 24h `HH:MM`:

- `8.30 AM` → `"08:30"`
- `12.35 PM` → `"12:35"` (noon case; 12 PM stays as 12)
- `12.00 PM` → `"12:00"`
- `12.30 AM` → `"00:30"` (midnight case; 12 AM becomes 00)
- `2.10 PM` → `"14:10"`
- `5.00 PM` → `"17:00"`
- `6.00 PM` → `"18:00"`

Sanity check: end time should be strictly after start time. If not, warn.

### Room

After `at ` and before ` with ` (if present). Examples:

- `West Administration Room 001` → room = that, building = `West Administration`, room_number = `001`
- `Social Sciences Room 018` → room = that, building = `Social Sciences`, room_number = `018`
- `Computational Research Room 001` → same split pattern
- `Campus Center Room E052` → building = `Campus Center`, room_number = `E052`
- `A1 Building Room 002` → building = `A1 Building`, room_number = `002`
- `East Administration Building Room 003` → building = `East Administration Building`, room_number = `003`
- `Campus Center Room DANCE STUD` → building = `Campus Center`, room_number = `DANCE STUD` (yes, literal)
- `Campus Center Room POOL` → same pattern; room_number is non-numeric
- `Campus Center Room TENNIS` / `FIT_CEN` / `ROCK WALL` / `COMBAT STU` / `YOGA STUDI` / `SPIN STUDI` / `PERF_GYM` / `TRACK` / `TRACK1` / `W103B` / `W005` / `W006` / `W008` / `W009` / `E047` / `E048` / `E050` / `E051` / `307` — all seen in real data

Parsing rule: split on ` Room ` (literal string with spaces). Left side =
`building`. Right side = `room_number`. Full string = `room`.

**Edge cases:**

- `No Room Required` — literal value, no "Room" split possible. Set `room: "No Room Required"`, `building: null`, `room_number: null`.
- No room at all (missing from meeting line) — set all three to `null`.
- `08/31/2026 - 12/14/2026 Thu 3.20 PM - 6.00 PMNo Room Required` — real
  case from ENGR-UH 4020. Missing space before `No Room Required`. Parser
  must handle this by regex-matching `No Room Required` anywhere after the
  time range, not requiring a space.

### Instructors

After ` with `. Multiple instructors separated by `; ` (semicolon + space).

```
with Jabari, Saif Eddin Ghazi
→ ["Jabari, Saif Eddin Ghazi"]

with Hashaikeh, Raed; Salim, Wahib
→ ["Hashaikeh, Raed", "Salim, Wahib"]

with Zam, Azhar; Sabah, Shafiya
→ ["Zam, Azhar", "Sabah, Shafiya"]
```

Trim each name. Preserve "Last, First" format with the comma.

**Edge cases:**

- No `with ` clause at all — set `instructors: []`. Example: ENGR-UH 3520
  section 001 has `at Social Sciences Room 005` and nothing after.
- `with ` followed by nothing — treat as empty array and warn.

### Meeting with no time/day

ENGR-UH 3120 section LAB2 real line:

```
10/26/2026 - 12/14/2026 at Campus Center Room E047
```

No day, no time. Parser should emit a meeting with:

- `days: []`
- `start_time: null`
- `end_time: null`
- `start_date`, `end_date`: parsed from the date range
- `room`, `building`, `room_number`: parsed from the Room clause
- `instructors`: `[]`

Emit a warning noting the missing time so user can check it isn't a parse bug.

### Cancelled section — no meeting at all

Real line from PHYED-UH 1006:

```
08/31/2026 - 10/16/2026 No Room Required
```

Combined with `Class Status: Cancelled`. This section has no meeting data
at all. Output: `meetings: []`. Do not fabricate a meeting object with null
times — just an empty array.

## Notes block

Optional. Appears after the meeting line:

```
Notes: Enrollment Priority: Students who still need to fulfill their PHYED
requirement. Email pequestions@nyu.edu to obtain a permission number...
```

Capture everything after `Notes: ` until the next `Visit the Bookstore` line
or blank line terminator. Preserve newlines within. Store as
`section.notes: string`. When absent, `notes: null`.

## Linked components

The schema has a `linked_components: string[]` field. Albert's text output
does NOT explicitly link sections — a lecture and its recitation appear as
sibling section blocks under the same course with no cross-reference.

For this parser, always emit `linked_components: []`. The planner applies
heuristics downstream to infer linkage (same course + numeric section number
matches auxiliary section number: Lec 001 ↔ LAB1/REC1, Lec 002 ↔ LAB2/REC2).

Do not try to infer linkage in the parser. Keep it dumb.

## Deduplication

**Sections appear 1, 2, or 3 times in the source.** This is how Albert renders
the page — once normally, once with a "Select Class #..." header, sometimes
a third time. Real example: PHYED-UH 1004 class #20137 appears twice.

Rule: dedupe by `class_number` within a course block. If two appearances
disagree on any field (they shouldn't), emit a warning with the diff.
Preserve the first occurrence.

Before output, assert: within each course, `class_number` values are unique.

## Sanity checks to emit

After parsing the whole paste, cross-check:

1. Count unique class numbers across all courses. Compare to
   `total_class_count` from the header. Emit a warning if they differ —
   probably means parser dropped some sections.
2. Count courses. Compare to `results_shown`. Not always exactly equal
   (Albert sometimes paginates or combines), but order-of-magnitude mismatch
   is a red flag.
3. Every section's session dates should be consistent with its meeting
   dates. Warn otherwise.
4. No two sections of the same course should have the same `class_number`
   (redundant with dedupe, but safety net).

## Output top level

```json
{
  "schema_version": "1.1",
  "header": { "term": "Fall 2026", "subject_code": "ENGR-UH", "results_shown": 56, "total_class_count": 141 },
  "courses": [ ... ],
  "warnings": [
    { "type": "missing_time", "class_number": "20631", "message": "Section LAB2 has no meeting time" }
  ],
  "unparsed_lines": [
    { "line_number": 423, "text": "some line the parser couldn't match", "context": "within ENGR-UH 9999 section 001" }
  ]
}
```

`warnings` and `unparsed_lines` are CRITICAL. A silent parser that drops
lines is worse than one that surfaces everything it couldn't handle. The UI
will show unparsed lines to the user so they can spot when Albert changes
its format.

## Testing approach

1. Save real pastes as `.txt` fixtures in `planner/src/ingester/fixtures/`.
2. For each fixture, hand-write the expected JSON (like
   `expected_engr_uh_first3.json` — full paste not required for the first
   test, just the first 3 courses).
3. Test: `parse(fixtureText)` deep-equals `expectedJson`. Diff output on
   failure.
4. As new edge cases surface, add them to fixtures and regenerate expected
   output.

## What NOT to do

- Don't try to parse the description's "... more description »" to fetch
  full text. Albert doesn't expose it statically — that's a JS-triggered
  expand. Accept the truncated form.
- Don't guess at linked components.
- Don't silently drop unparsed lines. Always surface them.
- Don't normalize section codes (keep `02` as `02`, don't pad to `002`).
- Don't change the instructor name format. Keep "Last, First" as-is.
- Don't invent meeting data for Cancelled sections. `meetings: []`.
