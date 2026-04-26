# Horarium

A schedule planner for NYU Abu Dhabi students. Local-first, browser-only,
no accounts.

You paste your search results from NYU Albert; Horarium parses them, lets
you stage sections onto a calendar, and (optionally) generates schedule
combinations from a wanted-expression you build in a small logic UI.

## Why not scrape?

NYU's public catalog API at `bulletins.nyu.edu/class-search/` is clean
JSON, but intentionally strips the fields scheduling needs — instructors,
rooms, seat counts, per-section statuses. All of that lives only in
Albert, which requires login. Credentialed scraping is off-limits, so we
meet the user where the data is: copy-paste preserves everything.

## What it does

- **Paste from Albert** → parser turns the page into structured
  course/section records (`planner/src/ingester/`).
- **Browse and stage** → a picker (subjects → courses → sections) with
  type, status, day, and time filters. Click `Stage` on a section to add
  it to the active plan; the calendar fills in immediately.
- **Multiple plans** → sandbox different arrangements side-by-side.
  Promote a candidate to active when you're sure.
- **Section linking** → tie a Lecture to a particular Lab so they move
  together when picking.
- **Personal-time filters** → block out hours (workout, meals) the
  auto-scheduler should avoid.
- **Auto-scheduler** → declare a wanted expression (`A AND (B OR C)`-style
  with rainbow-bracket nesting), shelve whole subjects to defer ("any
  course from CSTS"), generate ranked candidates, preview, pick.
- **Workshop** → author your own custom courses for one-offs that
  aren't in Albert.
- **Compare with friend** → import their schedule pack, see shared free
  hours.
- **Export** → PNG (calendar or table view) with privacy toggles, JSON
  data dump.
- **Themes** → Editorial / Coffee / Futuristic / Nature.
- **Field Guide** → in-app encyclopedia explaining every feature
  (`? Guide` button in the nav).

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
cloud. Storage is opt-in (localStorage with a one-time consent prompt).

## Hosting

Open `planner/index.html` directly, or serve the folder locally:

```bash
git clone <repo-url> horarium
cd horarium
npx serve planner
```

Then in the planner: hit the **Catalog** tab, paste a subject's Albert
search results (the entire page including the `1 – N results for: ENGR-UH`
header), and let it parse. Repeat per subject.

## Data model

Plans store section references by `class_number` only. The actual section
data — meeting times, instructors, rooms, status — lives in the catalog
and is resolved live on every render. Re-pasting a subject updates the
plan view automatically; if a section's class number disappears, the
plan still tracks the ref but the calendar quietly drops the tile.

See [docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md) for the full schema
contract.

## Development

```bash
cd planner
npm install
npx vitest run        # full unit + integration suite
npx serve .           # local server on port 3000
```

The codebase is intentionally framework-free. The planner is a single
`index.html` plus ES modules under `planner/src/`. Tests use Vitest; the
parser is exercised against real Albert paste fixtures under
`planner/src/ingester/fixtures/`.

## Documentation

- [planner/README.md](planner/README.md) — module map, conventions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, decisions, tradeoffs
- [docs/SETUP.md](docs/SETUP.md) — install and run
- [docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md) — the JSON contract between modules
- [docs/ROADMAP.md](docs/ROADMAP.md) — phased plan

## Status

Functionally complete for personal use. Auto-scheduler with category
shelving, fill-in flow, and full preview/pick pipeline. Onboarding via
welcome card + 16-card Field Guide. 484 unit/integration tests passing.
