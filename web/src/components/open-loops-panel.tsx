"use client";

// Open loops and decisions panel (SPEC 8.8): two capture buttons, two lists
// with counts and delete, total saved count in the header, collapsible, the
// five unload prompts, and the one-line explainer. Collapsed state is a
// per-device choice kept in localStorage (SPEC 10 design rules).
// UI polish (Oct 2026): one input with a Loop / Decision switch instead of two
// big buttons, the explainer and prompts behind one help button, and rows that
// show their delete icon on hover.
import { useState } from "react";
import type { OpenLoopData } from "@/lib/dashboard-data";
import { OPEN_LOOP_EXPLAINER, UNLOAD_PROMPTS, decisionCount, loopCount } from "@/lib/open-loops";
import { plural } from "@/lib/ui-format";
import { ChevronIcon, HelpIcon, TrashIcon } from "./icons";
import { BTN_ICON, BTN_SECONDARY, CARD, CARD_TITLE, INPUT_BOX, SECTION_LABEL, Segmented } from "./ui";

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
  items,
  onDelete,
}: {
  heading: "Open loops" | "Decisions";
  items: OpenLoopData[];
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className={SECTION_LABEL}>
        {heading} <span className="font-normal">{items.length}</span>
      </h3>
      <ul className="mt-1 overflow-hidden rounded-md border border-[var(--line)]">
        {items.map((item) => (
          <li
            key={item.id}
            className="lockedin-row flex items-center justify-between gap-2 border-b border-[var(--line)] py-1 pl-3 pr-1 last:border-b-0"
          >
            <span className="min-w-0 break-words py-1 text-sm text-[var(--fg)]">{item.text}</span>
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              aria-label={`Delete ${heading === "Decisions" ? "decision" : "open loop"}: ${item.text}`}
              title="Delete"
              className={`${BTN_ICON} lockedin-on-hover hover:text-[var(--bad)]`}
            >
              <TrashIcon size={14} />
            </button>
          </li>
        ))}
      </ul>
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
  const [kind, setKind] = useState<"loop" | "decision">("loop");
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [helpOpen, setHelpOpen] = useState(false);

  const loopsOnly = loops.filter((item) => item.kind === "loop");
  const decisionsOnly = loops.filter((item) => item.kind === "decision");

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onCreate(kind, text);
    setDraft("");
  };

  return (
    <section aria-label="Open loops and decisions" className={CARD}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setCollapsed(!collapsed);
            persistCollapsed(!collapsed);
          }}
          aria-expanded={!collapsed}
          className={`${CARD_TITLE} -ml-1 flex items-center gap-1.5 rounded px-1`}
        >
          <ChevronIcon size={14} className={`text-[var(--muted)] transition-transform ${collapsed ? "" : "rotate-90"}`} />
          Open loops
        </button>
        <div className="-mr-1.5 flex items-center gap-1">
          <span className="text-[13px] text-[var(--muted)]">
            {plural(loopCount(loops), "loop")} · {plural(decisionCount(loops), "decision")}
          </span>
          <button
            type="button"
            onClick={() => setHelpOpen(!helpOpen)}
            aria-expanded={helpOpen}
            aria-label="What is an open loop?"
            title="What is an open loop?"
            className={BTN_ICON}
          >
            <HelpIcon />
          </button>
        </div>
      </div>

      {helpOpen && (
        <div className="mt-3 rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[13px] text-[var(--muted)]">
          <p className="text-[var(--fg)]">{OPEN_LOOP_EXPLAINER}</p>
          <p className="mt-3 text-[var(--fg)]">Stuck for what to write? Ask yourself:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {UNLOAD_PROMPTS.map((prompt) => (
              <li key={prompt}>{prompt}</li>
            ))}
          </ul>
        </div>
      )}

      {!collapsed && (
        <div className="mt-3 space-y-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
            className="flex flex-wrap gap-2"
          >
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={kind === "loop" ? "Park a loose end, one line" : "A decision you need to make"}
              aria-label="New open loop or decision"
              className={`${INPUT_BOX} min-w-[12rem] flex-1`}
            />
            <Segmented
              label="Save as"
              value={kind}
              onChange={setKind}
              options={[
                { value: "loop", label: "Loop" },
                { value: "decision", label: "Decision" },
              ]}
            />
            <button type="submit" disabled={draft.trim() === ""} className={BTN_SECONDARY}>
              Add
            </button>
          </form>

          {loops.length === 0 ? (
            <p className="text-[13px] text-[var(--muted)]">Nothing parked. Your head is clear.</p>
          ) : (
            <>
              <LoopList heading="Open loops" items={loopsOnly} onDelete={onDelete} />
              <LoopList heading="Decisions" items={decisionsOnly} onDelete={onDelete} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
