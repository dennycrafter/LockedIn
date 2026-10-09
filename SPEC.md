# LOCKEDIN: Master Build Document

## 0. Instructions to the builder

You are building **LockedIn**, a single-user productivity dashboard plus a Chrome extension. The dashboard (a Next.js website on Vercel, behind its own password screen) holds projects, tasks, notes, a focus timer, wind down planning and an end of day email report. The Chrome extension blocks distracting sites during focus sessions, shows a floating timer on every tab and records "infractions" (attempts to open blocked sites).

Build it in the ticket order in section 9. After each ticket, run its acceptance checks and print the results. Do not start the next ticket until the current one passes. Never use mock data in the running app (fixtures in tests are fine). The only things you may ask the user for are the secrets listed in section 5. Everything else is decided below. Do not use em dashes anywhere, including UI text.

The user is non-technical. Every setup step you need from him must be written as short numbered steps in plain language in the README.

**Repository:** https://github.com/dennycrafter/LockedIn (default branch `main`). All code goes in this repo, using the monorepo layout in section 4. This spec lives at the repo root as `SPEC.md`; keep it there and do not edit it.

---

## 1. Mission

The owner wants one place to get focused work done: his tasks set up in front of him, a timer, and distractions blocked. The core loop in one sentence: **pick a task, start a timer, the extension locks distracting sites until the timer ends, and the time is logged against that task.** Around that loop: notes and links attached to each task, a quick capture list for open loops and undecided decisions, a nightly wind down that plans tomorrow's most important task, and an end of day email report.

Single user only. No sign-up, no multiple accounts.

---

## 2. Definition of done

- [ ] Dashboard deployed on Vercel Hobby (free) at a `*.vercel.app` URL, as a NEW project in the owner's existing Vercel account (he already has another project there; do not touch it)
- [ ] Every page and API route requires the app password, except the login page, the login API and the cron route
- [ ] All data stored in Supabase (free plan) and survives clearing the browser
- [ ] Chrome extension loads via "Load unpacked" and connects to the dashboard with no code edits by the owner
- [ ] Core loop works end to end: project > task > 25 min hard lock > blocked site redirects to block page > infraction counted > time logged to the task
- [ ] Soft lock, no lock, pause, +5 / -5 minutes and floating timer all work
- [ ] Notes, links, open loops, decisions, misc tasks, time study all work
- [ ] Wind down flow builds tomorrow's task list
- [ ] "Send EOD" emails the report to the owner via Resend
- [ ] Helper flows ("I'm stuck", "Organize my task list") work in scripted mode, then in AI mode (Ticket T8)
- [ ] README with plain-language setup steps, `.env.example` committed, `.env` git-ignored
- [ ] Monthly cost: $0 apart from Anthropic API usage the owner pays from existing credits

---

## 3. Hard constraints

- **Cost:** free tiers only. Vercel Hobby, Supabase Free, Resend Free. Anthropic API is the only paid service (owner has credits).
- **Vercel Hobby:** built-in Password Protection is NOT available on Hobby. Build our own password screen (section 8.1).
- **Supabase Free:** projects pause after 7 days with no database requests. Mitigate with a daily keepalive cron (Ticket T6).
- **Resend Free:** 3,000 emails per month, 100 per day. Without a verified domain, Resend only delivers to the email address the Resend account was created with. So the EOD report goes to that one address. Sending from `onboarding@resend.dev` is allowed.
- **Browser:** Google Chrome on Windows. Extension is Manifest V3.
- **Timezone:** all "today" boundaries use `America/Chicago`.
- **Personal use only** (Vercel Hobby is non-commercial).

---

## 4. Stack and architecture

```
Chrome extension (MV3)                      Vercel (Next.js, Hobby)              Supabase (Postgres)
  - blocks sites (declarativeNetRequest)  <-- bridge -->  dashboard pages     --server only-->  tables (sec 6)
  - floating timer on all tabs                            /api/* routes       
  - block page logs infractions                           cron keepalive      --> Resend (EOD email)
  - right-click "Add to task notes"                                           --> Anthropic (helper AI, T8)
```

- **Repo layout (monorepo):**
  - `/web` Next.js 15+ App Router, TypeScript, Tailwind CSS. Vercel "Root Directory" = `web`.
  - `/extension` plain TypeScript or JS, Manifest V3, built to `/extension/dist` with a single `npm run build` (use Vite or esbuild). `dist` is what the owner loads unpacked.
- **Database access:** ONLY from Next.js server code (API routes and server actions) using `@supabase/supabase-js` with the service role key. The browser never talks to Supabase directly. No Supabase keys in client code.
- **Extension <> dashboard bridge:** no extension ID needed. The extension has one content script running on all pages. If the page's origin equals the saved `dashboardOrigin`, the content script acts as a bridge: the dashboard calls `window.postMessage({source:'lockedin-dashboard', ...})`, the content script forwards to the extension service worker with `chrome.runtime.sendMessage` and posts the reply back with `{source:'lockedin-extension', ...}`. On all other pages the same content script only draws the floating timer.
- **Source of truth:**
  - The **extension** owns the live session state (it must enforce locks even if the dashboard tab is closed), stored in `chrome.storage.local`.
  - The **database** owns everything else. Completed sessions and infractions are queued in the extension and flushed into the database by the dashboard through the bridge (on dashboard load and every 30 seconds while open).

---

## 5. Environment variables

Set these in Vercel > project > Settings > Environment Variables (Production and Preview). Put the same names in `web/.env.example` with empty values.

| Name | What it is | Where to get it | Format |
|---|---|---|---|
| `APP_PASSWORD` | The dashboard password the owner types | Owner chooses it | any string, 12+ chars recommended |
| `SESSION_SECRET` | Signs the login cookie | Generate: 32 random bytes as hex | 64 hex chars |
| `SUPABASE_URL` | Supabase project URL | Supabase > Project Settings > API | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase key | Supabase > Project Settings > API keys > service_role / secret key | long string, keep secret |
| `RESEND_API_KEY` | Sends the EOD email | resend.com > API Keys > Create | starts with `re_` |
| `REPORT_TO_EMAIL` | Where the EOD report goes | MUST be the email used to sign up to Resend | email |
| `REPORT_FROM_EMAIL` | Sender address | fixed value | `LockedIn <onboarding@resend.dev>` |
| `CRON_SECRET` | Protects the keepalive cron | Generate: 32 random bytes as hex | 64 hex chars |
| `ANTHROPIC_API_KEY` | AI helper mode (T8 only) | console.anthropic.com > API Keys | starts with `sk-ant-` |

---

## 6. Database schema

Run this in Supabase > SQL Editor as one script.

```sql
create extension if not exists pgcrypto;

create table settings (
  id int primary key default 1 check (id = 1),
  display_name text not null default 'Boss',
  completion_style text not null default 'dramatic' check (completion_style in ('dramatic','hype','calm')),
  time_study_minutes int check (time_study_minutes in (5,15,30,45,60)),
  default_minutes int not null default 25,
  default_lock text not null default 'hard' check (default_lock in ('none','soft','hard'))
);
insert into settings (id) values (1);

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- parent_task_id null = task; not null = subtask (one level only)
create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  parent_task_id uuid references tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  notes text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table links (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('project','task')),
  owner_id uuid not null,
  name text not null,
  url text not null,
  created_at timestamptz not null default now()
);

-- dated snippets attached to a project/task/subtask (from notes, right-click, wind down)
create table note_snippets (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('project','task')),
  owner_id uuid not null,
  content text not null,
  context text not null default '',
  source text not null default 'manual' check (source in ('manual','note','page','wind_down')),
  created_at timestamptz not null default now()
);

-- Simple Notes: first line of body is the title
create table notes (
  id uuid primary key default gen_random_uuid(),
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table blocked_sites (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key,                       -- generated by the extension
  project_id uuid references projects(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  misc_task_id uuid,
  label text not null default '',            -- e.g. "I'm stuck 5 min start"
  lock_mode text not null check (lock_mode in ('none','soft','hard')),
  planned_seconds int not null,
  added_seconds int not null default 0,
  active_seconds int not null,               -- excludes paused time
  started_at timestamptz not null,
  ended_at timestamptz not null
);

create table infractions (
  id uuid primary key,                       -- generated where it happened
  session_id uuid,
  kind text not null check (kind in ('site','manual')),
  detail text not null,                      -- domain, or typed text like "phone"
  occurred_at timestamptz not null
);

create table open_loops (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('loop','decision')),
  text text not null,
  created_at timestamptz not null default now()
);

create table misc_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table time_studies (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  occurred_at timestamptz not null default now()
);

-- one row per evening wind down; plan_date = the day being planned (tomorrow)
create table day_plans (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null unique,
  start_time text not null default '',
  location text not null default '',
  prepped boolean not null default false,
  created_at timestamptz not null default now()
);

create table day_plan_tasks (
  plan_id uuid not null references day_plans(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  position int not null default 0,
  primary key (plan_id, task_id)
);

-- the review answers for a given day
create table day_reviews (
  id uuid primary key default gen_random_uuid(),
  review_date date not null unique,
  done_today text not null default '',
  finished_goal boolean,
  best_use boolean,
  best_use_note text not null default '',
  learned text not null default '',
  eod_sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Lock everything down: RLS on, no policies, so only the service role (server) can read/write.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
    execute format('grant all on table %I to service_role', t);
  end loop;
end $$;
```

---

## 7. External services

All details below are from each provider's documentation as of 9 Oct 2026. Ticket T0 must make one real test call to each and print OK or the error.

### 7.1 Supabase
- Client: `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })`, server only.
- Free plan: 2 active projects, 500 MB database, pauses after 7 days with no database requests.
- Supabase is rolling out an explicit Postgres grants requirement for the Data API (new projects from 30 May 2026, existing from 30 Oct 2026). The `grant all ... to service_role` loop in section 6 covers it. If any query returns a permission error, re-run that loop.

### 7.2 Resend (EOD email)
- `POST https://api.resend.com/emails`
- Header: `Authorization: Bearer ${RESEND_API_KEY}`, `Content-Type: application/json`
- Body: `{ "from": REPORT_FROM_EMAIL, "to": [REPORT_TO_EMAIL], "subject": "...", "html": "...", "text": "..." }`
- Success: 200 with `{ "id": "..." }`.
- 403 "You can only send testing emails to your own email address" means `REPORT_TO_EMAIL` is not the Resend signup email.
- Limits: 100 per day, 3,000 per month.

### 7.3 Anthropic (T8 only)
- `POST https://api.anthropic.com/v1/messages`
- Headers: `x-api-key: ${ANTHROPIC_API_KEY}`, `anthropic-version: 2023-06-01`, `content-type: application/json`
- Body: `{ "model": "claude-haiku-5-5", "max_tokens": 600, "system": "...", "messages": [...] }`
- Useful value: `response.content[0].text`.
- Called only from `/api/ai` on the server. Never from the browser or extension.

### 7.4 Vercel
- New project in the owner's existing Hobby account, Root Directory `web`, framework Next.js.
- One cron job in `web/vercel.json`: `{ "crons": [{ "path": "/api/cron/keepalive", "schedule": "0 12 * * *" }] }`. Vercel sends `Authorization: Bearer ${CRON_SECRET}`; reject anything else with 401.

---

## 8. Business logic

### 8.1 Password screen
- `/login`: one password field, one button "Unlock".
- `POST /api/login` compares the input with `APP_PASSWORD` using a constant-time compare. On match, set cookie `lockedin_session` = `<expiryUnix>.<HMAC-SHA256(expiryUnix, SESSION_SECRET) hex>`, `HttpOnly`, `Secure`, `SameSite=Lax`, 30 day expiry.
- `middleware.ts` verifies that cookie on every request except `/login`, `/api/login`, `/api/cron/keepalive`, and static assets. Pages redirect to `/login`; API routes return 401.
- After 5 wrong attempts within 10 minutes from one IP, return 429 for 10 minutes (in-memory counter is fine).
- "Lock" item in the profile menu clears the cookie.

### 8.2 Projects, tasks, subtasks
- Project contains tasks; a task contains subtasks (one level).
- Project progress % = done tasks and subtasks / all tasks and subtasks, rounded. 0 items = 0%.
- Drag to reorder projects, tasks within a project, and subtasks within a task (use `@dnd-kit`). Save `position`.
- When the last undone item in a project is ticked, show the completion celebration (8.10).
- Deleting a project asks for confirmation and cascades.

### 8.3 Links
- Any project or task (incl. subtask) can hold links (name + URL). URL without `http` gets `https://` prepended.
- "Open all" opens every link of that item in new tabs.

### 8.4 Focus sessions (timer)
- Start from: the "Start working" button (pick project > task > subtask, all optional), the timer icon on any project/task/subtask row, or a misc task.
- Duration choices: 15, 25, 45, 60, 90 minutes, or custom (5 to 180). Default 25.
- Lock choices:
  - **No lock:** timer only. Blocked sites stay reachable.
  - **Soft lock:** blocked sites are blocked. "End session" early starts a 2 minute countdown; sites stay blocked until it finishes. The owner can cancel the countdown with "Keep working".
  - **Hard lock:** blocked sites are blocked until the timer reaches zero. "End session" is disabled and shows "Hard lock: ends in mm:ss".
  - Default: 25 min, hard lock.
- **Pause:** stops the countdown. Blocking stays on (if the lock mode blocks). Paused time is not counted in `active_seconds`.
- **+5 min / -5 min:** +5 adds 300s to `added_seconds`. -5 removes 300s, but only time that was added (never below 0 added). Hard lock end moves with it.
- Only one session at a time. While a session runs, other timer buttons are disabled.
- When the timer hits 0: unblock (unless another rule keeps it), chrome notification "Session done", queue the completed session, show "Start another session" in the dashboard.
- Session time is attributed to the most specific item chosen (subtask > task > project). "Time by project (today)" sums sessions by project for today in America/Chicago.

### 8.5 Blocking and infractions (extension)
- Blocked site list lives in `blocked_sites`, edited on the dashboard "Edit blocked sites" panel, pushed to the extension through the bridge on every change and on dashboard load. Extension caches it in `chrome.storage.local`.
- "Social media pack" button adds: `facebook.com, instagram.com, x.com, twitter.com, tiktok.com, reddit.com, youtube.com, snapchat.com, threads.net, pinterest.com`.
- Input accepts a full URL or a bare domain; store only the lowercase hostname without `www.`. Blocking covers the domain and all subdomains.
- While a blocking session is active, the service worker installs `declarativeNetRequest` dynamic rules: one rule per domain, `condition: { requestDomains: [domain], resourceTypes: ['main_frame'] }`, action `redirect` to the extension page `blocked.html?site=<domain>`. Remove all LockedIn rules when blocking ends.
- `blocked.html`: big text "Blocked. Back to work.", the site name, time left in the session, a button "Back to my task" (opens the dashboard). On load it records an infraction `{ id: uuid, kind:'site', detail: site, session_id, occurred_at }` into the queue.
- Manual infraction: in the dashboard session panel and the floating timer, a small input "Got distracted by..." (e.g. "phone") + Add, records `kind:'manual'`.
- Stats: "Infractions today" = count for today; "Top infraction" = most frequent `detail` today, shown as "Blocked site: youtube.com" or "Manual: phone".

### 8.6 Floating timer
- Content script draws a small draggable box (bottom right by default, position remembered) on every normal web page while a session is active, using Shadow DOM so site styles don't leak in.
- Shows: task name, time left (big numbers), lock mode, Pause/Resume, +5, -5, manual infraction input, hide (×).
- "Float timer" toggle in the dashboard turns it on/off globally. Not shown on the dashboard origin itself (the dashboard has its own timer).

### 8.7 Notes
- **Simple Notes panel:** list of notes, ✎ creates one. First line = title. Autosave 800ms after typing stops. Delete with confirm.
- **Pop out:** ⧉ opens the current note in a small separate window (`window.open('/notes/popout?id=...', 'lockedin-notes', 'width=420,height=640')`) the owner can place next to any tab. Edits sync both ways (refetch on focus).
- **Attach to task:** select text in a note, click "+" (appears near the selection) > pick project > task > subtask (all optional below project) > optional "context" text > Add. Creates a `note_snippets` row with today's date.
- **Item notes:** every project, task and subtask has a notes box (quiet "+ Add a note" line that becomes a growing box, saves on blur) and below it its dated snippets, newest first.
- **Right-click capture (extension):** select text on any web page > right-click > "Add to LockedIn task notes". Opens a small extension window with a project/task/subtask picker (list cached from the dashboard via the bridge) and a context box. On Add, the snippet is queued with `source:'page'` and the page URL appended to `context`, then flushed by the dashboard.

### 8.8 Open loops and decisions
- Two buttons: "Decision I need to make", "Add open loop". Each adds a one-line item.
- Two lists with counts and Delete on each item. Header shows total saved count. Panel collapsible.
- "Prompt questions to unload your brain" toggles a short list of prompts (write our own wording):
  1. Is anything bugging me that I haven't written down?
  2. Is there a message I'm waiting to send or reply to?
  3. Is there a decision I keep circling?
  4. Is there something I promised someone?
  5. Is there an appointment or deadline I'm holding in my head?
- "What's an open loop?" shows one line: "Anything sitting in your head that isn't written down. Park it here so your brain is free for the task."

### 8.9 Misc tasks
- Small "+" next to "Tomorrow's task list" adds a misc task (one line). Tick, delete, drag to reorder, or start a timer on it.
- Misc tasks never appear in wind down and have no notes or links.

### 8.10 Completion celebration
- Triggered when all items in a project become done, or when the last item of tomorrow's task list (today's plan) is ticked.
- Message styles, chosen in settings ("Choose message"):
  - dramatic: "{name}. You came, you locked in, you won the day."
  - hype: "LET'S GO {name}! Everything done!"
  - calm: "Nice work, {name}. All done."
- `{name}` = `settings.display_name` (editable in settings, e.g. a "work self" nickname). Greeting on the dashboard: "Welcome back, {name}".
- Animation per section 10 rules: one burst, auto close after 6s, Escape/click closes, reduced-motion version.

### 8.11 Time study
- Setting: Off, or check-in every 5, 15, 30, 45, 60 minutes.
- While on and the dashboard or extension is running, a Chrome notification and an in-dashboard prompt ask "What are you doing right now?". The answer saves to `time_studies`. Implement the timer with `chrome.alarms` in the extension so it works with the dashboard closed; answers are queued and flushed.
- Today's entries show in a list on the Time study panel and in the EOD report.

### 8.12 Wind down (evening flow)
A step-by-step modal. Each step one question, Back and Next, X closes (progress kept until the modal is reopened the same day). First screen offers "Full wind down" or "Skip to planning tomorrow" (jumps to step 5).

1. "What did you actually get done today?" (text) → `day_reviews.done_today`
2. "Did you finish what you planned?" Yes / No → `finished_goal`
3. "Was today a good use of your time?" Yes / No + optional note → `best_use`, `best_use_note`
4. For each task or subtask with session time today: show its name and minutes, optional "Anything to remember about this?" text. Non-empty answers become `note_snippets` with `source:'wind_down'`.
5. "What time will you start tomorrow?" (text, e.g. 8am) → `day_plans.start_time`
6. "Where will you work?" (text) → `day_plans.location`
7. "Add tomorrow's tasks": "I already have it" (pick project > task/subtask, can add several) or "Add a new one" (pick or create project, type task). Builds `day_plan_tasks` in order. "Task list finished" moves on.
8. "Prep it": shows each planned task with its links and an "Open all links" button, plus the checklist line "Open what you need and leave it ready." Button "Ready for tomorrow" sets `prepped = true` and closes with "See you tomorrow, {name}."

- `plan_date` = tomorrow in America/Chicago. If the wind down runs after midnight but before 5am, plan_date = today.
- **Tomorrow's task list** panel on the dashboard shows the latest plan whose date is today or later: start time, location, ordered tasks with tick boxes and a timer button each. First task is labelled "Most important task".
- "How to use wind down" link shows a 3-line explainer.

### 8.13 End of day report
- "Send EOD" opens a preview with editable fields: "What you got done today" (prefilled from `done_today`) and "What you learned today" (`learned`).
- Report contents: date, total focused time today, number of sessions, done today, finished planned work (yes/no), good use of time (yes/no + note), what I learned, tomorrow plan (start time, location, tasks), time studies today, time per task today (task name, minutes, sorted desc), infractions today (count + list).
- Send: `POST /api/eod` builds HTML + plain text and calls Resend (7.2). Subject: `LockedIn EOD: Fri 9 Oct, 3h 20m focused`. On success: toast "Report sent", set `eod_sent_at`. On failure: show the error text, keep the preview open.

### 8.14 Helper flows (scripted, T7)
Both open as a step-by-step modal like wind down. X cancels at any step.

**"I'm stuck, help me start"**
1. "Which task are you avoiding?" (pick from tasks, or type)
2. "What's making it hard right now?" choices: Don't know where to start / It feels too big / Low energy / Something else is on my mind
   - "Something else is on my mind" → add it as an open loop, then continue
3. "What's the smallest first step? Something you could do in 2 minutes." (text, shown with examples: "open the doc", "write one ugly sentence", "list 3 bullet points")
4. "Just 5 minutes. You can stop after." Button "Start 5 minutes" starts a 5 min soft-lock session on that task with label "Stuck starter". When it ends, a prompt: "Keep going? Start 25 min hard lock" / "Done for now".

**"Organize my task list"**
1. "Dump everything you could work on." Shows all undone tasks/subtasks/misc tasks with checkboxes; plus a box to add new items.
2. For each checked item: "Is there a deadline?" (none / today / this week / later), "Impact if done" (1 to 5), "Effort" (1 to 5)
3. Score = impact × 2 + deadline bonus (today 6, this week 3, later 1, none 0) − effort. Sort descending, ties by deadline then title.
4. Show the ranked list. "Make #1 my most important task" puts it first in today's plan (create today's `day_plans` row if missing). "Start it now" opens the session start dialog on it.

### 8.15 Helper flows, AI mode (T8)
- Settings toggle "Helper mode: Scripted / AI" (default Scripted). AI mode needs `ANTHROPIC_API_KEY`; if missing, the toggle is disabled with the hint "Add your Anthropic key in Vercel to turn this on".
- In AI mode each flow becomes a chat panel. `/api/ai` sends the conversation plus context (undone tasks with projects, today's open loops, today's plan) to Anthropic (7.3).
- System prompt for "I'm stuck": coach style, short replies (max 3 sentences), ask one question at a time, goal is to get the user to name one tiny first step, then reply with a line containing exactly `START_5_MIN: <task id or title>`; the UI turns that into a "Start 5 minutes" button.
- System prompt for "Organize": ask about deadlines, impact and effort for the listed tasks, then return a ranked list as JSON in a fenced block `{"ranked":[{"title":"...","task_id":"...|null","reason":"..."}]}`; the UI renders it with the same buttons as 8.14.
- Max 12 messages per conversation, `max_tokens` 600. On API error, show the error and offer "Switch to scripted".

### 8.16 Stats strip (top of dashboard)
- Work today (focused time, `h m s` style, live while a session runs), Sessions today, Infractions today, Top infraction.
- "Time by project (today)": horizontal bars, minutes per project, "No sessions yet today" when empty.

### 8.17 Bridge messages (dashboard <> extension)
Dashboard → extension (each returns `{ok, data?, error?}`):
- `ping` → `{version, connected:true}`
- `setBlockedSites {domains[]}`
- `setTree {projects:[{id,name,tasks:[{id,title,subtasks:[{id,title}]}]}]}` (for the right-click picker and labels)
- `startSession {id, projectId?, taskId?, miscTaskId?, label, lockMode, plannedSeconds}`
- `pause`, `resume`, `addTime {seconds: 300 | -300}`, `requestEnd`, `cancelEnd`
- `getState` → current session or null, plus `softUnlockAt`
- `addManualInfraction {text}`
- `setFloat {enabled}`, `setTimeStudy {minutes|null}`
- `drainQueue` → `{sessions[], infractions[], snippets[], timeStudies[]}`; dashboard saves them via `/api/sync` then calls `ackQueue {ids[]}` so nothing is lost if saving fails.

Extension → dashboard: the dashboard polls `getState` every 1s while visible to keep its timer in sync.

Connection status: dashboard header shows a small dot "Extension connected" (green) or "Extension not connected" (amber) with a "How to install" link to the README steps.

The extension popup (click the toolbar icon) shows: connection status, current session time left, a field "Dashboard URL" (saved to `chrome.storage.local.dashboardOrigin`), and "Open dashboard".

---

## 9. Build order (tickets)

### T0: Scaffold and prove connectivity
Blocked by: none, start immediately
What it delivers: empty dashboard deployed on Vercel behind the password screen; schema applied; health page proves every service.
Steps:
1. Create monorepo `/web` (Next.js, TS, Tailwind) and `/extension` (MV3 skeleton with popup, service worker, content script, `npm run build` to `dist`).
2. Add `.gitignore` with `.env*` except `.env.example`; add `web/.env.example` with section 5 names.
3. Implement 8.1 password screen and middleware.
4. Add `supabase/schema.sql` with section 6; README step to run it.
5. `/api/health` (password protected) runs: one Supabase select on `settings`, one Resend call is NOT sent here (to save quota) but the key format is checked (`re_` prefix), one Anthropic check only if the key exists (`GET https://api.anthropic.com/v1/models` with the headers in 7.3). Returns JSON `{supabase:'OK'|error, resend:'KEY_FORMAT_OK'|error, anthropic:'OK'|'NOT_SET'|error}`.
6. `/api/cron/keepalive` with CRON_SECRET check, selects from `settings`; add `vercel.json` cron.
Acceptance:
- [ ] Visiting the Vercel URL redirects to `/login`; wrong password stays; right password reaches the dashboard
- [ ] `/api/health` without cookie = 401; with cookie shows `supabase: OK`
- [ ] `/api/cron/keepalive` without the bearer = 401, with it = 200
- [ ] Extension builds and loads unpacked with no errors in `chrome://extensions`

### T1: Tracer bullet (CHECKPOINT)
Blocked by: T0
What it delivers: the core loop end to end with real data.
Steps: minimal project + task creation; minimal blocked sites editor; bridge (8.17: ping, setBlockedSites, startSession, getState, drainQueue, ackQueue); hard lock session with countdown; declarativeNetRequest blocking; `blocked.html` infraction logging; `/api/sync` saving sessions and infractions; stats strip with Work today, Sessions, Infractions, Top infraction, Time by project.
Acceptance:
- [ ] Create project "Test" with task "Write intro"
- [ ] Add `youtube.com` to blocked sites
- [ ] Start a 1 minute hard lock on "Write intro"
- [ ] Opening youtube.com shows the block page with the site name and time left
- [ ] Ending early is not possible
- [ ] After the minute, youtube.com loads again
- [ ] Dashboard shows Sessions 1, Infractions 1, Top infraction "Blocked site: youtube.com", Time by project "Test" about 1 min
- [ ] Rows exist in `sessions` and `infractions` in Supabase
Do not start T2 until all of the above pass.

### T2: Projects, tasks, subtasks, links, item notes
Blocked by: T1
Delivers 8.2, 8.3, item notes and snippets display from 8.7, settings for display name, completion celebration 8.10.
Acceptance:
- [ ] Add, rename, tick, delete, drag reorder at all three levels; order persists after reload
- [ ] Progress % correct (test: 1 of 4 done = 25%)
- [ ] Links add, open all
- [ ] Notes save on blur and survive reload
- [ ] Ticking the last item shows the celebration with the chosen style and name

### T3: Full timer, floating timer, manual infractions
Blocked by: T1
Delivers 8.4 to 8.6 fully: durations, none/soft/hard, pause, +5/-5, soft lock 2 minute end, timer icons on every row, float timer, manual infractions, Social media pack, notifications.
Acceptance:
- [ ] Soft lock: End session > sites still blocked for 2 min > then unblocked; "Keep working" cancels
- [ ] No lock: blocked sites load during the session
- [ ] Pause stops the countdown, keeps blocking; active time excludes paused time
- [ ] +5 then -5 returns to the original end; -5 with nothing added does nothing
- [ ] Floating timer appears on other sites, is draggable, buttons work, not shown on the dashboard
- [ ] Closing the dashboard tab mid-session keeps blocking and the session is saved next time the dashboard opens

### T4: Notes, pop out, attach, right-click capture
Blocked by: T2
Delivers 8.7.
Acceptance:
- [ ] New note, first line becomes title, autosave works
- [ ] Pop out window edits sync with the main panel
- [ ] Select text in a note > + > attach to a subtask with context > it shows under that subtask with today's date
- [ ] Right-click selected text on any site > picker > Add > after the dashboard syncs, it shows under the chosen task with the page URL

### T5: Open loops, decisions, misc tasks, time study
Blocked by: T2
Delivers 8.8, 8.9, 8.11.
Acceptance:
- [ ] Add/delete loops and decisions; counts correct; panel collapses
- [ ] Misc tasks add/tick/delete/reorder/start timer; not shown in wind down
- [ ] Time study at 5 minutes prompts, saves answers, shows today's list

### T6: Wind down, tomorrow's list, EOD email, keepalive
Blocked by: T3, T5
Delivers 8.12, 8.13. Cron from T0 confirmed in Vercel dashboard.
Acceptance:
- [ ] Full wind down saves review, snippets from step 4, plan with start time, location and ordered tasks
- [ ] "Skip to planning tomorrow" jumps to step 5
- [ ] Tomorrow's task list shows the plan with "Most important task" label; ticking the last one shows the celebration
- [ ] Send EOD delivers an email to REPORT_TO_EMAIL with every section in 8.13 and correct numbers
- [ ] Vercel > project > Settings > Cron Jobs lists the keepalive

### T7: Helper flows, scripted
Blocked by: T6
Delivers 8.14.
Acceptance:
- [ ] "I'm stuck" ends in a running 5 min soft lock session on the chosen task with label "Stuck starter"
- [ ] "Something else is on my mind" creates an open loop
- [ ] "Organize" ranks with the exact formula (test: impact 5, deadline today, effort 2 = 14) and "Make #1 my most important task" puts it first in today's plan

### T8: Helper flows, AI mode
Blocked by: T7, and the owner adding `ANTHROPIC_API_KEY` in Vercel
Delivers 8.15.
Acceptance:
- [ ] Toggle disabled without key, enabled with key
- [ ] "I'm stuck" chat ends with a working "Start 5 minutes" button
- [ ] "Organize" chat returns a ranked list rendered with the same buttons
- [ ] API errors show a message and "Switch to scripted" works

### T9: Polish, README, handoff
Blocked by: T8
Delivers section 10 checks on every screen, section 11 docs.
Acceptance:
- [ ] Desktop and phone width screenshots of dashboard, wind down, EOD preview, block page, floating timer, using made-up data
- [ ] No sideways scrolling at 390px wide
- [ ] Lighthouse accessibility 90+ on the dashboard
- [ ] README steps followed from scratch by a fresh reader work

---

## 10. UI spec

### Design rules (owner's standing preferences, follow exactly)
- Dark only. Tokens:
```css
:root {
  color-scheme: dark;
  --bg: #0b0b0d; --surface: #121215; --surface-2: #1c1c20; --line: #2a2a30;
  --fg: #f2f2f4; --muted: #9a9aa3; --silver: #e8e8ea;
  --accent: #7c5cff; --accent-ink: #9d85ff;
  --ok: #34d65c; --warn: #ffb547; --bad: #ff6f66; --info: #6ab8ff;
  --r: 8px;
}
```
- Corners: boxes 8px, buttons and inputs 6px. Pills only for status (lock mode, extension connected).
- Four greys only (bg, surface, surface-2, line). Inputs sit on `--bg`.
- Accent colour only on the ONE main action per screen ("Start working" on the dashboard, "Start session" in the start dialog, "Next" in step flows, "Send" in EOD).
- System font (-apple-system, Segoe UI, Inter fallback) for all text. Display font **Saira** (Google Fonts) only for big numbers: timer digits, stats, celebration title.
- Pop-ups and menus: `--surface-2`, 1px `--line` outline, shadow `0 6px 16px rgba(0,0,0,.3)`.
- Lists like an inbox: rows in one box with thin dividers, not stacked cards.
- Stats as one strip split by 1px lines, big numbers.
- Add actions open a floating window (click outside, X or Escape closes; closes on success with a toast; stays open on error).
- Notes: quiet "+ Add a note" line that becomes a growing box, saves on blur.
- Celebration: one burst (single shockwave + sparks + confetti, slam title, light shake), auto close 6s, reduced-motion version, no sound.
- Max width 1760px, gutter `clamp(16px, 2.6vw, 40px)`. No sideways scroll on phones.
- Visible focus outlines, aria labels on icon buttons, Escape closes every modal.
- No em dashes in any UI text.
- Remember per-device choices (collapsed panels, last duration, last lock mode, float position) in localStorage wrapped in try/catch.

### Layout (desktop, three columns; phone, one column in this order: left, middle, right)
- **Top bar (sticky, frosted):** "LockedIn" wordmark; "Welcome back, {name}"; extension status dot; links: Full guide (README), Not working? (troubleshooting section of README), Edit blocked sites, Time study, I'm stuck, Organize; profile menu (Display name, Completion message, Helper mode, Lock).
- **Left column:** stats strip (8.16), "Start working" (accent), active session panel when running (big timer, lock pill, Pause, +5, -5, End, manual infraction input, Float timer toggle), Time by project bars, "Send EOD" button.
- **Middle column:** Projects. "Add project" button. Each project is a collapsible block: name, progress % ring, timer icon, links, "Add project notes/context", Delete project. Inside: task rows (checkbox, title, timer icon, link count, notes toggle, drag handle) with nested subtask rows and "+ Add task" / "+ Add subtask".
- **Right column:** Wind down & night prep card (button "Wind down", "How to use wind down"); Tomorrow's task list with "+" for misc tasks and the hint "Wind down builds this list. Use + for misc tasks."; Simple Notes (⧉ pop out, ✎ new, list + editor); Open loops / decisions panel.

### Block page (`blocked.html`)
Full screen `--bg`, centred: lock icon, "Blocked. Back to work." (system font), site name muted, time left in Saira, accent button "Back to my task".

### Floating timer
220px wide box, `--surface-2`, 8px corners, drag by its header, Saira digits, icon buttons with aria labels.

---

## 11. Deliverables

- `README.md` with these sections, written for a non-technical reader in short numbered steps:
  1. What LockedIn is (3 lines)
  2. One-time setup: Supabase (create project, run `supabase/schema.sql`, copy URL and service key), Resend (sign up with the email you want reports at, create API key), Vercel (new project from this repo, Root Directory `web`, add env vars from section 5, deploy)
  3. Install the extension on Windows: `cd extension`, `npm install`, `npm run build`; Chrome > `chrome://extensions` > Developer mode on > Load unpacked > pick `extension/dist`; click the LockedIn icon > paste your dashboard URL > Save
  4. Daily use: morning (open dashboard, Start working, 25 min hard lock), during the day (notes, open loops, misc tasks), evening (wind down, Send EOD)
  5. Turning on AI helpers (add `ANTHROPIC_API_KEY` in Vercel, redeploy, switch Helper mode to AI)
  6. Not working? (extension shows "not connected": check the Dashboard URL in the popup matches exactly; EOD 403: `REPORT_TO_EMAIL` must be your Resend signup email; data gone: Supabase project paused, restore it in the Supabase dashboard)
- `web/.env.example`, `supabase/schema.sql`
- Repo can be private. `.env` never committed.

---

## 12. Known gotchas

- **Vercel Hobby has no Password Protection feature.** Use the custom password screen in 8.1. Do not turn on Vercel Authentication for production (it would force a Vercel login).
- **Resend free sends only to the signup email** until a domain is verified. Do not add an "accountability partner email" field in this version.
- **Supabase pauses after 7 idle days.** The daily cron prevents it.
- **Supabase Data API grants:** tables need explicit grants to `service_role` (section 6 loop).
- **MV3 service workers sleep.** Never hold session state only in memory; always read/write `chrome.storage.local`. Use `chrome.alarms` (not `setTimeout`) for session end, soft-lock countdown and time study.
- **declarativeNetRequest redirect to an extension page** requires `blocked.html` in `web_accessible_resources` with `matches: ["<all_urls>"]`, and permissions `declarativeNetRequest`, `declarativeNetRequestWithHostAccess`, host permission `<all_urls>`. Use rule IDs in a reserved range (e.g. 1000 to 1999) and remove by ID.
- **Pass the site name to the block page** with `redirect: { extensionPath: '/blocked.html?site=' + encodeURIComponent(domain) }`. If the query string is dropped in testing, switch to `regexFilter` + `regexSubstitution` pointing at `chrome-extension://<id>/blocked.html?site=\\1`.
- **Floating timer CSS** must live in a Shadow DOM root so websites can't restyle it.
- **The bridge must check origins:** the content script only answers messages whose `event.origin === dashboardOrigin` and `event.source === window`.
- **Queue then ack:** never delete queued items in the extension until the dashboard confirms they were saved.
- **"Today" uses America/Chicago,** not UTC, everywhere (stats, wind down, EOD).
- **Anthropic and Resend calls only from the server.** Keys never reach the browser or the extension.

---

## 13. Out of scope

- Multiple users, sign-up, teams
- Paid course content, intro video, upsells
- Optional local-only storage mode (everything is in Supabase)
- Accountability partner emails (needs a verified domain)
- Google/Apple calendar sync for open loops
- Mobile app or phone site blocking (the dashboard works on a phone browser, blocking is desktop Chrome only)
- Chrome Web Store publishing
