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
  };

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

  // Convenience for the Manage tab's "Clear edits only" button. Wipes
  // every edit in the overlay (including soft-deletes) but leaves parsed
  // data and metadata intact. Fires one notify, not one per edit, so the
  // pub/sub stream stays clean for UI re-renders.
  function clearEdits() {
    state.edits.clear();
    state.autoPruneLog.length = 0;
    _notify({ type: "mutation", reason: "clear", parsed: false, edits: true });
  }

  function clear({ parsed, edits }) {
    if (parsed) {
      state.parsed.clear();
      state.subjectMetadata.clear();
    }
    if (edits) {
      state.edits.clear();
      state.autoPruneLog.length = 0;
      state.migrationWarnings.length = 0;
    }
    _notify({ type: "mutation", reason: "clear", parsed: !!parsed, edits: !!edits });
  }

  function toJSON() {
    return {
      schema_version: SCHEMA_VERSION,
      parsed: Object.fromEntries(state.parsed),
      edits: Array.from(state.edits.values()),
      auto_pruned: [...state.autoPruneLog],
      migration_warnings: [...state.migrationWarnings],
      subject_metadata: Object.fromEntries(state.subjectMetadata),
    };
  }

  function fromJSON(data) {
    state.parsed.clear();
    state.edits.clear();
    state.autoPruneLog.length = 0;
    state.migrationWarnings.length = 0;
    state.subjectMetadata.clear();

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
    toJSON,
    fromJSON,
    getSubjectMetadata,
    getParsedValue,
    subscribe,
  };
}
