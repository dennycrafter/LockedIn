"use client";

// Item notes (SPEC 8.7): a quiet "+ Add a note" line that becomes a growing
// textarea and saves on blur. Below the box, dated snippets newest first.
// Shared by projects, tasks and subtasks.

import { useEffect, useRef, useState } from "react";
import type { SnippetData } from "@/lib/dashboard-data";

function formatDate(createdAt: string): string {
  // Dates are per-item labels, not day boundaries; browser-local rendering of
  // the stored instant is fine for a single-user dashboard.
  const date = new Date(createdAt);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ItemNotes({
  notes,
  snippets,
  ownerLabel,
  onSave,
}: {
  notes: string;
  snippets: SnippetData[];
  ownerLabel: string;
  onSave: (notes: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(notes);
  }, [notes]);

  useEffect(() => {
    if (editing) boxRef.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <div className="mt-1">
        {notes.trim() === "" ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-left text-xs text-[var(--muted)] hover:text-[var(--fg)]"
          >
            + Add a note
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit notes on ${ownerLabel}`}
            className="block w-full whitespace-pre-wrap rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-left text-xs text-[var(--silver)] hover:border-[var(--muted)]"
          >
            {notes}
          </button>
        )}
        {snippets.length > 0 && (
          <ul className="mt-2 space-y-1.5" aria-label={`Snippets on ${ownerLabel}`}>
            {snippets.map((snippet) => (
              <li key={snippet.id} className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs">
                <span className="whitespace-pre-wrap text-[var(--fg)]">{snippet.content}</span>
                {snippet.context.trim() !== "" && (
                  <span className="mt-0.5 block break-words text-[var(--muted)]">{snippet.context}</span>
                )}
                <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  {formatDate(snippet.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <textarea
      ref={boxRef}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== notes) onSave(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setDraft(notes);
          setEditing(false);
        }
      }}
      rows={Math.min(10, Math.max(2, draft.split("\n").length))}
      placeholder="Type a note for this item"
      aria-label={`Notes on ${ownerLabel}`}
      className="mt-1 w-full resize-y rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--fg)] placeholder:text-[var(--muted)]"
    />
  );
}
