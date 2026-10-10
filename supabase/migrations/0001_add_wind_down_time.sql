-- 0001: add the wind_down_time column to settings (T6a-1 wind down evening
-- reminder target).
--
-- Backfill: the column shipped in code and in supabase/schema.sql but was
-- never applied to the live Supabase project (ggvxmpkclluietkeoxok), so the
-- dashboard broke until the owner applied this exact statement by hand on
-- 2026-10-10. This file records that change as migration 0001.
--
-- Idempotent: safe to run again on a database that already has the column.
alter table settings add column if not exists wind_down_time text not null default '';
