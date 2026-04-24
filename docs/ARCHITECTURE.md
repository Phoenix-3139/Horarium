# Architecture

## System overview

Three modules, one shared data contract. Everything runs in the browser.

```
┌───────────────────────────────────────────────────────────────┐
│            NYU Albert — subject search results page           │
│            (authenticated, user-rendered)                      │
└────────────────────────────┬──────────────────────────────────┘
                             │ copy-paste (text)
                             ▼
              ┌──────────────────────────────────┐
              │  planner/src/ingester/            │
              │                                   │
              │  raw text → parse → validate      │
              │  upsert by class_number          │
              └──────────────────┬────────────────┘
                                 │
                                 ▼
                      ┌─────────────────────┐
                      │  catalog store       │    ◄── schema in DATA_SCHEMA.md
                      │  (IndexedDB / JSON)  │
                      └──────────┬──────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                                ▼
      ┌──────────────────┐            ┌────────────────────┐
      │  planner  (UI)   │            │ scheduler  (JS)    │
      │                  │            │                    │
      │  stage courses   │            │  CSP backtrack     │
      │  detect conflicts│◄───────────│  score options     │
      │  export ics/png  │            │  return top N      │
      └──────────────────┘            └────────────────────┘
```

## Why paste-ingest, not scrape

`bulletins.nyu.edu/class-search/` is public and backed by a clean JSON API
(`POST /class-search/api/?page=fose&route=search|details`). We built a
scraper against it and discovered — empirically, across multiple terms —
that the bulletins API strips the fields that matter for scheduling:

- no instructor names
- no rooms/buildings
- no seat counts or waitlist depths
- only a coarse `"Active"` status (not Open/Closed/Wait List)

All of those live behind authentication at `sis.nyu.edu/psc/...` (Albert).
Credentialed scraping is off the table: it would require storing NYU
passwords or copying session cookies, both bad ideas.

So we invert the flow: the user is already logged into Albert, their
browser is already rendering the full data, and copy-paste preserves
every field we need as plain text. The cost is one manual step per
subject, which for a CompE student is ~5 paste actions per term. We make
that fast and visible.

## Why three modules, not one monolith

Each module is independently replaceable. The ingester could be
rewritten as a browser extension (Phase 5 — removes the paste step
entirely), the planner could be moved to a framework, the scheduler could
be swapped for a SAT solver — and none of the others would need to change
as long as the schema in `DATA_SCHEMA.md` holds.

When Albert's page format changes, only the ingester breaks, and the fix
is scoped to one parser + new fixtures.

## Data freshness strategy

Ingestion is user-driven. Every paste gets a `last_updated_from_paste`
timestamp per section; the planner shows staleness warnings when a
committed section's data is older than some threshold.

Course structure (names, meeting patterns, instructors, rooms) is stable
across a semester. Seat availability changes hourly during registration
week — that's the Phase 4 use case for a scheduled re-scrape, or better,
the Phase 5 extension that re-ingests silently while the user is on
Albert.

## Why browser-side, not Node

Previously the scraper needed Node (for `fetch` and HTML parsing). The
ingester is pure text→JSON — no network, no filesystem. A plain JS module
loaded by the planner is sufficient. Removing Node:

- No install step for end users beyond "open the HTML file."
- No `package.json` workspace machinery, no `tsc`, no `vitest` runner.
- Tests run via a lightweight in-browser runner or vitest-for-browser if
  we want CI.

Node+cheerio are no longer dependencies.

## Why no database

The dataset is small (a few thousand sections per term) and read-heavy.
The catalog lives in `localStorage` or `IndexedDB` in the browser, which
is fast enough, survives reloads, and is per-user private.

Exportable as JSON matching DATA_SCHEMA.md so friends can share catalog
files — the same contract the old scraper was going to produce.

## Conflict detection

Two sections conflict iff:

1. They overlap in real calendar time — their session date ranges
   overlap (e.g. both in `A71`, or one `AD` and the other in either
   `A71` or `A72`).
2. AND they share a meeting day.
3. AND their start/end times overlap.

Session overlap matters: an `A71` course and an `A72` course at the same
day/time do NOT conflict because they don't run concurrently. The
planner's legacy code already gets this right; port it faithfully.

## Scheduler approach

The problem is a standard CSP:

- **Variables**: each required course.
- **Domain**: candidate sections for that course (filtered to those with
  seats, matching user preferences on session, instructor, time window).
- **Constraints**: no pairwise conflicts between chosen sections; linked
  components (Lec+Lab) are jointly chosen.
- **Objective**: maximize a score that rewards user preferences (morning
  classes, preferred instructors, lunch break preserved, fewer long days).

A depth-first backtracking search with constraint propagation is
sufficient. For 5-6 courses with 2-4 sections each, the search space is
≤ 4^6 = 4096 nodes before pruning. Runs in milliseconds client-side.

## Linked components

Albert's search-result text lists sections of the same course as
siblings; it does not always say "this LEC pairs with this LAB". The
ingester emits `linked_components: []` (honest) and the planner applies a
heuristic at display time — typically: within one course, group lectures
with their auxiliary sections by section-code prefix or by session.

Keeping the heuristic in the planner (not the ingester) keeps the parser
dumb and the heuristic swappable as we learn more.

## What the planner keeps doing

The existing single-file planner handles:

- Modular tab system with draggable modules
- Calendar + table views with session-aware rendering
- Personal time filters with color/pattern styling
- Friend comparison via JSON import
- Export to .ics / PNG / JSON
- Visual config modal with drag-and-drop

None of that changes structurally. What changes: the hardcoded course
catalog embedded in the HTML is replaced by the ingester-populated
catalog store. A "Paste from Albert" module and a new "Generated" module
(output of the scheduler) integrate into the existing tab system.

## Browser extension (Phase 5)

The ingester solves the "get structured course data out of Albert" problem
via manual paste. A WebExtension solves the same problem by reading the
rendered DOM directly while the user is on Albert, eliminating the copy
step. Orthogonal to everything above — same schema, different surface.
