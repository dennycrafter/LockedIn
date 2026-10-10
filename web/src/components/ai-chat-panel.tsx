"use client";

// AI chat panel shared by both helper modals (SPEC 8.15, T8-UI): a transcript
// plus input that talks to /api/ai through lib/ai-client. Enforces the 12
// message cap in the UI (input disabled with a notice, a fresh conversation
// to keep going), renders typed failures inline with a retry that keeps the
// transcript, and always offers "Switch to scripted". Action buttons for an
// actionable reply (a ranked list, or the 5 minute start marker) belong to
// the owning modal, which supplies them through renderActions for the most
// recent actionable assistant entry. Presentation only: one accent main
// action, thin dividers, aria labels, no em dashes.

import { useRef, useState } from "react";
import { MAX_CONVERSATION_MESSAGES } from "@/lib/ai/conversation";
import type { AiContext, AiFlow, AiMessage, RankedItem } from "@/lib/ai/types";
import { organizeChatText, sendAiChat } from "@/lib/ai-client";

export type AiChatEntry =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; ranked: RankedItem[]; start5min: boolean };

export type ActionableAiEntry = Extract<AiChatEntry, { role: "assistant" }>;

const INPUT =
  "min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] disabled:opacity-50";

const ACCENT_BUTTON = "rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

const SECONDARY_BUTTON =
  "rounded-md border border-[var(--line)] px-4 py-2 text-sm text-[var(--fg)] hover:border-[var(--muted)] disabled:opacity-50";

function isActionable(entry: AiChatEntry): entry is ActionableAiEntry {
  return entry.role === "assistant" && (entry.ranked.length > 0 || entry.start5min);
}

function RankedTable({ items }: { items: RankedItem[] }) {
  return (
    <ol aria-label="AI ranked list" className="mt-2 rounded-md border border-[var(--line)]">
      {items.map((item, index) => (
        <li key={`${index}-${item.title}`} className="border-b border-[var(--line)] px-3 py-2 last:border-b-0">
          <span className="block text-sm text-[var(--fg)]">
            #{index + 1} {item.title}
          </span>
          {item.reason !== "" && <span className="block text-xs text-[var(--muted)]">{item.reason}</span>}
        </li>
      ))}
    </ol>
  );
}

export function AiChatPanel({
  flow,
  context,
  introText,
  sendLabel,
  renderActions,
  onSwitchToScripted,
}: {
  flow: AiFlow;
  context: AiContext;
  /** Shown while the transcript is empty. */
  introText: string;
  /** Visible label on the input, per flow, e.g. "Message the AI coach". */
  sendLabel: string;
  /**
   * Buttons for the most recent actionable assistant reply. Returning null
   * means the reply has nothing to act on and Send stays the accent action.
   */
  renderActions?: (entry: ActionableAiEntry) => React.ReactNode;
  onSwitchToScripted: () => void;
}) {
  const [entries, setEntries] = useState<AiChatEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const nextIdRef = useRef(0);
  const nextId = () => `ai-chat-${nextIdRef.current++}`;

  const capped = entries.length >= MAX_CONVERSATION_MESSAGES;

  const request = async (messages: AiMessage[]) => {
    setBusy(true);
    setError(null);
    const result = await sendAiChat({ flow, messages, context });
    if (result.ok) {
      setEntries((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: result.flow === "organize" ? organizeChatText(result.reply) : result.reply,
          ranked: result.flow === "organize" ? result.ranked : [],
          start5min: result.flow === "stuck" ? result.start5min : false,
        },
      ]);
    } else {
      // The transcript (including the failed user message) stays untouched so
      // a retry resends exactly the same conversation.
      setError({ code: result.code, message: result.message });
    }
    setBusy(false);
  };

  const sendNew = () => {
    const text = draft.trim();
    if (text === "" || busy || capped) return;
    setDraft("");
    const userEntry: AiChatEntry = { id: nextId(), role: "user", content: text };
    setEntries((prev) => [...prev, userEntry]);
    void request([
      ...entries.map(({ role, content }) => ({ role, content }) as AiMessage),
      { role: "user", content: text },
    ]);
  };

  const retry = () => {
    if (busy || entries.length === 0) return;
    void request(entries.map(({ role, content }) => ({ role, content }) as AiMessage));
  };

  const startNewConversation = () => {
    setEntries([]);
    setError(null);
    setDraft("");
  };

  const lastActionable = [...entries].reverse().find(isActionable) ?? null;
  const actionsNode = lastActionable && renderActions ? renderActions(lastActionable) : null;

  return (
    <div>
      <ol
        aria-label="AI conversation"
        aria-live="polite"
        className="mt-3 max-h-64 overflow-y-auto rounded-md border border-[var(--line)]"
      >
        {entries.length === 0 && <li className="px-3 py-3 text-sm text-[var(--muted)]">{introText}</li>}
        {entries.map((entry) => (
          <li key={entry.id} className="border-b border-[var(--line)] px-3 py-2 last:border-b-0">
            <span className="block text-[10px] uppercase tracking-wide text-[var(--muted)]">
              {entry.role === "user" ? "You" : "AI coach"}
            </span>
            {entry.content !== "" && <p className="whitespace-pre-wrap text-sm text-[var(--fg)]">{entry.content}</p>}
            {entry.role === "assistant" && entry.ranked.length > 0 && <RankedTable items={entry.ranked} />}
            {entry.id === lastActionable?.id && actionsNode}
          </li>
        ))}
        {busy && <li className="px-3 py-2 text-xs text-[var(--muted)]">Thinking...</li>}
      </ol>

      {error && (
        <div role="alert" className="mt-2">
          <p className="text-sm text-[var(--bad)]">{error.message}</p>
          <div className="mt-2 flex gap-3">
            <button type="button" onClick={retry} disabled={busy || entries.length === 0} className={SECONDARY_BUTTON}>
              Try again
            </button>
            <button
              type="button"
              onClick={onSwitchToScripted}
              className="text-sm text-[var(--muted)] hover:text-[var(--fg)]"
            >
              Switch to scripted
            </button>
          </div>
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          sendNew();
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={capped || busy}
          aria-label={sendLabel}
          placeholder="Type your reply"
          className={INPUT}
        />
        <button
          type="submit"
          disabled={draft.trim() === "" || capped || busy}
          className={actionsNode ? SECONDARY_BUTTON : ACCENT_BUTTON}
          style={actionsNode ? undefined : { background: "var(--accent)" }}
        >
          Send
        </button>
      </form>

      {capped && (
        <div className="mt-2" role="status">
          <p className="text-xs text-[var(--muted)]">
            12 message limit reached in this conversation. Start a new conversation to keep going.
          </p>
          <button
            type="button"
            onClick={startNewConversation}
            className="mt-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
          >
            Start a new conversation
          </button>
        </div>
      )}

      <div className="mt-3">
        <button type="button" onClick={onSwitchToScripted} className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">
          Switch to scripted
        </button>
      </div>
    </div>
  );
}
