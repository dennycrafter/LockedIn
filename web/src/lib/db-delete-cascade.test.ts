import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// Regression for the live-data FAIL in the 2026-10-10 password-gated
// regression run: DELETE of a task or project left its links and
// note_snippets rows behind, because links.owner_id / note_snippets.owner_id
// are polymorphic (project or task) and cannot carry a foreign key the
// database could cascade on.
//
// The fix is the 0003 trigger, the ON DELETE CASCADE equivalent for the
// polymorphic owner columns. This suite replays supabase/schema.sql plus
// every numbered migration in order (supabase/README.md discipline) on
// PGlite, the local stand-in Postgres — the same SQL that runs on real
// Supabase — and asserts the cleanup with made-up, clearly-labeled rows in
// this throwaway in-memory database only. No real database is contacted.

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** Supabase ships predefined roles; plain Postgres (PGlite) needs service_role to exist for the schema's grant. */
const PG_LITE_SETUP = "create role service_role;";

/** The baseline plus numbered migrations, concatenated in order. */
function loadSql(): string {
  // pgcrypto is not bundled in PGlite; gen_random_uuid() is core since
  // Postgres 13, so dropping the extension line changes nothing else.
  const schema = readFileSync(`${ROOT}supabase/schema.sql`, "utf8").replace(
    /^create extension if not exists pgcrypto;$/m,
    "-- pgcrypto skipped on PGlite: gen_random_uuid() is core here",
  );
  const migrationsDir = `${ROOT}supabase/migrations`;
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  return [PG_LITE_SETUP, schema, ...files.map((f) => readFileSync(`${migrationsDir}/${f}`, "utf8"))].join("\n");
}

const SQL = loadSql();

// Made-up uuids for this suite's throwaway rows (PGlite is in-memory, so
// nothing survives the test run).
const PROJECT = "aaaaaaaa-0000-4000-8000-000000000001";
const TASK = "aaaaaaaa-0000-4000-8000-000000000002";
const SUBTASK = "aaaaaaaa-0000-4000-8000-000000000003";
const CONTROL_PROJECT = "aaaaaaaa-0000-4000-8000-000000000004";
const CONTROL_TASK = "aaaaaaaa-0000-4000-8000-000000000005";
const CONTROL_SESSION = "aaaaaaaa-0000-4000-8000-000000000006";

/** Orphan count exactly as the live regression audit defines it. */
async function orphanCount(db: PGlite, table: "links" | "note_snippets"): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `select count(*) as count from ${table} o where
       (o.owner_type = 'project' and not exists (select 1 from projects p where p.id = o.owner_id))
    or (o.owner_type = 'task' and not exists (select 1 from tasks t where t.id = o.owner_id))`,
  );
  return Number(rows[0]?.count ?? "0");
}

/** Seed a project > task > subtask tree with links/snippets at every level, plus a control project. */
async function seed(db: PGlite): Promise<void> {
  await db.exec(`
    insert into projects (id, name) values
      ('${PROJECT}', 'delete-cascade-check project'),
      ('${CONTROL_PROJECT}', 'delete-cascade-check control project');
    insert into tasks (id, project_id, title) values
      ('${TASK}', '${PROJECT}', 'delete-cascade-check task'),
      ('${SUBTASK}', '${PROJECT}', 'delete-cascade-check subtask');
    update tasks set parent_task_id = '${TASK}' where id = '${SUBTASK}';
    insert into tasks (id, project_id, title) values
      ('${CONTROL_TASK}', '${CONTROL_PROJECT}', 'delete-cascade-check control task');

    insert into links (id, owner_type, owner_id, name, url) values
      ('bbbbbbbb-0000-4000-8000-000000000001', 'project', '${PROJECT}', 'delete-cascade-check', 'https://example.com/project'),
      ('bbbbbbbb-0000-4000-8000-000000000002', 'task', '${TASK}', 'delete-cascade-check', 'https://example.com/task'),
      ('bbbbbbbb-0000-4000-8000-000000000003', 'task', '${SUBTASK}', 'delete-cascade-check', 'https://example.com/subtask'),
      ('bbbbbbbb-0000-4000-8000-000000000004', 'project', '${CONTROL_PROJECT}', 'delete-cascade-check', 'https://example.com/control');
    insert into note_snippets (id, owner_type, owner_id, content, context, source) values
      ('cccccccc-0000-4000-8000-000000000001', 'project', '${PROJECT}', 'delete-cascade-check snippet', '', 'manual'),
      ('cccccccc-0000-4000-8000-000000000002', 'task', '${TASK}', 'delete-cascade-check recap', '', 'wind_down'),
      ('cccccccc-0000-4000-8000-000000000003', 'task', '${SUBTASK}', 'delete-cascade-check attach', 'ctx', 'note'),
      ('cccccccc-0000-4000-8000-000000000004', 'project', '${CONTROL_PROJECT}', 'delete-cascade-check control', '', 'manual');

    insert into sessions (id, task_id, lock_mode, planned_seconds, active_seconds, started_at, ended_at)
    values ('${CONTROL_SESSION}', '${TASK}', 'hard', 1500, 300, '2026-10-10 10:00:00+00', '2026-10-10 10:25:00+00');
  `);
}

describe("deleting a task or project cleans up its links and note_snippets", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SQL);
  });

  beforeEach(async () => {
    // Each test seeds a fresh tree into the shared schema; wipe first so
    // tests cannot leak state into each other.
    await db.exec("truncate projects, links, note_snippets, sessions cascade;");
    await seed(db);
  });

  it("deleting a task removes its own and its subtasks' links and snippets", async () => {
    await db.exec(`delete from tasks where id = '${TASK}';`);

    // The bug: before the fix the task's and the cascaded subtask's rows
    // survive, pointing at tasks that no longer exist.
    await expect(orphanCount(db, "links")).resolves.toBe(0);
    await expect(orphanCount(db, "note_snippets")).resolves.toBe(0);

    // Nothing over-deleted: the project-level rows and the control tree stay.
    const { rows: links } = await db.query<{ owner_id: string }>(
      `select owner_id from links order by owner_id`,
    );
    expect(links).toEqual([{ owner_id: PROJECT }, { owner_id: CONTROL_PROJECT }]);
    const { rows: snippets } = await db.query<{ owner_id: string }>(
      `select owner_id from note_snippets order by owner_id`,
    );
    expect(snippets).toEqual([{ owner_id: PROJECT }, { owner_id: CONTROL_PROJECT }]);

    // Session history is kept on purpose (sessions.task_id is on delete set null).
    const { rows: sessions } = await db.query<{ task_id: string | null }>(
      `select task_id from sessions where id = '${CONTROL_SESSION}'`,
    );
    expect(sessions[0]?.task_id).toBeNull();
  });

  it("deleting a project removes its own and its tasks' links and snippets", async () => {
    await db.exec(`delete from projects where id = '${PROJECT}';`);

    await expect(orphanCount(db, "links")).resolves.toBe(0);
    await expect(orphanCount(db, "note_snippets")).resolves.toBe(0);

    // Only the control tree's rows remain, all resolvable.
    const { rows: linkOwners } = await db.query<{ owner_type: string; owner_id: string }>(
      `select owner_type, owner_id from links order by owner_id`,
    );
    expect(linkOwners).toEqual([{ owner_type: "project", owner_id: CONTROL_PROJECT }]);
    const { rows: snippetOwners } = await db.query<{ owner_type: string; owner_id: string }>(
      `select owner_type, owner_id from note_snippets order by owner_id`,
    );
    expect(snippetOwners).toEqual([{ owner_type: "project", owner_id: CONTROL_PROJECT }]);
    const { rows: controlTasks } = await db.query<{ id: string }>(
      `select id from tasks where project_id = '${CONTROL_PROJECT}'`,
    );
    expect(controlTasks).toEqual([{ id: CONTROL_TASK }]);
  });
});
