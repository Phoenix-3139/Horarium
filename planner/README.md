# planner/

Static HTML/JS schedule planner. Hosts the paste ingester (Phase 1) and
consumes the catalog store produced by it.

## Structure (current state: legacy single-file; refactored across Phase 1 & 2)

```
planner/
├── index.html                 # Entry point (Phase 2)
├── legacy/                    # Original single-file planner
│   └── Tarun_Fall_2026_Schedule_Planner.html
├── src/
│   ├── ingester/              # Phase 1
│   │   ├── parse.js           # rawText → {courses, sections, warnings, stats}
│   │   ├── merge.js           # upsert into catalog store by class_number
│   │   ├── store.js           # localStorage/IndexedDB wrapper
│   │   ├── ui.js              # Paste panel + preview
│   │   ├── parse.test.js      # runs against fixtures
│   │   └── fixtures/          # real Albert paste snapshots (.txt)
│   ├── main.js                # Phase 2
│   ├── calendar.js
│   ├── conflicts.js
│   └── export.js
└── styles/
    └── main.css
```

## Principles

- No build step. Plain HTML/JS/CSS.
- No framework. Vanilla DOM, ES modules in the browser.
- Ingester is a pure function — no DOM or storage access; the UI layer
  wires it up.
- Catalog lives in browser storage; exportable as a JSON file matching
  `docs/DATA_SCHEMA.md` v1.1.

## Why this choice

The existing legacy planner is already sophisticated. A React rewrite
would burn weeks and lose features. Incremental migration is the better
path.

If we ever want framework features (component isolation, hot reload),
that's a discussion for its own phase.
