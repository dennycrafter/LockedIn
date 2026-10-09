# LockedIn

One place to get focused work done: pick a task, start a timer, and LockedIn blocks distracting sites until the timer ends, then logs the time against that task.

## 1. What LockedIn is

1. A password protected dashboard with projects, tasks, notes and a focus timer.
2. A Chrome extension that blocks distracting sites during sessions, shows a floating timer, and counts infractions.
3. A nightly wind down that plans tomorrow, plus an end of day email report.

## 2. One-time setup

These steps take about 20 minutes. You will create three free accounts (Supabase, Resend, Vercel) and add a handful of settings.

### 2.1 Install Node.js

1. On your Windows PC, open https://nodejs.org in Chrome.
2. Download the LTS installer and run it, accepting the defaults.
3. Open Command Prompt (press the Windows key, type cmd, press Enter) and type:
   ```
   node --version
   ```
   Press Enter. You should see something like v22.x.x. If yes, Node is ready.

### 2.2 Create the database (Supabase)

1. Go to https://supabase.com and click Start your project. Create a free account.
2. Click New project. Name it lockedin, pick a region close to you, and set a database password (you will not need to remember it, but write it down anyway).
3. When the project is ready, click SQL Editor in the left menu, then New query.
4. In a new Chrome tab, open https://github.com/dennycrafter/LockedIn/blob/main/supabase/schema.sql
5. Click the Copy raw file button (or open the Raw view, then select all and copy).
6. Back in Supabase, paste the copied text into the SQL editor and click Run. It should say Success.
7. Click Project Settings (gear icon) > API. Leave this page open, you will copy two values from it in step 2.4:
   - Project URL
   - the service_role secret key (keep this one private, it is like a master key)

### 2.3 Create the email sender (Resend)

1. Go to https://resend.com and sign up. Important: use the exact email address where you want your end of day reports to arrive. Until a domain is verified, Resend only delivers to this address.
2. Click API Keys > Create API Key, name it lockedin, and copy the key. It starts with re_.

### 2.4 Deploy the dashboard (Vercel)

1. Go to https://vercel.com and sign in with your GitHub account.
2. Click Add New > Project, then Import the LockedIn repository.
3. Under Root Directory, enter: web
4. Open Settings > Environment Variables and add these nine names. Generate the two secrets with the command shown (run it in Command Prompt; every run gives a new value):

   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   | Name | Value |
   |---|---|
   | APP_PASSWORD | Pick your dashboard password. At least 12 characters. |
   | SESSION_SECRET | Run the command above and paste the result |
   | SUPABASE_URL | The Project URL from step 2.2 |
   | SUPABASE_SERVICE_ROLE_KEY | The service_role secret key from step 2.2 |
   | RESEND_API_KEY | The re_ key from step 2.3 |
   | REPORT_TO_EMAIL | The email you used for Resend in step 2.3 |
   | REPORT_FROM_EMAIL | LockedIn <onboarding@resend.dev> |
   | CRON_SECRET | Run the command above again and paste the new result |
   | ANTHROPIC_API_KEY | Leave empty for now (used for AI helpers, section 4) |

5. Click Deploy and wait for it to finish. Open the URL. You should see the LockedIn password screen. Sign in with APP_PASSWORD.
6. Check the cron: Vercel > your project > Settings > Cron Jobs should list /api/cron/keepalive at 0 12 * * * (daily at noon UTC). This keeps the free Supabase database from pausing.

### 2.5 Install the Chrome extension

1. In Command Prompt, download the project and build the extension:
   ```
   git clone https://github.com/dennycrafter/LockedIn.git
   cd LockedIn\extension
   npm install
   npm run build
   ```
2. Open Chrome and go to chrome://extensions
3. Turn on Developer mode (toggle, top right).
4. Click Load unpacked and select the LockedIn\extension\dist folder.
5. The extension should appear with no errors. Click the puzzle piece icon and pin LockedIn.
6. Click the LockedIn icon, paste your dashboard URL (the Vercel URL from step 2.4), and click Save. (The URL field arrives in the next extension update, ticket T1.)

## 3. Daily use

This section describes the full app. Anything not in your dashboard yet arrives as later updates ship.

- Morning: open the dashboard, click Start working, pick a task, run a 25 minute hard lock session.
- During the day: jot notes, park open loops and decisions, add misc tasks, use I'm stuck when a task won't start.
- Evening: run the wind down to answer three quick questions and plan tomorrow's task list, then click Send EOD to email yourself the day's report.

## 4. Turning on AI helpers

1. Create an API key at https://console.anthropic.com > API Keys (starts with sk-ant-). This is the only paid piece; usage costs a few cents per day at most.
2. In Vercel > your project > Settings > Environment Variables, add ANTHROPIC_API_KEY with that key.
3. Redeploy the project (Vercel > Deployments > pick the latest > Redeploy).
4. On the dashboard, open the profile menu and switch Helper mode to AI.

## 5. Not working?

- Extension says not connected: click the LockedIn icon and check the Dashboard URL matches your Vercel URL exactly (including https:// and no trailing slash).
- EOD email fails with 403: REPORT_TO_EMAIL must be the email address you signed up to Resend with.
- Dashboard shows errors about the database: your free Supabase project may have paused after a week of no requests. Open https://supabase.com, select your project, and click Restore. The daily keepalive cron prevents this once it runs.
- Wrong password five times: login locks that browser for 10 minutes. Wait it out, then try again.
- Anything else: open an issue at https://github.com/dennycrafter/LockedIn/issues
