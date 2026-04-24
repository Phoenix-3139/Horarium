# Horarium

A course scheduling tool for NYU Abu Dhabi students. Ingests course data
pasted from NYU Albert, feeds clean JSON into a schedule planner, and
auto-generates valid schedule combinations subject to your constraints.

Built because NYU Albert is painful and [Schedge](https://github.com/BUGS-NYU/schedge)
is deprecated as of ~Summer 2023.

## Why not scrape?

We tried. NYU's public catalog at `bulletins.nyu.edu/class-search/` is
backed by a clean JSON API — but that API intentionally strips the fields
that make scheduling possible: no instructors, no rooms, no seat counts,
no per-section statuses. All of that lives only in Albert, which requires
login.

So Horarium meets the user where the data is. You copy-paste Albert's
search results page into the planner; a parser extracts it; the rest of
the tool works on clean structured data.

## What it does

1. **Ingester** — a browser-side parser that turns pasted Albert search
   results into structured course/section records.
2. **Planner** — an interactive schedule editor. Load the catalog, stage
   courses, see conflicts, export to `.ics` / PNG / JSON.
3. **Scheduler** — given a list of required courses and preferences (times,
   instructors, session balance), generates ranked valid schedule
   combinations.

## Architecture

```
 Albert search results (copy-paste)        planner UI
              │                                 │
              ▼                                 ▼
      ┌──────────────┐   upsert        ┌──────────────┐
      │   ingester   │ ──────────────► │  catalog     │
      │ (in browser) │                 │  store       │
      └──────────────┘                 └──────┬───────┘
                                              │
                                              ▼
                                       ┌────────────┐
                                       │ scheduler  │
                                       └────────────┘
```

All of this runs in your browser. No Node runtime, no server, no auth, no
cloud. Paste in, plan, export.

## Hosting

**Runs entirely on your laptop.** Open `planner/index.html` or serve the
folder locally. Share by zipping the repo plus your saved plans.

The only future feature that would need a real server is seat-availability
monitoring (Phase 4). Until then, laptop-local is correct.

## Quick start

See [docs/SETUP.md](docs/SETUP.md).

```bash
git clone <repo-url> horarium
cd horarium
npx serve planner   # or just open planner/index.html
```

Then in the planner: open the **Paste from Albert** panel, paste a subject
search result from Albert, click **Parse**. Repeat for every subject you
care about.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, decisions, tradeoffs
- [docs/SETUP.md](docs/SETUP.md) — install and run
- [docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md) — the JSON contract between modules
- [docs/ROADMAP.md](docs/ROADMAP.md) — phased plan

## Status

Phase 1 (paste ingester) in progress. Planner exists in legacy single-file
form and will be migrated to consume ingester output.
