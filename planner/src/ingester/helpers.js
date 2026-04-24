// Pure parse helpers for the Albert paste ingester.
// No DOM, no storage, no Node-only APIs. Safe to import from the browser or tests.
// Each helper is total: returns a structured result rather than throwing on bad input.
// The walkthrough in fixtures/EXPECTED_OUTPUT_WALKTHROUGH.md is the source of truth.

const VALID_DAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
const KNOWN_TITLE_FLAGS = new Set(["WO"]);

// "08/31/2026" -> "2026-08-31". Returns null on malformed input.
export function parseDate(str) {
  if (typeof str !== "string") return null;
  const m = str.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

// Albert uses "." in place of ":" and 12h AM/PM.
// "5.00 PM" -> "17:00", "9.55 AM" -> "09:55", "12.00 AM" -> "00:00", "12.30 PM" -> "12:30".
// Returns null if the string doesn't match the expected shape.
export function parseTime(str) {
  if (typeof str !== "string") return null;
  const m = str.trim().match(/^(\d{1,2})\.(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const meridiem = m[3].toUpperCase();
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (meridiem === "AM" && hour === 12) hour = 0;
  else if (meridiem === "PM" && hour !== 12) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// "Mon,Wed" -> ["Mon","Wed"]. Empty/nullish -> []. Unknown tokens are dropped
// and reported via `unknown` so callers can warn.
export function parseDays(str) {
  if (typeof str !== "string" || str.trim() === "") return { days: [], unknown: [] };
  const days = [];
  const unknown = [];
  for (const raw of str.split(",")) {
    const tok = raw.trim();
    if (tok === "") continue;
    if (VALID_DAYS.has(tok)) days.push(tok);
    else unknown.push(tok);
  }
  return { days, unknown };
}

// Maps Albert's `Class Status:` value to the schema's status object.
// Known forms: Open, Closed, Wait List (N), Cancelled.
// Unknowns return type:"unknown" so the parser can warn and keep going.
export function parseStatus(str) {
  const raw = typeof str === "string" ? str.trim() : "";
  if (raw === "Open") return { raw, type: "open", count: null };
  if (raw === "Closed") return { raw, type: "closed", count: null };
  if (raw === "Cancelled") return { raw, type: "cancelled", count: null };
  const wl = raw.match(/^Wait List \((\d+)\)$/);
  if (wl) return { raw, type: "waitlist", count: parseInt(wl[1], 10) };
  return { raw, type: "unknown", count: null };
}

// Splits a room string on the literal " Room " delimiter.
// "West Administration Room 001" -> building "West Administration", room_number "001".
// "No Room Required" -> the literal sentinel with null building/number.
// null/"" -> all nulls. Unparseable -> room preserved verbatim, building/number null.
export function parseRoom(str) {
  if (str == null) return { room: null, building: null, room_number: null };
  const trimmed = String(str).trim();
  if (trimmed === "") return { room: null, building: null, room_number: null };
  if (trimmed === "No Room Required") {
    return { room: "No Room Required", building: null, room_number: null };
  }
  const idx = trimmed.indexOf(" Room ");
  if (idx === -1) {
    return { room: trimmed, building: null, room_number: null };
  }
  const building = trimmed.slice(0, idx).trim();
  const room_number = trimmed.slice(idx + " Room ".length).trim();
  return { room: trimmed, building: building || null, room_number: room_number || null };
}

// "AD 08/31/2026 - 12/14/2026" -> { code: "AD", start_date: "2026-08-31", end_date: "2026-12-14" }.
// Returns null on malformed input. Code is preserved literally (no inference from dates).
export function parseSession(str) {
  if (typeof str !== "string") return null;
  const m = str.trim().match(/^(\S+)\s+(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})$/);
  if (!m) return null;
  const start_date = parseDate(m[2]);
  const end_date = parseDate(m[3]);
  if (!start_date || !end_date) return null;
  return { code: m[1], start_date, end_date };
}

// Strips recognized 2-letter title-prefix flags (currently just "WO").
// "WO Foundations of Middle Eastern Dance"
//   -> { title: "Foundations of Middle Eastern Dance", flags: ["WO"] }
// Unknown prefixes are left on the title; flags is empty.
export function stripTitleFlags(title) {
  if (typeof title !== "string") return { title: "", flags: [] };
  const flags = [];
  let rest = title.trim();
  // Walkthrough currently documents only WO, but the loop tolerates future combinations.
  while (true) {
    const m = rest.match(/^([A-Z]{2})\s+(.+)$/);
    if (!m || !KNOWN_TITLE_FLAGS.has(m[1])) break;
    flags.push(m[1]);
    rest = m[2];
  }
  return { title: rest, flags };
}

// "4" -> 4. "2 - 4" -> { min: 2, max: 4 }. Empty/malformed -> null.
// Shared between the course-level "| N units" line and the section-level one.
export function parseUnits(str) {
  if (typeof str !== "string") return null;
  const t = str.trim();
  if (t === "") return null;
  const range = t.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (range) return { min: parseFloat(range[1]), max: parseFloat(range[2]) };
  const num = t.match(/^(\d+(?:\.\d+)?)$/);
  if (num) return parseFloat(num[1]);
  return null;
}

// "Zam, Azhar; Sabah, Shafiya" -> ["Zam, Azhar", "Sabah, Shafiya"].
// null/empty -> []. Preserves "Last, First" spelling.
export function parseInstructors(str) {
  if (typeof str !== "string") return [];
  const trimmed = str.trim();
  if (trimmed === "") return [];
  return trimmed
    .split(/;\s*/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}
