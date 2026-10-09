# LockedIn

One place to get focused work done: pick a task, start a timer, and LockedIn blocks distracting sites until the timer ends, then logs the time against that task.

New here? Every step with full detail is in [SETUP.md](SETUP.md). This README is the short version.

## 1. What LockedIn is

1. A password protected dashboard with projects, tasks, notes and a focus timer.
2. A Chrome extension that blocks distracting sites during sessions, shows a floating timer, and counts infractions.
3. A nightly wind down that plans tomorrow, plus an end of day email report.

## 2. One-time setup

About 30 minutes on a Windows PC. Full detail in [SETUP.md](SETUP.md), sections 0 to 3.

1. Install Node.js LTS from https://nodejs.org (default options).
2. Create a NEW Supabase project (do not reuse a project from another app), run `supabase/schema.sql` in its SQL Editor, then copy the Project URL and the service_role key.
3. Sign up at https://resend.com with the email where reports should arrive, then create an API key (starts with `re_`).
4. Import this repo on Vercel as a new project with Root Directory `web`, add the nine environment variables (table in [SETUP.md](SETUP.md)), and deploy. The daily keepalive cron registers itself from `web/vercel.json`.
5. Open the Vercel URL, sign in with your `APP_PASSWORD`, and check `https://YOUR-URL/api/health` shows `"supabase": "OK"`.

## 3. Install the extension on Windows

Full detail in [SETUP.md](SETUP.md), section 4.

1. In Command Prompt:
   ```
   git clone https://github.com/dennycrafter/LockedIn.git
   cd LockedIn\extension
   npm install
   npm run build
   ```
2. Chrome > `chrome://extensions` > Developer mode on > Load unpacked > pick `LockedIn\extension\dist`.
3. Click the LockedIn icon, paste your dashboard URL, click Save. It should say "Saved.".
4. On the dashboard, the top bar should show a green dot, "Extension connected".

## 4. Daily use

- Morning: open the dashboard, click Start working, pick a task, run a 25 minute hard lock session.
- During the day: jot notes, park open loops and decisions, add misc tasks, use I'm stuck when a task won't start.
- Evening: run the wind down to answer the review questions and plan tomorrow's task list, then click Send EOD to email yourself the day's report.

## 5. Turning on AI helpers

1. Create an API key at https://console.anthropic.com > API Keys (starts with `sk-ant-`). This is the only paid piece; light use costs a few cents per day.
2. In Vercel > your project > Settings > Environment Variables, add `ANTHROPIC_API_KEY` with that key, then redeploy (Vercel > Deployments > the latest one > Redeploy).
3. On the dashboard, open the profile menu and switch Helper mode to AI. If you do not see Helper mode yet, it arrives with the AI helpers update.

## 6. Not working?

- **Extension says not connected.** Click the LockedIn icon and check the Dashboard URL matches your Vercel URL exactly (including https:// and no trailing slash). Then reload the dashboard tab.
- **EOD email fails with 403.** `REPORT_TO_EMAIL` must be the email address you signed up to Resend with.
- **Database errors.** Your free Supabase project may have paused after 7 days with no requests. Open https://supabase.com, select your project, click Restore. The daily keepalive cron prevents this once it runs.
- **Locked out after wrong passwords.** 5 wrong attempts in 10 minutes locks that browser out for 10 minutes. Wait it out and try again.
- More causes and fixes: [SETUP.md](SETUP.md), section 7.

## 7. For developers

Local development, the full command list and what CI runs: [SETUP.md](SETUP.md), section 5. The environment variable table and where the code reads each one: [SETUP.md](SETUP.md), section 3.
