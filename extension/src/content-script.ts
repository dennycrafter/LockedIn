// LockedIn content script (SPEC 4, SPEC 8.6): on the saved dashboard origin
// it relays window.postMessage calls to the service worker; on every other
// page it runs the floating timer, polling extension state every second. The
// relay answers only when event.origin matches the saved dashboard origin AND
// event.source is this same window, so no other page can talk to the
// extension.
import { createFloatingTimer, type FloatSnapshot } from "./float/floating-timer";
import { shouldShowFloat } from "./lib/float-state";
import type { ActiveSession } from "./lib/session";

interface DashboardCall {
  source?: string;
  id?: unknown;
  method?: unknown;
  payload?: unknown;
}

interface WorkerState {
  session?: ActiveSession | null;
  softUnlockAt?: number | null;
  floatEnabled?: boolean;
}

async function sendWorker(method: string, payload?: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    return (await chrome.runtime.sendMessage({ type: "bridge", method, payload })) as {
      ok: boolean;
      data?: unknown;
      error?: string;
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Extension error" };
  }
}

async function initRelay(origin: string): Promise<void> {
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== origin || event.source !== window) return;
    const data = event.data as DashboardCall | null;
    if (!data || data.source !== "lockedin-dashboard") return;
    if (typeof data.id !== "number" || typeof data.method !== "string") return;
    void forward(data.id, data.method, data.payload, origin);
  });
}

async function forward(id: number, method: string, payload: unknown, origin: string): Promise<void> {
  const response = await sendWorker(method, payload);
  window.postMessage({ source: "lockedin-extension", id, payload: response }, origin);
}

// The float: poll state once a second, show/hide per the pure decision, wire
// the buttons to bridge methods, remember drag position and hide per session.
async function initFloat(): Promise<void> {
  const float = createFloatingTimer(document, {
    onPauseResume: (paused) => void sendWorker(paused ? "resume" : "pause"),
    onAddTime: (seconds) => void sendWorker("addTime", { seconds }),
    onHide: async () => {
      const reply = await sendWorker("getState");
      const session = reply.ok ? (reply.data as WorkerState | undefined)?.session : undefined;
      if (session) await chrome.storage.local.set({ floatHiddenFor: session.id });
    },
    onPersistPosition: (position) => void chrome.storage.local.set({ floatPosition: position }),
    onAddInfraction: (text) => sendWorker("addManualInfraction", { text }),
  });

  const tick = async (): Promise<void> => {
    const [origin, position, hiddenFor] = await Promise.all([
      chrome.storage.local
        .get("dashboardOrigin")
        .then((bag) => (bag.dashboardOrigin as string | undefined) ?? null),
      chrome.storage.local
        .get("floatPosition")
        .then((bag) => (bag.floatPosition as { x: number; y: number } | undefined) ?? null),
      chrome.storage.local
        .get("floatHiddenFor")
        .then((bag) => (bag.floatHiddenFor as string | undefined) ?? null),
    ]);
    const reply = await sendWorker("getState");
    const state = reply.ok ? (reply.data as WorkerState | undefined) : undefined;
    const snapshot: FloatSnapshot = {
      session: state?.session ?? null,
      softUnlockAtMs: state?.softUnlockAt ?? null,
      visible: shouldShowFloat({
        session: state?.session ?? null,
        floatEnabled: state?.floatEnabled ?? true,
        isDashboardOrigin: origin !== null && window.location.origin === origin,
        hiddenForSessionId: hiddenFor,
      }),
      position,
    };
    float.update(snapshot);
  };

  poll();
  setInterval(poll, 1000);
  function poll(): void {
    void tick();
  }
}

async function init(): Promise<void> {
  const origin = (await chrome.storage.local.get("dashboardOrigin")).dashboardOrigin as string | undefined;
  if (origin && window.location.origin === origin) {
    await initRelay(origin);
    return;
  }
  await initFloat();
}

void init();
