// Block page (SPEC 8.5): shows which site is blocked and the session time
// left, queues a site infraction on load, and offers "Back to my task" to
// open the dashboard. The infraction is written straight into the queue in
// chrome.storage.local; nothing is deleted until the dashboard's ackQueue
// confirms the save.

import { enqueueInfraction } from "./lib/queue";
import { getActiveSession, getQueue, setQueue } from "./lib/storage";

function clock(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mmss = `${minutes}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${mmss.padStart(5, "0")}` : mmss;
}

async function queueSiteInfraction(site: string): Promise<void> {
  const [queue, session] = await Promise.all([getQueue(), getActiveSession()]);
  const infraction = {
    id: crypto.randomUUID(),
    sessionId: session?.id ?? null,
    kind: "site" as const,
    detail: site,
    occurredAt: new Date().toISOString(),
  };
  await setQueue(enqueueInfraction(queue, infraction));
}

async function showTimeLeft(): Promise<void> {
  const el = document.getElementById("time-left");
  if (!el) return;
  const session = await getActiveSession();
  if (!session || session.pausedAtMs !== null) {
    el.textContent = session ? "paused" : "0:00";
    return;
  }
  el.textContent = clock(session.endAtMs - Date.now());
}

async function openDashboard(): Promise<void> {
  const stored = await chrome.storage.local.get("dashboardOrigin");
  const origin = (stored.dashboardOrigin as string | undefined) ?? "";
  if (origin) await chrome.tabs.create({ url: origin });
}

async function init(): Promise<void> {
  const site = new URLSearchParams(window.location.search).get("site") ?? "this site";
  const siteEl = document.getElementById("site");
  if (siteEl) siteEl.textContent = site;

  await queueSiteInfraction(site);
  await showTimeLeft();
  setInterval(() => {
    void showTimeLeft();
  }, 1000);

  document.getElementById("back-to-task")?.addEventListener("click", () => {
    void openDashboard();
  });
}

void init();
