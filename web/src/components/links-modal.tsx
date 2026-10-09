"use client";

// Links modal (SPEC 8.3): existing links with open and delete, an add form
// (name + URL), and "Open all". The server normalizes the URL; this component
// only renders what is stored.

import { useState } from "react";
import type { LinkData } from "@/lib/dashboard-data";
import { Modal } from "./modal";

export function LinksModal({
  ownerLabel,
  links,
  error,
  onClose,
  onAdd,
  onDelete,
}: {
  ownerLabel: string;
  links: LinkData[];
  error: string | null;
  onClose: () => void;
  onAdd: (name: string, url: string) => void;
  onDelete: (linkId: string) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  return (
    <Modal title={`Links: ${ownerLabel}`} onClose={onClose}>
      {links.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No links yet.</p>
      ) : (
        <ul className="mb-3 divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-[var(--fg)] hover:text-[var(--accent-ink)]"
                title={link.url}
              >
                {link.name}
              </a>
              <button
                type="button"
                onClick={() => onDelete(link.id)}
                aria-label={`Delete link ${link.name}`}
                className="text-xs text-[var(--muted)] hover:text-[var(--bad)]"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {links.length > 0 && (
        <button
          type="button"
          onClick={() => {
            for (const link of links) {
              window.open(link.url, "_blank", "noopener,noreferrer");
            }
          }}
          className="mb-3 w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
        >
          Open all
        </button>
      )}

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          const nextName = name.trim();
          const nextUrl = url.trim();
          if (!nextName || !nextUrl) return;
          onAdd(nextName, nextUrl);
          setName("");
          setUrl("");
        }}
      >
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Link name"
          aria-label="Link name"
          className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]"
        />
        <input
          type="text"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="URL, like example.com"
          aria-label="Link URL"
          className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]"
        />
        {error && <p className="text-sm text-[var(--bad)]">{error}</p>}
        <button
          type="submit"
          disabled={name.trim() === "" || url.trim() === ""}
          className="w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] hover:border-[var(--muted)] disabled:opacity-50"
        >
          Add link
        </button>
      </form>
    </Modal>
  );
}
