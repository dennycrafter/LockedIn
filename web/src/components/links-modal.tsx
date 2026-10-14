"use client";

// Links modal (SPEC 8.3): existing links with open and delete, an add form
// (name + URL), and "Open all". The server normalizes the URL; this component
// only renders what is stored.

import { useState } from "react";
import type { LinkData } from "@/lib/dashboard-data";
import { Modal } from "./modal";
import { TrashIcon } from "./icons";
import { BTN_ICON, BTN_PRIMARY, BTN_QUIET, INPUT } from "./ui";

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
    <Modal title="Links" subtitle={ownerLabel} dialogLabel={`Links: ${ownerLabel}`} onClose={onClose}>
      {links.length === 0 ? (
        <p className="mb-4 text-[13px] text-[var(--muted)]">No links yet. Add the pages you open for this item.</p>
      ) : (
        <ul className="mb-2 divide-y divide-[var(--line)] overflow-hidden rounded-md border border-[var(--line)]">
          {links.map((link) => (
            <li key={link.id} className="lockedin-row flex items-center gap-2 py-1 pl-3 pr-1 text-sm">
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
                title="Delete link"
                className={`${BTN_ICON} lockedin-on-hover hover:text-[var(--bad)]`}
              >
                <TrashIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {links.length > 1 && (
        <button
          type="button"
          onClick={() => {
            for (const link of links) {
              window.open(link.url, "_blank", "noopener,noreferrer");
            }
          }}
          className={`${BTN_QUIET} -ml-2 mb-4`}
        >
          Open all {links.length} links
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
          className={INPUT}
        />
        <input
          type="text"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="URL, like example.com"
          aria-label="Link URL"
          className={INPUT}
        />
        {error && <p className="text-sm text-[var(--bad)]">{error}</p>}
        <button
          type="submit"
          disabled={name.trim() === "" || url.trim() === ""}
          className={`${BTN_PRIMARY} w-full`}
        >
          Add link
        </button>
      </form>
    </Modal>
  );
}
