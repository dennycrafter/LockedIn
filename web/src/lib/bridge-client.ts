// Dashboard side of the extension bridge (SPEC 4, SPEC 8.17): posts
// { source: "lockedin-dashboard", id, method, payload } and resolves with the
// matching { source: "lockedin-extension", id, payload } reply. The content
// script enforces the origin checks; this side matches replies by id and
// times out so a missing extension can never hang the dashboard.

export type BridgeResponse = { ok: true; data?: unknown } | { ok: false; error: string };

const DEFAULT_TIMEOUT_MS = 8000;

interface ExtensionReply {
  source?: string;
  id?: unknown;
  payload?: BridgeResponse;
}

export function callExtension(
  method: string,
  payload?: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<BridgeResponse> {
  const id = nextId();
  return new Promise<BridgeResponse>((resolve) => {
    let settled = false;

    const finish = (response: BridgeResponse) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(response);
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        error: "The extension did not answer. Is it installed and pointing at this URL?",
      });
    }, timeoutMs);

    const onMessage = (event: MessageEvent) => {
      const reply = event.data as ExtensionReply | null;
      if (!reply || reply.source !== "lockedin-extension" || reply.id !== id) return;
      if (reply.payload && typeof reply.payload === "object" && "ok" in reply.payload) {
        finish(reply.payload);
      } else {
        finish({ ok: false, error: "The extension sent a malformed reply." });
      }
    };

    window.addEventListener("message", onMessage);
    // Same-window post: targetOrigin pins delivery to this dashboard origin.
    window.postMessage({ source: "lockedin-dashboard", id, method, payload }, window.location.origin);
  });
}

let counter = 0;
function nextId(): number {
  counter += 1;
  return counter;
}
