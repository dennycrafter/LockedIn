# LockedIn setup guide

This guide takes you from nothing to a working LockedIn: dashboard on Vercel, database on Supabase, report email on Resend, and the Chrome extension blocking sites on your PC. It is written for a first-time reader. Follow the sections in order. Everything is free except the optional Anthropic key (section 6).

The short version lives in the [README](README.md). This file is the full walkthrough.

## 0. What you need before you start

You need a Windows PC and Google Chrome. In Command Prompt (press the Windows key, type `cmd`, press Enter) check three things:

1. **Node.js 20 or newer.** Run `node --version`. If it is not installed or older than v20, install the LTS from https://nodejs.org (default options, then reopen Command Prompt).
2. **npm.** Comes with Node. Run `npm --version`; any modern version is fine.
3. **Git.** Run `git --version`. If missing, install from https://git-scm.com/download/win (default options).

You will create three free accounts as you go: Supabase (section 1), Resend (section 2), Vercel (section 3).

> **Important: create a NEW Supabase project.** Do not point LockedIn at a Supabase project that another app already uses. LockedIn creates tables with very common names (`settings`, `projects`, `tasks`, `links`, `notes` and others), and an existing project (for example your poker app project) already has tables with those names. A fresh project keeps both apps safe.

## 1. Supabase: the database

Supabase stores all of your data. The project is created by hand in the Supabase dashboard; there is no script or command that creates it for you.

1. Go to https://supabase.com and click **Start your project**. Create a free account (or sign in).
2. Click **New project** and fill in:
   - **Name:** `lockedin`
   - **Database Password:** click Generate and save the value somewhere. You rarely need it, but Supabase asks for it from time to time.
   - **Region:** pick the one closest to you.
   - Click **Create new project** and wait a minute or two.
3. Run the schema: in the left sidebar click **SQL Editor**, then **New query**.
4. Get the schema text: in another Chrome tab, open https://github.com/dennycrafter/LockedIn/blob/main/supabase/schema.sql and click the **Copy raw file** button (or open the Raw view, select all, copy).
5. Back in Supabase, paste the text into the SQL editor and click **Run**. It should say **Success**. This creates 15 tables and one default settings row.
   - If you ever run it a second time, it shows "already exists" errors. That is harmless: it means the schema is already in place.
   - Later releases can ship extra change files under `supabase/migrations` (numbered). If a release note says "needs running on real Supabase", paste and run those files in the SQL editor too, in number order. See `supabase/README.md`.
6. Copy the two values you will need in section 3. Click **Project Settings** (the gear icon) > **API**:
   - **Project URL**: a link like `https://xxxx.supabase.co`. This becomes `SUPABASE_URL`.
   - **API keys > service_role > secret key**: click Reveal and copy. This becomes `SUPABASE_SERVICE_ROLE_KEY`. Treat it like a master key: never share it, never put it in a website or the extension.
   - The same page shows an **anon / public** key. LockedIn never uses it: your browser never talks to Supabase, only the LockedIn server does, and it uses the service_role key. Nothing to copy there.
7. Keep the project active: free Supabase projects pause after 7 days with no requests. The keepalive cron you set up in section 3 pings the database once a day so this should never happen. If you ever see database errors, log in at https://supabase.com and check whether the project tile says **Paused**; click **Restore**.

## 2. Resend: the report email

Resend sends the end of day report. On the free plan, without a verified domain, Resend only delivers email to the address you signed up with. That is why the signup email matters.

1. Go to https://resend.com and sign up. **Use the exact email address where you want your reports to arrive** (for example `you@gmail.com`).
2. Confirm your email address if Resend asks.
3. In the left menu click **API Keys**, then **Create API Key**. Name it `lockedin`, leave the default permission, and click Create. Copy the key (it starts with `re_`). You will paste it into Vercel in section 3.
4. Sender address: LockedIn sends from `LockedIn <onboarding@resend.dev>`. That works with no domain verification and nothing to set up here. (Verifying a custom domain is optional and not part of this setup.)
5. Free limits: 100 emails per day, 3,000 per month. The end of day report uses one email per day.

## 3. Vercel: deploy the dashboard

The dashboard is the Next.js app in the `web` folder of this repo. Vercel hosts it for free.

1. Go to https://vercel.com and sign in with your GitHub account (the one that can see this repository).
2. Click **Add New** > **Project**, find `dennycrafter/LockedIn` and click **Import**.
3. On the configure screen:
   - **Framework Preset:** Next.js (picked automatically).
   - **Root Directory:** click **Edit** and set it to `web`. This matters; the repo has two projects in it and only `web` is the website.
   - Leave everything else at the defaults.
4. Open the **Environment Variables** section on the same screen and add all nine names from this table. Leave all environment checkboxes (Production, Preview, Development) ticked for each.

   To make the two secrets, run this in Command Prompt. Every run prints a new value. Run it once for `SESSION_SECRET` and again for `CRON_SECRET`:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   | Name | Value |
   |---|---|
   | `APP_PASSWORD` | Pick your dashboard password. At least 12 characters. You type this on the login screen. |
   | `SESSION_SECRET` | One generator output above (64 hex characters) |
   | `SUPABASE_URL` | The Supabase Project URL from section 1, step 6 |
   | `SUPABASE_SERVICE_ROLE_KEY` | The service_role secret key from section 1, step 6 |
   | `RESEND_API_KEY` | The `re_` key from section 2 |
   | `REPORT_TO_EMAIL` | The email you signed up to Resend with (section 2) |
   | `REPORT_FROM_EMAIL` | `LockedIn <onboarding@resend.dev>` (exactly this, including the name part) |
   | `CRON_SECRET` | A second generator output above (64 hex characters) |
   | `ANTHROPIC_API_KEY` | Leave empty for now. Used by the AI helpers (section 6). |

   Where the code reads each variable, so the table can be checked against the app at any time:

   | Name | Read by |
   |---|---|
   | `APP_PASSWORD` | `web/src/app/api/login/route.ts` |
   | `SESSION_SECRET` | `web/src/app/api/login/route.ts`, `web/src/middleware.ts`, `web/src/lib/require-user.ts` |
   | `SUPABASE_URL` | `web/src/lib/supabase.ts` |
   | `SUPABASE_SERVICE_ROLE_KEY` | `web/src/lib/supabase.ts` |
   | `RESEND_API_KEY` | `web/src/app/api/eod/route.ts`, `web/src/app/api/health/route.ts` |
   | `REPORT_TO_EMAIL` | `web/src/app/api/eod/route.ts` |
   | `REPORT_FROM_EMAIL` | `web/src/app/api/eod/route.ts` |
   | `CRON_SECRET` | `web/src/app/api/cron/keepalive/route.ts` |
   | `ANTHROPIC_API_KEY` | `web/src/app/api/health/route.ts` (and the AI helper flows once enabled) |

5. Click **Deploy** and wait for it to finish (a couple of minutes).
6. First login: open the URL Vercel shows (something like `https://lockedin-xxxx.vercel.app`). You should see the LockedIn login screen. Sign in with your `APP_PASSWORD`.
7. Check the health endpoint: while logged in, open `https://YOUR-URL/api/health`. You should see something like:
   ```json
   { "supabase": "OK", "resend": "KEY_FORMAT_OK", "anthropic": "NOT_SET" }
   ```
   `anthropic: NOT_SET` is expected until section 6. If `supabase` is not OK, re-check the two Supabase variables and redeploy.
8. **The keepalive cron.** It is registered automatically from `web/vercel.json` in the repo; there is nothing to click. Verify it: Vercel > your project > **Settings** > **Cron Jobs** should list `/api/cron/keepalive` with schedule `0 12 * * *` (daily at 12:00 UTC, early morning in Chicago).
   - When Vercel triggers it, the request carries the header `Authorization: Bearer YOUR-CRON-SECRET`. The route rejects every other caller with 401, so nobody else can ping your database.
   - Optional manual check from Command Prompt (Windows 10 and 11 include `curl`):
     ```
     curl -s https://YOUR-URL.vercel.app/api/cron/keepalive
     ```
     should print `{"error":"Unauthorized"}`. Then:
     ```
     curl -s -H "Authorization: Bearer YOUR-CRON-SECRET" https://YOUR-URL.vercel.app/api/cron/keepalive
     ```
     should print `{"ok":true}`.

## 4. The Chrome extension

The extension enforces site blocking, shows the floating timer on every tab, and reports back to the dashboard.

1. Get the code. In Command Prompt:
   ```
   git clone https://github.com/dennycrafter/LockedIn.git
   cd LockedIn\extension
   ```
   (No Git? On the GitHub page click **Code** > **Download ZIP**, unzip it, then `cd` into the unzipped `LockedIn-main\extension` folder instead.)
2. Build it:
   ```
   npm install
   npm run build
   ```
   The build writes the finished extension to `extension\dist` and then runs a validation check on the output. It finishes with no errors when everything is good.
3. Load it in Chrome:
   1. Open `chrome://extensions`
   2. Turn on **Developer mode** (toggle, top right).
   3. Click **Load unpacked** and select the `LockedIn\extension\dist` folder.
4. What to verify:
   - The **LockedIn** card appears with no red errors (version 0.1.0).
   - Click the puzzle piece icon and pin LockedIn.
   - Click the LockedIn icon. The popup opens and says "Extension running". Paste your dashboard URL (the Vercel URL from section 3, including `https://` and no trailing slash) and click **Save**. It should say **Saved.**. A wrong input shows the example URL hint instead.
   - Click **Open dashboard** in the popup: your dashboard opens in a new tab.
   - On the dashboard, the top bar shows a green dot with **Extension connected** within a few seconds. Amber "Extension not connected" means the URL does not match; see section 7.
5. Updating later: when a new version ships, run `git pull`, then `npm install` and `npm run build` again, then click the reload icon on the LockedIn card in `chrome://extensions`.

## 5. Local development

For making changes or checking the app on your own machine.

1. Get the code and install both projects:
   ```
   git clone https://github.com/dennycrafter/LockedIn.git
   cd LockedIn\web
   npm install
   cd ..\extension
   npm install
   ```
2. Give the dashboard its settings: in the `web` folder run `copy .env.example .env` (Command Prompt), then fill in the same values you used on Vercel in section 3. Locally, `APP_PASSWORD` can be anything you like. The `.env` file is git-ignored and never committed; `web/.env.example` is the tracked template with empty values.
3. Run the dashboard:
   ```
   npm run dev
   ```
   Open http://localhost:3000 and log in with your local `APP_PASSWORD`.
4. Commands. Run them inside the folder shown:

   | Folder | Command | What it does |
   |---|---|---|
   | `web` | `npm run dev` | Starts the dashboard on http://localhost:3000 |
   | `web` | `npm run lint` | ESLint checks |
   | `web` | `npm test` | Unit tests (Vitest) |
   | `web` | `npm run build` | Production build |
   | `extension` | `npm run build` | Builds `extension/dist` and validates it |
   | `extension` | `npm run typecheck` | TypeScript check, writes nothing |
   | `extension` | `npm test` | Unit tests (Vitest) |
   | `extension` | `npm run watch` | Rebuilds `dist` on every save while developing |

5. What CI runs on every pull request: web lint, web tests, web build; extension build with dist validation. Run the same locally before pushing. (`npm ci` installs the exact locked dependency versions, which is what CI uses; `npm install` is fine for everyday use.)

## 6. Turning on AI helpers

1. Create an API key at https://console.anthropic.com > **API Keys** (it starts with `sk-ant-`). This is the only paid piece of LockedIn; light use costs a few cents per day.
2. In Vercel > your project > **Settings** > **Environment Variables**, add `ANTHROPIC_API_KEY` with that key.
3. Redeploy: Vercel > **Deployments** > the latest one > **Redeploy**. Environment variable changes only take effect after a redeploy.
4. On the dashboard, open the profile menu and switch **Helper mode** to AI. Until the key is set, `/api/health` reports `anthropic: NOT_SET` and the toggle is not usable.

## 7. Troubleshooting

- **"Wrong password" but you are sure it is right.** Check `APP_PASSWORD` in Vercel > Settings > Environment Variables. After changing it you must redeploy. Careful: 5 wrong attempts within 10 minutes locks that browser out for 10 minutes ("Too many attempts"). Wait it out.
- **"Server is missing SESSION_SECRET" when logging in.** The variable is not set in Vercel. Add it (section 3, step 4) and redeploy.
- **Database errors, or `/api/health` does not show `supabase: OK`.** The Supabase project may be paused (log in at supabase.com, click Restore) or the `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` values are wrong. Fix them in Vercel and redeploy.
- **Running `supabase/schema.sql` again shows "already exists" errors.** Harmless. The tables are already there.
- **EOD email fails with 403.** Resend only delivers to the signup email until a domain is verified: `REPORT_TO_EMAIL` must be the exact email you signed up to Resend with.
- **EOD fails with a "from" error.** `REPORT_FROM_EMAIL` must be exactly `LockedIn <onboarding@resend.dev>`.
- **Extension shows "not connected" (amber dot) or "Extension not connected".** In the extension popup, the Dashboard URL must match your Vercel URL exactly, including `https://` and with no trailing slash. After saving, reload the dashboard tab. Chrome may also need a moment after a fresh load; if it stays amber, use the reload icon on the LockedIn card in `chrome://extensions`.
- **Cron did not run.** Check Vercel > Settings > Cron Jobs lists `/api/cron/keepalive`, and use the curl check in section 3, step 8 to test the secret.
- **Data gone after a break.** If the Supabase project was paused, restore it; data is kept while paused.
- **Nothing else helped.** Open an issue at https://github.com/dennycrafter/LockedIn/issues

## 8. What lives where

- **Everything that matters is in Supabase:** projects, tasks, notes, sessions, infractions, plans, reports. Clearing your browser does not touch it.
- **On each device** stay only small conveniences: the extension's Dashboard URL and floating timer position, and dashboard preferences like collapsed panels and your last duration and lock mode.
- **The extension queue** holds finished sessions and captured snippets for a short time, until the dashboard syncs them into Supabase.
