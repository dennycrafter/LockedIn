"use client";

// Note editor (SPEC 8.7): a plain textarea over the whole note body. The
// first line of the body is the title, so the editor never separates them;
// the panel and pop out derive the label from the body. Saves 800ms after
// typing stops, flushes a pending save when the note changes or unmounts,
// and adopts server state when the note prop changes (two-way sync with the
// pop out: whoever refocuses refetches).

import { useEffect, useRef, useState } from "react";
import { createAutosave } from "@/lib/autosave";
import type { NoteData } from "@/lib/notes";

export function NoteEditor({
  note,
  onSave,
  onSaved,
  label,
}: {
  note: NoteData;
  onSave: (body: string) => Promise<boolean>;
  onSaved?: (note: NoteData) => void;
  label: string;
}) {
  const [body, setBody] = useState(note.body);
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const savedRef = useRef(note.body);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const autosaveRef = useRef<ReturnType<typeof createAutosave> | null>(null);
  if (autosaveRef.current === null) {
    autosaveRef.current = createAutosave(() => {
      void saveNow();
    });
  }

  const saveNow = async (): Promise<void> => {
    if (bodyRef.current === savedRef.current) return;
    const next = bodyRef.current;
    savedRef.current = next;
    const ok = await onSaveRef.current(next);
    if (!ok) {
      // The save failed; allow a later keystroke or flush to retry it.
      savedRef.current = note.body;
      return;
    }
    onSavedRef.current?.({ ...note, body: next, updated_at: new Date().toISOString() });
  };

  // Adopt the server body when the note switches or an outside edit arrives.
  // After my own save the bodies match, so the caret is not disturbed.
  useEffect(() => {
    setBody(note.body);
    savedRef.current = note.body;
  }, [note.id, note.body]);

  // A pending save must not die with the editor (switching notes, pop out).
  useEffect(() => {
    return () => {
      autosaveRef.current?.cancel();
      if (bodyRef.current !== savedRef.current) {
        onSaveRef.current(bodyRef.current);
      }
    };
  }, []);

  const lines = body.split("\n").length;

  return (
    <textarea
      value={body}
      onChange={(event) => {
        setBody(event.target.value);
        autosaveRef.current?.keystroke();
      }}
      onBlur={() => void saveNow()}
      rows={Math.min(24, Math.max(6, lines + 1))}
      placeholder="Type a note. The first line becomes the title."
      aria-label={label}
      className="w-full resize-y rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm leading-relaxed text-[var(--fg)] placeholder:text-[var(--muted)]"
    />
  );
}
