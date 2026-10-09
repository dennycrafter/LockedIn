"use client";

// Blocked sites editor (SPEC 8.5): add by domain or full URL, Social media
// pack, remove. The server normalizes to bare hostnames; changes are pushed
// to the extension through the bridge by the parent.
import { useState } from "react";
import type { BlockedSiteData } from "@/lib/dashboard-data";

export function BlockedSitesPanel({
  sites,
  onAdd,
  onAddSocialPack,
  onDelete,
  error,
}: {
  sites: BlockedSiteData[];
  onAdd: (input: string) => void;
  onAddSocialPack: () => void;
  onDelete: (id: string) => void;
  error: string | null;
}) {
  const [draft, setDraft] = useState("");

  return (
    <section aria-label="Edit blocked sites" className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <h2 className="text-base font-semibold text-[var(--fg)]">Edit blocked sites</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
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
          placeholder="youtube.com"
          aria-label="Site to block"
          className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]"
        />
        <button
          type="submit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
        >
          Add
        </button>
      </form>

      <button
        type="button"
        onClick={onAddSocialPack}
        className="mt-2 rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
      >
        Social media pack
      </button>

      {error && <p className="mt-2 text-sm text-[var(--bad)]">{error}</p>}

      {sites.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Nothing blocked yet.</p>
      ) : (
        <ul className="mt-3">
          {sites.map((site) => (
            <li key={site.id} className="flex items-center justify-between border-b border-[var(--line)] py-2 last:border-b-0">
              <span className="truncate text-sm text-[var(--fg)]">{site.domain}</span>
              <button
                type="button"
                onClick={() => onDelete(site.id)}
                aria-label={`Stop blocking ${site.domain}`}
                className="text-xs text-[var(--muted)] hover:text-[var(--bad)]"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
