"use client";

// Pop out editor (SPEC 8.7): the same NoteEditor as the dashboard panel in
// its own small window. Loads one note, autosaves through the shared editor,
// and refetches on window focus so edits sync both ways between this window
// and the dashboard (whoever refocuses refetches).

import { useCallback, useEffect, useState } from "react";
import type { DashboardData } from "@/lib/dashboard-data";
import type { NoteData } from "@/lib/notes";
import { noteDisplayTitle } from "@/lib/notes";
import { NoteEditor } from "./note-editor";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; note: NoteData; projects: DashboardData["projects"] }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export function PopoutEditor({ noteId }: { noteId: string | null }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const loadNote = useCallback(async () => {
    if (!noteId) {
      setState({ kind: "missing" });
      return;
    }
    try {
      // One fetch each for the note and the picker tree; the pop out is a
      // small window, so both are small and the dashboard pushes a fresh
      // tree on every change.
      const [noteResponse, treeResponse] = await Promise.all([
        fetch(`/api/notes/${noteId}`, { cache: "no-store" }),
        fetch("/api/dashboard-data", { cache: "no-store" }),
      ]);
      if (noteResponse.status === 404) {
        setState({ kind: "missing" });
        return;
      }
      const notePayload = (await noteResponse.json().catch(() => ({}))) as {
        note?: NoteData;
        error?: string;
      };
      if (!noteResponse.ok || !notePayload.note) {
        setState({ kind: "error", message: notePayload.error ?? `Loading the note failed (${noteResponse.status})` });
        return;
      }
      let projects: DashboardData["projects"] = [];
      if (treeResponse.ok) {
        const treePayload = (await treeResponse.json().catch(() => ({}))) as Partial<DashboardData>;
        projects = treePayload.projects ?? [];
      }
      setState({ kind: "ready", note: notePayload.note, projects });
    } catch {
      setState({ kind: "error", message: "Network request failed." });
    }
  }, [noteId]);

  useEffect(() => {
    void loadNote();
  }, [loadNote]);

  // Two-way sync: an edit in the dashboard panel lands in the database, and
  // refocusing this window adopts it (and vice versa on the dashboard).
  // Alt+Tab fires "focus"; tab switches fire "visibilitychange", so both.
  useEffect(() => {
    const onFocus = () => {
      void loadNote();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadNote();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadNote]);

  useEffect(() => {
    if (state.kind === "ready") {
      document.title = `${noteDisplayTitle(state.note.body)} - LockedIn`;
    }
  }, [state]);

  const saveNote = useCallback(
    async (body: string): Promise<boolean> => {
      if (!noteId) return false;
      try {
        const response = await fetch(`/api/notes/${noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    [noteId],
  );

  if (state.kind === "loading") {
    return <p className="p-4 text-sm text-[var(--muted)]">Loading note...</p>;
  }
  if (state.kind === "missing") {
    return <p className="p-4 text-sm text-[var(--muted)]">This note no longer exists.</p>;
  }
  if (state.kind === "error") {
    return <p className="p-4 text-sm text-[var(--bad)]">{state.message}</p>;
  }

  return (
    <div className="flex h-screen min-h-0 flex-col gap-2 p-3">
      <h1 className="truncate text-sm font-semibold text-[var(--fg)]">{noteDisplayTitle(state.note.body)}</h1>
      <NoteEditor
        note={state.note}
        onSave={saveNote}
        label="Pop out note"
        attach={{
          projects: state.projects,
          onAdded: (snippet) => {
            void fetch("/api/snippets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(snippet),
            });
          },
        }}
      />
    </div>
  );
}
