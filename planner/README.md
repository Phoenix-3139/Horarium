# planner/

Static HTML / JS schedule planner. The whole app loads from `index.html`
plus ES modules under `src/`. No build step.

## Layout

```
planner/
├── index.html             # entry point — markup, CSS, classic boot script
├── src/
│   ├── ingester/          # Albert paste → structured course/section JSON
│   │   ├── parse.js
│   │   ├── course.js
│   │   ├── section.js
│   │   ├── helpers.js
│   │   └── fixtures/      # real Albert paste snapshots (.txt)
│   ├── store/             # in-memory + localStorage persistence
│   │   ├── catalog.js     # parsed + edits + plans + imports
│   │   ├── persistence.js # localStorage wrapper, consent model
│   │   └── pack.js        # share/import schedule packs
│   ├── scheduler/         # CSP solver + scoring + preview projection
│   │   ├── requirements.js
│   │   ├── solver.js
│   │   ├── scoring.js
│   │   └── preview.js
│   └── ui/                # planner-side helpers (DOM-aware modules)
│       ├── main_planner.js
│       ├── picker.js
│       ├── browse.js
│       ├── edit.js
│       ├── manage.js
│       ├── modal.js
│       ├── components.js
│       ├── filter_overlay.js
│       ├── author.js
│       ├── themes.js
│       └── warning_copy.js
├── prototypes/            # static UI sketches kept around for reference
└── legacy/                # original single-file planner (frozen, gitignored)
```

Every module under `src/` ships with a sibling `.test.js` exercised by
Vitest.

## Principles

- **No build step.** Everything is plain ES modules loaded by the
  browser. `index.html` is the entry point, full stop.
- **No framework.** Vanilla DOM. The trade-off: `index.html` is large.
  The trade-off back: it loads instantly and never breaks on a tooling
  upgrade.
- **Pure where possible.** Modules under `src/scheduler/`,
  `src/ingester/`, and the data-shaping helpers in `src/ui/` are
  side-effect-free and unit-tested. DOM I/O lives in `index.html` (and
  in `src/ui/modal.js` for the custom modal).
- **Sparse-edits overlay.** The catalog stores parsed Albert output
  *and* a separate per-field edits map. Edits never mutate the parsed
  data; reads compose them at access time. See `src/store/catalog.js`.
- **Local-first.** Persistence is opt-in via a one-time consent prompt.
  Three modes: `save_always`, `session_only`, `never`. See
  `src/store/persistence.js`.

## Conventions

- ES modules, one responsibility per file.
- Tests use Vitest in `node` environment unless they need DOM (those
  use `jsdom`).
- Fixtures are raw `.txt` captures named after what they represent
  (`engr-uh-fall2026.txt`).
- The catalog's mutators all fire pub/sub notifications via
  `subscribe()`. The boot script in `index.html` listens once and
  orchestrates re-renders.
- The auto-scheduler's wanted-expression is a free-form
  AND/OR tree (`{ root: ExprNode | null }`). It's compiled to CNF
  clauses just before the solver runs.

## Running

```bash
npm install               # only dev deps (vitest, @vitest/ui, jsdom)
npx vitest run            # full test suite
npx serve .               # local server on port 3000
```

Or just `open index.html` directly — `file://` works because there's no
build step. (Note: some MIME-strict browsers may refuse module imports
from `file://`. Use `npx serve` if so.)

## Tests

Run from this directory:

```bash
npx vitest run            # one-shot
npx vitest                # watch mode
npx vitest run src/store  # filter by path
```

The suite covers:

- Parser correctness against real Albert pastes (every quirk we've
  seen so far has a fixture).
- Catalog mutations (idempotency, edit-overlay composition,
  toJSON/fromJSON round-trip with shape migrations).
- Persistence (consent transitions, debounced writes, quota handling).
- Scheduler (CNF mapping, solver candidates, scoring, preview projection).
- UI helpers (filter predicates, picker query parsing, conflict
  detection, browse summary builders).
