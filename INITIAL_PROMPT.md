# Initial Prompt for Claude Code

Copy everything between the horizontal lines below and paste it as your first
message to Claude Code, from inside the `horarium/` directory.

---

I'm starting a project called Horarium — a local-first course scheduling tool for NYU Abu Dhabi students. The goal is to replace the painful experience of using NYU Albert with a fast local tool that scrapes the public catalog, plans schedules, and auto-generates valid schedule combinations.

**Before writing any code**, read these files in order:

1. `README.md` — what this project is
2. `CLAUDE.md` — your instructions for this codebase (tech stack, conventions, what to never do)
3. `docs/ARCHITECTURE.md` — system design and the reasoning behind each major decision
4. `docs/DATA_SCHEMA.md` — the JSON contract between modules
5. `docs/ROADMAP.md` — the phased plan. We are on Phase 1.

Once you've read all five, give me a brief summary of your understanding: the three modules, the data flow between them, the tech stack, and the Phase 1 goal. Flag anything ambiguous or anything you'd design differently.

**Then your first concrete task: start Phase 1, the scraper.**

Work in this order:

1. **Inspect the target.** Before writing any scraper code, fetch `https://bulletins.nyu.edu/class-search/` once with `curl` (or `node -e "fetch(...).then(r => r.text()).then(console.log)"`) and look at the actual HTML. Figure out:
   - How are search parameters submitted? (Check for form fields, JS, XHR endpoints.)
   - Is the search actually server-rendered HTML, or is it a JS-powered SPA that would need a headless browser?
   - What's the URL pattern for results? Can we query per-subject?
   
   Report back what you find before writing scraper code. If the page turns out to be JS-rendered, stop and ask — that's a significant deviation from the plan in ARCHITECTURE.md.

2. **Capture fixtures.** Once you understand the request shape, save a few representative HTML responses to `scraper/test/fixtures/` as `.html` files. Minimum: one result page covering ENGR-UH Fall 2026. Ideally also: a full-term course (MATH-UH 1022), a course with multiple sessions (ENGR-UH 2010 has both A71 and A72), a course with lab+lecture links.

3. **Parser first, fetcher second.** Write the cheerio-based parser against the fixtures. Full test coverage. No network. Output must match `docs/DATA_SCHEMA.md` exactly.

4. **Then the fetcher.** With proper rate limiting (≥500ms between requests), a descriptive User-Agent ("Horarium/0.1 (NYUAD student tool)"), retries with exponential backoff, and atomic writes to the output file.

5. **Then the CLI.** Flags documented in `docs/SETUP.md`. Use a lightweight argparse lib or write it by hand — no yargs/commander needed for three flags.

6. **Verify.** Run it against Fall 2026 NYUAD for real. Check the output against the schema. Sanity-check a few courses by eyeballing the JSON vs. the live page.

A few specific things I want to flag upfront:

- **Don't hit `sis.nyu.edu/psc/...`.** That's the authenticated PeopleSoft search. Only `bulletins.nyu.edu/class-search/` is fair game.
- **NYUAD subject codes end in `-UH`.** The scraper should filter to those unless `--school` indicates otherwise.
- **Session codes matter.** `A71`, `A72`, `AD` are NYUAD half-term/full-term codes. The parser must preserve these exactly — conflict detection downstream depends on them.
- **Status parsing.** NYU writes statuses as `"Open"`, `"Closed"`, or `"Wait List (N)"`. Parse these into the structured `{type, count}` form in the schema.
- **Linked components.** The HTML structure groups a Lecture with its Recitation/Lab under the same course heading. Capture the linkage — downstream the planner needs to know "picking lecture 20668 means you're also taking REC 20669."

When you hit anything ambiguous, stop and ask. I'd rather answer five questions than undo a bad decision.

---

## After Phase 1 is done

Once the scraper produces valid `data/fall2026.json`, ping me and we'll plan Phase 2 (planner integration). Don't start Phase 2 autonomously — there's a legacy single-file planner I'll share with you separately, and we'll decide together how much to port vs. rewrite.
