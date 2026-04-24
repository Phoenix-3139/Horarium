# Claude Code Instructions for Horarium

This file is read by Claude Code on every session. Keep it authoritative
and current.

## Project summary

Horarium is a three-part local tool for NYU Abu Dhabi students:

1. `planner/src/ingester/` — browser-side parser that turns copy-pasted
   Albert search-results text into structured Course/Section records.
2. `planner/` — static HTML/JS schedule planner that consumes the
   ingester's output from a browser-side catalog store.
3. `scheduler/` — pure-JS CSP solver that generates schedule options.

Data flow: Albert paste → ingester (in-browser) → catalog store →
planner & scheduler.

## History: why no scraper

We originally planned a Node scraper against
`bulletins.nyu.edu/class-search/`. That API exists and is clean JSON,
but it does **not** expose instructors, rooms, seat counts, or
per-section statuses — any term, any srcdb. Those fields only live in
Albert, which is authenticated. Credentialed scraping is off-limits. So
we pivoted to paste-ingest: the user is already logged into Albert, and
copy-paste preserves everything.

The scraper directory, Node workspace setup, and `cheerio` dependency
were deleted as part of this pivot. Do not reintroduce them.

## Core principles

- **Local-first, browser-only.** No cloud services, no auth, no
  accounts, and (for Phase 1) no Node runtime for end users. Everything
  runs in the browser.
- **Lightweight deps.** Prefer zero-dep solutions. Do not add frameworks
  (React, Next, etc.) without explicit discussion.
- **Respect NYU.** Never hit authenticated endpoints
  (`sis.nyu.edu/psc/...`). The ingester only processes text the user
  already has — no network calls at all in Phase 1.
- **Schema stability.** `docs/DATA_SCHEMA.md` is the contract between
  ingester, planner, and scheduler. Breaking changes bump the major
  version and require a migration function.

## Tech stack

- **Runtime:** the browser. No Node required to use the planner.
- **Language:** plain JS (ES modules). TypeScript only if introduced
  later with explicit justification.
- **Parser deps:** none. Text-in → JSON-out, written by hand.
- **Planner:** plain HTML/JS/CSS, no build step, no framework. The
  legacy single-file planner lives at
  `planner/legacy/Tarun_Fall_2026_Schedule_Planner.html`.
- **Scheduler:** pure JS, no dependencies. Backtracking CSP.
- **Testing:** lightweight test runner. Fixtures live under
  `planner/src/ingester/fixtures/` as `.txt` snapshots of real Albert
  pastes. No network in tests.

## File conventions

- ES modules, one responsibility per file.
- Fixtures are raw `.txt` captures named after what they represent
  (e.g. `fall2026-engr-uh.txt`).
- Generated/exported data lives in `data/`, gitignored. Never commit
  student pastes — they may identify the student via their view.

## Commands

- Open `planner/index.html` in a browser, or `npx serve planner`.
- Tests (once added): TBD — likely `node --test` against DOM-free
  modules, or a minimal browser-compatible runner for UI code.

## What to always do

- Before changing the parser, add or update a fixture capturing the
  case.
- Treat `docs/DATA_SCHEMA.md` as authoritative. Parser output must
  match.
- When adding a dependency, justify it. Preference: zero-dep > single
  small lib > framework. Phase 1 should remain zero-dep.

## What to never do

- Never introduce a Node scraper against `bulletins.nyu.edu` or Albert.
- Never hit `sis.nyu.edu/psc/...` — authenticated.
- Never store NYU credentials. Anywhere.
- Never hardcode student-specific data (netID, name, course selections)
  in the codebase. Goes in `data/user.json`, gitignored.

## Terminology

- **Session** — NYUAD's half-term codes. `A71` = first half, `A72` =
  second half, `AD` = full term. Classes in `A71` never conflict with
  classes in `A72` even at the same day/time.
- **Class number** — NYU's 5-digit registration ID (e.g. `20668`).
  Primary key for sections; upserts happen on this field.
- **Linked component** — a required pairing (e.g. Lecture + Lab).
  Albert's text does NOT expose pairings explicitly. Ingester emits
  empty `linked_components`; planner applies a heuristic at display
  time.

## When in doubt

Stop and ask. The user would rather answer one question than undo a bad
architectural decision.
