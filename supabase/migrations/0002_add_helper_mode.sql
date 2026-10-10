-- 0002: add the helper_mode column to settings (SPEC 8.15). It is the source
-- of truth for which mode the stuck and organize helper flows open in:
-- 'scripted' (default) keeps the scripted flows, 'ai' opens them as AI chats.
-- AI mode only takes effect when ANTHROPIC_API_KEY is configured in Vercel;
-- the settings toggle stays disabled with a hint until then.
--
-- Idempotent: safe to run again on a database that already has the column.
alter table settings add column if not exists helper_mode text not null default 'scripted' check (helper_mode in ('scripted','ai'));
