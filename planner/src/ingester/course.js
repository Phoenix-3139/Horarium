// Course-block parser. Consumes the text of one Albert course block and
// produces a Course object matching DATA_SCHEMA.md. Sections within the
// block are handed off to parseSection verbatim.
//
// Contract:
//   parseCourse(blockText) -> { course, warnings, unparsed_lines }
//   - never throws
//   - aggregates warnings and unparsed_lines from every child parseSection
//   - emits `course: null` if the header line cannot be parsed at all
//
// Splitting strategy for sections: after consuming the course header,
// description, and the School:/Term: preamble, every remaining line that
// starts with the course code (optionally followed by "| N units") is
// treated as a section-block boundary. The `Class#:` line downstream is
// what actually identifies a section, but using the code prefix lets us
// locate the boundary at the exact start of the block that parseSection
// expects. Noise lines inside sections (notes, descriptions, etc.) do not
// begin with "<SUBJECT> <CATNUM>" at column 0, so this heuristic is
// robust against the real-world paste shapes seen so far.

import { parseSection } from "./section.js";
import { parseUnits, stripTitleFlags } from "./helpers.js";

// Full NYU subject-prefix allowlist (685 entries), sourced from
// docs/NOMENCLATURE.md Section 1 on 2026-04-24. Covers every prefix
// observed in the bulletins.nyu.edu scrape plus the 31 manually-patched
// rows added after the harvester gap analysis (see LESSONS.md).
// Anything outside this set still parses but fires `unknown_subject_suffix`
// — which now genuinely means "NYU added a new prefix; update
// NOMENCLATURE.md" rather than "we forgot to list this one."
const KNOWN_SUBJECT_PREFIXES = new Set([
  "ACA-UF", "ACC-UF", "ACCT-GB", "ACCT-UB", "ACE-UE", "ACM-UF", "ACS-UH", "ACTG-GT",
  "ADAV1-UC", "AE-UY", "AECE2-CS", "AELS-UF", "AENR1-UC", "AFGC-UF", "AFRS-GA", "AGT-UF",
  "AMLT-GE", "AMST-GA", "ANES-MD", "ANES-ML", "ANST-GA", "ANST-UA", "ANTH-GA", "ANTH-UA",
  "ANTH-UH", "ANTH1-UC", "APHY-GH", "APR-UF", "APSTA-GE", "APSTA-UE", "APSY-GE", "APSY-UE",
  "ARABL-UH", "ARBC-SHU", "ARCS-GE", "ARCS-UE", "ART-GE", "ART-SHU", "ART-UE", "ARTCR-GE",
  "ARTCR-UE", "ARTED-GE", "ARTH-GA", "ARTH-UA", "ARTH-UH", "ARTH1-UC", "ARTMD-GH", "ARTP-GE",
  "ARTP-UE", "ARTS-UG", "ARTS1-UC", "ARTS2-CS", "ARTT-GE", "ARTT-NE", "ARTT-UE", "ARVA-GE",
  "ASH-GE", "ASL-UE", "ASPP-GT", "ASPP-UT", "AW-UH", "AWS-UF", "BAS01-DN", "BAS06-DN",
  "BASCI-DN", "BE-GY", "BEH03-DN", "BEH05-DN", "BEHSC-DN", "BI-GY", "BILED-GE", "BILED-UE",
  "BIOL-GA", "BIOL-SHU", "BIOL-UA", "BIOL-UH", "BIOMS-DN", "BMIN-GA", "BMS-UY", "BMSC-GA",
  "BPEP-SHU", "BPEP-UB", "BSPA-GB", "BSPA-UB", "BT-GY", "BTE-GY", "BTEP-UB", "BUSF-SHU",
  "BUSN1-UC", "BUSOR-UH", "CADT-UH", "CAGC-UF", "CAM-UY", "CAMS-UA", "CAP-GP", "CBE-GY",
  "CBE-UY", "CCCF-SHU", "CCEA-UH", "CCEX-SHU", "CCOL-UH", "CCSE-MD", "CCSF-SHU", "CCST-SHU",
  "CDAD-UH", "CE-GY", "CE-UY", "CEH-GA", "CEL-SHU", "CELLB-MD", "CELP2-CS", "CENG-SHU",
  "CFI-UA", "CHDED-GE", "CHDED-UE", "CHEM-GA", "CHEM-SHU", "CHEM-UA", "CHEM-UH", "CHIN-SHU",
  "CHINL-UH", "CINE-GT", "CINE-UT", "CLASS-GA", "CLASS-UA", "CLS03-DN", "CLS04-DN", "CLS06-DN",
  "CLS07-DN", "CLS08-DN", "CLS09-DN", "CLS10-DN", "CLS11-DN", "CLSCI-DN", "CM-GY", "CM-UY",
  "COART-UT", "COHRT-UA", "COLIT-GA", "COLIT-UA", "COLU-UA", "COMM2-CS", "CONM1-GC", "CONS-GB",
  "COR1-GB", "COR2-GB", "CORE-GG", "CORE-GP", "CORE-UA", "CP-GY", "CP-UY", "CPSY-MD",
  "CRTE-NE", "CRWR-SHU", "CRWRI-GA", "CRWRI-UA", "CS-GY", "CS-UH", "CS-UY", "CSCD-GE",
  "CSCD-UE", "CSCI-GA", "CSCI-SHU", "CSCI-UA", "CSTS-UH", "CTM-NA", "CUSP-GX", "CVSUR-MD",
  "CVSUR-ML", "CWE-UF", "CWRG1-UC", "CWS-UF", "DAAH-UH", "DANC-GT", "DANC-UT", "DATS-SHU",
  "DBIN-GB", "DERM-MD", "DESG-GT", "DEVE1-GC", "DFLM2-CS", "DGCM1-UC", "DGS03-DN", "DGS06-DN",
  "DGS07-DN", "DGS10-DN", "DGSCI-DN", "DHSS-GA", "DHYG1-UD", "DHYG2-UD", "DHYG3-UD", "DM-GY",
  "DM-UY", "DRLIT-UA", "DS-GA", "DS-UA", "DSWSW-GS", "DWPG-GT", "DWPG-UT", "EAGC-UF",
  "EAP-SHU", "EAST-GA", "EAST-UA", "ECE-GY", "ECE-UY", "ECED-GE", "ECED-UE", "ECI-UF",
  "ECII-UF", "ECOC1-GC", "ECON-GA", "ECON-GB", "ECON-GH", "ECON-SHU", "ECON-UA", "ECON-UB",
  "ECON-UH", "ECON1-UC", "EDCT-GE", "EDCT-UE", "EDLED-GE", "EDLED-UE", "EDPLY-GE", "EDST-UE",
  "EENG-SHU", "EG-UY", "EHSC-GA", "EJST-GE", "ELEC-GG", "ELEC-UF", "EMAT-GE", "EMSC1-GC",
  "EN-UY", "ENGD-SHU", "ENGED-GE", "ENGED-UE", "ENGL-GA", "ENGL-UA", "ENGR-GH", "ENGR-NY",
  "ENGR-UH", "ENSTU-UF", "ENVR-UH", "ENVST-GA", "ENVST-UA", "ENYC-GE", "ERMED-MD", "ERMED-ML",
  "ESL-NI", "ETH05-DN", "EURO-GA", "EURO-UA", "EXEC-GP", "EXLI-SHU", "EXPOS-UA", "EXPR1-UC",
  "EXWR1-UC", "FDGR1-GC", "FDNMD-ML", "FILMM-UH", "FILV1-UC", "FIN-UY", "FINA2-CS", "FINC-GB",
  "FINC-UB", "FINH-GA", "FIRST-UG", "FMMED-ML", "FMTV-UT", "FOOD-GE", "FOOD-UE", "FRE-GY",
  "FREN-GA", "FREN-SHU", "FREN-UA", "FRENL-UH", "FRMED-MD", "FWS-UF", "FYSEM-UA", "GA-GY",
  "GAMES-GT", "GAMES-UT", "GCHN-SHU", "GCOM1-GC", "GERM-GA", "GERM-UA", "GFMTV-GT", "GLBL-SHU",
  "GLOB1-GC", "GLSP1-GC", "GMTW-GT", "GMTW-UT", "GPH-GU", "GSCC1-GC", "GT-UF", "GWA-UF",
  "GWC-UF", "GWM-UF", "HBRJD-GA", "HBRJD-UA", "HCAT1-GC", "HEAL1-UC", "HEL-UA", "HERST-UH",
  "HI-UY", "HIST-GA", "HIST-SHU", "HIST-UA", "HIST-UH", "HIST1-UC", "HISTN-UH", "HOU-UF",
  "HPAM-GP", "HPSE-GE", "HPSE-UE", "HRCM1-GC", "HSAD-NI", "HSED-GE", "HSED-UE", "HUCC-GE",
  "HUM-MD", "HUMN-SHU", "HUMN1-UC", "ICINE-UT", "ICINT-MD", "IDIS-SHU", "IDSEM-UG", "IDWPG-UT",
  "IE-GY", "IF-UF", "IFMTV-UT", "IFST-GA", "IM-UH", "IMALR-GT", "IMBX-SHU", "IMNY-UT",
  "INDEP-GP", "INDIV-GG", "INDIV-UG", "INST1-UC", "INTA-GB", "INTD-MD", "INTE-GE", "INTE-UE",
  "INTER-MD", "INTER-ML", "INTG1-GC", "INTM-SHU", "INTRL-GA", "INTRL-UA", "IPHTI-UT", "IRISH-GA",
  "IRISH-UA", "ISAW-GA", "ISMM1-UC", "ITAL-GA", "ITAL-UA", "ITHEA-UT", "ITPG-GT", "IUCD-GE",
  "JAPN-SHU", "JAPNL-UH", "JIRS-UF", "JOUR-GA", "JOUR-SHU", "JOUR-UA", "KORE-SHU", "LAGC-UF",
  "LAIN1-UC", "LANED-GE", "LATC-GA", "LATC-UA", "LAW-LW", "LAW-UH", "LAWH-LW", "LAWT-LW",
  "LING-GA", "LING-UA", "LISCI-UF", "LIT-SHU", "LITC-GE", "LITC-UE", "LITCW-UH", "LITR1-UC",
  "LRMS1-UC", "LWSOC-UA", "MA-GY", "MA-UY", "MAINT-GA", "MAINT-GE", "MAINT-UE", "MASY1-GC",
  "MATH-GA", "MATH-SHU", "MATH-UA", "MATH-UH", "MATH1-UC", "MCC-GE", "MCC-UE", "MCOM-GB",
  "MD-UY", "ME-GY", "ME-UY", "MED-MD", "MED-ML", "MEDI-GA", "MEDI-UA", "MEGC-UF",
  "MEIS-GA", "MEIS-UA", "MEST1-UC", "MG-GY", "MG-UY", "MGMT-GB", "MGMT-SHU", "MGMT-UB",
  "MHA-GP", "MHUM-UA", "MKAN1-UC", "MKTG-GB", "MKTG-SHU", "MKTG-UB", "MN-GY", "MPABR-GE",
  "MPABR-UE", "MPADE-GE", "MPADE-UE", "MPADT-GE", "MPADT-UE", "MPAET-GE", "MPAET-UE", "MPAGC-GE",
  "MPAGC-UE", "MPAIA-GE", "MPAIA-UE", "MPAJZ-GE", "MPAJZ-UE", "MPAMB-GE", "MPAMB-UE", "MPAME-GE",
  "MPAME-UE", "MPAMT-GE", "MPAMT-UE", "MPAP-NE", "MPAPA-GE", "MPAPA-UE", "MPAPE-GE", "MPAPE-UE",
  "MPAPS-GE", "MPAPS-UE", "MPASS-GE", "MPASS-UE", "MPATC-GE", "MPATC-UE", "MPATE-GE", "MPATE-UE",
  "MPAVP-GE", "MPAVP-UE", "MPAWW-GE", "MPAWW-UE", "MS-MD", "MSEM1-GC", "MSFP1-GC", "MSMS-GA",
  "MSPM1-GC", "MSPP-GP", "MSWAC-GS", "MSWEL-GS", "MSWFD-GS", "MSWPF-GS", "MTHED-GE", "MTHED-UE",
  "MTRO-NE", "MULT-UB", "MULT2-CS", "MUS-SHU", "MUSIC-GA", "MUSIC-UA", "MUSIC-UH", "NCRD-GT",
  "NCRD-UT", "NDES2-CS", "NEST-GA", "NEUR-SHU", "NEURL-GA", "NEURL-UA", "NEURO-MD", "NEURO-ML",
  "NEUSR-MD", "NOCR-GB", "NODEP-UA", "NONCR-GP", "NURSE-GN", "NURSE-UN", "NUTR-GE", "NUTR-UE",
  "NYU-SHU", "OART-GT", "OART-UT", "OBGYN-MD", "OBGYN-ML", "OPHTH-MD", "OPMG-GB", "OPMG-UB",
  "ORBC1-UC", "ORTHO-MD", "ORTHO-ML", "OT-GE", "OT-UE", "OTOL-MD", "OTOL-ML", "PADM-GP",
  "PATH-MD", "PATH-ML", "PCIX-SHU", "PCL02-DN", "PCL03-DN", "PCL04-DN", "PCL07-DN", "PCL08-DN",
  "PCL09-DN", "PCL10-DN", "PCL11-DN", "PDPSA-GA", "PEACE-UH", "PEDS-MD", "PEDS-ML", "PERF-GT",
  "PERF-UT", "PH-GY", "PH-UY", "PHD-GP", "PHDSW-GS", "PHED-GE", "PHED-UE", "PHIL-GA",
  "PHIL-SHU", "PHIL-UA", "PHIL-UH", "PHIL2-CS", "PHP-UY", "PHTI-GT", "PHTI-UT", "PHYED-UH",
  "PHYS-GA", "PHYS-SHU", "PHYS-UA", "PHYS-UH", "POET-GA", "POL-GA", "POL-UA", "POLS1-UC",
  "POLSC-UH", "PORT-GA", "PORT-UA", "PRACT-UG", "PRCAR-ML", "PRCC1-GC", "PRECL-DN", "PROD-GT",
  "PS-UY", "PSIN1-UC", "PSYC-SHU", "PSYC1-UC", "PSYCH-GA", "PSYCH-MD", "PSYCH-ML", "PSYCH-UA",
  "PSYCH-UH", "PSYCN-UH", "PT-GE", "PUBB1-GC", "PUBHM-GA", "PUBPL-UA", "PWRT1-GC", "RADON-MD",
  "RADON-ML", "RADS-MD", "RADS-ML", "RE-GY", "REAL1-GC", "REAL1-UC", "REBS1-UC", "RECL2-CS",
  "REFI2-CS", "REHAB-GE", "REHAB-MD", "REHAB-ML", "RELST-GA", "RELST-UA", "REMU-UT", "RESB2-CS",
  "RESCH-GE", "ROB-GY", "ROB-UY", "RUSSN-GA", "RUSSN-UA", "RWLD1-GC", "RWLD1-UC", "SAGC-UF",
  "SAHS-GE", "SAHS-UE", "SAS-SHU", "SASEM-UG", "SCA-UA", "SCHOL-GG", "SCIED-GE", "SCIED-UE",
  "SCIEN-UH", "SCMTH-GE", "SCNC1-UC", "SCTEC-UF", "SDHM-SHU", "SEG-UY", "SFMTV-UT", "SHBI-GB",
  "SOC-GA", "SOC-UA", "SOCED-GE", "SOCED-UE", "SOCS-SHU", "SOCS1-UC", "SOCSC-UH", "SOCY1-UC",
  "SOED-GE", "SOED-UE", "SOIM-SHU", "SOIM-UB", "SPAN-GA", "SPAN-SHU", "SPAN-UA", "SPANL-UH",
  "SPCED-GE", "SPCED-UE", "SPEC-UT", "SRPP-UH", "STAT-GB", "STAT-UB", "STS-UY", "SURG-MD",
  "SURG-ML", "SUSCI-UF", "SUST1-UC", "TCHL-GE", "TCHL-UE", "TCHS1-GC", "TCHT1-UC", "TCS-UY",
  "TCSB1-GC", "TCSM1-UC", "TCTM1-GC", "TECH-GB", "TECH-UB", "TESOL-GE", "TESOL-UE", "THEA-UT",
  "THEAT-UH", "TR-GY", "TRAN1-GC", "TRAVL-UG", "UGA-UY", "UGPH-GU", "UNDSW-US", "UPADM-GP",
  "URB-UY", "URBN1-UC", "URBS-UA", "URO-MD", "URO-ML", "URPL-GP", "VIP-GY", "VIP-UY",
  "VISAR-UH", "VRTP-GT", "WLGED-UE", "WRCI-UF", "WREX-UF", "WRIT-SHU", "WRIT-UH", "WRTNG-UG",
  "XBA1-GB", "XFN1-GB", "XGF1-GB", "XRM1-GB", "XTR1-GB"
]);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Walk two values in parallel and collect every leaf-level disagreement
// with a path string (e.g. "meetings[0].room"). Objects and arrays recurse;
// primitives (or mismatched types) emit a single { path, values } pair.
// Array length mismatches surface as a dedicated "<path>.length" entry
// AND we still recurse into the overlapping prefix.
function diffAtLeaves(a, b, path) {
  const out = [];
  if (a === b) return out;
  if (JSON.stringify(a) === JSON.stringify(b)) return out;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      out.push({ path: `${path}.length`, values: [a.length, b.length] });
    }
    const common = Math.min(a.length, b.length);
    for (let i = 0; i < common; i++) {
      out.push(...diffAtLeaves(a[i], b[i], `${path}[${i}]`));
    }
    return out;
  }

  if (
    a !== null &&
    b !== null &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const nextPath = path ? `${path}.${k}` : k;
      out.push(...diffAtLeaves(a[k], b[k], nextPath));
    }
    return out;
  }

  out.push({ path, values: [a, b] });
  return out;
}

// Albert's truncation marker: "... more description for <CODE> »".
// We strip " more description for <CODE> »" but preserve any leading "..."
// that came from the actual description text — the walkthrough says the
// trailing ellipsis is a signal to the reader that the text was cut off.
const TRUNCATION_TRAILER = /\s+more description for\s+[^»]*»\s*$/;

export function parseCourse(blockText) {
  const warnings = [];
  const unparsed_lines = [];

  if (typeof blockText !== "string" || blockText.trim() === "") {
    return { course: null, warnings, unparsed_lines };
  }

  const lines = blockText.split("\n").map((l) => l.replace(/\r$/, ""));

  // --- 1. Header line ---------------------------------------------------
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length) {
    return { course: null, warnings, unparsed_lines };
  }

  const headerLine = lines[i];
  const headerMatch = headerLine.match(
    /^([A-Z][A-Z0-9]*-([A-Z]+))\s+(\S+)\s+(.+?)\s*$/,
  );
  if (!headerMatch) {
    warnings.push({
      type: "unparseable_header",
      message: `Could not parse course header line: ${JSON.stringify(headerLine)}`,
    });
    return { course: null, warnings, unparsed_lines };
  }

  const subject = headerMatch[1];
  const subject_suffix = headerMatch[2];
  const catalog_number = headerMatch[3];
  const raw_title = headerMatch[4];
  const course_code = `${subject} ${catalog_number}`;

  if (!KNOWN_SUBJECT_PREFIXES.has(subject)) {
    warnings.push({
      type: "unknown_subject_suffix",
      course_code,
      subject,
      message: `Subject "${subject}" is not in the 685-entry NYU subject-prefix allowlist (from docs/NOMENCLATURE.md). Possibly a new prefix NYU added; update NOMENCLATURE.md if so.`,
    });
  }

  const { title, flags: title_flags } = stripTitleFlags(raw_title);
  i++;

  // --- 2. Description (header → first "School:" line, exclusive) -------
  while (i < lines.length && lines[i].trim() === "") i++;
  const descStart = i;
  while (i < lines.length && lines[i].trim() !== "School:") i++;
  const descEnd = i;
  const schoolLineFound = i < lines.length;

  let description = null;
  let description_truncated = false;
  if (descEnd > descStart) {
    const descText = lines
      .slice(descStart, descEnd)
      .join("\n")
      .replace(/\s+$/, "")
      .trim();
    if (descText !== "") {
      if (TRUNCATION_TRAILER.test(descText)) {
        description_truncated = true;
        description = descText.replace(TRUNCATION_TRAILER, "").replace(/\s+$/, "");
      } else {
        description = descText;
      }
    }
  }
  if (description === null || description === "") {
    warnings.push({
      type: "missing_description",
      course_code,
      message: `Header parsed but no description text before 'School:' for ${course_code}`,
    });
    description = null;
  }

  // --- 3. School:/Term: preamble ---------------------------------------
  let school = null;
  let term = null;
  if (schoolLineFound) {
    i++; // past "School:"
    if (i < lines.length) {
      school = lines[i].trim() || null;
      i++;
    }
  }
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i < lines.length && lines[i].trim() === "Term:") {
    i++;
    if (i < lines.length) {
      term = lines[i].trim() || null;
      i++;
    }
  }

  // --- 4. Course-level units from the first "<code> | N units" line -----
  while (i < lines.length && lines[i].trim() === "") i++;
  const sectionRegionStart = i;

  const unitsLineRe = new RegExp(
    `^${escapeRegex(course_code)}\\s*\\|\\s*(.+?)\\s+units?\\s*$`,
  );
  let units = null;
  for (let j = sectionRegionStart; j < lines.length; j++) {
    const m = lines[j].match(unitsLineRe);
    if (m) {
      const parsed = parseUnits(m[1]);
      if (parsed != null) {
        units = parsed;
      } else {
        warnings.push({
          type: "units_parse_failed",
          course_code,
          raw: m[1],
          message: `Could not parse units value ${JSON.stringify(m[1])} for course ${course_code}`,
        });
      }
      break;
    }
  }

  // --- 5. Section blocks: slice between section-start lines ------------
  // A section-start line is a bare course code line, optionally followed
  // by "| N units". Some sections omit the units restatement, so both
  // shapes are accepted.
  //
  // In this single pass we also collect:
  //   - "No Classes Scheduled for the Terms Offered" marker (Fix 3)
  //   - "Topic: <topic>" lines that apply to the next section start (Fix 4)
  const sectionStartRe = new RegExp(
    `^${escapeRegex(course_code)}(?:\\s*\\|\\s*.+?\\s+units?\\s*)?\\s*$`,
  );
  const sectionStarts = [];
  const topicByStartLine = new Map();
  const topicLineByStartLine = new Map();
  let pendingTopic = null;
  let pendingTopicLine = null;
  let no_sections_offered = false;
  const NO_CLASSES_MARKER = "No Classes Scheduled for the Terms Offered";
  for (let j = sectionRegionStart; j < lines.length; j++) {
    const line = lines[j];
    const trimmed = line.trim();
    if (trimmed === NO_CLASSES_MARKER) {
      no_sections_offered = true;
      continue;
    }
    const topicMatch = trimmed.match(/^Topic:\s+(.+?)\s*$/);
    if (topicMatch) {
      if (pendingTopic === null) pendingTopicLine = j;
      pendingTopic = topicMatch[1];
      continue;
    }
    if (sectionStartRe.test(line)) {
      sectionStarts.push(j);
      if (pendingTopic !== null) {
        topicByStartLine.set(j, pendingTopic);
        topicLineByStartLine.set(j, pendingTopicLine);
        pendingTopic = null;
        pendingTopicLine = null;
      }
    }
  }
  const has_topics = topicByStartLine.size > 0;

  // Raw-block boundaries: the parser-facing slice still starts at the
  // section-header line (so parseSection sees exactly what it did before),
  // but the `_raw_paste_block` provenance field includes any preceding
  // "Topic: ..." line as part of the section it prefixes. Rationale: a
  // Topic: line is context for the section that immediately follows it in
  // the paste, so the repair-tool UI should show it next to that section's
  // output, not the previous section's.
  const parsedSections = [];
  for (let idx = 0; idx < sectionStarts.length; idx++) {
    const start = sectionStarts[idx];
    const end = idx + 1 < sectionStarts.length ? sectionStarts[idx + 1] : lines.length;
    const sectionText = lines.slice(start, end).join("\n");
    const rawStart = topicLineByStartLine.has(start) ? topicLineByStartLine.get(start) : start;
    const nextStart = idx + 1 < sectionStarts.length ? sectionStarts[idx + 1] : null;
    const nextTopicLine = nextStart != null && topicLineByStartLine.has(nextStart)
      ? topicLineByStartLine.get(nextStart)
      : null;
    const rawEnd = nextTopicLine != null ? nextTopicLine : (nextStart != null ? nextStart : lines.length);
    const rawBlock = lines.slice(rawStart, rawEnd).join("\n").replace(/\s+$/, "");
    const result = parseSection(sectionText, {
      course_code,
      course_units: units,
    });
    if (result.section) {
      const topic = topicByStartLine.get(start);
      if (topic != null) result.section.topic = topic;
      result.section._raw_paste_block = rawBlock;
      parsedSections.push(result.section);
    }
    for (const w of result.warnings) warnings.push(w);
    for (const u of result.unparsed_lines) unparsed_lines.push(u);
  }

  // --- 6. Dedupe by class_number ---------------------------------------
  const byClassNumber = new Map();
  const deduped = [];
  for (const s of parsedSections) {
    if (!s.class_number) {
      // Keep nameless entries through so downstream tooling can surface
      // them — they're already flagged by parseSection.
      deduped.push(s);
      continue;
    }
    if (byClassNumber.has(s.class_number)) {
      const first = byClassNumber.get(s.class_number);
      const fields = new Set([...Object.keys(first), ...Object.keys(s)]);
      for (const field of fields) {
        // Skip internal/provenance fields — they're expected to differ
        // across duplicate occurrences (different paste positions) and
        // aren't user-facing data.
        if (field.startsWith("_")) continue;
        if (JSON.stringify(first[field]) === JSON.stringify(s[field])) continue;
        for (const leaf of diffAtLeaves(first[field], s[field], field)) {
          warnings.push({
            type: "duplicate_disagreement",
            class_number: s.class_number,
            field: leaf.path,
            values: leaf.values,
            message: `Section ${s.class_number} appeared twice with different ${leaf.path} values; preserving first`,
          });
        }
      }
    } else {
      byClassNumber.set(s.class_number, s);
      deduped.push(s);
    }
  }

  // --- 7. Invariants ---------------------------------------------------
  // Suppress `no_sections` when Albert explicitly declared "No Classes
  // Scheduled for the Terms Offered" — that's catalog state, not a parse
  // failure. The course exists but has no sections this term.
  if (deduped.length === 0 && !no_sections_offered) {
    warnings.push({
      type: "no_sections",
      course_code,
      message: `Course ${course_code} has no sections`,
    });
  }

  // Uniqueness invariant (should always hold post-dedup; here as a safety net).
  const seen = new Set();
  for (const s of deduped) {
    if (s.class_number) {
      if (seen.has(s.class_number)) {
        warnings.push({
          type: "duplicate_class_number_post_dedup",
          class_number: s.class_number,
          course_code,
          message: `Invariant violation: duplicate class_number ${s.class_number} survived dedup in ${course_code}`,
        });
      }
      seen.add(s.class_number);
    }
  }

  // course.code sanity — the regex guarantees this, but assert anyway.
  const expected_code = `${subject} ${catalog_number}`;

  const course = {
    code: expected_code,
    subject,
    catalog_number,
    title,
    title_flags,
    description,
    description_truncated,
    school,
    units,
    no_sections_offered,
    has_topics,
    sections: deduped,
  };

  return { course, warnings, unparsed_lines };
}
