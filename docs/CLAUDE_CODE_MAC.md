# Using Claude Code on Mac

Step-by-step from zero to running Claude Code inside this project.

## 1. Install prerequisites

Open Terminal (⌘ + Space, type "Terminal").

### Install Homebrew (if you don't have it)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Install Node.js 20+

```bash
brew install node
node --version   # should print v20.x.x or higher
```

### Install Claude Code

See the official installation instructions at
[docs.claude.com/claude-code](https://docs.claude.com/en/docs/claude-code/overview)
for the current recommended install method on macOS. Installation is
typically a single `npm` or `curl` command.

After install, verify:

```bash
claude --version
```

You'll be prompted to authenticate on first run. Follow the prompts.

## 2. Set up the Horarium project

```bash
# From your home directory or wherever you keep projects
cd ~/projects        # or wherever

# Either unzip the scaffolding you received, or clone from git
# (depending on how you're distributing this)
cd horarium

# Verify the structure
ls -la
# You should see: README.md, CLAUDE.md, INITIAL_PROMPT.md, docs/, scraper/, planner/, scheduler/, package.json
```

## 3. Start Claude Code in the project

```bash
cd ~/projects/horarium
claude
```

Claude Code will start a session and automatically read `CLAUDE.md` from the
current directory. Any files you reference by path are accessible to it.

## 4. Kick off Phase 1

Open `INITIAL_PROMPT.md`, copy everything between the horizontal lines, and
paste it as your first message to Claude Code.

Claude will:
1. Read the docs.
2. Summarize its understanding.
3. Ask clarifying questions if anything is ambiguous.
4. Start inspecting the NYU catalog and building the scraper.

## 5. Working with Claude Code day-to-day

A few habits that make it more useful:

- **Keep `CLAUDE.md` up to date.** As decisions get made, codify them there.
  Claude reads it every session.
- **Commit often.** `git commit -m "Phase 1: parser passing on fixtures"`. If
  Claude makes a mess, you can `git reset --hard` without losing real work.
- **Run tests yourself.** Don't rely on Claude to say "tests pass" — run
  `npm test` in a second terminal and verify.
- **Scope asks.** "Add retries to the fetcher" works better than "make the
  scraper production-ready."
- **Push back.** If Claude proposes a dependency you don't want, say so. If
  it wants to refactor something orthogonal to your ask, redirect.

## 6. If something goes wrong

- **Claude edits the wrong file.** `git checkout -- path/to/file` to revert.
- **A dependency install explodes.** `rm -rf node_modules package-lock.json &&
  npm install` usually fixes it.
- **The scraper starts returning 0 results.** NYU probably changed their HTML.
  Capture a fresh fixture, diff against the old one, update the parser.
- **Claude Code misbehaves or contradicts `CLAUDE.md`.** Restart the session
  (Ctrl+D then `claude` again). Context carries across turns but not across
  sessions — a fresh start re-reads `CLAUDE.md`.

## 7. Sharing with friends

Once Phase 1 + Phase 2 are working:

```bash
# Push to GitHub
git init
git remote add origin <your-repo>
git push -u origin main

# Friends clone and run
git clone <your-repo>
cd horarium
npm install
npm run scrape -- --term "Fall 2026" --school NYUAD
npm run planner
```

No server, no accounts, no credentials. Each person runs it on their own
laptop, scrapes their own JSON, plans their own schedule.
