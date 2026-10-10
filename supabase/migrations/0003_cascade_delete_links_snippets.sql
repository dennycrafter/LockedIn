-- 0003: deleting a project or task must also delete its links and
-- note_snippets (SPEC 8.2: "Deleting a project ... cascades").
--
-- Found by the 2026-10-10 password-gated live regression run: DELETE
-- /api/tasks/[id] and DELETE /api/projects/[id] left orphan rows behind,
-- because links.owner_id / note_snippets.owner_id are polymorphic (project
-- or task) and cannot carry a foreign key the database could cascade on.
--
-- A trigger is the ON DELETE CASCADE equivalent for the polymorphic owner
-- columns: it runs in the same transaction as the delete (no partial-delete
-- window) and covers every delete path, not just the two API routes.
-- Cascaded deletes fire row-level triggers too, so a project delete also
-- cleans its tasks' and subtasks' rows via this same trigger on tasks.
-- Session history is kept on purpose: sessions.task_id / project_id are
-- ON DELETE SET NULL.
--
-- Idempotent: safe to run again on a database that already has the trigger.
create or replace function delete_owner_links_and_snippets() returns trigger
language plpgsql as $$
begin
  -- owner_type stores the singular kind ('project' | 'task'); TG_TABLE_NAME
  -- is the plural table name this trigger fired on.
  delete from links
    where owner_type = (case tg_table_name when 'projects' then 'project' when 'tasks' then 'task' end)
      and owner_id = old.id;
  delete from note_snippets
    where owner_type = (case tg_table_name when 'projects' then 'project' when 'tasks' then 'task' end)
      and owner_id = old.id;
  return old;
end;
$$;

drop trigger if exists delete_owner_links_snippets on projects;
create trigger delete_owner_links_snippets
  after delete on projects
  for each row execute function delete_owner_links_and_snippets();

drop trigger if exists delete_owner_links_snippets on tasks;
create trigger delete_owner_links_snippets
  after delete on tasks
  for each row execute function delete_owner_links_and_snippets();
