// Migration-discipline tripwire (owner directive 2026-10-10).
//
// Fails when any source file under web/src or extension/src references a DB
// column that neither supabase/schema.sql nor any supabase/migrations/*.sql
// file creates. The wind_down_time incident is the failure this catches: the
// column shipped in code but never reached the live database, and nothing
// noticed until the dashboard broke.
//
// The implementation is pragmatic and regex-based (db-columns.ts). Its known
// limits, by design:
//
// 1. Only literal string arguments are checked. Dynamic call sites such as
//    .eq(positionFilter, ...) or .update(update) are invisible to the scan.
// 2. Row objects built outside the call (queue payloads, arrays passed to
//    insert via .map) are not traced; only keys inside literal arguments.
// 3. The known-column set is global across tables: a column referenced on the
//    wrong table passes as long as it exists somewhere.
// 4. Only quoted select lists are read; template-literal selects are skipped.
// 5. Dotted or complex select items are skipped rather than guessed at.
// 6. Test files are excluded from the scan (SPEC: fixtures in tests are fine).
// 7. SQL line comments are stripped with a simple "-- to end of line" rule;
//    a "--" inside a SQL string literal would confuse the parser (none exist
//    in the schema today).

import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findColumnRefs,
  loadSourceFiles,
  loadSqlFiles,
  parseKnownColumns,
  repoRoot,
  type SourceFile,
  type SqlFile,
} from "./db-columns";

const DASHBOARD_DATA = "web/src/lib/dashboard-data.ts";

const SCAN_OPTIONS = { constantListFiles: new Set([DASHBOARD_DATA]) } as const;

function sourceFile(content: string): SourceFile {
  return { path: "web/src/demo.ts", content };
}

function sqlFile(sql: string): SqlFile {
  return { name: "demo.sql", sql };
}

describe("parseKnownColumns", () => {
  it("reads CREATE TABLE columns, skipping comments and table constraints", () => {
    const known = parseKnownColumns([
      sqlFile(
        [
          "create table demo (",
          "  id uuid primary key default gen_random_uuid(),",
          "  -- a comment, with commas, and an apostrophe like I'm stuck",
          "  kind text not null check (kind in ('a','b')),",
          "  payload text not null default '',",
          "  unique (kind, payload)",
          ");",
        ].join("\n"),
      ),
    ]);
    expect([...known].sort()).toEqual(["id", "kind", "payload"]);
  });

  it("reads ALTER TABLE ... ADD COLUMN from migration files", () => {
    const known = parseKnownColumns([
      sqlFile("create table demo (id uuid primary key);"),
      sqlFile("alter table demo add column if not exists later_col text not null default '';"),
    ]);
    expect(known.has("later_col")).toBe(true);
    expect(known.has("id")).toBe(true);
  });

  it("does not treat alter add constraint as a column", () => {
    const known = parseKnownColumns([
      sqlFile("alter table demo add constraint demo_fk foreign key (a_id) references other (id);"),
      sqlFile("alter table demo add unique (a_id);"),
    ]);
    expect(known.size).toBe(0);
  });
});

describe("findColumnRefs", () => {
  it("reads comma select lists and unwraps embeds like tasks(title)", () => {
    const refs = findColumnRefs(sourceFile(`client.from("day_plan_tasks").select("position, task_id, tasks(title)");`));
    expect(refs.map((ref) => ref.column).sort()).toEqual(["position", "task_id", "title"]);
  });

  it("checks literal object keys and quoted filter first arguments", () => {
    const refs = findColumnRefs(
      sourceFile(
        [
          `client.from("tasks").insert({ title: "x", bogus_insert_col: 1 });`,
          `client.from("tasks").update({ done: true });`,
          `client.from("tasks").eq("bogus_filter_col", 1).order("created_at");`,
        ].join("\n"),
      ),
    );
    const columns = refs.map((ref) => ref.column);
    expect(columns).toContain("bogus_insert_col");
    expect(columns).toContain("done");
    expect(columns).toContain("bogus_filter_col");
    expect(columns).toContain("created_at");
  });

  it("parses multi-line upsert object literals and onConflict targets", () => {
    const refs = findColumnRefs(
      sourceFile(
        [
          `await client.from("day_reviews").upsert(`,
          `  {`,
          `    review_date: key,`,
          `    bogus_multiline_col: 1,`,
          `  },`,
          `  { onConflict: "review_date" },`,
          `);`,
        ].join("\n"),
      ),
    );
    const columns = refs.map((ref) => ref.column);
    expect(columns).toContain("review_date");
    expect(columns).toContain("bogus_multiline_col");
  });

  it("skips dynamic (variable) column arguments", () => {
    const refs = findColumnRefs(sourceFile(`client.from("tasks").eq(positionFilter, 1).update(update);`));
    expect(refs).toEqual([]);
  });

  it("checks named column-list constants in opted-in files", () => {
    const refs = findColumnRefs(sourceFile(`const TASK_COLUMNS = "id, bogus_const_col";`), {
      constantListFiles: new Set(["web/src/demo.ts"]),
    });
    expect(refs.map((ref) => ref.column)).toContain("bogus_const_col");
  });

  it("reports the file and line of each reference", () => {
    const refs = findColumnRefs(sourceFile(`const a = 1;\nconst b = 2;\nclient.from("tasks").select("bogus_col");`));
    expect(refs).toHaveLength(1);
    expect(refs[0]?.file).toBe("web/src/demo.ts");
    expect(refs[0]?.line).toBe(3);
  });
});

describe("db column consistency (schema + migrations vs app source)", () => {
  it("creates every column that app source references", async () => {
    const root = repoRoot();
    expect(existsSync(path.join(root, "supabase", "schema.sql"))).toBe(true);

    const known = parseKnownColumns(await loadSqlFiles(root));
    // Sanity guards: if the SQL parsing ever breaks (path change, parser
    // regression), the scan below would fail with phantom columns. Fail with
    // the real problem instead.
    expect(known.size).toBeGreaterThan(40);
    for (const mustHave of ["id", "display_name", "wind_down_time", "active_seconds", "plan_date", "review_date"]) {
      expect(known.has(mustHave), `SQL parsing lost the "${mustHave}" column`).toBe(true);
    }

    const sourceFiles = await loadSourceFiles(root);
    expect(sourceFiles.length).toBeGreaterThan(0);
    const refs = sourceFiles.flatMap((file) => findColumnRefs(file, SCAN_OPTIONS));
    expect(refs.length).toBeGreaterThan(50);

    const missing = refs.filter((ref) => !known.has(ref.column));
    const report = missing
      .map((ref) => `  ${ref.file}:${ref.line} references "${ref.column}" which no SQL file creates: ${ref.snippet}`)
      .join("\n");
    expect(
      missing,
      `Columns referenced in source but missing from supabase/schema.sql and supabase/migrations/*.sql:\n${report}`,
    ).toEqual([]);
  });
});
