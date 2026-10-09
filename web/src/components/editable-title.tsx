"use client";

// Click-to-rename title for projects, tasks and subtasks (SPEC 8.2):
// Enter or blur saves, Escape cancels.

import { useEffect, useRef, useState } from "react";

export function EditableTitle({
  title,
  onRename,
  label,
  className = "",
}: {
  title: string;
  onRename: (title: string) => void;
  label: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(title);
  }, [title]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={`Rename ${label}`}
        className={`min-w-0 flex-1 truncate text-left hover:text-[var(--accent-ink)] ${className}`}
      >
        {title}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setEditing(false);
        const next = draft.trim();
        if (next !== "" && next !== title) onRename(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(title);
          setEditing(false);
        }
      }}
      aria-label={`Rename ${label}`}
      className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-0.5 text-sm text-[var(--fg)]"
    />
  );
}
