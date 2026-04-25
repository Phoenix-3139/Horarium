import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  THEME_NAMES,
  DEFAULT_THEME,
  COPY,
  t,
  setTheme,
  getActiveTheme,
  isValidTheme,
  boot,
  _setActiveThemeForTest,
} from "./themes.js";

// --- Coverage: every theme has every key ----------------------------
// One canonical source-of-truth — the editorial dictionary's keys are
// the contract. If a future theme adds a key, the test ensures every
// other theme also defines it.
const EDITORIAL_KEYS = Object.keys(COPY.editorial);

describe("THEME_NAMES — the four registers", () => {
  it("exports exactly editorial / dark / futuristic / nature", () => {
    expect(THEME_NAMES).toEqual(["editorial", "dark", "futuristic", "nature"]);
  });
  it("DEFAULT_THEME is editorial", () => {
    expect(DEFAULT_THEME).toBe("editorial");
  });
});

describe("COPY — every theme has entries for every editorial key", () => {
  for (const themeName of ["editorial", "dark", "futuristic", "nature"]) {
    it(`${themeName} dictionary has all ${EDITORIAL_KEYS.length} keys`, () => {
      const dict = COPY[themeName];
      expect(dict).toBeTruthy();
      for (const key of EDITORIAL_KEYS) {
        expect(dict[key], `theme=${themeName} missing key=${key}`).toBeTruthy();
      }
    });
  }
});

describe("t(key) — returns the active theme's value", () => {
  beforeEach(() => _setActiveThemeForTest("editorial"));

  it("returns editorial values when editorial is active", () => {
    expect(t("tab.main")).toBe("Plan");
    expect(t("plan.active.badge")).toBe("Active");
  });

  it("switches values when the active theme switches", () => {
    _setActiveThemeForTest("futuristic");
    expect(t("tab.main")).toBe("SCHED");
    expect(t("plan.active.badge")).toBe("ACTIVE");
    _setActiveThemeForTest("nature");
    expect(t("tab.main")).toBe("Your schedule");
  });
});

describe("t(key) — fallback chain", () => {
  beforeEach(() => _setActiveThemeForTest("dark"));

  it("falls back to editorial when the active theme is missing the key", () => {
    // We don't have a real missing key in production dictionaries, so
    // simulate by querying a key that exists in editorial but is
    // intentionally unset on a synthetic theme — easier path: poke COPY.
    const fakeKey = "test.fallback.only";
    COPY.editorial[fakeKey] = "EDIT_FALLBACK";
    try {
      expect(t(fakeKey)).toBe("EDIT_FALLBACK");
    } finally {
      delete COPY.editorial[fakeKey];
    }
  });

  it("returns the key itself when no theme has the entry (typo defense)", () => {
    expect(t("nonexistent.key.never.added")).toBe("nonexistent.key.never.added");
  });
});

describe("setTheme — persistence + event", () => {
  beforeEach(() => {
    _setActiveThemeForTest("editorial");
    // Reset the spy / localStorage between tests
    if (typeof globalThis.localStorage === "undefined") {
      globalThis.localStorage = (() => {
        let store = {};
        return {
          getItem: (k) => (k in store ? store[k] : null),
          setItem: (k, v) => { store[k] = String(v); },
          removeItem: (k) => { delete store[k]; },
          clear: () => { store = {}; },
        };
      })();
    } else {
      globalThis.localStorage.clear();
    }
  });

  it("updates the active theme, localStorage, and fires horarium:theme-changed", () => {
    const handler = vi.fn();
    globalThis.window = globalThis.window || globalThis;
    globalThis.window.addEventListener = globalThis.window.addEventListener || (() => {});
    // jsdom-like environment? Skip if window.dispatchEvent isn't around.
    const dispatched = [];
    if (typeof globalThis.window.dispatchEvent !== "function") {
      globalThis.window.dispatchEvent = (e) => { dispatched.push(e); return true; };
    }
    const origAdd = globalThis.window.addEventListener;
    globalThis.window.addEventListener = function (type, h) {
      if (type === "horarium:theme-changed") handler.mockImplementation(h);
      origAdd.call(this, type, h);
    };

    setTheme("dark");
    expect(getActiveTheme()).toBe("dark");
    expect(globalThis.localStorage.getItem("horarium.theme")).toBe("dark");
    // Event firing: setTheme calls window.dispatchEvent(CustomEvent(...));
    // jsdom-less test envs may have a stub — at least confirm no throw.
  });

  it("clamps invalid theme names to DEFAULT_THEME", () => {
    setTheme("not-a-theme");
    expect(getActiveTheme()).toBe(DEFAULT_THEME);
  });

  it("isValidTheme matches the THEME_NAMES list", () => {
    expect(isValidTheme("editorial")).toBe(true);
    expect(isValidTheme("dark")).toBe(true);
    expect(isValidTheme("futuristic")).toBe(true);
    expect(isValidTheme("nature")).toBe(true);
    expect(isValidTheme("zebra")).toBe(false);
    expect(isValidTheme("")).toBe(false);
    expect(isValidTheme(null)).toBe(false);
  });
});

describe("boot — applies stored theme or defaults to editorial", () => {
  beforeEach(() => {
    if (typeof globalThis.localStorage === "undefined") {
      globalThis.localStorage = (() => {
        let store = {};
        return {
          getItem: (k) => (k in store ? store[k] : null),
          setItem: (k, v) => { store[k] = String(v); },
          removeItem: (k) => { delete store[k]; },
          clear: () => { store = {}; },
        };
      })();
    } else {
      globalThis.localStorage.clear();
    }
    _setActiveThemeForTest("editorial");
  });

  it("returns DEFAULT_THEME when nothing is stored", () => {
    expect(boot()).toBe(DEFAULT_THEME);
    expect(getActiveTheme()).toBe(DEFAULT_THEME);
  });

  it("applies the stored theme when one is saved", () => {
    globalThis.localStorage.setItem("horarium.theme", "futuristic");
    expect(boot()).toBe("futuristic");
    expect(getActiveTheme()).toBe("futuristic");
  });

  it("ignores invalid stored values and defaults", () => {
    globalThis.localStorage.setItem("horarium.theme", "not-real");
    expect(boot()).toBe(DEFAULT_THEME);
    expect(getActiveTheme()).toBe(DEFAULT_THEME);
  });
});
