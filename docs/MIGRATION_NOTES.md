# Migration Notes

Bridge doc between the legacy single-file planner
(`planner/legacy/Tarun_Fall_2026_Schedule_Planner.html`) and the
Phase 2 store-backed planner (`planner/index.html`). Consolidates the
shape-mismatch discoveries from the Prep 2 audit so the plan-state
extraction later doesn't re-discover the same deltas.

## The two concepts the legacy blob tangles

The legacy `SCHED_DATA` const mixes two things that Phase 2 separates:

1. **Catalog** — what courses/sections exist at NYU for this term. Owned
   by the `createCatalog()` store now.
2. **User plans** — a specific student's committed sections and pending
   core/PE picks. Will become its own module (plan-state extraction)
   between 3b and 3c.

Prep 3's tight scope swaps only the catalog half. The plan half moves
intact into a `placeholder_user_plan.js` module so the existing Primary /
Backup plan tabs keep rendering unchanged until the extraction phase.

## Shape differences — legacy → new catalog

| Legacy location | New-catalog equivalent | Notes |
|---|---|---|
| `SCHED_DATA.sections["LinAlg"]` | `catalog.getEffective().courses[i].sections[j]` looked up by `class_number` | Short-key indexing (`"LinAlg"`) has no analogue. The adapter fakes it during Prep 3 by mapping from the first `class_nums[0]` back to a Section. |
| `SCHED_DATA.sections[k].course` | `course.subject + ' ' + course.catalog_number` | Legacy carries a short course alias (`"LinAlg"`, `"Statics"`); new catalog uses the NYU code (`"MATH-UH 1022"`). Short-alias fallback lives in `placeholder_user_plan.js`. |
| `SCHED_DATA.sections[k].prof` | `section.meetings[0].instructors[0]` | Legacy picks one primary instructor; new catalog preserves the full array. |
| `SCHED_DATA.sections[k].class_nums` | `section.class_number` (and its linked auxiliary sections) | Legacy bundles a lecture + its paired lab/rec under one "section" entry. New catalog keeps them as independent sections; the pairing is a planner-layer heuristic. |
| `SCHED_DATA.sections[k].meetings[m]` = `[days, startMin, endMin, session, component]` | `section.meetings[m]` = `{ days, start_time, end_time, start_date, end_date, room, building, room_number, instructors }` | **Representation change.** See next section. |
| `ROOM_DATA[course][section_label]` | `section.meetings[0].{ room, building, room_number }` | Legacy split rooms into a sibling lookup because `SCHED_DATA.sections[k].meetings` tuples had no room. New catalog carries rooms on the meeting itself. |
| `SCHED_DATA.cores` | `catalog.getEffective().courses` filtered to elective subjects (`CADT-UH`, `PHYED-UH`, etc.) | Legacy flattens cores into a picker list; new shape preserves course → sections hierarchy. The adapter flattens on read. |
| `SCHED_DATA.conflicts[optIdx][coreId]` | Computed on read via session-aware conflict detection | Precomputed tuples in legacy; dynamic in the new model. |
| `SCHED_DATA.options` | `user.plans[]` (future) | Plan-state, not catalog. Stays in `placeholder_user_plan.js` until the extraction phase. |
| `SCHED_DATA.analysis[optIdx]` | `user.plans[i].analysis` (future) | Same. |

## Minutes-as-int vs "HH:MM"

Legacy meetings encode time as minutes-since-midnight integers:
`[["M","W"], 765, 840, "AD", "Lecture"]` = MW 12:45pm–2pm (765 = 12*60+45,
840 = 14*60). The whole render pipeline (calendar grid cells, conflict
detection, ICS export, PNG) reaches into `meetings[m][1]`/`[2]` for
start/end.

New catalog stores `"HH:MM"` strings (`"12:45"`, `"14:00"`).

Both representations are lossless. We need two tiny helpers in the
adapter or the format-lookup section:

```js
const toMin = (hhmm) => { const [h,m] = hhmm.split(':').map(Number); return h*60+m; };
const toHHMM = (min) => `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;
```

For the Prep 3 swap, the adapter translates `"HH:MM"` → minutes-int
when returning sections in the legacy shape, so the render pipeline
keeps working without touching every minute-arithmetic call site.

## Day-code difference

- Legacy: single-char (`"M"`, `"T"`, `"W"`, `"Th"`, `"F"`) — `"Th"` is
  two characters, an irregularity.
- New catalog: three-letter (`"Mon"`, `"Tue"`, `"Wed"`, `"Thu"`, `"Fri"`,
  `"Sat"`, `"Sun"`).

Adapter maps `{"Mon":"M", "Tue":"T", "Wed":"W", "Thu":"Th", "Fri":"F",
"Sat":"S", "Sun":"Su"}` in the direction of legacy shape.

## Session codes

Identical in both (`"A71"`, `"A72"`, `"AD"`). No translation needed.

## Component names

Legacy uses free strings already matching Albert's forms (`"Lecture"`,
`"LAB"`, `"Recitation"`, `"Seminar"`, `"PE"`). New catalog uses the
canonical Albert forms. The one oddity: legacy has `"PE"` which isn't in
Albert's vocabulary — physical education shows as `"Studio"` on Albert.
Adapter preserves legacy's `"PE"` spelling when it comes from the
placeholder plan (non-catalog data); anything coming from the catalog
keeps its canonical Albert value.

## Things that do NOT migrate (constants, not data)

`SESSION_DATES`, `DAY_TO_RRULE`, `DAY_TO_JS`, `DAY_LABELS`, `MODULE_DEFS`.
These are format lookups / UI config, not catalog data. Leave them in
place at their current lines.

## When the adapter disappears

The `legacy_adapter.js` module is scaffolding for exactly one transition:
"UI code changes from reading `SCHED_DATA` to reading from the adapter,
one call site at a time." Once every call site is on the adapter AND
the plan-state extraction has lifted the `options`/`conflicts`/`analysis`
half into its own module, the UI will read directly from
`catalog.getEffective()` plus a plan-state module, and the adapter gets
deleted. Track this in `TODO.md` if we add one; otherwise, grep for
`legacy_adapter` when planning the post-3b refactor.
