-- 0004: add the boards table for the Board tab (Oct 2026). One row, id 'main',
-- holding the ideas whiteboard (Excalidraw elements, pasted images and the
-- last view) as JSON. Locked down like every other table: RLS on with no
-- policies, so only the server's service role can read or write it.
--
-- Idempotent: safe to run again.
create table if not exists boards (
  id text primary key default 'main',
  scene jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table boards enable row level security;
grant all on table boards to service_role;
