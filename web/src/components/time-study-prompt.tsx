"use client";

// In-dashboard time study prompt (SPEC 8.11): when the extension's alarm
// fires, getState carries a pending prompt and this card appears over the
// dashboard. Saving queues the answer in the extension (flushed by the sync
// cycle); dismissing hides just this prompt instance.
import { useEffect, useState } from "react";

const DISMISSED_KEY = "lockedin-dismissed-time-study-prompts";

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function persistDismissed(ids: string[]) {
  try {
    // Keep the list bounded: only recent dismissals matter.
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-20)));
  } catch {
    // Storage unavailable: the prompt simply reappears on reload.
  }
}

export function TimeStudyPromptCard({
  prompt,
  onSave,
  saving,
  error,
}: {
  prompt: { id: string };
  onSave: (text: string) => void;
  saving: boolean;
  error: string | null;
}) {
  const [dismissedIds, setDismissedIds] = useState<string[]>(readDismissed);
  const [draft, setDraft] = useState("");
  const dismissed = dismissedIds.includes(prompt.id);

  // Read once per mounted prompt; ids are unique per check-in.
  useEffect(() => {
    setDismissedIds(readDismissed());
  }, [prompt.id]);

  if (dismissed) return null;

  const dismiss = () => {
    const next = [...dismissedIds, prompt.id];
    setDismissedIds(next);
    persistDismissed(next);
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || saving) return;
    onSave(text);
    setDraft("");
  };

  return (
    <div
      role="dialog"
      aria-label="Time study check-in"
      className="fixed bottom-16 left-4 z-40 w-72 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4 shadow-[0_6px_16px_rgba(0,0,0,0.3)]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[var(--fg)]">What are you doing right now?</p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss time study prompt"
          className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--fg)]"
        >
          Dismiss
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="mt-2 space-y-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="e.g. Writing the report"
          aria-label="What are you doing right now"
          autoFocus
          className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]"
        />
        {error && <p className="text-xs text-[var(--bad)]">{error}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || draft.trim() === ""}
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
