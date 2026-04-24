# Data Schema

The JSON the ingester produces and the planner/scheduler consume.
Single source of truth for inter-module data.

## File naming

Exported catalog: `data/<term-slug>.json`, e.g. `data/fall2026.json`.
User config: `data/user.json` (gitignored).

## Top-level structure

```jsonc
{
  "schema_version": "1.1.3",
  "ingested_at": "2026-04-23T14:00:00Z",
  "source": "albert-paste",
  "term": {
    "name": "Fall 2026",
    "slug": "fall2026",
    "start_date": "2026-08-31",
    "end_date": "2026-12-14"
  },
  "school": "NYUAD",
  "subjects": ["ENGR-UH", "PHYED-UH", "..."],
  "courses": [ /* Course */ ]
}
```

### Fields

- `schema_version` — semver-ish. Bump the major when breaking the contract.
  Minor bumps for additive/compatible changes. Current: **1.1**.
- `ingested_at` — ISO 8601 UTC timestamp of the most recent ingest that
  contributed to this file.
- `source` — `albert-paste` for Phase 1. Future values: `albert-extension`
  (Phase 5).
- `term` — display name, file-friendly slug, inferred semester date range.
- `school` — `NYUAD`, `WSQ`, or `SHU`.
- `subjects` — subject codes for which at least one section has been
  ingested. Lets the planner warn if a course is missing because it
  wasn't ingested yet.
- `courses` — array of Course objects.

## Course

```jsonc
{
  "code": "ENGR-UH 2010",
  "subject": "ENGR-UH",
  "catalog_number": "2010",
  "title": "Probability and Statistics for Engineers",
  "description": "Introductory course in probability and statistics...",
  "school": "NYU Abu Dhabi",
  "units": 2,
  "no_sections_offered": false,
  "has_topics": false,
  "sections": [ /* Section */ ]
}
```

- `code` — canonical form `"SUBJECT NUMBER"` with a space, exactly as NYU
  writes it. Stable ID for cross-referencing.
- `units` — `number` **or** `{ "min": number, "max": number }` for
  variable-credit courses (e.g. `"2 - 4 units"` → `{min:2, max:4}`).
- `no_sections_offered` — `true` when Albert explicitly declared
  `"No Classes Scheduled for the Terms Offered"` inside the course
  block. Distinguishes "course exists but not offered this term" from
  "parser failed to find sections." When `true`, `sections` is `[]`
  and no `no_sections` warning fires. Default `false`.
- `has_topics` — `true` when the course block contained one or more
  `Topic:` lines (variable-topic courses like `FYSEM-UA`, `GERM-UA
  9111`, `CS-UY 3943`). Each section's individual topic is captured on
  `Section.topic`. Default `false`.

## Section

```jsonc
{
  "class_number": "20668",
  "section_code": "001",
  "component": "Lecture",
  "session": {
    "code": "A71",
    "start_date": "2026-08-31",
    "end_date": "2026-10-16"
  },
  "status": {
    "raw": "Wait List (3)",
    "type": "waitlist",
    "count": 3
  },
  "requires_consent": false,
  "title_flags": [],
  "grading": "Ugrd Abu Dhabi Graded",
  "instruction_mode": "In-Person",
  "location": "Abu Dhabi",
  "meetings": [ /* Meeting */ ],
  "linked_components": [],
  "notes": null,
  "topic": null,
  "display_timezone": null,
  "last_updated_from_paste": "2026-04-23T14:00:00Z",
  "_raw_paste_block": "ENGR-UH 2010 | 4 units\nClass#: 20668\n..."
}
```

### Fields

- `class_number` — NYU's 5-digit registration ID. String (preserves
  leading zeros if any).
- `section_code` — free-form label from Albert. Examples: `001`, `002`,
  `LAB1`, `LEC`, `PR1`, `REC`, `REC2`. Do not assume a format.
- `component` — one of `Lecture`, `Recitation`, `Laboratory`, `Seminar`,
  `Studio`, `Workshop`, `Clinic`, `Independent Study`, `Lecture for Lab`,
  `Project`, `Practicum`. Canonical form from NYU's taxonomy.
- `session` — the session window. Common codes at NYUAD:
  - `A71` = first half (weeks 1-7; Aug 31 – Oct 16 in Fall 2026)
  - `A72` = second half (weeks 8-14; Oct 26 – Dec 14 in Fall 2026)
  - `AD` = full term
- `status` — see **Status** below.
- `requires_consent` — `true` if the Albert paste showed the flag
  "Requires Department Consent" for this section.
- `title_flags` — string array, e.g. `["WO"]` for women-only. Parsed from
  the section title prefix and stripped from the visible title. Empty
  when the section has no flags.
- `linked_components` — class numbers of sections that must be taken
  jointly (e.g. a lecture pairing with its lab). **Albert's text does not
  expose explicit linkage** — the ingester emits `[]` and the planner
  infers at display time. See ARCHITECTURE.md.
- `notes` — the contents of the `Notes:` block when present. `null`
  otherwise.
- `last_updated_from_paste` — ISO timestamp of the paste that produced
  the current record. Upserted on every paste that mentions this
  `class_number`.
- `_raw_paste_block` — the source text that produced this section,
  preserved verbatim (trailing blank lines trimmed). Used by the Edit
  module (Piece 3c) to show parser input alongside parser output for
  repair workflows. Not intended for display in normal UI. For
  variable-topic courses, the preceding `Topic: <topic>` line is
  included in the section it prefixes — that line is contextual to the
  section that immediately follows it in the paste. The leading
  underscore marks this as internal/provenance data; fields prefixed
  with `_` are not user-editable (the store rejects `setEdit` calls
  targeting them).

### Status

```jsonc
{
  "raw": "Wait List (5)",
  "type": "open" | "closed" | "waitlist" | "cancelled" | "unknown",
  "count": number | null
}
```

- `raw` — the verbatim status string Albert displayed. Useful for
  debugging and for surfacing text we didn't know how to classify.
- `type` —
  - `"open"` — seats available.
  - `"closed"` — no seats, no waitlist depth reported.
  - `"waitlist"` — on waitlist; `count` holds the depth (may be `0`).
  - `"cancelled"` — section cancelled. Has no meeting rows.
  - `"unknown"` — parser did not recognize the raw string; an ingester
    warning accompanies it so the UI can surface the novel value
    instead of silently dropping it. `raw` is still preserved.
- `count` — integer when `type === "waitlist"` (including `0`); `null`
  otherwise.

#### Recognized raw strings

| Raw (from Albert)  | type       | count          |
|--------------------|------------|----------------|
| `Open`             | open       | null           |
| `Closed`           | closed     | null           |
| `Wait List (N)`    | waitlist   | N (int, ≥0)    |
| `Cancelled`        | cancelled  | null           |

Extend as new strings are observed. When `raw` doesn't match any known
pattern, the ingester emits a warning and sets `type: "closed"`,
`count: null` conservatively.

## Meeting

A section may have zero meetings (cancelled sections) or multiple
meetings (e.g. a lecture that meets MW in one room and F in another).

```jsonc
{
  "days": ["Mon", "Wed"],
  "start_time": "09:55",
  "end_time": "11:10",
  "start_date": "2026-08-31",
  "end_date": "2026-10-16",
  "room": "East Administration Building Room 003",
  "building": "East Administration Building",
  "room_number": "003",
  "instructors": ["Sousa, Rita Leal"]
}
```

### Fields

- `days` — array of 3-letter day codes: `Mon`, `Tue`, `Wed`, `Thu`, `Fri`,
  `Sat`, `Sun`. **May be empty** if Albert listed a meeting with dates
  and a room but no day/time (rare, but observed).
- `start_time`, `end_time` — 24-hour `HH:MM` strings, or `null` if the
  meeting has no time component. Local time for the course location.
- `start_date`, `end_date` — ISO dates bounding when this meeting
  actually occurs. Denormalized from the section's session so conflict
  checks can work on the meeting alone.
- `room` — the full room string from Albert. Special values:
  - the literal `"No Room Required"` when Albert says so explicitly,
  - `null` when the meeting line omits a room entirely.
- `building`, `room_number` — parsed convenience fields. `null` when
  `room` is `"No Room Required"`, `null`, or unparseable.
- `instructors` — array of `"Last, First"` strings. Multiple instructors
  are `;`-separated in Albert (`"Hashaikeh, Raed; Salim, Wahib"`) — split
  and trim. **May be empty** (some sections list no instructor).

## Conflict semantics

Two meetings conflict iff:

1. Their date ranges overlap (inclusive), AND
2. They share at least one day in `days`, AND
3. Their time intervals overlap.

A section conflicts with another section iff any meeting from one
conflicts with any meeting from the other. A meeting with empty `days`
or null times cannot conflict with anything (conservative).

Crucially: a `Mon 10:00-11:00` meeting in session `A71` does NOT conflict
with a `Mon 10:00-11:00` meeting in session `A72`, because their date
ranges don't overlap.

## User config schema

`data/user.json`:

```jsonc
{
  "schema_version": "1.1",
  "student": {
    "name": "string",
    "netid": "string",
    "program": "string",
    "year": "Freshman | Sophomore | Junior | Senior"
  },
  "preferences": {
    "avoid_before": "HH:MM or null",
    "avoid_after": "HH:MM or null",
    "lunch_window": ["HH:MM", "HH:MM"] /* or null */,
    "preferred_instructors": ["Last, First", "..."],
    "avoid_instructors": ["..."],
    "preferred_sessions": ["A71", "A72", "AD"],
    "weight_morning": 1.0,
    "weight_lunch": 2.0,
    "weight_instructor": 3.0
  },
  "plans": [
    {
      "name": "Plan A",
      "committed_sections": ["20668", "20670", "..."],
      "staged_sections": ["..."]
    }
  ],
  "personal_filters": [ /* PersonalFilter[] */ ]
}
```

## Versioning

- Additive/compatible changes bump the minor (1.0 → 1.1).
- Renaming or removing fields bumps the major version.
- When bumping the major, add a migration function in
  `planner/src/migrate.js` that upgrades old JSON to the new shape. Don't
  break friends' saved files.

## Changelog

### 1.1.2 (2026-04-24)

- `Course.no_sections_offered` — new boolean field. `true` when Albert
  declared `"No Classes Scheduled for the Terms Offered"` inside a
  course block, distinguishing deliberate catalog state from parser
  failure. Suppresses the `no_sections` warning in that case.
- `Course.has_topics` — new boolean field. `true` when the course
  block contained any `Topic:` line. Downstream UI uses this to
  decide whether to surface topic strings in section pickers.
- `Section.topic` — new nullable string. Captured from `Topic:` lines
  that precede (or appear inside) a section's block. Preserves the
  "one catalog entry, many topic variants" shape without introducing
  a new data-model concept.
- `Section.display_timezone` — new nullable string. Parsed from the
  `"Class Times are shown in the <city>, <country> time zone. …"`
  disclaimer that Albert inserts inside global / study-away section
  blocks. Value is the `<city>, <country>` substring verbatim.

### 1.1.1 (2026-04-24)

- `Section.status.type`: added `"unknown"` as an escape hatch for raw
  status strings the ingester does not recognize. Always accompanied by
  an ingester warning; `raw` is still preserved.

### 1.1 (2026-04-23)

- `status.type`: added `"cancelled"`.
- `status.count`: `number | null`; `0` is a legal waitlist count.
- New `Section.requires_consent: boolean`.
- New `Section.title_flags: string[]` (e.g. `["WO"]`).
- New `Section.last_updated_from_paste: string` (ISO).
- `Meeting.room`: explicit `"No Room Required"` literal or `null`.
- `Meeting.instructors`: may be empty.
- `Meeting.start_time`, `end_time`, `days`: may be null/empty for
  date-range-only meetings.
- `Course.units`: `number | { min, max }`.
- `Section.notes`: `string | null` (from Albert `Notes:` blocks).
- `source` field added at top level, replacing the old scraper-specific
  `scraped_at` + `source` URL pair.
- `linked_components`: documented as always-empty from the ingester;
  heuristic lives in the planner.

### 1.0 (initial)

Scraper-oriented schema. Deprecated alongside the bulletins scraper.
