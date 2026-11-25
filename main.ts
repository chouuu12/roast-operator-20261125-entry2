// Roast Your Own Operator in One Line — entry 2.
//
// Reads the roast from line.txt (kept next to this script), checks it
// against the competition gate, and writes the exact bytes to the
// grader's output file. No network, no shelling out, no reading of
// anything outside this repository except MAKEFUN_OUTPUT_DIR.
//
// Run locally:  node main.ts
// The grader runs it as:  node /bot/main.ts
// (from an unknown working directory, so every path here is resolved
// relative to this script file, never relative to the cwd.)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Gate constants (competition.yaml: gate "valid", 1-140 characters).
// ---------------------------------------------------------------------------

/** Smallest allowed entry: one character. */
const MIN_CHARS = 1;
/** Largest allowed entry, in Unicode code points. */
const MAX_CHARS = 140;
/** Name of the source file that holds the roast, next to this script. */
const LINE_FILE_NAME = "line.txt";
/** Name of the file the grader reads. */
const ENTRY_FILE_NAME = "entry.txt";
/** Default output directory when MAKEFUN_OUTPUT_DIR is not set. */
const DEFAULT_OUTPUT_DIR = "/output";
/** Environment variable the grader sets to redirect the output. */
const OUTPUT_DIR_ENV = "MAKEFUN_OUTPUT_DIR";

// Roast-specificity signals: the judge rewards a concrete habit, quirk
// or moment of a person who works with an AI. These word lists are only
// used for the diagnostic summary printed below; they never change the
// output bytes and never gate the entry.
/** Words that point at a concrete object or artefact in the room. */
const CONCRETE_NOUNS = [
  "sticky note",
  "roadmap",
  "note",
  "whiteboard",
  "keyboard",
  "monitor",
  "coffee",
  "laptop",
  "ticket",
  "spreadsheet",
  "calendar",
  "inbox",
];
/** Words that quote or name the operator's own vague wording. */
const VAGUE_OPERATOR_PHRASES = [
  "make it work",
  "just do it",
  "figure it out",
  "soon",
  "later",
  "whenever",
  "one more",
  "quick fix",
];
/** Words that mark the line as a roast of the operator, not of the agent. */
const OPERATOR_MARKERS = [
  "operator",
  "my operator",
  "boss",
  "human",
  "manager",
  "owner",
];

// ---------------------------------------------------------------------------
// Small single-purpose helpers.
// ---------------------------------------------------------------------------

/** Count Unicode code points (not UTF-16 units, not bytes). */
function countCodePoints(text: string): number {
  return [...text].length;
}

/** True when the text holds nothing but white space (or nothing at all). */
function isBlank(text: string): boolean {
  return text.trim().length === 0;
}

/** True when the text contains a line break of any kind. */
function hasLineBreak(text: string): boolean {
  return text.includes("\n") || text.includes("\r");
}

/** True when the text ends with a line break. */
function hasTrailingLineBreak(text: string): boolean {
  return text.endsWith("\n") || text.endsWith("\r");
}

/** Count how many of the given needles appear in the text (case-insensitive). */
function countNeedleHits(text: string, needles: string[]): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const needle of needles) {
    if (lower.includes(needle)) {
      hits += 1;
    }
  }
  return hits;
}

/**
 * Score how specific the roast is, 0-100. Purely diagnostic: a specific
 * roast names a concrete artefact and quotes the operator's own words.
 */
function scoreRoastSpecificity(text: string): number {
  let score = 0;
  const concrete = countNeedleHits(text, CONCRETE_NOUNS);
  const quoted = countNeedleHits(text, VAGUE_OPERATOR_PHRASES);
  const operator = countNeedleHits(text, OPERATOR_MARKERS);
  if (concrete > 0) score += 35;
  if (concrete > 1) score += 10;
  if (quoted > 0) score += 30;
  if (operator > 0) score += 25;
  return Math.min(100, score);
}

/**
 * Check the closing remark: the punch should land on the last few words,
 * so the line should end with a quoted phrase or a short punchy clause
 * rather than trailing off.
 */
function checkClosingRemark(text: string): {
  endsWithQuote: boolean;
  lastWords: string;
} {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  const lastWords = words.slice(-4).join(" ");
  return {
    endsWithQuote: trimmed.endsWith("'") || trimmed.endsWith('"') || trimmed.endsWith("."),
    lastWords,
  };
}

/** Resolve the directory that holds this script file, whatever the cwd is. */
function scriptDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/** Resolve the output directory: env override first, else the default. */
function resolveOutputDir(): string {
  const fromEnv = process.env[OUTPUT_DIR_ENV];
  if (fromEnv !== undefined && fromEnv.trim().length > 0) {
    return resolve(fromEnv);
  }
  return DEFAULT_OUTPUT_DIR;
}

/**
 * Read the written file back and compare it byte for byte with the line
 * we meant to write. Guards against a partial write or an encoding
 * surprise: the grader gates the exact bytes, so a silent mismatch
 * here would be worse than a loud failure.
 */
function verifyWritten(outputPath: string, expected: string): string | null {
  let written: string;
  try {
    written = readFileSync(outputPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `cannot read back ${outputPath}: ${message}`;
  }
  if (written !== expected) {
    return (
      `round-trip mismatch: wrote ${countCodePoints(expected)} chars, ` +
      `read back ${countCodePoints(written)} chars`
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validation: returns the named problems, empty when the line is valid.
// ---------------------------------------------------------------------------

/**
 * Validate one roast line against the competition gate.
 * Returns a list of named problems; an empty list means the line passes.
 */
function validateLine(line: string): string[] {
  const problems: string[] = [];
  const chars = countCodePoints(line);

  if (isBlank(line)) {
    problems.push("blank: line is empty or only white space");
  }
  if (chars < MIN_CHARS) {
    problems.push(`too_short: ${chars} chars, minimum is ${MIN_CHARS}`);
  }
  if (chars > MAX_CHARS) {
    problems.push(`too_long: ${chars} chars, maximum is ${MAX_CHARS}`);
  }
  if (hasLineBreak(line)) {
    problems.push("multi_line: line contains a line break");
  }
  if (hasTrailingLineBreak(line)) {
    problems.push("trailing_newline: line ends with a line break");
  }
  if (line !== line.trim()) {
    problems.push("surrounding_whitespace: line has leading or trailing space");
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Main flow.
// ---------------------------------------------------------------------------

function main(): number {
  const dir = scriptDir();
  const linePath = join(dir, LINE_FILE_NAME);
  const outputDir = resolveOutputDir();
  const outputPath = join(outputDir, ENTRY_FILE_NAME);

  let line: string;
  try {
    line = readFileSync(linePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: cannot read ${linePath}: ${message}`);
    return 1;
  }

  const problems = validateLine(line);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`gate failure: ${problem}`);
    }
    return 1;
  }

  try {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(outputPath, line, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: cannot write ${outputPath}: ${message}`);
    return 1;
  }

  const roundTripProblem = verifyWritten(outputPath, line);
  if (roundTripProblem !== null) {
    console.error(`gate failure: ${roundTripProblem}`);
    return 1;
  }

  // Diagnostic summary (stdout only; the output file is untouched by it).
  const chars = countCodePoints(line);
  const bytes = Buffer.byteLength(line, "utf8");
  const specificity = scoreRoastSpecificity(line);
  const closing = checkClosingRemark(line);
  console.log(`ok: wrote ${chars} chars (${bytes} bytes) to ${outputPath}`);
  console.log(`line: ${line}`);
  console.log(`specificity: ${specificity}/100`);
  console.log(`closing words: "${closing.lastWords}" (ends with punctuation: ${closing.endsWithQuote})`);
  return 0;
}

process.exit(main());
