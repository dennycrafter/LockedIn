// Popup (SPEC 8.17): connection status, current session time left, the
// Dashboard URL field saved to chrome.storage.local, and an Open dashboard
// button. It talks to the service worker directly with runtime messaging.
// UI polish (Oct 2026): the URL field lives under "Settings", folded away
// once a URL is saved, so the popup leads with the timer and the button.

import { isBlocking, type LockMode } from "./lib/session";

const LOCK_LABEL: Record<LockMode, string> = { none: "No lock", soft: "Soft lock", hard: "Hard lock" };

function isLockMode(value: string): value is LockMode {
  return value === "none" || value === "soft" || value === "hard";
}

function send(method: string, payload?: unknown): Promise<unknown> {
  return chrome.runtime.sendMessage({ type: "bridge", method, payload });
}

function dataRecord(response: unknown): Record<string, unknown> | null {
  if (typeof response !== "object" || response === null) return null;
  const record = response as Record<string, unknown>;
  return record.ok === true && typeof record.data === "object" && record.data !== null
    ? (record.data as Record<string, unknown>)
    : null;
}

function clock(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mmss = `${minutes}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${mmss.padStart(5, "0")}` : mmss;
}

async function refreshState(): Promise<void> {
  const sessionBox = document.getElementById("session-box");
  const timeEl = document.getElementById("session-time");
  const labelEl = document.getElementById("session-label");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const idleText = document.getElementById("idle-text");
  if (!sessionBox || !timeEl || !labelEl || !statusDot || !statusText) return;

  const data = dataRecord(await send("getState"));
  const session = data ? (data.session as Record<string, unknown> | null) : null;
  if (session && typeof session.endAtMs === "number") {
    sessionBox.hidden = false;
    if (idleText) idleText.hidden = true;
    timeEl.textContent = clock(session.endAtMs - Date.now());
    const lockMode = typeof session.lockMode === "string" && isLockMode(session.lockMode) ? session.lockMode : null;
    const lockText = lockMode ? `${LOCK_LABEL[lockMode]}${isBlocking(lockMode) ? " on" : ""}` : "Session running";
    const label = typeof session.label === "string" && session.label !== "" ? session.label : null;
    labelEl.textContent = label ? `${label} · ${lockText}` : lockText;
  } else {
    sessionBox.hidden = true;
    if (idleText) idleText.hidden = false;
  }
  statusDot.className = "dot ok";
  statusText.textContent = "Running";
}

async function renderTimeLoop(): Promise<void> {
  await refreshState();
  setInterval(() => {
    void refreshState();
  }, 1000);
}

const originInput = document.getElementById("dashboard-url") as HTMLInputElement | null;
const saveNote = document.getElementById("save-note");

async function loadOrigin(): Promise<void> {
  if (!originInput) return;
  const stored = await chrome.storage.local.get("dashboardOrigin");
  const origin = (stored.dashboardOrigin as string | undefined) ?? "";
  originInput.value = origin;
  // First run: open Settings so the URL field is the first thing seen.
  const settings = document.getElementById("settings") as HTMLDetailsElement | null;
  if (settings) settings.open = origin === "";
}

async function saveOrigin(): Promise<void> {
  if (!originInput || !saveNote) return;
  saveNote.classList.remove("error");
  saveNote.textContent = "";
  try {
    const parsed = new URL(originInput.value.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("bad protocol");
    await chrome.storage.local.set({ dashboardOrigin: parsed.origin });
    saveNote.textContent = "Saved.";
  } catch {
    saveNote.classList.add("error");
    saveNote.textContent = "Enter the full URL, e.g. https://your-app.vercel.app";
  }
}

const openButton = document.getElementById("open-dashboard");

async function openDashboard(): Promise<void> {
  if (!openButton || !saveNote) return;
  const stored = await chrome.storage.local.get("dashboardOrigin");
  const origin = (stored.dashboardOrigin as string | undefined) ?? "";
  if (!origin) {
    saveNote.classList.add("error");
    saveNote.textContent = "Save the dashboard URL first.";
    const settings = document.getElementById("settings") as HTMLDetailsElement | null;
    if (settings) settings.open = true;
    return;
  }
  await chrome.tabs.create({ url: origin });
  window.close();
}

const saveButton = document.getElementById("save-url");

const version = document.getElementById("version");
if (version) {
  version.textContent = `v${chrome.runtime.getManifest().version}`;
}

void loadOrigin();
void renderTimeLoop();
saveButton?.addEventListener("click", () => void saveOrigin());
originInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") void saveOrigin();
});
openButton?.addEventListener("click", () => void openDashboard());
