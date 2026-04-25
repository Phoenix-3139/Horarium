// Pure helpers for the Manage module (Piece 3d). DOM rendering is in
// planner/index.html; this file owns the testable bits — formatters and
// the export-payload builder.

// Threshold (days) past which a subject is flagged as "stale". NYU
// updates Albert frequently during registration windows; data more than
// a month old is likely missing recent changes. Surfaced as a soft chip,
// not a block — the user decides whether to re-paste.
export const STALENESS_THRESHOLD_DAYS = 30;

// Format a byte count as "237 B" / "1.4 KB" / "12.3 MB". Uses 1024-step
// units (binary) since localStorage quota is reported the same way by
// every browser we care about.
export function humanBytes(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) {
    // <10 KB → one decimal; >=10 KB → integer (avoids "237.4 KB" noise).
    return kb < 10 ? `${kb.toFixed(1)} KB` : `${Math.round(kb)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
  const gb = mb / 1024;
  return gb < 10 ? `${gb.toFixed(1)} GB` : `${Math.round(gb)} GB`;
}

// Compute staleness for one subject from its last_updated metadata.
// Returns { ageDays, isStale, hasTimestamp }. The caller decides how to
// render — a chip, a tooltip, etc. Caller passes `now` so tests are
// deterministic.
export function subjectStaleness(metadata, now, thresholdDays = STALENESS_THRESHOLD_DAYS) {
  const lastUpdated = metadata && metadata.last_updated ? metadata.last_updated : null;
  if (!lastUpdated) {
    return { ageDays: null, isStale: false, hasTimestamp: false };
  }
  const then = Date.parse(lastUpdated);
  if (!Number.isFinite(then)) {
    return { ageDays: null, isStale: false, hasTimestamp: false };
  }
  const nowMs = now instanceof Date ? now.getTime() : (typeof now === "number" ? now : Date.now());
  const ageMs = Math.max(0, nowMs - then);
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  return { ageDays, isStale: ageDays >= thresholdDays, hasTimestamp: true };
}

// Sanitize a string for use in a download filename — strip filesystem-
// hostile characters (slashes, colons, etc.), collapse whitespace to
// underscores, and clamp length so we don't generate 200-char names.
// Returns "" for empty/whitespace-only inputs so the caller can
// substitute a default.
export function sanitizeFilename(s) {
  if (typeof s !== "string") return "";
  const trimmed = s.trim();
  if (trimmed === "") return "";
  const cleaned = trimmed
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_");
  return cleaned.slice(0, 60);
}

// Build the JSON payload for "Export my edits". Edits-only — no parsed
// catalog, no identity, no schema-versioned envelope beyond what's listed
// here. Future pack/import will extend this; for now the shape is the
// minimum to round-trip a user's edits to a file and (eventually) back.
//
// `editsList` is the array catalog.listEdits().edits — already in the
// shape the store wants on hydrate, so future re-import is straightforward.
export function buildEditsExport({ editsList, schemaVersion, now }) {
  // Normalize all input forms through Date so output is always
  // millisecond-precision ISO 8601 ("...Z"), regardless of caller input.
  const exportedAt = (now instanceof Date
    ? now
    : new Date(now == null ? Date.now() : now)).toISOString();
  return {
    format: "horarium-edits-export",
    version: 1,
    exported_at: exportedAt,
    schema_version: schemaVersion || null,
    edits: Array.isArray(editsList) ? editsList : [],
  };
}

// Build the filename for an edits export. Pattern:
//   <displayname>_horarium-edits_<YYYY-MM-DD>.json
// When displayname is empty, falls back to "horarium-edits_<date>.json".
export function buildEditsExportFilename({ displayName, now }) {
  const safe = sanitizeFilename(displayName || "");
  const d = now instanceof Date ? now : new Date(now || Date.now());
  const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
  return safe
    ? `${safe}_horarium-edits_${iso}.json`
    : `horarium-edits_${iso}.json`;
}

// Roll up catalog.toJSON() and persistence.getStorageStats() into a flat
// summary the Manage UI can render directly. Exposed as a pure function
// so the test can pin the expected shape without spinning up real
// stores.
export function summarizeStorage({ catalogSnapshot, storageStats }) {
  const parsed = (catalogSnapshot && catalogSnapshot.parsed) || {};
  const subjects = Object.keys(parsed);
  let courseCount = 0;
  let sectionCount = 0;
  for (const subj of subjects) {
    const po = parsed[subj];
    const courses = (po && po.courses) || [];
    courseCount += courses.length;
    for (const c of courses) {
      sectionCount += (c.sections || []).length;
    }
  }
  const editCount = (catalogSnapshot && Array.isArray(catalogSnapshot.edits))
    ? catalogSnapshot.edits.length
    : 0;
  return {
    subjects: subjects.length,
    courses: courseCount,
    sections: sectionCount,
    edits: editCount,
    bytes: storageStats && typeof storageStats.bytes_used === "number" ? storageStats.bytes_used : 0,
    last_saved_at: storageStats ? (storageStats.last_saved_at || null) : null,
  };
}
