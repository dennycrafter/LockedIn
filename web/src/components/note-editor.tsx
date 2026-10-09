"use client";

// Note editor (SPEC 8.7): a plain textarea over the whole note body. The
// first line of the body is the title, so the editor never separates them;
// the panel and pop out derive the label from the body. Saves 800ms after
// typing stops, flushes a pending save when the note changes or unmounts,
// and adopts server state when the note prop changes (two-way sync with the
// pop out: whoever refocuses refetches).
//
// When attach targets are provided, selecting text shows a small "+" near
// the selection; it opens the attach picker modal.

import { useEffect, useRef, useState } from "react";
import { createAutosave } from "@/lib/autosave";
import type { ProjectData } from "@/lib/dashboard-data";
import type { NoteData } from "@/lib/notes";
import { AttachSnippetModal, type SnippetAttach } from "./attach-snippet-modal";

interface SelectionSpot {
  text: string;
  x: number;
  y: number;
}

export function NoteEditor({
  note,
  onSave,
  onSaved,
  label,
  attach,
}: {
  note: NoteData;
  onSave: (body: string) => Promise<boolean>;
  onSaved?: (note: NoteData) => void;
  label: string;
  attach?: {
    projects: ProjectData[];
    onAdded: (attach: SnippetAttach) => void;
  };
}) {
  const [body, setBody] = useState(note.body);
  const [spot, setSpot] = useState<SelectionSpot | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const savedRef = useRef(note.body);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const boxRef = useRef<HTMLTextAreaElement>(null);

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

  // The "+" reads the textarea selection; coords come from the pointer for
  // mouse selections and from the box corner for keyboard selections.
  const readSelection = (x: number, y: number): void => {
    const box = boxRef.current;
    if (!box) return;
    const selected = box.value.slice(box.selectionStart, box.selectionEnd).trim();
    if (selected === "") {
      setSpot(null);
      return;
    }
    setSpot({ text: selected, x, y });
  };

  const lines = body.split("\n").length;
  const showAttachButton = Boolean(attach) && spot !== null && !attachOpen;

  return (
    <div className="relative">
      <textarea
        ref={boxRef}
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          autosaveRef.current?.keystroke();
        }}
        onBlur={() => void saveNow()}
        onMouseUp={(event) => readSelection(event.clientX, event.clientY)}
        onKeyUp={(event) => {
          // Keyboard selections (shift + arrows) have no pointer coords.
          if (event.shiftKey) {
            const rect = boxRef.current?.getBoundingClientRect();
            if (rect) readSelection(rect.right - 40, rect.top - 12);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setSpot(null);
        }}
        rows={Math.min(24, Math.max(6, lines + 1))}
        placeholder="Type a note. The first line becomes the title."
        aria-label={label}
        className="w-full resize-y rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm leading-relaxed text-[var(--fg)] placeholder:text-[var(--muted)]"
      />

      {showAttachButton && attach && spot && (
        <button
          type="button"
          aria-label="Attach selection to a task"
          title="Attach selection to a task"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setAttachOpen(true)}
          className="fixed z-30 h-7 w-7 rounded-md border border-[var(--line)] bg-[var(--surface-2)] text-sm text-[var(--fg)] shadow-[0_6px_16px_rgba(0,0,0,0.3)] hover:border-[var(--accent-ink)]"
          style={{ left: Math.max(4, spot.x + 8), top: Math.max(4, spot.y + 10) }}
        >
          +
        </button>
      )}

      {attachOpen && attach && spot && (
        <AttachSnippetModal
          projects={attach.projects}
          content={spot.text}
          onAdded={(snippet) => {
            setAttachOpen(false);
            setSpot(null);
            attach.onAdded(snippet);
          }}
          onClose={() => {
            setAttachOpen(false);
            setSpot(null);
          }}
        />
      )}
    </div>
  );
}
