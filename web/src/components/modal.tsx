"use client";

// Shared modal shell (SPEC 10): floating window on --surface-2, click outside,
// close icon or Escape closes. Focus moves into the dialog on open.
// Every pop-up uses this shell so they share one width, one top position and
// one close button (UI polish, Oct 2026). Long content scrolls inside the
// body while the title and the footer (main action) stay visible.
import { useEffect, useRef } from "react";
import { CloseIcon } from "./icons";

export const MODAL_OVERLAY = "fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 px-4 pb-6 pt-[8vh]";

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = "md",
  closeLabel = "Close dialog",
  dialogLabel,
}: {
  title: string;
  /** Small muted line under the title (step counter, date). */
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  /** Pinned bottom row for the window's main actions. */
  footer?: React.ReactNode;
  /** md for forms, lg for reading-heavy windows (EOD preview, wind down). */
  size?: "md" | "lg";
  closeLabel?: string;
  /** Accessible name when it should differ from the visible title. */
  dialogLabel?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    // Typing fields get focus straight away; otherwise the window itself takes
    // it, so the first button or dropdown does not open with a focus ring.
    const field = boxRef.current?.querySelector<HTMLElement>(
      "[data-autofocus], input[type='text'], input:not([type]), input[type='url'], textarea",
    );
    if (field) field.focus();
    else boxRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className={MODAL_OVERLAY}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel ?? title}
        tabIndex={-1}
        className={`flex max-h-[84vh] outline-none w-full flex-col rounded-lg border border-[var(--line)] bg-[var(--surface-2)] shadow-[0_6px_16px_rgba(0,0,0,0.3)] ${
          size === "lg" ? "max-w-[640px]" : "max-w-[520px]"
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--fg)]">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[13px] text-[var(--muted)]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            data-modal-close
            onClick={onClose}
            aria-label={closeLabel}
            className="-mr-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--line)] hover:text-[var(--fg)]"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--line)] px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
