"use client";

// In-dashboard time study prompt (SPEC 8.11): when the extension's alarm
// fires, getState carries a pending prompt and this card appears over the
// dashboard. Saving queues the answer in the extension (flushed by the sync
// cycle); dismissing hides just this prompt instance.
import { useEffect, useState } from "react";
import { CloseIcon } from "./icons";
import { BTN_ICON, BTN_SECONDARY, INPUT_BOX } from "./ui";

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
      className="fixed bottom-5 right-5 z-40 w-[min(20rem,calc(100vw-40px))] rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4 shadow-[var(--shadow)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Time study check-in</p>
          <p className="mt-0.5 text-sm font-medium text-[var(--fg)]">What are you doing right now?</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss time study prompt" title="Dismiss" className={`${BTN_ICON} -mr-2 -mt-2`}>
          <CloseIcon />
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="e.g. Writing the report"
          aria-label="What are you doing right now"
          autoFocus
          className={`${INPUT_BOX} flex-1`}
        />
        <button type="submit" disabled={saving || draft.trim() === ""} className={BTN_SECONDARY}>
          {saving ? "Saving..." : "Save"}
        </button>
      </form>
      {error && <p className="mt-2 text-[13px] text-[var(--bad)]">{error}</p>}
    </div>
  );
}
