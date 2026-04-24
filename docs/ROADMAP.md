# Roadmap

Five phases, each delivering a usable increment. Don't start Phase N+1
until Phase N is working end-to-end.

## Phase 1 — Paste ingester (current)

**Goal:** Turn a chunk of copy-pasted Albert search-results text into
structured Course/Section records conforming to `DATA_SCHEMA.md` v1.1,
merged into a persistent browser-side catalog store.

- [ ] `planner/src/ingester/parse.js` — pure function
      `parse(rawText) → { courses, sections, warnings, stats }`. No DOM,
      no storage access.
- [ ] `planner/src/ingester/fixtures/` — real Albert text captures (user
      will drop `.txt` files for ENGR-UH and PHYED-UH as first fixtures).
- [ ] `planner/src/ingester/parse.test.js` — tests against fixtures. No
      network, no DOM. Runs in Node via a lightweight runner or in the
      browser via a minimal harness.
- [ ] `planner/src/ingester/merge.js` — upsert by `class_number` into the
      catalog store. Last paste wins; preserves
      `last_updated_from_paste` per section.
- [ ] UI: "Paste from Albert" panel with a textarea, a Parse button, and
      a results preview showing:
  - (a) course count parsed
  - (b) section count parsed
  - (c) lines/sections the parser couldn't handle (warnings)
  - (d) header sanity check: `"X results" parsed vs Y expected`
- [ ] Catalog store: `localStorage` is fine to start; move to IndexedDB
      if size becomes an issue.
- [ ] Export: "Download catalog JSON" button that emits the current
      store as a v1.1 schema file.

**Acceptance:** Pasting a full Albert ENGR-UH subject results page
produces a catalog entry for every non-duplicate section, the summary
reports the header's expected count, and any unhandled lines are shown
to the user (not silently dropped).

### Edge cases the parser must handle

See DATA_SCHEMA.md for the contract. Specific real-world cases:

- Duplicate/triplicate section blocks — dedupe by `class_number`.
- Status values: `Open`, `Closed`, `Wait List (N)` (N ≥ 0), `Cancelled`.
- Cancelled sections have no meeting rows.
- Rooms: may be a full room string, the literal `"No Room Required"`, or
  omitted from the meeting line entirely.
- Instructor clause (`with <names>`) optional; may be `;`-separated
  multi-instructor.
- Meetings may lack day/time — e.g. `10/26/2026 - 12/14/2026 at Campus
  Center Room E047`.
- `Notes:` block may follow meeting lines — capture verbatim.
- `Requires Department Consent` flag line between `Section:` and `Class
  Status:`.
- Units can be a range (`2 - 4 units`).
- Title may carry a `WO` prefix (women-only) — strip to `title_flags`.
- Section codes are free-form strings.
- Header line `"1 - 56 results for: ENGR-UH | Total Class Count: 141"` —
  surface the numbers for the sanity check.

## Phase 2 — Planner integration

**Goal:** Replace the legacy planner's hardcoded catalog with the
ingester-populated catalog store.

- [ ] Move the existing single-file planner into `planner/legacy/` as-is.
- [ ] Create `planner/index.html` that reads the catalog store on load.
- [ ] Port the catalog picker (the "Cores" module) to read from the
      store instead of the embedded arrays.
- [ ] Port the conflict detection logic from the legacy planner,
      preserving session-aware rules.
- [ ] Staleness warnings driven by `last_updated_from_paste`.
- [ ] "Switch term" dropdown listing terms found in the store.
- [ ] Import/export catalog JSON (friends can share a catalog file).
- [ ] Linked-component heuristic lives here, not in the ingester.
- [ ] Migrate user state (plans, filters) into the same store or a
      sibling `user.json`.

**Acceptance:** A fresh clone + a few paste-ingests produces a fully
functional schedule planner with current data. No hardcoded courses
anywhere in the planner code.

## Phase 3 — Auto-scheduler

**Goal:** Generate ranked schedule candidates from a list of required
courses.

- [ ] Preferences UI in the planner. Tab: "Generate".
- [ ] CSP backtracker in `scheduler/src/solver.js`.
  - Variables = required courses
  - Domain = sections filtered by preferences
  - Constraints = pairwise section conflicts, linked components jointly
    chosen (using the planner's heuristic linkage)
- [ ] Scoring in `scheduler/src/score.js`.
  - Morning vs. evening weight
  - Lunch window preservation
  - Instructor preferences
  - Session balance (avoid all-A71 or all-A72 loading)
  - Long-day penalty
- [ ] Top-N results rendered as selectable cards. "Use this" stages the
      sections into a new plan.
- [ ] Infeasibility handled gracefully: show the closest near-miss and
      which constraint was violated.

**Acceptance:** Given 5 required courses, the scheduler produces at
least one valid schedule (if one exists) in under 1 second, ranked by
preference score.

## Phase 4 — Seat monitoring (optional, needs host)

**Goal:** Watch specific closed/waitlisted sections and alert when they
open.

First feature that needs persistent hosting. Without scraping bulletins
this becomes more constrained — it relies on either the Phase 5
extension running periodically in a logged-in tab, or the user re-pasting
on a cadence. Options:

1. Phase 5 extension running in the user's browser with alarms.
2. Cron on an always-on laptop running a browser automation that is
   logged into Albert (effectively a user-driven bot). Higher friction.

Tasks:

- [ ] Diff logic: compare current store vs. previous snapshot per
      `class_number`; detect status transitions.
- [ ] Webhook sink abstraction (Discord / Telegram / email).
- [ ] Subscription UI: star a class number to watch.
- [ ] Integrates with the Phase 5 extension as the default runner.

**Acceptance:** A closed class flipping to Open triggers a webhook in
under 30 minutes while the watcher is running.

## Phase 5 — Browser extension (promoted)

**Goal:** Automate the paste step. A WebExtension reads rendered Albert
pages and sends structured data straight into the planner's catalog
store.

This phase used to be optional. With bulletins deprecated as a source,
it's the clear path to frictionless ingest.

- [ ] WebExtensions manifest targeting Chrome and Firefox.
- [ ] Content script that activates on Albert class-search, shopping
      cart, and enrolled-courses pages.
- [ ] DOM parser that mirrors the Phase 1 text parser's output schema.
      Shared test fixtures where possible.
- [ ] "Send to Horarium" action — either a button on the page or an
      automatic background sync — that POSTs parsed data to the local
      planner (`localhost:3000/api/ingest`) or writes via a shared
      storage key.
- [ ] Planner accepts the ingest and merges it.

**Acceptance:** Student logs into Albert, navigates to a search result
or their enrolled courses, and the planner updates with current data
including rooms and class numbers — no copy-paste.

## Nice-to-haves (no phase)

- Prerequisite graph visualization
- Degree-progress tracker
- Instructor rating integration
- Multi-term view for long-range planning
- Export plan directly to Notion / Apple Calendar
