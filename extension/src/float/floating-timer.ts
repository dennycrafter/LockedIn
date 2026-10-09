// Floating timer widget (SPEC 8.6, SPEC 10): a 220px draggable box rendered in
// a Shadow DOM so host page styles cannot touch it and ours cannot leak out.
// Pure presentation: the content script polls getState and hands snapshots in.
import { clampPosition } from "../lib/float-state";
import { formatCountdown, remainingMs, type ActiveSession } from "../lib/session";

export interface FloatSnapshot {
  session: ActiveSession | null;
  softUnlockAtMs: number | null;
  visible: boolean;
  position: { x: number; y: number } | null;
}

export interface FloatCallbacks {
  onPauseResume: (paused: boolean) => void;
  onAddTime: (seconds: number) => void;
  onHide: () => void;
  onPersistPosition: (position: { x: number; y: number }) => void;
  onAddInfraction: (text: string) => Promise<{ ok: boolean; error?: string }>;
}

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.box {
  position: fixed;
  z-index: 2147483647;
  width: 220px;
  background: #1c1c20;
  border: 1px solid #2a2a30;
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(0,0,0,.3);
  color: #f2f2f4;
  font-family: -apple-system, "Segoe UI", Inter, system-ui, sans-serif;
  font-size: 13px;
}
.header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid #2a2a30;
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.header .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #9a9aa3; }
.digits {
  padding: 8px 12px 2px;
  font-family: "Saira", -apple-system, "Segoe UI", Inter, system-ui, sans-serif;
  font-size: 34px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.meta { padding: 0 12px 6px; }
.pill { display: inline-block; border-radius: 9999px; padding: 1px 8px; font-size: 11px; }
.controls { display: flex; gap: 6px; padding: 4px 8px 8px; }
.controls button {
  background: transparent;
  border: 1px solid #2a2a30;
  border-radius: 6px;
  color: #f2f2f4;
  cursor: pointer;
  font: inherit;
  padding: 3px 8px;
}
.controls button:hover { border-color: #9a9aa3; }
.header button { border: none; background: transparent; color: #9a9aa3; cursor: pointer; font: inherit; padding: 0 4px; }
.warn { color: #ffb547; }
.infraction { display: flex; gap: 6px; padding: 0 8px 8px; }
.infraction input {
  flex: 1;
  min-width: 0;
  background: #0b0b0d;
  border: 1px solid #2a2a30;
  border-radius: 6px;
  color: #f2f2f4;
  font: inherit;
  padding: 3px 8px;
}
.infraction button {
  background: transparent;
  border: 1px solid #2a2a30;
  border-radius: 6px;
  color: #f2f2f4;
  cursor: pointer;
  font: inherit;
  padding: 3px 8px;
}
.feedback { color: #ffb547; font-size: 11px; padding: 0 12px 6px; display: none; }
`;

function lockPill(lockMode: ActiveSession["lockMode"]): { background: string; color: string } {
  if (lockMode === "hard") return { background: "rgba(255,111,102,.18)", color: "#ff6f66" };
  if (lockMode === "soft") return { background: "rgba(255,181,71,.18)", color: "#ffb547" };
  return { background: "rgba(106,184,255,.18)", color: "#6ab8ff" };
}

export function createFloatingTimer(
  doc: Document,
  callbacks: FloatCallbacks,
): { update(snapshot: FloatSnapshot): void; dispose(): void } {
  const host = doc.createElement("div");
  host.id = "lockedin-float-host";
  host.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = STYLE;
  shadow.appendChild(style);

  const box = doc.createElement("div");
  box.className = "box";
  box.style.display = "none";
  shadow.appendChild(box);

  const name = doc.createElement("div");
  name.className = "name";
  const hide = doc.createElement("button");
  hide.type = "button";
  hide.textContent = "×";
  hide.setAttribute("aria-label", "Hide the floating timer for this session");
  const header = doc.createElement("div");
  header.className = "header";
  header.append(name, hide);

  const digits = doc.createElement("div");
  digits.className = "digits";
  digits.setAttribute("role", "timer");

  const pill = doc.createElement("span");
  pill.className = "pill";
  const meta = doc.createElement("div");
  meta.className = "meta";
  meta.appendChild(pill);

  const pauseResume = doc.createElement("button");
  pauseResume.type = "button";
  const plus5 = doc.createElement("button");
  plus5.type = "button";
  plus5.textContent = "+5";
  plus5.setAttribute("aria-label", "Add five minutes");
  const minus5 = doc.createElement("button");
  minus5.type = "button";
  minus5.textContent = "-5";
  minus5.setAttribute("aria-label", "Remove five minutes of added time");
  const controls = doc.createElement("div");
  controls.className = "controls";
  controls.append(pauseResume, plus5, minus5);

  const infractionInput = doc.createElement("input");
  infractionInput.type = "text";
  infractionInput.placeholder = "Got distracted by...";
  infractionInput.setAttribute("aria-label", "What distracted you");
  const infractionAdd = doc.createElement("button");
  infractionAdd.type = "button";
  infractionAdd.textContent = "Add";
  infractionAdd.setAttribute("aria-label", "Record the manual infraction");
  const infractionRow = doc.createElement("div");
  infractionRow.className = "infraction";
  infractionRow.append(infractionInput, infractionAdd);

  const feedback = doc.createElement("div");
  feedback.className = "feedback";

  box.append(header, digits, meta, controls, infractionRow, feedback);
  doc.documentElement.appendChild(host);

  pauseResume.addEventListener("click", () => {
    callbacks.onPauseResume(box.dataset.paused === "true");
  });
  plus5.addEventListener("click", () => callbacks.onAddTime(300));
  minus5.addEventListener("click", () => callbacks.onAddTime(-300));
  hide.addEventListener("click", () => callbacks.onHide());
  infractionAdd.addEventListener("click", async () => {
    const text = infractionInput.value.trim();
    if (text === "") return;
    const reply = await callbacks.onAddInfraction(text);
    if (reply.ok) {
      infractionInput.value = "";
      feedback.style.display = "none";
    } else {
      feedback.textContent = reply.error ?? "Could not save it.";
      feedback.style.display = "block";
    }
  });
  infractionInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void infractionAdd.click();
    }
  });

  // Drag by the header; movement and the final position are clamped to the
  // viewport, and the position is persisted on release (SPEC 8.6).
  let dragOffset: { dx: number; dy: number } | null = null;
  header.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Element) || event.target === hide) return;
    const rect = box.getBoundingClientRect();
    dragOffset = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener("pointermove", (event) => {
    if (!dragOffset) return;
    const next = clampPosition(
      { x: event.clientX - dragOffset.dx, y: event.clientY - dragOffset.dy },
      { width: window.innerWidth, height: window.innerHeight },
      { width: box.offsetWidth, height: box.offsetHeight },
    );
    box.style.left = `${next.x}px`;
    box.style.top = `${next.y}px`;
  });
  const endDrag = (event: PointerEvent) => {
    const offset = dragOffset;
    if (!offset) return;
    dragOffset = null;
    const next = clampPosition(
      { x: event.clientX - offset.dx, y: event.clientY - offset.dy },
      { width: window.innerWidth, height: window.innerHeight },
      { width: box.offsetWidth, height: box.offsetHeight },
    );
    box.style.left = `${next.x}px`;
    box.style.top = `${next.y}px`;
    callbacks.onPersistPosition(next);
  };
  header.addEventListener("pointerup", endDrag);
  header.addEventListener("pointercancel", endDrag);

  let placed = false;

  return {
    update(snapshot: FloatSnapshot): void {
      const { session, softUnlockAtMs, visible, position } = snapshot;
      if (!visible || !session) {
        box.style.display = "none";
        return;
      }
      if (!placed || box.style.display === "none") {
        // First show in this session: restore the remembered position.
        placed = true;
        const next = position ?? { x: window.innerWidth - 220 - 16, y: window.innerHeight - 120 };
        box.style.left = `${next.x}px`;
        box.style.top = `${next.y}px`;
      }
      box.style.display = "block";
      name.textContent = session.label || "Focus session";
      const paused = session.pausedAtMs !== null;
      const ending = softUnlockAtMs !== null;
      box.dataset.paused = String(paused);
      digits.textContent = ending
        ? formatCountdown(Math.max(0, softUnlockAtMs - Date.now()))
        : formatCountdown(remainingMs(session, Date.now()));
      digits.classList.toggle("warn", paused || ending);
      const colors = lockPill(session.lockMode);
      pill.textContent = ending ? "ending" : session.lockMode;
      pill.style.background = colors.background;
      pill.style.color = colors.color;
      pauseResume.textContent = paused ? "Resume" : "Pause";
      pauseResume.setAttribute("aria-label", paused ? "Resume the session" : "Pause the session");
    },
    dispose(): void {
      host.remove();
    },
  };
}
