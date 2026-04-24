// NYU Nomenclature Harvester
// One-shot research script. Strategy B: traverse by school.
// Enumerates /undergraduate/ and /graduate/ to discover schools; fetches each
// school's Course Inventory A-Z to build prefix -> [schools] map; then fetches
// the master /courses/<prefix>/ page for each distinct prefix and parses courses.

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import * as cheerio from "cheerio";

const ROOT = "https://bulletins.nyu.edu";
const USER_AGENT = "NYU-Nomenclature-Harvester/0.1 (student research; one-shot)";
const RATE_LIMIT_MS = 600; // >500ms minimum
const CACHE_DIR = "cache";
const WARNINGS_FILE = "warnings.log";

const warnings = [];
function warn(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.warn("WARN:", msg);
  warnings.push(line);
}

// ---------- cache + fetch ----------

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function cachePath(url) {
  const hash = createHash("sha1").update(url).digest("hex");
  return join(CACHE_DIR, `${hash}.html`);
}

let lastFetch = 0;
async function rateLimit() {
  const elapsed = Date.now() - lastFetch;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastFetch = Date.now();
}

async function fetchCached(url) {
  const path = cachePath(url);
  if (await exists(path)) {
    return await readFile(path, "utf8");
  }
  const maxAttempts = 4;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await rateLimit();
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml" },
        redirect: "follow",
      });
      if (!res.ok) {
        if (res.status === 404) throw new Error(`fetch ${url} -> 404`);
        throw new Error(`fetch ${url} -> ${res.status} ${res.statusText}`);
      }
      const body = await res.text();
      await writeFile(path, body);
      return body;
    } catch (e) {
      lastErr = e;
      if (/-> 404/.test(e.message)) throw e; // do not retry 404
      const backoff = 1000 * Math.pow(2, attempt - 1);
      warn(`fetch attempt ${attempt}/${maxAttempts} failed for ${url}: ${e.message}; backoff ${backoff}ms`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

// ---------- robots.txt ----------

async function checkRobots() {
  const body = await fetchCached(`${ROOT}/robots.txt`);
  const disallows = [];
  let activeAgent = null;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [kRaw, ...rest] = line.split(":");
    const k = kRaw.trim().toLowerCase();
    const v = rest.join(":").trim();
    if (k === "user-agent") activeAgent = v;
    else if (k === "disallow" && (activeAgent === "*" || activeAgent === null)) {
      if (v) disallows.push(v);
    }
  }
  // Paths we must be allowed to crawl:
  const mustCrawl = ["/courses/", "/undergraduate/", "/graduate/"];
  for (const p of mustCrawl) {
    const blocked = disallows.some(d => p.startsWith(d) && d.length > 1);
    if (blocked) {
      throw new Error(`robots.txt disallows ${p}; halt.`);
    }
  }
  console.log(`robots.txt ok. disallows=${disallows.length} paths; our targets permitted.`);
  return disallows;
}

// ---------- school enumeration ----------

async function listSchools(level) {
  const url = `${ROOT}/${level}/`;
  const $ = cheerio.load(await fetchCached(url));
  const schools = [];
  // Sidebar/menu uses anchors whose href matches /{level}/{slug}/
  const seen = new Set();
  $(`a[href^="/${level}/"]`).each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().replace(/\s+/g, " ").trim();
    // Only top-level school links: /{level}/<slug>/ with nothing more
    const m = href.match(new RegExp(`^/${level}/([^/]+)/?$`));
    if (!m) return;
    const slug = m[1];
    if (slug === "" || slug === "index") return;
    if (!text) return;
    const key = `${level}:${slug}`;
    if (seen.has(key)) return;
    seen.add(key);
    schools.push({ level, slug, name: text, url: `${ROOT}/${level}/${slug}/` });
  });
  return schools;
}

// ---------- prefix discovery per school ----------

function extractPrefixFromText(text) {
  // "Computer Science (CS-UY)" -> "CS-UY"
  const m = text.match(/\(([A-Z][A-Z0-9]*-[A-Z][A-Z0-9]*)\)\s*$/);
  return m ? m[1] : null;
}

async function listPrefixesForSchool(school) {
  const url = `${ROOT}/${school.level}/${school.slug}/courses/`;
  let body;
  try {
    body = await fetchCached(url);
  } catch (e) {
    warn(`school index fetch failed: ${school.name} (${school.level}) at ${url}: ${e.message}`);
    return [];
  }
  const $ = cheerio.load(body);
  // Map prefix -> school-scoped URL (for fallback when master /courses/<slug>/ 404s)
  const found = new Map();
  $("a").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const prefix = extractPrefixFromText(text);
    if (!prefix) return;
    let href = $(el).attr("href") || "";
    if (href && !href.startsWith("http")) href = ROOT + (href.startsWith("/") ? href : "/" + href);
    // Only keep school-scoped hrefs as fallbacks; they look like /<level>/<slug>/courses/<prefix-slug>/
    const fallback = href && href.includes(`/${school.level}/${school.slug}/courses/`) ? href : null;
    if (!found.has(prefix) && fallback) found.set(prefix, fallback);
    else if (!found.has(prefix)) found.set(prefix, null);
  });
  if (found.size === 0) {
    warn(`no prefixes discovered for ${school.name} (${school.level}) at ${url}`);
  }
  return found; // Map prefix -> fallback URL (or null)
}

// ---------- course parsing ----------

function parseCoursesFromPage(html, sourceUrl) {
  const $ = cheerio.load(html);
  const courses = [];
  // NYU CourseLeaf structure: .courseblock containing .detail-code and .detail-title spans.
  $(".courseblock").each((_, block) => {
    const codeText = $(block).find(".detail-code").first().text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    const titleText = $(block).find(".detail-title").first().text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!codeText || !titleText) return;
    const m = codeText.match(/^([A-Z][A-Z0-9]*-[A-Z][A-Z0-9]*)\s+([0-9][0-9A-Z.]*)\s*$/);
    if (!m) return;
    courses.push({
      subject_prefix: m[1],
      catalog_number_full: m[2],
      title: titleText,
      source_url: sourceUrl,
    });
  });
  if (courses.length === 0) {
    // Legacy / older template fallback: a single courseblocktitle line with everything inline.
    $(".courseblocktitle, p.courseblocktitle").each((_, el) => {
      const raw = $(el).text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      const parsed = parseLegacyTitleLine(raw);
      if (parsed) courses.push({ ...parsed, source_url: sourceUrl });
    });
  }
  return courses;
}

function parseLegacyTitleLine(line) {
  const m = line.match(
    /^([A-Z][A-Z0-9]*-[A-Z][A-Z0-9]*)\s+([0-9][0-9A-Z.]*)\s+(.+?)(?:\s*\([^)]*Credits?[^)]*\))?\s*$/
  );
  if (!m) return null;
  const [, subject_prefix, catalog_number_full, title] = m;
  if (!title || title.length < 2) return null;
  return { subject_prefix, catalog_number_full, title: title.trim() };
}

// Parse a line like: "CS-UY 1114  Intro To Programming & Problem Solving  (4 Credits)"
// Also accepts missing credits, numbers with trailing letters (410X), etc.
function parseCourseTitleLine(line) {
  const m = line.match(
    /^([A-Z][A-Z0-9]*-[A-Z][A-Z0-9]*)\s+([0-9][0-9A-Z.]*)\s+(.+?)(?:\s*\([^)]*Credits?[^)]*\))?\s*$/
  );
  if (!m) return null;
  const [, subject_prefix, catalog_number_full, title] = m;
  if (!title || title.length < 2) return null;
  return {
    subject_prefix,
    catalog_number_full,
    title: title.replace(/\s+/g, " ").trim(),
  };
}

// ---------- main pipeline ----------

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await checkRobots();

  // 1. Enumerate schools at both levels
  const schoolsUG = await listSchools("undergraduate");
  const schoolsG = await listSchools("graduate");
  const schools = [...schoolsUG, ...schoolsG];
  console.log(`discovered ${schoolsUG.length} undergraduate + ${schoolsG.length} graduate = ${schools.length} school sections`);
  if (schools.length === 0) throw new Error("zero schools discovered; halt.");

  // 2. For each school, discover its prefixes (and remember school-scoped URL as fallback)
  const prefixToSchools = new Map(); // prefix -> Set of school names
  const prefixFallbackUrls = new Map(); // prefix -> [fallback URLs]
  for (const s of schools) {
    const prefixMap = await listPrefixesForSchool(s);
    for (const [p, fallback] of prefixMap) {
      if (!prefixToSchools.has(p)) prefixToSchools.set(p, new Set());
      prefixToSchools.get(p).add(s.name);
      if (fallback) {
        if (!prefixFallbackUrls.has(p)) prefixFallbackUrls.set(p, []);
        prefixFallbackUrls.get(p).push(fallback);
      }
    }
    console.log(`  ${s.level}/${s.slug} -> ${prefixMap.size} prefixes`);
  }

  // 3. Cross-check against master /courses/ index so we don't miss any prefix
  const masterBody = await fetchCached(`${ROOT}/courses/`);
  const $master = cheerio.load(masterBody);
  const masterPrefixes = new Set();
  $master("a").each((_, el) => {
    const text = $master(el).text().replace(/\s+/g, " ").trim();
    const prefix = extractPrefixFromText(text);
    if (prefix) masterPrefixes.add(prefix);
  });
  console.log(`master A-Z index lists ${masterPrefixes.size} prefixes`);
  for (const p of masterPrefixes) {
    if (!prefixToSchools.has(p)) {
      warn(`prefix ${p} found in master /courses/ but not in any school index; schools will be empty`);
      prefixToSchools.set(p, new Set());
    }
  }
  // Also surface any prefix discovered per-school but missing from master
  for (const p of prefixToSchools.keys()) {
    if (!masterPrefixes.has(p)) {
      warn(`prefix ${p} present in school index but not master /courses/; master page may 404`);
    }
  }

  // 4. Fetch master page for each distinct prefix and parse
  const allPrefixes = [...prefixToSchools.keys()].sort();
  console.log(`fetching ${allPrefixes.length} subject pages...`);
  const rows = [];
  for (let i = 0; i < allPrefixes.length; i++) {
    const prefix = allPrefixes[i];
    const slug = prefix.toLowerCase().replace(/-/g, "_");
    const masterUrl = `${ROOT}/courses/${slug}/`;
    const fallbacks = prefixFallbackUrls.get(prefix) || [];
    const candidates = [masterUrl, ...fallbacks];
    let body = null;
    let url = null;
    for (const c of candidates) {
      try {
        body = await fetchCached(c);
        url = c;
        break;
      } catch (e) {
        if (!/-> 404/.test(e.message)) {
          warn(`fetch error for ${prefix} at ${c}: ${e.message}`);
        }
      }
    }
    if (!body) {
      warn(`all URLs 404 for prefix ${prefix} (tried ${candidates.length}: ${candidates.join(", ")})`);
      continue;
    }
    const courses = parseCoursesFromPage(body, url);
    if (courses.length === 0) {
      warn(`zero courses parsed from ${url} (prefix ${prefix})`);
    }
    const schoolsList = [...prefixToSchools.get(prefix)].sort();
    for (const c of courses) {
      // Sanity: if the parsed prefix differs from the page's declared prefix, log.
      if (c.subject_prefix !== prefix) {
        warn(`prefix mismatch on ${url}: expected ${prefix}, got ${c.subject_prefix} for "${c.title}"`);
      }
      rows.push({
        subject_prefix: c.subject_prefix,
        catalog_number_full: c.catalog_number_full,
        title: c.title,
        schools: schoolsList,
        source_url: c.source_url,
      });
    }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${allPrefixes.length} (${rows.length} courses so far)`);
  }

  // 5. Write raw JSON
  rows.sort((a, b) =>
    a.subject_prefix.localeCompare(b.subject_prefix) ||
    a.catalog_number_full.localeCompare(b.catalog_number_full, undefined, { numeric: true })
  );
  await writeFile("nomenclature-raw.json", JSON.stringify(rows, null, 2));
  console.log(`wrote nomenclature-raw.json (${rows.length} courses)`);

  // 6. Build reduced markdown
  await writeReduced(rows);

  // 7. Write warnings
  await writeFile(WARNINGS_FILE, warnings.join("\n") + (warnings.length ? "\n" : ""));
  console.log(`wrote ${WARNINGS_FILE} (${warnings.length} warnings)`);
}

// ---------- reduction ----------

function suffixOfCatalogNumber(n) {
  // Strip leading digits/dots; keep trailing non-digit characters.
  const m = n.match(/^[0-9.]*([A-Z]*)$/);
  return m ? m[1] : "";
}

async function writeReduced(rows) {
  // --- Prefix table ---
  const byPrefix = new Map(); // prefix -> { schools:Set, count, exampleCourses:[] }
  for (const r of rows) {
    let entry = byPrefix.get(r.subject_prefix);
    if (!entry) {
      entry = { schools: new Set(), count: 0, examples: [] };
      byPrefix.set(r.subject_prefix, entry);
    }
    r.schools.forEach(s => entry.schools.add(s));
    entry.count++;
    if (entry.examples.length < 1) entry.examples.push(r);
  }
  // Sort: school grouping (first school in sorted list), then prefix
  const prefixRows = [...byPrefix.entries()].map(([prefix, e]) => {
    const schoolsStr = [...e.schools].sort().join(", ") || "(unassigned)";
    const ex = e.examples[0];
    const example = ex ? `${ex.subject_prefix} ${ex.catalog_number_full} ${ex.title}` : "";
    return { prefix, schoolsStr, count: e.count, example, sortSchool: [...e.schools].sort()[0] || "ZZZ" };
  }).sort((a, b) => a.sortSchool.localeCompare(b.sortSchool) || a.prefix.localeCompare(b.prefix));

  // --- Suffix table ---
  const bySuffix = new Map(); // suffix -> { prefixes:Set, count, examples:[] }
  for (const r of rows) {
    const suf = suffixOfCatalogNumber(r.catalog_number_full);
    let entry = bySuffix.get(suf);
    if (!entry) {
      entry = { prefixes: new Set(), count: 0, examples: new Map() }; // examples keyed by school to diversify
      bySuffix.set(suf, entry);
    }
    entry.prefixes.add(r.subject_prefix);
    entry.count++;
    const schoolKey = r.schools[0] || "(unassigned)";
    if (!entry.examples.has(schoolKey) && entry.examples.size < 3) {
      entry.examples.set(schoolKey, r);
    }
  }
  const suffixRows = [...bySuffix.entries()].map(([suffix, e]) => {
    const prefixesStr = [...e.prefixes].sort().join(", ");
    const examples = [...e.examples.values()].slice(0, 2)
      .map(r => `${r.subject_prefix} ${r.catalog_number_full} (${r.title})`).join("; ");
    return { suffix: suffix || "(none)", count: e.count, prefixes: prefixesStr, examples };
  }).sort((a, b) => {
    // Empty suffix first, then by count desc
    if (a.suffix === "(none)") return -1;
    if (b.suffix === "(none)") return 1;
    return b.count - a.count || a.suffix.localeCompare(b.suffix);
  });

  // --- Render ---
  const lines = [];
  lines.push(`# NYU Course Nomenclature — Reduced Summary`);
  lines.push("");
  lines.push(`Source: bulletins.nyu.edu. Courses harvested: ${rows.length}. Distinct subject prefixes: ${byPrefix.size}. Distinct catalog-suffix patterns: ${bySuffix.size}.`);
  lines.push("");
  lines.push(`## Subject prefixes`);
  lines.push("");
  lines.push(`| Prefix | Schools (discovered) | Course count | Example |`);
  lines.push(`| --- | --- | ---: | --- |`);
  for (const p of prefixRows) {
    lines.push(`| ${p.prefix} | ${p.schoolsStr} | ${p.count} | ${p.example.replace(/\|/g, "\\|")} |`);
  }
  lines.push("");
  lines.push(`## Catalog-number suffix patterns`);
  lines.push("");
  lines.push(`Suffix = trailing non-digit characters of catalog number (e.g. "410X" -> "X", "1134G" -> "G", "2204" -> empty).`);
  lines.push("");
  lines.push(`| Suffix | Course count | Subject prefixes | Examples |`);
  lines.push(`| --- | ---: | --- | --- |`);
  for (const s of suffixRows) {
    lines.push(`| ${s.suffix} | ${s.count} | ${s.prefixes} | ${s.examples.replace(/\|/g, "\\|")} |`);
  }
  lines.push("");
  await writeFile("nomenclature-reduced.md", lines.join("\n"));
  console.log(`wrote nomenclature-reduced.md`);
}

main().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
