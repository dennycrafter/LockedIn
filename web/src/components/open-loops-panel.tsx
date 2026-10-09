"use client";

// Open loops and decisions panel (SPEC 8.8): two capture buttons, two lists
// with counts and delete, total saved count in the header, collapsible, the
// five unload prompts, and the one-line explainer. Collapsed state is a
// per-device choice kept in localStorage (SPEC 10 design rules).
import { useState } from "react";
import type { OpenLoopData } from "@/lib/dashboard-data";
import { OPEN_LOOP_EXPLAINER, UNLOAD_PROMPTS, decisionCount, loopCount, totalSavedCount } from "@/lib/open-loops";

const COLLAPSED_KEY = "lockedin-open-loops-collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function persistCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Private mode or storage full: collapse state just does not persist.
  }
}

function LoopList({
  heading,
  count,
  items,
  onDelete,
  emptyText,
}: {
  heading: string;
  count: number;
  items: OpenLoopData[];
  onDelete: (id: string) => void;
  emptyText: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {heading} ({count})
      </h3>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-[var(--muted)]">{emptyText}</p>
      ) : (
        <ul className="mt-1 rounded-md border border-[var(--line)]">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2 last:border-b-0"
            >
              <span className="min-w-0 text-sm text-[var(--fg)]">{item.text}</span>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                aria-label={`Delete ${heading === "Decisions" ? "decision" : "open loop"}: ${item.text}`}
                className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--bad)]"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OpenLoopsPanel({
  loops,
  onCreate,
  onDelete,
}: {
  loops: OpenLoopData[];
  onCreate: (kind: "loop" | "decision", text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [showPrompts, setShowPrompts] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);

  const loopsOnly = loops.filter((item) => item.kind === "loop");
  const decisionsOnly = loops.filter((item) => item.kind === "decision");

  const add = (kind: "loop" | "decision") => {
    const text = draft.trim();
    if (!text) return;
    onCreate(kind, text);
    setDraft("");
  };

  return (
    <section
      aria-label="Open loops and decisions"
      className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setCollapsed(!collapsed);
            persistCollapsed(!collapsed);
          }}
          aria-expanded={!collapsed}
          className="flex items-center gap-2 text-base font-semibold text-[var(--fg)]"
        >
          <span aria-hidden className="text-[var(--muted)]">
            {collapsed ? "+" : "-"}
          </span>
          Open loops
        </button>
        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs text-[var(--muted)]">
          {totalSavedCount(loops)} saved ({loopCount(loops)} loops, {decisionCount(loops)} decisions)
        </span>
      </div>

      {!collapsed && (
        <div className="mt-3 space-y-3">
          <button
            type="button"
            onClick={() => setShowExplainer(!showExplainer)}
            aria-expanded={showExplainer}
            className="text-xs text-[var(--muted)] underline decoration-dotted hover:text-[var(--fg)]"
          >
            What&apos;s an open loop?
          </button>
          {showExplainer && <p className="text-sm text-[var(--muted)]">{OPEN_LOOP_EXPLAINER}</p>}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              add("loop");
            }}
            className="space-y-2"
          >
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Park it here, one line"
              aria-label="New open loop or decision"
              className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
              >
                Add open loop
              </button>
              <button
                type="button"
                onClick={() => add("decision")}
                className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
              >
                Decision I need to make
              </button>
            </div>
          </form>

          <button
            type="button"
            onClick={() => setShowPrompts(!showPrompts)}
            aria-expanded={showPrompts}
            className="text-xs text-[var(--muted)] underline decoration-dotted hover:text-[var(--fg)]"
          >
            Prompt questions to unload your brain
          </button>
          {showPrompts && (
            <ul className="space-y-1 rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3 text-sm text-[var(--muted)]">
              {UNLOAD_PROMPTS.map((prompt) => (
                <li key={prompt}>{prompt}</li>
              ))}
            </ul>
          )}

          <LoopList
            heading="Open loops"
            count={loopCount(loops)}
            items={loopsOnly}
            onDelete={onDelete}
            emptyText="No open loops yet."
          />
          <LoopList
            heading="Decisions"
            count={decisionCount(loops)}
            items={decisionsOnly}
            onDelete={onDelete}
            emptyText="No decisions waiting."
          />
        </div>
      )}
    </section>
  );
}
