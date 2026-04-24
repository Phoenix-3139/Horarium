# Setup

## Prerequisites

- A modern browser (current Chrome, Firefox, Safari, or Edge).
- **Optional:** Node.js 20+ only if you want `npx serve` for a local
  static server. Otherwise, opening `planner/index.html` directly works.
- Git, to clone the repo.

Phase 1 runs entirely in the browser. There is no build step, no Node
dependency for end users, and no package install required to use the
planner.

## Install

```bash
git clone <repo-url> horarium
cd horarium
```

That's it. Nothing to install for Phase 1.

## Running the planner

Either:

```bash
npx serve planner          # http://localhost:3000
```

or open `planner/index.html` directly in your browser.

## Ingesting data from Albert

1. Log into Albert, open the class-search view for the subject you want
   (e.g. ENGR-UH, PHYED-UH).
2. Select all results text on the page (`Cmd+A` / `Ctrl+A`, or just the
   results container) and copy (`Cmd+C` / `Ctrl+C`).
3. In the planner, open **Paste from Albert**.
4. Paste into the textarea and click **Parse**.
5. Review the summary:
   - course count / section count parsed
   - any lines the parser didn't understand (warnings)
   - `parsed vs expected` sanity check against Albert's header
6. If the summary looks right, click **Merge** to upsert into the
   catalog store.

Repeat per subject. One good paste per subject per term is usually
enough — re-paste only when you need fresh seat counts or when Albert
updates section details.

## Exporting the catalog

In the planner, click **Export catalog JSON**. This writes a file
matching `docs/DATA_SCHEMA.md` v1.1. Share it with friends by sending
the `.json` file; they import it via **Import catalog**.

## Running the scheduler

The scheduler is invoked from inside the planner — no standalone CLI.
Stage the courses you're required to take, open the **Generate** tab,
set preferences, hit Generate. Top candidates appear as selectable
options.

## User configuration

The planner stores preferences (name, weights, plans) in browser
storage. You can export them as `user.json` for backup or to move to
another machine. This file is gitignored — safe for personal info.

Example `user.json`:

```json
{
  "schema_version": "1.1",
  "student": {
    "name": "Your Name",
    "netid": "abc123",
    "program": "CompE BS",
    "year": "Sophomore"
  },
  "preferences": {
    "avoid_before": "09:00",
    "avoid_after": "18:00",
    "lunch_window": ["12:00", "13:30"],
    "preferred_instructors": [],
    "avoid_instructors": []
  },
  "plans": [
    { "name": "Plan A", "committed_sections": [] }
  ]
}
```

## Troubleshooting

**Parser warnings after a paste.** The warnings panel shows exactly
which lines the parser skipped. Check whether Albert changed its format
or whether the paste was truncated. Save the offending paste as a
fixture under `planner/src/ingester/fixtures/` and file an issue —
parser fixes live alongside fixtures.

**Parsed count doesn't match Albert's header.** Either the paste was
cut off (scroll down in Albert, paste again) or duplicate sections
appeared and were correctly deduped (that's fine).

**Planner shows no courses after ingest.** Check the browser console.
The catalog store lives in browser storage — clearing site data wipes
it. Re-paste or import a JSON backup.

**Catalog lost after clearing browser data.** Export regularly if the
paste set is big. Phase 5 (extension) will sync automatically.
