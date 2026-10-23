# Board and light mode, October 2026

Branch `board-and-light-mode`. Not merged yet: waiting for a "ship it" after screenshots.

## Needs running on real Supabase

Paste this into the Supabase SQL editor once (it is `supabase/migrations/0004_add_boards.sql`, safe to run twice):

```sql
create table if not exists boards (
  id text primary key default 'main',
  scene jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table boards enable row level security;
grant all on table boards to service_role;
```

Until it runs, the Board still works but only saves in that browser, and says so.

## Light and dark mode
1. Sun/moon button in the top bar. With no choice saved, the app follows the computer's setting and keeps following it live.
2. The choice is saved per device (`lockedin-theme` in localStorage). A tiny script in `layout.tsx` sets the theme before the page paints, so there is no flash.
3. Light mode reuses the same tokens in `globals.css` (`:root[data-theme="light"]`): soft grey page, white boxes, darker text versions of pink, green, yellow and red so they read on white. The filled pink button keeps black text.
4. Pop-up shadows and the dim backdrop are tokens now (`--shadow`, `--overlay`) so they suit both themes.
5. Dashboard only. The extension popup, block page and floating timer stay dark.

## Board tab
6. Top bar has section tabs: Today and Board, white underline on the active one. The Board lives at `#board` so refresh and back keep you there.
7. The Board is a full-screen Excalidraw whiteboard (MIT licence): sticky notes, arrows, text, frames, pasted images, zoom and pan.
8. A fresh board opens with three lanes: Now, Next, Long-term plays, each with one tip note. The canvas menu has "Add Now / Next / Long-term lanes" to add another set to the right.
9. Clean look by default: straight lines (no hand-drawn wobble) and the Nunito font. Excalidraw's purple is swapped for LockedIn pink and its panels use our surfaces.
10. Saving: every change goes to this browser right away and to the database 1.5s after you stop. On load the newer of the two copies wins. A dot in the top right says Saved, Saving, Saved in this browser only, or Not saved. Problems (migration not run, board over 4 MB) show once as a small card.
11. Pasted images count toward a 4 MB cap per board, because Vercel refuses bigger requests.

## Files
- `web/src/lib/theme.ts`, `web/src/components/theme-toggle.tsx`
- `web/src/lib/board.ts` (save format, checks, starter lanes), `web/src/components/board-view.tsx` (loading and saving), `web/src/components/board-canvas.tsx` (Excalidraw)
- `web/src/app/api/board/route.ts`
- Tests: `lib/theme.test.ts`, `lib/board.test.ts`, `app/api/board/route.test.ts`

## Also fixed
- On phones the "I'm stuck" button showed in the top bar even though it was meant to hide there (its own display class beat `hidden`). It now hides; it is still in Tools.

## Ideas for later
- Turn a note into a task in a project (right-click, "Send to Today").
- Several boards (one per area of life) with a picker.
