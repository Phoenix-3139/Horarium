// Pack format: portable bundle of catalog + edits + identity that one
// Horarium user can ship to another. Imports are non-destructive — the
// receiver views the pack as a named overlay, never blending into their
// own catalog automatically.
//
// SECURITY MODEL: imported pack data is UNTRUSTED. Every parse path
// here assumes hostile input. The validator collects all errors rather
// than throwing on the first, so the user gets a single useful message
// rather than a "fix this, try again, oh now this" loop.
//
// Three classes of versioning interact:
//   1. format_version  — the pack envelope shape (this file's contract).
//      Bump when adding a top-level field that older importers can't
//      ignore. Current: 1.
//   2. schema_version  — the data.catalog / data.edits shapes. Tracks
//      docs/DATA_SCHEMA.md. Current: 1.1.3.
//   3. The pack itself doesn't carry a Horarium app version — pinning
//      to the schema version is sufficient because every Horarium build
//      knows its own schema_version and can compare.
//
// String fields are validated for type and bounded length, but their
// CONTENT is not sanitized here — sanitization is the renderer's job
// (textContent, never innerHTML). The validator just makes sure the
// shape is right; the receiver's UI then renders strings safely.

export const PACK_FORMAT = "horarium-pack";
export const PACK_FORMAT_VERSION = 1;

// 10 MB is generous — a 6-subject catalog + edits is typically <1 MB.
// 100 MB is an attack. Anything between is suspect; we cap at 10 to
// keep parser runtime bounded.
export const PACK_MAX_BYTES = 10 * 1024 * 1024;

// Per-string and per-array length caps applied during validation. These
// are intentionally loose enough that no real catalog data trips them,
// and tight enough that an attacker can't blow up the renderer with a
// 10 MB title string.
const LIMITS = {
  display_name: 200,
  program: 200,
  term: 100,
  pack_id: 200,
  // Catalog/edit contents — these mirror what real NYU data looks like
  // (titles ~100 chars, descriptions ~5 KB, notes ~10 KB) with 10x
  // headroom.
  course_title: 500,
  description: 50_000,
  notes: 50_000,
  field_value: 50_000,
  raw_paste_block: 200_000,
  string_default: 1_000,
  // Container caps. NYU has ~685 subject prefixes; per-subject we've
  // observed up to ~150 sections.
  subjects: 1_000,
  courses_per_subject: 5_000,
  sections_per_course: 1_000,
  meetings_per_section: 50,
  edits: 100_000,
};

// --- Build (export) ---------------------------------------------------

// Construct a pack object. The shape is JSON-serializable; the caller
// stringifies and saves to disk. `now` is injectable for test
// determinism.
export function buildPack({ catalogJSON, identity, term, contents, now } = {}) {
  const exportedAt = (now instanceof Date
    ? now
    : new Date(now == null ? Date.now() : now)).toISOString();
  const ident = identity || {};
  const display_name = (typeof ident.name === "string" && ident.name.trim()) ? ident.name.trim() : null;
  const program = (typeof ident.program === "string" && ident.program.trim()) ? ident.program.trim() : null;
  const include = new Set(contents && contents.length ? contents : ["catalog", "edits"]);
  const data = {};
  if (include.has("catalog")) {
    data.catalog = (catalogJSON && catalogJSON.parsed) || {};
  }
  if (include.has("edits")) {
    data.edits = (catalogJSON && Array.isArray(catalogJSON.edits)) ? catalogJSON.edits : [];
  }
  if (include.has("plans")) {
    data.plans = {}; // future-extensible; empty for now
  }
  return {
    format: PACK_FORMAT,
    format_version: PACK_FORMAT_VERSION,
    schema_version: (catalogJSON && catalogJSON.schema_version) || null,
    exported_at: exportedAt,
    exported_by: { display_name, program },
    term: term || null,
    contents: Array.from(include),
    data,
  };
}

// Filename pattern. Same sanitization rules as the edits export.
export function buildPackFilename({ displayName, term, now } = {}) {
  const safe = sanitizeForFilename(displayName || "");
  const safeTerm = sanitizeForFilename(term || "");
  const d = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
  const iso = d.toISOString().slice(0, 10);
  const parts = ["horarium-pack"];
  if (safe) parts.unshift(safe);
  if (safeTerm) parts.push(safeTerm);
  parts.push(iso);
  return `${parts.join("_")}.json`;
}

function sanitizeForFilename(s) {
  if (typeof s !== "string") return "";
  const trimmed = s.trim();
  if (!trimmed) return "";
  return trimmed.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_").slice(0, 60);
}

// --- Validate (import) -----------------------------------------------

// Errors returned by the validator. Aggregated, not thrown. `path`
// describes where in the document the error lives ("data.catalog.ENGR-UH.courses[0].title").
function err(path, message) {
  return { path, message };
}

// `currentSchemaVersion` is the schema the importing instance speaks.
// The validator uses it to decide migrate-vs-refuse on schema mismatch.
// Returns { ok, errors, pack? } — when ok is true, `pack` is the
// validated (and possibly migrated) pack.
export function validatePackPayload(raw, { currentSchemaVersion, sourceByteLength } = {}) {
  const errors = [];

  // Size gate first — even before parsing, the caller should have
  // checked. We re-check here in case the caller passed an oversized
  // already-parsed object (less likely but cheap to guard).
  if (typeof sourceByteLength === "number" && sourceByteLength > PACK_MAX_BYTES) {
    errors.push(err(
      "$",
      `Pack file is ${sourceByteLength} bytes, larger than the ${PACK_MAX_BYTES}-byte cap. Refusing to parse.`,
    ));
    return { ok: false, errors };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push(err("$", "Pack must be a JSON object."));
    return { ok: false, errors };
  }

  // Format identity.
  if (raw.format !== PACK_FORMAT) {
    errors.push(err("format", `Expected format "${PACK_FORMAT}", got ${JSON.stringify(raw.format)}. This may not be a Horarium pack.`));
  }

  if (typeof raw.format_version !== "number" || !Number.isFinite(raw.format_version)) {
    errors.push(err("format_version", "Missing or non-numeric format_version."));
  } else if (raw.format_version > PACK_FORMAT_VERSION) {
    errors.push(err(
      "format_version",
      `Pack uses format_version ${raw.format_version}, but this Horarium build only understands up to ${PACK_FORMAT_VERSION}. Update your copy of Horarium.`,
    ));
  } else if (raw.format_version < 1) {
    errors.push(err("format_version", `format_version must be >= 1, got ${raw.format_version}.`));
  }

  // Schema version: tolerated ahead-of-current is a refuse; behind-or-
  // equal is a migrate (which today is a no-op since there's no
  // breaking change between 1.1.x patches — additive only).
  if (typeof raw.schema_version !== "string" || !/^\d+\.\d+\.\d+$/.test(raw.schema_version)) {
    errors.push(err("schema_version", "Missing or malformed schema_version (expected x.y.z)."));
  } else if (currentSchemaVersion && compareSemver(raw.schema_version, currentSchemaVersion) > 0) {
    errors.push(err(
      "schema_version",
      `Pack was exported from schema_version ${raw.schema_version}, but this Horarium build only understands up to ${currentSchemaVersion}. Update your copy of Horarium by re-downloading from GitHub.`,
    ));
  }

  // exported_at — bounded ISO-ish.
  if (typeof raw.exported_at !== "string" || !Number.isFinite(Date.parse(raw.exported_at))) {
    errors.push(err("exported_at", "Missing or unparseable exported_at timestamp."));
  }

  // exported_by — an object with display_name + program, both nullable.
  if (raw.exported_by != null && (typeof raw.exported_by !== "object" || Array.isArray(raw.exported_by))) {
    errors.push(err("exported_by", "exported_by must be an object or null."));
  } else if (raw.exported_by) {
    validateBoundedNullableString(raw.exported_by.display_name, "exported_by.display_name", LIMITS.display_name, errors);
    validateBoundedNullableString(raw.exported_by.program, "exported_by.program", LIMITS.program, errors);
  }

  if (raw.term != null) validateBoundedNullableString(raw.term, "term", LIMITS.term, errors);

  // contents — array of "catalog" | "edits" | "plans". Unknown values
  // ignored (forward-compat); explicit duplicates allowed.
  if (raw.contents != null && !Array.isArray(raw.contents)) {
    errors.push(err("contents", "contents must be an array of strings."));
  }

  // data — object with optional catalog / edits / plans.
  if (raw.data == null || typeof raw.data !== "object" || Array.isArray(raw.data)) {
    errors.push(err("data", "data must be an object."));
    return { ok: false, errors };
  }

  if (raw.data.catalog != null) validateCatalog(raw.data.catalog, "data.catalog", errors);
  if (raw.data.edits != null) validateEdits(raw.data.edits, "data.edits", errors);
  // plans intentionally not validated — empty object today.

  if (errors.length > 0) return { ok: false, errors };

  // Build the canonical pack we hand back. Uses only fields we
  // validated; unknown top-level fields are dropped (forward-compat:
  // ignore unknowns rather than reject, but don't propagate them either
  // since we haven't audited them).
  const pack = {
    format: raw.format,
    format_version: raw.format_version,
    schema_version: raw.schema_version,
    exported_at: raw.exported_at,
    exported_by: raw.exported_by ? {
      display_name: raw.exported_by.display_name || null,
      program: raw.exported_by.program || null,
    } : { display_name: null, program: null },
    term: raw.term || null,
    contents: Array.isArray(raw.contents) ? raw.contents.filter((c) => typeof c === "string") : [],
    data: {
      catalog: raw.data.catalog || {},
      edits: Array.isArray(raw.data.edits) ? raw.data.edits : [],
    },
  };
  return { ok: true, errors: [], pack };
}

function validateBoundedNullableString(v, path, max, errors) {
  if (v == null) return;
  if (typeof v !== "string") {
    errors.push(err(path, `Expected string or null, got ${typeof v}.`));
    return;
  }
  if (v.length > max) {
    errors.push(err(path, `String exceeds ${max}-char limit (got ${v.length}).`));
  }
}

function validateCatalog(catalog, path, errors) {
  if (typeof catalog !== "object" || Array.isArray(catalog) || catalog === null) {
    errors.push(err(path, "catalog must be an object keyed by subject code."));
    return;
  }
  const subjects = Object.keys(catalog);
  if (subjects.length > LIMITS.subjects) {
    errors.push(err(path, `Too many subjects (${subjects.length} > ${LIMITS.subjects}).`));
    return;
  }
  for (const subject of subjects) {
    const po = catalog[subject];
    const sp = `${path}.${subject}`;
    if (typeof po !== "object" || po === null || Array.isArray(po)) {
      errors.push(err(sp, "Each subject's value must be an object."));
      continue;
    }
    if (!Array.isArray(po.courses)) {
      errors.push(err(`${sp}.courses`, "courses must be an array."));
      continue;
    }
    if (po.courses.length > LIMITS.courses_per_subject) {
      errors.push(err(`${sp}.courses`, `Too many courses (${po.courses.length}).`));
      continue;
    }
    for (let i = 0; i < po.courses.length; i++) {
      validateCourse(po.courses[i], `${sp}.courses[${i}]`, errors);
    }
  }
}

function validateCourse(c, path, errors) {
  if (typeof c !== "object" || c === null || Array.isArray(c)) {
    errors.push(err(path, "course must be an object."));
    return;
  }
  if (typeof c.code !== "string") errors.push(err(`${path}.code`, "code must be a string."));
  validateBoundedNullableString(c.title, `${path}.title`, LIMITS.course_title, errors);
  validateBoundedNullableString(c.description, `${path}.description`, LIMITS.description, errors);
  if (!Array.isArray(c.sections)) {
    errors.push(err(`${path}.sections`, "sections must be an array."));
    return;
  }
  if (c.sections.length > LIMITS.sections_per_course) {
    errors.push(err(`${path}.sections`, `Too many sections (${c.sections.length}).`));
    return;
  }
  for (let i = 0; i < c.sections.length; i++) {
    validateSection(c.sections[i], `${path}.sections[${i}]`, errors);
  }
}

function validateSection(s, path, errors) {
  if (typeof s !== "object" || s === null || Array.isArray(s)) {
    errors.push(err(path, "section must be an object."));
    return;
  }
  if (s.class_number != null && typeof s.class_number !== "string") {
    errors.push(err(`${path}.class_number`, "class_number must be a string or null."));
  }
  validateBoundedNullableString(s.notes, `${path}.notes`, LIMITS.notes, errors);
  validateBoundedNullableString(s._raw_paste_block, `${path}._raw_paste_block`, LIMITS.raw_paste_block, errors);
  if (Array.isArray(s.meetings)) {
    if (s.meetings.length > LIMITS.meetings_per_section) {
      errors.push(err(`${path}.meetings`, `Too many meetings (${s.meetings.length}).`));
    }
    // We intentionally do NOT deep-validate every meeting field — the
    // store's effective-view code tolerates partial meetings, and the
    // renderer uses textContent for everything.
  }
}

function validateEdits(edits, path, errors) {
  if (!Array.isArray(edits)) {
    errors.push(err(path, "edits must be an array."));
    return;
  }
  if (edits.length > LIMITS.edits) {
    errors.push(err(path, `Too many edits (${edits.length} > ${LIMITS.edits}).`));
    return;
  }
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i];
    const ep = `${path}[${i}]`;
    if (typeof e !== "object" || e === null || Array.isArray(e)) {
      errors.push(err(ep, "edit must be an object."));
      continue;
    }
    if (typeof e.field_path !== "string") errors.push(err(`${ep}.field_path`, "field_path must be a string."));
    if (e.class_number != null && typeof e.class_number !== "string") {
      errors.push(err(`${ep}.class_number`, "class_number must be a string or null."));
    }
    if (e.course_code != null && typeof e.course_code !== "string") {
      errors.push(err(`${ep}.course_code`, "course_code must be a string or null."));
    }
  }
}

// Tiny semver compare — returns negative/0/positive. Pack only uses
// x.y.z so we don't need pre-release / build-metadata handling.
export function compareSemver(a, b) {
  const pa = a.split(".").map((n) => Number(n));
  const pb = b.split(".").map((n) => Number(n));
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

// Convenience entry point: parse the JSON text → validate → return the
// validation result. Used by the importer UI.
export function parseAndValidatePack(jsonText, { currentSchemaVersion } = {}) {
  if (typeof jsonText !== "string") {
    return { ok: false, errors: [err("$", "Input must be a string of JSON text.")] };
  }
  if (jsonText.length > PACK_MAX_BYTES) {
    return { ok: false, errors: [err("$", `Pack file is ${jsonText.length} bytes, larger than the ${PACK_MAX_BYTES}-byte cap.`)] };
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, errors: [err("$", `JSON parse failed: ${e && e.message ? e.message : String(e)}`)] };
  }
  return validatePackPayload(parsed, {
    currentSchemaVersion,
    sourceByteLength: jsonText.length,
  });
}

// Generate a stable pack-id for a validated pack. Used as the storage
// key for imported packs. Combines exporter display_name (sanitized) +
// exported_at so the same person re-importing replaces the prior copy
// rather than accumulating duplicates. Anonymous packs fall back to a
// timestamp-only id.
export function packId(pack) {
  const name = pack && pack.exported_by && pack.exported_by.display_name
    ? sanitizeForFilename(pack.exported_by.display_name).slice(0, 40)
    : "anon";
  const t = pack && pack.exported_at ? pack.exported_at.slice(0, 19).replace(/[:T]/g, "-") : "unknown";
  return `${name || "anon"}__${t}`;
}
