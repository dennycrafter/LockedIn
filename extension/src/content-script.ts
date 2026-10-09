// LockedIn content script (SPEC 4, SPEC 12): on the saved dashboard origin it
// relays window.postMessage calls to the service worker; on every other page
// it only draws the floating timer, which arrives in T3. The relay answers
// only when event.origin matches the saved dashboard origin AND event.source
// is this same window, so no other page can talk to the extension.

interface DashboardCall {
  source?: string;
  id?: unknown;
  method?: unknown;
  payload?: unknown;
}

async function init(): Promise<void> {
  const origin = (await chrome.storage.local.get("dashboardOrigin")).dashboardOrigin as
    | string
    | undefined;
  if (!origin || window.location.origin !== origin) return;

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== origin || event.source !== window) return;
    const data = event.data as DashboardCall | null;
    if (!data || data.source !== "lockedin-dashboard") return;
    if (typeof data.id !== "number" || typeof data.method !== "string") return;
    void forward(data.id, data.method, data.payload, origin);
  });
}

async function forward(id: number, method: string, payload: unknown, origin: string): Promise<void> {
  let response: unknown;
  try {
    response = await chrome.runtime.sendMessage({ type: "bridge", method, payload });
  } catch (error) {
    response = { ok: false, error: error instanceof Error ? error.message : "Extension error" };
  }
  window.postMessage({ source: "lockedin-extension", id, payload: response }, origin);
}

void init();
