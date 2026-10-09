"use client";

// Simple Notes panel (SPEC 8.7): a list of notes in one box with thin
// dividers, a pencil button that creates one, autosave through NoteEditor,
// and delete with confirm on the open note. Rows keep their place while
// editing because the list is ordered by creation, not by edit time.

import { useCallback, useEffect, useState } from "react";
import type { NoteData } from "@/lib/notes";
import { noteDisplayTitle, notePreview } from "@/lib/notes";
import { NoteEditor } from "./note-editor";

function updatedLabel(note: NoteData): string {
  const date = new Date(note.updated_at);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotesPanel() {
  const [notes, setNotes] = useState<NoteData[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    try {
      const response = await fetch("/api/notes", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { notes?: NoteData[]; error?: string };
      if (!response.ok) {
        setError(payload.error ?? `Loading notes failed (${response.status})`);
        return;
      }
      setError(null);
      setNotes(payload.notes ?? []);
    } catch {
      setError("Network request failed.");
    }
  }, []);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  const selected = notes?.find((note) => note.id === selectedId) ?? null;

  const createNote = async () => {
    setError(null);
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "" }),
      });
      const payload = (await response.json().catch(() => ({}))) as { note?: NoteData; error?: string };
      if (!response.ok || !payload.note) {
        setError(payload.error ?? `Creating the note failed (${response.status})`);
        return;
      }
      const note = payload.note;
      setNotes((prev) => [note, ...(prev ?? [])]);
      setSelectedId(note.id);
    } catch {
      setError("Network request failed.");
    }
  };

  const saveNote = useCallback(
    async (body: string): Promise<boolean> => {
      if (!selectedId) return false;
      try {
        const response = await fetch(`/api/notes/${selectedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        if (response.ok) return true;
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? `Saving the note failed (${response.status})`);
        return false;
      } catch {
        setError("Network request failed.");
        return false;
      }
    },
    [selectedId],
  );

  const deleteSelected = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete note "${noteDisplayTitle(selected.body)}"?`)) return;
    setError(null);
    try {
      const response = await fetch(`/api/notes/${selected.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? `Deleting the note failed (${response.status})`);
        return;
      }
      setNotes((prev) => (prev ?? []).filter((note) => note.id !== selected.id));
      setSelectedId(null);
    } catch {
      setError("Network request failed.");
    }
  };

  return (
    <section aria-label="Simple Notes" className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--fg)]">Simple Notes</h2>
        <button
          type="button"
          onClick={() => void createNote()}
          disabled={notes === null}
          aria-label="New note"
          title="New note"
          className="rounded-md px-2 py-1 text-base text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] disabled:opacity-40"
        >
          ✎
        </button>
      </div>

      {error && <p className="mb-2 text-xs text-[var(--bad)]">{error}</p>}

      {notes === null ? (
        <p className="py-2 text-xs text-[var(--muted)]">Loading notes...</p>
      ) : notes.length === 0 ? (
        <p className="py-2 text-xs text-[var(--muted)]">No notes yet. The pencil starts one.</p>
      ) : (
        <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-md border border-[var(--line)]">
          {notes.map((note) => {
            const isSelected = note.id === selectedId;
            return (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(note.id)}
                  aria-pressed={isSelected}
                  className={`block w-full px-3 py-2 text-left hover:bg-[var(--surface-2)] ${
                    isSelected ? "bg-[var(--surface-2)]" : ""
                  }`}
                >
                  <span className="block truncate text-sm text-[var(--fg)]">{noteDisplayTitle(note.body)}</span>
                  <span className="mt-0.5 flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--muted)]">
                      {notePreview(note.body) || " "}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      {updatedLabel(note)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <div className="mt-3">
          <NoteEditor note={selected} onSave={saveNote} label={`Edit note ${noteDisplayTitle(selected.body)}`} />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => void deleteSelected()}
              className="rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)] hover:border-[var(--bad)] hover:text-[var(--bad)]"
            >
              Delete note
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
