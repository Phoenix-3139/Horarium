// localStorage persistence layer on top of createCatalog().
//
// Consent model (per user decision 1 — one-time informed choice):
//   "save_always"  — catalog + edits persist to localStorage
//   "session_only" — in memory only, cleared on tab close
//   "never"        — no persistence, paste required every session
//   null           — first run; UI shows the consent banner
//
// Transitions have side effects:
//   save_always  → never / session_only : clear stored data immediately
//   never / session_only → save_always  : save current state immediately
//   save_always  → save_always          : no-op
//
// Auto-save: persistence wraps the catalog's mutating methods, so every
// successful ingest / setEdit / delete / undelete / clear schedules a
// debounced save (500ms after the last change) when consent is
// save_always. 10 rapid edits coalesce into 1 write.

const STORAGE_KEYS = {
  CATALOG: "horarium.catalog",
  CONSENT: "horarium.storage_consent",
  LAST_SAVED: "horarium.last_saved_at",
  // User-provided identity (name / netid / program / year). Written by the
  // planner UI directly, but persistence owns consent semantics — on a
  // downgrade (save_always → never/session_only) or explicit clear(), the
  // identity key is wiped along with the catalog blob. Identity is
  // personal data; it shouldn't survive a consent downgrade.
  USER_IDENTITY: "horarium.user_identity",
};
const DEBOUNCE_MS = 500;
const VALID_CONSENT = new Set(["save_always", "session_only", "never"]);

function getStorage() {
  // Access localStorage lazily so unit tests can install a stub and so
  // SSR / non-browser contexts fail soft rather than at import time.
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

export function createPersistence(catalog, options = {}) {
  const debounceMs = options.debounceMs != null ? options.debounceMs : DEBOUNCE_MS;
  let saveTimer = null;
  // Surface background save results (quota errors, etc.) without crashing
  // the mutation that triggered them. UI can poll this.
  const asyncSaveWarnings = [];

  function getConsent() {
    const ls = getStorage();
    if (!ls) return null;
    try {
      const v = ls.getItem(STORAGE_KEYS.CONSENT);
      return v === null ? null : v;
    } catch {
      return null;
    }
  }

  function isFirstRun() {
    return getConsent() === null;
  }

  function save() {
    if (getConsent() !== "save_always") {
      return { ok: false, reason: "consent_not_save_always" };
    }
    const ls = getStorage();
    if (!ls) return { ok: false, reason: "no_storage" };
    const dump = JSON.stringify(catalog.toJSON());
    try {
      ls.setItem(STORAGE_KEYS.CATALOG, dump);
      ls.setItem(STORAGE_KEYS.LAST_SAVED, new Date().toISOString());
      return { ok: true, bytes_written: dump.length };
    } catch (e) {
      const isQuota =
        e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014);
      return {
        ok: false,
        reason: isQuota ? "quota_exceeded" : "write_failed",
        error: e && e.message,
      };
    }
  }

  function load() {
    if (getConsent() !== "save_always") {
      return { ok: true, loaded: false, reason: "consent_not_save_always" };
    }
    const ls = getStorage();
    if (!ls) return { ok: false, reason: "no_storage" };
    let raw;
    try {
      raw = ls.getItem(STORAGE_KEYS.CATALOG);
    } catch (e) {
      return { ok: false, reason: "read_failed", error: e && e.message };
    }
    if (raw == null) return { ok: true, loaded: false, reason: "no_data" };
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return {
        ok: false,
        loaded: false,
        reason: "corrupted_data",
        warning: {
          type: "corrupted_storage",
          message:
            "localStorage catalog blob could not be parsed as JSON; ignoring saved data",
        },
      };
    }
    const currentVersion = catalog.toJSON().schema_version;
    let warning = null;
    if (data && data.schema_version && data.schema_version !== currentVersion) {
      warning = {
        type: "schema_version_mismatch",
        loaded_version: data.schema_version,
        current_version: currentVersion,
        message: `Loaded catalog was saved at schema ${data.schema_version}; current is ${currentVersion}. Loading anyway — stale-path edits will be migrated to migration_warnings.`,
      };
    }
    try {
      catalog.fromJSON(data);
    } catch (e) {
      return { ok: false, reason: "hydrate_failed", error: e && e.message };
    }
    const result = { ok: true, loaded: true };
    if (warning) result.warning = warning;
    return result;
  }

  function setConsent(mode) {
    if (!VALID_CONSENT.has(mode)) {
      throw new Error(`Invalid consent value: ${JSON.stringify(mode)}`);
    }
    const prev = getConsent();
    const ls = getStorage();
    if (!ls) return;
    try {
      ls.setItem(STORAGE_KEYS.CONSENT, mode);
    } catch {
      // If we can't even write the consent marker, nothing else will work.
      return;
    }
    if (prev === "save_always" && mode !== "save_always") {
      // Leaving save_always — wipe stored catalog AND user identity so
      // neither outlives the consent the user granted. Identity is
      // personal data supplied through the Manage UI; surviving a
      // consent downgrade would break the consent contract.
      try {
        ls.removeItem(STORAGE_KEYS.CATALOG);
        ls.removeItem(STORAGE_KEYS.LAST_SAVED);
        ls.removeItem(STORAGE_KEYS.USER_IDENTITY);
      } catch {}
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
    }
    if (prev !== "save_always" && mode === "save_always") {
      // Just opted in — persist current in-memory state synchronously,
      // not debounced (user's expecting immediate feedback).
      save();
    }
  }

  function clear() {
    const ls = getStorage();
    if (!ls) return;
    try {
      for (const k of Object.values(STORAGE_KEYS)) ls.removeItem(k);
    } catch {}
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  }

  function scheduleSave() {
    if (getConsent() !== "save_always") return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const result = save();
      if (!result.ok && result.reason !== "consent_not_save_always") {
        asyncSaveWarnings.push({ at: new Date().toISOString(), ...result });
      }
    }, debounceMs);
  }

  function getStorageStats() {
    const ls = getStorage();
    const stats = {
      bytes_used: 0,
      subjects_stored: 0,
      edit_count: 0,
      last_saved_at: null,
    };
    if (!ls) return stats;
    try {
      const raw = ls.getItem(STORAGE_KEYS.CATALOG);
      if (raw) {
        stats.bytes_used = raw.length;
        try {
          const data = JSON.parse(raw);
          stats.subjects_stored = Object.keys(data.parsed || {}).length;
          stats.edit_count = (data.edits || []).length;
        } catch {
          // corrupted blob — bytes are real but we can't count inside
        }
      }
      stats.last_saved_at = ls.getItem(STORAGE_KEYS.LAST_SAVED);
    } catch {}
    return stats;
  }

  // Inspection hook for the UI / tests — lets a caller see any save errors
  // that happened in a debounced callback (where the return value is lost).
  function getAsyncSaveWarnings() {
    return [...asyncSaveWarnings];
  }

  // Wrap mutating catalog methods so every write schedules a save.
  // This mutates the catalog object in place; callers should treat
  // createPersistence(catalog) as "catalog is now persistence-aware."
  const WRAPPED_METHODS = [
    "ingestSubject",
    "setEdit",
    "deleteSection",
    "deleteCourse",
    "undelete",
    "clear",
    "clearEdits",
  ];
  for (const name of WRAPPED_METHODS) {
    const orig = catalog[name].bind(catalog);
    catalog[name] = (...args) => {
      const r = orig(...args);
      scheduleSave();
      return r;
    };
  }
  // Plans namespace (Piece 5a): every mutator on catalog.plans.* should
  // also schedule a save. Read-only methods (list, get, getActive) skip
  // wrapping so they don't fire spurious saves on render passes.
  if (catalog.plans) {
    const PLAN_MUTATORS = [
      "create", "delete", "promote", "rename", "duplicate",
      "stageSection", "unstageSection",
      "addFilter", "updateFilter", "removeFilter",
      "setDismissedComponentHash",
      "addLink", "removeLink", "clearLinksForSection",
      "clearByOrigin",
    ];
    for (const name of PLAN_MUTATORS) {
      if (typeof catalog.plans[name] !== "function") continue;
      const orig = catalog.plans[name].bind(catalog.plans);
      catalog.plans[name] = (...args) => {
        const r = orig(...args);
        scheduleSave();
        return r;
      };
    }
  }

  return {
    getConsent,
    setConsent,
    isFirstRun,
    save,
    load,
    clear,
    getStorageStats,
    getAsyncSaveWarnings,
  };
}
