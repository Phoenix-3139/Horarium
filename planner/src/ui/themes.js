// Theme system for Horarium. Four parallel registers — visual (CSS
// variables) and verbal (a copy dictionary). Switching the theme
// changes the data-theme attribute on <html> (CSS rebinds variables
// instantly) and flips the active dictionary (UI code reads t(key) to
// get the current register's string for a given logical label).
//
// Themes don't touch layout, behavior, or data. If you reach for a
// theme to change a tab's structure or the catalog model, that's a
// signal the theme spec is wrong — stop and rethink.
//
// Boot: see boot() at the bottom; it reads localStorage and applies
// the saved theme (or 'editorial' by default) before any UI runs.

export const THEME_NAMES = ["editorial", "coffee", "futuristic", "nature"];

// Backward-compat: the original ship called this theme "dark". If a
// pre-rename localStorage value comes back, accept it and silently map.
const THEME_ALIAS = { dark: "coffee" };

export const DEFAULT_THEME = "editorial";

const STORAGE_KEY = "horarium.theme";

// Single dictionary keyed by logical label. Each label has one entry
// per theme. The keys deliberately read like dotted namespaces; that
// shape mirrors how the strings are scattered in the UI (tabs, picker,
// manage, etc.) and makes the dictionary easy to extend without
// renaming surfaces.
//
// New keys: add to all four themes. The fallback to editorial is for
// defensive lookup safety, not an excuse to leave entries blank.
export const COPY = {
  editorial: {
    "app.title": "Horarium",
    "app.subtitle.empty": "No term loaded. Go to Catalog → Paste to begin.",
    "tab.main": "Plan",
    "tab.catalog": "Catalog",
    "tab.edit": "Edit",
    "tab.compare": "Compare",
    "tab.export": "Export",
    "tab.manage": "Manage",
    "picker.search.placeholder": "Search by code, title, or instructor",
    "picker.empty": "No catalog yet. Paste subject data in the Catalog tab to begin.",
    "filter.add": "Block out thy hours",
    "filter.empty": "Name time blocks like lunch, gym, or prayer.",
    "plan.new": "New plan",
    "plan.active.badge": "Active",
    "manage.identity.heading": "Identity",
    "manage.consent.heading": "Storage consent",
    "manage.export.heading": "Export",
    "manage.clear.heading": "Clear data",
    "manage.theme.heading": "Theme",
    "config.title": "Organise thy modules",
    "config.tag": "Layout configuration",
    "footer": "Final registration happens in Albert.",
  },
  coffee: {
    "app.title": "Horarium",
    "app.subtitle.empty": "No term loaded. Add catalog data to begin.",
    "tab.main": "Schedule",
    "tab.catalog": "Catalog",
    "tab.edit": "Edit",
    "tab.compare": "Compare",
    "tab.export": "Export",
    "tab.manage": "Settings",
    "picker.search.placeholder": "Search courses, codes, instructors",
    "picker.empty": "No catalog data. Paste subject data in Catalog to begin.",
    "filter.add": "Add time block",
    "filter.empty": "Block off recurring time like lunch or gym.",
    "plan.new": "New plan",
    "plan.active.badge": "Active",
    "manage.identity.heading": "Identity",
    "manage.consent.heading": "Storage",
    "manage.export.heading": "Export",
    "manage.clear.heading": "Clear data",
    "manage.theme.heading": "Theme",
    "config.title": "Organize modules",
    "config.tag": "Layout configuration",
    "footer": "Register in Albert.",
  },
  futuristic: {
    "app.title": "HORARIUM",
    "app.subtitle.empty": "NO DATA. INGEST CATALOG.",
    "tab.main": "SCHED",
    "tab.catalog": "DATA",
    "tab.edit": "EDIT",
    "tab.compare": "DIFF",
    "tab.export": "EXPORT",
    "tab.manage": "CONFIG",
    "picker.search.placeholder": "QUERY: course / code / instructor",
    "picker.empty": "CATALOG EMPTY. INGEST IN DATA TAB.",
    "filter.add": "ADD CONSTRAINT",
    "filter.empty": "DEFINE TIME CONSTRAINTS.",
    "plan.new": "NEW PLAN",
    "plan.active.badge": "ACTIVE",
    "manage.identity.heading": "USER",
    "manage.consent.heading": "STORAGE",
    "manage.export.heading": "EXPORT",
    "manage.clear.heading": "PURGE",
    "manage.theme.heading": "THEME",
    "config.title": "MODULE LAYOUT",
    "config.tag": "LAYOUT CONFIGURATION",
    "footer": "FINALIZE IN ALBERT.",
  },
  nature: {
    "app.title": "Horarium",
    "app.subtitle.empty": "No courses yet. Head to Catalog to add some.",
    "tab.main": "Your schedule",
    "tab.catalog": "Catalog",
    "tab.edit": "Edit",
    "tab.compare": "Compare",
    "tab.export": "Export",
    "tab.manage": "Settings",
    "picker.search.placeholder": "Search by name, code, or instructor",
    "picker.empty": "Your catalog is empty. Paste subject data in Catalog to get started.",
    "filter.add": "Add personal time",
    "filter.empty": "Block out time you'd like to keep — meals, exercise, rest.",
    "plan.new": "New plan",
    "plan.active.badge": "Active",
    "manage.identity.heading": "About you",
    "manage.consent.heading": "Storage",
    "manage.export.heading": "Export",
    "manage.clear.heading": "Clear data",
    "manage.theme.heading": "Theme",
    "config.title": "Organize your modules",
    "config.tag": "Layout configuration",
    "footer": "Finalize your registration in Albert.",
  },
};

let _activeTheme = DEFAULT_THEME;

export function getActiveTheme() {
  return _activeTheme;
}

export function isValidTheme(name) {
  return THEME_NAMES.indexOf(name) !== -1;
}

// Lookup: returns the active theme's string for `key`, falling back to
// editorial, then to the key itself (typo-defense — at least the UI
// shows something readable instead of an empty span).
export function t(key) {
  const active = COPY[_activeTheme];
  if (active && active[key] != null) return active[key];
  const fallback = COPY[DEFAULT_THEME];
  if (fallback && fallback[key] != null) return fallback[key];
  return key;
}

// Persist + apply. setTheme is the only public mutation point; never
// poke `_activeTheme` directly. Fires `horarium:theme-changed` so any
// JS that needs to re-render text (tabs, manage panel, etc.) can hook
// in without polling.
export function setTheme(name, opts) {
  opts = opts || {};
  if (THEME_ALIAS[name]) name = THEME_ALIAS[name];
  if (!isValidTheme(name)) name = DEFAULT_THEME;
  _activeTheme = name;
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.dataset.theme = name;
  }
  if (!opts.skipPersist && typeof localStorage !== "undefined") {
    try { localStorage.setItem(STORAGE_KEY, name); } catch (_) { /* quota */ }
  }
  if (!opts.skipEvent && typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("horarium:theme-changed", { detail: { theme: name } }));
  }
}

// Boot: read storage, apply. Idempotent — calling twice does nothing
// new. Returns the theme that ended up active so callers can log /
// branch as needed.
export function boot() {
  let saved = DEFAULT_THEME;
  if (typeof localStorage !== "undefined") {
    try {
      let v = localStorage.getItem(STORAGE_KEY);
      if (v && THEME_ALIAS[v]) v = THEME_ALIAS[v];
      if (v && isValidTheme(v)) saved = v;
    } catch (_) { /* private mode */ }
  }
  setTheme(saved, { skipPersist: true, skipEvent: true });
  return saved;
}

// Test helper — never needed in production. Used by themes.test.js to
// pin the active theme without touching localStorage or firing events.
export function _setActiveThemeForTest(name) {
  if (isValidTheme(name)) _activeTheme = name;
  else _activeTheme = DEFAULT_THEME;
}
