# Lessons

Running log of mistakes and near-misses from building Horarium. Not
project documentation — the point is to remember *why* I know not to do
a thing, so when the same shape shows up in Phase 5 I don't repeat it.

One short entry per lesson. Date + tag + what I learned.

## 2026-04-23 — fixture-first > regex-first

Wrote the section-block header regex expecting every section to restate
`<CODE> | N units`. Real Albert paste only restates units on the first
section of each course — subsequent sections are bare `<CODE>` lines.
Got 68 false `missing_section_header` warnings on the first real-fixture
run. The walkthrough even said "some sections omit it" and I still
missed it. Rule: before writing any regex against paste data, `grep -c`
the fixture for the exact shapes I think I'll see. Three minutes of
fixture reconnaissance would have caught this.

## 2026-04-23 — "counts from the source" vs "counts after dedup"

Albert's `Total Class Count: 141` counts every `Class#:` line in the
render, including the 2×/3× duplicates. After dedup the real unique
count is 125. My `count_mismatch` warning fires on the 141 vs 125
difference, which is correct — but the first reaction was "my parser
dropped 16 sections." `grep -c "^Class#:"` vs `grep "^Class#:" | sort -u
| wc -l` disambiguated in ten seconds. Rule: when an expected count
looks wrong, check whether the expected number is pre- or post-dedup
before touching parser code.

## 2026-04-24 — warning payloads as first-class debug artifacts

Twice now the user pushed back on a warning whose payload was too
coarse. First: `units_mismatch` needed class_number + course_code +
both values, not just a message string. Second: `duplicate_disagreement`
initially handed out whole-object diffs; needed to recurse to leaf paths
(`meetings[0].room_number`, `status.count`) so the human can read it at
a glance. Rule: a warning is useful iff a reader can debug it without
re-running with more logging. Include the identifying keys, both values
on a diff, and a message that names all of the above.

## 2026-04-24 — path validation as allowlist, not traversal

Started to build a schema-skeleton validator that walked a nested object
to check paths. Gave up and switched to a list of regexes (one per valid
path shape). Was simpler, easier to extend, and the tests read more
cleanly. `units` being dual-formed (scalar OR `{min,max}`) would have
required a union marker in the skeleton; in regex-list form it's just
`/^course\.units(\.(min|max))?$/`. Rule: for a small, enumerable set of
valid paths, a regex list beats a traversal validator.

## 2026-04-24 — nomenclature-harvester school-discovery missed ~5% of prefixes

Ran the `_scrapedData 24-04-2026/scrape.js` harvester to build `docs/NOMENCLATURE.md`. 31 of 685 prefixes came back "unassigned" — reachable via the master `/courses/` index but not via any school's Course Inventory A-Z page. Spot-checked 5 at random: 2 were clear misses of schools the harvester DID reach (`CUSP-GX` lives under Tandon's Applied Urban Science and Informatics MS; `COR2-GB` is a Stern capstone and `COR1-GB` was correctly assigned). So the gap isn't "school doesn't exist" — it's something about how the scraper walks each school's page.

Manual patching via site-search + per-course grading-label inspection ("Ugrd Abu Dhabi Graded", "SPS Non-Credit Graded", "Grad Stern", etc.) closed all 31 in about 40 minutes. Zero genuinely-unassigned prefixes remain.

**Suspected root cause for the next harvester run:**

- Each school's Course Inventory A-Z may paginate differently (alphabetical splits, per-letter pages, per-program sub-pages).
- Cross-disciplinary centers hosted at one school but co-run with others (CUSP = Tandon + CAS + Stern partnership) may only appear via the program page, not the school root.
- Capstone / non-credit prefixes (`COR2-GB`, `NOCR-GB`, etc.) may live in MBA-program pages rather than the Stern A-Z root.
- The `-N?` suffix family (non-credit institutes) and `-CS` family (SPS continuing studies) aren't enumerated in any degree catalog at all; they only exist via `/courses/` slugs.
- **Whole schools can be invisible to the crawl.** The Courant Institute (`CTM-NA`, and likely more prefixes we haven't discovered) isn't a degree-granting school in the bulletin's `/undergraduate/` or `/graduate/` hierarchy but IS a real NYU unit with its own `/courses/` slugs. Traversing by degree catalog alone misses these entirely — no amount of per-school pagination would find them. Future harvester re-runs should seed from a hand-curated list of NYU units (19 schools + Courant Institute + SPS Precollege + American Language Institute + any Schools-of-Continuing-Studies successor + future additions) rather than discovering the school set from `/undergraduate/` + `/graduate/` alone. The curated list is maintainable: NYU adds or renames a school once every few years.

Rule: when a bulk-scrape output has a "can't classify" bucket, inspect a sample before accepting the bucket. A "(unassigned)" label is either a real non-degree unit OR a harvester miss; they need different treatment. Spot-check BEFORE committing the taxonomy downstream.

Flagged suffix → school pattern for the next harvester revision (currently inferred rather than structurally scraped):

```
-UA  College of Arts and Science
-UB  Leonard N. Stern School of Business
-UD  College of Dentistry (undergrad dental hygiene)
-UE  Steinhardt (undergrad)
-UF  Liberal Studies
-UG  Gallatin
-UH  NYU Abu Dhabi (undergrad)
-UN  Rory Meyers College of Nursing
-UT  Tisch (undergrad)
-UY  Tandon (undergrad)
-GA  Graduate School of Arts and Science
-GB  Stern (graduate)
-GE  Steinhardt (graduate)
-GG  Gallatin (graduate)
-GH  School of Global Public Health
-GN  Rory Meyers (graduate)
-GP  Wagner
-GS  Silver
-GT  Tisch (graduate)
-GX  Tandon cross-disciplinary (CUSP)
-GY  Tandon (graduate)
-SHU NYU Shanghai
-LW  School of Law
-MD  Grossman School of Medicine
-ML  Grossman Long Island School of Medicine
-NA  Courant Institute (math outreach, non-credit)
-NE  Steinhardt (non-credit)
-NI  SPS non-credit institutes (American Language Institute, High School Academy)
-NY  Tandon (non-credit / precollege)
-CS  School of Professional Studies (non-credit continuing ed)
```

If the harvester can assert these mappings as a fallback when a prefix doesn't show up under any school's A-Z, it would auto-classify ~95% of the "(unassigned)" bucket without manual intervention.

## 2026-04-24 — "intended but never built" ≠ regression; diagnose before assuming a diff

User reported that the filter-overlay behavior "used to work in the legacy
planner" and Prep 3 broke it. Diagnosis-first discipline caught that the
code paths (`gatherEvents`, `buildGrid`, the filter wraps, and the filter-
cell CSS) were **byte-identical** between `planner/legacy/*.html` and
`planner/index.html`. Presented that finding back to the user, who
confirmed: the feature was *intended* but never actually implemented —
the legacy's filter-as-grid-cell behavior was always what existed, even
though the mental model was "overlay on top of courses."

Lesson: when a user reports "this used to work," a diff-against-baseline
is the first and cheapest move. If the baseline has the same behavior,
push back — you're probably looking at a feature request, not a
regression. Ten minutes of `diff` saved me from inventing a "fix" for
a non-bug and let me scope the real feature (absolute-positioned
overlay layer) explicitly instead of retrofitting it as patchwork.

Corollary: don't trust your own "this feels like a regression" instinct
either. Verify via diff before accepting the framing. The framing
shapes the fix: a regression wants to be reverted; a feature wants to
be designed.

## 2026-04-24 — legacy filter drawer renders inline, not overlaid

Pre-existing bug in the legacy planner: the personal-filters drawer is
supposed to slide over the timetable but instead eats a slot inside it.
Confirmed by diff — my Phase 2 edits didn't touch drawer CSS or
positioning JS. Lives alongside the favicon 404: not a regression, just
one of the legacy's quirks surfaced by Prep 1's "actually use it" pass.
Defer to its own focused fix; don't let it block UI work.

Rule: when a user reports a bug during a refactor, diff the relevant
lines against the pre-refactor baseline before assuming you caused it.
Three minutes of grep saved me an afternoon of chasing a ghost here.

## 2026-04-24 — top-level top-up: greppable declarations don't catch called-at-parse-time code

When I converted `const SCHED_DATA = {big-literal}` into a `let` that
DOMContentLoaded would fill in, I only looked at top-level calls near
`render();`. I missed at least six other scattered top-level calls
(`buildScheduleTable`, `buildCourseList`, `renderComparison`,
`renderFilterList`, `renderNav`, `updateEmptyStates`) that run at script
parse time and read SCHED_DATA. The Schedule tab silently failed
because `buildScheduleTable()` at L5141 crashed on undefined SCHED_DATA.

Fix was to go the other direction — keep SCHED_DATA and HS as
synchronously-available globals (classic `<script src>` for the
placeholder, tiny classic-inline stub for HS, then a module `<script>`
that replaces the stub). Legacy boot code runs unchanged.

Rule: before refactoring the initialization order of a large file, grep
for EVERY top-level call, not just the ones near the declaration you're
moving. Pattern for this codebase: `^[a-zA-Z_][a-zA-Z_0-9]*\s*\(` at
column 0. Better rule: don't defer initialization at all if you can
make the data available synchronously via a stub that returns the same
empty values the real thing would. Stubs-over-defers is the simpler
pattern.

## 2026-04-24 — quota-exceeded silently loses writes; make it loud in UI

Persistence's auto-save debounces writes and surfaces failures only through
a `getAsyncSaveWarnings()` buffer. If a user makes 50 edits after the
localStorage quota fills up, the in-memory catalog still reflects them
— but nothing hits disk, and next page load they're gone. The warning
buffer tells the *app* something failed but does NOT list which edits
were lost. Acceptable for Phase 2 (quota is rare at 5–10 MB of text),
but the Manage module MUST render this prominently: "⚠ Some recent
changes couldn't be saved. If you close this tab, they'll be lost.
Recommended: export now." Rule: if a failure mode is invisible unless
the UI chooses to render it, the UI must render it. No "the data is
there if someone asks."

## 2026-04-24 — prune on re-ingest only, never on write

Initial instinct on `setEdit` was to check "does this edit match the
parsed value? if so, don't store it." The user caught it before I
wrote it: silently dropping an edit at save time makes the UI flicker
("I just clicked save, why is my change gone?"). Auto-prune belongs
at re-ingest because that's when *Albert* changes underneath the user,
not when the user is actively editing. Rule: write-time operations
should be faithful to user intent. Reconcile-with-upstream belongs in
the sync path, not the write path.
