"use client";

// Board tab (Oct 2026): a full-screen whiteboard for ideas, directions and
// long-term plays, so planning is not only lists. Loads the newer of the
// server copy and this browser's backup, then saves every change: to this
// browser right away, to the database a moment after you stop.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { pickNewerBoard, readLocalBoard, writeLocalBoard, type BoardScene, type SavedBoard } from "@/lib/board";
import { useTheme } from "./theme-toggle";

const BoardCanvas = dynamic(() => import("./board-canvas"), {
  ssr: false,
  loading: () => <BoardLoading />,
});

const SERVER_SAVE_DELAY_MS = 1500;
const LOCAL_SAVE_DELAY_MS = 300;

type SaveState = "saved" | "saving" | "local-only" | "error";

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; initial: BoardScene | null; notice: string | null };

export function BoardView() {
  const theme = useTheme();
  const [load, setLoad] = useState<LoadState>({ phase: "loading" });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  // A problem worth reading (migration not run, board too big) shows once as
  // a small card until dismissed; the dot in the corner keeps the status.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeShown = useRef(false);
  const showNotice = useCallback((message: string) => {
    if (noticeShown.current) return;
    noticeShown.current = true;
    setNotice(message);
  }, []);

  const lastSignature = useRef<string | null>(null);
  const pending = useRef<BoardScene | null>(null);
  const serverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load once: server copy and local backup, newer wins.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = readLocalBoard();
      let server: SavedBoard | null = null;
      let notice: string | null = null;
      try {
        const response = await fetch("/api/board", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { board?: SavedBoard | null; error?: string };
        if (response.ok) server = payload.board ?? null;
        else notice = payload.error ?? `Could not load the board (${response.status}).`;
      } catch {
        notice = "Could not reach the server. Showing the copy saved in this browser.";
      }
      if (cancelled) return;
      const winner = pickNewerBoard(server, local);
      setLoad({ phase: "ready", initial: winner?.scene ?? null, notice });
      if (notice) {
        setSaveState("local-only");
        setSaveError(notice);
        showNotice(notice);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showNotice]);

  const saveToServer = useCallback(async () => {
    const scene = pending.current;
    if (!scene) return;
    pending.current = null;
    try {
      const response = await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene }),
      });
      if (response.ok) {
        // Something newer may have queued while this one was in flight.
        if (!pending.current) {
          setSaveState("saved");
          setSaveError(null);
        }
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      const message = payload.error ?? `Save failed (${response.status}).`;
      setSaveState(response.status === 400 ? "error" : "local-only");
      setSaveError(message);
      if (response.status === 400 || response.status === 503) showNotice(message);
    } catch {
      setSaveState("local-only");
      setSaveError("Offline. Saved in this browser; it will sync on your next change.");
    }
  }, [showNotice]);

  const handleChange = useCallback(
    (scene: BoardScene, signature: string) => {
      // The first onChange is Excalidraw reporting what it just loaded.
      if (lastSignature.current === null) {
        lastSignature.current = signature;
        return;
      }
      if (signature === lastSignature.current) return;
      lastSignature.current = signature;
      pending.current = scene;
      setSaveState("saving");

      if (localTimer.current) clearTimeout(localTimer.current);
      localTimer.current = setTimeout(() => {
        writeLocalBoard({ scene, savedAt: new Date().toISOString() });
      }, LOCAL_SAVE_DELAY_MS);

      if (serverTimer.current) clearTimeout(serverTimer.current);
      serverTimer.current = setTimeout(() => void saveToServer(), SERVER_SAVE_DELAY_MS);
    },
    [saveToServer],
  );

  // Leaving the tab or closing the page mid-wait still saves.
  useEffect(() => {
    const flush = () => {
      const scene = pending.current;
      if (!scene) return;
      writeLocalBoard({ scene, savedAt: new Date().toISOString() });
      const body = JSON.stringify({ scene });
      // keepalive requests are capped at 64 KB; bigger boards rely on the local copy.
      if (body.length < 60_000) {
        void fetch("/api/board", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => undefined);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      if (serverTimer.current) clearTimeout(serverTimer.current);
      if (localTimer.current) clearTimeout(localTimer.current);
      flush();
    };
  }, []);

  if (load.phase === "loading") return <BoardLoading />;

  return (
    <div className="lockedin-board relative h-[calc(100dvh-57px)] w-full sm:h-[calc(100dvh-65px)]">
      <BoardCanvas
        initial={load.initial}
        theme={theme}
        onChange={handleChange}
        status={<SaveStatus state={saveState} error={saveError} />}
      />
      {notice && (
        <div
          role="alert"
          className="absolute bottom-20 left-1/2 z-10 flex w-[min(30rem,calc(100vw-32px))] -translate-x-1/2 items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--fg)] shadow-[var(--shadow)]"
        >
          <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--warn)]" />
          <span className="min-w-0 flex-1">
            {notice} Your board is kept in this browser meanwhile.
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setNotice(null)}
            className="-m-1 shrink-0 rounded-md px-2 py-1 text-[var(--muted)] hover:bg-[var(--line)] hover:text-[var(--fg)]"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function SaveStatus({ state, error }: { state: SaveState; error: string | null }) {
  const dot =
    state === "saved" ? "var(--ok)" : state === "saving" ? "var(--muted)" : state === "local-only" ? "var(--warn)" : "var(--bad)";
  const text =
    state === "saved"
      ? "Saved"
      : state === "saving"
        ? "Saving..."
        : state === "local-only"
          ? "Saved in this browser only"
          : "Not saved";
  return (
    <span
      role="status"
      title={error ?? undefined}
      className="flex h-9 items-center gap-2 whitespace-nowrap px-1 text-[13px] text-[var(--muted)]"
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
      <span className="hidden sm:inline">{text}</span>
    </span>
  );
}

function BoardLoading() {
  return (
    <div className="flex h-[calc(100dvh-57px)] w-full items-center justify-center text-sm text-[var(--muted)] sm:h-[calc(100dvh-65px)]">
      Loading board...
    </div>
  );
}
