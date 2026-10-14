# UI polish, October 2026

Branch `ui-polish`. A full review of the dashboard found 18 problems; this branch fixes all of them.

## Fixed bugs
1. Tomorrow's plan and Tomorrow's task list are now one card. The old second card always said "No plan yet" even when a plan was showing.
2. The plan card is titled by its day ("Today's plan", "Tomorrow's plan", "Friday's plan") instead of always "Tomorrow".
3. Deleting a task, subtask, project, misc task or open loop shows "Deleted ... Undo" for 6 seconds before anything is removed. Closing the tab inside that window still deletes. The browser confirm boxes on projects and notes are gone.

## Less clutter
4. Row buttons (start, more menu) show on hover or keyboard focus with a mouse, always on touch screens. Links, Notes, Add subtask and Delete live in a small "more" menu. Links and notes show as small markers only when they exist.
5. Top bar: logo, "I'm stuck", a Tools menu (Organize, I'm stuck, Time study, Blocked sites) and a round profile button with a status dot.
6. "New project" opens a small window. The projects box fades its bottom edge instead of slicing a row, and only scrolls inside itself on desktop.
7. Finished tasks and subtasks hide behind "Show N done" per project (remembered per device).
8. Real line icons replace typed characters (v, >, X, ▶, ↗, ✎, ⧉). Progress shows a small ring plus "5/13".
9. Stats strip: "1h 55m" without ticking seconds, session average, "Top: youtube.com (1)" on one line, no Reports column.
10. Wind down and Send EOD sit side by side in one small "Evening" card.
11. Notes and Open loops share one heading style. Open loops has one input with a Loop / Decision switch; the explainer and prompts sit behind a help button. Counts say "1 decision".

## States and windows
12. Live session: one countdown, task and project names, a progress bar, Pause, -5 min, +5 min, End. Logging a distraction is a quiet "Got distracted? Log it" link.
13. Extension offline: one banner. No repeated toast every 30 seconds. The disabled start button is grey, not faded pink.
14. Every window uses one shell (`components/modal.tsx`): same width, same top position, a real close icon, main action pinned at the bottom. Fields have labels above them, so hints no longer get cut off. Choice buttons use one segmented control (`Segmented` in `components/ui.tsx`). The profile menu saves fields when you leave them. Toasts appear bottom centre.

## Phone and sizing
15. Phone top bar is one 56px row. Order on phones: stats with Start working, the plan, Projects, Evening, Notes, Open loops. The projects box does not scroll inside the page on phones. Long titles wrap instead of being cut off.
16. Text in panels is at least 12px (most is 13px or 14px). Icon buttons are 32px.

## Extension and files
17. The extension ships Saira (`extension/src/assets/saira.woff2`, SIL Open Font License), so the popup, block page and floating timer show the same digits as the dashboard. The popup leads with the timer and Open dashboard; the URL field sits under Settings once saved. The block page shows the logo and the task you are on. The float timer's lock pill is neutral grey like the dashboard's.
18. `favicon.ico` is rebuilt in a format the local dev server reads (it used to crash it). Logo files are cropped tight, without the dark frame. The unused Next.js starter images are removed.

## Shared building blocks
- `components/ui.tsx`: button, input and card classes, `Segmented`, `RowMenu`, toast position.
- `components/icons.tsx`: the line icons.
- `lib/ui-format.ts` and `lib/pending-delete.ts`, with tests.

## Not covered
- The AI modes of Organize and I'm stuck were not restyled beyond the shared window.
- The native dropdown lists still open in the operating system's own style; the closed box matches the app.
