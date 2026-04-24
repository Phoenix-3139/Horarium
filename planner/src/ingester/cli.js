#!/usr/bin/env node
// Tiny debug wrapper: read a paste from a file path, parse, print JSON.
// Usage: node planner/src/ingester/cli.js <path-to-paste.txt> [--summary]
//
// Not for production — just lets you eyeball what the parser does against
// a fixture or a one-off paste while building.

import { readFileSync } from "node:fs";
import { parse } from "./parse.js";

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("--"));
const summary = args.includes("--summary");

if (!path) {
  console.error("usage: cli.js <path-to-paste.txt> [--summary]");
  process.exit(1);
}

const text = readFileSync(path, "utf8");
const out = parse(text);

if (summary) {
  const sectionCount = out.courses.reduce((n, c) => n + c.sections.length, 0);
  const byWarningType = out.warnings.reduce((acc, w) => {
    acc[w.type] = (acc[w.type] || 0) + 1;
    return acc;
  }, {});
  console.log(
    JSON.stringify(
      {
        schema_version: out.schema_version,
        header: out.header,
        course_count: out.courses.length,
        section_count: sectionCount,
        warnings_by_type: byWarningType,
        warning_total: out.warnings.length,
        unparsed_lines: out.unparsed_lines.length,
      },
      null,
      2,
    ),
  );
} else {
  console.log(JSON.stringify(out, null, 2));
}
