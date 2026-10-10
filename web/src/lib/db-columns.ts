// Column-consistency tripwire for the migration discipline rule (2026-10-10).
//
// The wind_down_time incident: the column existed in app code and in
// supabase/schema.sql but never reached the live database, and nothing failed
// until the dashboard did. This module turns that class of bug into a red
// test: it parses the SQL files (baseline plus numbered migrations) into the
// set of columns that exist, and scans app source for column references made
// through supabase-js call strings.
//
// Deliberately pragmatic, regex-based, and conservative: it prefers staying
// silent on dynamic call sites over raising false alarms. The full list of
// limits is documented at the top of db-columns.test.ts.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** A SQL file (baseline or migration) contributing to the known-column set. */
export interface SqlFile {
  name: string;
  sql: string;
}

/** A source file to scan for column references. */
export interface SourceFile {
  /** Repo-relative path with forward slashes, used in failure messages. */
  path: string;
  content: string;
}

/** One column reference found in source. */
export interface ColumnRef {
  column: string;
  file: string;
  line: number;
  snippet: string;
}

export interface ScanOptions {
  /** Files (by repo-relative path) whose string constants holding column lists are checked too. */
  constantListFiles?: ReadonlySet<string>;
}

/** Absolute repo root, derived from this file's location (web/src/lib). */
export function repoRoot(): string {
  // URL semantics drop the file name first, so three levels up from
  // web/src/lib/<file> is the repo root.
  return fileURLToPath(new URL("../../../", import.meta.url));
}

/** All .sql files that define columns: the baseline plus ordered migrations. */
export async function loadSqlFiles(root: string): Promise<SqlFile[]> {
  const files: SqlFile[] = [];
  const baseline = path.join(root, "supabase", "schema.sql");
  files.push({ name: "supabase/schema.sql", sql: await readFile(baseline, "utf8") });
  const migrationsDir = path.join(root, "supabase", "migrations");
  const entries = (await readdir(migrationsDir)).filter((entry) => entry.endsWith(".sql")).sort();
  for (const entry of entries) {
    files.push({
      name: `supabase/migrations/${entry}`,
      sql: await readFile(path.join(migrationsDir, entry), "utf8"),
    });
  }
  return files;
}

/** Every non-test .ts/.tsx file under web/src and extension/src. */
export async function loadSourceFiles(root: string): Promise<SourceFile[]> {
  const sourceRoots: Array<[label: string, dir: string]> = [
    ["web/src", path.join(root, "web", "src")],
    ["extension/src", path.join(root, "extension", "src")],
  ];
  const files: SourceFile[] = [];
  for (const [label, dir] of sourceRoots) {
    const entries = (await readdir(dir, { recursive: true })).sort();
    for (const entry of entries) {
      const rel = entry.split(path.sep).join("/");
      if (!/\.(ts|tsx)$/.test(rel)) continue;
      if (/\.test\.(ts|tsx)$/.test(rel)) continue;
      files.push({ path: `${label}/${rel}`, content: await readFile(path.join(dir, entry), "utf8") });
    }
  }
  return files;
}

const CONSTRAINT_KEYWORDS = new Set(["primary", "unique", "foreign", "constraint", "check", "exclude", "like"]);
const ALTER_NON_COLUMN_KEYWORDS = new Set(["constraint", "unique", "primary", "foreign", "check"]);

const CREATE_TABLE = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?["`]?[\w.]+["`]?\s*\(/gi;
const ALTER_ADD_COLUMN =
  /\balter\s+table\s+(?:if\s+exists\s+)?[\w.]+\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?/gi;

/** Parse the SQL files into the union set of column names they create. */
export function parseKnownColumns(files: SqlFile[]): Set<string> {
  const known = new Set<string>();
  for (const file of files) {
    const sql = stripLineComments(file.sql);
    collectCreateTableColumns(sql, known);
    collectAlterTableColumns(sql, known);
  }
  return known;
}

function stripLineComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function collectCreateTableColumns(sql: string, known: Set<string>): void {
  for (const match of sql.matchAll(CREATE_TABLE)) {
    const openParen = (match.index ?? 0) + match[0].length - 1;
    const closeParen = findClosingParen(sql, openParen);
    if (closeParen < 0) continue;
    for (const definition of splitTopLevel(sql.slice(openParen + 1, closeParen))) {
      const column = leadingIdentifier(definition);
      if (column) known.add(column);
    }
  }
}

function collectAlterTableColumns(sql: string, known: Set<string>): void {
  for (const match of sql.matchAll(ALTER_ADD_COLUMN)) {
    const column = (match[1] ?? "").toLowerCase();
    if (!column || ALTER_NON_COLUMN_KEYWORDS.has(column)) continue;
    known.add(column);
  }
}

function findClosingParen(sql: string, openParen: number): number {
  let depth = 0;
  for (let i = openParen; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split on commas that sit outside any parentheses (check constraints nest). */
function splitTopLevel(block: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of block) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      if (current.trim() !== "") parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") parts.push(current);
  return parts;
}

/** First identifier of a column definition, or null for table constraints. */
function leadingIdentifier(definition: string): string | null {
  const collapsed = definition.replace(/\s+/g, " ").trim();
  const match = collapsed.match(/^["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?/);
  if (!match) return null;
  const word = (match[1] ?? "").toLowerCase();
  if (CONSTRAINT_KEYWORDS.has(word)) return null;
  return word;
}

const SELECT_CALL = /\.select\s*\(\s*(["'])([^"']*)\1/g;
const OBJECT_CALL = /\.(?:insert|upsert|update)\s*\(\s*\{([^{}]*)\}/g;
const OBJECT_KEY = /\b([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
const FILTER_CALL =
  /\.(?:eq|neq|gt|gte|lt|lte|like|ilike|in|contains|containedBy|overlaps|order|textSearch)\s*\(\s*(["'])([A-Za-z_][A-Za-z0-9_]*)\1/g;
const UPSERT_START = /\.upsert\s*\(/g;
const ON_CONFLICT = /\bonConflict\s*:\s*(["'])([^"']*)\1/g;
const CONST_COLUMN_LIST =
  /\bconst\s+[A-Za-z_][A-Za-z0-9_]*\s*(?::[^=]*)?=\s*(["'])([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\1/g;

/** Find column references in supabase-js call strings within one source file. */
export function findColumnRefs(file: SourceFile, options: ScanOptions = {}): ColumnRef[] {
  const refs: ColumnRef[] = [];
  const push = (column: string, index: number, raw: string): void => {
    const name = column.trim().toLowerCase();
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) return;
    refs.push({
      column: name,
      file: file.path,
      line: lineOf(file.content, index),
      snippet: flatten(raw),
    });
  };

  for (const match of file.content.matchAll(SELECT_CALL)) {
    for (const column of columnsFromSelectList(match[2] ?? "")) {
      push(column, match.index ?? 0, match[0]);
    }
  }
  for (const match of file.content.matchAll(OBJECT_CALL)) {
    for (const key of objectKeys(match[1] ?? "")) {
      push(key, match.index ?? 0, match[0]);
    }
  }
  for (const match of file.content.matchAll(FILTER_CALL)) {
    push(match[2] ?? "", match.index ?? 0, match[0]);
  }
  collectOnConflictTargets(file.content, push);
  if (options.constantListFiles?.has(file.path)) {
    for (const match of file.content.matchAll(CONST_COLUMN_LIST)) {
      for (const part of (match[2] ?? "").split(",")) {
        push(part, match.index ?? 0, match[0]);
      }
    }
  }
  return refs;
}

/** Split a select list into column names, unwrapping embeds like tasks(title). */
function columnsFromSelectList(list: string): string[] {
  const columns: string[] = [];
  for (const rawItem of list.split(",")) {
    let item = rawItem.trim();
    // Embeds and aggregates: the outer name is a table or function, the
    // inner list holds the column names (count() unwraps to nothing).
    const embed = item.match(/^[A-Za-z_][A-Za-z0-9_]*\s*\((.*)\)$/);
    if (embed) item = (embed[1] ?? "").trim();
    if (item === "" || item === "*") continue;
    // supabase-js alias syntax "alias:column": keep the real column.
    columns.push(item.split(":").pop() ?? "");
  }
  return columns;
}

function objectKeys(body: string): string[] {
  const keys: string[] = [];
  for (const match of body.matchAll(OBJECT_KEY)) {
    keys.push(match[1] ?? "");
  }
  return keys;
}

function collectOnConflictTargets(content: string, push: (column: string, index: number, raw: string) => void): void {
  for (const upsert of content.matchAll(UPSERT_START)) {
    const start = upsert.index ?? 0;
    // Bounded window so a stray match cannot run away; upsert option objects
    // sit directly after the call in this codebase.
    const upsertWindow = content.slice(start, start + 400);
    for (const conflict of upsertWindow.matchAll(ON_CONFLICT)) {
      for (const part of (conflict[2] ?? "").split(",")) {
        push(part, start + (conflict.index ?? 0), conflict[0]);
      }
    }
  }
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 140);
}
