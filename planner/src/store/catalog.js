// Three-layer catalog store with sparse edits overlay.
//
//   parsed    - Map<subject, parserOutput>, authoritative from Albert
//   edits     - Map<"<kind>:<id>|<field_path>", Edit>, sparse user overrides
//   effective - computed at read time by cloning parsed + applying edits
//
// Edits are keyed so setEdit on the same (class_number|course_code) + path
// replaces any prior edit — no stacking. value=undefined removes it.
// Soft deletes are just edits with field_path="_deleted" and value=true;
// undelete removes that edit.
//
// Path format matches the parser's duplicate_disagreement warnings:
// "meetings[0].room", "status.count", "course.title", etc. Course-level
// edits carry a "course." prefix on field_path and use course_code as the
// key; section edits drop the prefix and use class_number as the key.
//
// Paths are validated against a schema allowlist at setEdit time. Invalid
// paths throw synchronously so the UI can't accumulate garbage.

const SCHEMA_VERSION = "1.1.3";

// Path shapes we accept on a Section edit. The "_deleted" escape hatch is
// listed explicitly here rather than in a separate branch.
const SECTION_PATH_RE = [
  /^_deleted$/,
  /^class_number$/,
  /^section_code$/,
  /^component$/,
  /^session(\.(code|start_date|end_date))?$/,
  /^status(\.(raw|type|count))?$/,
  /^requires_consent$/,
  /^grading$/,
  /^instruction_mode$/,
  /^location$/,
  /^meetings(\[\d+\](\.(days(\[\d+\])?|start_time|end_time|start_date|end_date|room|building|room_number|instructors(\[\d+\])?))?)?$/,
  /^linked_components(\[\d+\])?$/,
  /^notes$/,
  /^topic$/,
  /^display_timezone$/,
];

// Course-level paths. Note: editing a section through a course path is not
// supported — users edit sections by class_number.
// `units` is special: it can be a scalar OR {min,max}, so we accept both
// "units" (scalar) and "units.min"/"units.max" (range-object form).
const COURSE_PATH_RE = [
  /^_deleted$/,
  /^course\.code$/,
  /^course\.subject$/,
  /^course\.catalog_number$/,
  /^course\.title$/,
  /^course\.title_flags(\[\d+\])?$/,
  /^course\.description$/,
  /^course\.description_truncated$/,
  /^course\.school$/,
  /^course\.units(\.(min|max))?$/,
  /^course\.no_sections_offered$/,
];

function isValidSectionPath(path) {
  return typeof path === "string" && SECTION_PATH_RE.some((re) => re.test(path));
}
function isValidCoursePath(path) {
  return typeof path === "string" && COURSE_PATH_RE.some((re) => re.test(path));
}

// --- Path parse / walk helpers (exported-style, but module-private) ----

function parsePath(path) {
  // "meetings[0].instructors[1]" -> [
  //   {type:'prop',name:'meetings'},
  //   {type:'index',i:0},
  //   {type:'prop',name:'instructors'},
  //   {type:'index',i:1},
  // ]
  const tokens = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === "[") {
      const close = path.indexOf("]", i);
      if (close === -1) throw new Error(`Malformed path (unterminated '['): ${path}`);
      const n = Number(path.slice(i + 1, close));
      if (!Number.isInteger(n) || n < 0)
        throw new Error(`Malformed path index in ${path}`);
      tokens.push({ type: "index", i: n });
      i = close + 1;
      if (path[i] === ".") i++;
    } else {
      let end = i;
      while (end < path.length && path[end] !== "." && path[end] !== "[") end++;
      tokens.push({ type: "prop", name: path.slice(i, end) });
      i = end;
      if (path[i] === ".") i++;
    }
  }
  return tokens;
}

function getAtPath(obj, tokens) {
  let node = obj;
  for (const t of tokens) {
    if (node == null) return undefined;
    node = t.type === "prop" ? node[t.name] : node[t.i];
  }
  return node;
}

// Assigns at path, creating intermediate containers when a leaf below an
// absent parent is written (needed for user-created sections).
function setAtPath(obj, tokens, value) {
  if (tokens.length === 0) return;
  let node = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    const container = next.type === "index" ? [] : {};
    if (t.type === "prop") {
      if (node[t.name] == null) node[t.name] = container;
      node = node[t.name];
    } else {
      while (node.length <= t.i) node.push(next.type === "index" ? [] : {});
      if (node[t.i] == null) node[t.i] = container;
      node = node[t.i];
    }
  }
  const last = tokens[tokens.length - 1];
  if (last.type === "prop") {
    node[last.name] = value;
  } else {
    while (node.length <= last.i) node.push(undefined);
    node[last.i] = value;
  }
}

const cloneDeep = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

// --- Store factory ----------------------------------------------------

export function createCatalog() {
  const state = {
    parsed: new Map(), // subject -> parserOutput
    edits: new Map(), // key -> Edit
    autoPruneLog: [], // {class_number?, course_code?, field_path, reason, at}
    migrationWarnings: [],
    subjectMetadata: new Map(),
    // Imported packs (Piece 4). Map<pack_id, {pack, imported_at}>.
    // Imports never blend into `parsed` / `edits` — they live in a
    // separate namespace the UI can read for browse/compare but never
    // mutates from. Use copySectionFromImport to materialize a section
    // from an import as an edit in the user's primary overlay.
    imports: new Map(),
    // Plans namespace (Piece 5a). One plan is `kind:'active'` at any
    // time; the rest are candidates. Each plan carries staged section
    // refs and personal-time filters. The `origin` field exists for the
    // disposable principle: scheduler-generated plans can be cleared
    // without affecting user-created ones via clearPlansByOrigin.
    plans: {
      active: null,                  // plan id of the active plan, or null
      byId: new Map(),               // plan_id -> plan object
    },
  };

  // Tiny id helpers — collision-resistant enough for the local-only
  // use case without pulling a uuid dependency.
  function _newPlanId() {
    return "plan_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }
  function _newFilterId() {
    return "filter_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }
  function _nowISO() { return new Date().toISOString(); }

  // Pub/sub for mutation events. Subscribers get an event object of the
  // form { type: 'mutation', reason: 'ingest'|'setEdit'|'delete'|'undelete'
  // |'clear'|'hydrate', subject?, class_number?, course_code? }. Used by
  // UI modules (Browse, etc.) to re-render on state change without each
  // module wiring an ad-hoc refresh on every mutator call site.
  const subscribers = new Set();
  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }
  function _notify(event) {
    for (const fn of subscribers) {
      try { fn(event); } catch (e) { console.error('catalog subscriber error:', e); }
    }
  }

  const editKey = (e) =>
    e.class_number
      ? `section:${e.class_number}|${e.field_path}`
      : `course:${e.course_code}|${e.field_path}`;

  function editsFor(kind, id) {
    const prefix = `${kind}:${id}|`;
    const out = [];
    for (const [key, edit] of state.edits) {
      if (key.startsWith(prefix)) out.push(edit);
    }
    return out;
  }

  function isSectionDeleted(class_number) {
    const e = state.edits.get(`section:${class_number}|_deleted`);
    return !!(e && e.value === true);
  }
  function isCourseDeleted(course_code) {
    const e = state.edits.get(`course:${course_code}|_deleted`);
    return !!(e && e.value === true);
  }

  function ingestSubject(subjectCode, parserOutput) {
    state.parsed.set(subjectCode, parserOutput);
    state.subjectMetadata.set(subjectCode, {
      last_updated: new Date().toISOString(),
      course_count: parserOutput.courses.length,
      section_count: parserOutput.courses.reduce(
        (n, c) => n + c.sections.length,
        0,
      ),
      total_class_count: parserOutput.header
        ? parserOutput.header.total_class_count
        : null,
    });

    // Auto-prune: if a parsed value now matches the edit value, drop the edit.
    // Do NOT auto-prune deletions (a re-ingest doesn't mean the user changed
    // their mind about deleting a section).
    const sectionsByNum = new Map();
    const coursesByCode = new Map();
    for (const c of parserOutput.courses) {
      coursesByCode.set(c.code, c);
      for (const s of c.sections) sectionsByNum.set(s.class_number, s);
    }

    for (const [key, edit] of Array.from(state.edits.entries())) {
      if (edit.field_path === "_deleted") continue;
      let parsedValue;
      if (edit.class_number) {
        const sec = sectionsByNum.get(edit.class_number);
        if (!sec) continue;
        parsedValue = getAtPath(sec, parsePath(edit.field_path));
      } else {
        const crs = coursesByCode.get(edit.course_code);
        if (!crs) continue;
        const rest = edit.field_path.replace(/^course\./, "");
        parsedValue = getAtPath(crs, parsePath(rest));
      }
      if (JSON.stringify(parsedValue) === JSON.stringify(edit.value)) {
        state.edits.delete(key);
        state.autoPruneLog.push({
          class_number: edit.class_number,
          course_code: edit.course_code,
          field_path: edit.field_path,
          reason: "parsed value now matches edit",
          at: new Date().toISOString(),
        });
      }
    }
    _notify({ type: "mutation", reason: "ingest", subject: subjectCode });
  }

  function setEdit({ class_number, course_code, field_path, value }) {
    if (!class_number && !course_code) {
      throw new Error("setEdit requires class_number or course_code");
    }
    if (class_number && course_code) {
      throw new Error("setEdit requires exactly one of class_number or course_code");
    }
    if (class_number) {
      if (!isValidSectionPath(field_path)) {
        throw new Error(`Invalid section field_path: ${JSON.stringify(field_path)}`);
      }
    } else {
      // Course-level deletes use the bare "_deleted" sentinel too.
      if (field_path !== "_deleted" && !isValidCoursePath(field_path)) {
        throw new Error(`Invalid course field_path: ${JSON.stringify(field_path)}`);
      }
    }

    const edit = {
      class_number: class_number || null,
      course_code: course_code || null,
      field_path,
      value,
      created_at: new Date().toISOString(),
    };
    const key = editKey(edit);
    if (value === undefined) {
      state.edits.delete(key);
    } else {
      state.edits.set(key, edit);
    }
    _notify({
      type: "mutation",
      reason: field_path === "_deleted" ? (value === true ? "delete" : "undelete") : "setEdit",
      class_number: edit.class_number,
      course_code: edit.course_code,
      field_path,
    });
  }

  function deleteSection(class_number) {
    setEdit({ class_number, field_path: "_deleted", value: true });
  }
  function deleteCourse(course_code) {
    setEdit({ course_code, field_path: "_deleted", value: true });
  }
  function undelete({ class_number, course_code }) {
    if (class_number) {
      state.edits.delete(`section:${class_number}|_deleted`);
    }
    if (course_code) {
      state.edits.delete(`course:${course_code}|_deleted`);
    }
    _notify({ type: "mutation", reason: "undelete", class_number, course_code });
  }

  function applyEditsToSection(section, edits) {
    for (const e of edits) {
      if (e.field_path === "_deleted") continue;
      setAtPath(section, parsePath(e.field_path), e.value);
    }
  }
  function applyEditsToCourse(course, edits) {
    for (const e of edits) {
      if (e.field_path === "_deleted") continue;
      const rest = e.field_path.replace(/^course\./, "");
      setAtPath(course, parsePath(rest), e.value);
    }
  }

  function getEffective() {
    const courses = [];
    const parsedClassNumbers = new Set();

    for (const parserOutput of state.parsed.values()) {
      for (const parsedCourse of parserOutput.courses) {
        for (const s of parsedCourse.sections)
          parsedClassNumbers.add(s.class_number);
        if (isCourseDeleted(parsedCourse.code)) continue;
        const course = cloneDeep(parsedCourse);
        applyEditsToCourse(course, editsFor("course", course.code));
        const sections = [];
        for (const parsedSection of parsedCourse.sections) {
          if (isSectionDeleted(parsedSection.class_number)) continue;
          const section = cloneDeep(parsedSection);
          applyEditsToSection(section, editsFor("section", parsedSection.class_number));
          sections.push(section);
        }
        course.sections = sections;
        courses.push(course);
      }
    }

    // User-created sections: edits whose class_number isn't in any parsed
    // course. They're the 3.3 seed; we park them under a synthetic
    // "_USER_CREATED" course so the effective shape stays consistent.
    const synth = new Map();
    for (const e of state.edits.values()) {
      if (!e.class_number) continue;
      if (parsedClassNumbers.has(e.class_number)) continue;
      if (e.field_path === "_deleted" && e.value === true) continue;
      let s = synth.get(e.class_number);
      if (!s) {
        s = { class_number: e.class_number, _user_created: true };
        synth.set(e.class_number, s);
      }
      if (e.field_path !== "_deleted") {
        setAtPath(s, parsePath(e.field_path), e.value);
      }
    }
    if (synth.size > 0) {
      courses.push({
        code: "_USER_CREATED",
        subject: "_USER",
        catalog_number: "CREATED",
        title: "User-created sections",
        title_flags: [],
        description: null,
        description_truncated: false,
        school: null,
        units: null,
        sections: Array.from(synth.values()),
        _user_created: true,
      });
    }

    return {
      schema_version: SCHEMA_VERSION,
      courses,
    };
  }

  function getParsedValue(class_number, field_path) {
    for (const parserOutput of state.parsed.values()) {
      for (const c of parserOutput.courses) {
        for (const s of c.sections) {
          if (s.class_number === class_number) {
            return getAtPath(s, parsePath(field_path));
          }
        }
      }
    }
    return undefined;
  }

  function listEdits() {
    return {
      edits: Array.from(state.edits.values()),
      auto_pruned: [...state.autoPruneLog],
      migration_warnings: [...state.migrationWarnings],
    };
  }

  // --- Imports namespace (Piece 4) -----------------------------------
  // addImport: stores a validated pack under its pack_id. If a pack with
  // the same id already exists, replaces it (re-import = update). Fires
  // one notify with reason:'import'.
  function addImport(packId, pack) {
    if (typeof packId !== "string" || !packId) throw new Error("addImport requires a non-empty pack_id");
    if (!pack || typeof pack !== "object") throw new Error("addImport requires a pack object");
    state.imports.set(packId, {
      pack,
      imported_at: new Date().toISOString(),
    });
    _notify({ type: "mutation", reason: "import", pack_id: packId });
  }

  function removeImport(packId) {
    if (!state.imports.has(packId)) return false;
    state.imports.delete(packId);
    _notify({ type: "mutation", reason: "import_removed", pack_id: packId });
    return true;
  }

  function listImports() {
    const out = [];
    for (const [id, entry] of state.imports.entries()) {
      out.push({
        pack_id: id,
        imported_at: entry.imported_at,
        exported_at: entry.pack.exported_at,
        exported_by: entry.pack.exported_by,
        term: entry.pack.term,
        contents: entry.pack.contents,
        // Surface a quick stats summary so the UI can render rows
        // without walking the whole pack.
        subject_count: entry.pack.data && entry.pack.data.catalog
          ? Object.keys(entry.pack.data.catalog).length : 0,
        edit_count: entry.pack.data && Array.isArray(entry.pack.data.edits)
          ? entry.pack.data.edits.length : 0,
      });
    }
    return out.sort((a, b) => (b.imported_at || "").localeCompare(a.imported_at || ""));
  }

  function getImport(packId) {
    const entry = state.imports.get(packId);
    return entry ? entry.pack : null;
  }

  // Materialize a section from an import as edits in the user's primary
  // overlay. Walks the section's fields and emits setEdit calls so each
  // diverging value becomes a tracked override on the user's parsed
  // section (or a synthetic _USER_CREATED section if there's no parsed
  // counterpart). Returns the count of fields written.
  function copySectionFromImport(packId, classNumber) {
    const pack = getImport(packId);
    if (!pack || !pack.data || !pack.data.catalog) return 0;
    let imported = null;
    for (const subj of Object.keys(pack.data.catalog)) {
      const po = pack.data.catalog[subj];
      if (!po || !Array.isArray(po.courses)) continue;
      for (const c of po.courses) {
        for (const s of (c.sections || [])) {
          if (s.class_number === classNumber) { imported = s; break; }
        }
        if (imported) break;
      }
      if (imported) break;
    }
    if (!imported) return 0;
    // Top-level scalar / nested fields we know are valid edit paths.
    // Mirrors SECTION_FIELDS in src/ui/edit.js but stays decoupled —
    // only paths whose regex passes catalog's validation.
    const PATHS = [
      "section_code", "component", "session.code", "session.start_date",
      "session.end_date", "status.type", "status.count", "requires_consent",
      "grading", "instruction_mode", "location", "topic", "display_timezone",
      "notes",
    ];
    let n = 0;
    for (const p of PATHS) {
      const tokens = parsePath(p);
      const v = getAtPath(imported, tokens);
      if (v === undefined) continue;
      try {
        setEdit({ class_number: classNumber, field_path: p, value: v });
        n++;
      } catch (e) { /* invalid path silently skipped */ }
    }
    if (Array.isArray(imported.meetings)) {
      try {
        setEdit({ class_number: classNumber, field_path: "meetings", value: imported.meetings });
        n++;
      } catch (e) {}
    }
    return n;
  }

  // --- Plans namespace (Piece 5a) ------------------------------------
  // All plans API methods live on the returned object's `plans` field,
  // grouped to keep the catalog API surface readable. Mutations fire
  // _notify with reason: 'plan_mutation' so subscribers can filter for
  // plan-only events vs catalog ingest events.

  function _planNotify(reason, planId, extra) {
    _notify(Object.assign({
      type: "mutation",
      reason: "plan_mutation",
      plan_event: reason,
      plan_id: planId || null,
    }, extra || {}));
  }

  function _ensureInitialPlan() {
    if (state.plans.byId.size > 0 && state.plans.active) return;
    // Seed an empty active plan so the planner UI always has something
    // to render against. Idempotent — safe to call after fromJSON in
    // case the loaded state had no plans (older snapshots).
    const id = "plan_default";
    state.plans.byId.set(id, {
      id,
      name: "My Plan",
      kind: "active",
      created_at: _nowISO(),
      modified_at: _nowISO(),
      origin: "user",
      sections: [],
      filters: [],
      notes: "",
    });
    state.plans.active = id;
  }

  function _planList() {
    return Array.from(state.plans.byId.values());
  }
  function _planGet(planId) {
    return state.plans.byId.get(planId) || null;
  }
  function _planGetActive() {
    if (!state.plans.active) return null;
    return state.plans.byId.get(state.plans.active) || null;
  }
  function _planCreate({ name, kind, origin } = {}) {
    const id = _newPlanId();
    const isActive = kind === "active";
    if (isActive && state.plans.active) {
      // Demote previous active to candidate.
      const prev = state.plans.byId.get(state.plans.active);
      if (prev) {
        prev.kind = "candidate";
        prev.modified_at = _nowISO();
      }
    }
    const plan = {
      id,
      name: typeof name === "string" && name.trim() ? name.trim() : "New plan",
      kind: isActive ? "active" : "candidate",
      created_at: _nowISO(),
      modified_at: _nowISO(),
      origin: origin === "auto-scheduler" ? "auto-scheduler" : "user",
      sections: [],
      filters: [],
      notes: "",
      // Piece 5b: a stable hash of the current incomplete-components
      // state at the time the user last dismissed the floating
      // notification. Banner reappears whenever the actual incomplete
      // state hashes to something different.
      dismissed_component_warning_hash: null,
      // Piece 5b: user-defined section links — pairs the user has
      // explicitly tied together (e.g. lecture + a particular lab).
      // Stored once per pair, undirected. Both unstage modal and the
      // chain icon read from this list.
      linked_sections: [],
    };
    state.plans.byId.set(id, plan);
    if (isActive) state.plans.active = id;
    _planNotify("create", id);
    return id;
  }
  function _planDelete(planId) {
    const plan = state.plans.byId.get(planId);
    if (!plan) return false;
    if (plan.kind === "active") {
      throw new Error("Cannot delete the active plan. Promote another plan first.");
    }
    state.plans.byId.delete(planId);
    _planNotify("delete", planId);
    return true;
  }
  function _planPromote(planId) {
    const plan = state.plans.byId.get(planId);
    if (!plan) throw new Error(`Unknown plan ${planId}`);
    if (plan.kind === "active") return; // no-op
    const prev = state.plans.byId.get(state.plans.active);
    if (prev && prev.id !== planId) {
      prev.kind = "candidate";
      prev.modified_at = _nowISO();
    }
    plan.kind = "active";
    plan.modified_at = _nowISO();
    state.plans.active = planId;
    _planNotify("promote", planId);
  }
  function _planRename(planId, newName) {
    const plan = state.plans.byId.get(planId);
    if (!plan) throw new Error(`Unknown plan ${planId}`);
    if (typeof newName !== "string" || !newName.trim()) {
      throw new Error("Plan name must be a non-empty string.");
    }
    plan.name = newName.trim();
    plan.modified_at = _nowISO();
    _planNotify("rename", planId);
  }
  function _planDuplicate(planId, newName) {
    const src = state.plans.byId.get(planId);
    if (!src) throw new Error(`Unknown plan ${planId}`);
    const id = _newPlanId();
    state.plans.byId.set(id, {
      id,
      name: typeof newName === "string" && newName.trim() ? newName.trim() : `${src.name} (copy)`,
      kind: "candidate",
      created_at: _nowISO(),
      modified_at: _nowISO(),
      origin: src.origin,
      sections: src.sections.map((s) => ({ class_number: s.class_number, subject: s.subject || null })),
      filters: src.filters.map((f) => Object.assign({}, f)),
      notes: src.notes || "",
      // Reset the dismissed-warning hash for the copy: the duplicate
      // has its own incomplete-components story to tell.
      dismissed_component_warning_hash: null,
      linked_sections: (src.linked_sections || []).map((l) => ({ a: l.a, b: l.b })),
    });
    _planNotify("duplicate", id, { source_plan_id: planId });
    return id;
  }
  function _planStageSection(planId, ref) {
    const plan = state.plans.byId.get(planId);
    if (!plan) throw new Error(`Unknown plan ${planId}`);
    if (!ref || !ref.class_number) throw new Error("stageSection requires {class_number, subject?}");
    // Idempotent: if already staged, no-op.
    if (plan.sections.some((s) => s.class_number === ref.class_number)) return;
    plan.sections.push({
      class_number: ref.class_number,
      subject: ref.subject || null,
    });
    plan.modified_at = _nowISO();
    _planNotify("stage_section", planId, { class_number: ref.class_number });
  }
  function _planUnstageSection(planId, classNumber) {
    const plan = state.plans.byId.get(planId);
    if (!plan) throw new Error(`Unknown plan ${planId}`);
    const before = plan.sections.length;
    plan.sections = plan.sections.filter((s) => s.class_number !== classNumber);
    if (plan.sections.length === before) return false;
    // Drop any links involving this section so the link list never
    // references absent sections (Piece 5b).
    if (Array.isArray(plan.linked_sections) && plan.linked_sections.length > 0) {
      const cn = String(classNumber);
      plan.linked_sections = plan.linked_sections.filter(
        (l) => l.a !== cn && l.b !== cn,
      );
    }
    plan.modified_at = _nowISO();
    _planNotify("unstage_section", planId, { class_number: classNumber });
    return true;
  }
  function _planAddFilter(planId, filterDef) {
    const plan = state.plans.byId.get(planId);
    if (!plan) throw new Error(`Unknown plan ${planId}`);
    const id = _newFilterId();
    const filter = Object.assign(
      { id, name: "", days: [], start_time: null, end_time: null, color: null, pattern: "solid", visible: true },
      filterDef || {},
      { id }, // never let caller override id
    );
    plan.filters.push(filter);
    plan.modified_at = _nowISO();
    _planNotify("add_filter", planId, { filter_id: id });
    return id;
  }
  function _planUpdateFilter(planId, filterId, changes) {
    const plan = state.plans.byId.get(planId);
    if (!plan) throw new Error(`Unknown plan ${planId}`);
    const f = plan.filters.find((x) => x.id === filterId);
    if (!f) throw new Error(`Unknown filter ${filterId} in plan ${planId}`);
    for (const k of Object.keys(changes || {})) {
      if (k === "id") continue; // never reassign
      f[k] = changes[k];
    }
    plan.modified_at = _nowISO();
    _planNotify("update_filter", planId, { filter_id: filterId });
  }
  function _planRemoveFilter(planId, filterId) {
    const plan = state.plans.byId.get(planId);
    if (!plan) throw new Error(`Unknown plan ${planId}`);
    const before = plan.filters.length;
    plan.filters = plan.filters.filter((x) => x.id !== filterId);
    if (plan.filters.length === before) return false;
    plan.modified_at = _nowISO();
    _planNotify("remove_filter", planId, { filter_id: filterId });
    return true;
  }
  // Piece 5b: dismissal hash setter for the floating component-warning
  // notification. Stored on the plan so dismissal is per-plan.
  function _planSetDismissedComponentHash(planId, hash) {
    const plan = state.plans.byId.get(planId);
    if (!plan) throw new Error(`Unknown plan ${planId}`);
    plan.dismissed_component_warning_hash = hash == null ? null : String(hash);
    plan.modified_at = _nowISO();
    _planNotify("set_dismissed_component_hash", planId);
  }
  // Piece 5b: section-link plumbing. Pairs are stored once per plan,
  // undirected — adding {a, b} when {b, a} already exists is a no-op,
  // removing either direction wipes the pair. Self-links are rejected.
  function _planAddLink(planId, classA, classB) {
    const plan = state.plans.byId.get(planId);
    if (!plan) throw new Error(`Unknown plan ${planId}`);
    const a = String(classA);
    const b = String(classB);
    if (!a || !b) throw new Error("addLink requires two class numbers");
    if (a === b) throw new Error("Cannot link a section to itself");
    plan.linked_sections = plan.linked_sections || [];
    const exists = plan.linked_sections.some(
      (l) => (l.a === a && l.b === b) || (l.a === b && l.b === a),
    );
    if (exists) return false;
    plan.linked_sections.push({ a, b });
    plan.modified_at = _nowISO();
    _planNotify("add_link", planId, { a, b });
    return true;
  }
  function _planRemoveLink(planId, classA, classB) {
    const plan = state.plans.byId.get(planId);
    if (!plan) throw new Error(`Unknown plan ${planId}`);
    const a = String(classA);
    const b = String(classB);
    plan.linked_sections = plan.linked_sections || [];
    const before = plan.linked_sections.length;
    plan.linked_sections = plan.linked_sections.filter(
      (l) => !((l.a === a && l.b === b) || (l.a === b && l.b === a)),
    );
    if (plan.linked_sections.length === before) return false;
    plan.modified_at = _nowISO();
    _planNotify("remove_link", planId, { a, b });
    return true;
  }
  // Drop every link involving `classNum`. Used after unstaging so the
  // plan's link list never references absent sections.
  function _planClearLinksForSection(planId, classNum) {
    const plan = state.plans.byId.get(planId);
    if (!plan) return 0;
    const cn = String(classNum);
    plan.linked_sections = plan.linked_sections || [];
    const before = plan.linked_sections.length;
    plan.linked_sections = plan.linked_sections.filter(
      (l) => l.a !== cn && l.b !== cn,
    );
    const removed = before - plan.linked_sections.length;
    if (removed > 0) {
      plan.modified_at = _nowISO();
      _planNotify("clear_links_for_section", planId, { class_number: cn });
    }
    return removed;
  }
  function _planClearByOrigin(origin) {
    let removed = 0;
    let activeRemoved = false;
    for (const [id, plan] of Array.from(state.plans.byId.entries())) {
      if (plan.origin !== origin) continue;
      state.plans.byId.delete(id);
      removed++;
      if (state.plans.active === id) {
        state.plans.active = null;
        activeRemoved = true;
      }
    }
    if (activeRemoved) {
      // Re-promote the most-recently-modified user plan if any survived.
      const candidates = _planList()
        .filter((p) => p.kind !== "active")
        .sort((a, b) => (b.modified_at || "").localeCompare(a.modified_at || ""));
      if (candidates.length > 0) {
        candidates[0].kind = "active";
        state.plans.active = candidates[0].id;
      } else {
        // Nothing left — re-seed the default active plan.
        _ensureInitialPlan();
      }
    }
    if (removed > 0) _planNotify("clear_by_origin", null, { origin, removed });
    return removed;
  }

  // Convenience for the Manage tab's "Clear edits only" button. Wipes
  // every edit in the overlay (including soft-deletes) but leaves parsed
  // data and metadata intact. Fires one notify, not one per edit, so the
  // pub/sub stream stays clean for UI re-renders.
  function clearEdits() {
    state.edits.clear();
    state.autoPruneLog.length = 0;
    _notify({ type: "mutation", reason: "clear", parsed: false, edits: true });
  }

  function clear({ parsed, edits, imports, plans }) {
    if (parsed) {
      state.parsed.clear();
      state.subjectMetadata.clear();
    }
    if (edits) {
      state.edits.clear();
      state.autoPruneLog.length = 0;
      state.migrationWarnings.length = 0;
    }
    if (imports) {
      state.imports.clear();
    }
    if (plans) {
      state.plans.byId.clear();
      state.plans.active = null;
      _ensureInitialPlan();
    }
    _notify({
      type: "mutation",
      reason: "clear",
      parsed: !!parsed,
      edits: !!edits,
      imports: !!imports,
      plans: !!plans,
    });
  }

  function toJSON() {
    const importsObj = {};
    for (const [id, entry] of state.imports.entries()) {
      importsObj[id] = entry;
    }
    const plansById = {};
    for (const [id, plan] of state.plans.byId.entries()) {
      plansById[id] = plan;
    }
    return {
      schema_version: SCHEMA_VERSION,
      parsed: Object.fromEntries(state.parsed),
      edits: Array.from(state.edits.values()),
      auto_pruned: [...state.autoPruneLog],
      migration_warnings: [...state.migrationWarnings],
      subject_metadata: Object.fromEntries(state.subjectMetadata),
      imports: importsObj,
      plans: { active: state.plans.active, byId: plansById },
    };
  }

  function fromJSON(data) {
    state.parsed.clear();
    state.edits.clear();
    state.autoPruneLog.length = 0;
    state.migrationWarnings.length = 0;
    state.subjectMetadata.clear();
    state.imports.clear();
    state.plans.byId.clear();
    state.plans.active = null;
    if (data.plans && data.plans.byId) {
      for (const [id, plan] of Object.entries(data.plans.byId)) {
        // Defensive: only restore well-shaped plans. Unknown shapes are
        // silently dropped rather than crashing the load path.
        if (plan && typeof plan === "object" && typeof plan.id === "string") {
          state.plans.byId.set(id, {
            id: plan.id,
            name: typeof plan.name === "string" ? plan.name : "Unnamed plan",
            kind: plan.kind === "active" ? "active" : "candidate",
            created_at: plan.created_at || _nowISO(),
            modified_at: plan.modified_at || _nowISO(),
            origin: plan.origin === "auto-scheduler" ? "auto-scheduler" : "user",
            sections: Array.isArray(plan.sections) ? plan.sections : [],
            filters: Array.isArray(plan.filters) ? plan.filters : [],
            notes: typeof plan.notes === "string" ? plan.notes : "",
            dismissed_component_warning_hash:
              typeof plan.dismissed_component_warning_hash === "string"
                ? plan.dismissed_component_warning_hash
                : null,
            linked_sections: Array.isArray(plan.linked_sections)
              ? plan.linked_sections
                  .filter((l) => l && l.a && l.b && l.a !== l.b)
                  .map((l) => ({ a: String(l.a), b: String(l.b) }))
              : [],
          });
        }
      }
      if (typeof data.plans.active === "string" && state.plans.byId.has(data.plans.active)) {
        state.plans.active = data.plans.active;
      }
    }
    // After restore, ensure the invariants: at most one active plan,
    // and if no plan was loaded, seed a default. ensureInitialPlan is
    // idempotent.
    _ensureInitialPlan();

    for (const [id, entry] of Object.entries(data.imports || {})) {
      // Defensive: only restore well-shaped entries. We don't re-run the
      // pack validator here (that already ran at import time), but we do
      // confirm the entry has a pack object.
      if (entry && typeof entry === "object" && entry.pack) {
        state.imports.set(id, entry);
      }
    }
    for (const [s, p] of Object.entries(data.parsed || {})) {
      state.parsed.set(s, p);
    }
    for (const [s, m] of Object.entries(data.subject_metadata || {})) {
      state.subjectMetadata.set(s, m);
    }
    for (const edit of data.edits || []) {
      const valid = edit.class_number
        ? isValidSectionPath(edit.field_path)
        : edit.field_path === "_deleted" || isValidCoursePath(edit.field_path);
      if (!valid) {
        state.migrationWarnings.push({
          type: "invalid_path",
          edit,
          message: `Edit path ${JSON.stringify(edit.field_path)} is not valid in schema ${SCHEMA_VERSION}; dropping edit`,
        });
        continue;
      }
      state.edits.set(editKey(edit), edit);
    }
    for (const ap of data.auto_pruned || []) state.autoPruneLog.push(ap);
    for (const mw of data.migration_warnings || [])
      state.migrationWarnings.push(mw);
    _notify({ type: "mutation", reason: "hydrate" });
  }

  function getSubjectMetadata() {
    return Object.fromEntries(state.subjectMetadata);
  }

  // Seed the default plan on construction. fromJSON / clear({plans})
  // re-establish this invariant if the namespace ever ends up empty.
  _ensureInitialPlan();

  return {
    ingestSubject,
    getEffective,
    setEdit,
    deleteSection,
    deleteCourse,
    undelete,
    listEdits,
    clear,
    clearEdits,
    addImport,
    removeImport,
    listImports,
    getImport,
    copySectionFromImport,
    plans: {
      list: _planList,
      get: _planGet,
      getActive: _planGetActive,
      create: _planCreate,
      delete: _planDelete,
      promote: _planPromote,
      rename: _planRename,
      duplicate: _planDuplicate,
      stageSection: _planStageSection,
      unstageSection: _planUnstageSection,
      addFilter: _planAddFilter,
      updateFilter: _planUpdateFilter,
      removeFilter: _planRemoveFilter,
      setDismissedComponentHash: _planSetDismissedComponentHash,
      addLink: _planAddLink,
      removeLink: _planRemoveLink,
      clearLinksForSection: _planClearLinksForSection,
      clearByOrigin: _planClearByOrigin,
    },
    toJSON,
    fromJSON,
    getSubjectMetadata,
    getParsedValue,
    subscribe,
  };
}
