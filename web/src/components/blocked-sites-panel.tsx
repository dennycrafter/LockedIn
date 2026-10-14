"use client";

// Blocked sites editor (SPEC 8.5): add by domain or full URL, Social media
// pack, remove. The server normalizes to bare hostnames; changes are pushed
// to the extension through the bridge by the parent.
import { useState } from "react";
import type { BlockedSiteData } from "@/lib/dashboard-data";
import { PlusIcon, TrashIcon } from "./icons";
import { BTN_ICON, BTN_QUIET, BTN_SECONDARY, INPUT_BOX } from "./ui";

export function BlockedSitesPanel({
  sites,
  onAdd,
  onAddSocialPack,
  onDelete,
  error,
  bare = false,
}: {
  sites: BlockedSiteData[];
  onAdd: (input: string) => void;
  onAddSocialPack: () => void;
  onDelete: (id: string) => void;
  error: string | null;
  /** True inside a window that already has a title and border. */
  bare?: boolean;
}) {
  const [draft, setDraft] = useState("");

  return (
    <section
      aria-label="Edit blocked sites"
      className={bare ? "" : "rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"}
    >
      {!bare && <h2 className="text-base font-semibold text-[var(--fg)]">Edit blocked sites</h2>}
      <p className={`${bare ? "" : "mt-1 "}text-[13px] text-[var(--muted)]`}>
        Full URL or bare domain. Blocking covers the domain and all subdomains.
      </p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const input = draft.trim();
          if (input) {
            onAdd(input);
            setDraft("");
          }
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="e.g. youtube.com"
          aria-label="Site to block"
          className={`${INPUT_BOX} flex-1`}
        />
        <button type="submit" disabled={draft.trim() === ""} className={BTN_SECONDARY}>
          Add
        </button>
      </form>

      <button
        type="button"
        onClick={onAddSocialPack}
        className={`${BTN_QUIET} -ml-2 mt-1`}
      >
        <PlusIcon size={14} />
        Add the social media pack
      </button>

      {error && <p className="mt-2 text-sm text-[var(--bad)]">{error}</p>}

      {sites.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Nothing blocked yet.</p>
      ) : (
        <ul className="mt-3 overflow-hidden rounded-md border border-[var(--line)]">
          {sites.map((site) => (
            <li
              key={site.id}
              className="lockedin-row flex items-center justify-between gap-2 border-b border-[var(--line)] py-1 pl-3 pr-1 last:border-b-0"
            >
              <span className="truncate text-sm text-[var(--fg)]">{site.domain}</span>
              <button
                type="button"
                onClick={() => onDelete(site.id)}
                aria-label={`Stop blocking ${site.domain}`}
                title="Stop blocking"
                className={`${BTN_ICON} lockedin-on-hover hover:text-[var(--bad)]`}
              >
                <TrashIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
