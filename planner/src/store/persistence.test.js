import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createCatalog } from "./catalog.js";
import { createPersistence } from "./persistence.js";

// --- localStorage stub --------------------------------------------------

function installStorage() {
  const store = new Map();
  const ls = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (i) => Array.from(store.keys())[i] || null,
    // Test-only hooks:
    __dump: () => Object.fromEntries(store),
    __throwQuota: false,
    __throwOnRead: false,
  };
  const realSet = ls.setItem;
  ls.setItem = (k, v) => {
    if (ls.__throwQuota) {
      const e = new Error("QuotaExceededError");
      e.name = "QuotaExceededError";
      throw e;
    }
    realSet(k, v);
  };
  const realGet = ls.getItem;
  ls.getItem = (k) => {
    if (ls.__throwOnRead) throw new Error("read failed");
    return realGet(k);
  };
  globalThis.localStorage = ls;
  return ls;
}

function uninstallStorage() {
  delete globalThis.localStorage;
}

function buildParserOutput(courseCount = 1) {
  const courses = Array.from({ length: courseCount }, (_, i) => ({
    code: `ENGR-UH ${1000 + i}`,
    subject: "ENGR-UH",
    catalog_number: String(1000 + i),
    title: `Test Course ${i}`,
    title_flags: [],
    description: "x",
    description_truncated: false,
    school: "NYU Abu Dhabi",
    units: 4,
    sections: [
      {
        class_number: String(20000 + i),
        section_code: "001",
        component: "Lecture",
        session: {
          code: "AD",
          start_date: "2026-08-31",
          end_date: "2026-12-14",
        },
        status: { raw: "Open", type: "open", count: null },
        requires_consent: false,
        grading: "Ugrd Abu Dhabi Graded",
        instruction_mode: "In-Person",
        location: "Abu Dhabi",
        meetings: [
          {
            days: ["Mon"],
            start_time: "09:00",
            end_time: "10:00",
            start_date: "2026-08-31",
            end_date: "2026-12-14",
            room: "Room 1",
            building: "Room",
            room_number: "1",
            instructors: [],
          },
        ],
        linked_components: [],
        notes: null,
      },
    ],
  }));
  return {
    schema_version: "1.1.3",
    header: {
      term: "Fall 2026",
      subject_code: "ENGR-UH",
      results_shown: courseCount,
      total_class_count: courseCount,
    },
    courses,
    warnings: [],
    unparsed_lines: [],
  };
}

let ls;
beforeEach(() => {
  ls = installStorage();
});
afterEach(() => {
  uninstallStorage();
  vi.useRealTimers();
});

// --- tests --------------------------------------------------------------

describe("persistence — first run", () => {
  it("isFirstRun() returns true and getConsent() returns null before any choice", () => {
    const cat = createCatalog();
    const p = createPersistence(cat);
    expect(p.isFirstRun()).toBe(true);
    expect(p.getConsent()).toBe(null);
  });
});

describe("persistence — save_always flow", () => {
  it("save_always + ingest + reload → data restored", () => {
    const cat = createCatalog();
    const p = createPersistence(cat);
    p.setConsent("save_always");
    cat.ingestSubject("ENGR-UH", buildParserOutput(2));
    // Flush the debounced save.
    p.save();

    // Build a fresh catalog and hydrate from storage.
    const cat2 = createCatalog();
    const p2 = createPersistence(cat2);
    const result = p2.load();
    expect(result.ok).toBe(true);
    expect(result.loaded).toBe(true);
    expect(cat2.getEffective().courses).toHaveLength(2);
    expect(cat2.getEffective().courses[0].code).toBe("ENGR-UH 1000");
  });
});

describe("persistence — session_only flow", () => {
  it("session_only saves nothing; a fresh instance starts empty", () => {
    const cat = createCatalog();
    const p = createPersistence(cat);
    p.setConsent("session_only");
    cat.ingestSubject("ENGR-UH", buildParserOutput(1));
    p.save(); // should be a no-op
    expect(ls.__dump()[`horarium.catalog`]).toBeUndefined();

    // A fresh catalog + persistence pair sees no data.
    const cat2 = createCatalog();
    const p2 = createPersistence(cat2);
    const result = p2.load();
    expect(result.loaded).toBe(false);
    expect(cat2.getEffective().courses).toHaveLength(0);
  });
});

describe("persistence — never flow", () => {
  it("never → save() is a no-op and localStorage stays empty", () => {
    const cat = createCatalog();
    const p = createPersistence(cat);
    p.setConsent("never");
    cat.ingestSubject("ENGR-UH", buildParserOutput(1));
    const r = p.save();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("consent_not_save_always");
    // consent key is written, but no catalog data.
    expect(ls.__dump()[`horarium.catalog`]).toBeUndefined();
  });
});

describe("persistence — consent transitions", () => {
  it("save_always → never clears the stored catalog immediately", () => {
    const cat = createCatalog();
    const p = createPersistence(cat);
    p.setConsent("save_always");
    cat.ingestSubject("ENGR-UH", buildParserOutput(1));
    p.save();
    expect(ls.__dump()[`horarium.catalog`]).toBeDefined();

    p.setConsent("never");
    expect(ls.__dump()[`horarium.catalog`]).toBeUndefined();
    expect(ls.__dump()[`horarium.last_saved_at`]).toBeUndefined();
    expect(ls.__dump()[`horarium.storage_consent`]).toBe("never");
  });

  it("save_always → never also wipes the user_identity key (consent-downgrade hygiene)", () => {
    const cat = createCatalog();
    const p = createPersistence(cat);
    p.setConsent("save_always");
    // Simulate the planner UI writing the identity blob directly. Persistence
    // doesn't own the write, but on a downgrade it owns the wipe.
    ls.setItem("horarium.user_identity", JSON.stringify({ name: "Test User", netid: "tu01" }));
    expect(ls.__dump()["horarium.user_identity"]).toBeDefined();

    p.setConsent("never");
    expect(ls.__dump()["horarium.user_identity"]).toBeUndefined();
  });

  it("save_always → session_only also wipes user_identity (same consent-downgrade rule)", () => {
    const cat = createCatalog();
    const p = createPersistence(cat);
    p.setConsent("save_always");
    ls.setItem("horarium.user_identity", JSON.stringify({ name: "Test User" }));
    p.setConsent("session_only");
    expect(ls.__dump()["horarium.user_identity"]).toBeUndefined();
  });

  it("never → save_always saves current in-memory state immediately (no debounce)", () => {
    const cat = createCatalog();
    const p = createPersistence(cat);
    p.setConsent("never");
    cat.ingestSubject("ENGR-UH", buildParserOutput(1));
    expect(ls.__dump()[`horarium.catalog`]).toBeUndefined();

    p.setConsent("save_always");
    // Synchronous save on transition — blob should be present without waiting.
    expect(ls.__dump()[`horarium.catalog`]).toBeDefined();
    const parsed = JSON.parse(ls.__dump()[`horarium.catalog`]);
    expect(parsed.parsed["ENGR-UH"]).toBeDefined();
  });

  it("session_only → save_always also saves immediately", () => {
    const cat = createCatalog();
    const p = createPersistence(cat);
    p.setConsent("session_only");
    cat.ingestSubject("ENGR-UH", buildParserOutput(1));
    p.setConsent("save_always");
    expect(ls.__dump()[`horarium.catalog`]).toBeDefined();
  });
});

describe("persistence — debounced auto-save", () => {
  it("10 edits in rapid succession coalesce into 1 save 500ms later", () => {
    vi.useFakeTimers();
    const cat = createCatalog();
    const p = createPersistence(cat);
    p.setConsent("save_always");
    cat.ingestSubject("ENGR-UH", buildParserOutput(1));
    // The setConsent + ingestSubject above will have produced at least one
    // synchronous write and one pending debounced timer. Clear the timer
    // count snapshot by advancing past the debounce window and asserting
    // afterwards only on the incremental setItem calls.
    vi.advanceTimersByTime(1000);
    const spy = vi.spyOn(ls, "setItem");

    for (let i = 0; i < 10; i++) {
      cat.setEdit({
        class_number: "20000",
        field_path: "meetings[0].room",
        value: `Room ${i}`,
      });
    }
    // No save yet — timer still pending.
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    // Exactly one save fired (two setItem calls: catalog + last_saved_at).
    expect(spy).toHaveBeenCalled();
    const keys = spy.mock.calls.map((c) => c[0]);
    // Catalog written once, last_saved_at written once — i.e. exactly one
    // debounced save pass, not ten.
    expect(keys.filter((k) => k === "horarium.catalog")).toHaveLength(1);
  });
});

describe("persistence — quota exceeded", () => {
  it("save returns a graceful warning rather than throwing", () => {
    const cat = createCatalog();
    const p = createPersistence(cat);
    p.setConsent("save_always");
    cat.ingestSubject("ENGR-UH", buildParserOutput(1));

    ls.__throwQuota = true;
    const r = p.save();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("quota_exceeded");
    // Store should not have thrown up the stack.
    expect(() => cat.getEffective()).not.toThrow();
  });
});

describe("persistence — corrupted localStorage", () => {
  it("load() returns a warning and leaves the catalog empty", () => {
    const cat = createCatalog();
    const p = createPersistence(cat);
    p.setConsent("save_always");
    // Manually install garbage.
    ls.setItem("horarium.catalog", "{not valid json");

    const r = p.load();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("corrupted_data");
    expect(r.warning.type).toBe("corrupted_storage");
    expect(cat.getEffective().courses).toEqual([]);
  });
});

describe("persistence — storage stats", () => {
  it("reports bytes_used, subjects_stored, edit_count, last_saved_at", () => {
    const cat = createCatalog();
    const p = createPersistence(cat);
    p.setConsent("save_always");
    cat.ingestSubject("ENGR-UH", buildParserOutput(2));
    cat.ingestSubject("PHYED-UH", buildParserOutput(1));
    cat.setEdit({
      class_number: "20000",
      field_path: "meetings[0].room",
      value: "X",
    });
    p.save();

    const stats = p.getStorageStats();
    expect(stats.bytes_used).toBeGreaterThan(0);
    expect(stats.subjects_stored).toBe(2);
    expect(stats.edit_count).toBe(1);
    expect(typeof stats.last_saved_at).toBe("string");
    expect(new Date(stats.last_saved_at).toString()).not.toBe("Invalid Date");
  });

  it("returns zeros when nothing has been saved", () => {
    const cat = createCatalog();
    const p = createPersistence(cat);
    expect(p.getStorageStats()).toEqual({
      bytes_used: 0,
      subjects_stored: 0,
      edit_count: 0,
      last_saved_at: null,
    });
  });
});

describe("persistence — schema version mismatch on load", () => {
  it("loads the data anyway and attaches a schema_version_mismatch warning", () => {
    const cat = createCatalog();
    const p = createPersistence(cat);
    p.setConsent("save_always");
    cat.ingestSubject("ENGR-UH", buildParserOutput(1));
    p.save();

    // Hand-mutate the stored blob to claim an older schema version.
    const raw = ls.getItem("horarium.catalog");
    const data = JSON.parse(raw);
    data.schema_version = "1.0";
    ls.setItem("horarium.catalog", JSON.stringify(data));

    const cat2 = createCatalog();
    const p2 = createPersistence(cat2);
    const r = p2.load();
    expect(r.ok).toBe(true);
    expect(r.loaded).toBe(true);
    expect(r.warning).toBeDefined();
    expect(r.warning.type).toBe("schema_version_mismatch");
    expect(r.warning.loaded_version).toBe("1.0");
    expect(r.warning.current_version).toBe("1.1.3");
    // Data still loaded.
    expect(cat2.getEffective().courses).toHaveLength(1);
  });
});

describe("persistence — explicit clear()", () => {
  it("wipes all horarium.* keys from localStorage", () => {
    const cat = createCatalog();
    const p = createPersistence(cat);
    p.setConsent("save_always");
    cat.ingestSubject("ENGR-UH", buildParserOutput(1));
    p.save();
    expect(Object.keys(ls.__dump()).length).toBeGreaterThan(0);
    p.clear();
    expect(ls.__dump()).toEqual({});
  });
});
